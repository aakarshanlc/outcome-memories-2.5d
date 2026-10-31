# Outcome Memories 2.5D

An asymmetric 1-vs-all horror game built with Three.js. One player hunts the
survivors; everyone else tries to stay alive and reach the escape ring.

The game now supports **online rooms**: one player hosts the match from their
browser (their machine runs the simulation) and up to 4 players total join with
a room code. Local couch play and single-player vs. AI still work without any
server.

---

## Requirements

- **Node.js 18+** and npm

## Install

```bash
npm install
```

---

## Running the game

### Option A — Online play (recommended)

One command builds the game and starts the game server (website + WebSocket):

```bash
npm start
```

Then open **http://localhost:8788** in each player's browser.

- Click **ONLINE PLAY → CREATE ROOM**, share the 4-letter room code.
- Friends open the same URL, enter the code, **JOIN ROOM**.
- The host picks characters/map/killer, everyone picks a role, host hits
  **START MATCH**.

### Option B — Development (hot reload)

Run these in two terminals:

```bash
npm run dev 2>&1        # terminal 1: Vite dev server (http://localhost:5173)
npm run server          # terminal 2: game server (ws proxy target, port 8788)
```

The Vite dev server proxies WebSocket traffic to the game server automatically.
Open http://localhost:5173 — online rooms work exactly the same.

### Option C — Local play only (no server)

```bash
npm run dev
```

Just click **PLAY LOCAL** — couch co-op (up to 4 survivors on one keyboard /
gamepads) and single-player vs. AI need no server. Static hosting (see below)
also runs full online rooms via the WebRTC fallback, no server required.

---

## Hosting it as a website

### 1. Full online hosting (any Node.js host) — RECOMMENDED

The server (`server/index.js`) serves the built game **and** relays room
traffic over WebSockets, so you need a host that runs Node processes:

| Host | Notes |
|---|---|
| **Render / Railway / Fly.io** | Create a Web Service from the repo, build command `npm install && npm run build`, start command `npm start`. They set `PORT` for you. |
| **A VPS (any provider)** | `npm install && npm start` behind nothing, or behind nginx/Caddy with WebSocket upgrade enabled for `/ws`. Use `pm2`/`systemd` to keep it alive. |
| **Glitch / Replit / similar** | Run `npm start`; they usually expose a port directly. |

Points to remember:

- The server listens on **`process.env.PORT` or 8788**.
- Make sure the host allows **WebSocket connections** on the same domain
  (default behavior for all hosts above — no extra config).
- HTTPS works automatically: the client connects with `wss://` when the page
  is served over HTTPS.

Sanity check after deploying: open the site, **ONLINE PLAY → CREATE ROOM** —
if a room code appears, both the build and the WebSocket relay are live.

### 2. Static hosting (GitHub Pages, Netlify, itch.io…) — FULL ONLINE PLAY

```bash
npm run build     # output in dist/
npm run deploy    # publishes dist/ to GitHub Pages (gh-pages branch)
```

No server needed. The client first probes the same origin for the WebSocket
relay; when no relay answers (as on any static host) it automatically falls
back to **PeerJS / WebRTC**: room codes are derived from deterministic peer
ids, signaling goes through PeerJS's free public broker, and game traffic
flows directly between browsers with the host's browser relaying room
messages. Both transports use identical message shapes, so maps, characters
and gameplay behave the same either way.

GitHub Pages specifics:

- `vite.config.js` sets `base: '/outcome-memories-2.5d/'`, matching the
  project name, so assets resolve on `https://<user>.github.io/<repo>/`.
  If you rename the repo, change `base` to match.
- `npm run deploy` pushes `dist/` to the `gh-pages` branch; enable Pages in
  the repo settings (Source: `gh-pages` branch) once.
- Every player just opens the published URL — **ONLINE PLAY → CREATE ROOM**
  and share the 4-letter code. The first room attempt on a static host waits
  ~2.5s for a nonexistent relay before switching to WebRTC, so a room code
  appears after a short pause.
- WebRTC needs both players' browsers to allow it (no strict enterprise
  firewall blocking UDP). If joining fails, the joiner sees "Room not found"
  or "No answer from that room" — retry, or host from a Node host instead.

You can still point online play at your own relay by running `npm start` on a
Node host: the same build prefers that WebSocket relay whenever one answers
on its origin.

---

## Controls

| Action | P1 | P2 | P3 | P4 |
|---|---|---|---|---|
| Move | W A S D | Arrow keys | T F G H | I J K L |
| Ability 1 | Q | / | R | U |
| Ability 2 | E | . | Y | O |
| Attack (M1) | Space | Enter | V | P |
| Pause / back | Esc | | | |
| Dev panel | Shift + \` | | | |

Gamepads can be bound per player in **SETTINGS**. Online guests use the P1
bindings on their own machine.

---

## How online play works (architecture)

- `server/index.js` — tiny Node HTTP + `ws` server. Serves `dist/`, manages
  4-letter rooms, relays lobby state, host snapshots and guest inputs. It never
  runs game logic.
- The **room host's browser is authoritative**: it runs the fixed 60Hz
  simulation for every entity and streams compact snapshots (30Hz) plus
  gameplay events (sounds, projectiles, firewalls, hitboxes, ring, game over).
- **Guests** send their input bitmask at 30Hz and render the host's snapshots
  with a short interpolation buffer. Guests never simulate collisions, damage
  or timers.
- **Cameras:** online play is single-camera — no splitscreen. Every browser
  owns a survivor slot (unclaimed players are auto-seated when the host
  starts), so computer 1's camera follows player 1's character and computer 2's
  camera follows player 2's, labeled `· YOU`. Dead players spectate the
  nearest living survivor.
- **Transports:** `ws` (same-origin Node relay) is preferred, `peer`
  (PeerJS/WebRTC, host-relayed) is the automatic fallback on static hosts.
  See the header of `src/net/NetClient.js`.
- If the host leaves, the room closes; if a survivor disconnects they are
  counted as dead, if the killer disconnects the AI takes over.

## Map rotation

- **Open Field** — wide open, light cover
- **Box Arena** — symmetric blocks and lanes
- **Crusher Hall** — rhythmic crushers that sink flush with the floor to open
  shortcuts, then rise and crush anyone standing inside
- **Maze Mania** — classic maze with sliding gates that act as **killer-only
  doors**: the killer walks straight through while survivors are blocked

## Troubleshooting

- **"Could not reach the matchmaking service"** — the WebRTC broker didn't
  answer (offline or blocked). On a Node host, use `npm start` so the
  WebSocket relay is available instead.
- **Room not found** — codes are case-insensitive 4 letters; the host must
  still be connected (closing the host's tab closes the room).
- **No audio until you click** — browsers block autoplay; the first click or
  key press unlocks it.
