import * as THREE from 'three';
import { Engine } from '../engine/Engine.js';
import { MapManager } from '../maps/MapManager.js';
import { Player } from '../entities/Player.js';
import { Killer } from '../entities/Killer.js';
import { UIManager } from '../ui/UIManager.js';
import { DevPanel } from '../ui/DevPanel.js';
import { HealthBars } from '../ui/HealthBars.js';
import { Controls } from './Controls.js';
import { AudioManager } from './AudioManager.js';
import { Hitbox } from '../engine/Hitbox.js';
import { Projectile } from '../entities/Projectile.js';
import { Ring } from '../entities/Ring.js';
import { PointerArrow } from '../entities/PointerArrow.js';
import { checkCircleCircleCollision, checkCircleBoxCollision } from '../engine/Collision.js';
import { buildNavGrid, computePath } from '../engine/NavGrid.js';

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
        this.healthBars = new HealthBars();
        this.controls = new Controls();
        this.audio = new AudioManager();

        const savedHit = localStorage.getItem('om_show_hitboxes');
        this.settings = {
            showHitboxes: savedHit === null ? true : savedHit === 'true'
        };

        const savedFps = parseInt(localStorage.getItem('om_25d_fps'), 10);
        this.dev = {
            gasterUnlocked: false,
            godMode: false,
            freezeKiller: false,
            freezeTimers: false,
            showFps: false,
            showNavPath: false,
            sanicMode: false,
            giantMode: false,
            moonGravity: false,
            renderFps: isNaN(savedFps) ? 0 : Math.max(0, Math.min(240, savedFps)),
            survivorAI: false,
        };
        this.inputBindings = { p1: 'kb', p2: 'kb', p3: 'kb', p4: 'kb' };
        try {
            const savedBindings = JSON.parse(localStorage.getItem('om_25d_inputs'));
            if (savedBindings) {
                for (const id of ['p1', 'p2', 'p3', 'p4']) {
                    if (typeof savedBindings[id] === 'string') {
                        this.inputBindings[id] = savedBindings[id].startsWith('kb') ? 'kb' : savedBindings[id];
                    }
                }
            }
        } catch (e) {
            console.error('Failed to load input bindings', e);
        }
        this.devPanel = new DevPanel(this);

        this.frameCount = 0;
        this.renderAcc = 0;
        this.lastLoopTime = 0;
        this.aiStates = new Map();
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
            for (let i = 0; i < pads.length; i++) {
                const pad = pads[i];
                if (!pad) continue;
                this.gamepadStates[`gp:${i}`] = {
                    up: pad.buttons[12]?.pressed || pad.axes[1] < -0.5,
                    down: pad.buttons[13]?.pressed || pad.axes[1] > 0.5,
                    left: pad.buttons[14]?.pressed || pad.axes[0] < -0.5,
                    right: pad.buttons[15]?.pressed || pad.axes[0] > 0.5,
                    m1: pad.buttons[0]?.pressed,
                    ability1: pad.buttons[1]?.pressed,
                    ability2: pad.buttons[2]?.pressed
                };
            }
            requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
    }

    saveInputBindings() {
        localStorage.setItem('om_25d_inputs', JSON.stringify(this.inputBindings));
    }

    getDeviceOptions() {

        const opts = [{ id: 'kb', label: 'Keyboard' }];
        const pads = navigator.getGamepads();
        for (let i = 0; i < pads.length; i++) {
            if (pads[i]) opts.push({ id: `gp:${i}`, label: `Gamepad ${i + 1}` });
        }
        return opts;
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

        this.players.forEach(p => {
            if (p.destroy) p.destroy();
            this.engine.scene.remove(p.mesh);
        });
        this.aiStates.clear();
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
            'Cream': 0xf5c89e,
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
        const chars = ['Sonic', 'Tails', 'Knuckles', 'Cream'];
        if (this.dev.gasterUnlocked) chars.push('Gaster');
        return chars;
    }

    stopGame() {
        this.state = 'MENU';
        this.healthBars.clear();
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
        const summary = this.players.map(p => ({
            label: `${p.controlId ? 'P' + p.controlId.slice(1) : '?'} ${p.characterName}`,
            status: p.escaped ? 'escaped' : (p.health <= 0 ? 'died' : 'too slow')
        }));
        this.ui.showGameOver(title, subtitle, summary);
    }

    spawnHitbox(x, z, radius, duration, owner, type, damage, data, shape = 'sphere', width = 0, depth = 0) {
        this.activeHitboxes.push(new Hitbox(this, this.engine.scene, x, z, radius, duration, owner, type, damage, data, shape, width, depth));
    }

    spawnProjectile(x, z, dx, dz, owner, stunDuration, speed) {
        this.projectiles.push(new Projectile(this.engine.scene, x, z, dx, dz, owner, stunDuration, speed));
    }

    devSkipPhase() {
        if (this.state !== 'PLAYING') return;
        const alive = this.players.filter(p => p.health > 0 && !p.escaped);
        if (this.phase === 'ROUND') {
            if (alive.length === 1) {
                this.phase = 'LMS';
                this.playLmsMusic(alive[0]);
            } else {
                this.phase = 'RING';
                const rSpawn = this.findSafeSpawn(this.mapManager.obstacles, -80, 80);
                this.ring = new Ring(this.engine.scene, rSpawn.x, rSpawn.z);
                this.arrow = new PointerArrow(this.engine.scene);
            }
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

    updateSurvivorAI(p) {
        if (p.health <= 0 || p.escaped) return;

        let killer = null, killerDist = Infinity;
        for (const k of this.killers) {
            const d = Math.hypot(k.mesh.position.x - p.mesh.position.x, k.mesh.position.z - p.mesh.position.z);
            if (d < killerDist) { killerDist = d; killer = k; }
        }
        if (!killer) return;

        const HALF_MAP = 90;
        const state = this.aiStates.get(p) || { goal: null, path: null, idx: 1, goalTimer: 0, pathTimer: 0, lastX: null, lastZ: null, progressTimer: 0 };
        this.aiStates.set(p, state);

        const repickGoal = () => {
            const grid = buildNavGrid(this.mapManager.obstacles, p.size + 0.5);
            const awayAngle = Math.atan2(p.mesh.position.z - killer.mesh.position.z, p.mesh.position.x - killer.mesh.position.x);
            let best = null, bestScore = -Infinity;
            for (const off of [0, 45, -45, 90, -90, 135, -135, 180]) {
                const a = awayAngle + off * Math.PI / 180;
                const gx = Math.max(-88, Math.min(88, killer.mesh.position.x + Math.cos(a) * HALF_MAP));
                const gz = Math.max(-88, Math.min(88, killer.mesh.position.z + Math.sin(a) * HALF_MAP));
                const distFromKiller = Math.hypot(gx - killer.mesh.position.x, gz - killer.mesh.position.z);
                if (distFromKiller <= bestScore) continue;
                const path = computePath(p.mesh.position.x, p.mesh.position.z, gx, gz, grid);
                if (!path) continue;
                bestScore = distFromKiller;
                best = { goal: { x: gx, z: gz }, path };
            }
            if (best) {
                state.goal = best.goal;
                state.path = best.path;
                state.idx = 1;
                state.pathTimer = 15;
            } else {
                state.goal = null;
                state.path = null;
            }
        };

        state.progressTimer--;
        if (state.progressTimer <= 0) {
            const moved = state.lastX === null ? Infinity : Math.hypot(p.mesh.position.x - state.lastX, p.mesh.position.z - state.lastZ);
            state.lastX = p.mesh.position.x;
            state.lastZ = p.mesh.position.z;
            state.progressTimer = 45;
            if (moved < 2) state.goalTimer = 0;
        }

        const ringMode = this.phase === 'RING' && !!this.ring && killerDist >= 24;
        state.goalTimer--;
        if (state.goalTimer <= 0 || !state.goal || state.ringMode !== ringMode) {
            if (ringMode) {
                state.goal = { x: this.ring.mesh.position.x, z: this.ring.mesh.position.z };
                state.pathTimer = 0;
                state.goalTimer = 60;
            } else {
                repickGoal();
                state.goalTimer = 45;
            }
            state.ringMode = ringMode;
        }

        if (state.goal && !state.ringMode) {
            const goalToKiller = Math.hypot(state.goal.x - killer.mesh.position.x, state.goal.z - killer.mesh.position.z);
            const pToGoal = Math.hypot(state.goal.x - p.mesh.position.x, state.goal.z - p.mesh.position.z);
            if (goalToKiller < 25 || pToGoal < 8) state.goalTimer = 0;
        }

        state.pathTimer--;
        if (state.pathTimer <= 0 || !state.path) {
            const grid = buildNavGrid(this.mapManager.obstacles, p.size + 0.5);
            state.path = computePath(p.mesh.position.x, p.mesh.position.z, state.goal.x, state.goal.z, grid);
            state.idx = 1;
            state.pathTimer = 15;
        }

        let dir = null;
        if (state.path && state.path.length) {
            while (state.idx < state.path.length - 1 &&
                   Math.hypot(state.path[state.idx].x - p.mesh.position.x, state.path[state.idx].z - p.mesh.position.z) < 5) {
                state.idx++;
            }
            const wpt = state.path[Math.min(state.idx, state.path.length - 1)];
            const wx = wpt.x - p.mesh.position.x;
            const wz = wpt.z - p.mesh.position.z;
            const wd = Math.hypot(wx, wz);
            if (wd > 0.001) dir = { x: wx / wd, z: wz / wd };
        }
        if (!dir) {

            dir = { x: (p.mesh.position.x - killer.mesh.position.x) / (killerDist || 1), z: (p.mesh.position.z - killer.mesh.position.z) / (killerDist || 1) };
        }

        const c = p.controls;
        c.right = dir.x > 0.3;
        c.left = dir.x < -0.3;
        c.down = dir.z > 0.3;
        c.up = dir.z < -0.3;
        c.ability1 = false;
        c.ability2 = false;

        if (p.aiPulse1 > 0) { p.aiPulse1--; c.ability1 = true; }
        if (p.aiPulse2 > 0) { p.aiPulse2--; c.ability2 = true; }

        if (p.characterName === 'Cream' && p.qteActive) {
            const qte = p.config.abilities.heal;
            const progress = 1 - p.qteTimer / qte.qteWindow;
            if (progress >= p.qteZoneStart && progress <= p.qteZoneStart + qte.qteZoneWidth) c.ability1 = true;
        }

        if (killerDist > 32) return;

        switch (p.characterName) {
            case 'Sonic':
                if (p.ability1Cooldown <= 0) p.aiPulse1 = 6;
                break;
            case 'Tails':
                if (p.flyCharges > 0 && p.flyCooldown <= 0 && p.flyChargeCooldown <= 0) p.aiPulse2 = 6;
                break;
            case 'Knuckles':
                if (killerDist < 16) {
                    if (p.ability1Cooldown <= 0) p.aiPulse1 = 6;
                    if (p.ability2Cooldown <= 0 && p.punchState === 'idle') p.aiPulse2 = 6;
                }
                break;
            case 'Gaster':
                if (killerDist < 24 && p.ability1Cooldown <= 0 && p.gasterTpState === 'idle') p.aiPulse1 = 6;
                break;
            case 'Cream': {
                const hurt = this.players.some(o => o.health > 0 && !o.escaped && o.health < o.maxHealth * 0.7);
                if (p.ability1Cooldown <= 0 && killerDist < 40 && hurt) p.aiPulse1 = 6;
                if (p.ability2Cooldown <= 0 && killerDist < 20) p.aiPulse2 = 6;
                break;
            }
        }
    }

    gameLoop() {
        requestAnimationFrame(() => this.gameLoop());

        this.frameCount++;
        const now = performance.now();
        const dt = this.lastLoopTime ? now - this.lastLoopTime : 1000 / 60;
        this.lastLoopTime = now;
        if (now - this.fpsStart >= 500) {
            this.fps = Math.round(this.fpsFrames * 1000 / (now - this.fpsStart));
            this.fpsFrames = 0;
            this.fpsStart = now;
            this.updateFpsOverlay();
        }

        if (this.state === 'PLAYING') {
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
                const binding = this.inputBindings[p.controlId];
                const onKeyboard = !binding || binding.startsWith('kb');
                const scheme = onKeyboard ? this.controls.getScheme(p.controlId) : null;
                const gp = onKeyboard ? null : this.gamepadStates[binding];

                p.controls.up = (scheme && this.keys[scheme.up]) || (gp ? gp.up : false);
                p.controls.down = (scheme && this.keys[scheme.down]) || (gp ? gp.down : false);
                p.controls.left = (scheme && this.keys[scheme.left]) || (gp ? gp.left : false);
                p.controls.right = (scheme && this.keys[scheme.right]) || (gp ? gp.right : false);
                p.controls.ability1 = (scheme && this.keys[scheme.ability1]) || (gp ? gp.ability1 : false);
                p.controls.ability2 = (scheme && this.keys[scheme.ability2]) || (gp ? gp.ability2 : false);
                p.controls.m1 = (scheme && this.keys[scheme.m1]) || (gp ? gp.m1 : false);

                if (this.dev.survivorAI && p.controlId !== 'p1') this.updateSurvivorAI(p);

                p.update(this.mapManager.obstacles, this.killers, this, this.players);
            });

            this.killers.forEach(k => {
                const binding = this.inputBindings[k.controlId];
                const onKeyboard = !binding || binding.startsWith('kb');
                const scheme = onKeyboard ? this.controls.getScheme(k.controlId) : null;
                const gp = onKeyboard ? null : this.gamepadStates[binding];

                if (!k.isAI) {
                    k.controls.up = (scheme && this.keys[scheme.up]) || (gp ? gp.up : false);
                    k.controls.down = (scheme && this.keys[scheme.down]) || (gp ? gp.down : false);
                    k.controls.left = (scheme && this.keys[scheme.left]) || (gp ? gp.left : false);
                    k.controls.right = (scheme && this.keys[scheme.right]) || (gp ? gp.right : false);
                    k.controls.m1 = (scheme && this.keys[scheme.m1]) || (gp ? gp.m1 : false);
                    k.controls.ability1 = (scheme && this.keys[scheme.ability1]) || (gp ? gp.ability1 : false);
                    k.controls.ability2 = (scheme && this.keys[scheme.ability2]) || (gp ? gp.ability2 : false);
                }
                k.update(this.mapManager.obstacles, this.players.filter(p => p.health > 0 && !p.escaped), this);
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
                        if (p.health > 0 && !p.escaped && !h.hasHit.has(p)) {
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
                    this.players.forEach(p => {
                        if (!p.cheeseMesh || !p.cheeseMesh.visible || h.hasHit.has(p.cheeseMesh)) return;
                        const ch = p.cheeseMesh.position;
                        let hit = false;
                        if (h.shape === 'box') hit = checkCircleBoxCollision(ch.x, ch.z, p.cheeseSize, h.x - h.width/2, h.z - h.depth/2, h.width, h.depth);
                        else hit = checkCircleCircleCollision(h.x, h.z, h.radius, ch.x, ch.z, p.cheeseSize);
                        if (hit) {
                            h.hasHit.add(p.cheeseMesh);
                            p.onCheeseHit(h.damage);
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

            let alivePlayers = this.players.filter(p => p.health > 0 && !p.escaped);
            let isRushing = this.killer ? this.killer.isRushing : false;

            if (this.phase === 'ROUND') {
                if (alivePlayers.length === 1 && this.totalSurvivors > 1) {
                    this.phase = 'LMS';
                    this.playLmsMusic(alivePlayers[0]);
                }
                if (!isRushing && !this.dev.freezeTimers) this.gameTimer--;
                this.ui.updateHUD('ROUND', this.gameTimer / 60, isRushing);
                if (this.gameTimer <= 0) {
                    if (alivePlayers.length === 1) {
                        this.phase = 'LMS';
                        this.playLmsMusic(alivePlayers[0]);
                    } else {

                        this.phase = 'RING';
                        const rSpawn = this.findSafeSpawn(this.mapManager.obstacles, -80, 80);
                        this.ring = new Ring(this.engine.scene, rSpawn.x, rSpawn.z);
                        this.arrow = new PointerArrow(this.engine.scene);
                    }
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

                const escapedBefore = this.players.filter(p => p.escaped).length;
                if (this.ring) {
                    for (let p of alivePlayers) {
                        let dist = Math.hypot(p.mesh.position.x - this.ring.mesh.position.x, p.mesh.position.z - this.ring.mesh.position.z);
                        if (dist < 6 + p.size) {
                            p.escaped = true;
                            p.mesh.visible = false;
                        }
                    }
                }
                const escapedAfter = this.players.filter(p => p.escaped).length;

                const stillIn = alivePlayers.filter(p => !p.escaped);
                if (stillIn.length === 0) {
                    if (escapedAfter > escapedBefore) {

                        this.endGame(escapedAfter === 1 ? 'SURVIVOR ESCAPES' : 'SURVIVORS ESCAPED', 'The ring was reached!');
                    } else {
                        this.endGame('KILLER WINS', escapedAfter === 0 ? 'All survivors eliminated' : 'Not everyone made it out');
                    }
                    return;
                }
                if (this.ringTimer <= 0) {
                    this.endGame('KILLER WINS', 'The ring timer ran out');
                    return;
                }
            }

            if (alivePlayers.length === 0 && this.phase !== 'GAME_OVER') this.endGame('KILLER WINS', 'All survivors eliminated');

            let camTarget = alivePlayers[0] || this.players[0];
            if (camTarget) {
                this.engine.camera.position.x = camTarget.mesh.position.x;
                this.engine.camera.position.z = camTarget.mesh.position.z + 50;
                this.engine.camera.lookAt(camTarget.mesh.position.x, 0, camTarget.mesh.position.z);
            }
        }

        let renders = 1;
        if (this.dev.renderFps) {
            this.renderAcc = Math.min(this.renderAcc + this.dev.renderFps * dt / 1000, 10);
            renders = Math.floor(this.renderAcc);
            this.renderAcc -= renders;
        }
        if (!renders) return;
        this.updateNavPathViz();
        if (this.state === 'PLAYING') this.healthBars.update(this.players, this.engine.camera);
        else this.healthBars.clear();
        while (renders-- > 0) {
            this.fpsFrames++;
            this.engine.render();
        }
    }
}
