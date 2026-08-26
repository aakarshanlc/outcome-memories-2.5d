import * as THREE from 'three';
import { checkCircleBoxCollision } from '../engine/Collision.js';

export class Player {
    constructor(scene, controls, color, charName = 'Sonic') {
        this.scene = scene;
        this.controls = controls;
        this.characterName = charName;
        
        const geo = new THREE.CapsuleGeometry(3, 6, 4, 8);
        const mat = new THREE.MeshStandardMaterial({ color: color });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.y = 6;
        this.mesh.castShadow = true;
        scene.add(this.mesh);

        this.speed = 0.8;
        this.size = 3; 
        
        // Status Effects
        this.maxHealth = 100;
        this.health = 100;
        this.bleedTimer = 0;
        this.invertedControlsTimer = 0;
        this.highlightTimer = 0;

        // Abilities
        this.dashCooldown = 0;
        this.dashActive = 0;
    }

    takeDamage(amount, attacker) {
        this.health -= amount;
        this.highlightTimer = 10;
        if (this.health <= 0) {
            this.health = 0;
            this.mesh.visible = false; // Hide mesh on death
        }
    }

    update(obstacles) {
        if (this.health <= 0) return;

        // Bleed Effect
        if (this.bleedTimer > 0) {
            this.bleedTimer--;
            if (this.bleedTimer % 60 === 0) this.takeDamage(2, null); // 2 dmg per second
        }
        if (this.invertedControlsTimer > 0) this.invertedControlsTimer--;
        if (this.highlightTimer > 0) {
            this.mesh.material.emissive.setHex(0xff0000);
            this.highlightTimer--;
        } else {
            this.mesh.material.emissive.setHex(0x000000);
        }

        let dx = 0, dz = 0;
        
        // Inverted Controls check
        let up = this.controls.up;
        let down = this.controls.down;
        let left = this.controls.left;
        let right = this.controls.right;
        if (this.invertedControlsTimer > 0) {
            up = this.controls.down; down = this.controls.up;
            left = this.controls.right; right = this.controls.left;
        }

        if (up) dz -= 1;
        if (down) dz += 1;
        if (left) dx -= 1;
        if (right) dx += 1;

        if (dx !== 0 && dz !== 0) { dx *= 0.707; dz *= 0.707; }

        let currentSpeed = this.speed;
        if (this.dashActive > 0) {
            currentSpeed *= 3.0;
            this.dashActive--;
        }
        if (this.dashCooldown > 0) this.dashCooldown--;

        if (this.controls.ability1 && this.dashCooldown <= 0) {
            this.dashActive = 30;
            this.dashCooldown = 480;
        }

        let nextX = this.mesh.position.x + (dx * currentSpeed);
        let nextZ = this.mesh.position.z + (dz * currentSpeed);

        let collideX = false, collideZ = false;
        for (let obs of obstacles) {
            if (checkCircleBoxCollision(nextX, this.mesh.position.z, this.size, obs.x, obs.z, obs.w, obs.d)) collideX = true;
            if (checkCircleBoxCollision(this.mesh.position.x, nextZ, this.size, obs.x, obs.z, obs.w, obs.d)) collideZ = true;
        }

        if (!collideX) this.mesh.position.x = nextX;
        if (!collideZ) this.mesh.position.z = nextZ;
    }
}