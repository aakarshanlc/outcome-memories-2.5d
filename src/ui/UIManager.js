export class UIManager {
    constructor(gameManager) {
        this.gameManager = gameManager;
        this.root = document.getElementById('ui-layer');
        this.activeScreen = null;
        this.waitingForKey = null;
        this.hudElement = null;
        this.lastHudKey = null;
        this.hudEntity = null;
        this.pauseVisible = false;
        this.pauseKind = null;
        this._pipCache = { a1: null, a2: null, hp: null, char: null };
        this._toastEl = null;
        this._toastTimer = null;

        window.addEventListener('gamepadconnected', () => this.refreshDeviceDropdowns());
        window.addEventListener('gamepaddisconnected', () => this.refreshDeviceDropdowns());
    }

    btn(text, id, small = false) {
        return `<button class="button-49 ${small ? 'btn-sm' : ''}" id="${id}" role="button" data-text="${text}">${text}</button>`;
    }

    // ================= HUD =================

    initHUD() {
        this.hideAll();
        const gm = this.gameManager;
        this.hudEntity = (gm.mode === 'online' && gm.myEntity) || gm.players[0] || null;
        this._pipCache = { a1: null, a2: null, hp: null, char: null };

        const charName = this.hudEntity ? (this.hudEntity.characterName || this.hudEntity.type || '') : '';
        this.root.innerHTML = `
            <div id="hud">
                <div id="hud-top">
                    <div id="phase-text"></div>
                    <div id="timer-text"></div>
                </div>
                ${this.hudEntity ? `
                <div id="hud-bottom">
                    <div id="hud-char">${charName.toUpperCase()}</div>
                    <div class="hud-pip" id="pip-a1"><div class="pip-fill"></div><span class="pip-label">AB1</span></div>
                    <div class="hud-pip" id="pip-a2"><div class="pip-fill"></div><span class="pip-label">AB2</span></div>
                    ${typeof this.hudEntity.health === 'number' ? `
                    <div id="hud-hp">
                        <div id="hud-hp-fill"></div>
                        <span id="hud-hp-text"></span>
                    </div>` : ''}
                </div>` : ''}
            </div>
        `;
        this.hudElement = this.root.querySelector('#hud');
    }

    updateHUD(phase, timeLeft, isRush = false) {
        if (!this.hudElement) return;
        const timerText = Math.max(0, Math.ceil(timeLeft));
        const key = `${phase}|${timerText}|${isRush}`;
        if (key !== this.lastHudKey) {
            this.lastHudKey = key;
            const phaseText = isRush ? 'RUSH' : phase;
            const phaseColor = isRush ? '#ff2b2b' : '#e8e8e8';

            const phaseEl = this.root.querySelector('#phase-text');
            const timerEl = this.root.querySelector('#timer-text');
            if (phaseEl) { phaseEl.style.color = phaseColor; phaseEl.innerText = phaseText; }
            if (timerEl) { timerEl.style.color = isRush ? '#ff2b2b' : '#ffffff'; timerEl.innerText = `${timerText}s`; }
            const hudTop = this.root.querySelector('#hud-top');
            if (hudTop) hudTop.classList.toggle('is-rush', !!isRush);
        }
        this.updateAbilityPips();
    }

    updateAbilityPips() {
        const e = this.hudEntity;
        if (!e) return;
        const cache = this._pipCache;

        const setPip = (id, cd) => {
            const pip = this.root.querySelector(id);
            if (!pip) return;
            const secs = Math.ceil(cd / 60);
            if (cache[id] === secs) return;
            cache[id] = secs;
            const ready = cd <= 0;
            pip.classList.toggle('ready', ready);
            const fill = pip.querySelector('.pip-fill');
            if (fill) {
                const max = 600;
                fill.style.height = ready ? '0%' : `${Math.min(100, (cd / max) * 100)}%`;
            }
            const label = pip.querySelector('.pip-label');
            if (label) {
                const base = id === '#pip-a1' ? 'AB1' : 'AB2';
                label.textContent = ready ? base : secs > 99 ? `${secs}s` : `${secs}`;
            }
        };
        setPip('#pip-a1', e.ability1Cooldown || 0);
        setPip('#pip-a2', e.ability2Cooldown || 0);

        if (typeof e.health === 'number') {
            const pct = Math.max(0, Math.min(1, e.health / (e.maxHealth || 100)));
            const rounded = Math.round(pct * 100);
            if (cache.hp !== rounded) {
                cache.hp = rounded;
                const fill = this.root.querySelector('#hud-hp-fill');
                const text = this.root.querySelector('#hud-hp-text');
                if (fill) {
                    fill.style.width = rounded + '%';
                    fill.style.background = pct > 0.6 ? '#3ddc6b' : pct > 0.3 ? '#ffd24a' : '#ff4444';
                }
                if (text) text.textContent = `${Math.ceil(e.health)}/${e.maxHealth}`;
            }
        }
    }

    // ================= OVERLAYS =================

    showLoadingScreen() {
        this.hideAll();
        this.root.innerHTML = `
            <div class="menu-screen loading-screen">
                <div class="loading-mark"></div>
                <h1 class="loading-title">LOADING</h1>
                <div class="loading-dots"><span>.</span><span>.</span><span>.</span></div>
            </div>
        `;
    }

    showGameOver(title, subtitle, summary = []) {
        this.hideAll();
        const gm = this.gameManager;
        const online = gm.mode === 'online' && gm.net && gm.net.roomCode;
        const color = /ESCAPE[SD]/.test(title) ? '#3ddc6b' : '#ff4444';
        const statusText = { escaped: 'ESCAPED', died: 'DIED', 'too slow': 'TOO SLOW' };
        const statusColor = { escaped: '#3ddc6b', died: '#ff4444', 'too slow': '#ffd24a' };
        const rows = summary.map(s =>
            `<div style="color:${statusColor[s.status] || '#fff'};">${s.label} — ${statusText[s.status] || s.status}</div>`
        ).join('');
        this.root.innerHTML = `
            <div class="menu-screen gameover-screen">
                <h1 class="gameover-title" style="color: ${color};">${title}</h1>
                <h2>${subtitle}</h2>
                ${rows ? `<div class="gameover-summary">${rows}</div>` : ''}
                <div class="btn-row">
                    ${online
                        ? this.btn('BACK TO LOBBY', 'btn-game-over')
                        : this.btn('BACK TO MENU', 'btn-game-over')}
                </div>
            </div>
        `;
        document.getElementById('btn-game-over').onclick = () => {
            if (online) gm.backToLobby();
            else gm.stopGame();
        };
    }

    showPauseOverlay(kind) {
        this.pauseVisible = true;
        this.pauseKind = kind;
        let el = document.getElementById('pause-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'pause-overlay';
            document.body.appendChild(el);
        }
        const gm = this.gameManager;
        el.innerHTML = `
            <div class="pause-card">
                <h1>${kind === 'host' ? 'PAUSED' : 'WAITING FOR HOST'}</h1>
                <p>${kind === 'host' ? 'The match is frozen for everyone.' : 'The host paused the match.'}</p>
                <div class="btn-row">
                    ${kind === 'host' ? this.btn('RESUME', 'btn-pause-resume') : ''}
                    ${this.btn('LEAVE ROOM', 'btn-pause-leave', true)}
                </div>
            </div>
        `;
        el.style.display = 'flex';
        const resume = document.getElementById('btn-pause-resume');
        if (resume) resume.onclick = () => this.resumeHost();
        document.getElementById('btn-pause-leave').onclick = () => {
            this.hidePauseOverlay();
            gm.leaveOnline();
        };
    }

    resumeHost() {
        const gm = this.gameManager;
        if (!gm.isHost) return;
        this.hidePauseOverlay();
        if (gm.state === 'PAUSED') {
            gm.state = 'PLAYING';
            this.initHUD();
            gm.audio.playMusic(gm.gameSetup.selectedKillerType);
            if (gm.net) gm.net.sendResume();
        }
    }

    hidePauseOverlay() {
        this.pauseVisible = false;
        this.pauseKind = null;
        const el = document.getElementById('pause-overlay');
        if (el) el.remove();
    }

    showToast(message) {
        if (!this._toastEl) {
            this._toastEl = document.createElement('div');
            this._toastEl.id = 'toast';
            document.body.appendChild(this._toastEl);
        }
        this._toastEl.textContent = message;
        this._toastEl.classList.add('visible');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            if (this._toastEl) this._toastEl.classList.remove('visible');
        }, 3500);
    }

    // ================= SCREENS =================

    showScreen(screenName) {
        this.hideAll();
        this.hidePauseOverlay();
        let html = '';

        if (screenName === 'main') {
            html = `
                <video id="menu-video" autoplay loop muted playsinline class="menu-bg-video">
                    <source src="./backgrounds/menu-animation.mp4" type="video/mp4">
                </video>

                <div class="main-menu-overlay">
                    <div class="menu-title-top">
                        <div class="title-kicker">ASYMMETRIC HORROR · 1 VS ALL</div>
                        <h1>Outcome Memories <span class="title-accent">2.5D</span></h1>
                    </div>

                    <div class="menu-buttons-left">
                        ${this.btn('PLAY LOCAL', 'btn-play')}
                        ${this.btn('ONLINE PLAY', 'btn-online')}
                        ${this.btn('SETTINGS', 'btn-settings')}
                        ${this.btn('CREDITS', 'btn-credits')}
                    </div>
                    <div class="menu-footer">HOST THE MATCH WITH <code>npm start</code> FOR ONLINE ROOMS</div>
                </div>
            `;
        }
        else if (screenName === 'online') {
            html = `
                <div class="menu-screen" id="online-menu">
                    <h1>ONLINE PLAY</h1>
                    <h2>Create a room and share the code, or join a friend's room.</h2>

                    <div class="panel online-panel">
                        <label class="field-label" for="player-name">YOUR NAME</label>
                        <input type="text" id="player-name" maxlength="16" class="text-input" value="${this.gameManager.playerName}">

                        <div class="online-actions">
                            <div class="online-col">
                                <h3>HOST</h3>
                                ${this.btn('CREATE ROOM', 'btn-create-room')}
                            </div>
                            <div class="online-divider">OR</div>
                            <div class="online-col">
                                <h3>JOIN</h3>
                                <input type="text" id="join-code" maxlength="4" class="text-input code-input" placeholder="CODE" autocomplete="off">
                                ${this.btn('JOIN ROOM', 'btn-join-room')}
                            </div>
                        </div>
                        <div id="net-status" class="net-status"></div>
                    </div>

                    <div class="btn-row">
                        ${this.btn('BACK', 'btn-online-back')}
                    </div>
                </div>
            `;
        }
        else if (screenName === 'lobby') {
            html = this.buildLobbyHtml();
        }
        else if (screenName === 'settings') {
            const schemes = this.gameManager.controls.schemes;
            const audio = this.gameManager.audio;
            const showHit = this.gameManager.settings.showHitboxes ? "checked" : "";
            html = `
                <div class="menu-screen" id="settings-menu" style="justify-content: flex-start; padding-top: 30px; overflow-y: auto;">
                    <h1>SETTINGS</h1>

                    <div class="settings-grid">
                        <div class="settings-col panel">
                            <h3>AUDIO</h3>
                            <div style="width: 100%;">
                                <label>Music Volume: <span id="music-val">${Math.round(audio.musicVolume*100)}</span>%</label>
                                <input type="range" id="music-slider" min="0" max="100" value="${audio.musicVolume*100}">
                            </div>
                            <div style="width: 100%; margin-top: 15px;">
                                <label>SFX Volume: <span id="sfx-val">${Math.round(audio.sfxVolume*100)}</span>%</label>
                                <input type="range" id="sfx-slider" min="0" max="100" value="${audio.sfxVolume*100}">
                            </div>
                        </div>

                        <div class="settings-col panel">
                            <h3>VISUALS</h3>
                            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 18px;">
                                <input type="checkbox" id="hitbox-toggle" ${showHit} style="width: 20px; height: 20px;">
                                Show Hitboxes
                            </label>
                        </div>
                    </div>

                    <div class="controls-grid">
                        <div class="control-box"><h3>P1</h3>${this.generateDeviceDropdown('p1')}${this.generateControlButtons('p1', schemes.p1)}</div>
                        <div class="control-box"><h3>P2</h3>${this.generateDeviceDropdown('p2')}${this.generateControlButtons('p2', schemes.p2)}</div>
                        <div class="control-box"><h3>P3</h3>${this.generateDeviceDropdown('p3')}${this.generateControlButtons('p3', schemes.p3)}</div>
                        <div class="control-box"><h3>P4</h3>${this.generateDeviceDropdown('p4')}${this.generateControlButtons('p4', schemes.p4)}</div>
                    </div>

                    <div class="btn-row" style="margin-top: 30px;">
                        ${this.btn('BACK', 'btn-settings-back')}
                    </div>
                </div>
            `;
        }
        else if (screenName === 'credits') {
            html = `
                <div class="menu-screen" id="credits-menu">
                    <h1>CREDITS</h1>
                    <div class="credit-text">Game Design & Development:</div>
                    <div class="credit-name">Aakercum, Jelani(goons to x), Jeff and DJ</div>
                    <div class="credit-text">Based on "Outcome Memories"</div>
                    <br><br>
                    <div class="btn-row">${this.btn('BACK', 'btn-credits-back')}</div>
                </div>
            `;
        }
        else if (screenName === 'setup') {
            const aiChecked = this.gameManager.gameSetup.killerIsAI;
            const survCount = this.gameManager.gameSetup.survivorCount;

            let survHtml = '';
            for(let i=0; i<survCount; i++) {
                survHtml += `
                    <div class="setup-item panel">
                        <h3>SURVIVOR ${i+1}</h3>
                        ${this.btn(`Change (${this.gameManager.gameSetup.selectedSurvivors[i]})`, `btn-cycle-surv-${i}`, true)}
                    </div>
                `;
            }

            html = `
                <div class="menu-screen" id="setup-menu" style="justify-content: center; padding-top: 30px; overflow-y: auto;">
                    <h1>GAME SETUP</h1>
                    <div class="setup-grid">
                        <div class="setup-item panel">
                            <h3>SURVIVOR COUNT</h3>
                            ${this.btn(`Change (${survCount})`, 'btn-cycle-surv-count', true)}
                        </div>
                        ${survHtml}
                        <div class="setup-item panel">
                            <h3>KILLER TYPE</h3>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                ${this.btn('Change Type', 'btn-cycle-killer', true)}
                                <button id="btn-toggle-ai" class="toggle-btn ${aiChecked ? 'on' : ''}" data-text="AI">AI<br><span id="ai-status">${aiChecked ? 'ON' : 'OFF'}</span></button>
                            </div>
                            <p>Type: <span id="killer-name">${this.gameManager.gameSetup.selectedKillerType}</span></p>
                        </div>
                        <div class="setup-item panel" id="killer-player-box" style="${aiChecked ? 'display: none;' : ''}">
                            <h3>KILLER PLAYER</h3>
                            ${this.btn('Change Player', 'btn-cycle-killer-player', true)}
                            <p><span id="killer-player">P${this.gameManager.gameSetup.killerPlayer}</span></p>
                        </div>
                        <div class="setup-item panel">
                            <h3>MAP</h3>
                            ${this.btn('Change Map', 'btn-cycle-map', true)}
                            <p><span id="map-name">${this.gameManager.gameSetup.selectedMap}</span></p>
                        </div>
                    </div>
                    <div class="btn-row" style="margin-top: 20px;">
                        ${this.btn('START GAME', 'btn-start-game')}
                        ${this.btn('BACK', 'btn-setup-back')}
                    </div>
                </div>
            `;
        }

        this.root.innerHTML = html;
        this.activeScreen = screenName;
        this.setupEventListeners();

        const videoEl = document.getElementById('menu-video');

        if (this.activeScreen === 'main') {
            if (videoEl) {
                videoEl.volume = this.gameManager.audio.musicVolume;
                if (this.gameManager.audio.hasInteracted) {
                    videoEl.muted = false;
                    videoEl.play().catch(() => {});
                }
            }
            this.gameManager.audio.stopMusic();
        } else {
            if (videoEl) videoEl.muted = true;

            if (this.gameManager.audio.hasInteracted) {
                this.gameManager.audio.playMusic('menu');
            }
        }
    }

    buildLobbyHtml() {
        const gm = this.gameManager;
        const s = gm.gameSetup;
        const code = gm.net ? gm.net.roomCode : '';
        const myId = gm.net ? gm.net.id : null;
        const isHost = gm.isHost;
        const roster = gm.roster;
        const nameOf = (id) => {
            if (id === myId) return gm.playerName + ' (you)';
            const r = roster.find(p => p.id === id);
            return r ? r.name : 'Player';
        };
        const mySurvivorSlot = s.assignments.slice(0, s.survivorCount).indexOf(myId);
        const iAmKiller = s.killerPlayerId === myId;

        const slotCards = [];
        for (let i = 0; i < s.survivorCount; i++) {
            const owner = s.assignments[i];
            const mine = owner === myId;
            const ownerLabel = owner ? nameOf(owner) : 'HOST (local)';
            slotCards.push(`
                <div class="panel slot-card ${mine ? 'slot-mine' : ''}">
                    <div class="slot-head">SLOT ${i + 1}</div>
                    <div class="slot-char">${s.selectedSurvivors[i]}</div>
                    <div class="slot-owner">${ownerLabel}</div>
                    ${isHost
                        ? `<button class="button-49 btn-sm" id="host-cycle-char-${i}" data-text="CHANGE">CHANGE</button>`
                        : (mine ? `<button class="button-49 btn-sm" id="guest-cycle-char" data-text="CHANGE">CHANGE</button>` : '')}
                </div>
            `);
        }

        const killerCard = `
            <div class="panel slot-card slot-killer ${iAmKiller ? 'slot-mine' : ''}">
                <div class="slot-head">KILLER</div>
                <div class="slot-char">${s.selectedKillerType}</div>
                <div class="slot-owner">${s.killerPlayerId ? nameOf(s.killerPlayerId) : 'AI'}</div>
                ${isHost ? `<button class="button-49 btn-sm" id="host-cycle-killer" data-text="CHANGE">CHANGE</button>` : ''}
            </div>
        `;

        const roleButtons = !isHost ? `
            <div class="btn-row">
                <button class="button-49 btn-sm ${!iAmKiller ? 'active-chip' : ''}" id="role-survivor" data-text="PLAY SURVIVOR">PLAY SURVIVOR</button>
                <button class="button-49 btn-sm ${iAmKiller ? 'active-chip' : ''}" id="role-killer" data-text="PLAY KILLER">PLAY KILLER</button>
            </div>
            <p class="lobby-status">${mySurvivorSlot >= 0 || iAmKiller
                ? `You are ${iAmKiller ? 'the KILLER' : 'survivor slot ' + (mySurvivorSlot + 1)}`
                : 'Pick a role...'}</p>
        ` : '';

        const hostControls = isHost ? `
            <div class="setup-grid lobby-host-grid">
                <div class="setup-item panel">
                    <h3>SURVIVORS</h3>
                    <button class="button-49 btn-sm" id="lobby-count" data-text="CHANGE (${s.survivorCount})">CHANGE (${s.survivorCount})</button>
                </div>
                <div class="setup-item panel">
                    <h3>MAP</h3>
                    <button class="button-49 btn-sm" id="lobby-map" data-text="CHANGE">CHANGE</button>
                    <p id="lobby-map-name">${s.selectedMap}</p>
                </div>
            </div>
        ` : `
            <div class="panel lobby-summary">
                <div>Map: <strong>${s.selectedMap}</strong></div>
                <div>Survivors: <strong>${s.survivorCount}</strong></div>
                <div>Killer: <strong>${s.selectedKillerType}${s.killerPlayerId ? '' : ' (AI)'}</strong></div>
            </div>
        `;

        return `
            <div class="menu-screen" id="lobby-menu">
                <div class="lobby-head">
                    <h1>ROOM LOBBY</h1>
                    <div class="room-code-box">
                        <span class="room-code-label">ROOM CODE</span>
                        <span class="room-code" id="room-code">${code}</span>
                        <button class="btn-copy" id="btn-copy-code">COPY</button>
                    </div>
                </div>

                <div class="roster panel">
                    <h3>PLAYERS (${roster.length}/4)</h3>
                    <div class="roster-list">
                        ${roster.map(p => `<div class="roster-item ${p.id === myId ? 'roster-me' : ''}">${p.name}${p.id === myId ? ' · you' : ''}${p.id === (gm.net && gm.net.hostId) ? '' : ''}</div>`).join('')}
                    </div>
                </div>

                <div class="slot-grid">
                    ${slotCards.join('')}
                    ${killerCard}
                </div>

                ${roleButtons}
                ${hostControls}

                <div class="btn-row">
                    ${isHost ? this.btn('START MATCH', 'btn-lobby-start') : '<p class="lobby-status">Waiting for the host to start...</p>'}
                    ${this.btn('LEAVE', 'btn-lobby-leave', true)}
                </div>
            </div>
        `;
    }

    deviceOptionHtml(current) {
        const options = this.gameManager.getDeviceOptions();
        let opts = options.map(o =>
            `<option value="${o.id}" ${o.id === current ? 'selected' : ''}>${o.label}</option>`).join('');
        if (!options.some(o => o.id === current)) {
            const label = current.startsWith('gp:')
                ? `Gamepad ${Number(current.slice(3)) + 1} (disconnected)`
                : current;
            opts += `<option value="${current}" selected>${label}</option>`;
        }
        return opts;
    }

    refreshDeviceDropdowns() {
        if (this.activeScreen !== 'settings') return;
        document.querySelectorAll('select.device-select').forEach(sel => {
            sel.innerHTML = this.deviceOptionHtml(this.gameManager.inputBindings[sel.dataset.slot]);
        });
    }

    generateDeviceDropdown(playerId) {
        const gm = this.gameManager;
        return `
            <label class="device-row">
                <span>Input</span>
                <select class="device-select" data-slot="${playerId}">${this.deviceOptionHtml(gm.inputBindings[playerId])}</select>
            </label>`;
    }

    generateControlButtons(playerId, scheme) {
        const labels = ['Up', 'Down', 'Left', 'Right', 'Ab1', 'Ab2', 'M1'];
        const keys = ['up', 'down', 'left', 'right', 'ability1', 'ability2', 'm1'];
        return labels.map((label, i) => {
            const key = keys[i];
            const val = scheme[key].toUpperCase();
            return `<div class="control-row">
                        <span>${label}:</span>
                        <button class="button-49 btn-sm" data-player="${playerId}" data-key="${key}" data-text="${val}">${val}</button>
                    </div>`;
        }).join('');
    }

    hideAll() {
        this.root.innerHTML = '';
        this.hudElement = null;
        this.hudEntity = null;
        this.lastHudKey = null;
        if (this.qteEl) this.qteEl.style.display = 'none';
    }

    ensureQte() {
        if (!this.qteEl) {
            const el = document.createElement('div');
            el.id = 'qte-overlay';
            el.innerHTML = `
                <div id="qte-label">HEAL</div>
                <div id="qte-bar"><div id="qte-zone"></div><div id="qte-marker"></div></div>`;
            document.body.appendChild(el);
            this.qteEl = el;
        }
        return this.qteEl;
    }

    showQte(progress, zoneStart, zoneWidth, combo) {
        const el = this.ensureQte();
        el.style.display = 'block';
        const zone = el.querySelector('#qte-zone');
        zone.style.left = (zoneStart * 100) + '%';
        zone.style.width = (zoneWidth * 100) + '%';
        zone.style.background = combo ? '#ffd24a' : '#3ddc6b';
        el.querySelector('#qte-marker').style.left = `calc(${Math.min(1, Math.max(0, progress)) * 100}% - 5px)`;
    }

    hideQte() {
        if (this.qteEl) this.qteEl.style.display = 'none';
    }

    // ================= EVENT WIRING =================

    setupEventListeners() {
        if (this.activeScreen === 'main') {
            document.getElementById('btn-play').onclick = () => this.showScreen('setup');
            document.getElementById('btn-online').onclick = () => this.showScreen('online');
            document.getElementById('btn-settings').onclick = () => this.showScreen('settings');
            document.getElementById('btn-credits').onclick = () => this.showScreen('credits');
        }
        else if (this.activeScreen === 'online') {
            const gm = this.gameManager;
            const status = document.getElementById('net-status');
            const setStatus = (msg, isError) => {
                status.textContent = msg;
                status.classList.toggle('error', !!isError);
            };

            document.getElementById('btn-online-back').onclick = () => this.showScreen('main');

            const nameInput = document.getElementById('player-name');
            nameInput.onchange = () => {
                const v = nameInput.value.trim().slice(0, 16) || gm.playerName;
                gm.playerName = v;
                localStorage.setItem('om_net_name', v);
            };

            document.getElementById('btn-create-room').onclick = async () => {
                nameInput.onchange();
                setStatus('Connecting to server...');
                try {
                    await gm.onlineCreate();
                    gm.pushLobby();
                    this.showScreen('lobby');
                } catch (err) {
                    setStatus(`${err.message} — is the game server running? (npm run server)`, true);
                }
            };

            document.getElementById('btn-join-room').onclick = async () => {
                nameInput.onchange();
                const code = document.getElementById('join-code').value.toUpperCase().trim();
                if (code.length !== 4) { setStatus('Enter the 4-letter room code.', true); return; }
                setStatus('Joining...');
                try {
                    await gm.onlineJoin(code);
                    this.showScreen('lobby');
                } catch (err) {
                    setStatus(err.message, true);
                }
            };
        }
        else if (this.activeScreen === 'lobby') {
            const gm = this.gameManager;
            const copyBtn = document.getElementById('btn-copy-code');
            if (copyBtn) copyBtn.onclick = () => {
                const code = document.getElementById('room-code').textContent;
                navigator.clipboard?.writeText(code).then(() => copyBtn.textContent = 'COPIED!').catch(() => {});
            };

            document.getElementById('btn-lobby-leave').onclick = () => gm.leaveOnline();

            if (gm.isHost) {
                const startBtn = document.getElementById('btn-lobby-start');
                if (startBtn) startBtn.onclick = () => gm.hostStartGame();

                const countBtn = document.getElementById('lobby-count');
                if (countBtn) countBtn.onclick = () => {
                    const s = gm.gameSetup;
                    s.survivorCount = (s.survivorCount % 4) + 1;
                    // Trim assignments that fell outside the new count.
                    for (let i = s.survivorCount; i < 4; i++) s.assignments[i] = null;
                    gm.pushLobby();
                    this.showScreen('lobby');
                };

                const mapBtn = document.getElementById('lobby-map');
                if (mapBtn) mapBtn.onclick = () => {
                    const maps = ['Open Field', 'Box Arena', 'Crusher Hall', 'Maze Mania'];
                    const s = gm.gameSetup;
                    s.selectedMap = maps[(maps.indexOf(s.selectedMap) + 1) % maps.length];
                    gm.pushLobby();
                    this.showScreen('lobby');
                };

                const killerBtn = document.getElementById('host-cycle-killer');
                if (killerBtn) killerBtn.onclick = () => {
                    const killers = ['Tripwire', '2011X', 'Starved'];
                    const s = gm.gameSetup;
                    s.selectedKillerType = killers[(killers.indexOf(s.selectedKillerType) + 1) % killers.length];
                    gm.pushLobby();
                    this.showScreen('lobby');
                };

                for (let i = 0; i < gm.gameSetup.survivorCount; i++) {
                    const btn = document.getElementById(`host-cycle-char-${i}`);
                    if (btn) btn.onclick = () => {
                        const allChars = gm.getSelectableSurvivors();
                        const s = gm.gameSetup;
                        s.selectedSurvivors[i] = allChars[(allChars.indexOf(s.selectedSurvivors[i]) + 1) % allChars.length];
                        gm.pushLobby();
                        this.showScreen('lobby');
                    };
                }
            } else {
                const cycleBtn = document.getElementById('guest-cycle-char');
                if (cycleBtn) cycleBtn.onclick = () => {
                    const allChars = gm.getSelectableSurvivors();
                    const s = gm.gameSetup;
                    const slot = s.assignments.slice(0, s.survivorCount).indexOf(gm.net.id);
                    if (slot < 0) return;
                    const next = allChars[(allChars.indexOf(s.selectedSurvivors[slot]) + 1) % allChars.length];
                    gm.net.sendPick(next);
                };

                const roleS = document.getElementById('role-survivor');
                if (roleS) roleS.onclick = () => gm.net.sendRole('survivor');
                const roleK = document.getElementById('role-killer');
                if (roleK) roleK.onclick = () => gm.net.sendRole('killer');
            }
        }
        else if (this.activeScreen === 'settings') {
            document.getElementById('btn-settings-back').onclick = () => this.showScreen('main');

            const mSlider = document.getElementById('music-slider');
            mSlider.oninput = () => {
                this.gameManager.audio.musicVolume = mSlider.value / 100;
                document.getElementById('music-val').innerText = mSlider.value;
                this.gameManager.audio.applyVolume();
                this.gameManager.audio.save();
            };
            const sSlider = document.getElementById('sfx-slider');
            sSlider.oninput = () => {
                this.gameManager.audio.sfxVolume = sSlider.value / 100;
                document.getElementById('sfx-val').innerText = sSlider.value;
                this.gameManager.audio.save();
            };

            document.getElementById('hitbox-toggle').onchange = (e) => {
                this.gameManager.settings.showHitboxes = e.target.checked;
                localStorage.setItem('om_show_hitboxes', e.target.checked);
            };

            document.querySelectorAll('select.device-select').forEach(sel => {
                sel.onchange = () => {
                    this.gameManager.inputBindings[sel.dataset.slot] = sel.value;
                    this.gameManager.saveInputBindings();
                };
            });

            document.querySelectorAll('button[data-player]').forEach(btn => {
                btn.onclick = (e) => {
                    const btnEl = e.currentTarget;
                    this.waitingForKey = { player: btnEl.dataset.player, key: btnEl.dataset.key, button: btnEl };
                    btnEl.innerText = "...";
                    btnEl.dataset.text = "...";
                };
            });
            document.onkeydown = (e) => {
                if (this.waitingForKey) {
                    let key = e.key.toLowerCase();
                    if (key === ' ') key = 'space';
                    this.gameManager.controls.schemes[this.waitingForKey.player][this.waitingForKey.key] = key;
                    this.gameManager.controls.save();
                    this.waitingForKey.button.innerText = key.toUpperCase();
                    this.waitingForKey.button.dataset.text = key.toUpperCase();
                    this.waitingForKey = null;
                }
            };
        }
        else if (this.activeScreen === 'credits') {
            document.getElementById('btn-credits-back').onclick = () => this.showScreen('main');
        }
        else if (this.activeScreen === 'setup') {
            document.getElementById('btn-setup-back').onclick = () => this.showScreen('main');
            document.getElementById('btn-start-game').onclick = () => { this.gameManager.startGame(); };

            document.getElementById('btn-cycle-surv-count').onclick = () => {
                let count = this.gameManager.gameSetup.survivorCount;
                count = (count % 4) + 1;
                this.gameManager.gameSetup.survivorCount = count;

                this.gameManager.gameSetup.selectedSurvivors = ['Sonic', 'Tails', 'Knuckles', 'Blaze'].slice(0, count);
                this.showScreen('setup');
            };

            for(let i=0; i<this.gameManager.gameSetup.survivorCount; i++) {
                const btn = document.getElementById(`btn-cycle-surv-${i}`);
                if(btn) {
                    btn.onclick = () => {
                        const allChars = this.gameManager.getSelectableSurvivors();
                        const currentChars = this.gameManager.gameSetup.selectedSurvivors;
                        let currentChar = currentChars[i];
                        let nextChar = currentChar;

                        let idx = allChars.indexOf(currentChar);
                        do {
                            idx = (idx + 1) % allChars.length;
                            nextChar = allChars[idx];
                        } while (currentChars.includes(nextChar) && nextChar !== currentChar);

                        if(nextChar === currentChar) {
                            nextChar = allChars.find(c => !currentChars.includes(c)) || currentChar;
                        }

                        currentChars[i] = nextChar;
                        this.showScreen('setup');
                    };
                }
            }

            document.getElementById('btn-cycle-killer').onclick = () => {
                const killers = ['Tripwire', '2011X', 'Starved'];
                let current = killers.indexOf(this.gameManager.gameSetup.selectedKillerType);
                current = (current + 1) % killers.length;
                this.gameManager.gameSetup.selectedKillerType = killers[current];
                document.getElementById('killer-name').innerText = killers[current];
            };

            document.getElementById('btn-toggle-ai').onclick = () => {
                this.gameManager.gameSetup.killerIsAI = !this.gameManager.gameSetup.killerIsAI;
                const isAI = this.gameManager.gameSetup.killerIsAI;

                const aiBtn = document.getElementById('btn-toggle-ai');
                aiBtn.classList.toggle('on', isAI);
                document.getElementById('ai-status').innerText = isAI ? 'ON' : 'OFF';

                const playerBox = document.getElementById('killer-player-box');
                if (playerBox) {
                    playerBox.style.display = isAI ? 'none' : 'flex';
                }
            };

            document.getElementById('btn-cycle-killer-player').onclick = () => {
                let p = this.gameManager.gameSetup.killerPlayer;
                p = (p % 4) + 1;
                this.gameManager.gameSetup.killerPlayer = p;
                document.getElementById('killer-player').innerText = `P${p}`;
            };

            document.getElementById('btn-cycle-map').onclick = () => {
                const maps = ['Open Field', 'Box Arena', 'Crusher Hall', 'Maze Mania'];
                let current = maps.indexOf(this.gameManager.gameSetup.selectedMap);
                current = (current + 1) % maps.length;
                this.gameManager.gameSetup.selectedMap = maps[current];
                document.getElementById('map-name').innerText = maps[current];
            };
        }
    }
}
