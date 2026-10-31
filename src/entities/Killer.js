import * as THREE from 'three';
import { checkCircleBoxCollision, checkCircleCircleCollision } from '../engine/Collision.js';
import { buildNavGrid, worldToCell, nearestFreeCell, computePath } from '../engine/NavGrid.js';
import { KillerVariables } from '../config/KillerVariables.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import tripwireModelUrl from '../assets/models/Tripwire/tdoll.obj';
import tripwireTextureUrl from '../assets/models/Tripwire/player01.png';
import x2011ModelUrl from '../assets/models/2011X/2011x.glb';
import starvedModelUrl from '../assets/models/Starved/starved_eggman.glb';

// Parsed models are cached and cloned on reuse: no re-download/re-parse on
// rematch or when an online client spins up the same killer.
const modelCache = new Map();

function loadObjModel(url, textureUrl) {
    if (modelCache.has(url)) return Promise.resolve(modelCache.get(url).clone(true));
    const textureLoader = new THREE.TextureLoader();
    const loader = new OBJLoader();
    return new Promise((resolve, reject) => {
        textureLoader.load(textureUrl, (texture) => {
            texture.flipY = false;
            texture.colorSpace = THREE.SRGBColorSpace;
            loader.load(url, (obj) => {
                obj.traverse((node) => {
                    if (node.isMesh) {
                        node.material = new THREE.MeshStandardMaterial({ map: texture, transparent: true });
                        node.castShadow = true;
                    }
                });
                modelCache.set(url, obj);
                resolve(obj.clone(true));
            }, undefined, reject);
        }, undefined, reject);
    });
}

function loadGltfModel(url) {
    if (modelCache.has(url)) return Promise.resolve(modelCache.get(url).clone(true));
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
        loader.load(url, (gltf) => {
            gltf.scene.traverse((node) => {
                if (node.isMesh) node.castShadow = true;
            });
            modelCache.set(url, gltf.scene);
            resolve(gltf.scene.clone(true));
        }, undefined, reject);
    });
}

export class Killer {
    constructor(scene, controls, color, type = 'Tripwire') {
        this.scene = scene;
        this.controls = controls;
        this.type = type;
        this.config = KillerVariables[type] || KillerVariables['Tripwire'];
        // Tag used by survivor hit reactions (Knuckles' parry only answers
        // attacks from entities carrying this flag).
        this.isKiller = true;

        const geo = new THREE.ConeGeometry(4, 12, 6);
        const mat = new THREE.MeshStandardMaterial({ color: color, emissive: 0x550000 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.y = 6;
        this.mesh.castShadow = true;
        scene.add(this.mesh);

        if (type === 'Tripwire') {
            loadObjModel(tripwireModelUrl, tripwireTextureUrl)
                .then(obj => this.swapMesh(this.setupModel(obj, Math.PI / 2)))
                .catch(err => console.error('Failed to load Tripwire model', err));
        }
        else if (type === '2011X' || type === 'Starved') {
            const modelUrl = type === '2011X' ? x2011ModelUrl : starvedModelUrl;
            loadGltfModel(modelUrl)
                .then(model => this.swapMesh(this.setupModel(model, 0)))
                .catch(err => console.error(`Failed to load ${type} model`, err));
        }

        this.maxSpeed = this.config.speed;
        this.currentSpeed = 1.0;
        this.size = this.config.size;
        this.stunned = 0;
        this.controlId = 'p2';
        this.isAI = false;

        this.velocity = new THREE.Vector3(0, 0, 0);
        this.acceleration = 0.2;
        this.damping = 0.85;

        this.navPath = null;
        this.navPathIndex = 0;
        this.navRepathTimer = 0;
        this.lastPos = { x: 0, z: 0 };
        this.stuckTimer = 0;
        this.unstickTimer = 0;
        this.unstickAngle = 0;

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
        this.grappleProjectile = null;

        this.activeBomb = null;

        this.teleportState = 'idle';
        this.teleportTimer = 0;
        this.trickeryState = 'idle';
        this.trickeryTimer = 0;
        this.trickeryAngle = 0;

        this.lungeState = 'idle';
        this.lungeTimer = 0;
        this.lungeDir = { x: 0, z: 1 };

        this.stunCount = 0;
        this.isRushing = false;
        this.rushTimer = 0;

        this.slowFrames = 0;
        this.slowMult = 1;
        this.emissiveState = null;
        this.losTarget = null;
        this.losResult = false;
        this.losTimer = 0;
    }

    swapMesh(finalMesh) {
        const spawnX = this.mesh.position.x;
        const spawnZ = this.mesh.position.z;
        const spawnRot = this.mesh.rotation.y;

        this.scene.remove(this.mesh);
        this.mesh = finalMesh;
        this.mesh.position.set(spawnX, 6, spawnZ);
        this.mesh.rotation.y = spawnRot;
        this.scene.add(this.mesh);
        this.emissiveState = null;
    }

    setupModel(model, yawOffset) {
        const yawGroup = new THREE.Group();
        const modelGroup = new THREE.Group();
        modelGroup.rotation.y = yawOffset;
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

    // Traversing the whole model graph every frame was one of the biggest CPU
    // costs in play: only touch materials when the desired glow actually changes.
    setGlow(colorHex) {
        if (this.emissiveState === colorHex) return;
        this.emissiveState = colorHex;
        this.setEmissive(colorHex);
    }

    destroy() {
        if (this.grappleLine) this.removeGrappleLine();
        if (this.activeBomb) this.removeBomb();
        this.scene.remove(this.mesh);
    }

    stun(duration) {
        this.stunned = duration;
        this.setGlow(0xffffff);
        this.velocity.set(0,0,0);
        this.currentSpeed = 1.0;
        // A stunned killer drops whatever it was winding up.
        this.lungeState = 'idle';
        this.lungeTimer = 0;
        if (this.grappleState === 'shooting') { this.grappleState = 'idle'; this.removeGrappleLine(); }

        if (this.type === '2011X' && this.config.rush && !this.isRushing) {
            this.stunCount++;
            if (this.stunCount >= this.config.rush.stunThreshold) {
                this.isRushing = true;
                this.rushTimer = this.config.rush.duration;
                this.stunCount = 0;
                this.setGlow(0xff0000);
            }
        }
    }

    resolveWallStuck(obstacles) {
        for (let obs of obstacles) {
            const wallTopY = obs.mesh.position.y + 5;
            const killerBaseY = this.mesh.position.y - 6;
            if (killerBaseY < wallTopY - 0.2) {
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

    update(obstacles, players, gameManager) {
        if (gameManager && gameManager.dev && gameManager.dev.freezeKiller) {
            this.velocity.set(0, 0, 0);
            this.resolveWallStuck(obstacles);
            return;
        }

        if (this.isRushing) {
            this.rushTimer--;
            if (this.rushTimer <= 0) {
                this.isRushing = false;
                this.setGlow(0x550000);
            }
        }

        if (this.stunned > 0) {
            this.stunned--;
            if (this.stunned === 0 && !this.isRushing) this.setGlow(0x550000);
            this.velocity.x *= this.damping; this.velocity.z *= this.damping;
            this.mesh.position.x += this.velocity.x;
            this.mesh.position.z += this.velocity.z;
            this.resolveWallStuck(obstacles);
            return;
        }

        let dx = 0, dz = 0;

        if (this.isAI) {
            let target = null;
            let minDistSq = Infinity;
            const visionSq = (this.config.ai?.visionRange || 9999) ** 2;
            for (const p of players) {
                if (p.health <= 0) continue;
                const pdx = p.mesh.position.x - this.mesh.position.x;
                const pdz = p.mesh.position.z - this.mesh.position.z;
                const dSq = pdx * pdx + pdz * pdz;
                if (dSq < minDistSq && dSq <= visionSq) { minDistSq = dSq; target = p; }
            }

            if (target) {
                let tdx = target.mesh.position.x - this.mesh.position.x;
                let tdz = target.mesh.position.z - this.mesh.position.z;
                let dist = Math.sqrt(minDistSq);

                const attackRange = this.config.ai?.attackRange || 12;
                this.controls.m1 = dist <= attackRange;

                if (this.type === 'Tripwire' && this.config.abilities && !this.isRushing) {
                    this.controls.ability1 = (dist <= (this.config.abilities.grapple?.range || 60) && this.ability1Cooldown <= 0 && this.hasLineOfSight(target, obstacles));
                    this.controls.ability2 = (dist <= (this.config.abilities.bomb?.throwRange || 80) && this.ability2Cooldown <= 0);
                }
                if (this.type === '2011X' && this.config.abilities && !this.isRushing) {
                    this.controls.ability1 = (dist <= 60 && this.ability1Cooldown <= 0);
                    this.controls.ability2 = (dist <= 50 && this.ability2Cooldown <= 0);
                }
                if (this.type === 'Starved' && this.config.abilities && !this.isRushing) {
                    const snareCfg = this.config.abilities.snare;
                    this.controls.ability1 = (this.lungeState === 'idle' && this.ability1Cooldown <= 0 && dist <= 34 && dist > 10);
                    this.controls.ability2 = (this.ability2Cooldown <= 0 && dist > 18 && dist <= snareCfg.range && this.hasLineOfSight(target, obstacles));
                }

                if (dist > attackRange) {
                    this.updateStuckDetection();

                    let dir = null;
                    if (this.unstickTimer > 0) {
                        this.unstickTimer--;
                        dir = { x: Math.sin(this.unstickAngle), z: Math.cos(this.unstickAngle) };
                    } else if (dist < 15 || (dist < 100 && this.hasLineOfSight(target, obstacles))) {
                        dir = { x: tdx / dist, z: tdz / dist };
                    } else {
                        dir = this.getNavDirection(target, obstacles);
                    }
                    if (!dir) dir = { x: tdx / dist, z: tdz / dist };
                    dx = dir.x;
                    dz = dir.z;
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

        if (dx !== 0 && dz !== 0 && !this.isAI) { dx *= 0.707; dz *= 0.707; }

        // Starved: start a pounce if asked (captures the direction now, the
        // leap itself is locked to it).
        if (this.type === 'Starved' && !this.isRushing) {
            this.tryStartLunge(dx, dz, gameManager);
        }
        // During an active leap the direction is locked.
        if (this.lungeState === 'active') { dx = this.lungeDir.x; dz = this.lungeDir.z; }

        let isMoving = (dx !== 0 || dz !== 0);
        if (isMoving) this.currentSpeed += (this.maxSpeed - this.currentSpeed) * 0.02;
        else this.currentSpeed += (1.0 - this.currentSpeed) * 0.05;

        let currentSpeed = this.currentSpeed;
        if (this.isRushing) currentSpeed *= this.config.rush.speedMultiplier;
        if (this.lungeState === 'active') currentSpeed *= this.config.abilities.lunge.speedMultiplier;
        else if (this.lungeState === 'windup') currentSpeed *= 0.35;
        if (this.slowFrames > 0) { currentSpeed *= this.slowMult; this.slowFrames--; }

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
            const wallTopY = obs.mesh.position.y + 5;
            if (this.mesh.position.y - 6 < wallTopY - 0.2) {
                if (checkCircleBoxCollision(nextX, this.mesh.position.z, this.size, obs.x, obs.z, obs.w, obs.d)) collideX = true;
                if (checkCircleBoxCollision(this.mesh.position.x, nextZ, this.size, obs.x, obs.z, obs.w, obs.d)) collideZ = true;
            }
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
                this.updateGrapple(players, obstacles, gameManager);
                this.updateBomb(players, obstacles, gameManager);
            }
            if (this.type === '2011X' && this.config.abilities) {
                this.updateTeleport(players, gameManager);
                this.updateTrickery(players, gameManager);
            }
            if (this.type === 'Starved' && this.config.abilities) {
                this.stepLunge(players, gameManager);
                this.updateSnare(players, obstacles, gameManager);
            }
        }

        let isWindingUp = false;
        if (this.type === 'Tripwire') {
            if (this.grappleState === 'shooting') isWindingUp = true;
            if (this.activeBomb && this.activeBomb.state === 'flying') isWindingUp = true;
        }
        if (this.type === '2011X') {
            if (this.teleportState === 'windup') isWindingUp = true;
            if (this.trickeryState === 'active') isWindingUp = true;
        }
        if (this.type === 'Starved' && this.lungeState === 'windup') isWindingUp = true;

        if (isWindingUp) {
            const want = Math.floor(Date.now() / 100) % 2 === 0 ? 0xffffff : 0x550000;
            this.setGlow(want);
        } else if (this.type === 'Starved' && this.lungeState === 'active') {
            this.setGlow(0xff3300);
        } else {
            this.setGlow(0x550000);
        }

        this.resolveWallStuck(obstacles);
    }

    // ---- Starved: Pounce (ability 1) ----

    tryStartLunge(dx, dz, gameManager) {
        if (!this.controls.ability1 || this.ability1Cooldown > 0 || this.lungeState !== 'idle') return;
        const cfg = this.config.abilities.lunge;
        this.lungeState = 'windup';
        this.lungeTimer = cfg.windup;
        if (dx !== 0 || dz !== 0) {
            const l = Math.hypot(dx, dz);
            this.lungeDir = { x: dx / l, z: dz / l };
        } else {
            this.lungeDir = { x: Math.sin(this.mesh.rotation.y), z: Math.cos(this.mesh.rotation.y) };
        }
        this.ability1Cooldown = cfg.cooldown;
        gameManager.audio.playSfx(this.type, cfg.sfx);
    }

    stepLunge(players, gameManager) {
        if (this.lungeState === 'windup') {
            this.lungeTimer--;
            if (this.lungeTimer <= 0) {
                this.lungeState = 'active';
                this.lungeTimer = this.config.abilities.lunge.activeDuration;
            }
            return;
        }
        if (this.lungeState !== 'active') return;

        const cfg = this.config.abilities.lunge;
        const reach = this.size + 4;
        const reachSq = reach * reach;
        for (const p of players) {
            if (p.health <= 0 || p.escaped) continue;
            const pdx = p.mesh.position.x - this.mesh.position.x;
            const pdz = p.mesh.position.z - this.mesh.position.z;
            if (pdx * pdx + pdz * pdz > reachSq) continue;
            p.takeDamage(cfg.damage, this);
            if (p.health > 0) {
                const kl = Math.hypot(pdx, pdz) || 1;
                p.mesh.position.x += (pdx / kl) * cfg.knockback;
                p.mesh.position.z += (pdz / kl) * cfg.knockback;
                p.hitSpeedBoost = 30; // survivors get a short scramble boost after being launched
            }
            this.lungeState = 'idle';
            this.lungeTimer = 0;
            return;
        }

        this.lungeTimer--;
        if (this.lungeTimer <= 0) this.lungeState = 'idle';
    }

    // ---- Starved: Snare Toss (ability 2) ----

    updateSnare(players, obstacles, gameManager) {
        const cfg = this.config.abilities.snare;
        if (!cfg) return;
        if (!this.controls.ability2 || this.ability2Cooldown > 0) return;

        let target = null;
        let minDistSq = cfg.range * cfg.range;
        for (const p of players) {
            if (p.health <= 0 || p.escaped) continue;
            const pdx = p.mesh.position.x - this.mesh.position.x;
            const pdz = p.mesh.position.z - this.mesh.position.z;
            const dSq = pdx * pdx + pdz * pdz;
            if (dSq < minDistSq && this.hasLineOfSight(p, obstacles)) {
                minDistSq = dSq;
                target = p;
            }
        }
        if (!target) return;

        const dx = target.mesh.position.x - this.mesh.position.x;
        const dz = target.mesh.position.z - this.mesh.position.z;
        const dist = Math.hypot(dx, dz) || 1;

        gameManager.spawnProjectile(
            this.mesh.position.x, this.mesh.position.z,
            dx / dist, dz / dist, this,
            { side: 'survivor', root: cfg.rootDuration, damage: cfg.damage, speed: cfg.projectileSpeed, color: 0x9be564 }
        );
        this.ability2Cooldown = cfg.cooldown;
        gameManager.audio.playSfx(this.type, cfg.sfx);
    }

    hasLineOfSight(target, obstacles) {
        // The raw sweep runs up to ~45 x obstacles per call and is asked for nearly
        // every tick by the AI: reuse a stale-free-by-5-ticks result per target.
        if (this.losTarget === target && this.losTimer > 0) {
            this.losTimer--;
            return this.losResult;
        }
        this.losTarget = target;
        this.losTimer = 5;
        this.losResult = this.computeLineOfSight(target, obstacles);
        return this.losResult;
    }

    computeLineOfSight(target, obstacles) {
        const sx = this.mesh.position.x, sz = this.mesh.position.z;
        const dx = target.mesh.position.x - sx;
        const dz = target.mesh.position.z - sz;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.001) return true;

        const steps = Math.max(1, Math.ceil(dist / 4));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const px = sx + dx * t;
            const pz = sz + dz * t;
            for (let obs of obstacles) {
                if (checkCircleBoxCollision(px, pz, this.size, obs.x, obs.z, obs.w, obs.d)) return false;
            }
        }
        return true;
    }

    updateStuckDetection() {
        const moved = Math.hypot(this.mesh.position.x - this.lastPos.x, this.mesh.position.z - this.lastPos.z);
        this.lastPos = { x: this.mesh.position.x, z: this.mesh.position.z };
        if (moved < 0.5) this.stuckTimer++; else this.stuckTimer = 0;
        if (this.stuckTimer > 45) {
            this.stuckTimer = 0;
            this.navRepathTimer = 0;
            this.unstickTimer = 30;
            this.unstickAngle = Math.random() * Math.PI * 2;
        }
    }

    getNavDirection(target, obstacles) {
        this.navRepathTimer--;
        if (this.navRepathTimer <= 0) {
            this.navRepathTimer = 15;
            this.computeNavPath(target, obstacles);
        }

        const path = this.navPath;
        if (!path || path.length === 0) return null;

        let idx = this.navPathIndex;
        while (idx < path.length - 1 &&
               Math.hypot(path[idx].x - this.mesh.position.x, path[idx].z - this.mesh.position.z) < 5) {
            idx++;
        }
        this.navPathIndex = idx;

        const wdx = path[idx].x - this.mesh.position.x;
        const wdz = path[idx].z - this.mesh.position.z;
        const wdist = Math.hypot(wdx, wdz);
        if (wdist < 0.001) return null;
        return { x: wdx / wdist, z: wdz / wdist };
    }

    computeNavPath(target, obstacles) {
        const grid = this.buildNavGrid(obstacles);
        this.navPath = computePath(this.mesh.position.x, this.mesh.position.z, target.mesh.position.x, target.mesh.position.z, grid);
        this.navPathIndex = this.navPath ? Math.min(1, this.navPath.length - 1) : 0;
    }

    buildNavGrid(obstacles) {
        return buildNavGrid(obstacles, this.size + 0.5);
    }

    worldToCell(x, z, grid) {
        return worldToCell(x, z, grid);
    }

    nearestFreeCell(cell, grid) {
        return nearestFreeCell(cell, grid);
    }

    updateM1(players, gameManager, dx, dz) {
        if (this.controls.m1 && this.m1State === 'idle' && this.m1Cooldown <= 0) {
            this.m1State = 'windup';
            this.m1Timer = this.config.m1.windup || 0;
            this.m1HitboxCount = 0;
            if (dx !== 0 || dz !== 0) { this.m1AttackAngle.set(dx, 0, dz).normalize(); }
            else { this.m1AttackAngle.set(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y)).normalize(); }

            gameManager.audio.playSfx(this.type, this.config.m1.sfx);
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
            gameManager.audio.playSfx(this.type, tpCfg.sfx);
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
                this.navPath = null;
                this.navRepathTimer = 0;
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
            gameManager.audio.playSfx(this.type, trickCfg.sfx);

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

    updateGrapple(players, obstacles, gameManager) {
        const cfg = this.config.abilities.grapple;
        if (!cfg) return;

        if (this.grappleState === 'idle') {
            if (this.controls.ability1 && this.ability1Cooldown <= 0) {
                let target = null;
                let minDist = Infinity;
                players.forEach(p => {
                    if (p.health > 0) {
                        let d = Math.hypot(p.mesh.position.x - this.mesh.position.x, p.mesh.position.z - this.mesh.position.z);
                        if (d < minDist) {
                            minDist = d; target = p;
                        }
                    }
                });

                if (target && minDist <= cfg.range && this.hasLineOfSight(target, obstacles)) {
                    this.grappleState = 'shooting';
                    this.grappleTarget = target;
                    this.grappleProjectile = { x: this.mesh.position.x, z: this.mesh.position.z };
                    this.ability1Cooldown = cfg.cooldown;
                    gameManager.audio.playSfx(this.type, cfg.sfx);

                    const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
                    const geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
                    this.grappleLine = new THREE.Line(geometry, material);
                    this.grappleLine.frustumCulled = false;
                    this.scene.add(this.grappleLine);
                    this.updateGrappleLine(this.grappleProjectile.x, this.grappleProjectile.z);
                }
            }
        }
        else if (this.grappleState === 'shooting') {
            if (!this.grappleTarget || this.grappleTarget.health <= 0) {
                this.grappleState = 'idle';
                this.removeGrappleLine();
                return;
            }

            const dx = this.grappleTarget.mesh.position.x - this.grappleProjectile.x;
            const dz = this.grappleTarget.mesh.position.z - this.grappleProjectile.z;
            const dist = Math.hypot(dx, dz);

            if (dist > 0) {
                this.grappleProjectile.x += (dx / dist) * cfg.projectileSpeed;
                this.grappleProjectile.z += (dz / dist) * cfg.projectileSpeed;
            }

            this.updateGrappleLine(this.grappleProjectile.x, this.grappleProjectile.z);

            if (Math.hypot(this.grappleTarget.mesh.position.x - this.grappleProjectile.x, this.grappleTarget.mesh.position.z - this.grappleProjectile.z) < 5 + this.grappleTarget.size) {
                this.grappleTarget.takeDamage(cfg.damage, this);
                this.grappleState = 'dragging';
                this.grappleTimer = cfg.dragDuration;
            } else {
                let hitWall = false;
                for (let obs of obstacles) {
                    if (checkCircleBoxCollision(this.grappleProjectile.x, this.grappleProjectile.z, 2, obs.x, obs.z, obs.w, obs.d)) {
                        hitWall = true; break;
                    }
                }
                const distFromKiller = Math.hypot(this.grappleProjectile.x - this.mesh.position.x, this.grappleProjectile.z - this.mesh.position.z);
                if (hitWall || distFromKiller > cfg.range) {
                    this.grappleState = 'idle';
                    this.removeGrappleLine();
                }
            }
        }
        else if (this.grappleState === 'dragging') {
            if (this.grappleTarget && this.grappleTarget.health > 0) {
                const dx = this.mesh.position.x - this.grappleTarget.mesh.position.x;
                const dz = this.mesh.position.z - this.grappleTarget.mesh.position.z;
                const dist = Math.hypot(dx, dz);

                if (dist > 5) {
                    const t = this.grappleTarget;
                    const stepX = (dx / dist) * cfg.dragSpeed;
                    const stepZ = (dz / dist) * cfg.dragSpeed;
                    if (!this.posBlocked(t.mesh.position.x + stepX, t.mesh.position.z, t.size, obstacles)) t.mesh.position.x += stepX;
                    if (!this.posBlocked(t.mesh.position.x, t.mesh.position.z + stepZ, t.size, obstacles)) t.mesh.position.z += stepZ;

                    this.updateGrappleLine(t.mesh.position.x, t.mesh.position.z);
                } else {
                    this.grappleState = 'idle';
                    this.removeGrappleLine();
                }

                this.grappleTimer--;
                if (this.grappleTimer <= 0) {
                    this.grappleState = 'idle';
                    this.removeGrappleLine();
                }
            } else {
                this.grappleState = 'idle';
                this.removeGrappleLine();
            }
        }
    }

    posBlocked(x, z, size, obstacles) {
        for (let obs of obstacles) {
            if (checkCircleBoxCollision(x, z, size, obs.x, obs.z, obs.w, obs.d)) return true;
        }
        return false;
    }

    removeGrappleLine() {
        if (this.grappleLine) {
            this.scene.remove(this.grappleLine);
            this.grappleLine.geometry.dispose();
            this.grappleLine.material.dispose();
            this.grappleLine = null;
        }
    }

    // Updates the 2-point line in place: setFromPoints rebuilt (and reallocated)
    // the position buffer every frame the grapple was alive.
    updateGrappleLine(x2, z2) {
        if (!this.grappleLine) return;
        const pos = this.grappleLine.geometry.attributes.position;
        pos.setXYZ(0, this.mesh.position.x, 6, this.mesh.position.z);
        pos.setXYZ(1, x2, 6, z2);
        pos.needsUpdate = true;
    }

    updateBomb(players, obstacles, gameManager) {
        const cfg = this.config.abilities.bomb;
        if (!cfg) return;

        if (this.controls.ability2 && this.ability2Cooldown <= 0 && !this.activeBomb) {
            const geo = new THREE.SphereGeometry(3, 8, 8);
            const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x550000 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(this.mesh.position);
            mesh.position.y = 3;
            this.scene.add(mesh);

            this.activeBomb = {
                mesh: mesh,
                state: 'placed',
                vx: 0,
                vz: 0,
                lifetime: cfg.lifetime,
                placeTimer: 180
            };
            this.ability2Cooldown = cfg.cooldown;
            gameManager.audio.playSfx(this.type, cfg.sfx);
        } else if (this.controls.ability2 && this.activeBomb && this.activeBomb.state === 'placed' && this.activeBomb.placeTimer <= 0) {
            let target = null;
            let minDist = Infinity;
            players.forEach(p => {
                if (p.health > 0) {
                    let d = Math.hypot(p.mesh.position.x - this.mesh.position.x, p.mesh.position.z - this.mesh.position.z);
                    if (d < minDist) {
                        minDist = d; target = p;
                    }
                }
            });

            if (target) {
                const bomb = this.activeBomb;
                const dx = target.mesh.position.x - bomb.mesh.position.x;
                const dz = target.mesh.position.z - bomb.mesh.position.z;
                const dist = Math.hypot(dx, dz) || 1;
                bomb.vx = (dx / dist) * cfg.launchSpeed;
                bomb.vz = (dz / dist) * cfg.launchSpeed;
                bomb.state = 'flying';
                gameManager.audio.playSfx(this.type, cfg.sfx);
            }
        }

        if (this.activeBomb) {
            let bomb = this.activeBomb;
            bomb.lifetime--;
            if (bomb.placeTimer > 0) bomb.placeTimer--;

            if (bomb.state === 'flying') {
                bomb.mesh.position.x += bomb.vx;
                bomb.mesh.position.z += bomb.vz;

                let hitWall = false;
                for (let obs of obstacles) {
                    const wallTopY = obs.mesh.position.y + 5;
                    if (bomb.mesh.position.y < wallTopY) {
                        if (checkCircleBoxCollision(bomb.mesh.position.x, bomb.mesh.position.z, 3, obs.x, obs.z, obs.w, obs.d)) {
                            hitWall = true; break;
                        }
                    }
                }

                let hitPlayer = null;
                players.forEach(p => {
                    if (p.health > 0) {
                        if (Math.hypot(p.mesh.position.x - bomb.mesh.position.x, p.mesh.position.z - bomb.mesh.position.z) < 5 + p.size) {
                            hitPlayer = p;
                        }
                    }
                });

                if (hitPlayer) {
                    hitPlayer.takeDamage(cfg.impactDamage, this);
                    players.forEach(p => {
                        if (p.health > 0 && p !== hitPlayer) {
                            if (Math.hypot(p.mesh.position.x - bomb.mesh.position.x, p.mesh.position.z - bomb.mesh.position.z) < cfg.explodeRadius) {
                                p.takeDamage(cfg.aoeDamage, this);
                            }
                        }
                    });
                    gameManager.audio.playSfx(this.type, cfg.explosionSfx);
                    this.removeBomb();
                } else if (hitWall) {
                    bomb.state = 'proximity';
                }
            } else if (bomb.state === 'proximity') {
                let triggered = false;
                players.forEach(p => {
                    if (p.health > 0) {
                        if (Math.hypot(p.mesh.position.x - bomb.mesh.position.x, p.mesh.position.z - bomb.mesh.position.z) < cfg.proximityRadius) {
                            triggered = true;
                        }
                    }
                });

                if (triggered) {
                    players.forEach(p => {
                        if (p.health > 0) {
                            if (Math.hypot(p.mesh.position.x - bomb.mesh.position.x, p.mesh.position.z - bomb.mesh.position.z) < cfg.explodeRadius) {
                                p.takeDamage(cfg.proximityDamage, this);
                            }
                        }
                    });
                    gameManager.audio.playSfx(this.type, cfg.explosionSfx);
                    this.removeBomb();
                }
            }

            if (bomb.lifetime <= 0) this.removeBomb();
        }
    }

    removeBomb() {
        if (this.activeBomb) {
            this.scene.remove(this.activeBomb.mesh);
            this.activeBomb.mesh.geometry.dispose();
            this.activeBomb.mesh.material.dispose();
            this.activeBomb = null;
        }
    }
}
