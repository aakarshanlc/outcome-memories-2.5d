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
        
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.acceleration = 0.2;
        this.damping = 0.85;
        
        this.maxHealth = this.config.maxHealth;
        this.health = this.maxHealth;
        this.bleedTimer = 0;
        this.highlightTimer = 0;

        this.ability1Cooldown = 0;
        this.ability2Cooldown = 0;
        this.dashActive = 0;
        
        // 3D Physics
        this.vertVel = 0;
        this.padCooldown = 0;
        
        // Knuckles
        this.isBlocking = false;
        this.blockTimer = 0;
        this.punchState = 'idle';
        this.punchTimer = 0;
        this.blockMesh = null;
        
        // Tails
        this.flyCharges = this.config.abilities.fly ? this.config.abilities.fly.maxCharges : 0;
        this.flyCooldown = 0;
        this.flyChargeCooldown = 0; // NEW: Prevents spamming all 3 charges instantly
        this.flyBoostTimer = 0;
        this.carryTarget = null;
        this.gunCharging = false;
        this.gunChargeTimer = 0;
        this.stillTimer = 0;

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
        this.isBlocking = false; 
        this.blockTimer = 0;
        if (this.blockMesh) this.blockMesh.visible = false;
        this.ability1Cooldown = this.config.abilities.parry.cooldown;
        this.dashActive = this.config.abilities.parry.speedBoostDuration;
        if (killer) killer.stun(this.config.abilities.parry.stunDuration);
    }

    update(obstacles, killers, gameManager, players) {
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
        if (this.padCooldown > 0) this.padCooldown--;
        if (this.flyBoostTimer > 0) this.flyBoostTimer--;
        if (this.flyChargeCooldown > 0) this.flyChargeCooldown--; // Decrement charge cooldown

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
                currentSpeed *= 0.5; 
                this.punchTimer--;
                if (this.punchTimer <= 0) { 
                    this.punchState = 'punching'; 
                    this.punchTimer = this.config.abilities.punch.activeDuration; 
                }
            }
            if (this.punchState === 'punching') {
                currentSpeed *= this.config.abilities.punch.multiplier;
                const dir = new THREE.Vector3(dx, 0, dz);
                if(dir.lengthSq() === 0) dir.set(0,0,1); else dir.normalize();
                const hx = this.mesh.position.x + dir.x * 8;
                const hz = this.mesh.position.z + dir.z * 8;
                
                // FIX: Safe fallbacks for width and depth
                const hw = this.config.abilities.punch.hitboxWidth || 15;
                const hd = this.config.abilities.punch.hitboxDepth || 15;
                gameManager.spawnHitbox(hx, hz, 0, 5, this, 'knuckles_punch', 0, null, 'box', hw, hd);
                
                this.punchTimer--;
                if(this.punchTimer <= 0) this.punchState = 'idle';
            }
        }
        else if (this.characterName === 'Tails') {
            // Passive: Mechanical Mind (Regen when standing still for 3s)
            if (this.velocity.lengthSq() < 0.1 && this.mesh.position.y <= 6.1) {
                this.stillTimer++;
                if (this.stillTimer > 180) {
                    if (gameManager.gameTimer % 60 === 0) this.health = Math.min(this.maxHealth, this.health + 1);
                }
            } else {
                this.stillTimer = 0;
            }

            // Ab1: Ray Gun (Charge Mechanic)
            if (this.controls.ability1 && this.ability1Cooldown <= 0) {
                if (!this.gunCharging) {
                    this.gunCharging = true;
                    this.gunChargeTimer = 0;
                }
                this.gunChargeTimer++;
                currentSpeed *= 0.5; 
            } else if (this.gunCharging) {
                const chargeRatio = Math.min(this.gunChargeTimer / this.config.abilities.gun.maxCharge, 1);
                const finalStun = this.config.abilities.gun.stunDuration + (chargeRatio * 120); 
                const dir = new THREE.Vector3(dx, 0, dz);
                if(dir.lengthSq() === 0) dir.set(0,0,1); else dir.normalize();
                gameManager.spawnProjectile(this.mesh.position.x, this.mesh.position.z, dir.x, dir.z, this, this.config.abilities.gun.damage, finalStun, this.config.abilities.gun.projectileSpeed);
                this.ability1Cooldown = this.config.abilities.gun.cooldown;
                this.gunCharging = false;
            }

            // Ab2: Fly (3 Charges, Velocity-based burst)
            // Can only activate if we have charges, main cooldown is over, and charge cooldown is over
            if (this.controls.ability2 && this.flyCharges > 0 && this.flyCooldown <= 0 && this.flyChargeCooldown <= 0) {
                this.flyCharges--;
                this.flyChargeCooldown = this.config.abilities.fly.chargeCooldown; // Start 0.5s delay between dashes
                this.vertVel = this.config.abilities.fly.boost; // Apply upward velocity
                this.flyBoostTimer = this.config.abilities.fly.duration;
                
                if (this.flyCharges === 0) {
                    this.flyCooldown = this.config.abilities.fly.cooldown; // Start main cooldown when out of charges
                }
                
                // Check for carry target (only grab if they are on the ground)
                if (players) {
                    for (let p of players) {
                        if (p !== this && p.health > 0 && p.mesh.position.y <= 6.1) {
                            let dist = Math.hypot(p.mesh.position.x - this.mesh.position.x, p.mesh.position.z - this.mesh.position.z);
                            if (dist < this.size + p.size) {
                                this.carryTarget = p;
                                break;
                            }
                        }
                    }
                }
            }

            if (this.flyCooldown > 0) {
                this.flyCooldown--;
                if (this.flyCooldown === 0) this.flyCharges = this.config.abilities.fly.maxCharges; // Reset charges
            }

            if (this.flyBoostTimer > 0) {
                currentSpeed *= this.config.abilities.fly.multiplier;
            }

            // Sync carry target position
            if (this.carryTarget && this.carryTarget.health > 0) {
                this.carryTarget.mesh.position.x = this.mesh.position.x;
                this.carryTarget.mesh.position.z = this.mesh.position.z;
                this.carryTarget.mesh.position.y = this.mesh.position.y; 
                this.carryTarget.velocity.copy(this.velocity);
                this.carryTarget.vertVel = this.vertVel; // Sync vertical movement!
                
                // Drop target if we land
                if (this.mesh.position.y <= 6.1 && this.vertVel <= 0) {
                    this.carryTarget = null;
                }
            } else {
                this.carryTarget = null;
            }
        }

        // --- JUMP PAD CHECK ---
        if (gameManager.mapManager && gameManager.mapManager.jumpPads) {
            for (let pad of gameManager.mapManager.jumpPads) {
                let dist = Math.hypot(this.mesh.position.x - pad.x, this.mesh.position.z - pad.z);
                if (dist < this.size + pad.size) {
                    if (this.padCooldown <= 0 && this.mesh.position.y <= 6.1) { 
                        this.vertVel = gameManager.mapManager.config.padBoost;
                        this.padCooldown = gameManager.mapManager.config.padCooldown;
                    }
                }
            }
        }

        // --- SMOOTH MOVEMENT PHYSICS ---
        let targetVx = dx * currentSpeed;
        let targetVz = dz * currentSpeed;

        this.velocity.x += (targetVx - this.velocity.x) * this.acceleration;
        this.velocity.z += (targetVz - this.velocity.z) * this.acceleration;

        if (dx === 0) this.velocity.x *= this.damping;
        if (dz === 0) this.velocity.z *= this.damping;

        let nextX = this.mesh.position.x + this.velocity.x;
        let nextZ = this.mesh.position.z + this.velocity.z;

        let collideX = false, collideZ = false;
        let groundHeight = 6; // Default floor height

        // Calculate which wall we are standing on or hitting
        for (let obs of obstacles) {
            const wallTopY = 10;
            const playerBaseY = this.mesh.position.y - 6; // Bottom of player capsule
            
            // Are we horizontally intersecting this obstacle's footprint?
            if (checkCircleBoxCollision(nextX, nextZ, this.size, obs.x, obs.z, obs.w, obs.d)) {
                if (playerBaseY >= wallTopY - 0.2) {
                    // We are high enough to land on top
                    if (this.vertVel <= 0) {
                        groundHeight = wallTopY + 6; // Snap to top (10 + 6)
                    }
                } else if (this.mesh.position.y <= 6.2) { // Ignore side collisions if in the air
                    // We are hitting the side of the wall
                    if (checkCircleBoxCollision(nextX, this.mesh.position.z, this.size, obs.x, obs.z, obs.w, obs.d)) collideX = true;
                    if (checkCircleBoxCollision(this.mesh.position.x, nextZ, this.size, obs.x, obs.z, obs.w, obs.d)) collideZ = true;
                }
            }
        }

        if (!collideX) this.mesh.position.x = nextX;
        else this.velocity.x = 0; 
        
        if (!collideZ) this.mesh.position.z = nextZ;
        else this.velocity.z = 0;

        // Apply Gravity & Ground Snap
        this.vertVel -= 0.15; // Gravity
        this.mesh.position.y += this.vertVel;

        if (this.mesh.position.y <= groundHeight) {
            this.mesh.position.y = groundHeight;
            this.vertVel = 0;
        }

        if (this.velocity.lengthSq() > 0.1) {
            this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
        }
    }
}