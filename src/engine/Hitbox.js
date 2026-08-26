import * as THREE from 'three';
import { checkCircleCircleCollision } from './Collision.js'; // We will add this to Collision.js

export class Hitbox {
    constructor(scene, x, z, radius, duration, owner, type, damage = 0, data = null) {
        this.scene = scene;
        this.x = x; this.z = z; this.radius = radius;
        this.duration = duration; this.maxDuration = duration;
        this.owner = owner; this.type = type; this.damage = damage; this.data = data;
        this.hasHit = new Set(); // Track who we hit so we don't hit them 60 times a second

        // 3D Visual (Wireframe Sphere)
        const geo = new THREE.SphereGeometry(radius, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, transparent: true, opacity: 0.5 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(x, 5, z); // Hover above the ground
        scene.add(this.mesh);
    }

    update() {
        this.duration--;
        // Fade out visually
        this.mesh.material.opacity = (this.duration / this.maxDuration) * 0.5;
        
        if (this.duration <= 0) {
            this.scene.remove(this.mesh);
            return false; // Signal to GameManager to remove this hitbox
        }
        return true;
    }
}