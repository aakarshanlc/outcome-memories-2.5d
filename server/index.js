// Outcome Memories 2.5D - online game server.
// Serves the built client (dist/) over HTTP and relays room traffic over
// WebSocket at /ws. The game host client is authoritative: it simulates the
// match and streams snapshots; other clients send inputs and render snapshots.
//
// Run:  npm run build && npm start     (or npm run dev + npm run server for dev)
// Env:  PORT (default 8788)

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 9000;
// Keep in sync with `base` in vite.config.js: the build emits asset URLs under
// this prefix, so strip it when the server hosts the game at the root.
const BASE = '/outcome-memories-2.5d/';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.dae': 'model/vnd.collada+xml',
    '.obj': 'text/plain; charset=utf-8',
    '.mtl': 'text/plain; charset=utf-8',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.wasm': 'application/wasm',
    '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
    try {
        let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (urlPath === '/') urlPath = BASE;
        let filePart = urlPath.startsWith(BASE) ? urlPath.slice(BASE.length) : urlPath;
        if (urlPath === BASE) filePart = 'index.html';
        // Normalize: path.resolve would treat a leading slash as filesystem root.
        filePart = filePart.replace(/^\/+/, '');
        if (filePart === '' || filePart.endsWith('/')) filePart += 'index.html';

        // No path traversal: resolve and confirm the file lives inside dist.
        const resolved = path.resolve(DIST, filePart);
        if (!resolved.startsWith(DIST)) { res.writeHead(403); res.end('Forbidden'); return; }

        try {
            const data = await readFile(resolved);
            const type = MIME[path.extname(resolved).toLowerCase()] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
            res.end(data);
        } catch {
            // SPA fallback: unknown non-file paths get the app shell.
            if (!path.extname(filePart)) {
                const html = await readFile(path.join(DIST, 'index.html'));
                res.writeHead(200, { 'Content-Type': MIME['.html'] });
                res.end(html);
            } else {
                res.writeHead(404); res.end('Not found');
            }
        }
    } catch (err) {
        res.writeHead(500); res.end('Server error');
        console.error('HTTP error', err);
    }
});

const wss = new WebSocketServer({ server, path: '/ws' });

// rooms: code -> { hostId, players: Map<id, ws>, setup }
const rooms = new Map();

function makeCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
        code = '';
        const bytes = randomBytes(4);
        for (let i = 0; i < 4; i++) code += chars[bytes[i] % chars.length];
    } while (rooms.has(code));
    return code;
}

function makeId() {
    return randomBytes(6).toString('hex');
}

function send(ws, msg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, exceptId = null) {
    const raw = JSON.stringify(msg);
    for (const [id, ws] of room.players) {
        if (id === exceptId) continue;
        if (ws.readyState === 1) ws.send(raw);
    }
}

function rosterOf(room, names) {
    return [...room.players.keys()].map(id => ({ id, name: names.get(id) || 'Player' }));
}

const playerNames = new Map(); // id -> display name

wss.on('connection', (ws) => {
    let myId = null;
    let myRoom = null;

    const leaveRoom = () => {
        if (!myRoom) return;
        const room = myRoom;
        room.players.delete(myId);
        playerNames.delete(myId);
        myRoom = null;

        if (room.players.size === 0) {
            rooms.delete(room.code);
            return;
        }
        if (room.hostId === myId) {
            // Host left: the match cannot continue (host runs the simulation).
            broadcast(room, { t: 'closed' });
            rooms.delete(room.code);
        } else {
            broadcast(room, { t: 'left', id: myId });
            broadcast(room, { t: 'roster', players: rosterOf(room, playerNames) });
        }
    };

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (!msg || typeof msg.t !== 'string') return;

        switch (msg.t) {
            case 'create': {
                const code = makeCode();
                const room = { code, hostId: myId, players: new Map(), setup: null };
                rooms.set(code, room);
                room.players.set(myId, ws);
                myRoom = room;
                room.code = code;
                playerNames.set(myId, String(msg.name || 'Host').slice(0, 20));
                // Re-stamp the code onto the room object (kept for clarity).
                rooms.set(code, room);
                send(ws, { t: 'created', code, id: myId });
                break;
            }
            case 'join': {
                const code = String(msg.code || '').toUpperCase().trim();
                const room = rooms.get(code);
                if (!room) { send(ws, { t: 'error', msg: 'Room not found' }); return; }
                if (room.players.size >= 4) { send(ws, { t: 'error', msg: 'Room is full' }); return; }
                room.players.set(myId, ws);
                myRoom = room;
                playerNames.set(myId, String(msg.name || 'Player').slice(0, 20));
                send(ws, { t: 'joined', code, id: myId });
                broadcast(room, { t: 'roster', players: rosterOf(room, playerNames) });
                if (room.setup) send(ws, { t: 'lobby', setup: room.setup });
                break;
            }
            case 'lobby': {
                // Host publishes lobby configuration; everyone renders it.
                if (!myRoom || myRoom.hostId !== myId) return;
                myRoom.setup = msg.setup;
                broadcast(myRoom, { t: 'lobby', setup: msg.setup }, myId);
                break;
            }
            case 'pick':
            case 'role': {
                // A guest asks the host to change character / role.
                if (!myRoom || myRoom.hostId === myId) return;
                broadcast(myRoom, { t: msg.t, id: myId, char: msg.char, role: msg.role }, myId);
                break;
            }
            case 'start': {
                if (!myRoom || myRoom.hostId !== myId) return;
                myRoom.setup = msg.setup;
                broadcast(myRoom, { t: 'start', setup: msg.setup }, myId);
                break;
            }
            case 'in': {
                // Input relay: only forwarded to the host, which owns the sim.
                if (!myRoom || myRoom.hostId === myId) return;
                send(rooms.get(myRoom.code)?.players.get(myRoom.hostId) || ws, { t: 'in', id: myId, m: msg.m | 0 });
                break;
            }
            case 'snap': {
                if (!myRoom || myRoom.hostId !== myId) return;
                broadcast(myRoom, msg, myId);
                break;
            }
            case 'pause':
            case 'resume':
            case 'end': {
                if (!myRoom || myRoom.hostId !== myId) return;
                broadcast(myRoom, msg, myId);
                break;
            }
            case 'leave': {
                leaveRoom();
                break;
            }
        }
    });

    ws.on('close', leaveRoom);
    ws.on('error', () => {});

    myId = makeId();
    send(ws, { t: 'hello', id: myId });
});

server.listen(PORT, () => {
    console.log(`Outcome Memories server listening on http://localhost:${PORT} (ws path /ws)`);
    console.log(`Serving build from ${DIST}`);
});
