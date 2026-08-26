export class UIManager {
    constructor(gameManager) {
        this.gameManager = gameManager;
        this.root = document.getElementById('ui-layer');
        this.activeScreen = null;
        this.waitingForKey = null;
        this.hudElement = null;
        
        this.btnIcon = `<svg height="24" width="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24v24H0z" fill="none"></path><path d="M16.172 11l-5.364-5.364 1.414-1.414L20 12l-7.778 7.778-1.414-1.414L16.172 13H4v-2z" fill="currentColor"></path></svg>`;
    }

    btn(text, id, small = false) {
        return `<button class="cssbuttons-io-button ${small ? 'btn-sm' : ''}" id="${id}"><span>${text}</span><div class="icon">${this.btnIcon}</div></button>`;
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

    updateHUD(phase, timeLeft) {
        if (!this.hudElement) return;
        let phaseText = "";
        let timerText = Math.max(0, Math.ceil(timeLeft));
        if (phase === 'ROUND') phaseText = "SURVIVE";
        else if (phase === 'LMS') phaseText = "LAST MAN STANDING";
        else if (phase === 'RING') phaseText = "ESCAPE!";
        this.root.querySelector('#phase-text').innerText = phaseText;
        this.root.querySelector('#timer-text').innerText = `${timerText}s`;
    }

    showGameOver(title, subtitle) {
        this.hideAll();
        this.root.innerHTML = `
            <div class="menu-screen" style="background: rgba(0,0,0,0.9);">
                <h1 style="font-size: 80px; color: ${title.includes('ESCAPES') ? '#00ff00' : '#ff0000'};">${title}</h1>
                <h2 style="font-size: 30px; color: #aaa;">${subtitle}</h2>
                ${this.btn('BACK TO MENU', 'btn-game-over')}
            </div>
        `;
        document.getElementById('btn-game-over').onclick = () => {
            this.gameManager.stopGame();
            this.showScreen('main');
        };
    }

    showScreen(screenName) {
        this.hideAll();
        let html = '';

        if (screenName === 'main') {
            html = `
                <div class="window" id="draggable-window">
                    <div class="window-title" id="window-drag-handle">
                        <p>2011X.exe</p>
                        <div class="window-buttons">
                            <div class="window-button reduce"></div>
                            <div class="window-button fullscreen"></div>
                            <div class="window-button close"></div>
                        </div>
                    </div>
                    <div class="console">
                        <img src="./2011x.jpeg" alt="2011X" id="console-img">
                    </div>
                </div>
                
                <div class="menu-screen" id="main-menu">
                    <h1>Outcome Memories 2.5D</h1>
                    <h2>Three.js Engine Port</h2>
                    ${this.btn('PLAY', 'btn-play')}
                    ${this.btn('SETTINGS', 'btn-settings')}
                    ${this.btn('CREDITS', 'btn-credits')}
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
                        <div class="control-box"><h3>P1</h3>${this.generateControlButtons('p1', schemes.p1)}</div>
                        <div class="control-box"><h3>P2</h3>${this.generateControlButtons('p2', schemes.p2)}</div>
                        <div class="control-box"><h3>P3</h3>${this.generateControlButtons('p3', schemes.p3)}</div>
                        <div class="control-box"><h3>P4</h3>${this.generateControlButtons('p4', schemes.p4)}</div>
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
            html = `
                <div class="menu-screen" id="setup-menu" style="justify-content: center; padding-top: 30px;">
                    <h1>GAME SETUP</h1>
                    <div class="setup-grid">
                        <div class="setup-item">
                            <h3>SURVIVORS</h3>
                            ${this.btn('Change Count', 'btn-cycle-surv', true)}
                            <p>Selected: <span id="surv-count">${this.gameManager.gameSetup.survivorCount}</span></p>
                        </div>
                        <div class="setup-item">
                            <h3>KILLER TYPE</h3>
                            ${this.btn('Change Type', 'btn-cycle-killer', true)}
                            <p><span id="killer-name">${this.gameManager.gameSetup.selectedKillerType}</span></p>
                        </div>
                        <div class="setup-item">
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
    }

    generateControlButtons(playerId, scheme) {
        const labels = ['Up', 'Down', 'Left', 'Right', 'Ab1', 'Ab2', 'M1'];
        const keys = ['up', 'down', 'left', 'right', 'ability1', 'ability2', 'm1'];
        return labels.map((label, i) => {
            const key = keys[i];
            const val = scheme[key].toUpperCase();
            return `<div class="control-row">
                        <span>${label}:</span> 
                        <button class="cssbuttons-io-button btn-sm" data-player="${playerId}" data-key="${key}"><span>${val}</span><div class="icon">${this.btnIcon}</div></button>
                    </div>`;
        }).join('');
    }

    hideAll() { this.root.innerHTML = ''; this.hudElement = null; }

    setupEventListeners() {
        if (this.activeScreen === 'main') {
            document.getElementById('btn-play').onclick = () => this.showScreen('setup');
            document.getElementById('btn-settings').onclick = () => this.showScreen('settings');
            document.getElementById('btn-credits').onclick = () => this.showScreen('credits');

            // --- DRAG AND TELEPORT LOGIC ---
            const windowEl = document.getElementById('draggable-window');
            const dragHandle = document.getElementById('window-drag-handle');
            const imgEl = document.getElementById('console-img');

            let isDragging = false;
            let offsetX = 0, offsetY = 0;

            // 1. Click image to teleport randomly
            if (imgEl) {
                imgEl.addEventListener('click', () => {
                    const x = Math.random() * (window.innerWidth - 320) + 10;
                    const y = Math.random() * (window.innerHeight - 240) + 10;
                    windowEl.style.left = `${x}px`;
                    windowEl.style.top = `${y}px`;
                });
            }

            // 2. Drag title bar to move smoothly
            dragHandle.addEventListener('mousedown', (e) => {
                isDragging = true;
                const rect = windowEl.getBoundingClientRect();
                offsetX = e.clientX - rect.left;
                offsetY = e.clientY - rect.top;
            });

            document.addEventListener('mousemove', (e) => {
                if (isDragging) {
                    let x = e.clientX - offsetX;
                    let y = e.clientY - offsetY;
                    // Keep it on screen
                    x = Math.max(0, Math.min(window.innerWidth - 300, x));
                    y = Math.max(0, Math.min(window.innerHeight - 230, y));
                    windowEl.style.left = `${x}px`;
                    windowEl.style.top = `${y}px`;
                }
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
            });
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

            document.querySelectorAll('button[data-player]').forEach(btn => {
                btn.onclick = (e) => {
                    const spanEl = e.currentTarget.querySelector('span');
                    this.waitingForKey = { player: e.currentTarget.dataset.player, key: e.currentTarget.dataset.key, button: spanEl };
                    spanEl.innerText = "...";
                };
            });
            document.onkeydown = (e) => {
                if (this.waitingForKey) {
                    let key = e.key.toLowerCase();
                    if (key === ' ') key = 'space';
                    this.gameManager.controls.schemes[this.waitingForKey.player][this.waitingForKey.key] = key;
                    this.gameManager.controls.save();
                    this.waitingForKey.button.innerText = key.toUpperCase();
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

            document.getElementById('btn-cycle-surv').onclick = () => {
                let count = this.gameManager.gameSetup.survivorCount;
                count = (count % 3) + 1; 
                this.gameManager.gameSetup.survivorCount = count;
                document.getElementById('surv-count').innerText = count;
            };

            document.getElementById('btn-cycle-killer').onclick = () => {
                const killers = ['Tripwire', '2011X', 'Starved'];
                let current = killers.indexOf(this.gameManager.gameSetup.selectedKillerType);
                current = (current + 1) % killers.length;
                this.gameManager.gameSetup.selectedKillerType = killers[current];
                document.getElementById('killer-name').innerText = killers[current];
            };

            document.getElementById('btn-cycle-killer-player').onclick = () => {
                let p = this.gameManager.gameSetup.killerPlayer;
                p = (p % 4) + 1; 
                this.gameManager.gameSetup.killerPlayer = p;
                document.getElementById('killer-player').innerText = `P${p}`;
            };

            document.getElementById('btn-cycle-map').onclick = () => {
                const maps = ['Open Field', 'Box Arena'];
                let current = maps.indexOf(this.gameManager.gameSetup.selectedMap);
                current = (current + 1) % maps.length;
                this.gameManager.gameSetup.selectedMap = maps[current];
                document.getElementById('map-name').innerText = maps[current];
            };
        }
    }
}