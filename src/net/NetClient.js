// Browser side of the online layer. Connects to the game server at /ws,
// joins a room, and shuttles lobby state, host snapshots and player inputs.
// Game-specific handling is wired up by GameManager through on* callbacks.

export class NetClient {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.id = null;
        this.isHost = false;
        this.roomCode = null;

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

        this._pending = null;    // { resolve, reject, kind } for create/join
    }

    connect(timeoutMs = 4000) {
        return new Promise((resolve, reject) => {
            if (this.ws && this.connected) { resolve(); return; }
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
                reject(new Error('Could not reach the game server'));
            };
            ws.onclose = () => {
                const wasConnected = this.connected;
                this.connected = false;
                if (this._pending) {
                    this._pending.reject(new Error('Connection closed'));
                    this._pending = null;
                }
                if (wasConnected && this.onDisconnect) this.onDisconnect();
            };
            ws.onmessage = (ev) => {
                let msg;
                try { msg = JSON.parse(ev.data); } catch (e) { return; }
                this._dispatch(msg);
            };
        });
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
        if (this.ws && this.connected && this.ws.readyState === 1) {
            this.ws.send(JSON.stringify(msg));
            return true;
        }
        return false;
    }

    createRoom(name) {
        return this._request({ t: 'create', name }, 'create');
    }

    joinRoom(code, name) {
        return this._request({ t: 'join', code, name }, 'join');
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

    sendLobby(setup) { this._send({ t: 'lobby', setup }); }
    sendPick(char) { this._send({ t: 'pick', char }); }
    sendRole(role) { this._send({ t: 'role', role }); }
    sendStart(setup) { this._send({ t: 'start', setup }); }
    sendInput(mask) { this._send({ t: 'in', m: mask }); }
    sendSnap(snap) { this._send(snap); }
    sendPause() { this._send({ t: 'pause' }); }
    sendResume() { this._send({ t: 'resume' }); }
    sendEnd(title, subtitle, summary) { this._send({ t: 'end', title, subtitle, summary }); }
    sendLeave() { this._send({ t: 'leave' }); }

    disconnect() {
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
