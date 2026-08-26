import * as THREE from 'three';
import { checkCircleBoxCollision } from '../engine/Collision.js';
import { Hitbox } from '../engine/Hitbox.js';

export class Killer {
    constructor(scene, controls, color, type = 'Tripwire') {
        this.scene = scene;
        this.controls = controls;
        this.type = type; // 'Tripwire', '2011X', 'Starved'
        
        const geo = new THREE.ConeGeometry(4, 12, 6);
        const mat = new THREE.MeshStandardMaterial({ color: color, emissive: 0x550000 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.y = 6;
        this.mesh.castShadow = true;
        scene.add(this.mesh);

        this.speed = 1.0;
        this.size = 4;
        
        // 2011X Specifics
        this.m1State = 'idle'; // idle, windup, attacking
        this.m1Timer = 0;
        this.m1Cooldown = 0;
        this.m1HitboxCount = 0;
        this.m1AttackAngle = new THREE.Vector3(0, 0, 1);
    }

    update(obstacles, players, gameManager) {
        let dx = 0, dz = 0;
        if (this.controls.up) dz -= 1;
        if (this.controls.down) dz += 1;
        if (this.controls.left) dx -= 1;
        if (this.controls.right) dx += 1;

        if (dx !== 0 && dz !== 0) { dx *= 0.707; dz *= 0.707; }

        let nextX = this.mesh.position.x + (dx * this.speed);
        let nextZ = this.mesh.position.z + (dz * this.speed);

        for (let obs of obstacles) {
            if (checkCircleBoxCollision(nextX, this.mesh.position.z, this.size, obs.x, obs.z, obs.w, obs.d)) nextX = this.mesh.position.x;
            if (checkCircleBoxCollision(this.mesh.position.x, nextZ, this.size, obs.x, obs.z, obs.w, obs.d)) nextZ = this.mesh.position.z;
        }

        this.mesh.position.x = nextX;
        this.mesh.position.z = nextZ;
        
        if (dx !== 0 || dz !== 0) {
            this.mesh.rotation.y = Math.atan2(dx, dz);
        }

        if (this.m1Cooldown > 0) this.m1Cooldown--;

        // 2011X M1 Combo Logic
        if (this.type === '2011X') {
            // Start Attack
            if (this.controls.m1 && this.m1State === 'idle' && this.m1Cooldown <= 0) {
                this.m1State = 'windup';
                this.m1Timer = 12; // 0.2s windup
                this.m1HitboxCount = 0;
                
                // Lock attack direction
                if (dx !== 0 || dz !== 0) {
                    this.m1AttackAngle.set(dx, 0, dz).normalize();
                } else {
                    // Default to facing forward if standing still
                    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
                    this.m1AttackAngle.set(forward.x, 0, forward.z).normalize();
                }
            }

            // Windup -> Attacking
            if (this.m1State === 'windup') {
                if (this.m1Timer <= 0) {
                    this.m1State = 'attacking';
                    this.m1Timer = 12; // Duration of attack phase
                }
                this.m1Timer--;
            }

            // Attacking -> Spawn Hitboxes
            if (this.m1State === 'attacking') {
                if (this.m1Timer % 2 === 0 && this.m1HitboxCount < 6) {
                    // Spawn hitbox slightly in front
                    const hx = this.mesh.position.x + this.m1AttackAngle.x * 10;
                    const hz = this.mesh.position.z + this.m1AttackAngle.z * 10;
                    
                    // 2011X M1: applies bleed
                    gameManager.spawnHitbox(hx, hz, 8, 10, this, 'killer_m1_2011x', 5, { applyBleed: true });
                    this.m1HitboxCount++;
                }
                
                this.m1Timer--;
                if (this.m1Timer <= 0 || this.m1HitboxCount >= 6) {
                    this.m1State = 'idle';
                    this.m1Cooldown = 30; // 0.5s cooldown after combo
                }
            }
        } 
        // Default Tripwire/Starved basic attack (keeps old logic for now)
        else {
            if (this.controls.m1 && this.m1Cooldown <= 0) {
                this.m1Cooldown = 60;
                const dir = new THREE.Vector3(dx, 0, dz).normalize();
                if (dir.length() === 0) dir.set(0, 0, 1);
                const attackPos = { x: this.mesh.position.x + dir.x * 10, z: this.mesh.position.z + dir.z * 10, r: 8 };
                gameManager.spawnHitbox(attackPos.x, attackPos.z, attackPos.r, 10, this, 'killer_m1', 5);
            }
        }
    }
}