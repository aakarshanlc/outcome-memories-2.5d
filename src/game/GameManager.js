import { Engine } from '../engine/Engine.js';
import { MapManager } from '../maps/MapManager.js';
import { Player } from '../entities/Player.js';
import { Killer } from '../entities/Killer.js';
import { UIManager } from '../ui/UIManager.js';
import { Controls } from './Controls.js';
import { Hitbox } from '../engine/Hitbox.js';
import { Projectile } from '../entities/Projectile.js';
import { Ring } from '../entities/Ring.js';
import { checkCircleCircleCollision, checkCircleBoxCollision } from '../engine/Collision.js';

export class GameManager {
    constructor() {
        this.engine = new Engine();
        this.mapManager = new MapManager(this.engine.scene);
        this.ui = new UIManager(this);
        this.controls = new Controls();
        
        this.state = 'MENU';
        this.keys = {};
        this.setupInput();
        
        this.players = [];
        this.killers = [];
        this.activeHitboxes = [];
        this.projectiles = [];
        this.ring = null;

        this.gameSetup = {
            selectedCharacter: 'Sonic',
            selectedKillerType: 'Tripwire',
            selectedMap: 'Open Field'
        };
    }

    setupInput() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            if (e.key === 'Escape' && this.state === 'PLAYING') {
                this.state = 'PAUSED';
                this.ui.showScreen('setup');
            } else if (e.key === 'Escape' && this.state === 'PAUSED') {
                this.state = 'PLAYING';
                this.ui.initHUD();
            }
        });
        window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
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
                if (checkCircleBoxCollision(x, z, 6, obs.x, obs.z, obs.w, obs.d)) {
                    safe = false;
                    break;
                }
            }
            attempts++;
        }
        return { x, z };
    }

    startGame() {
        this.state = 'PLAYING';
        this.phase = 'ROUND'; // ROUND, LMS, RING, GAME_OVER
        
        this.players.forEach(p => this.engine.scene.remove(p.mesh));
        this.killers.forEach(k => this.engine.scene.remove(k.mesh));
        if (this.ring) this.ring.destroy();
        this.activeHitboxes.forEach(h => this.engine.scene.remove(h.mesh));
        this.projectiles.forEach(p => this.engine.scene.remove(p.mesh));
        this.players = [];
        this.killers = [];
        this.activeHitboxes = [];
        this.projectiles = [];
        this.ring = null;

        this.mapManager.loadMap(this.gameSetup.selectedMap);

        const p1Scheme = this.controls.getScheme('p1');
        this.p1Controls = { up: false, down: false, left: false, right: false, ability1: false, ability2: false, m1: false };
        
        let pColor = 0x0064ff;
        if (this.gameSetup.selectedCharacter === 'Knuckles') pColor = 0xcf2020;
        else if (this.gameSetup.selectedCharacter === 'Tails') pColor = 0xffd700;

        this.player1 = new Player(this.engine.scene, this.p1Controls, pColor, this.gameSetup.selectedCharacter);
        const pSpawn = this.findSafeSpawn(this.mapManager.obstacles, -90, -50);
        this.player1.mesh.position.set(pSpawn.x, 6, pSpawn.z);
        this.players.push(this.player1);

        const k1Scheme = this.controls.getScheme('p2');
        this.k1Controls = { up: false, down: false, left: false, right: false, ability1: false, ability2: false, m1: false };
        
        let killerColor = 0xff0000;
        if (this.gameSetup.selectedKillerType === 'Tripwire') killerColor = 0xfcba03;
        else if (this.gameSetup.selectedKillerType === '2011X') killerColor = 0xb30000;
        else if (this.gameSetup.selectedKillerType === 'Starved') killerColor = 0x8B0000;

        this.killer = new Killer(this.engine.scene, this.k1Controls, killerColor, this.gameSetup.selectedKillerType);
        const kSpawn = this.findSafeSpawn(this.mapManager.obstacles, 50, 90);
        this.killer.mesh.position.set(kSpawn.x, 6, kSpawn.z);
        this.killers.push(this.killer);

        // Initialize UI and Timers
        this.ui.initHUD();
        this.totalSurvivors = this.players.length;
        this.gameTimer = 180 * 60; // 180s
        this.lmsTimer = 60 * 60;   // 60s
        this.ringTimer = 15 * 60;  // 15s
        
        // If solo, skip straight to LMS
        if (this.totalSurvivors <= 1) {
            this.phase = 'LMS';
        }
    }

    stopGame() {
        this.state = 'MENU';
        if (this.ring) this.ring.destroy();
        this.ring = null;
    }

    endGame(title, subtitle) {
        this.state = 'GAME_OVER'; // This pauses the movement and updates!
        this.phase = 'GAME_OVER';
        if (this.ring) { this.ring.destroy(); this.ring = null; }
        this.ui.showGameOver(title, subtitle);
    }

    spawnHitbox(x, z, radius, duration, owner, type, damage, data, shape = 'sphere', width = 0, depth = 0) {
        this.activeHitboxes.push(new Hitbox(this.engine.scene, x, z, radius, duration, owner, type, damage, data, shape, width, depth));
    }

    spawnProjectile(x, z, dx, dz, owner, damage, stunDuration, speed) {
        this.projectiles.push(new Projectile(this.engine.scene, x, z, dx, dz, owner, damage, stunDuration, speed));
    }

    gameLoop() {
        requestAnimationFrame(() => this.gameLoop());

        if (this.state === 'PLAYING') {
            const p1S = this.controls.getScheme('p1');
            this.p1Controls.up = this.keys[p1S.up];
            this.p1Controls.down = this.keys[p1S.down];
            this.p1Controls.left = this.keys[p1S.left];
            this.p1Controls.right = this.keys[p1S.right];
            this.p1Controls.ability1 = this.keys[p1S.ability1];
            this.p1Controls.ability2 = this.keys[p1S.ability2];

            const k1S = this.controls.getScheme('p2');
            this.k1Controls.up = this.keys[k1S.up];
            this.k1Controls.down = this.keys[k1S.down];
            this.k1Controls.left = this.keys[k1S.left];
            this.k1Controls.right = this.keys[k1S.right];
            this.k1Controls.m1 = this.keys[k1S.m1];

            this.players.forEach(p => p.update(this.mapManager.obstacles, this.killers, this));
            this.killers.forEach(k => k.update(this.mapManager.obstacles, this.players, this));

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
                            if (h.shape === 'box') {
                                hit = checkCircleBoxCollision(p.mesh.position.x, p.mesh.position.z, p.size, h.x - h.width/2, h.z - h.depth/2, h.width, h.depth);
                            } else {
                                hit = checkCircleCircleCollision(h.x, h.z, h.radius, p.mesh.position.x, p.mesh.position.z, p.size);
                            }

                            if (hit) {
                                p.takeDamage(h.damage, h.owner);
                                if (h.data && h.data.applyBleed) p.bleedTimer = 180;
                                h.hasHit.add(p);
                            }
                        }
                    });
                }
                else if (h.owner instanceof Player && h.type === 'knuckles_punch') {
                    this.killers.forEach(k => {
                        if (!h.hasHit.has(k)) {
                            let hit = false;
                            if (h.shape === 'box') {
                                hit = checkCircleBoxCollision(k.mesh.position.x, k.mesh.position.z, k.size, h.x - h.width/2, h.z - h.depth/2, h.width, h.depth);
                            } else {
                                hit = checkCircleCircleCollision(h.x, h.z, h.radius, k.mesh.position.x, k.mesh.position.z, k.size);
                            }

                            if (hit) {
                                k.stun(75);
                                const kbVec = new THREE.Vector3(k.mesh.position.x - h.x, 0, k.mesh.position.z - h.z);
                                if (kbVec.lengthSq() === 0) kbVec.set(0, 0, 1);
                                kbVec.normalize();
                                
                                const knockbackForce = h.owner.config.abilities.punch.knockback || 15;
                                k.mesh.position.x += kbVec.x * knockbackForce;
                                k.mesh.position.z += kbVec.z * knockbackForce;
                                h.hasHit.add(k);
                            }
                        }
                    });
                }

                if (!h.update()) this.activeHitboxes.splice(i, 1);
            }

            // --- GAME LOOP PHASE LOGIC ---
            let alivePlayers = this.players.filter(p => p.health > 0);

            if (this.phase === 'ROUND') {
                if (alivePlayers.length === 1 && this.totalSurvivors > 1) {
                    this.phase = 'LMS'; // Trigger LMS early
                }
                this.gameTimer--;
                this.ui.updateHUD('ROUND', this.gameTimer / 60);
                if (this.gameTimer <= 0) {
                    this.phase = 'LMS';
                }
            } 
            else if (this.phase === 'LMS') {
                this.lmsTimer--;
                this.ui.updateHUD('LAST MAN STANDING', this.lmsTimer / 60);
                if (this.lmsTimer <= 0) {
                    this.phase = 'RING';
                    // Spawn ring randomly, checking for walls
                    const rSpawn = this.findSafeSpawn(this.mapManager.obstacles, -80, 80);
                    this.ring = new Ring(this.engine.scene, rSpawn.x, rSpawn.z);
                }
            } 
            else if (this.phase === 'RING') {
                this.ringTimer--;
                this.ring.update();
                this.ui.updateHUD('ESCAPE!', this.ringTimer / 60);
                
                // Check if player reached ring
                if (this.ring) {
                    for(let p of alivePlayers) {
                        let dist = Math.hypot(p.mesh.position.x - this.ring.mesh.position.x, p.mesh.position.z - this.ring.mesh.position.z);
                        if (dist < 6 + p.size) {
                            this.endGame('SURVIVOR ESCAPES', 'The ring was reached!');
                            return;
                        }
                    }
                }

                if (this.ringTimer <= 0) {
                    this.endGame('KILLER WINS', 'Survivor was too slow');
                }
            }

            // Check if all players are dead at any point
            if (alivePlayers.length === 0 && this.phase !== 'GAME_OVER') {
                this.endGame('KILLER WINS', 'All survivors eliminated');
            }

            // Camera
            if (this.player1) {
                this.engine.camera.position.x = this.player1.mesh.position.x;
                this.engine.camera.position.z = this.player1.mesh.position.z + 50;
                this.engine.camera.lookAt(this.player1.mesh.position.x, 0, this.player1.mesh.position.z);
            }
        }

        this.engine.render();
    }
}