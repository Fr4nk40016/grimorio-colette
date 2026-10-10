interface Window {
    db: any;
    fb: any;
}

// --- GESTIONE TEMA (CHIARO/SCURO) ---
const themeToggle = document.getElementById('theme-toggle');
const currentTheme = localStorage.getItem('colette-theme') || 'dark';

if (currentTheme === 'light') {
    document.body.classList.add('light-theme');
    if (themeToggle) themeToggle.innerText = '🌙';
}

themeToggle?.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    if (document.body.classList.contains('light-theme')) {
        localStorage.setItem('colette-theme', 'light');
        themeToggle.innerText = '🌙';
    } else {
        localStorage.setItem('colette-theme', 'dark');
        themeToggle.innerText = '🌞';
    }
});

// --- NAVIGAZIONE SCHEDE E ACCESSO MASTER ---
const navBtns = document.querySelectorAll<HTMLButtonElement>('.nav-btn');
const pageSections = document.querySelectorAll<HTMLElement>('.page-section');
const PIN_ADMIN = "1234";
let isAdmin = false;

navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        if (!targetId) return;

        if (btn.classList.contains('lock-btn') && !isAdmin) {
            const pin = prompt("Inserisci il PIN per accedere ai dati riservati:");
            if (pin === PIN_ADMIN) {
                isAdmin = true;
                document.querySelectorAll('.lock-btn').forEach(lockBtn => {
                    lockBtn.innerHTML = lockBtn.innerHTML.replace('🔒', '🔓');
                    lockBtn.classList.add('unlocked');
                });
                alert("Accesso consentito! Ora puoi vedere la scheda e gestire i post.");
            } else {
                alert("PIN errato!");
                return;
            }
        }

        navBtns.forEach(b => b.classList.remove('active'));
        pageSections.forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(targetId)?.classList.add('active');
    });
});

// --- INTERAZIONI CON FIRESTORE E STORAGE ---
window.addEventListener('load', () => {
    const db = window.db;
    const {
        collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, arrayUnion, increment, query, orderBy, getDoc, setDoc,
        storage, ref, uploadBytes, getDownloadURL
    } = window.fb || {};

    if (!db) return;

    // === GESTIONE DIARIO ===
    const publishBtn = document.getElementById('publish-post-btn') as HTMLButtonElement;
    const postTitleInput = document.getElementById('new-post-title') as HTMLInputElement;
    const postImageFileInput = document.getElementById('new-post-image-file') as HTMLInputElement;
    const postContentInput = document.getElementById('new-post-content') as HTMLTextAreaElement;
    const uploadStatus = document.getElementById('upload-status') as HTMLElement;

    publishBtn?.addEventListener('click', async () => {
        const title = postTitleInput?.value.trim();
        const content = postContentInput?.value.trim();

        if (!title || !content) {
            return alert("Compila almeno il titolo e il testo del post.");
        }

        // Disabilita il pulsante per evitare doppi click
        publishBtn.disabled = true;

        try {
            let imageUrl: string | null = null;

            // Se l'utente ha selezionato un file, caricalo su Storage
            if (postImageFileInput && postImageFileInput.files && postImageFileInput.files.length > 0) {
                const file = postImageFileInput.files[0];

                // Mostra il messaggio di caricamento
                if (uploadStatus) uploadStatus.style.display = 'block';

                // Crea un nome univoco per il file usando la data corrente
                const uniqueFileName = `post_images/${Date.now()}_${file.name}`;

                // Crea un riferimento (ref) a dove salvare il file nello Storage
                const storageRef = ref(storage, uniqueFileName);

                // Carica il file
                await uploadBytes(storageRef, file);

                // Ottieni l'URL pubblico per scaricare/visualizzare l'immagine
                imageUrl = await getDownloadURL(storageRef);

                // Nascondi il messaggio di caricamento
                if (uploadStatus) uploadStatus.style.display = 'none';
            }

            // Salva il post su Firestore, includendo l'URL dell'immagine se presente
            await addDoc(collection(db, "posts"), {
                title: title,
                content: content,
                imageUrl: imageUrl, // Salviamo l'URL dell'immagine su Firestore
                createdAt: new Date(),
                swords: 0,
                shields: 0,
                comments: []
            });

            // Pulisci i campi
            if (postTitleInput) postTitleInput.value = "";
            if (postContentInput) postContentInput.value = "";
            if (postImageFileInput) postImageFileInput.value = "";

            alert("Post pubblicato!");
        } catch (error) {
            console.error("Errore durante la pubblicazione:", error);
            alert("Errore durante la pubblicazione. Controlla la console per i dettagli. (Hai abilitato Firebase Storage in modalità test?)");
            if (uploadStatus) uploadStatus.style.display = 'none';
        } finally {
            // Riabilita il pulsante
            publishBtn.disabled = false;
        }
    });

    const journalFeed = document.getElementById('journal-feed');
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));

    onSnapshot(q, (snapshot: any) => {
        if (!journalFeed) return;
        journalFeed.innerHTML = "";

        snapshot.forEach((docSnap: any) => {
            const post = docSnap.data();
            const postId = docSnap.id;
            const article = document.createElement('article');
            article.className = 'card post-card';

            // Crea il blocco immagine se esiste un URL (caricato precedentemente)
            const imageHtml = post.imageUrl
                ? `<div class="post-image-container"><img src="${post.imageUrl}" alt="Immagine di campagna"></div>`
                : '';

            article.innerHTML = `
        <div class="post-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h3>${post.title}</h3>
          ${isAdmin ? `<button class="delete-post-btn" data-id="${postId}" style="background: transparent; border: 1px solid #e74c3c; color: #e74c3c; border-radius: 4px; padding: 4px 8px; cursor: pointer;">🗑️ Elimina</button>` : ''}
        </div>
        ${imageHtml}
        <div class="post-body"><p style="white-space: pre-wrap;">${post.content}</p></div>
        <div class="post-footer">
          <div class="reactions">
            <button class="react-btn" data-id="${postId}" data-type="swords">⚔️ ${post.swords || 0}</button>
            <button class="react-btn" data-id="${postId}" data-type="shields">🛡️ ${post.shields || 0}</button>
          </div>
          <div class="comments-container">
            <h4>Commenti dei giocatori:</h4>
            <div class="comments-list">
              ${(post.comments || []).map((c: any) => `<p><strong>${c.author}:</strong>${c.text}</p>`).join('')}
            </div>
            <div class="add-comment-form">
              <input type="text" placeholder="Nome PG..." class="comment-author" id="author-${postId}">
              <input type="text" placeholder="Scrivi commento..." class="comment-text" id="text-${postId}">
              <button class="send-comment-btn" data-id="${postId}">Invia</button>
            </div>
          </div>
        </div>
      `;
            journalFeed.appendChild(article);
        });

        // NOTA: Questa funzione di eliminazione ora cancella solo il post da Firestore,
        // non cancella l'immagine dallo Storage. Per semplicità lo lasciamo così per ora.
        document.querySelectorAll('.delete-post-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const pId = btn.getAttribute('data-id');
                if (pId && confirm("Sei sicuro di eliminare questo post?")) {
                    await deleteDoc(doc(db, "posts", pId));
                }
            });
        });

        document.querySelectorAll('.react-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const pId = btn.getAttribute('data-id');
                const type = btn.getAttribute('data-type');
                if (pId && type) await updateDoc(doc(db, "posts", pId), { [type]: increment(1) });
            });
        });

        document.querySelectorAll('.send-comment-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const pId = btn.getAttribute('data-id');
                if (!pId) return;
                const author = (document.getElementById(`author-${pId}`) as HTMLInputElement)?.value.trim();
                const text = (document.getElementById(`text-${pId}`) as HTMLInputElement)?.value.trim();
                if (author && text) {
                    await updateDoc(doc(db, "posts", pId), { comments: arrayUnion({ author, text }) });
                    (document.getElementById(`author-${pId}`) as HTMLInputElement).value = "";
                    (document.getElementById(`text-${pId}`) as HTMLInputElement).value = "";
                } else alert("Inserisci nome e messaggio.");
            });
        });
    });

    // === MOTORE SCHEDA PERSONAGGIO ===
    // ... [Il resto del codice di src/client.ts rimane identico a prima] ...
    const charDocRef = doc(db, "character", "colette-v2");

    let charData: any = {
        name: "Nicolette Aurelia Valen", classLevel: "Ladro - Livello 3", profBonus: 2, ac: 15,
        level: 3, toughFeat: false,
        hpCurrent: 24, hpTemp: 0, hitDice: { total: "3d8", used: 0 },
        deathSaves: { successes: [false,false,false], failures: [false,false,false] },
        currency: { cp: 0, sp: 0, ep: 0, gp: 15, pp: 0 },
        stats: { str: 10, dex: 16, con: 14, int: 8, wis: 10, cha: 16 },
        saves: { str: false, dex: true, con: false, int: true, wis: false, cha: false },
        skills: {
            "Acrobazia": {ability: "dex", prof: true, expertise: false},
            "Addestrare Animali": {ability: "wis", prof: false, expertise: false},
            "Arcano": {ability: "int", prof: false, expertise: false},
            "Atletica": {ability: "str", prof: false, expertise: false},
            "Furtività": {ability: "dex", prof: true, expertise: true},
            "Indagare": {ability: "int", prof: false, expertise: false},
            "Inganno": {ability: "cha", prof: true, expertise: false},
            "Intimidire": {ability: "cha", prof: false, expertise: false},
            "Intuizione": {ability: "wis", prof: false, expertise: false},
            "Intrattenere": {ability: "cha", prof: false, expertise: false},
            "Medicina": {ability: "wis", prof: false, expertise: false},
            "Natura": {ability: "int", prof: false, expertise: false},
            "Percezione": {ability: "wis", prof: false, expertise: false},
            "Persuasione": {ability: "cha", prof: true, expertise: false},
            "Rapidità di mano": {ability: "dex", prof: false, expertise: false},
            "Religione": {ability: "int", prof: false, expertise: false},
            "Sopravvivenza": {ability: "wis", prof: false, expertise: false},
            "Storia": {ability: "int", prof: false, expertise: false}
        },
        attacks: [
            { name: "Spada Corta", stat: "dex", magicMod: 0, damage: "1d6+3 taglienti" },
            { name: "Pugnale", stat: "dex", magicMod: 0, damage: "1d4+3 perforanti" }
        ],
        inventory: [
            { name: "Cuoio borchiato", qty: 1, type: "Armatura" },
            { name: "Spada corta", qty: 2, type: "Arma" },
            { name: "Pugnali", qty: 5, type: "Arma" },
            { name: "Arnesi da scasso", qty: 1, type: "Strumento" }
        ],
        feats: [
            { name: "Attacco Furtivo (2d6)", type: "Classe", desc: "Se hai vantaggio al TxC, o un alleato è entro 1,5m, infliggi danni extra." },
            { name: "Azione Scaltra", type: "Classe", desc: "Puoi Nasconderti, Disimpegnarti o Scattare come Azione Bonus." }
        ]
    };

    const getModifier = (score: number) => Math.floor(((score || 10) - 10) / 2);
    const formatMod = (mod: number) => mod >= 0 ? `+${mod}` : `${mod}`;

    const saveCharData = async () => {
        if (!isAdmin) return;
        const statusEl = document.getElementById('save-status');
        if (statusEl) {
            statusEl.innerText = "Salvataggio...";
            statusEl.style.color = "#aaaaaa";
            statusEl.style.opacity = "1";
        }
        await setDoc(charDocRef, charData);
        if (statusEl) {
            statusEl.innerText = "Salvato ✓";
            statusEl.style.color = "#50c878";
            setTimeout(() => { statusEl.style.opacity = "0"; }, 2000);
        }
    };

    const setInputValue = (id: string, val: string | number) => {
        const el = document.getElementById(id) as HTMLInputElement;
        if (el) el.value = val.toString();
    };
    const setInnerText = (id: string, text: string) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };

    const renderSheet = () => {
        setInputValue('char-name', charData.name || '');
        setInputValue('char-class', charData.classLevel || '');
        setInputValue('char-prof-bonus', charData.profBonus ?? 2);
        setInputValue('char-ac', charData.ac ?? 15);
        setInputValue('char-hp-current', charData.hpCurrent ?? 24);
        setInputValue('char-hp-temp', charData.hpTemp ?? 0);
        setInputValue('char-hd-total', charData.hitDice?.total ?? '3d8');
        setInputValue('char-hd-used', charData.hitDice?.used ?? 0);

        const lvl = charData.level ?? 3;
        const conMod = getModifier(charData.stats?.con ?? 10);

        let baseHpAtLevel1 = 8;
        let baseHpLaterLevels = (lvl > 1) ? (lvl - 1) * 5 : 0;
        let totalConBonus = conMod * lvl;
        let toughBonus = charData.toughFeat ? (lvl * 2) : 0;

        const totalMaxHp = baseHpAtLevel1 + baseHpLaterLevels + totalConBonus + toughBonus;

        setInputValue('char-level', lvl);
        const toughCheckbox = document.getElementById('char-tough') as HTMLInputElement;
        if (toughCheckbox) toughCheckbox.checked = !!charData.toughFeat;

        setInnerText('char-hp-max-display', totalMaxHp.toString());
        charData.hpMax = totalMaxHp;

        setInputValue('coin-cp', charData.currency?.cp ?? 0);
        setInputValue('coin-sp', charData.currency?.sp ?? 0);
        setInputValue('coin-ep', charData.currency?.ep ?? 0);
        setInputValue('coin-gp', charData.currency?.gp ?? 15);
        setInputValue('coin-pp', charData.currency?.pp ?? 0);

        [0,1,2].forEach(i => {
            const sCb = document.getElementById(`ds-s-${i}`) as HTMLInputElement;
            const fCb = document.getElementById(`ds-f-${i}`) as HTMLInputElement;
            if (sCb) sCb.checked = charData.deathSaves?.successes[i] || false;
            if (fCb) fCb.checked = charData.deathSaves?.failures[i] || false;
        });

        const dexMod = getModifier(charData.stats?.dex);
        const chaMod = getModifier(charData.stats?.cha);
        setInnerText('char-initiative', formatMod(dexMod + chaMod));

        ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(stat => {
            const score = charData.stats?.[stat as keyof typeof charData.stats] ?? 10;
            setInputValue(`score-${stat}`, score);
            setInnerText(`mod-${stat}`, formatMod(getModifier(score)));
        });

        // --- RENDER TIRI SALVEZZA ---
        const savesList = document.getElementById('saves-list');
        if (savesList && charData.saves) {
            savesList.innerHTML = '';
            const statNames: Record<string, string> = { str: 'Forza', dex: 'Destrezza', con: 'Costituzione', int: 'Intelligenza', wis: 'Saggezza', cha: 'Carisma' };
            ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(stat => {
                const isProf = charData.saves[stat];
                const totalBonus = getModifier(charData.stats?.[stat]) + (isProf ? (charData.profBonus ?? 2) : 0);
                const li = document.createElement('li');
                li.innerHTML = `
                    <label style="cursor:pointer; display:flex; gap:10px; align-items:center; ${isProf ? 'color: var(--text-gold); font-weight: bold;' : ''}">
                        <input type="checkbox" class="save-cb" data-stat="${stat}" ${isProf ? 'checked' : ''}>
                        ${statNames[stat]}
                    </label>
                    <span>${formatMod(totalBonus)}</span>
                `;
                savesList.appendChild(li);
            });
            document.querySelectorAll('.save-cb').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    const stat = (e.target as HTMLInputElement).getAttribute('data-stat')!;
                    charData.saves[stat] = (e.target as HTMLInputElement).checked;
                    renderSheet();
                    saveCharData();
                });
            });
        }

        // --- RENDER ABILITÀ CORRETTO ---
        const skillsList = document.getElementById('skills-list');
        if (skillsList && charData.skills) {
            skillsList.innerHTML = '';
            Object.entries(charData.skills).forEach(([skillName, data]: [string, any]) => {
                const statMod = getModifier(charData.stats?.[data.ability]);
                const profBonus = charData.profBonus ?? 2;

                let multiplier = 0;
                if (data.expertise) {
                    multiplier = 2;
                } else if (data.prof) {
                    multiplier = 1;
                }

                const totalBonus = statMod + (profBonus * multiplier);
                const isProf = !!data.prof;
                const isExp = !!data.expertise;

                const li = document.createElement('li');
                li.style.display = 'flex';
                li.style.justifyContent = 'space-between';
                li.style.alignItems = 'center';
                li.style.padding = '4px 0';

                li.innerHTML = `
            <div style="display:flex; gap:8px; align-items:center;">
                <input type="checkbox" class="skill-cb" data-skill="${skillName}" ${isProf ? 'checked' : ''} title="Competenza">
                <input type="checkbox" class="expertise-cb" data-skill="${skillName}" ${isExp ? 'checked' : ''} ${!isProf ? 'disabled' : ''} title="Maestria">
                <span style="${isExp ? 'color: var(--text-gold); font-weight: bold; text-decoration: underline;' : isProf ? 'color: var(--text-gold); font-weight: bold;' : ''}">
                    ${skillName} <span style="font-size:0.7rem; color:#888;">(${data.ability.toUpperCase()})</span>
                    ${isExp ? '<span style="font-size:0.65rem; background:var(--text-gold); color:#000; border-radius:3px; padding:1px 3px; margin-left:4px; font-weight:bold;">M</span>' : ''}
                </span>
            </div>
            <span style="font-weight:bold; ${isExp || isProf ? 'color:var(--text-gold);' : ''}">${formatMod(totalBonus)}</span>
        `;
                skillsList.appendChild(li);
            });

            // Gestione del cambio per la Competenza
            document.querySelectorAll('.skill-cb').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    const target = e.target as HTMLInputElement;
                    const skillName = target.getAttribute('data-skill')!;
                    if (charData.skills[skillName]) {
                        charData.skills[skillName].prof = target.checked;
                        if (!target.checked) charData.skills[skillName].expertise = false;
                        renderSheet();
                        saveCharData();
                    }
                });
            });

            // Gestione del cambio per la Maestria (Expertise)
            document.querySelectorAll('.expertise-cb').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    const target = e.target as HTMLInputElement;
                    const skillName = target.getAttribute('data-skill')!;
                    if (charData.skills[skillName]) {
                        charData.skills[skillName].expertise = target.checked;
                        if (target.checked) charData.skills[skillName].prof = true;
                        renderSheet();
                        saveCharData();
                    }
                });
            });
        }

        // Render Attacchi
        const attacksList = document.getElementById('attacks-list');
        if (attacksList && charData.attacks) {
            attacksList.innerHTML = '';
            charData.attacks.forEach((atk: any, index: number) => {
                let calculatedBonus = atk.bonus || "+0";
                if (atk.stat && atk.stat !== 'none') {
                    const statMod = getModifier(charData.stats?.[atk.stat] ?? 10);
                    const prof = charData.profBonus ?? 2;
                    const magic = atk.magicMod ? parseInt(atk.magicMod) : 0;
                    calculatedBonus = formatMod(statMod + prof + magic);
                }

                const magicBadge = (atk.magicMod && atk.magicMod > 0) ? `<span style="font-size:0.7rem; color:#50c878; border:1px solid #50c878; border-radius:10px; padding:2px 5px; margin-left:5px;">+${atk.magicMod}</span>` : '';

                const div = document.createElement('div');
                div.className = 'attack-item';
                div.innerHTML = `
                    <div class="attack-header">
                        <span>${atk.name} ${magicBadge}</span>
                        <button class="icon-btn delete-atk-btn" data-index="${index}">❌</button>
                    </div>
                    <div class="attack-stats">
                        <span><strong>TxC:</strong> <span style="color:var(--text-gold); font-weight:bold;">${calculatedBonus}</span></span>
                        <span><strong>Danni:</strong> ${atk.damage}</span>
                    </div>
                `;
                attacksList.appendChild(div);
            });
            document.querySelectorAll('.delete-atk-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    charData.attacks.splice(parseInt((e.currentTarget as HTMLButtonElement).getAttribute('data-index')!), 1);
                    renderSheet(); saveCharData();
                });
            });
        }

        // Render Inventario
        const invUl = document.getElementById('inventory-list');
        if (invUl && charData.inventory) {
            invUl.innerHTML = '';
            charData.inventory.forEach((item: any, index: number) => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span class="item-badge">${item.type}</span>
                        <span>${item.name} <strong style="color:var(--text-gold);">x${item.qty}</strong></span>
                    </div>
                    <button class="icon-btn delete-inv-btn" data-index="${index}">❌</button>
                `;
                invUl.appendChild(li);
            });
            document.querySelectorAll('.delete-inv-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    charData.inventory.splice(parseInt((e.currentTarget as HTMLButtonElement).getAttribute('data-index')!), 1);
                    renderSheet(); saveCharData();
                });
            });
        }

        // Render Talenti & Privilegi Raggruppati
        const featsContainer = document.getElementById('feats-container');
        if (featsContainer && charData.feats) {
            featsContainer.innerHTML = '';

            const grouped: Record<string, Array<{ feat: any; originalIndex: number }>> = {};
            charData.feats.forEach((feat: any, index: number) => {
                const category = feat.type || 'Altro';
                if (!grouped[category]) grouped[category] = [];
                grouped[category].push({ feat, originalIndex: index });
            });

            Object.entries(grouped).forEach(([category, items]) => {
                const catGroup = document.createElement('div');
                catGroup.style.marginBottom = '15px';

                const catHeader = document.createElement('div');
                catHeader.className = 'category-title';
                catHeader.innerText = category;
                catGroup.appendChild(catHeader);

                items.forEach(({ feat, originalIndex }) => {
                    const featBox = document.createElement('div');
                    featBox.className = 'feat-item-collapsible';
                    featBox.innerHTML = `
                        <div class="feat-header">
                            <span style="color: #fff;">${feat.name}</span>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <button class="icon-btn delete-feat-btn" data-index="${originalIndex}">❌</button>
                                <span class="feat-arrow">▼</span>
                            </div>
                        </div>
                        ${feat.desc ? `<div class="feat-details">${feat.desc}</div>` : ''}
                    `;

                    featBox.addEventListener('click', (e) => {
                        if ((e.target as HTMLElement).classList.contains('delete-feat-btn')) return;
                        featBox.classList.toggle('open');
                    });

                    catGroup.appendChild(featBox);
                });

                featsContainer.appendChild(catGroup);
            });

            document.querySelectorAll('.delete-feat-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    charData.feats.splice(parseInt((e.currentTarget as HTMLButtonElement).getAttribute('data-index')!), 1);
                    renderSheet(); saveCharData();
                });
            });
        }
    };

    // --- CARICAMENTO DA FIRESTORE ---
    getDoc(charDocRef).then((docSnap: any) => {
        if (docSnap.exists()) {
            const loaded = docSnap.data();

            if (loaded.inventory && typeof loaded.inventory[0] === 'string') {
                loaded.inventory = loaded.inventory.map((i: string) => ({ name: i, qty: 1, type: "Oggetto" }));
            }
            if (loaded.feats && typeof loaded.feats[0] === 'string') {
                loaded.feats = loaded.feats.map((f: string) => ({ name: f, type: "Altro", desc: "" }));
            }

            charData = { ...charData, ...loaded };
        } else { saveCharData(); }
    }).catch((err: any) => console.warn(err)).finally(() => {
        renderSheet();
        const loader = document.getElementById('sheet-loading');
        if (loader) {
            loader.style.opacity = "0";
            setTimeout(() => { loader.style.display = "none"; }, 500);
        }
    });

    // --- BIND DEGLI INPUT BASE ---
    const bindInput = (id: string, updateFn: (val: string) => void) => {
        document.getElementById(id)?.addEventListener('change', (e) => {
            updateFn((e.target as HTMLInputElement).value);
            renderSheet(); saveCharData();
        });
    };

    bindInput('char-name', v => charData.name = v);
    bindInput('char-class', v => charData.classLevel = v);
    bindInput('char-prof-bonus', v => charData.profBonus = parseInt(v) || 0);
    bindInput('char-ac', v => charData.ac = parseInt(v) || 0);
    bindInput('char-hp-current', v => charData.hpCurrent = parseInt(v) || 0);
    bindInput('char-hp-temp', v => charData.hpTemp = parseInt(v) || 0);
    bindInput('char-hd-total', v => charData.hitDice.total = v);
    bindInput('char-hd-used', v => charData.hitDice.used = parseInt(v) || 0);

    bindInput('char-level', v => charData.level = parseInt(v) || 1);
    document.getElementById('char-tough')?.addEventListener('change', (e) => {
        charData.toughFeat = (e.target as HTMLInputElement).checked;
        renderSheet(); saveCharData();
    });

    ['cp', 'sp', 'ep', 'gp', 'pp'].forEach(coin => bindInput(`coin-${coin}`, v => charData.currency[coin] = parseInt(v) || 0));
    ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(stat => bindInput(`score-${stat}`, v => charData.stats[stat] = parseInt(v) || 10));

    [0,1,2].forEach(i => {
        document.getElementById(`ds-s-${i}`)?.addEventListener('change', (e) => {
            charData.deathSaves.successes[i] = (e.target as HTMLInputElement).checked; saveCharData();
        });
        document.getElementById(`ds-f-${i}`)?.addEventListener('change', (e) => {
            charData.deathSaves.failures[i] = (e.target as HTMLInputElement).checked; saveCharData();
        });
    });

    // === GESTIONE MODALI (UI) ===
    const overlay = document.getElementById('modal-overlay');
    const modalItem = document.getElementById('modal-item');
    const modalAtk = document.getElementById('modal-attack');
    const modalFeat = document.getElementById('modal-feat');

    const openModal = (modal: HTMLElement | null) => {
        if (!overlay || !modal) return;
        overlay.style.display = 'flex';
        modalItem!.style.display = 'none';
        modalAtk!.style.display = 'none';
        modalFeat!.style.display = 'none';
        modal.style.display = 'flex';
    };

    const closeModal = () => { if (overlay) overlay.style.display = 'none'; };

    document.getElementById('btn-cancel-item')?.addEventListener('click', closeModal);
    document.getElementById('btn-cancel-atk')?.addEventListener('click', closeModal);
    document.getElementById('btn-cancel-feat')?.addEventListener('click', closeModal);
    overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    // Modale Inventario
    document.getElementById('add-item-btn')?.addEventListener('click', () => openModal(modalItem));
    document.getElementById('btn-save-item')?.addEventListener('click', () => {
        const name = (document.getElementById('modal-item-name') as HTMLInputElement).value.trim();
        const qty = parseInt((document.getElementById('modal-item-qty') as HTMLInputElement).value) || 1;
        const type = (document.getElementById('modal-item-type') as HTMLSelectElement).value;

        if (name) {
            if (!charData.inventory) charData.inventory = [];
            charData.inventory.push({ name, qty, type });
            renderSheet(); saveCharData();
        }
        (document.getElementById('modal-item-name') as HTMLInputElement).value = "";
        closeModal();
    });

    // Modale Attacchi
    document.getElementById('add-attack-btn')?.addEventListener('click', () => openModal(modalAtk));
    document.getElementById('btn-save-atk')?.addEventListener('click', () => {
        const name = (document.getElementById('modal-atk-name') as HTMLInputElement).value.trim();
        const stat = (document.getElementById('modal-atk-stat') as HTMLSelectElement).value;
        const magicMod = parseInt((document.getElementById('modal-atk-magic') as HTMLInputElement).value) || 0;
        const damage = (document.getElementById('modal-atk-damage') as HTMLInputElement).value.trim();

        if (name) {
            if (!charData.attacks) charData.attacks = [];
            charData.attacks.push({ name, stat, magicMod, damage });
            renderSheet(); saveCharData();
        }
        (document.getElementById('modal-atk-name') as HTMLInputElement).value = "";
        (document.getElementById('modal-atk-damage') as HTMLInputElement).value = "";
        closeModal();
    });

    // Modale Talenti
    document.getElementById('add-feat-btn')?.addEventListener('click', () => openModal(modalFeat));
    document.getElementById('btn-save-feat')?.addEventListener('click', () => {
        const name = (document.getElementById('modal-feat-name') as HTMLInputElement).value.trim();
        const type = (document.getElementById('modal-feat-type') as HTMLSelectElement).value;
        const desc = (document.getElementById('modal-feat-desc') as HTMLTextAreaElement).value.trim();

        if (name) {
            if (!charData.feats) charData.feats = [];
            charData.feats.push({ name, type, desc });
            renderSheet(); saveCharData();
        }
        (document.getElementById('modal-feat-name') as HTMLInputElement).value = "";
        (document.getElementById('modal-feat-desc') as HTMLTextAreaElement).value = "";
        closeModal();
    });
});