export class DevPanel {
    constructor(gameManager) {
        this.gameManager = gameManager;
        this.visible = false;
        this.el = null;
        this.entries = [];
        this.gpEl = null;
        this.gpTimer = null;

        this.cfg = {
            stunSec: 5,
            effectSel: 'Bleed',
            effectSec: 10,
            sanicMult: 3,
            giantScale: 2.5,
            gravMult: 0.3,
            chaosSel: 'Sanic Mode'
        };

        this.injectStyles();

        const gm = this.gameManager;
        const living = fn => gm.players.forEach(p => { if (p.health > 0) fn(p); });

        this.addHeader('CHARACTERS');
        this.addToggle('Unlock Gaster',
            () => gm.dev.gasterUnlocked,
            v => {
                gm.dev.gasterUnlocked = v;
                if (!v) {
                    const sel = gm.gameSetup.selectedSurvivors;
                    for (let i = 0; i < sel.length; i++) {
                        if (sel[i] === 'Gaster') sel[i] = 'Sonic';
                    }
                }
            });

        this.addHeader('CHEATS');
        this.addToggle('God Mode (survivors)',
            () => gm.dev.godMode,
            v => gm.dev.godMode = v);
        this.addToggle('Freeze Killer',
            () => gm.dev.freezeKiller,
            v => gm.dev.freezeKiller = v);
        this.addToggle('Show Hitboxes',
            () => gm.settings.showHitboxes,
            v => {
                gm.settings.showHitboxes = v;
                localStorage.setItem('om_show_hitboxes', v);
            });

        this.addHeader('TESTING');
        this.addButton('Skip Phase', () => gm.devSkipPhase());
        this.addToggle('Freeze Timers',
            () => gm.dev.freezeTimers,
            v => gm.dev.freezeTimers = v);
        this.addToggle('Slow-Mo (50%)',
            () => gm.dev.slowMo,
            v => gm.dev.slowMo = v);
        this.addToggle('Show FPS',
            () => gm.dev.showFps,
            v => { gm.dev.showFps = v; gm.updateFpsOverlay(); });
        this.addToggle('Show AI Path',
            () => gm.dev.showNavPath,
            v => gm.dev.showNavPath = v);
        this.addButton('Teleport Survivors To Ring', () => gm.devTeleportToRing());
        this.addButton('Reset All Cooldowns', () => gm.devResetCooldowns());
        this.addInput('Stun Killer (sec)',
            () => this.cfg.stunSec,
            v => this.cfg.stunSec = v,
            { min: 0.5, max: 60, step: 0.5 });
        this.addButton('Stun Killer', () => {
            gm.killers.forEach(k => k.stun(Math.round(this.cfg.stunSec * 60)));
        });

        this.addHeader('GAMEPAD');
        this.addToggle('Gamepad Tester',
            () => !!this.gpTimer,
            v => v ? this.openGpTester() : this.closeGpTester());
        this.addButton('Rumble All Pads', () => this.rumblePads());
        this.addButton('Rotate Pad Slots', () => {
            gm.dev.padSlotOffset = (gm.dev.padSlotOffset + 1) % 4;
        });

        this.addHeader('SURVIVOR EFFECTS');
        this.addSelect('Effect',
            ['Bleed', 'Inverted Controls', 'Speed Boost'],
            () => this.cfg.effectSel,
            v => this.cfg.effectSel = v);
        this.addInput('Duration (sec)',
            () => this.cfg.effectSec,
            v => this.cfg.effectSec = v,
            { min: 1, max: 60, step: 1 });
        this.addButton('Apply Effect', () => {
            const frames = Math.round(this.cfg.effectSec * 60);
            living(p => {
                if (this.cfg.effectSel === 'Bleed') p.bleedTimer = frames;
                else if (this.cfg.effectSel === 'Inverted Controls') p.invertedControlsTimer = frames;
                else if (this.cfg.effectSel === 'Speed Boost') p.hitSpeedBoost = frames;
            });
        });

        this.addHeader('CHAOS');
        this.addSelect('Chaos Mode',
            ['Sanic Mode', 'Giant Mode', 'Gravity'],
            () => this.cfg.chaosSel,
            v => { this.cfg.chaosSel = v; this.render(); });
        this.addInput('Magnitude',
            () => this.chaosValue(),
            v => this.chaosSetValue(v),
            () => this.chaosOpts());
        this.addToggle('Enabled',
            () => this.chaosFlag(),
            v => this.chaosSetFlag(v));

        this.addHeader('ACTIONS');
        this.addButton('+60s Round Timer', () => {
            if (typeof gm.gameTimer === 'number') gm.gameTimer += 3600;
        });
        this.addButton('Heal All Survivors', () => {
            gm.players.forEach(p => { p.health = p.maxHealth; p.mesh.visible = true; });
        });
        this.addButton('Kill All Survivors', () => {
            gm.players.forEach(p => { p.health = 0; p.mesh.visible = false; });
        });
    }

    addHeader(title) { this.entries.push({ type: 'header', title }); }
    addToggle(label, get, set) { this.entries.push({ type: 'toggle', label, get, set }); }
    addButton(label, onClick) { this.entries.push({ type: 'button', label, onClick }); }
    addInput(label, get, set, opts = {}) {
        this.entries.push({ type: 'input', label, get, set, opts });
    }
    addSelect(label, options, get, set) {
        this.entries.push({ type: 'select', label, options, get, set });
    }

    chaosValue() {
        if (this.cfg.chaosSel === 'Sanic Mode') return this.cfg.sanicMult;
        if (this.cfg.chaosSel === 'Giant Mode') return this.cfg.giantScale;
        return this.cfg.gravMult;
    }

    chaosSetValue(v) {
        if (this.cfg.chaosSel === 'Sanic Mode') this.cfg.sanicMult = v;
        else if (this.cfg.chaosSel === 'Giant Mode') this.cfg.giantScale = v;
        else this.cfg.gravMult = v;
    }

    chaosOpts() {
        if (this.cfg.chaosSel === 'Sanic Mode') return { min: 0.5, max: 10, step: 0.5 };
        if (this.cfg.chaosSel === 'Giant Mode') return { min: 1, max: 6, step: 0.5 };
        return { min: 0, max: 1, step: 0.05 };
    }

    chaosFlag() {
        const dev = this.gameManager.dev;
        if (this.cfg.chaosSel === 'Sanic Mode') return dev.sanicMode;
        if (this.cfg.chaosSel === 'Giant Mode') return dev.giantMode;
        return dev.moonGravity;
    }

    chaosSetFlag(v) {
        const dev = this.gameManager.dev;
        if (this.cfg.chaosSel === 'Sanic Mode') dev.sanicMode = v;
        else if (this.cfg.chaosSel === 'Giant Mode') dev.giantMode = v;
        else dev.moonGravity = v;
    }

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
                } else if (row.type === 'input') {
                    const o = typeof row.opts === 'function' ? row.opts() : (row.opts || {});
                    html += `
                        <label class="dev-row dev-input-row">
                            <span>${row.label}</span>
                            <input type="number" data-dev-idx="${row.idx}" value="${row.get()}"
                                min="${o.min ?? 0}" max="${o.max ?? ''}" step="${o.step ?? 1}">
                        </label>`;
                } else if (row.type === 'select') {
                    const opts = row.options.map(op =>
                        `<option value="${op}" ${row.get() === op ? 'selected' : ''}>${op}</option>`).join('');
                    html += `
                        <label class="dev-row dev-select-row">
                            <span>${row.label}</span>
                            <select data-dev-idx="${row.idx}">${opts}</select>
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
            } else if (entry.type === 'input') {
                input.onchange = () => {
                    const v = parseFloat(input.value);
                    if (!isNaN(v)) entry.set(v);
                };
            } else if (entry.type === 'select') {
                input.onchange = () => entry.set(input.value);
            } else {
                input.onclick = () => entry.onClick();
            }
        });
    }

    openGpTester() {
        if (!this.gpEl) {
            this.gpEl = document.createElement('div');
            this.gpEl.id = 'gp-tester';
            document.body.appendChild(this.gpEl);
        }
        this.gpEl.style.display = 'block';
        const update = () => {
            const pads = [];
            for (const pad of navigator.getGamepads()) {
                if (pad && pad.connected) pads.push(pad);
            }
            const n = Math.max(1, pads.length);
            const off = ((this.gameManager.dev.padSlotOffset % n) + n) % n;
            let html = '<div class="gp-title">GAMEPADS</div>';
            if (!pads.length) html += '<div class="gp-empty">no pads connected</div>';
            pads.forEach((pad, i) => {
                const slot = ((i + off) % n) + 1;
                const btns = pad.buttons.map((b, bi) =>
                    `<span class="gp-b ${b.pressed ? 'on' : ''}">${bi}</span>`).join('');
                const axes = pad.axes.map(a => a.toFixed(2)).join(', ');
                html += `
                    <div class="gp-pad">
                        <div class="gp-slot">P${slot} <span class="gp-id">${pad.id.slice(0, 24)}</span></div>
                        <div class="gp-btns">${btns}</div>
                        <div class="gp-axes">axes: ${axes}</div>
                    </div>`;
            });
            this.gpEl.innerHTML = html;
        };
        update();
        this.gpTimer = setInterval(update, 120);
    }

    closeGpTester() {
        clearInterval(this.gpTimer);
        this.gpTimer = null;
        if (this.gpEl) this.gpEl.style.display = 'none';
    }

    rumblePads() {
        for (const pad of navigator.getGamepads()) {
            if (pad && pad.vibrationActuator) {
                pad.vibrationActuator.playEffect('dual-rumble', {
                    duration: 500,
                    strongMagnitude: 1.0,
                    weakMagnitude: 1.0
                }).catch(() => {});
            }
        }
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
                width: 340px;
                max-height: 90vh;
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

            #dev-panel .dev-toggle-row span,
            #dev-panel .dev-input-row span {
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

            #dev-panel .dev-input-row input {
                width: 70px;
                background: #111;
                border: 1px solid #555;
                border-radius: 4px;
                color: #eee;
                font-family: inherit;
                font-size: 13px;
                padding: 4px 6px;
                text-align: right;
                flex-shrink: 0;
            }
            #dev-panel .dev-input-row input:focus {
                outline: none;
                border-color: #fff;
            }

            #dev-panel .dev-select-row select {
                width: 140px;
                background: #111;
                border: 1px solid #555;
                border-radius: 4px;
                color: #eee;
                font-family: inherit;
                font-size: 12px;
                padding: 4px 6px;
                flex-shrink: 0;
            }
            #dev-panel .dev-select-row select:focus {
                outline: none;
                border-color: #fff;
            }

            #dev-panel::-webkit-scrollbar { width: 8px; }
            #dev-panel::-webkit-scrollbar-track { background: #111; }
            #dev-panel::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; }

            #gp-tester {
                position: fixed;
                top: 12px;
                right: 12px;
                width: 240px;
                max-height: 70vh;
                overflow-y: auto;
                background: rgba(6, 6, 6, 0.94);
                border: 2px solid #d9d9d9;
                border-radius: 6px;
                padding: 10px 12px;
                z-index: 10001;
                font-family: Consolas, monospace;
                font-size: 11px;
                color: #eee;
                pointer-events: none;
            }
            #gp-tester .gp-title {
                text-align: center;
                font-weight: bold;
                letter-spacing: 1px;
                margin-bottom: 8px;
                color: #fff;
            }
            #gp-tester .gp-empty {
                text-align: center;
                color: #777;
            }
            #gp-tester .gp-pad {
                border-top: 1px solid #333;
                padding: 6px 0;
            }
            #gp-tester .gp-slot {
                color: #0f0;
                margin-bottom: 4px;
            }
            #gp-tester .gp-id {
                color: #777;
                font-size: 10px;
            }
            #gp-tester .gp-btns {
                display: flex;
                flex-wrap: wrap;
                gap: 3px;
                margin-bottom: 4px;
            }
            #gp-tester .gp-b {
                width: 16px;
                height: 16px;
                line-height: 16px;
                text-align: center;
                border: 1px solid #444;
                border-radius: 3px;
                color: #555;
                font-size: 9px;
            }
            #gp-tester .gp-b.on {
                background: #0f0;
                border-color: #0f0;
                color: #000;
                font-weight: bold;
            }
            #gp-tester .gp-axes {
                color: #aaa;
            }
        `;
        document.head.appendChild(style);
    }
}
