import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MapVariables } from '../config/MapVariables.js';
import { checkCircleBoxCollision } from '../engine/Collision.js';

// One shared unit box geometry for every wall: walls just get scaled. Keeps
// geometry memory flat no matter how many blocks a map uses.
const wallGeo = new THREE.BoxGeometry(1, 1, 1);

// Shared jump-pad assets: pads are identical apart from placement.
const padGeo = new THREE.CylinderGeometry(3, 3, 1, 16);
const padMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, emissive: 0x2a2a2a });

const SUNK_Y = -5;   // mesh center when flushed into the floor (top at y=0)
const RAISED_Y = 5;  // mesh center when fully blocking (top at y=10)

export class MapManager {
    constructor(scene) {
        this.scene = scene;
        this.obstacles = [];
        this.jumpPads = [];
        this.crushers = [];
        this.config = null;
        this.mazeTimer = 0;
        this.navDirty = true;
        this.gates = [];
        // Obstacles the KILLER collides with: everything except sliding gates.
        // Gates are killer-only doors - the killer walks straight through them,
        // survivors still bounce off (and get shoved by) them.
        this.killerObstacles = [];
        // One merged mesh per wall colour (see buildStaticWalls).
        this.mergedWalls = [];
    }

    loadMap(mapName) {
        this.obstacles.forEach(obs => this.scene.remove(obs.mesh));
        this.jumpPads.forEach(pad => this.scene.remove(pad.mesh));
        for (const m of this.mergedWalls) {
            this.scene.remove(m);
            m.geometry.dispose();
            m.material.dispose();
        }
        this.mergedWalls = [];
        this.obstacles = [];
        this.jumpPads = [];
        this.crushers = [];
        this.navDirty = true;

        this.config = MapVariables[mapName] || MapVariables['Open Field'];

        const floorGeo = new THREE.PlaneGeometry(200, 200);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);
        this.floor = floor;

        this.addWall(-100, -100, 200, 5, true);
        this.addWall(-100, 95, 200, 5, true);
        this.addWall(-100, -100, 5, 200, true);
        this.addWall(95, -100, 5, 200, true);

        if (mapName === 'Open Field') {
            // Sparse low cover, still very much an open field.
            this.addWall(-72, -42, 30, 6);
            this.addWall(42, -42, 30, 6);
            this.addWall(-72, 36, 30, 6);
            this.addWall(42, 36, 30, 6);
            this.addWall(-9, -9, 18, 18);
            this.addWall(-42, 0, 8, 8);
            this.addWall(34, 0, 8, 8);
        }
        else if (mapName === 'Box Arena') {
            // Symmetric arena: big central block, four corner blocks, four gates.
            this.addWall(-15, -15, 30, 30);
            this.addWall(-76, -76, 18, 18);
            this.addWall(58, -76, 18, 18);
            this.addWall(-76, 58, 18, 18);
            this.addWall(58, 58, 18, 18);
            this.addWall(-11, -72, 22, 6);
            this.addWall(-11, 66, 22, 6);
            this.addWall(-72, -11, 6, 22);
            this.addWall(66, -11, 6, 22);
        }
        else if (mapName === 'Maze Mania') {
            this.generateMaze();
        }
        else if (mapName === 'Crusher Hall') {
            this.addWall(-7, -7, 14, 14);
            this.addWall(-84, -55, 14, 34);
            this.addWall(70, 21, 14, 34);
            this.spawnCrushers();
        }

        if (this.config.jumpPadCount > 0) {
            this.spawnJumpPads(this.config.jumpPadCount);
        }

        this.buildStaticWalls();

        this.gates = this.obstacles.filter(o => o.slide);
        this.killerObstacles = this.gates.length
            ? this.obstacles.filter(o => !o.slide)
            : this.obstacles;
    }

    // Collapse every static wall into one mesh per colour. The scene used to
    // hold a mesh AND a material per block (~75 materials for ~9k triangles,
    // submitted once per split-screen viewport), so the renderer was draw-call
    // bound: this is the single biggest render-side win. Crushers and sliding
    // gates keep their own mesh (they move / recolour). Obstacles also keep
    // their original mesh object - just detached from the scene - because
    // collision code reads obs.mesh.position.y for the wall top.
    buildStaticWalls() {
        const groups = new Map();
        for (const obs of this.obstacles) {
            if (obs.isCrusher || obs.slide || !obs.mesh) continue;
            const color = obs.mesh.material.color.getHex();
            let list = groups.get(color);
            if (!list) { list = []; groups.set(color, list); }
            list.push(obs);
        }

        for (const [color, list] of groups) {
            if (list.length < 2) continue;
            const parts = list.map(obs => {
                const g = wallGeo.clone();
                g.scale(obs.mesh.scale.x, obs.mesh.scale.y, obs.mesh.scale.z);
                g.translate(obs.mesh.position.x, obs.mesh.position.y, obs.mesh.position.z);
                return g;
            });
            const merged = mergeGeometries(parts, false);
            parts.forEach(p => p.dispose());
            if (!merged) continue;

            const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color }));
            mesh.castShadow = false;   // characters are the only casters now
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            this.mergedWalls.push(mesh);

            for (const obs of list) {
                this.scene.remove(obs.mesh);      // detached, position kept
                obs.mesh.material.dispose();
            }
        }
    }

    // ---- Crusher Hall gimmick ----
    // Crushers cycle: sink flush with the floor (walk-over shortcut) -> rise
    // again (crushing anyone standing inside) -> block -> warn -> sink.

    spawnCrushers() {
        const cfg = this.config.crusher;
        if (!cfg) return;
        const spots = [
            [-45, -35], [0, -35], [45, -35],
            [-45, 35], [0, 35], [45, 35]
        ];
        for (let i = 0; i < spots.length; i++) {
            const [cx, cz] = spots[i];
            const s = cfg.size;
            const x = cx - s / 2;
            const z = cz - s / 2;

            const mat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, emissive: 0x000000 });
            const mesh = new THREE.Mesh(wallGeo, mat);
            mesh.scale.set(s, 10, s);
            mesh.position.set(cx, SUNK_Y, cz);
            mesh.castShadow = false; // map geometry never casts - characters do
            mesh.receiveShadow = true;
            this.scene.add(mesh);

            const obs = {
                x, z, w: s, d: s, mesh,
                isBorder: false, isMaze: false,
                isCrusher: true, sunk: true
            };
            this.obstacles.push(obs);

            const sunkTicks = Math.max(30, cfg.period - cfg.riseTicks - cfg.raisedTicks - cfg.warnTicks - cfg.sinkTicks);
            this.crushers.push({
                obs,
                state: 'sunk',
                // Stagger the cycle so the hall never slams all at once.
                timer: sunkTicks - Math.floor(i * sunkTicks / spots.length),
                sunkTicks
            });
        }
        this.navDirty = true;
    }

    updateCrushers(players, audio) {
        const cfg = this.config.crusher;
        if (!cfg || this.crushers.length === 0) return;

        for (const c of this.crushers) {
            c.timer--;
            const mesh = c.obs.mesh;
            const mat = mesh.material;

            if (c.state === 'sunk') {
                if (c.timer <= 0) {
                    c.state = 'rising';
                    c.timer = cfg.riseTicks;
                    this.crusherSlam(c, cfg, players, audio);
                }
            }
            else if (c.state === 'rising') {
                const t = 1 - Math.max(0, c.timer) / cfg.riseTicks;
                mesh.position.y = SUNK_Y + (RAISED_Y - SUNK_Y) * t;
                if (c.timer <= 0) {
                    mesh.position.y = RAISED_Y;
                    c.state = 'raised';
                    c.timer = cfg.raisedTicks;
                    c.obs.sunk = false;
                    this.navDirty = true;
                }
            }
            else if (c.state === 'raised') {
                if (c.timer <= 0) {
                    c.state = 'warn';
                    c.timer = cfg.warnTicks;
                }
            }
            else if (c.state === 'warn') {
                // Flash red as a telegraph.
                mat.emissive.setHex((c.timer >> 2) & 1 ? 0x881111 : 0x220000);
                if (c.timer <= 0) {
                    c.state = 'sinking';
                    c.timer = cfg.sinkTicks;
                }
            }
            else if (c.state === 'sinking') {
                const t = 1 - Math.max(0, c.timer) / cfg.sinkTicks;
                mesh.position.y = RAISED_Y + (SUNK_Y - RAISED_Y) * t;
                mat.emissive.setHex(0x000000);
                if (c.timer <= 0) {
                    mesh.position.y = SUNK_Y;
                    c.state = 'sunk';
                    c.timer = c.sunkTicks;
                    c.obs.sunk = true;
                    this.navDirty = true;
                }
            }
        }
    }

    // The instant a crusher starts rising: crush + launch anyone caught inside.
    crusherSlam(c, cfg, players, audio) {
        const obs = c.obs;
        let slammed = false;
        if (players) {
            for (const p of players) {
                if (p.health <= 0 || p.escaped) continue;
                const px = p.mesh.position.x;
                const pz = p.mesh.position.z;
                if (px < obs.x || px > obs.x + obs.w || pz < obs.z || pz > obs.z + obs.d) continue;
                if (p.mesh.position.y > 10) continue; // already airborne above it
                p.takeDamage(cfg.damage, null);
                if (p.health > 0) {
                    p.vertVel = cfg.knockUp;
                    slammed = true;
                }
            }
        }
        if (audio && this.config.sfx?.slam && (slammed || players?.some?.(p => p.health > 0 &&
            Math.abs(p.mesh.position.x - (obs.x + obs.w / 2)) < 60 &&
            Math.abs(p.mesh.position.z - (obs.z + obs.d / 2)) < 60))) {
            audio.playSfx('Map', this.config.sfx.slam);
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
            obs.mesh.material.color.setHex(0x7d838c); // plain steel door, not a hazard colour
        }
    }

    update(players, killers, audio) {
        if (this.crushers.length > 0) this.updateCrushers(players, audio);

        const gates = this.gates;
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
            // Note: never push killers - gates are killer-only doors, so the
            // killer's own collision list (killerObstacles) skips them entirely.

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
        const innerWalls = this.obstacles.filter(w => !w.isBorder && !w.isCrusher);
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
        const mesh = new THREE.Mesh(padGeo, padMat);
        mesh.position.set(x, 0.5, z);
        mesh.castShadow = false; // map prop - keep the shadow pass to characters
        this.scene.add(mesh);

        this.jumpPads.push({ x, z, size: 3, mesh });
    }

    addWall(x, z, w, d, isBorder = false, color = 0x4d4d4d, isMaze = false) {
        const mat = new THREE.MeshStandardMaterial({ color });
        const mesh = new THREE.Mesh(wallGeo, mat);
        mesh.scale.set(w, 10, d);
        mesh.position.set(x + w/2, 5, z + d/2);
        mesh.castShadow = false; // walls receive shadows but don't cast them
        mesh.receiveShadow = true;
        this.scene.add(mesh);

        this.obstacles.push({
            x, z, w, d, mesh, isBorder,
            isMaze
        });
    }
}
