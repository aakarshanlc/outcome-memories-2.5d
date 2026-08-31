// Dev overlay panel. Open/close with Shift + ` (~).
//
// Adding new controls is one line each in the constructor:
//   this.addHeader('SECTION TITLE');
//   this.addToggle('Label', () => someObj.flag, v => someObj.flag = v);
//   this.addButton('Label', () => { ...do something... });
//
// Toggles and buttons only act on whatever they close over, so nothing here
// affects the game unless the corresponding flag/feature is turned on.

export class DevPanel {
    constructor(gameManager) {
        this.gameManager = gameManager;
        this.visible = false;
        this.el = null;
        this.entries = [];

        this.injectStyles();

        this.addHeader('CHARACTERS');
        this.addToggle('Unlock Gaster',
            () => this.gameManager.dev.gasterUnlocked,
            v => {
                this.gameManager.dev.gasterUnlocked = v;
                // Drop Gaster from the setup lineup when the toggle goes off
                if (!v) {
                    const sel = this.gameManager.gameSetup.selectedSurvivors;
                    for (let i = 0; i < sel.length; i++) {
                        if (sel[i] === 'Gaster') sel[i] = 'Sonic';
                    }
                }
            });

        this.addHeader('CHEATS');
        this.addToggle('God Mode (survivors)',
            () => this.gameManager.dev.godMode,
            v => this.gameManager.dev.godMode = v);
        this.addToggle('Freeze Killer',
            () => this.gameManager.dev.freezeKiller,
            v => this.gameManager.dev.freezeKiller = v);
        this.addToggle('Show Hitboxes',
            () => this.gameManager.settings.showHitboxes,
            v => {
                this.gameManager.settings.showHitboxes = v;
                localStorage.setItem('om_show_hitboxes', v);
            });

        this.addHeader('ACTIONS');
        this.addButton('+60s Round Timer', () => {
            if (typeof this.gameManager.gameTimer === 'number') this.gameManager.gameTimer += 3600;
        });
        this.addButton('Heal All Survivors', () => {
            this.gameManager.players.forEach(p => { p.health = p.maxHealth; p.mesh.visible = true; });
        });
        this.addButton('Kill All Survivors', () => {
            this.gameManager.players.forEach(p => { p.health = 0; p.mesh.visible = false; });
        });
    }

    addHeader(title) { this.entries.push({ type: 'header', title }); }
    addToggle(label, get, set) { this.entries.push({ type: 'toggle', label, get, set }); }
    addButton(label, onClick) { this.entries.push({ type: 'button', label, onClick }); }

    toggle() {
        this.visible = !this.visible;
        this.render();
    }

    render() {
        if (!this.el) {
            this.el = document.createElement('div');
            this.el.id = 'dev-panel';
            document.body.appendChild(this.el);
        }
        if (!this.visible) { this.el.style.display = 'none'; return; }

        let html = '<div id="dev-panel-title">DEV PANEL <span>Shift + ~ closes</span></div>';
        this.entries.forEach((e, i) => {
            if (e.type === 'header') {
                html += `<div class="dev-header">${e.title}</div>`;
            } else if (e.type === 'toggle') {
                html += `<label class="dev-row"><input type="checkbox" data-dev-idx="${i}" ${e.get() ? 'checked' : ''}><span>${e.label}</span></label>`;
            } else {
                html += `<button class="dev-row dev-btn" data-dev-idx="${i}">${e.label}</button>`;
            }
        });
        this.el.innerHTML = html;
        this.el.style.display = 'block';

        this.el.querySelectorAll('[data-dev-idx]').forEach(input => {
            const entry = this.entries[Number(input.dataset.devIdx)];
            if (entry.type === 'toggle') {
                input.onchange = () => entry.set(input.checked);
            } else {
                input.onclick = () => entry.onClick();
            }
        });
    }

    injectStyles() {
        if (document.getElementById('dev-panel-style')) return;
        const style = document.createElement('style');
        style.id = 'dev-panel-style';
        style.textContent = `
            #dev-panel { position: fixed; top: 60px; right: 15px; width: 250px; max-height: 80vh; overflow-y: auto;
                background: rgba(10, 10, 14, 0.95); border: 2px solid #7a00ff; border-radius: 8px; padding: 12px;
                z-index: 10000; font-family: monospace; color: #ddd; pointer-events: auto; user-select: none; }
            #dev-panel-title { font-weight: bold; color: #b366ff; font-size: 16px; margin-bottom: 8px; }
            #dev-panel-title span { font-weight: normal; font-size: 11px; color: #888; }
            #dev-panel .dev-header { color: #7a00ff; font-size: 12px; font-weight: bold; margin: 10px 0 4px;
                text-transform: uppercase; letter-spacing: 1px; }
            #dev-panel .dev-row { display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;
                background: #1a1a22; border: 1px solid #333; border-radius: 4px; color: #ddd; text-align: left;
                padding: 6px 8px; margin: 4px 0; font-size: 13px; font-family: monospace; cursor: pointer; }
            #dev-panel .dev-btn:hover { background: #2a2a35; border-color: #7a00ff; }
            #dev-panel input[type="checkbox"] { width: 15px; height: 15px; cursor: pointer; }
        `;
        document.head.appendChild(style);
    }
}
