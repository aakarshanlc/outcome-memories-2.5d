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
import { buildNavGrid, computePath, clearNavGridCache } from '../engine/NavGrid.js';
import { ViewportManager } from '../engine/Viewports.js';
import { FireWall } from '../entities/FireWall.js';
import { NetClient } from '../net/NetClient.js';

// One simulation tick is exactly 1/60s: all game logic runs on this fixed step so
// speed and timers never change with the display's refresh rate.
const TICK_MS = 1000 / 60;

// Shared empty gamepad state so menu frames don't allocate.
const emptyGamepadStates = {};

// Snapshot cadence for online guests (every 2nd tick = 30Hz). Slightly more
// traffic than 20Hz, but combined with a shorter interp buffer it removes the
// visible sliding-remote-players lag on WebRTC/WS equally.
const SNAP_EVERY = 2;

// Player visual-flag bits in snapshots.
const FL_HL = 1, FL_ROOT = 2, FL_INV = 4, FL_SHIELD = 8, FL_DASH = 16,
      FL_GASTER = 32, FL_BLOCK = 64, FL_FLAME = 128;

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

// One shared scratch vector for punch knockback (hot path during 2011X flurry hits).
const _kb = new THREE.Vector3();

const CRUSHER_STATES = ['sunk', 'rising', 'raised', 'warn', 'sinking'];

export class GameManager {
    constructor() {
        // Debug handle: lets the console / dev tools inspect live game state.
        window.om25d = this;
        this.engine = new Engine();
        this.mapManager = new MapManager(this.engine.scene);
        this.ui = new UIManager(this);
        this.healthBars = new HealthBars();
        this.viewports = new ViewportManager();
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
        this.tickAcc = 0;
        this.lastLoopTime = 0;
        this.aiStates = new Map();
        this.fps = 0;
        this.fpsFrames = 0;
        this.fpsStart = 0;
        this.fpsEl = null;
        this.navLine = null;
        this.navRebuildCd = 6;

        this.state = 'MENU';
        this.keys = {};
        this.gamepadStates = {};
        this.setupInput();

        this.players = [];
        this.killers = [];
        this.activeHitboxes = [];
        this.projectiles = [];
        this.fireWalls = [];
        this.ring = null;
        this.arrow = null;

        this.gameSetup = {
            survivorCount: 1,
            selectedSurvivors: ['Sonic', 'Tails', 'Knuckles', 'Blaze'],
            selectedKillerType: 'Tripwire',
            killerPlayer: 2,
            killerIsAI: false,
            selectedMap: 'Open Field',
            // Online slot ownership: assignments[i] = playerId | null (null = host fills locally).
            assignments: [null, null, null, null],
            killerPlayerId: null
        };

        // ---- Online state ----
        this.mode = 'local';      // 'local' | 'online'
        this.isHost = true;
        this.net = null;          // NetClient while online
        this.roster = [];         // [{id, name}] for the current room
        this.netInputs = new Map();   // playerId -> input bitmask (host side)
        this.netEvents = [];      // outgoing event batch (host side)
        this.netObjectId = 1;
        this.playerName = localStorage.getItem('om_net_name') || ('PLAYER-' + Math.floor(1000 + Math.random() * 9000));
        this.myEntity = null;     // client: the entity this browser controls
        this.prevSnap = null;
        this.curSnap = null;
        this.snapPrevTime = 0;
        this.snapCurTime = 0;
        this.lastSnapTime = 0;
        this.lastHudKey = '';

        // Capture every SFX so online guests hear the host's audio events.
        const origPlaySfx = this.audio.playSfx.bind(this.audio);
        this.audio.playSfx = (charName, actionName) => {
            origPlaySfx(charName, actionName);
            if (this.mode === 'online' && this.isHost && this.roster.length > 1) {
                this.pushNetEvent({ e: 'sfx', c: charName, a: actionName });
            }
        };

        const startAudio = () => {
            this.audio.hasInteracted = true;
            this.ui.showScreen(this.ui.activeScreen);
            window.removeEventListener('click', startAudio);
            window.removeEventListener('keydown', startAudio);
        };
        window.addEventListener('click', startAudio);
        window.addEventListener('keydown', startAudio);

        // Background starvation watchdog: requestAnimationFrame stops when the
        // tab is hidden OR when the browser tab holding this game is switched
        // away from - without ever firing visibilitychange. An online host must
        // keep simulating (and streaming snapshots) regardless, so a cheap
        // interval detects a stalled rAF and catches the 60Hz tick up itself.
        this._bgTimer = null;
        this._bgLast = 0;
    }

    setupInput() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            if (e.code === 'Backquote' && e.shiftKey) {
                this.devPanel.toggle();
                return;
            }
            if (e.key === 'Escape') {
                // Overlay already open: Esc closes it (guest) or resumes (host).
                if (this.ui.pauseVisible) {
                    if (this.ui.pauseKind === 'host') this.ui.resumeHost();
                    else this.ui.hidePauseOverlay();
                    return;
                }
                if (this.state === 'PLAYING') {
                    if (this.mode === 'online') {
                        if (this.isHost) {
                            this.state = 'PAUSED';
                            if (this.net) this.net.sendPause();
                            this.ui.showPauseOverlay('host');
                        } else {
                            this.ui.showPauseOverlay('guest');
                        }
                    } else {
                        this.state = 'PAUSED';
                        this.audio.stopMusic();
                        this.ui.showScreen('setup');
                    }
                } else if (this.state === 'PAUSED' && this.mode === 'local') {
                    this.state = 'PLAYING';
                    this.ui.initHUD();
                    this.audio.playMusic(this.gameSetup.selectedKillerType);
                }
            }
        });
        window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    }

    // Polled from the fixed 60Hz tick instead of its own rAF loop: one input
    // sampling point, consistent timing, and zero work while not playing.
    // Pad state objects are preallocated and reused - no per-tick garbage.
    pollGamepads() {
        const pads = navigator.getGamepads();
        if (!this._padStates) {
            this._padStates = [];
            for (let i = 0; i < 4; i++) {
                this._padStates[i] = {
                    up: false, down: false, left: false, right: false,
                    m1: false, ability1: false, ability2: false
                };
            }
            this._padStatesObj = {};
        }
        let any = false;
        const states = this._padStatesObj;
        for (let i = 0; i < pads.length && i < 4; i++) {
            const pad = pads[i];
            const st = this._padStates[i];
            if (!pad) { delete states[`gp:${i}`]; continue; }
            any = true;
            st.up = pad.buttons[12]?.pressed || pad.axes[1] < -0.5;
            st.down = pad.buttons[13]?.pressed || pad.axes[1] > 0.5;
            st.left = pad.buttons[14]?.pressed || pad.axes[0] < -0.5;
            st.right = pad.buttons[15]?.pressed || pad.axes[0] > 0.5;
            st.m1 = pad.buttons[0]?.pressed;
            st.ability1 = pad.buttons[1]?.pressed;
            st.ability2 = pad.buttons[2]?.pressed;
            states[`gp:${i}`] = st;
        }
        this.gamepadStates = any ? states : emptyGamepadStates;
    }

    readLocalInput(obj, schemeId) {
        const binding = this.inputBindings[schemeId];
        const onKeyboard = !binding || binding.startsWith('kb');
        const scheme = onKeyboard ? this.controls.getScheme(schemeId) : null;
        const gp = onKeyboard ? null : this.gamepadStates[binding];
        obj.up = (scheme && this.keys[scheme.up]) || (gp ? gp.up : false);
        obj.down = (scheme && this.keys[scheme.down]) || (gp ? gp.down : false);
        obj.left = (scheme && this.keys[scheme.left]) || (gp ? gp.left : false);
        obj.right = (scheme && this.keys[scheme.right]) || (gp ? gp.right : false);
        obj.ability1 = (scheme && this.keys[scheme.ability1]) || (gp ? gp.ability1 : false);
        obj.ability2 = (scheme && this.keys[scheme.ability2]) || (gp ? gp.ability2 : false);
        obj.m1 = (scheme && this.keys[scheme.m1]) || (gp ? gp.m1 : false);
    }

    applyRemoteInput(obj, netId) {
        const mask = this.netInputs.get(netId) || 0;
        obj.up = !!(mask & 1);
        obj.down = !!(mask & 2);
        obj.left = !!(mask & 4);
        obj.right = !!(mask & 8);
        obj.ability1 = !!(mask & 16);
        obj.ability2 = !!(mask & 32);
        obj.m1 = !!(mask & 64);
    }

    // Fills the reused buffer with living, unescaped survivors (no allocation).
    collectAlive(out) {
        out.length = 0;
        for (const p of this.players) {
            if (p.health > 0 && !p.escaped) out.push(p);
        }
        return out;
    }

    updateNavPathVizIfNeeded() {
        if (this.dev.showNavPath || this.navLine) this.updateNavPathViz();
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

    // ================= ONLINE LOBBY API (called by UIManager) =================

    async onlineCreate() {
        await this.ensureNet();
        this.mode = 'online';
        const res = await this.net.createRoom(this.playerName);
        this.isHost = true;
        this.roster = [{ id: this.net.id, name: this.playerName }];
        this.resetLobbySetup();
        return res.code;
    }

    async onlineJoin(code) {
        await this.ensureNet();
        this.mode = 'online';
        const res = await this.net.joinRoom(code, this.playerName);
        this.isHost = false;
        return res.code;
    }

    ensureNet() {
        if (this.net && this.net.connected) return Promise.resolve();
        this.net = new NetClient();
        this.wireNet();
        return this.net.connect();
    }

    resetLobbySetup() {
        this.gameSetup.assignments = [null, null, null, null];
        this.gameSetup.killerPlayerId = null;
    }

    wireNet() {
        const net = this.net;
        net.onRoster = (players) => {
            this.roster = players;
            if (this.ui.activeScreen === 'lobby') this.ui.showScreen('lobby');
        };
        net.onLobby = (setup) => {
            if (this.isHost) return;
            Object.assign(this.gameSetup, setup);
            if (this.state !== 'PLAYING' && this.ui.activeScreen === 'lobby') this.ui.showScreen('lobby');
        };
        net.onStart = (setup) => {
            Object.assign(this.gameSetup, setup);
            this.startGame();
        };
        net.onSnap = (snap) => { this.onSnapshot(snap); };
        net.onPause = () => {
            if (this.state === 'PLAYING') {
                this.state = 'PAUSED';
                this.ui.showPauseOverlay('guest');
            }
        };
        net.onResume = () => {
            if (this.ui.hidePauseOverlay) this.ui.hidePauseOverlay();
            if (this.state === 'PAUSED') this.state = 'PLAYING';
        };
        net.onEnd = (msg) => {
            this.endGame(msg.title, msg.subtitle, msg.summary || [], true);
        };
        net.onClosed = () => {
            this.leaveOnline();
            this.ui.showToast && this.ui.showToast('The host closed the room');
        };
        net.onLeft = (id) => {
            // A guest dropped mid-match: survivors die, the killer goes AI.
            if (!this.isHost || this.state !== 'PLAYING') return;
            for (const p of this.players) {
                if (p.netId === id) { p.health = 0; p.mesh.visible = false; }
            }
            if (this.killer && this.killer.netId === id) {
                this.killer.netId = null;
                this.killer.isAI = true;
                this.killer.controlId = null;
            }
        };
        net.onPick = (id, char) => { if (this.isHost) this.hostApplyPick(id, char); };
        net.onRole = (id, role) => { if (this.isHost) this.hostApplyRole(id, role); };
        net.onInput = (id, mask) => { if (this.isHost) this.netInputs.set(id, mask); };
        net.onDisconnect = () => {
            if (this.mode === 'online') {
                this.leaveOnline();
                this.ui.showToast && this.ui.showToast('Connection lost');
            }
        };
    }

    pushLobby() {
        if (this.mode === 'online' && this.isHost && this.net) {
            this.net.sendLobby(JSON.parse(JSON.stringify(this.gameSetup)));
        }
    }

    // Every connected player should own a survivor slot on their own machine:
    // seat unclaimed players automatically (host first, then join order) and
    // grow the survivor count if needed, so each browser gets its own camera.
    autoSeatPlayers() {
        const s = this.gameSetup;
        const claimed = new Set();
        if (s.killerPlayerId) claimed.add(s.killerPlayerId);
        let seated = 0;
        for (let i = 0; i < 4; i++) {
            if (s.assignments[i]) {
                claimed.add(s.assignments[i]);
                if (i < s.survivorCount) seated++;
            }
        }
        const unseated = this.roster.filter(p => p && p.id && !claimed.has(p.id));
        if (unseated.length === 0) return;

        const needed = Math.min(4, seated + unseated.length);
        if (needed > s.survivorCount) {
            s.survivorCount = needed;
            for (let i = s.survivorCount; i < 4; i++) s.assignments[i] = null;
        }
        for (const p of unseated) {
            for (let i = 0; i < s.survivorCount; i++) {
                if (!s.assignments[i]) {
                    s.assignments[i] = p.id;
                    break;
                }
            }
        }
        this.pushLobby();
    }

    hostStartGame() {
        if (this.mode !== 'online' || !this.isHost) return;
        this.autoSeatPlayers();
        // A claimed killer slot disables AI; an empty slot falls back to AI.
        if (this.gameSetup.killerPlayerId) this.gameSetup.killerIsAI = false;
        else this.gameSetup.killerIsAI = true;
        this.net.sendStart(JSON.parse(JSON.stringify(this.gameSetup)));
        this.startGame();
    }

    hostApplyPick(id, char) {
        if (!this.getSelectableSurvivors().includes(char)) return;
        const s = this.gameSetup;
        for (let i = 0; i < s.survivorCount; i++) {
            if (s.assignments[i] === id) { s.selectedSurvivors[i] = char; this.pushLobby(); return; }
        }
        for (let i = 0; i < s.survivorCount; i++) {
            if (!s.assignments[i]) { s.assignments[i] = id; s.selectedSurvivors[i] = char; this.pushLobby(); return; }
        }
    }

    hostApplyRole(id, role) {
        const s = this.gameSetup;
        if (role === 'killer') {
            if (s.killerPlayerId) return;
            s.killerPlayerId = id;
            s.killerIsAI = false;
            for (let i = 0; i < 4; i++) if (s.assignments[i] === id) s.assignments[i] = null;
        } else {
            if (s.killerPlayerId === id) s.killerPlayerId = null;
            const already = s.assignments.slice(0, s.survivorCount).some(v => v === id);
            if (!already) {
                for (let i = 0; i < s.survivorCount; i++) {
                    if (!s.assignments[i]) { s.assignments[i] = id; break; }
                }
            }
        }
        this.pushLobby();
    }

    leaveOnline() {
        if (this.net) { this.net.disconnect(); this.net = null; }
        this.mode = 'local';
        this.isHost = true;
        this.roster = [];
        this.netInputs.clear();
        this.netEvents = [];
        this.prevSnap = this.curSnap = null;
        this.myEntity = null;
        if (this.state !== 'MENU') this.stopGameCleanup();
        this.ui.hidePauseOverlay && this.ui.hidePauseOverlay();
        this.ui.showScreen('main');
    }

    rosterName(id) {
        const r = this.roster.find(p => p.id === id);
        return r ? r.name : null;
    }

    // ================= GAME FLOW =================

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

        await new Promise(resolve => setTimeout(resolve, 1200));

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
        this.projectiles.forEach(p => p.destroy());
        this.fireWalls.forEach(w => w.destroy());
        this.players = [];
        this.killers = [];
        this.activeHitboxes = [];
        this.projectiles = [];
        this.fireWalls = [];
        this.ring = null;
        this.arrow = null;
        this.netEvents = [];
        this.prevSnap = this.curSnap = null;

        this.mapManager.loadMap(this.gameSetup.selectedMap);
        clearNavGridCache();
        this.mapManager.navDirty = false;
        this.navRebuildCd = 6;

        const online = this.mode === 'online';
        const clientMode = online && !this.isHost;
        const myId = online && this.net ? this.net.id : null;
        const setup = this.gameSetup;

        // ---- Role resolution ----
        // survivor slot kinds: 'local' (keyboard on this machine) | 'remote' (net input)
        const slotNetId = (i) => (online ? (setup.assignments[i] || null) : null);
        let killerKind;
        if (!online) {
            killerKind = setup.killerIsAI ? 'ai' : 'local';
            // Couch guard: 4 survivors + a local killer needs 5 input schemes,
            // which cannot exist - the killer folds to AI instead of soft-locking.
            if (killerKind === 'local' && setup.survivorCount >= 4) killerKind = 'ai';
        } else {
            const kid = setup.killerIsAI ? null : (setup.killerPlayerId || null);
            killerKind = !kid ? 'ai' : (kid === myId ? 'local' : 'remote');
        }

        // Local input id pool (keyboard schemes p1..p4 on this machine).
        const allIds = ['p1', 'p2', 'p3', 'p4'];
        let killerId = null;
        if (killerKind === 'local') {
            if (!online) {
                killerId = `p${setup.killerPlayer}`;
                if (!allIds.includes(killerId)) killerId = 'p1';
            } else {
                killerId = allIds.shift(); // host's own killer slot takes the first scheme
            }
        }
        const localPool = allIds.filter(id => id !== killerId);

        const survivorTypeColors = {
            'Sonic': 0x0064ff,
            'Tails': 0xffd700,
            'Knuckles': 0xcf2020,
            'Cream': 0xf5c89e,
            'Blaze': 0xff7722,
            'Gaster': 0xe8e8e8
        };

        const viewportTargets = [];
        this.myEntity = null;

        for (let i = 0; i < this.gameSetup.survivorCount; i++) {
            const netId = slotNetId(i);
            const kind = online ? (netId === myId ? 'local' : netId ? 'remote' : 'local') : 'local';
            const controlsObj = { up: false, down: false, left: false, right: false, ability1: false, ability2: false, m1: false };

            const charName = this.gameSetup.selectedSurvivors[i];
            const pColor = survivorTypeColors[charName] || 0x0064ff;

            const player = new Player(this.engine.scene, controlsObj, pColor, charName);
            player.gameManager = this;
            player.uiColor = pColor;
            const pSpawn = this.findSafeSpawn(this.mapManager.obstacles, -90, -50);
            player.mesh.position.set(pSpawn.x, 6, pSpawn.z);
            player.netId = kind === 'remote' ? netId : null;
            player.remote = kind === 'remote';
            if (kind === 'local') player.controlId = localPool.shift() || null;
            else player.controlId = null;

            // Online: my own slot is the entity this browser controls.
            const isMine = online && netId === myId && kind === 'local';
            if (isMine) {
                if (clientMode) player.controlId = 'p1'; // guests always read the P1 scheme
                this.myEntity = player;
            }
            this.players.push(player);

            // Online (host or guest): each browser renders exactly one camera -
            // no splitscreen. The focus entity is resolved after the killer block.
            if (!online && !clientMode) {
                viewportTargets.push({
                    entity: player,
                    color: pColor,
                    kind: 'survivor',
                    label: `${charName} · ${player.controlId ? player.controlId.toUpperCase() : '?'}`
                });
            }
        }

        this.killer = null;
        let killerColor = 0xff0000;
        if (this.gameSetup.selectedKillerType === 'Tripwire') killerColor = 0xfcba03;
        else if (this.gameSetup.selectedKillerType === '2011X') killerColor = 0xb30000;
        else if (this.gameSetup.selectedKillerType === 'Starved') killerColor = 0x8B0000;

        const k1Controls = { up: false, down: false, left: false, right: false, ability1: false, ability2: false, m1: false };
        this.killer = new Killer(this.engine.scene, k1Controls, killerColor, this.gameSetup.selectedKillerType);
        const kSpawn = this.findSafeSpawn(this.mapManager.obstacles, 50, 90);
        this.killer.mesh.position.set(kSpawn.x, 6, kSpawn.z);

        if (killerKind === 'ai') {
            this.killer.isAI = true;
            this.killer.netId = null;
            this.killer.controlId = null;
        } else if (killerKind === 'remote') {
            this.killer.isAI = false;
            this.killer.remote = true;
            this.killer.netId = online ? (setup.killerPlayerId || null) : null;
            this.killer.controlId = null;
        } else {
            this.killer.isAI = false;
            this.killer.remote = false;
            this.killer.netId = null;
            this.killer.controlId = killerId;
        }
        this.killers.push(this.killer);
        this.killer.uiColor = killerColor;

        const killerIsMine = killerKind === 'local' && online && setup.killerPlayerId === myId;
        if (online && killerIsMine) this.myEntity = this.killer;

        if (!online) {
            viewportTargets.push({
                entity: this.killer,
                color: killerColor,
                kind: 'killer',
                label: `${this.killer.type} · KILLER${killerKind === 'ai' ? ' (AI)' : ''}`
            });
        }

        // Online: one viewport per browser, focused on my own entity (spectate
        // fallback if I somehow hold no role).
        if (online) {
            const focus = this.myEntity || this.players[0] || this.killer;
            const focusName = focus.characterName || focus.type || '?';
            const isMine = focus === this.myEntity;
            viewportTargets.push({
                entity: focus,
                color: focus.uiColor || (focus === this.killer ? killerColor : 0x0064ff),
                kind: focus === this.killer ? 'killer' : 'survivor',
                label: `${focusName} · ${isMine ? 'YOU' : 'SPECTATE'}`
            });
            if (!isMine) this.myEntity = null;
        }
        this.viewports.build(viewportTargets);

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

        this.lastSnapTime = performance.now();
        this.startBgWatchdog();

        if (clientMode) {
            // Guest: the host drives phases, timers and music via snapshots.
            return;
        }

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
        const chars = ['Sonic', 'Tails', 'Knuckles', 'Cream', 'Blaze'];
        if (this.dev.gasterUnlocked) chars.push('Gaster');
        return chars;
    }

    canPlaceFireWall() {
        return this.fireWalls.length < 3;
    }

    spawnFireWall(owner, x, z) {
        const wall = new FireWall(this, owner, x, z);
        wall._nid = this.netObjectId++;
        this.fireWalls.push(wall);
        this.mapManager.navDirty = true; // killers must path around fresh flames
        this.pushNetEvent({ e: 'fw', id: wall._nid, x: wall.x, z: wall.z, p: this.players.indexOf(owner) });
        return wall;
    }

    startBgWatchdog() {
        if (this._bgTimer) { this._bgLast = performance.now(); return; }
        this._bgLast = performance.now();
        this._bgTimer = setInterval(() => {
            const now = performance.now();
            // rAF fired recently - the normal loop owns the tick.
            if (now - this.lastLoopTime < 250) { this._bgLast = now; return; }
            let owed = Math.floor((now - this._bgLast) / TICK_MS);
            if (owed > 90) owed = 90; // cap bursts after long stalls
            for (let i = 0; i < owed; i++) this.tick();
            this._bgLast = now;
        }, 50);
    }

    stopBgWatchdog() {
        if (this._bgTimer) { clearInterval(this._bgTimer); this._bgTimer = null; }
    }

    stopGameCleanup() {
        this.stopBgWatchdog();
        this.state = 'MENU';
        this.healthBars.clear();
        this.viewports.destroy();
        if (this.ring) this.ring.destroy();
        if (this.arrow) this.arrow.destroy();
        this.ring = null;
        this.arrow = null;
        this.activeHitboxes.forEach(h => this.engine.scene.remove(h.mesh));
        this.activeHitboxes = [];
        this.projectiles.forEach(p => p.destroy());
        this.projectiles = [];
        this.fireWalls.forEach(w => w.destroy());
        this.fireWalls = [];
        this.audio.stopMusic();
        this.ui.hidePauseOverlay && this.ui.hidePauseOverlay();
    }

    stopGame() {
        if (this.mode === 'online') {
            if (this.isHost && this.net && this.state === 'PLAYING') {
                this.net.sendEnd('HOST LEFT', 'The host ended the match', []);
            }
            if (this.net) { this.net.disconnect(); this.net = null; }
            this.mode = 'local';
            this.isHost = true;
            this.roster = [];
        }
        this.stopGameCleanup();
        this.ui.showScreen('main');
    }

    backToLobby() {
        if (this.mode !== 'online') { this.stopGame(); return; }
        this.stopGameCleanup();
        this.state = 'MENU';
        this.ui.showScreen('lobby');
        if (this.isHost) this.pushLobby();
    }

    endGame(title, subtitle, summary = [], fromNet = false) {
        this.state = 'GAME_OVER';
        this.phase = 'GAME_OVER';
        if (this.ring) { this.ring.destroy(); this.ring = null; }
        if (this.arrow) { this.arrow.destroy(); this.arrow = null; }
        this.audio.stopMusic();
        if (!summary.length) {
            summary = this.players.map((p, i) => ({
                label: p.netId ? (this.rosterName(p.netId) || `P${i + 1}`) : `${p.controlId ? 'P' + p.controlId.slice(1) : '?'} ${p.characterName}`,
                status: p.escaped ? 'escaped' : (p.health <= 0 ? 'died' : 'too slow')
            }));
        }
        if (this.mode === 'online' && this.isHost && !fromNet && this.net) {
            this.net.sendEnd(title, subtitle, summary);
        }
        this.ui.showGameOver(title, subtitle, summary);
    }

    spawnHitbox(x, z, radius, duration, owner, type, damage, data, shape = 'sphere', width = 0, depth = 0) {
        this.activeHitboxes.push(new Hitbox(this, this.engine.scene, x, z, radius, duration, owner, type, damage, data, shape, width, depth));
        this.pushNetEvent({
            e: 'hb', x, z, r: radius, du: duration, ty: type,
            sh: shape === 'box' ? 1 : 0, w: width, d: depth,
            k: owner instanceof Killer ? 1 : 0
        });
    }

    spawnProjectile(x, z, dx, dz, owner, optsOrStun, speed) {
        const opts = (optsOrStun && typeof optsOrStun === 'object')
            ? optsOrStun
            : { stun: optsOrStun, speed, side: 'killer', color: 0xffff00 };
        const proj = new Projectile(this.engine.scene, x, z, dx, dz, owner, opts);
        this.projectiles.push(proj);
        this.pushNetEvent({
            e: 'pj', x, z, dx, dz,
            sp: opts.speed || 3.0,
            sd: opts.side || 'killer',
            co: opts.color || 0xffff00,
            st: opts.stun || 0,
            rt: opts.root || 0,
            dm: opts.damage || 0
        });
        return proj;
    }

    spawnRingAt(x, z) {
        this.ring = new Ring(this.engine.scene, x, z);
        this.arrow = new PointerArrow(this.engine.scene);
        this.pushNetEvent({ e: 'ring', x, z });
    }

    pushNetEvent(ev) {
        if (this.mode !== 'online' || !this.isHost || this.roster.length <= 1) return;
        if (this.netEvents.length > 400) return;
        this.netEvents.push(ev);
    }

    devSkipPhase() {
        if (this.state !== 'PLAYING' || !this.isHost) return;
        const alive = this.players.filter(p => p.health > 0 && !p.escaped);
        if (this.phase === 'ROUND') {
            if (alive.length === 1) {
                this.phase = 'LMS';
                this.playLmsMusic(alive[0]);
            } else {
                this.phase = 'RING';
                const rSpawn = this.findSafeSpawn(this.mapManager.obstacles, -80, 80);
                this.spawnRingAt(rSpawn.x, rSpawn.z);
            }
        } else if (this.phase === 'LMS') {
            this.phase = 'RING';
            const rSpawn = this.findSafeSpawn(this.mapManager.obstacles, -80, 80);
            this.spawnRingAt(rSpawn.x, rSpawn.z);
        }
    }

    devTeleportToRing() {
        if (this.state !== 'PLAYING' || !this.ring || !this.isHost) return;
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
            case 'Blaze':
                if (p.ability1Cooldown <= 0 && killerDist < 30) p.aiPulse1 = 6;
                if (p.ability2Cooldown <= 0 && killerDist < 12) p.aiPulse2 = 6;
                break;
        }
    }

    // ================= MAIN LOOP =================

    gameLoop() {
        requestAnimationFrame(() => this.gameLoop());

        const now = performance.now();
        let dt = this.lastLoopTime ? now - this.lastLoopTime : TICK_MS;
        this.lastLoopTime = now;
        if (dt > 250) dt = 250; // tab was hidden / long stall: don't try to catch up

        // Fixed-step simulation: run however many 60Hz ticks the wall clock owes us.
        this.tickAcc += dt;
        let ticks = 0;
        while (this.tickAcc >= TICK_MS && ticks < 4) {
            this.tick();
            this.tickAcc -= TICK_MS;
            ticks++;
        }
        if (this.tickAcc >= TICK_MS) this.tickAcc = 0;

        // Render pacing: locked to 60fps by default (the dev FPS bypass raises it).
        const renderCap = this.dev.renderFps || 60;
        this.renderAcc = Math.min(this.renderAcc + renderCap * dt / 1000, 10);
        let renders = Math.floor(this.renderAcc);
        this.renderAcc -= renders;
        if (!renders) return;

        // Opaque menu/loading/game-over screens fully cover the canvas — skip
        // drawing the scene (and its shadow pass) entirely while they're up.
        if (this.state !== 'PLAYING') return;

        this.updateNavPathVizIfNeeded();
        this.healthBars.update(this.players, this.viewports);
        this.fpsFrames += renders;
        while (renders-- > 0) {
            this.engine.render(this.viewports.active ? this.viewports.entries : null);
        }
    }

    tick() {
        this.frameCount++;

        const now = performance.now();
        if (now - this.fpsStart >= 500) {
            this.fps = Math.round(this.fpsFrames * 1000 / (now - this.fpsStart));
            this.fpsFrames = 0;
            this.fpsStart = now;
            this.updateFpsOverlay();
        }

        if (this.state !== 'PLAYING') return;

        // Online guest: no local simulation - send inputs, render snapshots.
        if (this.mode === 'online' && !this.isHost) {
            this.clientTick();
            return;
        }

        this.pollGamepads();

        {
            if (this.mapManager.navDirty) {
                // Rebuilding the grid every single tick while maze gates slide was
                // a large per-frame cost: batch it to once per 6 ticks.
                this.navRebuildCd--;
                if (this.navRebuildCd <= 0) {
                    clearNavGridCache();
                    this.mapManager.navDirty = false;
                    this.navRebuildCd = 6;
                }
            }
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

            for (let i = this.fireWalls.length - 1; i >= 0; i--) {
                const w = this.fireWalls[i];
                if (!w.update(this.players, this.killers) || w.destroyed) this.fireWalls.splice(i, 1);
            }

            // Killer collision list: map obstacles minus the killer-only doors
            // (sliding gates have no collision for the killer), plus fire walls -
            // which are physical blockers for the killer only: survivors walk
            // through their own flames, the killer has to path around or burn
            // through. Built into a reused buffer: zero per-tick allocation.
            let killerObstacles = this.mapManager.killerObstacles;
            if (this.fireWalls.length > 0) {
                const buf = this._kObsBuf || (this._kObsBuf = []);
                buf.length = 0;
                for (let i = 0; i < killerObstacles.length; i++) buf.push(killerObstacles[i]);
                for (let i = 0; i < this.fireWalls.length; i++) buf.push(this.fireWalls[i].obstacle);
                killerObstacles = buf;
            }

            const killerAlive = this.collectAlive(this._aliveBuf || (this._aliveBuf = []));

            this.players.forEach(p => {
                if (p.remote && p.netId) this.applyRemoteInput(p.controls, p.netId);
                else if (p.controlId) this.readLocalInput(p.controls, p.controlId);

                if (this.dev.survivorAI && p.controlId !== 'p1') this.updateSurvivorAI(p);

                p.update(this.mapManager.obstacles, this.killers, this, this.players);
            });

            this.killers.forEach(k => {
                if (!k.isAI) {
                    if (k.remote && k.netId) this.applyRemoteInput(k.controls, k.netId);
                    else if (k.controlId) this.readLocalInput(k.controls, k.controlId);
                }
                k.update(killerObstacles, killerAlive, this);
            });

            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                let p = this.projectiles[i];
                p.update(this.killers, this.players);
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
                                _kb.set(k.mesh.position.x - h.x, 0, k.mesh.position.z - h.z);
                                if (_kb.lengthSq() === 0) _kb.set(0, 0, 1);
                                _kb.normalize();
                                const knockbackForce = h.owner.config.abilities?.punch?.knockback || 15;
                                k.mesh.position.x += _kb.x * knockbackForce;
                                k.mesh.position.z += _kb.z * knockbackForce;
                                h.hasHit.add(k);
                            }
                        }
                    });
                }

                // Killer attacks chew through Blaze's fire walls.
                if (this.fireWalls.length > 0 && h.damage > 0) {
                    for (const w of this.fireWalls) {
                        if (h.hasHit.has(w)) continue;
                        const cx = w.obstacle.x + w.w / 2;
                        const cz = w.obstacle.z + w.d / 2;
                        const wr = Math.max(w.w, w.d) / 2;
                        let hit = false;
                        if (h.shape === 'box') hit = checkCircleBoxCollision(cx, cz, wr, h.x - h.width/2, h.z - h.depth/2, h.width, h.depth);
                        else hit = checkCircleCircleCollision(h.x, h.z, h.radius, cx, cz, wr);
                        if (hit) {
                            h.hasHit.add(w);
                            w.takeDamage(h.damage);
                        }
                    }
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
                        this.spawnRingAt(rSpawn.x, rSpawn.z);
                    }
                }
            }
            else if (this.phase === 'LMS') {
                if (!isRushing && !this.dev.freezeTimers) this.lmsTimer--;
                this.ui.updateHUD('LAST MAN STANDING', this.lmsTimer / 60, isRushing);
                if (this.lmsTimer <= 0) {
                    this.phase = 'RING';
                    const rSpawn = this.findSafeSpawn(this.mapManager.obstacles, -80, 80);
                    this.spawnRingAt(rSpawn.x, rSpawn.z);
                }
            }
            else if (this.phase === 'RING') {
                if (!this.dev.freezeTimers) this.ringTimer--;
                if (this.ring) this.ring.update();
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

            this.viewports.update();

            // Online host: stream state to guests.
            if (this.mode === 'online' && this.net && this.roster.length > 1 && this.frameCount % SNAP_EVERY === 0) {
                this.net.sendSnap(this.buildSnapshot());
            }
        }
    }

    // ================= ONLINE: SNAPSHOT BUILD (host) =================

    buildSnapshot() {
        const ps = this.players.map((p, i) => {
            let fl = 0;
            if (p.highlightTimer > 0) fl |= FL_HL;
            if (p.rootTimer > 0) fl |= FL_ROOT;
            if (p.invertedControlsTimer > 0) fl |= FL_INV;
            if (p.sonicShieldTimer > 0) fl |= FL_SHIELD;
            if (p.creamDashTimer > 0) fl |= FL_DASH;
            if (p.characterName === 'Gaster' && p.gasterTpState === 'windup') fl |= FL_GASTER;
            if (p.isBlocking) fl |= FL_BLOCK;
            if (p.solFlameTimer > 0) fl |= FL_FLAME;

            const entry = {
                x: +p.mesh.position.x.toFixed(2),
                y: +p.mesh.position.y.toFixed(2),
                z: +p.mesh.position.z.toFixed(2),
                ry: +p.mesh.rotation.y.toFixed(3),
                h: p.health,
                e: p.escaped ? 1 : 0,
                a1: p.ability1Cooldown,
                a2: p.ability2Cooldown,
                fl
            };
            if (p.characterName === 'Cream' && p.cheeseMesh) {
                entry.cx = +p.cheeseMesh.position.x.toFixed(2);
                entry.cz = +p.cheeseMesh.position.z.toFixed(2);
                entry.cr = p.cheeseHealRing && p.cheeseHealRing.visible ? 1 : 0;
                entry.q = p.qteActive
                    ? [1, +(1 - p.qteTimer / p.config.abilities.heal.qteWindow).toFixed(3), +p.qteZoneStart.toFixed(3), p.healStreak >= 2 ? 1 : 0]
                    : 0;
            }
            return entry;
        });

        const k = this.killer;
        let kWind = false;
        if (k) {
            if (k.type === 'Tripwire') kWind = (k.grappleState === 'shooting') || !!(k.activeBomb && k.activeBomb.state === 'flying');
            else if (k.type === '2011X') kWind = k.teleportState === 'windup' || k.trickeryState === 'active';
            else if (k.type === 'Starved') kWind = k.lungeState === 'windup';
        }

        const snap = {
            t: 'snap',
            tk: this.frameCount,
            ph: this.phase,
            gt: this.gameTimer,
            lt: this.lmsTimer,
            rt: this.ringTimer,
            mt: this.audio.currentTrack || '',
            ps,
            k: k ? {
                x: +k.mesh.position.x.toFixed(2),
                y: +k.mesh.position.y.toFixed(2),
                z: +k.mesh.position.z.toFixed(2),
                ry: +k.mesh.rotation.y.toFixed(3),
                st: k.stunned > 0 ? 1 : 0,
                ru: k.isRushing ? 1 : 0,
                lu: k.lungeState === 'windup' ? 1 : (k.lungeState === 'active' ? 2 : 0),
                wi: kWind ? 1 : 0
            } : 0,
            rg: this.ring ? [+this.ring.mesh.position.x.toFixed(2), +this.ring.mesh.position.z.toFixed(2)] : 0,
            fw: this.fireWalls.map(w => w._nid),
            ev: this.netEvents
        };

        if (this.mapManager.crushers.length) {
            snap.cr = this.mapManager.crushers.map(c => [
                CRUSHER_STATES.indexOf(c.state),
                c.timer,
                +c.obs.mesh.position.y.toFixed(2)
            ]);
        }
        if (this.mapManager.gates.length) {
            snap.gs = this.mapManager.gates.map(g => [+g.mesh.position.x.toFixed(2), +g.mesh.position.z.toFixed(2)]);
        }

        this.netEvents = [];
        return snap;
    }

    // ================= ONLINE: CLIENT (guest) =================

    buildInputMask() {
        const entity = this.myEntity;
        if (!entity) return 0;
        const schemeId = entity.controlId || 'p1';
        const binding = this.inputBindings[schemeId];
        const onKeyboard = !binding || binding.startsWith('kb');
        const scheme = onKeyboard ? this.controls.getScheme(schemeId) : null;
        const gp = onKeyboard ? null : this.gamepadStates[binding];
        const held = (k, g) => !!((scheme && this.keys[scheme[k]]) || (gp && gp[g]));
        let mask = 0;
        if (held('up', 'up')) mask |= 1;
        if (held('down', 'down')) mask |= 2;
        if (held('left', 'left')) mask |= 4;
        if (held('right', 'right')) mask |= 8;
        if (held('ability1', 'ability1')) mask |= 16;
        if (held('ability2', 'ability2')) mask |= 32;
        if (held('m1', 'm1')) mask |= 64;
        return mask;
    }

    clientTick() {
        this.pollGamepads();

        // Send local input every tick (60Hz): ability presses are edge-triggered,
        // so a downsampled input stream could drop a whole tap between frames.
        if (this.net && this.net.connected) {
            this.net.sendInput(this.buildInputMask());
        }

        // Watchdog: no snapshots for 5s means the host vanished.
        if (performance.now() - this.lastSnapTime > 5000 && this.lastSnapTime > 0) {
            this.leaveOnline();
            this.ui.showToast && this.ui.showToast('Connection to host lost');
            return;
        }

        this.applySnapshotInterp();

        // Local visual ticking (host owns all gameplay truth).
        for (let i = this.activeHitboxes.length - 1; i >= 0; i--) {
            if (!this.activeHitboxes[i].update(this)) this.activeHitboxes.splice(i, 1);
        }
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update([], null);
            if (!p.active) this.projectiles.splice(i, 1);
        }
        for (let i = this.fireWalls.length - 1; i >= 0; i--) {
            const w = this.fireWalls[i];
            if (!w.update(null, null) || w.destroyed) this.fireWalls.splice(i, 1);
        }

        if (this.ring) this.ring.update();
        if (this.ring && this.arrow) {
            const guide = this.myEntity && this.myEntity.health > 0 && !this.myEntity.escaped
                ? this.myEntity
                : this.players.find(p => p.health > 0 && !p.escaped);
            if (guide) this.arrow.update(guide.mesh.position, this.ring.mesh.position);
        }

        this.viewports.update();
    }

    onSnapshot(snap) {
        this.lastSnapTime = performance.now();
        this.prevSnap = this.curSnap || snap;
        this.curSnap = snap;
        this.snapPrevTime = this.snapCurTime || this.lastSnapTime;
        this.snapCurTime = this.lastSnapTime;

        // Phase / HUD / music straight from the host.
        const phaseLabel = snap.ph === 'ROUND' ? 'ROUND' : snap.ph === 'LMS' ? 'LAST MAN STANDING' : snap.ph === 'RING' ? 'ESCAPE!' : '';
        if (phaseLabel) {
            const seconds = snap.ph === 'ROUND' ? snap.gt / 60 : snap.ph === 'LMS' ? snap.lt / 60 : snap.rt / 60;
            this.ui.updateHUD(phaseLabel, seconds, !!snap.k?.ru);
        }
        if (snap.mt && this.audio.currentTrack !== snap.mt) this.audio.playMusic(snap.mt);

        this.processNetEvents(snap.ev);

        // Ring lifecycle.
        if (snap.rg) {
            if (!this.ring) this.spawnRingAt(snap.rg[0], snap.rg[1]);
            else { this.ring.mesh.position.x = snap.rg[0]; this.ring.mesh.position.z = snap.rg[1]; }
        } else if (this.ring) {
            this.ring.destroy(); this.ring = null;
            if (this.arrow) { this.arrow.destroy(); this.arrow = null; }
        }

        // Firewalls that died early on the host get culled here.
        if (snap.fw) {
            const alive = new Set(snap.fw);
            for (let i = this.fireWalls.length - 1; i >= 0; i--) {
                if (!alive.has(this.fireWalls[i]._nid)) this.fireWalls[i].destroy();
            }
        }

        // Crusher / gate visuals follow the host exactly.
        if (snap.cr) {
            const list = this.mapManager.crushers;
            for (let i = 0; i < list.length && i < snap.cr.length; i++) {
                const [stateIdx, timer, y] = snap.cr[i];
                const c = list[i];
                c.state = CRUSHER_STATES[stateIdx] || c.state;
                c.timer = timer;
                c.obs.mesh.position.y = y;
                c.obs.sunk = c.state === 'sunk';
                const mat = c.obs.mesh.material;
                mat.emissive.setHex(c.state === 'warn' ? ((timer >> 2) & 1 ? 0x881111 : 0x220000) : 0x000000);
            }
        }
        if (snap.gs) {
            const gates = this.mapManager.gates;
            for (let i = 0; i < gates.length && i < snap.gs.length; i++) {
                const g = gates[i];
                const [mx, mz] = snap.gs[i];
                const dx = mx - g.mesh.position.x;
                const dz = mz - g.mesh.position.z;
                g.mesh.position.x = mx;
                g.mesh.position.z = mz;
                g.x += dx;
                g.z += dz;
            }
        }

        // QTE overlay for my own Cream.
        const q = this.myEntity && this.myEntity.characterName === 'Cream'
            ? (snap.ps[this.players.indexOf(this.myEntity)]?.q || 0)
            : 0;
        if (q && q[0]) {
            this.myEntity.qteActive = true;
            const heal = this.myEntity.config.abilities.heal;
            this.ui.showQte(q[1], q[2], heal.qteZoneWidth, !!q[3]);
        } else {
            if (this.myEntity && this.myEntity.characterName === 'Cream') this.myEntity.qteActive = false;
            this.ui.hideQte();
        }
    }

    applySnapshotInterp() {
        const snap = this.curSnap;
        if (!snap) return;
        const prev = this.prevSnap || snap;

        // Render ~75ms in the past and lerp between the two newest snapshots.
        const now = performance.now();
        const span = Math.max(1, this.snapCurTime - this.snapPrevTime);
        let alpha = (now - 75 - this.snapPrevTime) / span;
        alpha = alpha < 0 ? 0 : (alpha > 1 ? 1 : alpha);

        for (let i = 0; i < this.players.length; i++) {
            const p = this.players[i];
            const a = prev.ps[i], b = snap.ps[i];
            if (!b) continue;
            const from = a || b;
            p.mesh.position.x = from.x + (b.x - from.x) * alpha;
            p.mesh.position.y = from.y + (b.y - from.y) * alpha;
            p.mesh.position.z = from.z + (b.z - from.z) * alpha;
            let d = b.ry - from.ry;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            p.mesh.rotation.y = from.ry + d * alpha;

            p.health = b.h;
            p.ability1Cooldown = b.a1;
            p.ability2Cooldown = b.a2;
            p.escaped = !!b.e;
            const visible = b.h > 0 && !b.e;
            if (p.mesh.visible !== visible) p.mesh.visible = visible;

            if (p.characterName === 'Cream' && p.cheeseMesh && b.cx !== undefined) {
                p.cheeseMesh.visible = visible;
                p.cheeseMesh.position.x = b.cx;
                p.cheeseMesh.position.z = b.cz;
                if (p.cheeseHealRing) p.cheeseHealRing.visible = !!b.cr;
            }
            if (p.flameAura) p.flameAura.visible = visible && !!(b.fl & FL_FLAME);
            if (p.flameAura && (b.fl & FL_FLAME)) p.flameAura.position.copy(p.mesh.position);
            if (p.blockMesh) p.blockMesh.visible = !!(b.fl & FL_BLOCK);

            let want = 0x000000;
            if (b.fl & FL_HL) want = 0xff0000;
            else if (b.fl & FL_SHIELD) want = 0x2288ff;
            else if (b.fl & FL_DASH) want = 0x00aaff;
            else if (b.fl & FL_GASTER) want = 0xaa00ff;
            else if (b.fl & FL_INV) want = 0xff00ff;
            else if (b.fl & FL_ROOT) want = 0x8899bb;
            if (p.emissiveState !== want) { p.setEmissive(want); p.emissiveState = want; }
        }

        const k = this.killer;
        const kb = snap.k;
        if (k && kb) {
            const ka = prev.k || kb;
            k.mesh.position.x = ka.x + (kb.x - ka.x) * alpha;
            k.mesh.position.y = ka.y + (kb.y - ka.y) * alpha;
            k.mesh.position.z = ka.z + (kb.z - ka.z) * alpha;
            let d = kb.ry - ka.ry;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            k.mesh.rotation.y = ka.ry + d * alpha;
            k.stunned = kb.st ? 1 : 0;
            k.isRushing = !!kb.ru;

            let want = 0x550000;
            if (kb.st) want = 0xffffff;
            else if (kb.ru) want = 0xff0000;
            else if (kb.lu === 1 || kb.wi) want = (Math.floor(now / 100) % 2 === 0) ? 0xffffff : 0x550000;
            else if (kb.lu === 2) want = 0xff3300;
            if (k.emissiveState !== want) { k.setGlow(want); }
        }
    }

    processNetEvents(events) {
        if (!events || !events.length) return;
        for (const ev of events) {
            switch (ev.e) {
                case 'sfx':
                    this.audio.playSfx(ev.c, ev.a);
                    break;
                case 'hb': {
                    const h = new Hitbox(this, this.engine.scene, ev.x, ev.z, ev.r, ev.du, null, ev.ty, 0, null, ev.sh ? 'box' : 'sphere', ev.w, ev.d, true);
                    h.owner = ev.k && this.killer ? this.killer : (this.players[0] || null);
                    this.activeHitboxes.push(h);
                    break;
                }
                case 'pj': {
                    const proj = new Projectile(this.engine.scene, ev.x, ev.z, ev.dx, ev.dz, null, {
                        side: ev.sd, stun: ev.st, root: ev.rt, damage: ev.dm, speed: ev.sp, color: ev.co, visual: true
                    });
                    this.projectiles.push(proj);
                    break;
                }
                case 'fw': {
                    const owner = this.players[ev.p];
                    if (owner) {
                        const wall = new FireWall(this, owner, ev.x, ev.z, true);
                        wall._nid = ev.id;
                        this.fireWalls.push(wall);
                    }
                    break;
                }
                case 'ring':
                    if (!this.ring) this.spawnRingAt(ev.x, ev.z);
                    break;
            }
        }
    }
}
