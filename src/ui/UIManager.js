export class UIManager {
    constructor(gameManager) {
        this.gameManager = gameManager;
        this.root = document.getElementById('ui-layer');
        this.activeScreen = null;
        this.waitingForKey = null;
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
            html = `
                <div class="menu-screen" id="settings-menu" style="display: block; padding: 50px; overflow-y: auto;">
                    <h1 style="font-size: 40px;">SETTINGS</h1>
                    <div style="display: flex; gap: 100px; justify-content: center; margin-top: 20px;">
                        <div>
                            <h3>PLAYER 1 (Survivor)</h3>
                            ${this.generateControlButtons('p1', schemes.p1)}
                        </div>
                        <div>
                            <h3>PLAYER 2 (Killer)</h3>
                            ${this.generateControlButtons('p2', schemes.p2)}
                        </div>
                    </div>
                    <div class="btn" id="btn-settings-back" style="margin-top: 40px;">BACK</div>
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
                            <h3>SURVIVOR</h3>
                            <div class="btn" id="btn-cycle-char">Change Character</div>
                            <p>Selected: <span id="char-name">${this.gameManager.gameSetup.selectedCharacter}</span></p>
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
            return `<div style="display: flex; justify-content: space-between; margin: 10px 0; width: 250px; align-items: center;">
                        <span>${label}:</span> 
                        <button class="btn" style="width: 100px; padding: 5px;" data-player="${playerId}" data-key="${key}">${val}</button>
                    </div>`;
        }).join('');
    }

    hideAll() { this.root.innerHTML = ''; }

    setupEventListeners() {
        if (this.activeScreen === 'main') {
            document.getElementById('btn-play').onclick = () => this.showScreen('setup');
            document.getElementById('btn-settings').onclick = () => this.showScreen('settings');
            document.getElementById('btn-credits').onclick = () => this.showScreen('credits');
        } 
        else if (this.activeScreen === 'settings') {
            document.getElementById('btn-settings-back').onclick = () => this.showScreen('main');
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
            document.getElementById('btn-start-game').onclick = () => {
                this.hideAll();
                this.gameManager.startGame();
            };

            document.getElementById('btn-cycle-char').onclick = () => {
                const chars = ['Sonic', 'Tails', 'Knuckles'];
                let current = chars.indexOf(this.gameManager.gameSetup.selectedCharacter);
                current = (current + 1) % chars.length;
                this.gameManager.gameSetup.selectedCharacter = chars[current];
                document.getElementById('char-name').innerText = chars[current];
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