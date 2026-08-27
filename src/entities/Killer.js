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

        this.maxSpeed = this.config.speed;
        this.currentSpeed = 1.0;
        this.size = this.config.size;
        this.stunned = 0;
        this.controlId = 'p2';
        this.isAI = false;
        
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.acceleration = 0.2;
        this.damping = 0.85;

        this.m1State = 'idle';
        this.m1Timer = 0;
        this.m1Cooldown = 0;
        this.m1HitboxCount = 0;
        this.m1AttackAngle = new THREE.Vector3(0, 0, 1);

        this.ability1Cooldown = 0;
        this.ability2Cooldown = 0;
        
        this.grappleState = 'idle';
        this.grappleTarget = null;
        this.grappleTimer = 0;
        this.grappleLine = null;
        this.activeBomb = null;
        
        this.teleportState = 'idle';
        this.teleportTimer = 0;
        this.trickeryState = 'idle';
        this.trickeryTimer = 0;
        this.trickeryAngle = 0;
        
        this.stunCount = 0;
        this.isRushing = false;
        this.rushTimer = 0;
    }

    destroy() {
        if (this.grappleLine) {
            this.scene.remove(this.grappleLine);
            this.grappleLine.geometry.dispose();
            this.grappleLine.material.dispose();
            this.grappleLine = null;
        }
        if (this.activeBomb) {
            this.scene.remove(this.activeBomb.mesh);
            this.activeBomb.mesh.geometry.dispose();
            this.activeBomb.mesh.material.dispose();
            this.activeBomb = null;
        }
        this.scene.remove(this.mesh);
    }

    stun(duration) {
        this.stunned = duration;
        this.mesh.material.emissive.setHex(0xffffff);
        this.velocity.set(0,0,0);
        this.currentSpeed = 1.0;
        
        if (this.type === '2011X' && this.config.rush && !this.isRushing) {
            this.stunCount++;
            if (this.stunCount >= this.config.rush.stunThreshold) {
                this.isRushing = true;
                this.rushTimer = this.config.rush.duration;
                this.stunCount = 0;
                this.mesh.material.emissive.setHex(0xff0000); 
            }
        }
    }

    // NEW: Anti-Wall-Stuck Logic
    resolveWallStuck(obstacles) {
        for (let obs of obstacles) {
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

    update(obstacles, players, gameManager) {
        if (this.isRushing) {
            this.rushTimer--;
            if (this.rushTimer <= 0) {
                this.isRushing = false;
                this.mesh.material.emissive.setHex(0x550000);
            }
        }

        if (this.stunned > 0) {
            this.stunned--;
            if (this.stunned === 0 && !this.isRushing) this.mesh.material.emissive.setHex(0x550000);
            this.velocity.x *= this.damping; this.velocity.z *= this.damping;
            this.mesh.position.x += this.velocity.x;
            this.mesh.position.z += this.velocity.z;
            
            // APPLY ANTI-WALL-STUCK even when stunned
            this.resolveWallStuck(obstacles);
            return;
        }

        let dx = 0, dz = 0;

        if (this.isAI) {
            let target = null;
            let minDist = Infinity;
            players.forEach(p => {
                if (p.health > 0) {
                    let d = Math.hypot(p.mesh.position.x - this.mesh.position.x, p.mesh.position.z - this.mesh.position.z);
                    if (d < minDist && d <= (this.config.ai?.visionRange || 9999)) { minDist = d; target = p; }
                }
            });

            if (target) {
                let tdx = target.mesh.position.x - this.mesh.position.x;
                let tdz = target.mesh.position.z - this.mesh.position.z;
                let dist = Math.hypot(tdx, tdz);
                
                const attackRange = this.config.ai?.attackRange || 12;
                if (dist > attackRange && dist > 0) {
                    dx = tdx / dist;
                    dz = tdz / dist;
                }
                this.controls.m1 = dist <= attackRange;
                
                if (this.type === 'Tripwire' && this.config.abilities && !this.isRushing) {
                    this.controls.ability1 = (dist <= (this.config.abilities.grapple?.range || 60) && this.ability1Cooldown <= 0);
                    this.controls.ability2 = (dist <= (this.config.abilities.bomb?.lockonRange || 80) && this.ability2Cooldown <= 0);
                }
                if (this.type === '2011X' && this.config.abilities && !this.isRushing) {
                    this.controls.ability1 = (dist <= 60 && this.ability1Cooldown <= 0);
                    this.controls.ability2 = (dist <= 50 && this.ability2Cooldown <= 0);
                }
            } else {
                this.controls.m1 = false;
                this.controls.ability1 = false;
                this.controls.ability2 = false;
            }
        } else {
            if (this.controls.up) dz -= 1;
            if (this.controls.down) dz += 1;
            if (this.controls.left) dx -= 1;
            if (this.controls.right) dx += 1;
        }

        if (dx !== 0 && dz !== 0) { dx *= 0.707; dz *= 0.707; }

        let isMoving = (dx !== 0 || dz !== 0);
        if (isMoving) this.currentSpeed += (this.maxSpeed - this.currentSpeed) * 0.02; 
        else this.currentSpeed += (1.0 - this.currentSpeed) * 0.05;

        let currentSpeed = this.currentSpeed;
        if (this.isRushing) currentSpeed *= this.config.rush.speedMultiplier;

        let targetVx = dx * currentSpeed;
        let targetVz = dz * currentSpeed;
        this.velocity.x += (targetVx - this.velocity.x) * this.acceleration;
        this.velocity.z += (targetVz - this.velocity.z) * this.acceleration;
        if (dx === 0) this.velocity.x *= this.damping;
        if (dz === 0) this.velocity.z *= this.damping;

        let nextX = this.mesh.position.x + this.velocity.x;
        let nextZ = this.mesh.position.z + this.velocity.z;

        let collideX = false, collideZ = false;
        for (let obs of obstacles) {
            if (checkCircleBoxCollision(nextX, this.mesh.position.z, this.size, obs.x, obs.z, obs.w, obs.d)) collideX = true;
            if (checkCircleBoxCollision(this.mesh.position.x, nextZ, this.size, obs.x, obs.z, obs.w, obs.d)) collideZ = true;
        }

        if (!collideX) this.mesh.position.x = nextX; else this.velocity.x = 0;
        if (!collideZ) this.mesh.position.z = nextZ; else this.velocity.z = 0;

        if (this.velocity.lengthSq() > 0.1) this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);

        if (this.m1Cooldown > 0) this.m1Cooldown--;
        if (this.ability1Cooldown > 0) this.ability1Cooldown--;
        if (this.ability2Cooldown > 0) this.ability2Cooldown--;

        this.updateM1(players, gameManager, dx, dz);
        
        if (!this.isRushing) {
            if (this.type === 'Tripwire' && this.config.abilities) {
                this.updateGrapple(players);
                this.updateBomb(players);
            }
            if (this.type === '2011X' && this.config.abilities) {
                this.updateTeleport(players, gameManager);
                this.updateTrickery(players, gameManager);
            }
        }

        // APPLY ANTI-WALL-STUCK
        this.resolveWallStuck(obstacles);
    }

    updateM1(players, gameManager, dx, dz) {
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
                let data = this.config.m1.applyBleed ? { applyBleed: true, bleedDuration: this.config.m1.bleedDuration || 180 } : null;
                
                const hw = this.config.m1.hitboxWidth || 20;
                const hd = this.config.m1.hitboxDepth || 20;
                gameManager.spawnHitbox(hx, hz, 0, 10, this, type, this.config.m1.damage, data, 'box', hw, hd);
                this.m1HitboxCount++;
            }
            this.m1Timer--;
            if (this.m1Timer <= 0 || this.m1HitboxCount >= maxHits) { this.m1State = 'idle'; this.m1Cooldown = this.config.m1.cooldown || 60; }
        }
    }

    updateTeleport(players, gameManager) {
        const tpCfg = this.config.abilities.teleport;
        if (this.controls.ability1 && this.ability1Cooldown <= 0 && this.teleportState === 'idle') {
            this.teleportState = 'windup';
            this.teleportTimer = tpCfg.windup;
            this.ability1Cooldown = tpCfg.cooldown;
        }

        if (this.teleportState === 'windup') {
            this.teleportTimer--;
            if (this.teleportTimer <= 0) {
                let target = players[Math.floor(Math.random() * players.length)];
                if (target && target.health > 0) {
                    let angle = Math.random() * Math.PI * 2;
                    this.mesh.position.x = target.mesh.position.x + Math.cos(angle) * 20;
                    this.mesh.position.z = target.mesh.position.z + Math.sin(angle) * 20;
                    
                    this.mesh.position.x = Math.max(-90, Math.min(90, this.mesh.position.x));
                    this.mesh.position.z = Math.max(-90, Math.min(90, this.mesh.position.z));
                    
                    gameManager.spawnHitbox(this.mesh.position.x, this.mesh.position.z, tpCfg.arriveRadius, 10, this, 'teleport_arrive', 0, { applyBleed: true, bleedDuration: tpCfg.bleedDuration }, 'sphere');
                }
                this.teleportState = 'idle';
            }
        }
    }

    updateTrickery(players, gameManager) {
        const trickCfg = this.config.abilities.gods_trickery;
        if (this.controls.ability2 && this.ability2Cooldown <= 0 && this.trickeryState === 'idle') {
            this.trickeryState = 'active';
            this.trickeryTimer = trickCfg.duration;
            this.ability2Cooldown = trickCfg.cooldown;
            
            let target = null;
            let minDist = Infinity;
            players.forEach(p => {
                if (p.health > 0) {
                    let d = Math.hypot(p.mesh.position.x - this.mesh.position.x, p.mesh.position.z - this.mesh.position.z);
                    if (d < minDist) { minDist = d; target = p; }
                }
            });
            if (target) {
                this.trickeryAngle = Math.atan2(target.mesh.position.z - this.mesh.position.z, target.mesh.position.x - this.mesh.position.x);
            } else {
                this.trickeryAngle = this.mesh.rotation.y;
            }
        }

        if (this.trickeryState === 'active') {
            this.trickeryTimer--;
            
            if (this.trickeryTimer % 10 === 0) {
                const offset = (1 - this.trickeryTimer / trickCfg.duration) * trickCfg.hitboxSpacing * trickCfg.hitboxCount;
                const hx = this.mesh.position.x + Math.cos(this.trickeryAngle) * (offset + 10);
                const hz = this.mesh.position.z + Math.sin(this.trickeryAngle) * (offset + 10);
                gameManager.spawnHitbox(hx, hz, 0, 10, this, 'gods_trickery', 0, { invertDuration: trickCfg.invertDuration }, 'box', trickCfg.hitboxWidth, trickCfg.hitboxDepth);
            }
            
            if (this.trickeryTimer <= 0) {
                this.trickeryState = 'idle';
            }
        }
    }

    updateGrapple(players) {
        const grappleCfg = this.config.abilities.grapple;
        if (!grappleCfg) return;

        if (this.controls.ability1 && this.ability1Cooldown <= 0 && this.grappleState === 'idle') {
            let target = null;
            let minDist = Infinity;
            if (players) {
                players.forEach(p => {
                    if (p.health > 0) {
                        let d = Math.hypot(p.mesh.position.x - this.mesh.position.x, p.mesh.position.z - this.mesh.position.z);
                        if (d < minDist && d <= grappleCfg.range) {
                            minDist = d; target = p;
                        }
                    }
                });
            }
            if (target) {
                this.grappleState = 'shooting';
                this.grappleTarget = target;
                this.grappleTimer = 12;
                this.ability1Cooldown = grappleCfg.cooldown;
                
                const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
                const points = [this.mesh.position, target.mesh.position];
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                this.grappleLine = new THREE.Line(geometry, material);
                this.scene.add(this.grappleLine);
            }
        }

        if (this.grappleState === 'shooting') {
            if (this.grappleLine && this.grappleTarget) {
                const points = [this.mesh.position, this.grappleTarget.mesh.position];
                this.grappleLine.geometry.setFromPoints(points);
            }
            if (this.grappleTimer <= 0) {
                if (this.grappleTarget && this.grappleTarget.health > 0) {
                    this.grappleTarget.takeDamage(grappleCfg.damage, this);
                    this.grappleState = 'dragging';
                    this.grappleTimer = grappleCfg.dragDuration;
                } else {
                    this.grappleState = 'idle';
                    this.removeGrappleLine();
                }
            }
            this.grappleTimer--;
        } else if (this.grappleState === 'dragging') {
            if (this.grappleLine && this.grappleTarget) {
                const points = [this.mesh.position, this.grappleTarget.mesh.position];
                this.grappleLine.geometry.setFromPoints(points);
            }
            if (this.grappleTarget && this.grappleTarget.health > 0) {
                let dx = this.mesh.position.x - this.grappleTarget.mesh.position.x;
                let dz = this.mesh.position.z - this.grappleTarget.mesh.position.z;
                let dist = Math.hypot(dx, dz);
                if (dist > 5) {
                    this.grappleTarget.mesh.position.x += (dx/dist) * grappleCfg.dragSpeed;
                    this.grappleTarget.mesh.position.z += (dz/dist) * grappleCfg.dragSpeed;
                } else {
                    this.grappleState = 'idle';
                }
                this.grappleTimer--;
                if (this.grappleTimer <= 0) this.grappleState = 'idle';
            } else {
                this.grappleState = 'idle';
            }
            
            if (this.grappleState === 'idle') this.removeGrappleLine();
        }
    }

    removeGrappleLine() {
        if (this.grappleLine) {
            this.scene.remove(this.grappleLine);
            this.grappleLine.geometry.dispose();
            this.grappleLine.material.dispose();
            this.grappleLine = null;
        }
    }

    updateBomb(players) {
        const bombCfg = this.config.abilities.bomb;
        if (!bombCfg) return;

        if (this.controls.ability2 && this.ability2Cooldown <= 0) {
            if (!this.activeBomb) {
                const geo = new THREE.SphereGeometry(3, 8, 8);
                const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x550000 });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.copy(this.mesh.position);
                mesh.position.y = 3;
                this.scene.add(mesh);
                this.activeBomb = {
                    mesh: mesh,
                    placing: true,
                    windup: bombCfg.windup,
                    isTracking: false,
                    target: null,
                    lifetime: bombCfg.lifetime
                };
                this.ability2Cooldown = bombCfg.cooldown;
            } else {
                let target = null;
                let minDist = Infinity;
                if (players) {
                    players.forEach(p => {
                        if (p.health > 0) {
                            let d = Math.hypot(p.mesh.position.x - this.mesh.position.x, p.mesh.position.z - this.mesh.position.z);
                            if (d < minDist && d <= bombCfg.lockonRange) {
                                minDist = d; target = p;
                            }
                        }
                    });
                }
                if (target) {
                    this.activeBomb.isTracking = true;
                    this.activeBomb.target = target;
                    this.ability2Cooldown = bombCfg.cooldown;
                }
            }
        }

        if (this.activeBomb) {
            let bomb = this.activeBomb;
            if (bomb.placing) {
                bomb.windup--;
                if (bomb.windup <= 0) bomb.placing = false;
            } else {
                bomb.lifetime--;
                let explode = false;
                let isImpact = false;
                
                if (bomb.isTracking && bomb.target && bomb.target.health > 0) {
                    let dx = bomb.target.mesh.position.x - bomb.mesh.position.x;
                    let dz = bomb.target.mesh.position.z - bomb.mesh.position.z;
                    let dist = Math.hypot(dx, dz);
                    if (dist > 0) {
                        bomb.mesh.position.x += (dx/dist) * bombCfg.trackingSpeed;
                        bomb.mesh.position.z += (dz/dist) * bombCfg.trackingSpeed;
                    }
                    if (dist < 5 + bomb.target.size) {
                        explode = true; isImpact = true;
                    }
                } else {
                    if (players) {
                        players.forEach(p => {
                            if (p.health > 0) {
                                let d = Math.hypot(p.mesh.position.x - bomb.mesh.position.x, p.mesh.position.z - bomb.mesh.position.z);
                                if (d < bombCfg.explodeRadius) {
                                    explode = true;
                                }
                            }
                        });
                    }
                }
                
                if (bomb.lifetime <= 0) {
                    this.scene.remove(bomb.mesh);
                    bomb.mesh.geometry.dispose();
                    bomb.mesh.material.dispose();
                    this.activeBomb = null;
                } else if (explode) {
                    if (players) {
                        if (isImpact && bomb.target) {
                            bomb.target.takeDamage(bombCfg.impactDamage, this);
                        }
                        players.forEach(p => {
                            if (p.health > 0 && p !== bomb.target) {
                                let d = Math.hypot(p.mesh.position.x - bomb.mesh.position.x, p.mesh.position.z - bomb.mesh.position.z);
                                if (d < bombCfg.explodeRadius) {
                                    p.takeDamage(isImpact ? bombCfg.aoeDamage : bombCfg.proximityDamage, this);
                                }
                            }
                        });
                    }
                    this.scene.remove(bomb.mesh);
                    bomb.mesh.geometry.dispose();
                    bomb.mesh.material.dispose();
                    this.activeBomb = null;
                }
            }
        }
    }
}