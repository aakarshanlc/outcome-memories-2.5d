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
        this.addToggle('Freeze Timers',
            () => gm.dev.freezeTimers,
            v => gm.dev.freezeTimers = v);
        this.addToggle('Show FPS',
            () => gm.dev.showFps,
            v => { gm.dev.showFps = v; gm.updateFpsOverlay(); });
        this.addInput('FPS Bypass (0 = Lock 60)',
            () => gm.dev.renderFps,
            v => {
                gm.dev.renderFps = Math.max(0, Math.min(240, Math.round(v)));
                localStorage.setItem('om_25d_fps', String(gm.dev.renderFps));
                this.render();
            },
            { min: 0, max: 240, step: 1 });
        this.addToggle('Show AI Path',
            () => gm.dev.showNavPath,
            v => gm.dev.showNavPath = v);
        this.addToggle('Survivor AI',
            () => gm.dev.survivorAI,
            v => gm.dev.survivorAI = v);
        this.addInput('Stun Killer (sec)',
            () => this.cfg.stunSec,
            v => this.cfg.stunSec = v,
            { min: 0.5, max: 60, step: 0.5 });
        this.addActionSelect('Instant Actions', [
            { label: 'Skip Phase', run: () => gm.devSkipPhase() },
            { label: 'Teleport Survivors To Ring', run: () => gm.devTeleportToRing() },
            { label: 'Reset All Cooldowns', run: () => gm.devResetCooldowns() },
            { label: 'Stun Killer', run: () => {
                gm.killers.forEach(k => k.stun(Math.round(this.cfg.stunSec * 60)));
            } }
        ]);

        this.addHeader('GAMEPAD');
        this.addToggle('Gamepad Tester',
            () => !!this.gpTimer,
            v => v ? this.openGpTester() : this.closeGpTester());
        this.addButton('Rumble All Pads', () => this.rumblePads());

        this.addHeader('SURVIVOR EFFECTS');
        this.addInput('Duration (sec)',
            () => this.cfg.effectSec,
            v => this.cfg.effectSec = v,
            { min: 1, max: 60, step: 1 });
        this.addActionSelect('Apply Effect', [
            { label: 'Bleed', run: () => living(p => p.bleedTimer = Math.round(this.cfg.effectSec * 60)) },
            { label: 'Inverted Controls', run: () => living(p => p.invertedControlsTimer = Math.round(this.cfg.effectSec * 60)) },
            { label: 'Speed Boost', run: () => living(p => p.hitSpeedBoost = Math.round(this.cfg.effectSec * 60)) }
        ]);

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
        this.addActionSelect('Game Actions', [
            { label: '+60s Round Timer', run: () => {
                if (typeof gm.gameTimer === 'number') gm.gameTimer += 3600;
            } },
            { label: 'Heal All Survivors', run: () => {
                gm.players.forEach(p => { p.health = p.maxHealth; p.mesh.visible = true; });
            } },
            { label: 'Kill All Survivors', run: () => {
                gm.players.forEach(p => { p.health = 0; p.mesh.visible = false; });
            } }
        ]);
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
    addActionSelect(label, actions) {
        this.entries.push({ type: 'actionselect', label, actions });
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
                } else if (row.type === 'actionselect') {
                    const opts = row.actions.map((a, ai) =>
                        `<option value="${ai}">${a.label}</option>`).join('');
                    html += `
                        <label class="dev-row dev-select-row">
                            <span>${row.label}</span>
                            <select data-dev-idx="${row.idx}">
                                <option value="" selected>—</option>${opts}
                            </select>
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
                input.onkeydown = e => { if (e.key === 'Enter') input.blur(); };
            } else if (entry.type === 'select') {
                input.onchange = () => entry.set(input.value);
            } else if (entry.type === 'actionselect') {
                input.onchange = () => {
                    const action = entry.actions[Number(input.value)];
                    if (action) action.run();
                    input.value = '';
                };
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
            let html = '<div class="gp-title">GAMEPADS</div>';
            let any = false;
            const pads = navigator.getGamepads();
            for (let i = 0; i < pads.length; i++) {
                const pad = pads[i];
                if (!pad || !pad.connected) continue;
                any = true;
                const btns = pad.buttons.map((b, bi) =>
                    `<span class="gp-b ${b.pressed ? 'on' : ''}">${bi}</span>`).join('');
                const axes = pad.axes.map(a => a.toFixed(2)).join(', ');
                html += `
                    <div class="gp-pad">
                        <div class="gp-slot">GP${i + 1} <span class="gp-id">${pad.id.slice(0, 24)}</span></div>
                        <div class="gp-btns">${btns}</div>
                        <div class="gp-axes">axes: ${axes}</div>
                    </div>`;
            }
            if (!any) html += '<div class="gp-empty">no pads connected</div>';
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
                width: 348px;
                max-height: 88vh;
                overflow-y: auto;
                background:
                    radial-gradient(400px 200px at 10% 0%, rgba(255, 47, 71, 0.1), transparent 60%),
                    linear-gradient(180deg, #12121a, #07070a);
                border: 1px solid rgba(255, 255, 255, 0.14);
                border-radius: 14px;
                padding: 16px 16px 18px;
                z-index: 10000;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                color: #f3f2f6;
                pointer-events: auto;
                user-select: none;
                box-shadow: 0 30px 90px rgba(0, 0, 0, 0.8);
            }

            #dev-panel-title {
                font-family: var(--mono, Consolas, monospace);
                font-weight: 700;
                font-size: 12px;
                text-align: center;
                letter-spacing: 6px;
                text-transform: uppercase;
                color: #fff;
                margin-bottom: 3px;
            }

            #dev-panel-subtitle {
                text-align: center;
                font-family: var(--mono, Consolas, monospace);
                font-size: 9px;
                letter-spacing: 2px;
                text-transform: uppercase;
                color: #605e6c;
                margin-bottom: 12px;
                padding-bottom: 12px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.075);
            }

            #dev-panel .dev-section {
                border-bottom: 1px solid rgba(255, 255, 255, 0.075);
                padding: 12px 0 14px;
            }
            #dev-panel .dev-section:last-child {
                border-bottom: none;
                padding-bottom: 2px;
            }

            #dev-panel .dev-header {
                font-family: var(--mono, Consolas, monospace);
                font-size: 9px;
                font-weight: 700;
                letter-spacing: 2.6px;
                color: #ff2f47;
                text-transform: uppercase;
                margin-bottom: 9px;
            }

            #dev-panel .dev-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                width: 100%;
                box-sizing: border-box;
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.09);
                border-radius: 7px;
                color: #e8e7ee;
                text-align: left;
                padding: 7px 10px;
                margin: 5px 0;
                font-size: 12px;
                font-family: inherit;
                cursor: pointer;
                transition: border-color 0.15s, background 0.15s;
            }
            #dev-panel .dev-row:hover {
                border-color: rgba(255, 255, 255, 0.2);
                background: rgba(255, 255, 255, 0.05);
            }

            #dev-panel .dev-toggle-row span,
            #dev-panel .dev-input-row span {
                text-align: left;
            }

            #dev-panel .dev-btn {
                justify-content: center;
                text-transform: uppercase;
                letter-spacing: 1.4px;
                font-size: 10px;
                font-weight: 700;
                font-family: var(--mono, Consolas, monospace);
            }
            #dev-panel .dev-btn:hover {
                background: rgba(255, 47, 71, 0.1);
                border-color: rgba(255, 47, 71, 0.5);
                color: #fff;
            }

            #dev-panel input[type="checkbox"] {
                -webkit-appearance: none;
                appearance: none;
                position: relative;
                width: 34px;
                height: 19px;
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.09);
                border: 1px solid rgba(255, 255, 255, 0.16);
                cursor: pointer;
                flex-shrink: 0;
                margin: 0;
                transition: background 0.16s, border-color 0.16s;
            }
            #dev-panel input[type="checkbox"]::after {
                content: '';
                position: absolute;
                top: 2px;
                left: 2px;
                width: 13px;
                height: 13px;
                border-radius: 50%;
                background: #a9a8b4;
                transition: transform 0.16s, background 0.16s;
            }
            #dev-panel input[type="checkbox"]:checked {
                background: rgba(255, 47, 71, 0.85);
                border-color: rgba(255, 130, 142, 0.7);
                box-shadow: 0 0 14px rgba(255, 47, 71, 0.35);
            }
            #dev-panel input[type="checkbox"]:checked::after {
                transform: translateX(15px);
                background: #fff;
            }

            #dev-panel .dev-input-row input {
                width: 66px;
                background: rgba(6, 6, 10, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.14);
                border-radius: 6px;
                color: #fff;
                font-family: var(--mono, Consolas, monospace);
                font-size: 11px;
                padding: 5px 7px;
                text-align: right;
                flex-shrink: 0;
            }
            #dev-panel .dev-input-row input:focus {
                outline: none;
                border-color: rgba(255, 47, 71, 0.7);
            }

            #dev-panel .dev-select-row select {
                width: 140px;
                background: rgba(6, 6, 10, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.14);
                border-radius: 6px;
                color: #eee;
                font-family: inherit;
                font-size: 11px;
                padding: 5px 7px;
                flex-shrink: 0;
            }
            #dev-panel .dev-select-row select:focus {
                outline: none;
                border-color: rgba(255, 47, 71, 0.7);
            }

            #dev-panel::-webkit-scrollbar { width: 8px; }
            #dev-panel::-webkit-scrollbar-track { background: transparent; }
            #dev-panel::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 999px; }

            #gp-tester {
                position: fixed;
                top: 12px;
                right: 12px;
                width: 244px;
                max-height: 70vh;
                overflow-y: auto;
                background: rgba(8, 8, 12, 0.95);
                border: 1px solid rgba(255, 255, 255, 0.14);
                border-radius: 12px;
                padding: 12px 14px;
                z-index: 10001;
                font-family: var(--mono, Consolas, monospace);
                font-size: 10px;
                color: #f3f2f6;
                pointer-events: none;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
            }
            #gp-tester .gp-title {
                text-align: center;
                font-weight: 700;
                letter-spacing: 3px;
                margin-bottom: 8px;
                color: #fff;
            }
            #gp-tester .gp-empty {
                text-align: center;
                color: #605e6c;
            }
            #gp-tester .gp-pad {
                border-top: 1px solid rgba(255, 255, 255, 0.085);
                padding: 7px 0;
            }
            #gp-tester .gp-slot {
                color: #4be08d;
                margin-bottom: 5px;
                letter-spacing: 0.6px;
            }
            #gp-tester .gp-id {
                color: #605e6c;
                font-size: 9px;
            }
            #gp-tester .gp-btns {
                display: flex;
                flex-wrap: wrap;
                gap: 3px;
                margin-bottom: 4px;
            }
            #gp-tester .gp-b {
                width: 17px;
                height: 17px;
                line-height: 17px;
                text-align: center;
                border: 1px solid rgba(255, 255, 255, 0.14);
                border-radius: 4px;
                color: #605e6c;
                font-size: 9px;
            }
            #gp-tester .gp-b.on {
                background: #ff2f47;
                border-color: #ff2f47;
                color: #fff;
                font-weight: 700;
                box-shadow: 0 0 10px rgba(255, 47, 71, 0.6);
            }
            #gp-tester .gp-axes {
                color: #9d9ba7;
            }
        `;
        document.head.appendChild(style);
    }
}
