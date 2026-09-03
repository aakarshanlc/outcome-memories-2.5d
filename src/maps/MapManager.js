import * as THREE from 'three';
import { MapVariables } from '../config/MapVariables.js';
import { checkCircleBoxCollision } from '../engine/Collision.js';

export class MapManager {
    constructor(scene) {
        this.scene = scene;
        this.obstacles = [];
        this.jumpPads = [];
        this.config = null;
        this.mazeTimer = 0;
        this.navDirty = true;
    }

    loadMap(mapName) {
        this.obstacles.forEach(obs => this.scene.remove(obs.mesh));
        this.jumpPads.forEach(pad => this.scene.remove(pad.mesh));
        this.obstacles = [];
        this.jumpPads = [];
        this.navDirty = true;

        this.config = MapVariables[mapName] || MapVariables['Open Field'];

        const floorGeo = new THREE.PlaneGeometry(200, 200);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);

        this.addWall(-100, -100, 200, 5, true);
        this.addWall(-100, 95, 200, 5, true);
        this.addWall(-100, -100, 5, 200, true);
        this.addWall(95, -100, 5, 200, true);

        if (mapName === 'Box Arena') {
            this.addWall(0, 0, 20, 20);
            this.addWall(40, 40, 20, 20);
            this.addWall(-40, -40, 20, 20);
        }
        else if (mapName === 'Maze Mania') {
            this.generateMaze();
        }

        if (this.config.jumpPadCount > 0) {
            this.spawnJumpPads(this.config.jumpPadCount);
        }
    }

    generateMaze() {
        const gridSize = 8;
        const cellSize = 24;
        const thickness = 3;
        const span = gridSize * cellSize;
        const offset = -span / 2;

        const V = Array.from({ length: gridSize }, () => new Array(gridSize - 1).fill(true));
        const H = Array.from({ length: gridSize - 1 }, () => new Array(gridSize).fill(true));

        const removeEdge = (c1, r1, c2, r2) => {
            if (c1 === c2) H[Math.min(r1, r2)][c1] = false;
            else V[r1][Math.min(c1, c2)] = false;
        };

        const visited = Array.from({ length: gridSize }, () => new Array(gridSize).fill(false));
        const stack = [[0, 0]];
        visited[0][0] = true;
        while (stack.length > 0) {
            const [c, r] = stack[stack.length - 1];
            const neighbors = [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]]
                .filter(([nc, nr]) => nc >= 0 && nc < gridSize && nr >= 0 && nr < gridSize && !visited[nr][nc]);
            if (neighbors.length === 0) { stack.pop(); continue; }
            const [nc, nr] = neighbors[Math.floor(Math.random() * neighbors.length)];
            removeEdge(c, r, nc, nr);
            visited[nr][nc] = true;
            stack.push([nc, nr]);
        }

        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                const open = [];
                const closed = [];
                if (c > 0) (V[r][c - 1] ? closed : open).push(['v', r, c - 1]);
                if (c < gridSize - 1) (V[r][c] ? closed : open).push(['v', r, c]);
                if (r > 0) (H[r - 1][c] ? closed : open).push(['h', r - 1, c]);
                if (r < gridSize - 1) (H[r][c] ? closed : open).push(['h', r, c]);
                if (open.length <= 1 && closed.length > 0 && Math.random() < 0.75) {
                    const [kind, er, ec] = closed[Math.floor(Math.random() * closed.length)];
                    if (kind === 'v') V[er][ec] = false; else H[er][ec] = false;
                }
            }
        }

        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize - 1; c++) {
                if (V[r][c]) {
                    this.addWall(offset + (c + 1) * cellSize - thickness / 2, offset + r * cellSize, thickness, cellSize, false, 0x555555, true);
                }
            }
        }
        for (let r = 0; r < gridSize - 1; r++) {
            for (let c = 0; c < gridSize; c++) {
                if (H[r][c]) {
                    this.addWall(offset + c * cellSize, offset + (r + 1) * cellSize - thickness / 2, cellSize, thickness, false, 0x555555, true);
                }
            }
        }

        const gates = this.obstacles.filter(o => o.isMaze);
        for (let i = gates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [gates[i], gates[j]] = [gates[j], gates[i]];
        }
        const gateCount = Math.min(6, gates.length);
        for (let i = 0; i < gateCount; i++) {
            const obs = gates[i];
            const vertical = obs.w < obs.d;
            obs.slide = {
                axis: vertical ? 'x' : 'z',
                center: vertical ? obs.x + obs.w / 2 : obs.z + obs.d / 2,
                amp: cellSize / 2,
                speed: Math.PI / 180,
                phase: Math.random() * Math.PI * 2
            };
            obs.mesh.material.color.setHex(0xcc7722);
        }
    }

    update(players, killers, audio) {
        const gates = this.obstacles.filter(o => o.slide);
        if (gates.length === 0) return;

        this.mazeTimer++;

        for (let obs of gates) {
            const s = obs.slide;
            const t = Math.sin(this.mazeTimer * s.speed + s.phase);
            const pos = s.center + t * s.amp;

            let delta;
            if (s.axis === 'x') {
                delta = pos - (obs.x + obs.w / 2);
                obs.x += delta;
                obs.mesh.position.x += delta;
            } else {
                delta = pos - (obs.z + obs.d / 2);
                obs.z += delta;
                obs.mesh.position.z += delta;
            }
            if (delta !== 0) this.navDirty = true;

            this.pushBodies(obs, delta, players);
            this.pushBodies(obs, delta, killers);

            if (Math.abs(t) > 0.995) {
                if (!s.atExtreme) {
                    s.atExtreme = true;
                    if (audio && this.config.sfx?.blockSink) {
                        const near = players.some(p => p.health > 0 &&
                            Math.hypot(p.mesh.position.x - obs.x, p.mesh.position.z - obs.z) < 60);
                        if (near) audio.playSfx('Map', this.config.sfx.blockSink);
                    }
                }
            } else if (Math.abs(t) < 0.9) {
                s.atExtreme = false;
            }
        }
    }

    pushBodies(obs, delta, bodies) {
        if (!bodies) return;
        for (let b of bodies) {
            if (b.health <= 0) continue;
            if (!checkCircleBoxCollision(b.mesh.position.x, b.mesh.position.z, b.size, obs.x, obs.z, obs.w, obs.d)) continue;

            if (obs.slide.axis === 'x') b.mesh.position.x += delta;
            else b.mesh.position.z += delta;

            if (checkCircleBoxCollision(b.mesh.position.x, b.mesh.position.z, b.size, obs.x, obs.z, obs.w, obs.d)) {
                const cx = Math.max(obs.x, Math.min(b.mesh.position.x, obs.x + obs.w));
                const cz = Math.max(obs.z, Math.min(b.mesh.position.z, obs.z + obs.d));
                const ddx = b.mesh.position.x - cx;
                const ddz = b.mesh.position.z - cz;
                const dist = Math.hypot(ddx, ddz);
                if (dist > 0.001) {
                    b.mesh.position.x = cx + (ddx / dist) * (b.size + 0.1);
                    b.mesh.position.z = cz + (ddz / dist) * (b.size + 0.1);
                } else if (obs.slide.axis === 'x') {
                    const toLeft = b.mesh.position.x - obs.x;
                    const toRight = obs.x + obs.w - b.mesh.position.x;
                    b.mesh.position.x = toLeft < toRight ? obs.x - b.size - 0.1 : obs.x + obs.w + b.size + 0.1;
                } else {
                    const toTop = b.mesh.position.z - obs.z;
                    const toBottom = obs.z + obs.d - b.mesh.position.z;
                    b.mesh.position.z = toTop < toBottom ? obs.z - b.size - 0.1 : obs.z + obs.d + b.size + 0.1;
                }
            }
        }
    }

    spawnJumpPads(count) {
        const innerWalls = this.obstacles.filter(w => !w.isBorder);
        for (let i = 0; i < count; i++) {
            for (let attempt = 0; attempt < 60; attempt++) {
                let px, pz;
                if (innerWalls.length === 0) {
                    px = Math.random() * 160 - 80;
                    pz = Math.random() * 160 - 80;
                } else {
                    const wall = innerWalls[Math.floor(Math.random() * innerWalls.length)];
                    const side = Math.floor(Math.random() * 4);
                    if (side === 0) { px = wall.x - 5; pz = wall.z + wall.d/2; }
                    else if (side === 1) { px = wall.x + wall.w + 5; pz = wall.z + wall.d/2; }
                    else if (side === 2) { px = wall.x + wall.w/2; pz = wall.z - 5; }
                    else { px = wall.x + wall.w/2; pz = wall.z + wall.d + 5; }
                }

                px = Math.max(-90, Math.min(90, px));
                pz = Math.max(-90, Math.min(90, pz));

                if (this.isClearForPad(px, pz)) {
                    this.addJumpPad(px, pz);
                    break;
                }
            }
        }
    }

    isClearForPad(x, z) {
        const padSize = 3;
        for (let obs of this.obstacles) {
            let ox = obs.x, oz = obs.z, ow = obs.w, od = obs.d;
            if (obs.slide) {
                const grow = obs.slide.amp + padSize;
                if (obs.slide.axis === 'x') { ox -= grow; ow += grow * 2; }
                else { oz -= grow; od += grow * 2; }
            }
            if (checkCircleBoxCollision(x, z, padSize, ox, oz, ow, od)) return false;
        }
        for (let pad of this.jumpPads) {
            if (Math.hypot(pad.x - x, pad.z - z) < padSize + pad.size + 9) return false;
        }
        return true;
    }

    addJumpPad(x, z) {
        const geo = new THREE.CylinderGeometry(3, 3, 1, 16);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x550000 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, 0.5, z);
        mesh.castShadow = true;
        this.scene.add(mesh);

        this.jumpPads.push({ x, z, size: 3, mesh });
    }

    addWall(x, z, w, d, isBorder = false, color = 0x555555, isMaze = false) {
        const geo = new THREE.BoxGeometry(w, 10, d);
        const mat = new THREE.MeshStandardMaterial({ color: color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x + w/2, 5, z + d/2);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);

        this.obstacles.push({
            x, z, w, d, mesh, isBorder,
            isMaze
        });
    }
}
