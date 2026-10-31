import * as THREE from 'three';
import { checkCircleBoxCollision, checkCircleCircleCollision } from '../engine/Collision.js';
import { SurvivorVariables } from '../config/SurvivorVariables.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import sonicModelUrl from '../assets/models/Sonic/Sonic.dae';
import sonicTextureUrl from '../assets/models/Sonic/PLAYER00.png';
import knucklesModelUrl from '../assets/models/Knuckles/Knuckles.dae';
import knucklesTextureUrl from '../assets/models/Knuckles/PLAYER00.png';
import tailsModelUrl from '../assets/models/Tails/Tails.dae';
import tailsTextureUrl from '../assets/models/Tails/PLAYER00.png';
import gasterModelUrl from '../assets/models/Gaster/gaster.glb';

// Reused every tick by ability code paths - never allocate vectors in update().
const _dir = new THREE.Vector3();

// Parsed models are cached here and cloned on reuse so restarts / online clients
// don't re-download and re-parse the same Collada/GLTF files.
const modelCache = new Map();

function loadColladaModel(url, textureUrl) {
    if (modelCache.has(url)) {
        return Promise.resolve(modelCache.get(url).clone(true));
    }
    const textureLoader = new THREE.TextureLoader();
    const loader = new ColladaLoader();
    return new Promise((resolve, reject) => {
        textureLoader.load(textureUrl, (texture) => {
            texture.flipY = false;
            texture.colorSpace = THREE.SRGBColorSpace;
            loader.load(url, (collada) => {
                const model = collada.scene;
                model.traverse((node) => {
                    if (node.isMesh) {
                        node.material = new THREE.MeshStandardMaterial({ map: texture, transparent: true });
                        node.castShadow = true;
                    }
                });
                modelCache.set(url, model);
                resolve(model.clone(true));
            }, undefined, reject);
        }, undefined, reject);
    });
}

function loadGltfModel(url) {
    if (modelCache.has(url)) {
        return Promise.resolve(modelCache.get(url).clone(true));
    }
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

            loadColladaModel(modelUrl, textureUrl)
                .then(model => this.swapMesh(this.setupModel(model)))
                .catch(err => console.error(`Failed to load ${charName} model`, err));
        }
        else if (charName === 'Gaster') {
            loadGltfModel(gasterModelUrl)
                .then(model => this.swapMesh(this.setupModel(model)))
                .catch(err => console.error('Failed to load Gaster model', err));
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
        this.rootTimer = 0;

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

        this.flyCharges = this.config.abilities?.fly?.maxCharges || 0;
        this.flyCooldown = 0;
        this.flyChargeCooldown = 0;
        this.flyBoostTimer = 0;
        this.carryTarget = null;
        this.isCarried = false;
        this.gunCharging = false;
        this.gunChargeTimer = 0;
        this.gasterTpState = 'idle';
        this.gasterTpTimer = 0;

        this.healState = 'idle';
        this.healTimer = 0;
        this.healTotalGranted = 0;
        this.healTickTimer = 0;
        this.healStreak = 0;
        this.healTarget = null;
        this.escaped = false;
        this.qteActive = false;
        this.qteTimer = 0;
        this.qteGapTimer = 0;
        this.qteZoneStart = 0;
        this.qteCount = 0;
        this.prevAbility1 = false;
        this.prevAbility2 = false;
        // Input buffer: presses land up to half a second before a cooldown
        // ends still fire the moment the ability is ready.
        this.ab1Buf = 0;
        this.ab2Buf = 0;
        this.sonicWindup = 0;
        this.sonicShieldTimer = 0;
        this.creamDashTimer = 0;
        this.dashDamageReduction = 0;
        this.dashDir = { x: 0, z: 1 };
        this.endlagTimer = 0;
        this.endlagStrength = 0;
        this.emissiveState = null;
        this.cheeseBob = 0;
        this.cheeseMesh = null;
        this.cheeseHealRing = null;
        this.solFlameTimer = 0;
        this.solFlameHit = null;
        this.flameAura = null;
        this.fireBoostFrames = 0;
        this.fireBoostMult = 1;

        if (charName === 'Cream') {
            const heal = this.config.abilities.heal;
            this.cheeseSize = heal.cheeseSize;
            this.cheeseMesh = new THREE.Mesh(
                new THREE.SphereGeometry(heal.cheeseSize, 16, 12),
                new THREE.MeshStandardMaterial({ color: 0x8fd6ff })
            );
            this.cheeseMesh.castShadow = true;
            this.cheeseMesh.position.set(this.mesh.position.x + 4, 4, this.mesh.position.z + 4);
            scene.add(this.cheeseMesh);

            this.cheeseHealRing = new THREE.Mesh(
                new THREE.TorusGeometry(heal.healRadius, 0.35, 8, 48),
                new THREE.MeshBasicMaterial({ color: 0x33ff66, transparent: true, opacity: 0.5 })
            );
            this.cheeseHealRing.rotation.x = Math.PI / 2;
            this.cheeseHealRing.visible = false;
            scene.add(this.cheeseHealRing);
        }

        if (charName === 'Knuckles') {
            const ringGeo = new THREE.TorusGeometry(this.size + 4, 0.5, 8, 24);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.7 });
            this.blockMesh = new THREE.Mesh(ringGeo, ringMat);
            this.blockMesh.rotation.x = Math.PI / 2;
            this.blockMesh.visible = false;
            this.mesh.add(this.blockMesh);
        }

        if (charName === 'Blaze') {
            this.flameAura = new THREE.Mesh(
                new THREE.SphereGeometry(this.config.size + 4, 16, 12),
                new THREE.MeshBasicMaterial({
                    color: 0xff6600,
                    transparent: true,
                    opacity: 0.25,
                    depthWrite: false,
                    blending: THREE.AdditiveBlending
                })
            );
            this.flameAura.visible = false;
            scene.add(this.flameAura);
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

        if (this.blockMesh) this.mesh.add(this.blockMesh);
    }

    takeDamage(amount, attacker) {
        if (this.gameManager && this.gameManager.dev && this.gameManager.dev.godMode) return;
        if (this.health <= 0 || this.escaped) return;
        if (amount <= 0) return;

        // Sonic's Insta-Shield: negates any real hit (not passive bleed ticks)
        // while the window is up, then consumes itself.
        if (this.characterName === 'Sonic' && this.sonicShieldTimer > 0 && attacker) {
            this.sonicShieldTimer = 0;
            this.hitSpeedBoost = this.config.abilities.shield.boostDuration;
            if (this.gameManager) this.gameManager.audio.playSfx('Sonic', this.config.abilities.shield.sfx);
            return;
        }

        // Knuckles' parry only answers direct killer hits: bleed / environment
        // damage passes straight through and cannot trigger a free killer stun.
        if (this.isBlocking && attacker && attacker.isKiller) {
            const dx = attacker.mesh.position.x - this.mesh.position.x;
            const dz = attacker.mesh.position.z - this.mesh.position.z;
            const range = (this.config.abilities.parry.parryRange || 40) + attacker.size;
            if (dx * dx + dz * dz <= range * range) {
                this.triggerBlockSuccess(attacker);
            } else {
                // Blocked a hit from too far to counter: survive it, no stun.
                this.triggerBlockedHit();
            }
            return;
        }

        if (this.dashDamageReduction > 0) amount = Math.ceil(amount * (1 - this.dashDamageReduction));
        this.health -= amount;
        this.highlightTimer = 10;
        if (this.gasterTpState === 'windup') { this.gasterTpState = 'idle'; this.gasterTpTimer = 0; }
        if (this.health <= 0) {
            this.health = 0;
            this.mesh.visible = false;
            this.isCarried = false;
            this.carryTarget = null;
            if (this.cheeseMesh) this.cheeseMesh.visible = false;
            if (this.cheeseHealRing) this.cheeseHealRing.visible = false;
            if (this.flameAura) this.flameAura.visible = false;
            if (this.healState !== 'idle') this.endHeal();
        }
    }

    findHealTarget(players) {
        let best = null, bestDist = Infinity;
        if (players) {
            for (const p of players) {
                if (p === this || p.health <= 0 || p.escaped) continue;
                const dx = p.mesh.position.x - this.mesh.position.x;
                const dz = p.mesh.position.z - this.mesh.position.z;
                const d = dx * dx + dz * dz;
                if (d < bestDist) { bestDist = d; best = p; }
            }
        }
        return best || this;
    }

    applyEndlag(cfg) {
        if (!cfg) return;
        this.endlagTimer = cfg.endlag || 0;
        this.endlagStrength = cfg.endlagStrength || 0;
    }

    endHeal() {
        this.healState = 'idle';
        this.qteActive = false;
        this.healTarget = null;
        if (this.cheeseHealRing) this.cheeseHealRing.visible = false;
        if (this.gameManager) this.gameManager.ui.hideQte();
    }

    onCheeseHit(damage) {
        if (this.healState === 'idle') return;
        const heal = this.config.abilities.heal;
        this.ability1Cooldown = Math.max(this.ability1Cooldown, heal.cooldown + heal.hitPenalty);
        if (damage > heal.dmgCancelThreshold) this.endHeal();
    }

    destroy() {
        if (this.cheeseMesh) this.scene.remove(this.cheeseMesh);
        if (this.cheeseHealRing) this.scene.remove(this.cheeseHealRing);
        if (this.flameAura) this.scene.remove(this.flameAura);
        if (this.gameManager) this.gameManager.ui.hideQte();
    }

    triggerBlockSuccess(killer) {
        this.isBlocking = false;
        this.blockTimer = 0;
        if (this.blockMesh) this.blockMesh.visible = false;
        this.ability1Cooldown = this.config.abilities.parry.cooldown;
        this.dashActive = this.config.abilities.parry.speedBoostDuration;
        killer.stun(this.config.abilities.parry.stunDuration);
        this.health = Math.min(this.health + 10, Math.ceil(this.maxHealth * 1.5));
    }

    // Blocked a killer hit from outside counter range: the hit is absorbed but
    // the parry is still spent.
    triggerBlockedHit() {
        this.isBlocking = false;
        this.blockTimer = 0;
        if (this.blockMesh) this.blockMesh.visible = false;
        this.ability1Cooldown = this.config.abilities.parry.cooldown;
    }

    performBlink(distance, obstacles) {
        let dx, dz;
        if (this.velocity.lengthSq() > 0.01) {
            const v = this.velocity.clone().normalize();
            dx = v.x; dz = v.z;
        } else {
            dx = Math.sin(this.mesh.rotation.y);
            dz = Math.cos(this.mesh.rotation.y);
        }

        for (let d = distance; d > 0; d -= 2) {
            const tx = Math.max(-90, Math.min(90, this.mesh.position.x + dx * d));
            const tz = Math.max(-90, Math.min(90, this.mesh.position.z + dz * d));
            if (!this.posBlockedAt(tx, tz, obstacles)) {
                this.mesh.position.x = tx;
                this.mesh.position.z = tz;
                return true;
            }
        }
        return false;
    }

    posBlockedAt(x, z, obstacles) {
        for (let obs of obstacles) {
            if (checkCircleBoxCollision(x, z, this.size, obs.x, obs.z, obs.w, obs.d)) return true;
        }
        return false;
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
        if (this.highlightTimer > 0) this.highlightTimer--;
        if (this.sonicShieldTimer > 0) this.sonicShieldTimer--;

        // Edge detection once per tick, shared by every character's abilities.
        const fresh1 = this.controls.ability1 && !this.prevAbility1;
        const fresh2 = this.controls.ability2 && !this.prevAbility2;
        if (fresh1) this.ab1Buf = 30;
        else if (this.ab1Buf > 0) this.ab1Buf--;
        if (fresh2) this.ab2Buf = 30;
        else if (this.ab2Buf > 0) this.ab2Buf--;
        this.prevAbility1 = this.controls.ability1;
        this.prevAbility2 = this.controls.ability2;
        // Buffered edge: a press made up to 0.5s before the cooldown ends still
        // counts. Every fire site is cooldown-gated, so the buffer can never
        // double-fire; holding a key still never auto-repeats (the buffer only
        // lives 30 ticks after the press).
        const a1Edge = fresh1 || this.ab1Buf > 0;
        const a2Edge = fresh2 || this.ab2Buf > 0;

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
        }

        let want = 0x000000;
        if (this.highlightTimer > 0) want = 0xff0000;
        else if (this.sonicShieldTimer > 0) want = 0x2288ff;
        else if (this.creamDashTimer > 0) want = 0x00aaff;
        else if (this.characterName === 'Gaster' && this.gasterTpState === 'windup') want = 0xaa00ff;
        else if (this.invertedControlsTimer > 0) want = 0xff00ff;
        else if (this.rootTimer > 0) want = 0x8899bb;
        if (want !== this.emissiveState) {
            this.setEmissive(want);
            this.emissiveState = want;
        }

        let dx = 0, dz = 0;
        if (up) dz -= 1;
        if (down) dz += 1;
        if (left) dx -= 1;
        if (right) dx += 1;
        if (dx !== 0 && dz !== 0) { dx *= 0.707; dz *= 0.707; }

        // Rooted (Starved's snare): planted in place until the timer expires.
        if (this.rootTimer > 0) {
            this.rootTimer--;
            dx = 0;
            dz = 0;
        }

        let currentSpeed = this.speed;
        if (this.dashActive > 0) { currentSpeed *= 2.0; this.dashActive--; }
        if (this.hitSpeedBoost > 0) { currentSpeed *= 1.3; this.hitSpeedBoost--; }
        if (this.endlagTimer > 0) { currentSpeed *= (1 - this.endlagStrength); this.endlagTimer--; }
        if (this.fireBoostFrames > 0) { currentSpeed *= this.fireBoostMult; this.fireBoostFrames--; }

        if (this.ability1Cooldown > 0) this.ability1Cooldown--;
        if (this.ability2Cooldown > 0) this.ability2Cooldown--;
        if (this.padCooldown > 0) this.padCooldown--;
        if (this.flyBoostTimer > 0) this.flyBoostTimer--;
        if (this.flyChargeCooldown > 0) this.flyChargeCooldown--;

        if (this.characterName === 'Sonic') {
            // Dash: triggered on key press (was re-triggering while the key was
            // held down the moment the cooldown expired).
            if (this.sonicWindup > 0) {
                this.sonicWindup--;
                if (this.sonicWindup <= 0) {
                    this.dashActive = this.config.abilities.dash.duration;
                    this.ability1Cooldown = this.config.abilities.dash.cooldown;
                    this.applyEndlag(this.config.abilities.dash);
                    gameManager.audio.playSfx('Sonic', this.config.abilities.dash.sfx);
                }
            } else if (a1Edge && this.ability1Cooldown <= 0) {
                this.sonicWindup = this.config.abilities.dash.windup;
            }

            // Insta-Shield (Ab2): brief window that eats the next hit.
            if (a2Edge && this.ability2Cooldown <= 0 && this.sonicShieldTimer <= 0) {
                this.sonicShieldTimer = this.config.abilities.shield.window;
                this.ability2Cooldown = this.config.abilities.shield.cooldown;
                gameManager.audio.playSfx('Sonic', this.config.abilities.shield.sfx);
            }
        }
        else if (this.characterName === 'Knuckles') {
            if (this.isBlocking) {
                this.blockTimer--;
                if (this.blockTimer <= 0) { this.isBlocking = false; if (this.blockMesh) this.blockMesh.visible = false; }
            }
            if (a1Edge && this.ability1Cooldown <= 0 && !this.isBlocking) {
                this.isBlocking = true;
                this.blockTimer = this.config.abilities.parry.duration;
                this.ability1Cooldown = this.config.abilities.parry.cooldown;
                this.applyEndlag(this.config.abilities.parry);
                if (this.blockMesh) this.blockMesh.visible = true;
                gameManager.audio.playSfx('Knuckles', this.config.abilities.parry.sfx);
            }
            if (a2Edge && this.ability2Cooldown <= 0 && this.punchState === 'idle') {
                this.punchState = 'windup';
                this.punchTimer = this.config.abilities.punch.windupDuration;
                this.ability2Cooldown = this.config.abilities.punch.cooldown;
                gameManager.audio.playSfx('Knuckles', this.config.abilities.punch.sfx);
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
                _dir.set(dx, 0, dz);
                if (_dir.lengthSq() === 0) _dir.set(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
                else _dir.normalize();
                const hx = this.mesh.position.x + _dir.x * 8;
                const hz = this.mesh.position.z + _dir.z * 8;

                const hw = this.config.abilities.punch.hitboxWidth || 15;
                const hd = this.config.abilities.punch.hitboxDepth || 15;
                gameManager.spawnHitbox(hx, hz, 0, 5, this, 'knuckles_punch', 0, null, 'box', hw, hd);

                this.punchTimer--;
                if (this.punchTimer <= 0) this.punchState = 'idle';
            }
        }
        else if (this.characterName === 'Tails') {
            if (this.controls.ability1 && this.ability1Cooldown <= 0) {
                if (!this.gunCharging) {
                    this.gunCharging = true;
                    this.gunChargeTimer = 0;
                }
                if (this.gunChargeTimer < this.config.abilities.gun.maxCharge) this.gunChargeTimer++;
                currentSpeed *= 0.5;
            } else if (this.gunCharging) {
                const chargeRatio = Math.min(this.gunChargeTimer / this.config.abilities.gun.maxCharge, 1);
                const finalStun = this.config.abilities.gun.stunDuration + (chargeRatio * 120);
                _dir.set(dx, 0, dz);
                if (_dir.lengthSq() === 0) _dir.set(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
                else _dir.normalize();
                gameManager.spawnProjectile(this.mesh.position.x, this.mesh.position.z, _dir.x, _dir.z, this, finalStun, this.config.abilities.gun.projectileSpeed);
                this.ability1Cooldown = this.config.abilities.gun.cooldown;
                this.gunCharging = false;
                // Endlag applies once, on release (was re-applied every charge tick).
                this.applyEndlag(this.config.abilities.gun);
                gameManager.audio.playSfx('Tails', this.config.abilities.gun.sfx);
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
                        if (p !== this && p.health > 0 && !p.isCarried && p.mesh.position.y <= 6.1) {
                            const dx2 = p.mesh.position.x - this.mesh.position.x;
                            const dz2 = p.mesh.position.z - this.mesh.position.z;
                            if (dx2 * dx2 + dz2 * dz2 < (this.size + p.size) * (this.size + p.size)) {
                                this.carryTarget = p;
                                p.isCarried = true;
                                break;
                            }
                        }
                    }
                }
                gameManager.audio.playSfx('Tails', this.config.abilities.fly.sfx);
            }

            if (this.flyCooldown > 0) {
                this.flyCooldown--;
                if (this.flyCooldown === 0) this.flyCharges = this.config.abilities.fly.maxCharges;
            }

            if (this.flyBoostTimer > 0) {
                currentSpeed *= this.config.abilities.fly.multiplier;
            }

            if (this.carryTarget && this.carryTarget.health > 0 && !this.carryTarget.escaped) {
                this.carryTarget.mesh.position.x = this.mesh.position.x;
                this.carryTarget.mesh.position.z = this.mesh.position.z;
                this.carryTarget.mesh.position.y = this.mesh.position.y;
                this.carryTarget.velocity.copy(this.velocity);
                this.carryTarget.vertVel = this.vertVel;

                if (this.mesh.position.y <= 6.1 && this.vertVel <= 0) {
                    this.carryTarget.isCarried = false;
                    this.carryTarget = null;
                }
            } else {
                if (this.carryTarget) this.carryTarget.isCarried = false;
                this.carryTarget = null;
            }
        }

        else if (this.characterName === 'Gaster') {
            const blink = this.config.abilities.blink;
            if (this.gasterTpState === 'windup') {
                this.gasterTpTimer--;
                if (this.gasterTpTimer <= 0) {
                    if (this.performBlink(blink.distance, obstacles)) {
                        this.ability1Cooldown = blink.cooldown;
                    }
                    this.gasterTpState = 'idle';
                }
            } else if (a1Edge && this.ability1Cooldown <= 0) {
                this.gasterTpState = 'windup';
                this.gasterTpTimer = blink.windup;
            }
        }

        else if (this.characterName === 'Cream') {
            const heal = this.config.abilities.heal;

            const dash = this.config.abilities.dash;
            if (this.creamDashTimer > 0) {
                this.creamDashTimer--;

                dx = this.dashDir.x;
                dz = this.dashDir.z;
                const dl = Math.hypot(dx, dz);
                if (dl > 1) { dx /= dl; dz /= dl; }
                for (const k of killers) {
                    if (checkCircleCircleCollision(this.mesh.position.x, this.mesh.position.z, this.size, k.mesh.position.x, k.mesh.position.z, k.size)) {
                        let kbx = this.velocity.x, kbz = this.velocity.z;
                        const kbl = Math.hypot(kbx, kbz);
                        if (kbl > 0.01) { kbx /= kbl; kbz /= kbl; }
                        else { kbx = Math.sin(this.mesh.rotation.y); kbz = Math.cos(this.mesh.rotation.y); }
                        k.mesh.position.x += kbx * dash.knockback;
                        k.mesh.position.z += kbz * dash.knockback;
                        this.dashActive = 0;
                        this.creamDashTimer = 0;
                        this.dashDamageReduction = 0;
                        break;
                    }
                }
            }
            if (a2Edge && this.ability2Cooldown <= 0 && this.creamDashTimer <= 0) {
                this.dashActive = dash.duration;
                this.creamDashTimer = dash.duration;
                this.dashDamageReduction = dash.dmgReduction;
                this.ability2Cooldown = dash.cooldown;
                let ddx = this.velocity.x, ddz = this.velocity.z;
                const ddl = Math.hypot(ddx, ddz);
                if (ddl > 0.01) { ddx /= ddl; ddz /= ddl; }
                else { ddx = Math.sin(this.mesh.rotation.y); ddz = Math.cos(this.mesh.rotation.y); }
                this.dashDir = { x: ddx, z: ddz };
                this.applyEndlag(dash);
            }

            if (this.healState === 'idle') {
                if (a1Edge && this.ability1Cooldown <= 0) {
                    this.healTarget = this.findHealTarget(players);
                    this.healState = 'active';
                    this.healTotalGranted = heal.baseDuration;
                    this.healTimer = heal.baseDuration;
                    this.healTickTimer = heal.tickInterval;
                    this.healStreak = 0;
                    this.qteActive = false;
                    this.qteGapTimer = heal.qteGap;
                    this.qteCount = 0;
                    this.ability1Cooldown = heal.cooldown;
                    this.applyEndlag(heal);
                }
            } else {
                this.healTimer--;
                if (this.healTimer <= 0) {
                    this.endHeal();
                } else {
                    if (this.healTarget.health <= 0 || this.healTarget.escaped) this.healTarget = this.findHealTarget(players);
                    const tx = this.healTarget.mesh.position.x;
                    const tz = this.healTarget.mesh.position.z;
                    const arrived = Math.hypot(tx - this.cheeseMesh.position.x, tz - this.cheeseMesh.position.z) < 3;

                    if (arrived) {
                        this.cheeseHealRing.visible = true;
                        this.healTickTimer--;
                        if (this.healTickTimer <= 0) {
                            this.healTickTimer = heal.tickInterval;
                            const amount = this.healStreak >= 2 ? heal.comboHealPerTick : heal.healPerTick;
                            for (const p of players) {
                                if (p.health <= 0 || p.escaped) continue;
                                const d = Math.hypot(p.mesh.position.x - this.cheeseMesh.position.x, p.mesh.position.z - this.cheeseMesh.position.z);
                                if (d < heal.healRadius) p.health = Math.min(p.maxHealth, p.health + amount);
                            }
                        }
                    } else {
                        this.cheeseHealRing.visible = false;
                    }

                    if (this.qteActive) {
                        this.qteTimer--;
                        const progress = 1 - this.qteTimer / heal.qteWindow;
                        gameManager.ui.showQte(progress, this.qteZoneStart, heal.qteZoneWidth, this.healStreak >= 2);
                        let qteResult = null;
                        // QTE reacts to a FRESH press only: a buffered press
                        // from before the window opened must not auto-evaluate.
                        if (fresh1) {
                            qteResult = progress >= this.qteZoneStart && progress <= this.qteZoneStart + heal.qteZoneWidth;
                        } else if (this.qteTimer <= 0) {
                            qteResult = false;
                        }
                        if (qteResult !== null) {
                            this.qteActive = false;
                            this.qteGapTimer = heal.qteGap;
                            this.qteCount++;
                            if (qteResult) {
                                this.healStreak++;
                                if (this.healTotalGranted < heal.maxDuration) {
                                    const grant = Math.min(heal.qteBonus, heal.maxDuration - this.healTotalGranted);
                                    this.healTotalGranted += grant;
                                    this.healTimer += grant;
                                }
                            } else {
                                this.healStreak = 0;
                            }
                        }
                    } else {
                        this.qteGapTimer--;
                        if (this.qteGapTimer <= 0 && this.qteCount < heal.maxQtes) {
                            this.qteActive = true;
                            this.qteTimer = heal.qteWindow;
                            this.qteZoneStart = 0.08 + Math.random() * (0.84 - heal.qteZoneWidth);
                        }
                    }
                }
            }

            const follow = this.healState !== 'idle' ? this.healTarget : this;
            const fx = follow.mesh.position.x + (follow === this ? Math.sin(this.mesh.rotation.y) * heal.cheeseFollowOffset : 0);
            const fz = follow.mesh.position.z + (follow === this ? Math.cos(this.mesh.rotation.y) * heal.cheeseFollowOffset : 0);
            const cdx = fx - this.cheeseMesh.position.x;
            const cdz = fz - this.cheeseMesh.position.z;
            const cd = Math.hypot(cdx, cdz);
            if (cd > heal.cheeseCatchupDist) {
                this.cheeseMesh.position.x = fx;
                this.cheeseMesh.position.z = fz;
            } else if (cd > 0.4) {
                const step = Math.min(heal.cheeseSpeed, cd);
                this.cheeseMesh.position.x += (cdx / cd) * step;
                this.cheeseMesh.position.z += (cdz / cd) * step;
            }
            this.cheeseBob += 0.08;
            this.cheeseMesh.position.y = 4.5 + Math.sin(this.cheeseBob) * 0.7;
            if (this.cheeseHealRing.visible) {
                this.cheeseHealRing.position.x = this.cheeseMesh.position.x;
                this.cheeseHealRing.position.z = this.cheeseMesh.position.z;
            }
        }

        else if (this.characterName === 'Blaze') {
            const fw = this.config.abilities.Firewall;
            const sf = this.config.abilities.SolFlame;

            if (a1Edge && this.ability1Cooldown <= 0 && gameManager.canPlaceFireWall()) {
                this.ability1Cooldown = fw.cooldown;
                const placeDist = this.size + fw.hitboxDepth / 2 + 2;
                gameManager.spawnFireWall(
                    this,
                    this.mesh.position.x + Math.sin(this.mesh.rotation.y) * placeDist,
                    this.mesh.position.z + Math.cos(this.mesh.rotation.y) * placeDist
                );
                gameManager.audio.playSfx('Blaze', 'firewall');
            }

            if (this.controls.ability2 && this.ability2Cooldown <= 0 && this.solFlameTimer <= 0) {
                this.solFlameTimer = sf.duration;
                this.solFlameHit = new Set();
                this.ability2Cooldown = sf.cooldown;
                gameManager.audio.playSfx('Blaze', 'sol_flame');
            }

            if (this.solFlameTimer > 0) {
                this.solFlameTimer--;
                if (this.flameAura) {
                    this.flameAura.visible = this.mesh.visible;
                    this.flameAura.position.copy(this.mesh.position);
                }
                const auraRadius = this.config.size + 4;
                for (const k of killers) {
                    const kdx = k.mesh.position.x - this.mesh.position.x;
                    const kdz = k.mesh.position.z - this.mesh.position.z;
                    const reach = auraRadius + k.size;
                    if (kdx * kdx + kdz * kdz > reach * reach) continue;
                    if (!this.solFlameHit.has(k)) {
                        this.solFlameHit.add(k);
                        const kl = Math.hypot(kdx, kdz) || 1;
                        k.mesh.position.x += (kdx / kl) * sf.knockback;
                        k.mesh.position.z += (kdz / kl) * sf.knockback;
                    }
                    k.slowFrames = 8;
                    k.slowMult = sf.speedDebuf;
                }
            } else if (this.flameAura) {
                this.flameAura.visible = false;
            }
        }

        if (gameManager.mapManager && gameManager.mapManager.jumpPads) {
            for (let pad of gameManager.mapManager.jumpPads) {
                let dist = Math.hypot(this.mesh.position.x - pad.x, this.mesh.position.z - pad.z);
                if (dist < this.size + pad.size) {
                    if (this.padCooldown <= 0 && this.mesh.position.y <= 6.1) {
                        this.vertVel = gameManager.mapManager.config.padBoost;
                        this.padCooldown = gameManager.mapManager.config.padCooldown;
                        gameManager.audio.playSfx('Map', 'jump_pad');
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

        // A carried survivor's vertical motion is driven entirely by Tails.
        if (!this.isCarried) {
            let gravity = 0.15;
            if (gameManager && gameManager.dev && gameManager.dev.moonGravity) {
                gravity *= gameManager.devPanel.cfg.gravMult;
            }
            this.vertVel -= gravity;
            this.mesh.position.y += this.vertVel;

            if (this.mesh.position.y <= groundHeight) {
                this.mesh.position.y = groundHeight;
                this.vertVel = 0;
            }
        } else {
            this.vertVel = 0;
        }

        this.resolveWallStuck(obstacles);

        if (this.velocity.lengthSq() > 0.1) {
            // Ease into the new heading along the shortest arc instead of
            // snapping: turning reads smooth, and tiny velocity jitter can no
            // longer flicker the model around to the opposite direction.
            const targetRot = Math.atan2(this.velocity.x, this.velocity.z);
            let rotDelta = targetRot - this.mesh.rotation.y;
            rotDelta = Math.atan2(Math.sin(rotDelta), Math.cos(rotDelta));
            this.mesh.rotation.y += rotDelta * 0.35;
        }
    }
}
