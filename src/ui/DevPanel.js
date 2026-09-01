
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

        let html = `
            <div id="dev-panel-title">THE PANEL</div>
            <div id="dev-panel-subtitle">Shift + ~ closes</div>
        `;

        let section = null;
        const sections = [];
        this.entries.forEach((e, i) => {
            if (e.type === 'header') {
                section = { title: e.title, rows: [] };
                sections.push(section);
            } else if (section) {
                section.rows.push({ ...e, idx: i });
            }
        });

        sections.forEach(sec => {
            html += `<div class="dev-section">`;
            html += `<div class="dev-header">${sec.title}</div>`;
            sec.rows.forEach(row => {
                if (row.type === 'toggle') {
                    html += `
                        <label class="dev-row dev-toggle-row">
                            <span>${row.label}</span>
                            <input type="checkbox" data-dev-idx="${row.idx}" ${row.get() ? 'checked' : ''}>
                        </label>`;
                } else {
                    html += `<button class="dev-row dev-btn" data-dev-idx="${row.idx}">${row.label}</button>`;
                }
            });
            html += `</div>`;
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
            #dev-panel {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 320px;
                max-height: 85vh;
                overflow-y: auto;
                background: #060606;
                border: 2px solid #d9d9d9;
                border-radius: 6px;
                padding: 16px 18px 20px;
                z-index: 10000;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                color: #eee;
                pointer-events: auto;
                user-select: none;
                box-shadow: 0 0 0 4px rgba(0,0,0,0.6), 0 10px 40px rgba(0,0,0,0.7);
            }

            #dev-panel-title {
                font-family: Georgia, 'Times New Roman', serif;
                font-weight: bold;
                font-style: italic;
                font-size: 26px;
                text-align: center;
                letter-spacing: 1px;
                color: #fff;
                margin-bottom: 2px;
            }

            #dev-panel-subtitle {
                text-align: center;
                font-size: 11px;
                color: #777;
                margin-bottom: 12px;
                padding-bottom: 12px;
                border-bottom: 1px solid #333;
            }

            #dev-panel .dev-section {
                border-bottom: 1px solid #333;
                padding: 10px 0 14px;
            }
            #dev-panel .dev-section:last-child {
                border-bottom: none;
                padding-bottom: 2px;
            }

            #dev-panel .dev-header {
                text-align: center;
                font-size: 15px;
                font-weight: 600;
                color: #fff;
                text-transform: capitalize;
                margin-bottom: 10px;
            }

            #dev-panel .dev-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                width: 100%;
                box-sizing: border-box;
                background: transparent;
                border: 1px solid #555;
                border-radius: 4px;
                color: #eee;
                text-align: center;
                padding: 8px 12px;
                margin: 6px 0;
                font-size: 13px;
                font-family: inherit;
                cursor: pointer;
            }

            #dev-panel .dev-toggle-row span {
                text-align: left;
            }

            #dev-panel .dev-btn {
                justify-content: center;
                text-transform: capitalize;
            }
            #dev-panel .dev-btn:hover {
                background: #1a1a1a;
                border-color: #fff;
            }

            #dev-panel input[type="checkbox"] {
                width: 15px;
                height: 15px;
                cursor: pointer;
                accent-color: #d9d9d9;
                flex-shrink: 0;
            }

            #dev-panel::-webkit-scrollbar { width: 8px; }
            #dev-panel::-webkit-scrollbar-track { background: #111; }
            #dev-panel::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; }
        `;
        document.head.appendChild(style);
    }
}