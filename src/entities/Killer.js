import * as THREE from 'three';
import { checkCircleBoxCollision } from '../engine/Collision.js';
import { KillerVariables } from '../config/KillerVariables.js';

export class Killer {
    constructor(scene, controls, color, type = 'Tripwire') {
        this.scene = scene;
        this.controls = controls;
        this.type = type;
        this.config = KillerVariables[type] || KillerVariables['Tripwire'];
        
        const geo = new THREE.ConeGeometry(4, 12, 6);
        const mat = new THREE.MeshStandardMaterial({ color: color, emissive: 0x550000 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.y = 6;
        this.mesh.castShadow = true;
        scene.add(this.mesh);

        this.speed = this.config.speed;
        this.size = this.config.size;
        this.stunned = 0;
        this.controlId = 'p2'; // Default
        
        // Smooth Physics
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.acceleration = 0.2;
        this.damping = 0.85;

        this.m1State = 'idle';
        this.m1Timer = 0;
        this.m1Cooldown = 0;
        this.m1HitboxCount = 0;
        this.m1AttackAngle = new THREE.Vector3(0, 0, 1);
    }

    stun(duration) { this.stunned = duration; this.mesh.material.emissive.setHex(0xffffff); this.velocity.set(0,0,0); }
    takeDamage(amount, attacker) {}

    update(obstacles, players, gameManager) {
        if (this.stunned > 0) {
            this.stunned--;
            if (this.stunned === 0) this.mesh.material.emissive.setHex(0x550000);
            this.velocity.x *= this.damping; this.velocity.z *= this.damping;
            this.mesh.position.x += this.velocity.x;
            this.mesh.position.z += this.velocity.z;
            return;
        }

        let dx = 0, dz = 0;
        if (this.controls.up) dz -= 1;
        if (this.controls.down) dz += 1;
        if (this.controls.left) dx -= 1;
        if (this.controls.right) dx += 1;
        if (dx !== 0 && dz !== 0) { dx *= 0.707; dz *= 0.707; }

        let targetVx = dx * this.speed;
        let targetVz = dz * this.speed;
        this.velocity.x += (targetVx - this.velocity.x) * this.acceleration;
        this.velocity.z += (targetVz - this.velocity.z) * this.acceleration;
        if (dx === 0) this.velocity.x *= this.damping;
        if (dz === 0) this.velocity.z *= this.damping;

        let nextX = this.mesh.position.x + this.velocity.x;
        let nextZ = this.mesh.position.z + this.velocity.z;

        let collideX = false, collideZ = false; // FIXED MISSING DECLARATION
        for (let obs of obstacles) {
            if (checkCircleBoxCollision(nextX, this.mesh.position.z, this.size, obs.x, obs.z, obs.w, obs.d)) { collideX = true; }
            if (checkCircleBoxCollision(this.mesh.position.x, nextZ, this.size, obs.x, obs.z, obs.w, obs.d)) { collideZ = true; }
        }

        if (!collideX) this.mesh.position.x = nextX; else this.velocity.x = 0;
        if (!collideZ) this.mesh.position.z = nextZ; else this.velocity.z = 0;

        if (this.velocity.lengthSq() > 0.1) this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);

        if (this.m1Cooldown > 0) this.m1Cooldown--;

        if (this.controls.m1 && this.m1State === 'idle' && this.m1Cooldown <= 0) {
            this.m1State = 'windup';
            this.m1Timer = this.config.m1.windup || 0;
            this.m1HitboxCount = 0;
            if (dx !== 0 || dz !== 0) { this.m1AttackAngle.set(dx, 0, dz).normalize(); } 
            else { this.m1AttackAngle.set(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y)).normalize(); }
        }

        if (this.m1State === 'windup') {
            if (this.m1Timer <= 0) { this.m1State = 'attacking'; this.m1Timer = this.config.m1.attackDuration || this.config.m1.duration; }
            this.m1Timer--;
        }

        if (this.m1State === 'attacking') {
            const maxHits = this.config.m1.hitCount || 1;
            const spawnCondition = this.config.m1.hitCount ? (this.m1Timer % 2 === 0) : (this.m1HitboxCount === 0);
            if (spawnCondition && this.m1HitboxCount < maxHits) {
                const hx = this.mesh.position.x + this.m1AttackAngle.x * 10;
                const hz = this.mesh.position.z + this.m1AttackAngle.z * 10;
                let type = this.config.m1.hitboxType;
                let data = this.config.m1.applyBleed ? { applyBleed: true } : null;
                gameManager.spawnHitbox(hx, hz, 0, 10, this, type, this.config.m1.damage, data, 'box', this.config.m1.hitboxWidth, this.config.m1.hitboxDepth);
                this.m1HitboxCount++;
            }
            this.m1Timer--;
            if (this.m1Timer <= 0 || this.m1HitboxCount >= maxHits) { this.m1State = 'idle'; this.m1Cooldown = this.config.m1.cooldown; }
        }
    }
}