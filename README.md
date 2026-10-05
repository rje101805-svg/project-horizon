# Project: Horizon

Project Horizon is a multiplayer space battle royale concept for the Handshake/OpenAI challenge: **launch → explore → loot → fight → survive** in a collapsing solar system.

**Current build: Phase 1, Step 2 — Server Game Loop.** This build is a flight/networking sandbox, not a complete multiplayer battle royale. The Node.js + Socket.io server calculates movement; the Phaser browser client sends inputs and renders snapshots.

## Start locally

Use Node.js **22.12 or newer** (Node 24 LTS recommended). Run the following on your own computer to play at localhost. A localhost address from a cloud workspace is not reachable from your laptop without port forwarding.

1. Download/clone the `work` branch, then open a terminal in its folder:
   ```sh
   git clone --branch work https://github.com/rje101805-svg/project-horizon.git
   cd project-horizon
   npm ci
   ```
   If you already cloned it, use `git switch work` and `git pull` first.
2. Start the flight server in that terminal:
   ```sh
   npm run server
   ```
   Leave it running. You should see `Horizon flight server: http://localhost:3001 (30 ticks/s)`.
3. Open a **second terminal in the same project folder**, and start the client:
   ```sh
   npm run dev
   ```
4. Open **http://localhost:5173**. Leave the flight server URL as **http://localhost:3001** and click **Connect and fly**. Wait for **Connected · server-authoritative flight · 30 Hz**.

Both terminals must stay running. Ctrl+C stops a process. `npm run server:dev` optionally restarts the server when server/shared files change. A restart disconnects clients and resets flight on reconnect.

Controls:
- **WASD / arrows:** move, facing your movement direction.
- **Shift (hold):** unlimited boost, preserving the existing sandbox's handling.
- **Mouse movement while idle:** set aim direction, sent to and applied by the server.
- **R / Reset flight:** request a server-side reset to the starting position.
- **Back to home:** close the connection and return to selections.

Pilot and rocket selections remain cosmetic. Stars, four planet landmarks, map boundary, camera follow, and minimap are reused from the existing implementation. Planets have no collisions or gravity. This sandbox has no damage, loot, black hole, extraction, combat, rooms or matchmaking. The earlier solo-survival build remains available in Git history at `cb1b76f`.

## Prove movement is server-authoritative

1. Start both processes as above. Hold D and Shift. The rocket moves, coordinates change, speed approaches 440, and the **Server tick** counter advances.
2. Release keys. In the **server terminal**, press Ctrl+C. Wait until the client reports disconnection (or stopped snapshots). The rocket position and tick must freeze. Hold any movement key: the rocket must stay frozen. There is no offline movement fallback.
3. Restart with `npm run server`. The client reconnects automatically, gets a new connection ID, and respawns at **X 1370.0 · Y 1200.0**. Movement works again. If you start with no server, the client shows a connection error and cannot fly.
4. For direct protocol evidence, open browser developer tools → **Network**, select the Socket.io **WebSocket** request, and inspect its messages. Outgoing `input` events contain `up/down/left/right/boost/aim`; incoming `snapshot` events contain the server tick and `id/x/y/vx/vy/rotation`. Socket.io may initially use HTTP polling before upgrading, so look for the WebSocket once connected.
5. Optional deeper check, only on the Vite development server: release keys and run this in the browser console:
   ```js
   window.__HORIZON_FLIGHT__.socket.emit('input', {
     up: false, down: false, left: false, right: false,
     boost: false, aim: 0, x: 999999, y: 999999, speed: 999999
   });
   ```
   The rocket must not teleport or gain speed. The server ignores those extra fields. The automated tests check this too. These inspection handles are absent from production builds.

## Architecture

- `shared/flight.ts`: single source of truth for physics/constants/input validation. Normal speed 290 units/s, boost 440, response 7, normalized diagonals, inertial braking, 20-unit boundary margin; all preserved from the prior client movement formula.
- `shared/protocol.ts`: input and snapshot types shared by client/server.
- `server/game.ts`: connection-owned state, fixed 1/30-second simulation, latest-input application, server-side reset, disconnect cleanup, and snapshots every tick.
- `server/index.ts`: starts the Node server and handles shutdown.
- `src/network.ts`: input transmission, snapshots, reconnect and cleanup.
- `src/main.ts`: Phaser input sampling and rendering. No local position/velocity integration, prediction, or physics fallback.

The server uses a monotonic accumulator with a short scheduler interval to avoid 33ms rounding drift. Simulation steps always use exactly 1/30 second. Catch-up is bounded to five steps during stalls; prolonged server overload slows simulation rather than causing an unbounded backlog. Inputs expire after 250ms without refresh and the server then brakes the rocket. Blur/hidden-tab handling also releases movement. Input handling never advances physics, so sending extra messages does not increase speed.

Every connection has independent server-owned flight state. Snapshots include all connected players, but this step renders only your own rocket. There are no custom gameplay rooms or lobbies. Reconnecting creates a fresh player rather than restoring a session.

## Builds and tests

```sh
npm run build        # TypeScript checks (including server/shared/tests) + client dist/
npm run build:pages  # TypeScript checks + GitHub Pages docs/ with /project-horizon/ base
npm run preview      # Preview dist/ at http://localhost:4173; keep server running too
npm test             # Physics, real Socket.io integration, and browser authority tests
```

If Chromium is not installed, run `npx playwright install chromium` before `npm test`. Tests use system Chromium when available, otherwise Playwright's browser. Browser tests manage their own client/server processes on ports 5175 and 3002. Server integration tests use an ephemeral port and real sockets.

Tests verify movement speeds, diagonal normalization, inertia, world bounds, malformed inputs, forged state rejection, fixed tick cadence, stale-input braking, server reset, disconnect cleanup, browser flight, reconnect, snapshot correction, and frozen flight without a connection. Phaser still produces a large bundle-size warning; the build succeeds.

## GitHub Pages and server hosting

GitHub Pages continues to serve the static client from **work → /docs**, at the expected URL https://rje101805-svg.github.io/project-horizon/ once Pages is enabled. Build output is committed in `docs/`; rebuild and push it after client changes. Pages cannot run Node.js or Socket.io.

For online flight, run this server on a separate host supporting a persistent Node process and WebSocket connections, then enter its **HTTPS base URL** in the client home screen. No public server is deployed by this step. Without one, Pages loads the interface but cannot fly. HTTPS Pages cannot connect to an HTTP server.

Server configuration:
- `PORT`: default `3001`; hosting platforms can set their assigned port.
- `CLIENT_ORIGINS`: comma-separated exact browser origins (no paths/trailing slash). Defaults include localhost/127.0.0.1 ports 5173/4173 and `https://rje101805-svg.github.io`. Override for a different client address/port.
- `VITE_SERVER_URL`: optional build-time client default, e.g. put `VITE_SERVER_URL=https://your-server.example` in an untracked `.env.local`, then rebuild Pages. The URL is public configuration, not a secret. The home-screen field can always override it.

The `npm run server` command runs TypeScript with `tsx`; hosted environments must install development dependencies too (use `npm ci`, not `npm ci --omit=dev`). No API keys, accounts or database are required. `/health` reports loop readiness, tick rate, tick count, and connected-player count.

## Before Step 3

No blocker was found for one-client local authoritative flight. Limitations to account for before expanding networking:
- Public play needs a separately hosted HTTPS/WebSocket server and verified allowed origins.
- Network latency is now visible; no prediction, interpolation, reconciliation or bandwidth tuning has been implemented. Local feel should be close; remote feel needs latency testing before choosing those improvements.
- This is a development server, with input validation and origin restrictions but no authentication, reconnect session persistence, per-client message-rate limit or scale/load testing. It is not hardened for an open competition.
- Tests cover two-layer authority but not a full multiplayer match. Additional clients have independent state and are not rendered yet.

Step 3 has **not** been implemented. Rooms, matchmaking, other-player rendering, black-hole mechanics, loot, combat, health and results remain future work.
