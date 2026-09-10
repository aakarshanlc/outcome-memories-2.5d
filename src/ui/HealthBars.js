import * as THREE from 'three';

export class HealthBars {
    constructor() {
        this.bars = new Map(); // player -> { els: [per-viewport bar | null, ...] }
        this.projector = new THREE.Vector3();

        const style = document.createElement('style');
        style.textContent = `
            .hp-bar {
                position: absolute;
                width: 52px;
                height: 14px;
                margin-left: -26px;
                background: rgba(0, 0, 0, 0.65);
                border: 1px solid #111;
                border-radius: 3px;
                overflow: hidden;
                z-index: 8000;
                pointer-events: none;
            }
            .hp-bar .hp-fill {
                height: 100%;
                background: #33ff66;
            }
            .hp-bar .hp-text {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                text-align: center;
                font: bold 10px Consolas, monospace;
                color: #fff;
                text-shadow: 1px 1px 2px #000;
                line-height: 13px;
            }
        `;
        document.head.appendChild(style);
    }

    createBar(container) {
        const root = document.createElement('div');
        root.className = 'hp-bar';
        const fill = document.createElement('div');
        fill.className = 'hp-fill';
        const text = document.createElement('div');
        text.className = 'hp-text';
        root.append(fill, text);
        container.appendChild(root);
        return { root, fill, text, cache: { left: null, top: null, hidden: null, width: null, color: null, textValue: null } };
    }

    // One bar per (viewport, alive survivor): projected through that viewport's own
    // camera, positioned inside its clipping container.
    update(players, viewports) {
        const views = viewports && viewports.entries ? viewports.entries : [];
        const seen = new Set();

        for (let vi = 0; vi < views.length; vi++) {
            const view = views[vi];
            const rect = view.rect;

            for (const p of players) {
                if (p.health <= 0 || !p.mesh.visible) continue;
                seen.add(p);

                let record = this.bars.get(p);
                if (!record) {
                    record = { els: [] };
                    this.bars.set(p, record);
                }
                let bar = record.els[vi];
                if (!bar) {
                    bar = this.createBar(view.bars);
                    record.els[vi] = bar;
                }

                this.projector.set(p.mesh.position.x, p.mesh.position.y - 6, p.mesh.position.z).project(view.camera);
                if (this.projector.z > 1) {
                    if (!bar.cache.hidden) { bar.root.style.display = 'none'; bar.cache.hidden = true; }
                    continue;
                }
                if (bar.cache.hidden) { bar.root.style.display = 'block'; bar.cache.hidden = false; }

                const left = Math.round((this.projector.x * 0.5 + 0.5) * rect.w);
                const top = Math.round((-this.projector.y * 0.5 + 0.5) * rect.h + 8);
                if (bar.cache.left !== left) { bar.root.style.left = left + 'px'; bar.cache.left = left; }
                if (bar.cache.top !== top) { bar.root.style.top = top + 'px'; bar.cache.top = top; }

                const pct = Math.max(0, Math.min(1, p.health / p.maxHealth));
                const width = Math.round(pct * 100);
                if (bar.cache.width !== width) { bar.fill.style.width = width + '%'; bar.cache.width = width; }
                const color = pct > 0.6 ? '#33ff66' : pct > 0.3 ? '#ffd700' : '#ff4444';
                if (bar.cache.color !== color) { bar.fill.style.background = color; bar.cache.color = color; }
                const text = `${Math.ceil(p.health)}/${p.maxHealth}`;
                if (bar.cache.textValue !== text) { bar.text.textContent = text; bar.cache.textValue = text; }
            }
        }

        for (const [p, record] of this.bars) {
            if (!seen.has(p)) {
                for (const bar of record.els) if (bar) bar.root.remove();
                this.bars.delete(p);
                continue;
            }
            for (let vi = views.length; vi < record.els.length; vi++) {
                if (record.els[vi]) { record.els[vi].root.remove(); record.els[vi] = null; }
            }
        }
    }

    clear() {
        for (const record of this.bars.values()) {
            for (const bar of record.els) if (bar) bar.root.remove();
        }
        this.bars.clear();
    }
}
