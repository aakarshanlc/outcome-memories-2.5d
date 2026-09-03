export class UIManager {
    constructor(gameManager) {
        this.gameManager = gameManager;
        this.root = document.getElementById('ui-layer');
        this.activeScreen = null;
        this.waitingForKey = null;
        this.hudElement = null;
        this.lastHudKey = null;

        window.addEventListener('gamepadconnected', () => this.refreshDeviceDropdowns());
        window.addEventListener('gamepaddisconnected', () => this.refreshDeviceDropdowns());
    }

    btn(text, id, small = false) {
        return `<button class="button-49 ${small ? 'btn-sm' : ''}" id="${id}" role="button" data-text="${text}">${text}</button>`;
    }

    initHUD() {
        this.hideAll();
        this.root.innerHTML = `
            <div id="hud" style="position: absolute; top: 20px; left: 50%; transform: translateX(-50%); text-align: center; color: white; font-size: 24px; pointer-events: none; text-shadow: 2px 2px 4px black;">
                <div id="phase-text" style="font-weight: bold; color: #ff4444;"></div>
                <div id="timer-text" style="font-size: 32px;"></div>
            </div>
        `;
        this.hudElement = this.root.querySelector('#hud');
    }

    updateHUD(phase, timeLeft, isRush = false) {
        if (!this.hudElement) return;
        const timerText = Math.max(0, Math.ceil(timeLeft));
        const key = `${phase}|${timerText}|${isRush}`;
        if (key === this.lastHudKey) return;
        this.lastHudKey = key;
        const phaseText = isRush ? 'RUSH' : phase;
        const phaseColor = isRush ? '#ff0000' : '#ff4444';

        this.root.querySelector('#phase-text').style.color = phaseColor;
        this.root.querySelector('#timer-text').style.color = isRush ? '#ff0000' : '#ffffff';
        this.root.querySelector('#phase-text').innerText = phaseText;
        this.root.querySelector('#timer-text').innerText = `${timerText}s`;
    }

    showLoadingScreen() {
        this.hideAll();
        this.root.innerHTML = `
            <div class="menu-screen" style="background: #000; justify-content: center; align-items: center;">
                <h1 style="font-size: 40px; color: #ff3333; animation: pulse 1s infinite;">LOADING ASSETS...</h1>
                <style>@keyframes pulse { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }</style>
            </div>
        `;
    }

    showGameOver(title, subtitle, summary = []) {
        this.hideAll();
        const color = /ESCAPE[SD]/.test(title) ? '#00ff00' : '#ff0000';
        const statusText = { escaped: 'ESCAPED', died: 'DIED', 'too slow': 'TOO SLOW' };
        const statusColor = { escaped: '#33ff66', died: '#ff4444', 'too slow': '#ffd700' };
        const rows = summary.map(s =>
            `<div style="color:${statusColor[s.status] || '#fff'};">${s.label} — ${statusText[s.status] || s.status}</div>`
        ).join('');
        this.root.innerHTML = `
            <div class="menu-screen" style="background: rgba(0,0,0,0.9);">
                <h1 style="font-size: 80px; color: ${color};">${title}</h1>
                <h2 style="font-size: 30px; color: #aaa;">${subtitle}</h2>
                ${rows ? `<div class="gameover-summary">${rows}</div>` : ''}
                ${this.btn('BACK TO MENU', 'btn-game-over')}
            </div>
        `;
        document.getElementById('btn-game-over').onclick = () => {
            this.gameManager.stopGame();
        };
    }

    showScreen(screenName) {
        this.hideAll();
        let html = '';

        if (screenName === 'main') {
            html = `
                <video id="menu-video" autoplay loop muted playsinline class="menu-bg-video">
                    <source src="./backgrounds/menu-animation.mp4" type="video/mp4">
                </video>

                <div class="main-menu-overlay">
                    <div class="menu-title-top">
                        <h1>Outcome Memories 2.5D</h1>
                    </div>

                    <div class="menu-buttons-left">
                        ${this.btn('PLAY', 'btn-play')}
                        ${this.btn('SETTINGS', 'btn-settings')}
                        ${this.btn('CREDITS', 'btn-credits')}
                    </div>
                </div>
            `;
        } else if (screenName === 'settings') {
            const schemes = this.gameManager.controls.schemes;
            const audio = this.gameManager.audio;
            const showHit = this.gameManager.settings.showHitboxes ? "checked" : "";
            html = `
                <div class="menu-screen" id="settings-menu" style="justify-content: flex-start; padding-top: 30px; overflow-y: auto;">
                    <h1>SETTINGS</h1>

                    <div class="settings-grid">
                        <div class="settings-col">
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

                        <div class="settings-col">
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

                    <div style="margin-top: 30px;">
                        ${this.btn('BACK', 'btn-settings-back')}
                    </div>
                </div>
            `;
        } else if (screenName === 'credits') {
            html = `
                <div class="menu-screen" id="credits-menu">
                    <h1>CREDITS</h1>
                    <div class="credit-text">Game Design & Development:</div>
                    <div class="credit-name">Aakercum, Jelani(goons to x), Jeff and DJ</div>
                    <div class="credit-text">Based on "Outcome Memories"</div>
                    <br><br>
                    ${this.btn('BACK', 'btn-credits-back')}
                </div>
            `;
        } else if (screenName === 'setup') {
            const aiChecked = this.gameManager.gameSetup.killerIsAI;
            const survCount = this.gameManager.gameSetup.survivorCount;

            let survHtml = '';
            for(let i=0; i<survCount; i++) {
                survHtml += `
                    <div class="setup-item">
                        <h3>SURVIVOR ${i+1}</h3>
                        ${this.btn(`Change (${this.gameManager.gameSetup.selectedSurvivors[i]})`, `btn-cycle-surv-${i}`, true)}
                    </div>
                `;
            }

            html = `
                <div class="menu-screen" id="setup-menu" style="justify-content: center; padding-top: 30px;">
                    <h1>GAME SETUP</h1>
                    <div class="setup-grid">
                        <div class="setup-item">
                            <h3>SURVIVOR COUNT</h3>
                            ${this.btn(`Change (${survCount})`, 'btn-cycle-surv-count', true)}
                        </div>
                        ${survHtml}
                        <div class="setup-item">
                            <h3>KILLER TYPE</h3>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                ${this.btn('Change Type', 'btn-cycle-killer', true)}
                                <button id="btn-toggle-ai" style="background: ${aiChecked ? '#ff3333' : '#333'}; color: white; border: 2px solid #ff3333; border-radius: 0.5em; width: 60px; height: 60px; cursor: pointer; margin: 8px 0; font-weight: bold; font-size: 14px; font-family: inherit;">AI<br><span id="ai-status">${aiChecked ? 'ON' : 'OFF'}</span></button>
                            </div>
                            <p>Type: <span id="killer-name">${this.gameManager.gameSetup.selectedKillerType}</span></p>
                        </div>
                        <div class="setup-item" id="killer-player-box" style="${aiChecked ? 'display: none;' : ''}">
                            <h3>KILLER PLAYER</h3>
                            ${this.btn('Change Player', 'btn-cycle-killer-player', true)}
                            <p><span id="killer-player">P${this.gameManager.gameSetup.killerPlayer}</span></p>
                        </div>
                        <div class="setup-item">
                            <h3>MAP</h3>
                            ${this.btn('Change Map', 'btn-cycle-map', true)}
                            <p><span id="map-name">${this.gameManager.gameSetup.selectedMap}</span></p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 15px; margin-top: 20px;">
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
        zone.style.background = combo ? '#ffd700' : '#33ff66';
        el.querySelector('#qte-marker').style.left = `calc(${Math.min(1, Math.max(0, progress)) * 100}% - 5px)`;
    }

    hideQte() {
        if (this.qteEl) this.qteEl.style.display = 'none';
    }

    setupEventListeners() {
        if (this.activeScreen === 'main') {
            document.getElementById('btn-play').onclick = () => this.showScreen('setup');
            document.getElementById('btn-settings').onclick = () => this.showScreen('settings');
            document.getElementById('btn-credits').onclick = () => this.showScreen('credits');
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
                count = (count % 3) + 1;
                this.gameManager.gameSetup.survivorCount = count;

                this.gameManager.gameSetup.selectedSurvivors = ['Sonic', 'Tails', 'Knuckles'].slice(0, count);
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
                aiBtn.style.background = isAI ? '#ff3333' : '#333';
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
                const maps = ['Open Field', 'Box Arena', 'Maze Mania'];
                let current = maps.indexOf(this.gameManager.gameSetup.selectedMap);
                current = (current + 1) % maps.length;
                this.gameManager.gameSetup.selectedMap = maps[current];
                document.getElementById('map-name').innerText = maps[current];
            };
        }
    }
}
