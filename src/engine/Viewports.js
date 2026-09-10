import * as THREE from 'three';

const FOLLOW_HEIGHT = 70;
const FOLLOW_DEPTH = 50;

// One camera per entity, scissor-rendered into a tiled layout on the shared canvas.
export class ViewportManager {
    constructor() {
        this.entries = [];
        this.layer = null;
        this._handleResize = () => this.relayout();
    }

    get active() {
        return this.entries.length > 0;
    }

    // targets: [{ entity, color, kind: 'survivor' | 'killer', label }] in tile order.
    build(targets) {
        this.destroy();
        if (!targets || targets.length === 0) return;

        this.layer = document.createElement('div');
        this.layer.id = 'viewport-layer';
        document.body.appendChild(this.layer);

        for (const t of targets) {
            const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
            camera.position.set(0, FOLLOW_HEIGHT, FOLLOW_DEPTH);
            camera.lookAt(0, 0, 0);

            const bars = document.createElement('div');
            bars.className = 'vp-bars';

            const frame = document.createElement('div');
            frame.className = 'vp-frame';
            frame.style.borderColor = toCssColor(t.color);

            const label = document.createElement('div');
            label.className = 'vp-label';
            label.textContent = t.label;
            label.style.background = toCssColor(t.color);
            label.style.color = viewportTextContrast(t.color) > 0.55 ? '#111' : '#fff';
            frame.appendChild(label);

            this.layer.appendChild(bars);
            this.layer.appendChild(frame);

            this.entries.push({
                entity: t.entity,
                kind: t.kind,
                color: t.color,
                camera,
                frame,
                bars,
                rect: { x: 0, y: 0, w: 0, h: 0 }
            });
        }

        window.addEventListener('resize', this._handleResize);
        this.relayout();
    }

    // Cols of 2, last row spans the full width: 2 -> halves, 3 -> 2 top + 1 wide bottom, 4 -> 2x2.
    relayout() {
        const n = this.entries.length;
        if (!n || !this.layer) return;
        const W = window.innerWidth;
        const H = window.innerHeight;

        const rows = n === 1 ? 1 : Math.ceil(n / 2);
        const rowH = H / rows;
        const rects = [];
        for (let r = 0; r < rows; r++) {
            const count = Math.min(2, n - r * 2);
            const cellW = W / count;
            for (let c = 0; c < count; c++) {
                rects.push({ x: c * cellW, y: r * rowH, w: cellW, h: rowH });
            }
        }

        this.entries.forEach((e, i) => {
            const rect = rects[i];
            e.rect = rect;

            const aspect = rect.w / rect.h;
            if (e.camera.aspect !== aspect) {
                e.camera.aspect = aspect;
                e.camera.updateProjectionMatrix();
            }

            const css = { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' };
            Object.assign(e.frame.style, css);
            Object.assign(e.bars.style, css);
        });
    }

    update() {
        for (const e of this.entries) {
            const target = this.resolveTarget(e);
            if (!target) continue;
            const pos = target.mesh.position;
            e.camera.position.set(pos.x, FOLLOW_HEIGHT, pos.z + FOLLOW_DEPTH);
            e.camera.lookAt(pos.x, 0, pos.z);
        }
    }

    isTrackable(entity) {
        return entity && entity.mesh && entity.mesh.visible && !entity.escaped;
    }

    // A dead/escaped survivor spectates the nearest living survivor, else the killer.
    resolveTarget(entry) {
        if (this.isTrackable(entry.entity)) return entry.entity;

        const from = entry.entity.mesh.position;
        let nearest = null;
        let nearestDist = Infinity;
        for (const other of this.entries) {
            if (other === entry || other.kind !== 'survivor' || !this.isTrackable(other.entity)) continue;
            const pos = other.entity.mesh.position;
            const d = (pos.x - from.x) * (pos.x - from.x) + (pos.z - from.z) * (pos.z - from.z);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = other.entity;
            }
        }
        if (nearest) return nearest;

        for (const other of this.entries) {
            if (other.kind === 'killer' && this.isTrackable(other.entity)) return other.entity;
        }
        return entry.entity;
    }

    destroy() {
        window.removeEventListener('resize', this._handleResize);
        if (this.layer) {
            this.layer.remove();
            this.layer = null;
        }
        this.entries = [];
    }
}

function toCssColor(color) {
    return '#' + (color & 0xffffff).toString(16).padStart(6, '0');
}

function viewportTextContrast(color) {
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
