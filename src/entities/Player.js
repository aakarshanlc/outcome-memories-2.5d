import * as THREE from 'three';
import { checkCircleBoxCollision } from '../engine/Collision.js';
import { SurvivorVariables } from '../config/SurvivorVariables.js';

export class Player {
    constructor(scene, controls, color, charName = 'Sonic') {
        this.scene = scene;
        this.controls = controls;
        this.characterName = charName;
        
        this.config = SurvivorVariables[charName] || SurvivorVariables['Sonic'];

        const geo = new THREE.CapsuleGeometry(3, 6, 4, 8);
        const mat = new THREE.MeshStandardMaterial({ color: color });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.y = 6;
        this.mesh.castShadow = true;
        scene.add(this.mesh);

        this.speed = this.config.speed;
        this.size = this.config.size; 
        
        // Smooth Physics Variables
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.acceleration = 0.2; // How fast we reach top speed
        this.damping = 0.85; // Friction when stopping
        
        this.maxHealth = this.config.maxHealth;
        this.health = this.maxHealth;
        this.bleedTimer = 0;
        this.highlightTimer = 0;

        this.ability1Cooldown = 0;
        this.ability2Cooldown = 0;
        this.dashActive = 0;
        
        this.isBlocking = false;
        this.blockTimer = 0;
        this.punchState = 'idle';
        this.punchTimer = 0;
        
        this.isFlying = false;
        this.flyTimer = 0;

        this.blockMesh = null;
        if (charName === 'Knuckles') {
            const ringGeo = new THREE.TorusGeometry(this.size + 4, 0.5, 8, 24);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.7 });
            this.blockMesh = new THREE.Mesh(ringGeo, ringMat);
            this.blockMesh.rotation.x = Math.PI / 2; 
            this.blockMesh.visible = false;
            this.mesh.add(this.blockMesh); 
        }
    }

    takeDamage(amount, attacker) {
        if (this.isBlocking) { this.triggerBlockSuccess(attacker); return; }
        this.health -= amount;
        this.highlightTimer = 10;
        if (this.health <= 0) { this.health = 0; this.mesh.visible = false; }
    }

    triggerBlockSuccess(killer) {
        this.isBlocking = false; this.blockTimer = 0;
        if (this.blockMesh) this.blockMesh.visible = false;
        this.ability1Cooldown = this.config.abilities.parry.cooldown;
        this.dashActive = this.config.abilities.parry.speedBoostDuration;
        if (killer) killer.stun(this.config.abilities.parry.stunDuration);
    }

    update(obstacles, killers, gameManager) {
        if (this.health <= 0) return;

        if (this.bleedTimer > 0) {
            this.bleedTimer--;
            if (this.bleedTimer % 60 === 0) this.takeDamage(2, null);
        }
        if (this.highlightTimer > 0) {
            this.mesh.material.emissive.setHex(0xff0000);
            this.highlightTimer--;
        } else {
            this.mesh.material.emissive.setHex(0x000000);
        }

        let dx = 0, dz = 0;
        if (this.controls.up) dz -= 1;
        if (this.controls.down) dz += 1;
        if (this.controls.left) dx -= 1;
        if (this.controls.right) dx += 1;
        if (dx !== 0 && dz !== 0) { dx *= 0.707; dz *= 0.707; }

        let currentSpeed = this.speed;
        if (this.dashActive > 0) { currentSpeed *= 2.0; this.dashActive--; }

        if (this.ability1Cooldown > 0) this.ability1Cooldown--;
        if (this.ability2Cooldown > 0) this.ability2Cooldown--;

        // --- CHARACTER SPECIFIC ABILITIES ---
        if (this.characterName === 'Sonic') {
            if (this.controls.ability1 && this.ability1Cooldown <= 0) {
                this.dashActive = this.config.abilities.dash.duration;
                this.ability1Cooldown = this.config.abilities.dash.cooldown;
            }
        }
        else if (this.characterName === 'Knuckles') {
            if (this.isBlocking) {
                this.blockTimer--;
                if (this.blockTimer <= 0) { this.isBlocking = false; if (this.blockMesh) this.blockMesh.visible = false; }
            }
            if (this.controls.ability1 && this.ability1Cooldown <= 0 && !this.isBlocking) {
                this.isBlocking = true;
                this.blockTimer = this.config.abilities.parry.duration;
                this.ability1Cooldown = this.config.abilities.parry.cooldown;
                if (this.blockMesh) this.blockMesh.visible = true;
            }
            if (this.controls.ability2 && this.ability2Cooldown <= 0 && this.punchState === 'idle') {
                this.punchState = 'windup';
                this.punchTimer = this.config.abilities.punch.windupDuration;
                this.ability2Cooldown = this.config.abilities.punch.cooldown;
            }
            if (this.punchState === 'windup') {
                currentSpeed *= 0.5; this.punchTimer--;
                if (this.punchTimer <= 0) { this.punchState = 'punching'; this.punchTimer = this.config.abilities.punch.activeDuration; }
            }
            if (this.punchState === 'punching') {
                currentSpeed *= this.config.abilities.punch.multiplier;
                const dir = new THREE.Vector3(dx, 0, dz);
                if(dir.lengthSq() === 0) dir.set(0,0,1); else dir.normalize();
                const hx = this.mesh.position.x + dir.x * 8;
                const hz = this.mesh.position.z + dir.z * 8;
                gameManager.spawnHitbox(hx, hz, 0, 5, this, 'knuckles_punch', 0, null, 'box', this.config.abilities.punch.hitboxWidth, this.config.abilities.punch.hitboxDepth);
                this.punchTimer--;
                if(this.punchTimer <= 0) this.punchState = 'idle';
            }
        }
        else if (this.characterName === 'Tails') {
            if (this.controls.ability1 && this.ability1Cooldown <= 0) {
                const dir = new THREE.Vector3(dx, 0, dz);
                if(dir.lengthSq() === 0) dir.set(0,0,1); else dir.normalize();
                gameManager.spawnProjectile(this.mesh.position.x, this.mesh.position.z, dir.x, dir.z, this, this.config.abilities.gun.damage, this.config.abilities.gun.stunDuration, this.config.abilities.gun.projectileSpeed);
                this.ability1Cooldown = this.config.abilities.gun.cooldown;
            }
            if (this.controls.ability2 && this.ability2Cooldown <= 0) {
                this.isFlying = true; this.flyTimer = this.config.abilities.fly.duration; this.ability2Cooldown = this.config.abilities.fly.cooldown;
            }
            if (this.isFlying) {
                this.mesh.position.y = this.config.abilities.fly.flyHeight;
                this.flyTimer--;
                if (this.flyTimer <= 0) this.isFlying = false;
            } else { this.mesh.position.y = 6; }
        }

        // --- SMOOTH MOVEMENT PHYSICS ---
        let targetVx = dx * currentSpeed;
        let targetVz = dz * currentSpeed;

        // Lerp towards target velocity for smooth acceleration
        this.velocity.x += (targetVx - this.velocity.x) * this.acceleration;
        this.velocity.z += (targetVz - this.velocity.z) * this.acceleration;

        // Apply damping (friction) when no keys are pressed
        if (dx === 0) this.velocity.x *= this.damping;
        if (dz === 0) this.velocity.z *= this.damping;

        let nextX = this.mesh.position.x + this.velocity.x;
        let nextZ = this.mesh.position.z + this.velocity.z;

        let collideX = false, collideZ = false;
        if (!this.isFlying) {
            for (let obs of obstacles) {
                if (checkCircleBoxCollision(nextX, this.mesh.position.z, this.size, obs.x, obs.z, obs.w, obs.d)) collideX = true;
                if (checkCircleBoxCollision(this.mesh.position.x, nextZ, this.size, obs.x, obs.z, obs.w, obs.d)) collideZ = true;
            }
        }

        if (!collideX) this.mesh.position.x = nextX;
        else this.velocity.x = 0; // Stop completely on wall hit
        
        if (!collideZ) this.mesh.position.z = nextZ;
        else this.velocity.z = 0;

        // Rotate player to face movement direction
        if (this.velocity.lengthSq() > 0.1) {
            this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
        }
    }
}