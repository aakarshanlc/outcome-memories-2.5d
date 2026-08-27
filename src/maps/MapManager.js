import * as THREE from 'three';
import { MapVariables } from '../config/MapVariables.js';

export class MapManager {
    constructor(scene) {
        this.scene = scene;
        this.obstacles = [];
        this.jumpPads = [];
        this.config = null;
    }

    loadMap(mapName) {
        this.obstacles.forEach(obs => this.scene.remove(obs.mesh));
        this.jumpPads.forEach(pad => this.scene.remove(pad.mesh));
        this.obstacles = [];
        this.jumpPads = [];
        
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
        const pieces = [
            "001001111", "100100111", "111010010", "010010111", 
            "010111010", "101101111", "111101101", "000111000", "010010010"
        ];

        for (let i = pieces.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
        }

        const cellSize = 20;   
        const blockSize = 16;  
        const gridSize = 9;    
        const offset = -(gridSize * cellSize) / 2 + cellSize / 2;

        for (let mr = 0; mr < 3; mr++) {
            for (let mc = 0; mc < 3; mc++) {
                const pieceIndex = mr * 3 + mc;
                const piece = pieces[pieceIndex];

                for (let cr = 0; cr < 3; cr++) {
                    for (let cc = 0; cc < 3; cc++) {
                        const charIndex = cr * 3 + cc;
                        if (piece[charIndex] === '1') {
                            const r = mr * 3 + cr;
                            const c = mc * 3 + cc;
                            
                            this.addWall(
                                c * cellSize + offset, 
                                r * cellSize + offset, 
                                blockSize, 
                                blockSize, 
                                false, 
                                0x555555,
                                true 
                            );
                        }
                    }
                }
            }
        }
    }

    update(players, killers) {        
        for (let obs of this.obstacles) {
            if (!obs.isMaze) continue;

            if (obs.state === 'solid') {
                let minDist = Infinity;
                for (let p of players) {
                    if (p.health <= 0) continue;
                    const d = Math.hypot(p.mesh.position.x - (obs.x + obs.w/2), p.mesh.position.z - (obs.z + obs.d/2));
                    if (d < minDist) minDist = d;
                }

                if (minDist < 15) {
                    obs.state = 'lowering';
                    obs.timer = 120; 
                }
            } 
            else if (obs.state === 'lowering') {
                obs.timer--;
                const progress = 1 - (obs.timer / 120);
                obs.mesh.position.y = 5 - (10 * progress);
                
                if (obs.timer <= 0) {
                    obs.state = 'low';
                    obs.timer = 60; 
                    obs.mesh.position.y = -5;
                }
            } 
            else if (obs.state === 'low') {
                obs.timer--;
                if (obs.timer <= 0) {
                    obs.state = 'rising';
                    obs.timer = 120; 
                }
            } 
            else if (obs.state === 'rising') {
                obs.timer--;
                const progress = 1 - (obs.timer / 120);
                obs.mesh.position.y = -5 + (10 * progress);
                
                if (obs.timer <= 0) {
                    obs.state = 'risen'; // NEW STATE: Cooldown begins
                    obs.mesh.position.y = 5;
                    obs.timer = 3600; // 60 seconds at 60fps
                }
            }
            else if (obs.state === 'risen') {
                obs.timer--;
                // Block stays solid and at y=5, but cannot be triggered to lower
                if (obs.timer <= 0) {
                    obs.state = 'solid'; // Cooldown over, can be triggered again
                }
            }
        }
    }

    spawnJumpPads(count) {
        const innerWalls = this.obstacles.filter(w => !w.isBorder);
        for (let i = 0; i < count; i++) {
            if (innerWalls.length === 0) break;
            const wall = innerWalls[Math.floor(Math.random() * innerWalls.length)];
            
            const side = Math.floor(Math.random() * 4);
            let px, pz;
            if (side === 0) { px = wall.x - 5; pz = wall.z + wall.d/2; } 
            else if (side === 1) { px = wall.x + wall.w + 5; pz = wall.z + wall.d/2; } 
            else if (side === 2) { px = wall.x + wall.w/2; pz = wall.z - 5; } 
            else { px = wall.x + wall.w/2; pz = wall.z + wall.d + 5; } 
            
            px = Math.max(-90, Math.min(90, px));
            pz = Math.max(-90, Math.min(90, pz));
            
            this.addJumpPad(px, pz);
        }
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
            isMaze, 
            state: 'solid', 
            timer: 0
        });
    }
}