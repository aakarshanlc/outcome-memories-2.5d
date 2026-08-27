import { Engine } from '../engine/Engine.js';
import { MapManager } from '../maps/MapManager.js';
import { Player } from '../entities/Player.js';
import { Killer } from '../entities/Killer.js';
import { UIManager } from '../ui/UIManager.js';
import { Controls } from './Controls.js';
import { AudioManager } from './AudioManager.js';
import { Hitbox } from '../engine/Hitbox.js';
import { Projectile } from '../entities/Projectile.js';
import { Ring } from '../entities/Ring.js';
import { PointerArrow } from '../entities/PointerArrow.js';
import { checkCircleCircleCollision, checkCircleBoxCollision } from '../engine/Collision.js';

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
        
        this.state = 'MENU';
        this.keys = {};
        this.setupInput();
        
        this.players = [];
        this.killers = [];
        this.activeHitboxes = [];
        this.projectiles = [];
        this.ring = null;
        this.arrow = null;

        this.gameSetup = {
            survivorCount: 1,
            selectedSurvivorType: 'Sonic',
            selectedKillerType: 'Tripwire',
            killerPlayer: 2,
            killerIsAI: false,
            selectedMap: 'Open Field'
        };

        // FIX: Set interacted flag and refresh UI to unmute video / play music
        const startAudio = () => {
            this.audio.hasInteracted = true;
            this.ui.showScreen(this.ui.activeScreen); 
            window.removeEventListener('click', startAudio);
            window.removeEventListener('keydown', startAudio);
        };
        window.addEventListener('click', startAudio);
        window.addEventListener('keydown', startAudio);
    }

    setupInput() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
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

    startGame() {
        this.state = 'PLAYING';
        this.phase = 'ROUND';
        
        this.players.forEach(p => this.engine.scene.remove(p.mesh));
        this.killers.forEach(k => this.engine.scene.remove(k.mesh));
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
            'Knuckles': 0xcf2020
        };
        const defaultSurvivorTypes = ['Sonic', 'Tails', 'Knuckles', 'Sonic'];

        for (let i = 0; i < this.gameSetup.survivorCount; i++) {
            const sId = survivorIds[i];
            const controlsObj = { up: false, down: false, left: false, right: false, ability1: false, ability2: false, m1: false };
            
            let charName = defaultSurvivorTypes[i];
            if (this.gameSetup.survivorCount === 1) {
                charName = this.gameSetup.selectedSurvivorType;
            }
            
            const pColor = survivorTypeColors[charName] || 0x0064ff;
            
            const player = new Player(this.engine.scene, controlsObj, pColor, charName);
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

        this.ui.initHUD();
        this.totalSurvivors = this.players.length;
        this.gameTimer = 180 * 60; 
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

    stopGame() {
        this.state = 'MENU';
        if (this.ring) this.ring.destroy();
        if (this.arrow) this.arrow.destroy();
        this.ring = null;
        this.arrow = null;
        this.audio.stopMusic();
        this.ui.showScreen('main'); // UIManager will handle playing menu/video audio
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

    spawnProjectile(x, z, dx, dz, owner, damage, stunDuration, speed) {
        this.projectiles.push(new Projectile(this.engine.scene, x, z, dx, dz, owner, damage, stunDuration, speed));
    }

    gameLoop() {
        requestAnimationFrame(() => this.gameLoop());

        if (this.state === 'PLAYING') {
            this.players.forEach(p => {
                const scheme = this.controls.getScheme(p.controlId);
                p.controls.up = this.keys[scheme.up];
                p.controls.down = this.keys[scheme.down];
                p.controls.left = this.keys[scheme.left];
                p.controls.right = this.keys[scheme.right];
                p.controls.ability1 = this.keys[scheme.ability1];
                p.controls.ability2 = this.keys[scheme.ability2];
                p.controls.m1 = this.keys[scheme.m1];
                p.update(this.mapManager.obstacles, this.killers, this, this.players);
            });

            this.killers.forEach(k => {
                if (!k.isAI) {
                    const scheme = this.controls.getScheme(k.controlId);
                    k.controls.up = this.keys[scheme.up];
                    k.controls.down = this.keys[scheme.down];
                    k.controls.left = this.keys[scheme.left];
                    k.controls.right = this.keys[scheme.right];
                    k.controls.m1 = this.keys[scheme.m1];
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
                            if (h.shape === 'box') hit = checkCircleBoxCollision(k.mesh.position.x, k.mesh.position.z, k.size, h.x - h.width/2, h.z - h.depth/2, h.width, h.depth);
                            else hit = checkCircleCircleCollision(h.x, h.z, h.radius, k.mesh.position.x, k.mesh.position.z, k.size);

                            if (hit) {
                                k.stun(h.owner.config.abilities.punch.stunDuration);
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
                if (!h.update(this)) this.activeHitboxes.splice(i, 1);
            }

            let alivePlayers = this.players.filter(p => p.health > 0);

            if (this.phase === 'ROUND') {
                if (alivePlayers.length === 1 && this.totalSurvivors > 1) {
                    this.phase = 'LMS';
                    this.playLmsMusic(alivePlayers[0]);
                }
                this.gameTimer--;
                this.ui.updateHUD('ROUND', this.gameTimer / 60);
                if (this.gameTimer <= 0) {
                    this.phase = 'LMS';
                    this.playLmsMusic(alivePlayers[0]);
                }
            } 
            else if (this.phase === 'LMS') {
                this.lmsTimer--;
                this.ui.updateHUD('LAST MAN STANDING', this.lmsTimer / 60);
                if (this.lmsTimer <= 0) {
                    this.phase = 'RING';
                    const rSpawn = this.findSafeSpawn(this.mapManager.obstacles, -80, 80);
                    this.ring = new Ring(this.engine.scene, rSpawn.x, rSpawn.z);
                    this.arrow = new PointerArrow(this.engine.scene);
                }
            } 
            else if (this.phase === 'RING') {
                this.ringTimer--;
                this.ring.update();
                this.ui.updateHUD('ESCAPE!', this.ringTimer / 60);
                
                if (this.ring && this.arrow && alivePlayers.length > 0) {
                    this.arrow.update(alivePlayers[0].mesh.position, this.ring.mesh.position);
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

        this.engine.render();
    }
}