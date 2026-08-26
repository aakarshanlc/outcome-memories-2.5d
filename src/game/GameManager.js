import { Engine } from '../engine/Engine.js';
import { MapManager } from '../maps/MapManager.js';
import { Player } from '../entities/Player.js';
import { Killer } from '../entities/Killer.js';

export class GameManager {
    constructor() {
        this.engine = new Engine();
        this.mapManager = new MapManager(this.engine.scene);
        
        this.keys = {};
        this.setupInput();
        
        this.players = [];
        this.killers = [];
    }

    setupInput() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
    }

    start() {
        // Setup Map
        this.mapManager.loadMap('Open Field');

        // Setup Player 1 (WASD + Q for ability)
        this.p1Controls = { up: false, down: false, left: false, right: false, ability1: false };
        this.player1 = new Player(this.engine.scene, this.p1Controls, 0x0064ff);
        this.player1.mesh.position.set(-20, 6, 0);
        this.players.push(this.player1);

        // Setup Killer (Arrows + Enter for M1)
        this.k1Controls = { up: false, down: false, left: false, right: false, m1: false };
        this.killer = new Killer(this.engine.scene, this.k1Controls, 0xff0000);
        this.killer.mesh.position.set(20, 6, 0);
        this.killers.push(this.killer);

        this.gameLoop();
    }

    gameLoop() {
        requestAnimationFrame(() => this.gameLoop());

        // Update controls manually based on pressed keys
        this.p1Controls.up = this.keys['w'];
        this.p1Controls.down = this.keys['s'];
        this.p1Controls.left = this.keys['a'];
        this.p1Controls.right = this.keys['d'];
        this.p1Controls.ability1 = this.keys['q'];

        this.k1Controls.up = this.keys['arrowup'];
        this.k1Controls.down = this.keys['arrowdown'];
        this.k1Controls.left = this.keys['arrowleft'];
        this.k1Controls.right = this.keys['arrowright'];
        this.k1Controls.m1 = this.keys['enter'];

        // Update Entities
        this.players.forEach(p => p.update(this.mapManager.obstacles));
        this.killers.forEach(k => k.update(this.mapManager.obstacles, this.players));

        // Camera follows Player 1 (2.5D tracking)
        this.engine.camera.position.x = this.player1.mesh.position.x;
        this.engine.camera.position.z = this.player1.mesh.position.z + 50; // Offset Z for 2.5D angle
        this.engine.camera.lookAt(this.player1.mesh.position.x, 0, this.player1.mesh.position.z);

        this.engine.render();
    }
}