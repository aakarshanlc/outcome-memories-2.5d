import { checkCircleBoxCollision } from './Collision.js';

export function buildNavGrid(obstacles, inflate = 3.5, cell = 4, min = -100, size = 50) {
    const blocked = new Uint8Array(size * size);
    for (let obs of obstacles) {
        const c0 = Math.max(0, Math.floor((obs.x - inflate - min) / cell));
        const c1 = Math.min(size - 1, Math.floor((obs.x + obs.w + inflate - min) / cell));
        const r0 = Math.max(0, Math.floor((obs.z - inflate - min) / cell));
        const r1 = Math.min(size - 1, Math.floor((obs.z + obs.d + inflate - min) / cell));
        for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
                if (blocked[r * size + c]) continue;
                const cx = min + (c + 0.5) * cell;
                const cz = min + (r + 0.5) * cell;
                if (checkCircleBoxCollision(cx, cz, inflate, obs.x, obs.z, obs.w, obs.d)) {
                    blocked[r * size + c] = 1;
                }
            }
        }
    }
    return { blocked, cell, min, size };
}

export function worldToCell(x, z, grid) {
    const c = Math.floor((x - grid.min) / grid.cell);
    const r = Math.floor((z - grid.min) / grid.cell);
    if (c < 0 || c >= grid.size || r < 0 || r >= grid.size) return null;
    return { r, c };
}

export function nearestFreeCell(cell, grid) {
    if (!cell) return null;
    if (!grid.blocked[cell.r * grid.size + cell.c]) return cell;
    for (let radius = 1; radius <= 6; radius++) {
        for (let dr = -radius; dr <= radius; dr++) {
            for (let dc = -radius; dc <= radius; dc++) {
                if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
                const r = cell.r + dr;
                const c = cell.c + dc;
                if (r < 0 || r >= grid.size || c < 0 || c >= grid.size) continue;
                if (!grid.blocked[r * grid.size + c]) return { r, c };
            }
        }
    }
    return null;
}

export function computePath(sx, sz, gx, gz, grid) {
    const start = nearestFreeCell(worldToCell(sx, sz, grid), grid);
    const goal = nearestFreeCell(worldToCell(gx, gz, grid), grid);
    if (!start || !goal) return null;

    const size = grid.size;
    const startIdx = start.r * size + start.c;
    const goalIdx = goal.r * size + goal.c;

    const prev = new Int32Array(size * size).fill(-1);
    const visited = new Uint8Array(size * size);
    const queue = [startIdx];
    visited[startIdx] = 1;
    let head = 0;
    while (head < queue.length) {
        const cur = queue[head++];
        if (cur === goalIdx) break;
        const r = Math.floor(cur / size);
        const c = cur % size;
        const neighbors = [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]];
        for (const [nc, nr] of neighbors) {
            if (nc < 0 || nc >= size || nr < 0 || nr >= size) continue;
            const ni = nr * size + nc;
            if (visited[ni] || grid.blocked[ni]) continue;
            visited[ni] = 1;
            prev[ni] = cur;
            queue.push(ni);
        }
    }

    if (!visited[goalIdx]) return null;

    const path = [];
    let cur = goalIdx;
    while (cur !== -1) {
        const r = Math.floor(cur / size);
        const c = cur % size;
        path.push({ x: grid.min + (c + 0.5) * grid.cell, z: grid.min + (r + 0.5) * grid.cell });
        cur = prev[cur];
    }
    path.reverse();
    return path;
}
