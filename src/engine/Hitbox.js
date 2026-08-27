import * as THREE from 'three';

export class Hitbox {
    constructor(gameManager, scene, x, z, radius, duration, owner, type, damage = 0, data = null, shape = 'sphere', width = 0, depth = 0) {
        this.scene = scene;
        this.x = x; this.z = z;
        this.radius = radius;
        this.width = width;
        this.depth = depth;
        this.duration = duration; this.maxDuration = duration;
        this.owner = owner; this.type = type; this.damage = damage; this.data = data;
        this.shape = shape;
        this.hasHit = new Set();

        let geo, mat;
        mat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, transparent: true, opacity: 0.5 });
        
        if (shape === 'box') {
            // FIX: Math.max prevents Three.js from crashing if width/depth is 0 or undefined
            const safeWidth = Math.max(1, width);
            const safeDepth = Math.max(1, depth);
            geo = new THREE.BoxGeometry(safeWidth, 10, safeDepth);
        } else {
            geo = new THREE.SphereGeometry(Math.max(1, radius), 8, 8);
        }
        
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(x, 5, z); 
        this.mesh.visible = gameManager.settings.showHitboxes;
        scene.add(this.mesh);
    }

    update(gameManager) {
        this.duration--;
        this.mesh.material.opacity = (this.duration / this.maxDuration) * 0.5;
        this.mesh.visible = gameManager.settings.showHitboxes;
        
        if (this.duration <= 0) {
            this.scene.remove(this.mesh);
            return false;
        }
        return true;
    }
}