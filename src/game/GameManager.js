import { Engine } from '../engine/Engine.js';
import { MapManager } from '../maps/MapManager.js';
import { Player } from '../entities/Player.js';
import { Killer } from '../entities/Killer.js';
import { UIManager } from '../ui/UIManager.js';
import { Controls } from './Controls.js';
import { Hitbox } from '../engine/Hitbox.js';
import { checkCircleCircleCollision } from '../engine/Collision.js';

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

        this.gameSetup = {
            survivorCount: 1,
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
                this.ui.hideAll();
            }
        });
        window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    }

    start() {
        this.ui.showScreen('main');
        this.gameLoop();
    }

    startGame() {
        this.state = 'PLAYING';
        
        this.players.forEach(p => this.engine.scene.remove(p.mesh));
        this.killers.forEach(k => this.engine.scene.remove(k.mesh));
        this.players = [];
        this.killers = [];
        this.activeHitboxes.forEach(h => this.engine.scene.remove(h.mesh));
        this.activeHitboxes = [];

        this.mapManager.loadMap(this.gameSetup.selectedMap);

        // Setup Player 1 using mapped controls
        const p1Scheme = this.controls.getScheme('p1');
        this.p1Controls = { 
            up: false, down: false, left: false, right: false, 
            ability1: false, ability2: false, m1: false 
        };
        this.player1 = new Player(this.engine.scene, this.p1Controls, 0x0064ff, 'Sonic');
        this.player1.mesh.position.set(-20, 6, 0);
        this.players.push(this.player1);

        // Setup Killer using mapped controls
        const k1Scheme = this.controls.getScheme('p2');
        this.k1Controls = { 
            up: false, down: false, left: false, right: false, 
            ability1: false, ability2: false, m1: false 
        };
        
        let killerColor = 0xff0000;
        if (this.gameSetup.selectedKillerType === 'Tripwire') killerColor = 0xfcba03;
        else if (this.gameSetup.selectedKillerType === '2011X') killerColor = 0xb30000;
        else if (this.gameSetup.selectedKillerType === 'Starved') killerColor = 0x8B0000;

        this.killer = new Killer(this.engine.scene, this.k1Controls, killerColor, this.gameSetup.selectedKillerType);
        this.killer.mesh.position.set(20, 6, 0);
        this.killers.push(this.killer);
    }

    spawnHitbox(x, z, radius, duration, owner, type, damage, data) {
        this.activeHitboxes.push(new Hitbox(this.engine.scene, x, z, radius, duration, owner, type, damage, data));
    }

    gameLoop() {
        requestAnimationFrame(() => this.gameLoop());

        if (this.state === 'PLAYING') {
            // Read keyboard into control schemes
            const p1S = this.controls.getScheme('p1');
            this.p1Controls.up = this.keys[p1S.up];
            this.p1Controls.down = this.keys[p1S.down];
            this.p1Controls.left = this.keys[p1S.left];
            this.p1Controls.right = this.keys[p1S.right];
            this.p1Controls.ability1 = this.keys[p1S.ability1];

            const k1S = this.controls.getScheme('p2');
            this.k1Controls.up = this.keys[k1S.up];
            this.k1Controls.down = this.keys[k1S.down];
            this.k1Controls.left = this.keys[k1S.left];
            this.k1Controls.right = this.keys[k1S.right];
            this.k1Controls.m1 = this.keys[k1S.m1];

            // Update Entities
            this.players.forEach(p => p.update(this.mapManager.obstacles));
            this.killers.forEach(k => k.update(this.mapManager.obstacles, this.players, this));

            // Update Hitboxes
            for (let i = this.activeHitboxes.length - 1; i >= 0; i--) {
                let h = this.activeHitboxes[i];
                
                // Check collisions
                if (h.owner instanceof Killer) {
                    this.players.forEach(p => {
                        if (p.health > 0 && !h.hasHit.has(p)) {
                            if (checkCircleCircleCollision(h.x, h.z, h.radius, p.mesh.position.x, p.mesh.position.z, p.size)) {
                                p.takeDamage(h.damage, h.owner);
                                if (h.data && h.data.applyBleed) p.bleedTimer = 180; // 3 seconds of bleed
                                h.hasHit.add(p);
                            }
                        }
                    });
                }

                // Keep hitbox alive?
                if (!h.update()) {
                    this.activeHitboxes.splice(i, 1);
                }
            }

            // Camera follows Player 1
            this.engine.camera.position.x = this.player1.mesh.position.x;
            this.engine.camera.position.z = this.player1.mesh.position.z + 50;
            this.engine.camera.lookAt(this.player1.mesh.position.x, 0, this.player1.mesh.position.z);
        }

        this.engine.render();
    }
}