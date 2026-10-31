// Browser side of the online layer.
//
// Two interchangeable transports, picked automatically in connect():
//
//   1. 'ws'   - same-origin WebSocket at /ws, served by the Node relay
//               (`npm start`, or the dev proxy under `npm run dev`). Preferred
//               whenever it answers: a central relay needs no NAT traversal.
//
//   2. 'peer' - PeerJS over WebRTC, used when no relay answers on this origin
//               (GitHub Pages and any other static host). Signaling goes
//               through PeerJS's free public broker; game traffic then flows
//               directly between browsers. The HOST client relays room
//               traffic itself, mirroring server/index.js exactly, so message
//               shapes are identical on both transports.
//
// Game-specific handling is wired up by GameManager through on* callbacks.

import { Peer } from 'peerjs';

// Deterministic host peer id: prefix + room code. Guests derive it from the
// 4-letter code they type in, so no out-of-band discovery is needed.
const PEER_PREFIX = 'om25d-';
const WS_TIMEOUT = 2500;         // how long the same-origin relay gets before P2P fallback
const PEER_OPEN_TIMEOUT = 8000;  // broker handshake
const PEER_JOIN_TIMEOUT = 12000; // guest: broker open + data channel + join ack

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode() {
    let code = '';
    const bytes = new Uint8Array(4);
    (globalThis.crypto || {}).getRandomValues
        ? crypto.getRandomValues(bytes)
        : bytes.forEach((_, i) => { bytes[i] = Math.random() * 256; });
    for (let i = 0; i < 4; i++) code += ROOM_CHARS[bytes[i] % ROOM_CHARS.length];
    return code;
}

// window.OM_PEER_CONFIG lets a deployment point at its own PeerServer
// instance. Default: PeerJS's free public broker, which needs no account.
function peerOpts() {
    return (typeof window !== 'undefined' && window.OM_PEER_CONFIG) || undefined;
}

function peerError(err, fallback) {
    const e = new Error((err && err.message) || fallback);
    e.peerType = (err && err.type) || '';
    if (e.peerType === 'peer-unavailable') e.message = 'Room not found';
    else if (e.peerType === 'browser-incompatible') e.message = 'This browser does not support WebRTC';
    else if (e.peerType === 'webrtc') e.message = 'Could not establish a direct connection';
    else if (!err || e.peerType === 'network' || e.peerType === 'server-error' ||
             e.peerType === 'socket-error' || e.peerType === 'socket-closed') {
        e.message = 'Could not reach the matchmaking service';
    }
    return e;
}

export class NetClient {
    constructor() {
        this.transport = null;   // 'ws' | 'peer', chosen in connect()
        this.ws = null;
        this.connected = false;
        this.id = null;
        this.isHost = false;
        this.roomCode = null;

        // PeerJS state
        this.peer = null;
        this.conns = new Map();  // host: guestPeerId -> { conn, name }
        this.hostConn = null;    // guest: connection to the host
        this.hostName = '';
        this._hostSetup = null;  // last lobby payload, for late joiners (server parity)

        // Callbacks (set by GameManager):
        this.onRoster = null;    // (players: [{id, name}])
        this.onLobby = null;     // (setup)
        this.onStart = null;     // (setup)
        this.onSnap = null;      // (snapshot)
        this.onPause = null;
        this.onResume = null;
        this.onEnd = null;       // ({title, subtitle, summary})
        this.onClosed = null;    // room dissolved
        this.onLeft = null;      // (id) a guest disconnected
        this.onPick = null;      // (id, char)
        this.onRole = null;      // (id, role)
        this.onInput = null;     // (id, mask) host-side
        this.onDisconnect = null;
        this.onServerError = null;

        this._pending = null;    // { resolve, reject, kind } for create/join (ws transport)
    }

    // ---- transport selection ------------------------------------------------

    connect(timeoutMs = 4000) {
        // Try the Node relay first; fall back to WebRTC when it isn't there.
        // Never rejects: room creation/join own the error surface so the UI
        // can say what actually failed.
        return this._connectWs(Math.min(timeoutMs, WS_TIMEOUT)).then(() => {
            this.transport = 'ws';
        }).catch(() => {
            this.transport = 'peer';
            this.connected = true; // real broker handshake happens on create/join
        });
    }

    _connectWs(timeoutMs) {
        return new Promise((resolve, reject) => {
            const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
            let ws;
            try {
                ws = new WebSocket(`${proto}${location.host}/ws`);
            } catch (err) {
                reject(new Error('WebSocket unavailable'));
                return;
            }
            this.ws = ws;

            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                try { ws.close(); } catch (e) { /* ignore */ }
                reject(new Error('Connection timed out'));
            }, timeoutMs);

            ws.onopen = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.connected = true;
                resolve();
            };
            ws.onerror = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.connected = false;
                this.ws = null;
                reject(new Error('Could not reach the game server'));
            };
            ws.onclose = () => {
                const wasConnected = this.connected && this.transport === 'ws';
                this.connected = false;
                if (this._pending) {
                    this._pending.reject(new Error('Connection closed'));
                    this._pending = null;
                }
                if (wasConnected && this.onDisconnect) this.onDisconnect();
            };
            ws.onmessage = (ev) => {
                const msg = this._parse(ev.data);
                if (msg) this._dispatch(msg);
            };
        });
    }

    // ---- room lifecycle -----------------------------------------------------

    createRoom(name) {
        if (this.transport === 'peer') return this._peerCreateRoom(name);
        return this._request({ t: 'create', name }, 'create');
    }

    joinRoom(code, name) {
        if (this.transport === 'peer') return this._peerJoinRoom(code, name);
        return this._request({ t: 'join', code, name }, 'join');
    }

    // ================= PEER TRANSPORT: HOST =================

    async _peerCreateRoom(name) {
        this.hostName = String(name || 'Host').slice(0, 20);
        this._destroyPeer();
        let lastError = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await this._openPeer(PEER_PREFIX + makeCode());
            } catch (err) {
                lastError = err;
                // Only retry when this exact id is taken; broker/network
                // failures would just burn the same timeout three times.
                if (err.peerType === 'unavailable-id') continue;
                this.connected = false;
                throw err;
            }
            this.isHost = true;
            this.roomCode = this.peer.id.slice(PEER_PREFIX.length);
            this.id = this.peer.id;
            this.connected = true;
            this.peer.on('connection', (conn) => this._hostAccept(conn));
            return { code: this.roomCode };
        }
        this.connected = false;
        throw lastError || peerError(null, 'Could not open a room');
    }

    _openPeer(id) {
        return new Promise((resolve, reject) => {
            let peer;
            try {
                peer = id ? new Peer(id, peerOpts()) : new Peer(peerOpts());
            } catch (err) {
                reject(peerError(err, 'Could not reach the matchmaking service'));
                return;
            }
            this.peer = peer;
            let opened = false;
            const timer = setTimeout(() => {
                if (opened) return;
                try { peer.destroy(); } catch (e) { /* ignore */ }
                if (this.peer === peer) this.peer = null;
                reject(peerError(null, 'Could not reach the matchmaking service'));
            }, PEER_OPEN_TIMEOUT);
            peer.once('open', () => {
                opened = true;
                clearTimeout(timer);
                resolve();
            });
            peer.on('error', (err) => {
                if (!opened) {
                    clearTimeout(timer);
                    // Keep this peer from lingering after a failed handshake.
                    try { peer.destroy(); } catch (e) { /* ignore */ }
                    if (this.peer === peer) this.peer = null;
                    reject(peerError(err, 'Could not reach the matchmaking service'));
                }
                // After open: broker hiccups don't tear down live P2P links.
            });
            peer.on('disconnected', () => {
                if (opened && this.peer === peer) { try { peer.reconnect(); } catch (e) { /* ignore */ } }
            });
        });
    }

    // Host side of server/index.js's room logic, verbatim in spirit: join
    // admission, roster broadcasts, and relaying guest messages to the game.
    _hostAccept(conn) {
        let joined = false;
        conn.on('data', (data) => {
            const msg = this._parse(data);
            if (!msg || typeof msg.t !== 'string') return;
            if (!joined) {
                if (msg.t !== 'join') return;
                joined = this._hostAdmit(conn, msg);
                return;
            }
            switch (msg.t) {
                case 'pick': if (this.onPick) this.onPick(conn.peer, msg.char); break;
                case 'role': if (this.onRole) this.onRole(conn.peer, msg.role); break;
                case 'in': if (this.onInput) this.onInput(conn.peer, msg.m | 0); break;
                case 'leave': this._guestGone(conn.peer); break;
                // guests never send: lobby / start / snap / pause / resume / end
            }
        });
        conn.on('close', () => this._guestGone(conn.peer));
        conn.on('error', () => { /* close follows */ });
    }

    _hostAdmit(conn, msg) {
        if (this.conns.size >= 3) {
            try { conn.send(JSON.stringify({ t: 'error', msg: 'Room is full' })); } catch (e) { /* ignore */ }
            setTimeout(() => { try { conn.close(); } catch (e) { /* ignore */ } }, 50);
            return false;
        }
        const name = String(msg.name || 'Player').slice(0, 20);
        this.conns.set(conn.peer, { conn, name });
        try { conn.send(JSON.stringify({ t: 'joined', code: this.roomCode, id: conn.peer })); } catch (e) { /* ignore */ }
        this._hostRosterChanged();
        if (this._hostSetup) {
            try { conn.send(JSON.stringify({ t: 'lobby', setup: this._hostSetup })); } catch (e) { /* ignore */ }
        }
        return true;
    }

    _guestGone(id) {
        if (!this.conns.has(id)) return;
        this.conns.delete(id);
        this._broadcast({ t: 'left', id });
        this._hostRosterChanged();
    }

    _hostRoster() {
        const players = [{ id: this.id, name: this.hostName || 'Host' }];
        for (const [pid, g] of this.conns) players.push({ id: pid, name: g.name });
        return players;
    }

    _hostRosterChanged() {
        const players = this._hostRoster();
        if (this.onRoster) this.onRoster(players); // host's own roster view
        this._broadcast({ t: 'roster', players });
    }

    _broadcast(msg) {
        if (this.conns.size === 0) return false;
        const raw = JSON.stringify(msg);
        let sent = false;
        for (const g of this.conns.values()) {
            if (!g.conn.open) continue;
            try { g.conn.send(raw); sent = true; } catch (e) { /* ignore */ }
        }
        return sent;
    }

    // ================= PEER TRANSPORT: GUEST =================

    _peerJoinRoom(code, name) {
        return new Promise(async (resolve, reject) => {
            this._destroyPeer();
            try {
                await this._openPeer(null); // random id: proves the broker is reachable
            } catch (err) {
                this.connected = false;
                reject(err);
                return;
            }
            const hostId = PEER_PREFIX + String(code || '').toUpperCase().trim();
            let conn;
            try {
                conn = this.peer.connect(hostId, { reliable: true });
            } catch (err) {
                this.connected = false;
                reject(peerError(err, 'Room not found'));
                return;
            }
            this.hostConn = conn;

            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                this.connected = false;
                try { conn.close(); } catch (e) { /* ignore */ }
                reject(new Error('No answer from that room'));
            }, PEER_JOIN_TIMEOUT);

            conn.on('open', () => {
                this.connected = true;
                try { conn.send(JSON.stringify({ t: 'join', name })); } catch (e) { /* ignore */ }
            });
            conn.on('data', (data) => {
                const msg = this._parse(data);
                if (!msg || typeof msg.t !== 'string') return;
                if (!settled) {
                    if (msg.t === 'joined') {
                        settled = true;
                        clearTimeout(timer);
                        this.isHost = false;
                        this.roomCode = msg.code;
                        this.id = this.peer.id;
                        resolve({ code: msg.code });
                        return;
                    }
                    if (msg.t === 'error') {
                        settled = true;
                        clearTimeout(timer);
                        this.connected = false;
                        reject(new Error(msg.msg || 'Room error'));
                        return;
                    }
                }
                this._dispatch(msg);
            });
            conn.on('close', () => {
                const wasConnected = this.connected && !this.isHost;
                this.connected = false;
                if (settled && wasConnected && this.onDisconnect) this.onDisconnect();
                else if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    reject(new Error('Room not found'));
                }
            });
            conn.on('error', () => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    this.connected = false;
                    reject(new Error('Could not connect to that room'));
                }
            });
            this.peer.on('error', (err) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    this.connected = false;
                    reject(peerError(err, 'Room not found'));
                }
            });
        });
    }

    // ---- shared dispatch / send / teardown ----------------------------------

    _parse(data) {
        if (typeof data === 'string') {
            try { return JSON.parse(data); } catch (e) { return null; }
        }
        return data && typeof data === 'object' ? data : null;
    }

    _dispatch(msg) {
        switch (msg.t) {
            case 'hello':
                this.id = msg.id;
                break;
            case 'created':
                this.isHost = true;
                this.roomCode = msg.code;
                this.id = msg.id;
                this._resolvePending('create', msg);
                break;
            case 'joined':
                this.isHost = false;
                this.roomCode = msg.code;
                this.id = msg.id;
                this._resolvePending('join', msg);
                break;
            case 'error':
                if (this._pending) {
                    this._pending.reject(new Error(msg.msg || 'Room error'));
                    this._pending = null;
                } else if (this.onServerError) {
                    this.onServerError(msg.msg || 'Room error');
                }
                break;
            case 'roster': if (this.onRoster) this.onRoster(msg.players); break;
            case 'lobby': if (this.onLobby) this.onLobby(msg.setup); break;
            case 'start': if (this.onStart) this.onStart(msg.setup); break;
            case 'snap': if (this.onSnap) this.onSnap(msg); break;
            case 'pause': if (this.onPause) this.onPause(); break;
            case 'resume': if (this.onResume) this.onResume(); break;
            case 'end': if (this.onEnd) this.onEnd(msg); break;
            case 'closed': if (this.onClosed) this.onClosed(); break;
            case 'left': if (this.onLeft) this.onLeft(msg.id); break;
            case 'pick': if (this.onPick) this.onPick(msg.id, msg.char); break;
            case 'role': if (this.onRole) this.onRole(msg.id, msg.role); break;
            case 'in': if (this.onInput) this.onInput(msg.id, msg.m | 0); break;
        }
    }

    _resolvePending(kind, msg) {
        if (this._pending && this._pending.kind === kind) {
            this._pending.resolve(msg);
            this._pending = null;
        }
    }

    _send(msg) {
        if (this.transport === 'peer') {
            if (!this.connected) return false;
            if (this.isHost) return this._broadcast(msg);
            const c = this.hostConn;
            if (c && c.open) {
                try { c.send(JSON.stringify(msg)); return true; } catch (e) { /* ignore */ }
            }
            return false;
        }
        if (this.ws && this.connected && this.ws.readyState === 1) {
            this.ws.send(JSON.stringify(msg));
            return true;
        }
        return false;
    }

    _request(payload, kind) {
        return new Promise((resolve, reject) => {
            if (!this.connected) { reject(new Error('Not connected')); return; }
            if (this._pending) { reject(new Error('Another request is pending')); return; }
            this._pending = { resolve, reject, kind };
            this._send(payload);
            setTimeout(() => {
                if (this._pending && this._pending.kind === kind) {
                    this._pending.reject(new Error('No response from server'));
                    this._pending = null;
                }
            }, 5000);
        });
    }

    sendLobby(setup) {
        if (this.transport === 'peer' && this.isHost) this._hostSetup = setup;
        this._send({ t: 'lobby', setup });
    }
    sendPick(char) { this._send({ t: 'pick', char }); }
    sendRole(role) { this._send({ t: 'role', role }); }
    sendStart(setup) {
        if (this.transport === 'peer' && this.isHost) this._hostSetup = setup;
        this._send({ t: 'start', setup });
    }
    sendInput(mask) { this._send({ t: 'in', m: mask }); }
    sendSnap(snap) { this._send(snap); }
    sendPause() { this._send({ t: 'pause' }); }
    sendResume() { this._send({ t: 'resume' }); }
    sendEnd(title, subtitle, summary) { this._send({ t: 'end', title, subtitle, summary }); }
    sendLeave() { this._send({ t: 'leave' }); }

    _destroyPeer() {
        for (const g of this.conns.values()) {
            try { g.conn.close(); } catch (e) { /* ignore */ }
        }
        this.conns.clear();
        if (this.hostConn) {
            try { this.hostConn.close(); } catch (e) { /* ignore */ }
            this.hostConn = null;
        }
        if (this.peer) {
            try { this.peer.destroy(); } catch (e) { /* ignore */ }
            this.peer = null;
        }
    }

    disconnect() {
        if (this.transport === 'peer') {
            if (this.isHost && this.connected) {
                this._broadcast({ t: 'closed' });
                // Give the reliable channel a moment to flush before closing.
                setTimeout(() => this._destroyPeer(), 150);
            } else {
                this._destroyPeer();
            }
            this.connected = false;
            this.isHost = false;
            this.roomCode = null;
            this._pending = null;
            this._hostSetup = null;
            return;
        }
        this.sendLeave();
        this.isHost = false;
        this.roomCode = null;
        this._pending = null;
        if (this.ws) {
            try { this.ws.close(); } catch (e) { /* ignore */ }
            this.ws = null;
        }
        this.connected = false;
    }
}