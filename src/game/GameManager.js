import * as THREE from 'three';
import { Engine } from '../engine/Engine.js';
import { MapManager } from '../maps/MapManager.js';
import { Player } from '../entities/Player.js';
import { Killer } from '../entities/Killer.js';
import { UIManager } from '../ui/UIManager.js';
import { DevPanel } from '../ui/DevPanel.js';
import { Controls } from './Controls.js';
import { AudioManager } from './AudioManager.js';
import { Hitbox } from '../engine/Hitbox.js';
import { Projectile } from '../entities/Projectile.js';
import { Ring } from '../entities/Ring.js';
import { PointerArrow } from '../entities/PointerArrow.js';
import { checkCircleCircleCollision, checkCircleBoxCollision } from '../engine/Collision.js';

import sonicModelUrl from '../assets/models/Sonic/Sonic.dae';
import sonicTextureUrl from '../assets/models/Sonic/PLAYER00.png';
import knucklesModelUrl from '../assets/models/Knuckles/Knuckles.dae';
import knucklesTextureUrl from '../assets/models/Knuckles/PLAYER00.png';
import tailsModelUrl from '../assets/models/Tails/Tails.dae';
import tailsTextureUrl from '../assets/models/Tails/PLAYER00.png';
import tripwireModelUrl from '../assets/models/Tripwire/tdoll.obj';
import tripwireTextureUrl from '../assets/models/Tripwire/player01.png';
import x2011ModelUrl from '../assets/models/2011X/2011x.glb';
import starvedModelUrl from '../assets/models/Starved/starved_eggman.glb';
import gasterModelUrl from '../assets/models/Gaster/gaster.glb';

export class GameManager {
    constructor() {
        this.engine = new Engine();
        this.mapManager = new MapManager(this.engine.scene);
        this.ui = new UIManager(this);
        this.controls = new Controls();
        this.audio = new AudioManager();
        
        const savedHit = localStorage.getItem('om_show_hitboxes');
        this.settings = {
            showHitboxes: savedHit === null ? true : savedHit === 'true'
        };

        this.dev = {
            gasterUnlocked: false,
            godMode: false,
            freezeKiller: false,
            freezeTimers: false,
            slowMo: false,
            showFps: false,
            showNavPath: false,
            sanicMode: false,
            giantMode: false,
            moonGravity: false,
            padSlotOffset: 0
        };
        this.devPanel = new DevPanel(this);

        this.frameCount = 0;
        this.fps = 0;
        this.fpsFrames = 0;
        this.fpsStart = 0;
        this.fpsEl = null;
        this.navLine = null;

        this.state = 'MENU';
        this.keys = {};
        this.gamepadStates = {};
        this.setupInput();
        
        this.players = [];
        this.killers = [];
        this.activeHitboxes = [];
        this.projectiles = [];
        this.ring = null;
        this.arrow = null;

        this.gameSetup = {
            survivorCount: 1,
            selectedSurvivors: ['Sonic', 'Tails', 'Knuckles'], 
            selectedKillerType: 'Tripwire',
            killerPlayer: 2,
            killerIsAI: false,
            selectedMap: 'Open Field'
        };

        const startAudio = () => {
            this.audio.hasInteracted = true;
            this.ui.showScreen(this.ui.activeScreen); 
            window.removeEventListener('click', startAudio);
            window.removeEventListener('keydown', startAudio);
        };
        window.addEventListener('click', startAudio);
        window.addEventListener('keydown', startAudio);
        
        this.startGamepadPolling();
    }

    setupInput() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            if (e.code === 'Backquote' && e.shiftKey) {
                this.devPanel.toggle();
                return;
            }
            if (e.key === 'Escape' && this.state === 'PLAYING') {
                this.state = 'PAUSED';
                this.audio.stopMusic();
                this.ui.showScreen('setup');
            } else if (e.key === 'Escape' && this.state === 'PAUSED') {
                this.state = 'PLAYING';
                this.ui.initHUD();
                this.audio.playMusic(this.gameSetup.selectedKillerType);
            }
        });
        window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    }

    startGamepadPolling() {
        const poll = () => {
            const pads = navigator.getGamepads();
            this.gamepadStates = {};
            const connected = [];
            for (let i = 0; i < pads.length; i++) {
                if (pads[i]) connected.push(pads[i]);
            }
            const n = Math.max(1, connected.length);
            const off = ((this.dev.padSlotOffset % n) + n) % n;
            connected.forEach((pad, i) => {
                this.gamepadStates[`p${((i + off) % n) + 1}`] = {
                    up: pad.buttons[12]?.pressed || pad.axes[1] < -0.5,
                    down: pad.buttons[13]?.pressed || pad.axes[1] > 0.5,
                    left: pad.buttons[14]?.pressed || pad.axes[0] < -0.5,
                    right: pad.buttons[15]?.pressed || pad.axes[0] > 0.5,
                    m1: pad.buttons[0]?.pressed,
                    ability1: pad.buttons[1]?.pressed,
                    ability2: pad.buttons[2]?.pressed
                };
            });
            requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
    }

    start() {
        this.ui.showScreen('main');
        this.gameLoop();
    }

    findSafeSpawn(obstacles, minZ, maxZ) {
        let x, z, safe = false, attempts = 0;
        while (!safe && attempts < 100) {
            x = Math.random() * 120 - 60;
            z = Math.random() * (maxZ - minZ) + minZ;
            safe = true;
            for (let obs of obstacles) {
                if (checkCircleBoxCollision(x, z, 6, obs.x, obs.z, obs.w, obs.d)) { safe = false; break; }
            }
            attempts++;
        }
        return { x, z };
    }

    async startGame() {
        this.state = 'LOADING';
        this.ui.showLoadingScreen();
        
        const urlsToLoad = [];
        const survivors = this.gameSetup.selectedSurvivors.slice(0, this.gameSetup.survivorCount);
        
        if (survivors.includes('Sonic')) { urlsToLoad.push(sonicModelUrl, sonicTextureUrl); }
        if (survivors.includes('Tails')) { urlsToLoad.push(tailsModelUrl, tailsTextureUrl); }
        if (survivors.includes('Knuckles')) { urlsToLoad.push(knucklesModelUrl, knucklesTextureUrl); }
        if (survivors.includes('Gaster')) { urlsToLoad.push(gasterModelUrl); }
        
        const k = this.gameSetup.selectedKillerType;
        if (k === 'Tripwire') { urlsToLoad.push(tripwireModelUrl, tripwireTextureUrl); }
        if (k === '2011X') urlsToLoad.push(x2011ModelUrl);
        if (k === 'Starved') urlsToLoad.push(starvedModelUrl);

        try {
            await Promise.all(urlsToLoad.map(url => fetch(url)));
        } catch (e) {
            console.error("Failed to preload assets", e);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
        
        this.initializeGame();
    }

    initializeGame() {
        this.state = 'PLAYING';
        this.phase = 'ROUND';
        
        this.players.forEach(p => this.engine.scene.remove(p.mesh));
        this.killers.forEach(k => k.destroy());
        if (this.ring) this.ring.destroy();
        if (this.arrow) this.arrow.destroy();
        this.activeHitboxes.forEach(h => this.engine.scene.remove(h.mesh));
        this.projectiles.forEach(p => this.engine.scene.remove(p.mesh));
        this.players = [];
        this.killers = [];
        this.activeHitboxes = [];
        this.projectiles = [];
        this.ring = null;
        this.arrow = null;

        this.mapManager.loadMap(this.gameSetup.selectedMap);

        const allPlayers = ['p1', 'p2', 'p3', 'p4'];
        const killerId = this.gameSetup.killerIsAI ? null : `p${this.gameSetup.killerPlayer}`;
        const survivorIds = allPlayers.filter(id => id !== killerId);

        const survivorTypeColors = {
            'Sonic': 0x0064ff,
            'Tails': 0xffd700,
            'Knuckles': 0xcf2020,
            'Gaster': 0xe8e8e8
        };

        for (let i = 0; i < this.gameSetup.survivorCount; i++) {
            const sId = survivorIds[i];
            const controlsObj = { up: false, down: false, left: false, right: false, ability1: false, ability2: false, m1: false };
            
            const charName = this.gameSetup.selectedSurvivors[i];
            const pColor = survivorTypeColors[charName] || 0x0064ff;
            
            const player = new Player(this.engine.scene, controlsObj, pColor, charName);
            player.gameManager = this;
            const pSpawn = this.findSafeSpawn(this.mapManager.obstacles, -90, -50);
            player.mesh.position.set(pSpawn.x, 6, pSpawn.z);
            player.controlId = sId;
            this.players.push(player);
        }

        const k1Controls = { up: false, down: false, left: false, right: false, ability1: false, ability2: false, m1: false };
        let killerColor = 0xff0000;
        if (this.gameSetup.selectedKillerType === 'Tripwire') killerColor = 0xfcba03;
        else if (this.gameSetup.selectedKillerType === '2011X') killerColor = 0xb30000;
        else if (this.gameSetup.selectedKillerType === 'Starved') killerColor = 0x8B0000;

        this.killer = new Killer(this.engine.scene, k1Controls, killerColor, this.gameSetup.selectedKillerType);
        const kSpawn = this.findSafeSpawn(this.mapManager.obstacles, 50, 90);
        this.killer.mesh.position.set(kSpawn.x, 6, kSpawn.z);
        
        if (this.gameSetup.killerIsAI) {
            this.killer.isAI = true;
        } else {
            this.killer.controlId = killerId;
        }
        this.killers.push(this.killer);

        this.players.forEach(p => {
            p.ability1Cooldown = 120;
            p.ability2Cooldown = 120;
        });
        this.killers.forEach(k => {
            k.ability1Cooldown = 120;
            k.ability2Cooldown = 120;
        });

        this.ui.initHUD();
        this.totalSurvivors = this.players.length;
        
        this.gameTimer = (this.totalSurvivors * 30 + 30) * 60; 
        this.lmsTimer = 60 * 60;   
        this.ringTimer = 15 * 60;  
        
        if (this.totalSurvivors <= 1) {
            this.phase = 'LMS';
            this.playLmsMusic(this.players[0]);
        } else {
            this.audio.playMusic(this.gameSetup.selectedKillerType);
        }
    }

    playLmsMusic(survivor) {
        if (!survivor) return;
        const charName = survivor.characterName;
        if (charName === 'Tails') this.audio.playMusic('Tails_lms');
        else if (charName === 'Knuckles') this.audio.playMusic('Knuckles_lms');
        else this.audio.playMusic('default_lms');
    }

    getSelectableSurvivors() {
        const chars = ['Sonic', 'Tails', 'Knuckles'];
        if (this.dev.gasterUnlocked) chars.push('Gaster');
        return chars;
    }

    stopGame() {
        this.state = 'MENU';
        if (this.ring) this.ring.destroy();
        if (this.arrow) this.arrow.destroy();
        this.ring = null;
        this.arrow = null;
        this.audio.stopMusic();
        this.ui.showScreen('main'); 
    }

    endGame(title, subtitle) {
        this.state = 'GAME_OVER'; 
        this.phase = 'GAME_OVER';
        if (this.ring) { this.ring.destroy(); this.ring = null; }
        if (this.arrow) { this.arrow.destroy(); this.arrow = null; }
        this.audio.stopMusic();
        this.ui.showGameOver(title, subtitle);
    }

    spawnHitbox(x, z, radius, duration, owner, type, damage, data, shape = 'sphere', width = 0, depth = 0) {
        this.activeHitboxes.push(new Hitbox(this, this.engine.scene, x, z, radius, duration, owner, type, damage, data, shape, width, depth));
    }

    spawnProjectile(x, z, dx, dz, owner, stunDuration, speed) {
        this.projectiles.push(new Projectile(this.engine.scene, x, z, dx, dz, owner, stunDuration, speed));
    }

    devSkipPhase() {
        if (this.state !== 'PLAYING') return;
        const alive = this.players.filter(p => p.health > 0);
        if (this.phase === 'ROUND') {
            this.phase = 'LMS';
            this.playLmsMusic(alive[0]);
        } else if (this.phase === 'LMS') {
            this.phase = 'RING';
            const rSpawn = this.findSafeSpawn(this.mapManager.obstacles, -80, 80);
            this.ring = new Ring(this.engine.scene, rSpawn.x, rSpawn.z);
            this.arrow = new PointerArrow(this.engine.scene);
        }
    }

    devTeleportToRing() {
        if (this.state !== 'PLAYING' || !this.ring) return;
        this.players.forEach((p, i) => {
            if (p.health <= 0) return;
            const a = (i / Math.max(1, this.players.length)) * Math.PI * 2;
            p.mesh.position.set(this.ring.mesh.position.x + Math.cos(a) * 15, 6, this.ring.mesh.position.z + Math.sin(a) * 15);
            p.velocity.set(0, 0, 0);
        });
    }

    devResetCooldowns() {
        this.players.forEach(p => {
            p.ability1Cooldown = 0;
            p.ability2Cooldown = 0;
            p.flyCooldown = 0;
            p.flyChargeCooldown = 0;
            p.flyCharges = p.config.abilities?.fly?.maxCharges || 0;
            p.gunCharging = false;
            p.gunChargeTimer = 0;
            p.punchState = 'idle';
        });
        this.killers.forEach(k => {
            k.ability1Cooldown = 0;
            k.ability2Cooldown = 0;
            k.m1Cooldown = 0;
            k.m1State = 'idle';
        });
    }

    updateFpsOverlay() {
        if (this.dev.showFps) {
            if (!this.fpsEl) {
                this.fpsEl = document.createElement('div');
                this.fpsEl.id = 'fps-overlay';
                this.fpsEl.style.cssText = 'position:fixed;top:12px;right:12px;z-index:10002;color:#0f0;background:rgba(0,0,0,0.8);padding:4px 10px;font:bold 14px monospace;border:1px solid #0f0;pointer-events:none;';
                document.body.appendChild(this.fpsEl);
            }
            this.fpsEl.style.display = 'block';
            this.fpsEl.innerText = `${this.fps} FPS`;
        } else if (this.fpsEl) {
            this.fpsEl.style.display = 'none';
        }
    }

    updateNavPathViz() {
        const k = this.killer;
        const want = this.dev.showNavPath && this.state === 'PLAYING' && k && k.navPath && k.navPath.length > 0;
        if (!want) {
            if (this.navLine) this.navLine.visible = false;
            return;
        }
        if (!this.navLine) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 3), 3));
            this.navLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x00ff00 }));
            this.navLine.frustumCulled = false;
            this.engine.scene.add(this.navLine);
        }
        const pos = this.navLine.geometry.attributes.position;
        const count = Math.min(k.navPath.length, 400);
        for (let i = 0; i < count; i++) {
            pos.setXYZ(i, k.navPath[i].x, 7, k.navPath[i].z);
        }
        pos.needsUpdate = true;
        this.navLine.geometry.setDrawRange(0, count);
        this.navLine.visible = true;
    }

    gameLoop() {
        requestAnimationFrame(() => this.gameLoop());

        this.frameCount++;
        this.fpsFrames++;
        const now = performance.now();
        if (now - this.fpsStart >= 500) {
            this.fps = Math.round(this.fpsFrames * 1000 / (now - this.fpsStart));
            this.fpsFrames = 0;
            this.fpsStart = now;
            this.updateFpsOverlay();
        }

        if (this.state === 'PLAYING' && (!this.dev.slowMo || this.frameCount % 2 === 0)) {
            const speedMult = this.dev.sanicMode ? this.devPanel.cfg.sanicMult : 1;
            const sizeMult = this.dev.giantMode ? this.devPanel.cfg.giantScale : 1;
            this.players.forEach(p => {
                p.speed = p.config.speed * speedMult;
                if (!p.mesh.userData.baseScale) p.mesh.userData.baseScale = p.mesh.scale.x || 1;
                p.mesh.scale.setScalar(p.mesh.userData.baseScale * sizeMult);
                p.size = p.config.size * sizeMult;
            });
            this.killers.forEach(k => {
                k.maxSpeed = k.config.speed * speedMult;
                if (!k.mesh.userData.baseScale) k.mesh.userData.baseScale = k.mesh.scale.x || 1;
                k.mesh.scale.setScalar(k.mesh.userData.baseScale * sizeMult);
                k.size = k.config.size * sizeMult;
            });

            this.mapManager.update(this.players, this.killers, this.audio);

            this.players.forEach(p => {
                const scheme = this.controls.getScheme(p.controlId);
                const gp = this.gamepadStates[p.controlId];
                
                p.controls.up = this.keys[scheme.up] || (gp ? gp.up : false);
                p.controls.down = this.keys[scheme.down] || (gp ? gp.down : false);
                p.controls.left = this.keys[scheme.left] || (gp ? gp.left : false);
                p.controls.right = this.keys[scheme.right] || (gp ? gp.right : false);
                p.controls.ability1 = this.keys[scheme.ability1] || (gp ? gp.ability1 : false);
                p.controls.ability2 = this.keys[scheme.ability2] || (gp ? gp.ability2 : false);
                p.controls.m1 = this.keys[scheme.m1] || (gp ? gp.m1 : false);
                
                p.update(this.mapManager.obstacles, this.killers, this, this.players);
            });

            this.killers.forEach(k => {
                const scheme = this.controls.getScheme(k.controlId);
                const gp = this.gamepadStates[k.controlId];
                
                if (!k.isAI) {
                    k.controls.up = this.keys[scheme.up] || (gp ? gp.up : false);
                    k.controls.down = this.keys[scheme.down] || (gp ? gp.down : false);
                    k.controls.left = this.keys[scheme.left] || (gp ? gp.left : false);
                    k.controls.right = this.keys[scheme.right] || (gp ? gp.right : false);
                    k.controls.m1 = this.keys[scheme.m1] || (gp ? gp.m1 : false);
                    k.controls.ability1 = this.keys[scheme.ability1] || (gp ? gp.ability1 : false);
                    k.controls.ability2 = this.keys[scheme.ability2] || (gp ? gp.ability2 : false);
                }
                k.update(this.mapManager.obstacles, this.players, this);
            });

            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                let p = this.projectiles[i];
                p.update(this.killers);
                if (!p.active) this.projectiles.splice(i, 1);
            }

            for (let i = this.activeHitboxes.length - 1; i >= 0; i--) {
                let h = this.activeHitboxes[i];
                
                if (h.owner instanceof Killer) {
                    this.players.forEach(p => {
                        if (p.health > 0 && !h.hasHit.has(p)) {
                            let hit = false;
                            if (h.shape === 'box') hit = checkCircleBoxCollision(p.mesh.position.x, p.mesh.position.z, p.size, h.x - h.width/2, h.z - h.depth/2, h.width, h.depth);
                            else hit = checkCircleCircleCollision(h.x, h.z, h.radius, p.mesh.position.x, p.mesh.position.z, p.size);

                            if (hit) {
                                p.takeDamage(h.damage, h.owner);
                                if (h.data && h.data.applyBleed) p.bleedTimer = h.data.bleedDuration || 180;
                                if (h.type === 'gods_trickery') p.invertedControlsTimer = h.data.invertDuration || 180;
                                
                                if (h.type.includes('killer_m1')) {
                                    p.hitSpeedBoost = 45; 
                                    this.audio.playSfx(h.owner.type, h.owner.config.m1.hitSfx || 'm1_hit');
                                }
                                h.hasHit.add(p);
                            }
                        }
                    });
                }
                else if (h.owner instanceof Player && h.type === 'knuckles_punch') {
                    this.killers.forEach(k => {
                        if (!h.hasHit.has(k)) {
                            let hit = false;
                            if (h.shape === 'box') hit = checkCircleBoxCollision(k.mesh.position.x, k.mesh.position.z, k.size, h.x - h.width/2, h.z - h.depth/2, h.width, h.depth);
                            else hit = checkCircleCircleCollision(h.x, h.z, h.radius, k.mesh.position.x, k.mesh.position.z, k.size);

                            if (hit) {
                                k.stun(h.owner.config.abilities?.punch?.stunDuration || 60);
                                const kbVec = new THREE.Vector3(k.mesh.position.x - h.x, 0, k.mesh.position.z - h.z);
                                if (kbVec.lengthSq() === 0) kbVec.set(0, 0, 1);
                                kbVec.normalize();
                                const knockbackForce = h.owner.config.abilities?.punch?.knockback || 15;
                                k.mesh.position.x += kbVec.x * knockbackForce;
                                k.mesh.position.z += kbVec.z * knockbackForce;
                                h.hasHit.add(k);
                            }
                        }
                    });
                }
                if (!h.update(this)) this.activeHitboxes.splice(i, 1);
            }

            let alivePlayers = this.players.filter(p => p.health > 0);
            let isRushing = this.killer ? this.killer.isRushing : false;

            if (this.phase === 'ROUND') {
                if (alivePlayers.length === 1 && this.totalSurvivors > 1) {
                    this.phase = 'LMS';
                    this.playLmsMusic(alivePlayers[0]);
                }
                if (!isRushing && !this.dev.freezeTimers) this.gameTimer--;
                this.ui.updateHUD('ROUND', this.gameTimer / 60, isRushing);
                if (this.gameTimer <= 0) {
                    this.phase = 'LMS';
                    this.playLmsMusic(alivePlayers[0]);
                }
            } 
            else if (this.phase === 'LMS') {
                if (!isRushing && !this.dev.freezeTimers) this.lmsTimer--;
                this.ui.updateHUD('LAST MAN STANDING', this.lmsTimer / 60, isRushing);
                if (this.lmsTimer <= 0) {
                    this.phase = 'RING';
                    const rSpawn = this.findSafeSpawn(this.mapManager.obstacles, -80, 80);
                    this.ring = new Ring(this.engine.scene, rSpawn.x, rSpawn.z);
                    this.arrow = new PointerArrow(this.engine.scene);
                }
            } 
            else if (this.phase === 'RING') {
                if (!this.dev.freezeTimers) this.ringTimer--;
                this.ring.update();
                this.ui.updateHUD('ESCAPE!', this.ringTimer / 60, false);
                
                if (this.ring && this.arrow) {
                    const guide = alivePlayers[0];
                    if (guide) this.arrow.update(guide.mesh.position, this.ring.mesh.position);
                }

                if (this.ring) {
                    for(let p of alivePlayers) {
                        let dist = Math.hypot(p.mesh.position.x - this.ring.mesh.position.x, p.mesh.position.z - this.ring.mesh.position.z);
                        if (dist < 6 + p.size) {
                            this.endGame('SURVIVOR ESCAPES', 'The ring was reached!');
                            return;
                        }
                    }
                }
                if (this.ringTimer <= 0) this.endGame('KILLER WINS', 'Survivor was too slow');
            }

            if (alivePlayers.length === 0 && this.phase !== 'GAME_OVER') this.endGame('KILLER WINS', 'All survivors eliminated');

            let camTarget = alivePlayers[0] || this.players[0];
            if (camTarget) {
                this.engine.camera.position.x = camTarget.mesh.position.x;
                this.engine.camera.position.z = camTarget.mesh.position.z + 50;
                this.engine.camera.lookAt(camTarget.mesh.position.x, 0, camTarget.mesh.position.z);
            }
        }

        this.updateNavPathViz();
        this.engine.render();
    }
}