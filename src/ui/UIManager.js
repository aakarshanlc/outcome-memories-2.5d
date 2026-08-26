export class UIManager {
    constructor(gameManager) {
        this.gameManager = gameManager;
        this.root = document.getElementById('ui-layer');
        this.activeScreen = null;
        this.waitingForKey = null;
        this.hudElement = null;
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
            <div class="menu-screen" style="background: rgba(0,0,0,0.85);">
                <h1 style="font-size: 80px; color: ${title.includes('ESCAPES') ? '#00ff00' : '#ff0000'};">${title}</h1>
                <h2 style="font-size: 30px; color: #aaa;">${subtitle}</h2>
                <div class="btn btn-primary" id="btn-game-over" style="margin-top: 40px;">BACK TO MENU</div>
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
                <div class="menu-screen" id="main-menu">
                    <h1>Outcome Memories 2.5D</h1>
                    <h2>Three.js Engine Port</h2>
                    <div class="btn btn-primary" id="btn-play">PLAY</div>
                    <div class="btn" id="btn-settings">SETTINGS</div>
                    <div class="btn" id="btn-credits">CREDITS</div>
                </div>
            `;
        } else if (screenName === 'settings') {
            const schemes = this.gameManager.controls.schemes;
            const audio = this.gameManager.audio;
            const showHit = this.gameManager.settings.showHitboxes ? "checked" : "";
            html = `
                <div class="menu-screen" id="settings-menu" style="display: block; padding: 30px; overflow-y: auto; width: 100%; height: 100%; box-sizing: border-box;">
                    <h1 style="font-size: 40px; text-align:center; margin-bottom: 20px;">SETTINGS</h1>
                    
                    <div style="display: flex; justify-content: center; gap: 50px; margin-bottom: 30px; flex-wrap: wrap; border-bottom: 1px solid #444; padding-bottom: 20px;">
                        <div style="min-width: 250px;">
                            <h3 style="text-align:center;">AUDIO</h3>
                            <div style="display: flex; flex-direction: column; gap: 15px; align-items: center;">
                                <div>
                                    <label>Music Volume: <span id="music-val">${Math.round(audio.musicVolume*100)}</span>%</label><br>
                                    <input type="range" id="music-slider" min="0" max="100" value="${audio.musicVolume*100}" style="width: 200px;">
                                </div>
                                <div>
                                    <label>SFX Volume: <span id="sfx-val">${Math.round(audio.sfxVolume*100)}</span>%</label><br>
                                    <input type="range" id="sfx-slider" min="0" max="100" value="${audio.sfxVolume*100}" style="width: 200px;">
                                </div>
                            </div>
                        </div>
                        <div style="min-width: 250px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <h3 style="text-align:center;">VISUALS</h3>
                            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 18px;">
                                <input type="checkbox" id="hitbox-toggle" ${showHit} style="width: 20px; height: 20px;"> 
                                Show Hitboxes
                            </label>
                        </div>
                    </div>

                    <div style="display: flex; gap: 20px; justify-content: center; flex-wrap: wrap;">
                        <div style="min-width: 220px;"><h3 style="text-align:center;">P1 (Survivor)</h3>${this.generateControlButtons('p1', schemes.p1)}</div>
                        <div style="min-width: 220px;"><h3 style="text-align:center;">P2 (Killer)</h3>${this.generateControlButtons('p2', schemes.p2)}</div>
                        <div style="min-width: 220px;"><h3 style="text-align:center;">P3 (Survivor)</h3>${this.generateControlButtons('p3', schemes.p3)}</div>
                        <div style="min-width: 220px;"><h3 style="text-align:center;">P4 (Survivor)</h3>${this.generateControlButtons('p4', schemes.p4)}</div>
                    </div>
                    <div style="display: flex; justify-content: center; margin-top: 30px;">
                        <div class="btn" id="btn-settings-back" style="width: 200px;">BACK</div>
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
                    <div class="btn" id="btn-credits-back">BACK</div>
                </div>
            `;
        } else if (screenName === 'setup') {
            html = `
                <div class="menu-screen" id="setup-menu" style="justify-content: flex-start; padding-top: 50px;">
                    <h1 style="font-size: 40px; margin-bottom: 20px;">GAME SETUP</h1>
                    <div style="display: flex; gap: 50px; width: 80%;">
                        <div style="flex: 1;">
                            <h3>SURVIVORS</h3>
                            <div class="btn" id="btn-cycle-surv">Change Count</div>
                            <p>Selected: <span id="surv-count">${this.gameManager.gameSetup.survivorCount}</span></p>
                        </div>
                        <div style="flex: 1;">
                            <h3>KILLER</h3>
                            <div class="btn" id="btn-cycle-killer">Change Killer</div>
                            <p>Selected: <span id="killer-name">${this.gameManager.gameSetup.selectedKillerType}</span></p>
                        </div>
                        <div style="flex: 1;">
                            <h3>MAP</h3>
                            <div class="btn" id="btn-cycle-map">Change Map</div>
                            <p>Selected: <span id="map-name">${this.gameManager.gameSetup.selectedMap}</span></p>
                        </div>
                    </div>
                    <div class="btn btn-primary" id="btn-start-game" style="margin-top: 50px;">START GAME</div>
                    <div class="btn btn-danger" id="btn-setup-back" style="margin-top: 10px;">BACK</div>
                </div>
            `;
        }

        this.root.innerHTML = html;
        this.activeScreen = screenName;
        this.setupEventListeners();
    }

    generateControlButtons(playerId, scheme) {
        const labels = ['Up', 'Down', 'Left', 'Right', 'Ability 1', 'Ability 2', 'M1 Attack'];
        const keys = ['up', 'down', 'left', 'right', 'ability1', 'ability2', 'm1'];
        return labels.map((label, i) => {
            const key = keys[i];
            const val = scheme[key].toUpperCase();
            return `<div style="display: flex; justify-content: space-between; margin: 5px 0; width: 100%; align-items: center; font-size: 14px;">
                        <span>${label}:</span> 
                        <button class="btn" style="width: 80px; padding: 2px; font-size: 12px;" data-player="${playerId}" data-key="${key}">${val}</button>
                    </div>`;
        }).join('');
    }

    hideAll() { this.root.innerHTML = ''; this.hudElement = null; }

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
                    this.waitingForKey = { player: e.target.dataset.player, key: e.target.dataset.key, button: e.target };
                    e.target.innerText = "PRESS...";
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
                count = (count % 3) + 1; // Cycles 1 -> 2 -> 3 -> 1
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