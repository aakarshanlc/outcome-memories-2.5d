import * as THREE from 'three';
import { checkCircleBoxCollision } from '../engine/Collision.js';

export class Player {
    constructor(scene, controls, color) {
        this.scene = scene;
        this.controls = controls;
        
        // 3D Representation
        const geo = new THREE.CapsuleGeometry(3, 6, 4, 8);
        const mat = new THREE.MeshStandardMaterial({ color: color });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.y = 6;
        this.mesh.castShadow = true;
        scene.add(this.mesh);

        this.speed = 0.8;
        this.size = 3; // Radius
        this.dashCooldown = 0;
        this.dashActive = 0;
    }

    update(obstacles) {
        let dx = 0, dz = 0;
        if (this.controls.up) dz -= 1;
        if (this.controls.down) dz += 1;
        if (this.controls.left) dx -= 1;
        if (this.controls.right) dx += 1;

        if (dx !== 0 && dz !== 0) { dx *= 0.707; dz *= 0.707; }

        let currentSpeed = this.speed;
        
        // Sonic's Spin Dash adapted to 3D
        if (this.controls.ability1 && this.dashCooldown <= 0) {
            this.dashActive = 30; // 0.5s at 60fps
            this.dashCooldown = 480; // 8s
        }
        if (this.dashActive > 0) {
            currentSpeed *= 3.0;
            this.dashActive--;
        }
        if (this.dashCooldown > 0) this.dashCooldown--;

        // Movement & Collision on X/Z plane
        let nextX = this.mesh.position.x + (dx * currentSpeed);
        let nextZ = this.mesh.position.z + (dz * currentSpeed);

        let collideX = false;
        let collideZ = false;

        for (let obs of obstacles) {
            if (checkCircleBoxCollision(nextX, this.mesh.position.z, this.size, obs.x, obs.z, obs.w, obs.d)) collideX = true;
            if (checkCircleBoxCollision(this.mesh.position.x, nextZ, this.size, obs.x, obs.z, obs.w, obs.d)) collideZ = true;
        }

        if (!collideX) this.mesh.position.x = nextX;
        if (!collideZ) this.mesh.position.z = nextZ;
    }
}