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
gamepads) and single-player vs. AI need no server. If a build is hosted on
static hosting (see below), online rooms show a "could not reach server"
message and local play keeps working.

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

### 2. Static hosting (GitHub Pages, Netlify, itch.io…) — LOCAL PLAY ONLY

```bash
npm run build     # output in dist/
npm run deploy    # publishes dist/ to GitHub Pages (gh-pages branch)
```

A static host cannot run the WebSocket relay, so **online rooms won't
connect** there — local play and vs. AI still work fine. If you want online
play on your own domain, run `npm start` on a Node host and point the domain
at it instead.

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
  simulation for every entity and streams compact snapshots (20Hz) plus
  gameplay events (sounds, projectiles, firewalls, hitboxes, ring, game over).
- **Guests** send their input bitmask at 30Hz and render the host's snapshots
  with ~90ms interpolation. Guests never simulate collisions, damage or timers.
- If the host leaves, the room closes; if a survivor disconnects they are
  counted as dead, if the killer disconnects the AI takes over.

## Map rotation

- **Open Field** — wide open, light cover
- **Box Arena** — symmetric blocks and lanes
- **Crusher Hall** — rhythmic crushers that sink flush with the floor to open
  shortcuts, then rise and crush anyone standing inside
- **Maze Mania** — classic maze with sliding gates

## Troubleshooting

- **"Could not reach the game server"** — the relay isn't running. Use
  `npm start` (or `npm run server` in dev). Static hosts can't host rooms.
- **Room not found** — codes are case-insensitive 4 letters; the host must
  still be connected (closing the host's tab closes the room).
- **No audio until you click** — browsers block autoplay; the first click or
  key press unlocks it.
