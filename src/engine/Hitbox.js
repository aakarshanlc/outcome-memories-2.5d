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
            geo = new THREE.BoxGeometry(width, 10, depth);
        } else {
            geo = new THREE.SphereGeometry(radius, 8, 8);
        }
        
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(x, 5, z); 
        this.mesh.visible = gameManager.settings.showHitboxes;
        scene.add(this.mesh);
    }

    update(gameManager) {
        this.duration--;
        this.mesh.material.opacity = (this.duration / this.maxDuration) * 0.5;
        this.mesh.visible = gameManager.settings.showHitboxes; // Check every frame
        
        if (this.duration <= 0) {
            this.scene.remove(this.mesh);
            return false;
        }
        return true;
    }
}