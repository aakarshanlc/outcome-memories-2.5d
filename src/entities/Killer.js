import * as THREE from 'three';
import { checkCircleBoxCollision } from '../engine/Collision.js';

export class Killer {
    constructor(scene, controls, color) {
        this.scene = scene;
        this.controls = controls;
        
        const geo = new THREE.ConeGeometry(4, 12, 6);
        const mat = new THREE.MeshStandardMaterial({ color: color, emissive: 0x550000 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.y = 6;
        this.mesh.castShadow = true;
        scene.add(this.mesh);

        this.speed = 1.0;
        this.size = 4;
        this.attackCooldown = 0;
    }

    update(obstacles, players) {
        let dx = 0, dz = 0;
        if (this.controls.up) dz -= 1;
        if (this.controls.down) dz += 1;
        if (this.controls.left) dx -= 1;
        if (this.controls.right) dx += 1;

        if (dx !== 0 && dz !== 0) { dx *= 0.707; dz *= 0.707; }

        let nextX = this.mesh.position.x + (dx * this.speed);
        let nextZ = this.mesh.position.z + (dz * this.speed);

        // Simple 3D Collision
        for (let obs of obstacles) {
            if (checkCircleBoxCollision(nextX, this.mesh.position.z, this.size, obs.x, obs.z, obs.w, obs.d)) nextX = this.mesh.position.x;
            if (checkCircleBoxCollision(this.mesh.position.x, nextZ, this.size, obs.x, obs.z, obs.w, obs.d)) nextZ = this.mesh.position.z;
        }

        this.mesh.position.x = nextX;
        this.mesh.position.z = nextZ;
        
        // Rotate killer to face movement direction
        if (dx !== 0 || dz !== 0) {
            this.mesh.rotation.y = Math.atan2(dx, dz);
        }

        // 3D M1 Attack
        if (this.controls.m1 && this.attackCooldown <= 0) {
            this.attackCooldown = 60; // 1 second cooldown
            const dir = new THREE.Vector3(dx, 0, dz).normalize();
            if (dir.length() === 0) dir.set(0, 0, 1); // Default forward if standing still
            
            // Create a forward thrusting hitbox in 3D space
            const attackPos = { x: this.mesh.position.x + dir.x * 10, z: this.mesh.position.z + dir.z * 10, r: 8 };
            
            // Check player collisions
            players.forEach(p => {
                let dist = Math.hypot(attackPos.x - p.mesh.position.x, attackPos.z - p.mesh.position.z);
                if (dist < attackPos.r + p.size) {
                    console.log("Player Hit in 3D space!");
                    // Apply knockback on X/Z plane
                    p.mesh.position.x += dir.x * 15;
                    p.mesh.position.z += dir.z * 15;
                }
            });
        }
        
        if (this.attackCooldown > 0) this.attackCooldown--;
    }
}