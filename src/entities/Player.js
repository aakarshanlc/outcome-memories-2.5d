import * as THREE from 'three';
import { checkCircleBoxCollision } from '../engine/Collision.js';
import { SurvivorVariables } from '../config/SurvivorVariables.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';

import sonicModelUrl from '../assets/models/Sonic/Sonic.dae';
import sonicTextureUrl from '../assets/models/Sonic/PLAYER00.png';
import knucklesModelUrl from '../assets/models/Knuckles/Knuckles.dae';
import knucklesTextureUrl from '../assets/models/Knuckles/PLAYER00.png';
import tailsModelUrl from '../assets/models/Tails/Tails.dae';
import tailsTextureUrl from '../assets/models/Tails/PLAYER00.png';

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

        if (charName === 'Sonic' || charName === 'Tails' || charName === 'Knuckles') {
            let modelUrl, textureUrl;
            if (charName === 'Sonic') { modelUrl = sonicModelUrl; textureUrl = sonicTextureUrl; }
            else if (charName === 'Tails') { modelUrl = tailsModelUrl; textureUrl = tailsTextureUrl; }
            else { modelUrl = knucklesModelUrl; textureUrl = knucklesTextureUrl; }

            const loader = new ColladaLoader();
            const textureLoader = new THREE.TextureLoader();
            
            textureLoader.load(textureUrl, (texture) => {
                texture.flipY = false; 
                texture.colorSpace = THREE.SRGBColorSpace; 
                
                loader.load(modelUrl, (collada) => {
                    const model = collada.scene;
                    model.traverse((node) => {
                        if (node.isMesh) {
                            node.material = new THREE.MeshStandardMaterial({ map: texture, transparent: true });
                            node.castShadow = true;
                        }
                    });

                    const finalMesh = this.setupModel(model);
                    const spawnX = this.mesh.position.x;
                    const spawnZ = this.mesh.position.z;
                    const spawnRot = this.mesh.rotation.y;

                    scene.remove(this.mesh);
                    this.mesh = finalMesh;
                    this.mesh.position.set(spawnX, 6, spawnZ);
                    this.mesh.rotation.y = spawnRot;
                    scene.add(this.mesh);

                    if (this.blockMesh) this.mesh.add(this.blockMesh);
                });
            });
        }

        this.speed = this.config.speed;
        this.size = this.config.size; 
        
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.acceleration = 0.2;
        this.damping = 0.85;
        
        this.maxHealth = this.config.maxHealth;
        this.health = this.maxHealth;
        this.bleedTimer = 0;
        this.highlightTimer = 0;
        this.invertedControlsTimer = 0;

        this.ability1Cooldown = 0;
        this.ability2Cooldown = 0;
        this.dashActive = 0;
        this.hitSpeedBoost = 0;
        
        this.vertVel = 0;
        this.padCooldown = 0;
        
        this.isBlocking = false;
        this.blockTimer = 0;
        this.punchState = 'idle';
        this.punchTimer = 0;
        this.blockMesh = null;
        
        this.flyCharges = this.config.abilities.fly ? this.config.abilities.fly.maxCharges : 0;
        this.flyCooldown = 0;
        this.flyChargeCooldown = 0;
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

    setupModel(model) {
        const yawGroup = new THREE.Group();
        const modelGroup = new THREE.Group();
        modelGroup.rotation.y = Math.PI / 2; 
        modelGroup.add(model);
        yawGroup.add(modelGroup);

        const box = new THREE.Box3().setFromObject(yawGroup);
        if (box.isEmpty()) return yawGroup;

        const size = box.getSize(new THREE.Vector3());
        const targetHeight = 8; 
        const scale = size.y > 0 ? targetHeight / size.y : 1;
        yawGroup.scale.setScalar(scale);

        const finalBox = new THREE.Box3().setFromObject(yawGroup);
        const center = finalBox.getCenter(new THREE.Vector3());
        yawGroup.position.sub(center);

        return yawGroup;
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

    setEmissive(colorHex) {
        const applyEmissive = (node) => {
            if (node.isMesh && node.material) {
                if (Array.isArray(node.material)) {
                    node.material.forEach(m => { if (m.emissive) m.emissive.setHex(colorHex); });
                } else {
                    if (node.material.emissive) node.material.emissive.setHex(colorHex);
                }
            }
        };
        if (this.mesh.isMesh) {
            applyEmissive(this.mesh);
        } else {
            this.mesh.traverse(applyEmissive);
        }
    }

    resolveWallStuck(obstacles) {
        for (let obs of obstacles) {
            const wallTopY = obs.mesh.position.y + 5;
            const playerBaseY = this.mesh.position.y - 6;
            if (playerBaseY < wallTopY - 0.2) {
                if (checkCircleBoxCollision(this.mesh.position.x, this.mesh.position.z, this.size, obs.x, obs.z, obs.w, obs.d)) {
                    let closestX = Math.max(obs.x, Math.min(this.mesh.position.x, obs.x + obs.w));
                    let closestZ = Math.max(obs.z, Math.min(this.mesh.position.z, obs.z + obs.d));
                    
                    let dx = this.mesh.position.x - closestX;
                    let dz = this.mesh.position.z - closestZ;
                    let dist = Math.hypot(dx, dz);
                    
                    if (dist > 0) {
                        this.mesh.position.x = closestX + (dx / dist) * (this.size + 0.1);
                        this.mesh.position.z = closestZ + (dz / dist) * (this.size + 0.1);
                    } else {
                        this.mesh.position.z = obs.z - this.size - 0.1;
                    }
                    this.velocity.set(0, 0, 0);
                }
            }
        }
    }

    update(obstacles, killers, gameManager, players) {
        if (this.health <= 0) return;

        if (this.bleedTimer > 0) {
            this.bleedTimer--;
            if (this.bleedTimer % 60 === 0) this.takeDamage(2, null);
        }
        if (this.highlightTimer > 0) {
            this.setEmissive(0xff0000); 
            this.highlightTimer--;
        } else {
            this.setEmissive(0x000000); 
        }

        let up = this.controls.up;
        let down = this.controls.down;
        let left = this.controls.left;
        let right = this.controls.right;

        if (this.invertedControlsTimer > 0) {
            this.invertedControlsTimer--;
            up = this.controls.down;
            down = this.controls.up;
            left = this.controls.right;
            right = this.controls.left;
            this.setEmissive(0xff00ff); 
        }

        let dx = 0, dz = 0;
        if (up) dz -= 1;
        if (down) dz += 1;
        if (left) dx -= 1;
        if (right) dx += 1;
        if (dx !== 0 && dz !== 0) { dx *= 0.707; dz *= 0.707; }

        let currentSpeed = this.speed;
        if (this.dashActive > 0) { currentSpeed *= 2.0; this.dashActive--; }
        if (this.hitSpeedBoost > 0) { currentSpeed *= 1.3; this.hitSpeedBoost--; }

        if (this.ability1Cooldown > 0) this.ability1Cooldown--;
        if (this.ability2Cooldown > 0) this.ability2Cooldown--;
        if (this.padCooldown > 0) this.padCooldown--;
        if (this.flyBoostTimer > 0) this.flyBoostTimer--;
        if (this.flyChargeCooldown > 0) this.flyChargeCooldown--;

        if (this.characterName === 'Sonic') {
            if (this.controls.ability1 && this.ability1Cooldown <= 0) {
                this.dashActive = this.config.abilities.dash.duration;
                this.ability1Cooldown = this.config.abilities.dash.cooldown;
                gameManager.audio.playSfx(this.config.abilities.dash.sfx); // SFX
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
                gameManager.audio.playSfx(this.config.abilities.parry.sfx); // SFX
            }
            if (this.controls.ability2 && this.ability2Cooldown <= 0 && this.punchState === 'idle') {
                this.punchState = 'windup';
                this.punchTimer = this.config.abilities.punch.windupDuration;
                this.ability2Cooldown = this.config.abilities.punch.cooldown;
                gameManager.audio.playSfx(this.config.abilities.punch.sfx); // SFX
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
                
                const hw = this.config.abilities.punch.hitboxWidth || 15;
                const hd = this.config.abilities.punch.hitboxDepth || 15;
                gameManager.spawnHitbox(hx, hz, 0, 5, this, 'knuckles_punch', 0, null, 'box', hw, hd);
                
                this.punchTimer--;
                if(this.punchTimer <= 0) this.punchState = 'idle';
            }
        }
        else if (this.characterName === 'Tails') {
            if (this.velocity.lengthSq() < 0.1 && this.mesh.position.y <= 6.1) {
                this.stillTimer++;
                if (this.stillTimer > 180) {
                    if (gameManager.gameTimer % 60 === 0) this.health = Math.min(this.maxHealth, this.health + 1);
                }
            } else {
                this.stillTimer = 0;
            }

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
                gameManager.audio.playSfx(this.config.abilities.gun.sfx); // SFX
            }

            if (this.controls.ability2 && this.flyCharges > 0 && this.flyCooldown <= 0 && this.flyChargeCooldown <= 0) {
                this.flyCharges--;
                this.flyChargeCooldown = this.config.abilities.fly.chargeCooldown;
                this.vertVel = this.config.abilities.fly.boost; 
                this.flyBoostTimer = this.config.abilities.fly.duration;
                
                if (this.flyCharges === 0) {
                    this.flyCooldown = this.config.abilities.fly.cooldown;
                }
                
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
                gameManager.audio.playSfx(this.config.abilities.fly.sfx); // SFX
            }

            if (this.flyCooldown > 0) {
                this.flyCooldown--;
                if (this.flyCooldown === 0) this.flyCharges = this.config.abilities.fly.maxCharges;
            }

            if (this.flyBoostTimer > 0) {
                currentSpeed *= this.config.abilities.fly.multiplier;
            }

            if (this.carryTarget && this.carryTarget.health > 0) {
                this.carryTarget.mesh.position.x = this.mesh.position.x;
                this.carryTarget.mesh.position.z = this.mesh.position.z;
                this.carryTarget.mesh.position.y = this.mesh.position.y; 
                this.carryTarget.velocity.copy(this.velocity);
                this.carryTarget.vertVel = this.vertVel; 
                
                if (this.mesh.position.y <= 6.1 && this.vertVel <= 0) {
                    this.carryTarget = null;
                }
            } else {
                this.carryTarget = null;
            }
        }

        if (gameManager.mapManager && gameManager.mapManager.jumpPads) {
            for (let pad of gameManager.mapManager.jumpPads) {
                let dist = Math.hypot(this.mesh.position.x - pad.x, this.mesh.position.z - pad.z);
                if (dist < this.size + pad.size) {
                    if (this.padCooldown <= 0 && this.mesh.position.y <= 6.1) { 
                        this.vertVel = gameManager.mapManager.config.padBoost;
                        this.padCooldown = gameManager.mapManager.config.padCooldown;
                        gameManager.audio.playSfx('jump_pad'); // SFX
                    }
                }
            }
        }

        let targetVx = dx * currentSpeed;
        let targetVz = dz * currentSpeed;

        this.velocity.x += (targetVx - this.velocity.x) * this.acceleration;
        this.velocity.z += (targetVz - this.velocity.z) * this.acceleration;

        if (dx === 0) this.velocity.x *= this.damping;
        if (dz === 0) this.velocity.z *= this.damping;

        let nextX = this.mesh.position.x + this.velocity.x;
        let nextZ = this.mesh.position.z + this.velocity.z;

        let collideX = false, collideZ = false;
        let groundHeight = 6;

        for (let obs of obstacles) {
            const wallTopY = obs.mesh.position.y + 5;
            const playerBaseY = this.mesh.position.y - 6; 
            
            if (checkCircleBoxCollision(nextX, nextZ, this.size, obs.x, obs.z, obs.w, obs.d)) {
                if (playerBaseY >= wallTopY - 0.2) {
                    if (this.vertVel <= 0) {
                        groundHeight = wallTopY + 6;
                    }
                } else if (this.mesh.position.y < wallTopY + 6) {
                    if (checkCircleBoxCollision(nextX, this.mesh.position.z, this.size, obs.x, obs.z, obs.w, obs.d)) collideX = true;
                    if (checkCircleBoxCollision(this.mesh.position.x, nextZ, this.size, obs.x, obs.z, obs.w, obs.d)) collideZ = true;
                }
            }
        }

        if (!collideX) this.mesh.position.x = nextX;
        else this.velocity.x = 0; 
        
        if (!collideZ) this.mesh.position.z = nextZ;
        else this.velocity.z = 0;

        this.vertVel -= 0.15; 
        this.mesh.position.y += this.vertVel;

        if (this.mesh.position.y <= groundHeight) {
            this.mesh.position.y = groundHeight;
            this.vertVel = 0;
        }

        this.resolveWallStuck(obstacles);

        if (this.velocity.lengthSq() > 0.1) {
            this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
        }
    }
}