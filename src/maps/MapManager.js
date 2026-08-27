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

        // Boundary walls (isBorder = true so they don't get jump pads)
        this.addWall(-100, -100, 200, 5, true); 
        this.addWall(-100, 95, 200, 5, true);  
        this.addWall(-100, -100, 5, 200, true); 
        this.addWall(95, -100, 5, 200, true);  

        if (mapName === 'Box Arena') {
            this.addWall(0, 0, 20, 20);
            this.addWall(40, 40, 20, 20);
            this.addWall(-40, -40, 20, 20);
        }

        // Spawn Jump Pads
        if (this.config.jumpPadCount > 0) {
            this.spawnJumpPads(this.config.jumpPadCount);
        }
    }

    spawnJumpPads(count) {
        const innerWalls = this.obstacles.filter(w => !w.isBorder);
        for (let i = 0; i < count; i++) {
            if (innerWalls.length === 0) break;
            const wall = innerWalls[Math.floor(Math.random() * innerWalls.length)];
            
            // Pick a random side of the wall to place the pad
            const side = Math.floor(Math.random() * 4);
            let px, pz;
            if (side === 0) { px = wall.x - 5; pz = wall.z + wall.d/2; } // Left
            else if (side === 1) { px = wall.x + wall.w + 5; pz = wall.z + wall.d/2; } // Right
            else if (side === 2) { px = wall.x + wall.w/2; pz = wall.z - 5; } // Top
            else { px = wall.x + wall.w/2; pz = wall.z + wall.d + 5; } // Bottom
            
            // Keep within bounds
            px = Math.max(-90, Math.min(90, px));
            pz = Math.max(-90, Math.min(90, pz));
            
            this.addJumpPad(px, pz);
        }
    }

    addJumpPad(x, z) {
        const geo = new THREE.CylinderGeometry(3, 3, 1, 16);
        const mat = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x004400 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, 0.5, z);
        mesh.castShadow = true;
        this.scene.add(mesh);
        
        this.jumpPads.push({ x, z, size: 3, mesh });
    }

    addWall(x, z, w, d, isBorder = false) {
        const geo = new THREE.BoxGeometry(w, 10, d); 
        const mat = new THREE.MeshStandardMaterial({ color: 0x555555 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x + w/2, 5, z + d/2); 
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        
        this.obstacles.push({ x, z, w, d, mesh, isBorder });
    }
}