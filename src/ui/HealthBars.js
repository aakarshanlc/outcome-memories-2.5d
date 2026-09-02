import * as THREE from 'three';

export class HealthBars {
    constructor() {
        this.bars = new Map();
        this.projector = new THREE.Vector3();

        const style = document.createElement('style');
        style.textContent = `
            .hp-bar {
                position: fixed;
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

    createBar() {
        const root = document.createElement('div');
        root.className = 'hp-bar';
        const fill = document.createElement('div');
        fill.className = 'hp-fill';
        const text = document.createElement('div');
        text.className = 'hp-text';
        root.append(fill, text);
        document.body.appendChild(root);
        return { root, fill, text };
    }

    update(players, camera) {
        const seen = new Set();
        for (const p of players) {
            if (p.health <= 0 || !p.mesh.visible) continue;
            seen.add(p);

            let bar = this.bars.get(p);
            if (!bar) {
                bar = this.createBar();
                this.bars.set(p, bar);
            }

            this.projector.set(p.mesh.position.x, p.mesh.position.y - 6, p.mesh.position.z).project(camera);
            if (this.projector.z > 1) {
                bar.root.style.display = 'none';
                continue;
            }
            bar.root.style.display = 'block';
            bar.root.style.left = ((this.projector.x * 0.5 + 0.5) * window.innerWidth) + 'px';
            bar.root.style.top = ((-this.projector.y * 0.5 + 0.5) * window.innerHeight + 8) + 'px';

            const pct = Math.max(0, Math.min(1, p.health / p.maxHealth));
            bar.fill.style.width = (pct * 100) + '%';
            bar.fill.style.background = pct > 0.6 ? '#33ff66' : pct > 0.3 ? '#ffd700' : '#ff4444';
            bar.text.textContent = `${Math.ceil(p.health)}/${p.maxHealth}`;
        }

        for (const [p, bar] of this.bars) {
            if (!seen.has(p)) {
                bar.root.remove();
                this.bars.delete(p);
            }
        }
    }

    clear() {
        for (const bar of this.bars.values()) bar.root.remove();
        this.bars.clear();
    }
}
