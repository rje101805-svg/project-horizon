# Project Horizon architecture

Current scope: Phase 1, Step 2 — server-authoritative flight sandbox. Do not implement Step 3, rooms, matchmaking, combat, health, loot, black-hole mechanics, or planetary physics unless explicitly requested.

- `shared/flight.ts` is the source of truth for world bounds, spawn, tick rate, flight speeds, exponential response, input validation and fixed-step physics. It has no Phaser/DOM dependencies.
- `shared/protocol.ts` defines typed Socket.io input/snapshot events and player state. Inputs contain boolean keys and aim radians, never a client position, velocity, speed, or timestep.
- `server/game.ts` owns all player state, associates each connection with its own socket ID, and advances simulation at 30 fixed steps/s using monotonic time. It broadcasts snapshots after each step. Input messages replace pending input; they do not advance simulation. Inputs expire after 250ms without updates. Resets are applied on the server's next tick. Disconnect removes the player.
- `server/index.ts` is the Node entrypoint. Configure `PORT` and comma-separated `CLIENT_ORIGINS`; origins contain no trailing slash or path. Origin checks cover polling and WebSocket upgrades, but are not authentication.
- `src/network.ts` handles Socket.io connection/reconnection, 30Hz input sends, snapshots and cleanup. Disconnected inputs are not queued for later replay.
- `src/main.ts` reuses Phaser scenery, rocket, camera and minimap. It samples keyboard/aim and renders its own player from snapshots. It MUST NOT integrate flight position/velocity, call `stepFlight`, or silently fall back to offline physics. No prediction/interpolation is implemented yet; camera smoothing remains.
- `docs/` is the committed GitHub Pages build. Regenerate with `npm run build:pages` after client/shared changes; never edit hashed assets manually. Pages hosts only static files: an HTTPS Node server is required for online flight. Configure its URL using the home-screen field or build-time `VITE_SERVER_URL`.
- Development-only `window.__HORIZON_GAME__` and `window.__HORIZON_FLIGHT__` help inspect authority. They must not appear in production. Manipulating them cannot change the server state.

Checks: `npm test` runs fixed-step/server integration tests and Playwright browser tests (dedicated ports 3002/5175). `npm run build` type-checks client, server, shared code and tests. `npm run build:pages` checks and rebuilds `/project-horizon/` assets. Playwright uses system Chromium if installed, or its downloaded Chromium.

Historical survival prototype is available in Git at `cb1b76f`; it is deliberately absent from the active Step 2 sandbox. Preserve the original movement feel: normal 290 units/s, boost 440, response 7, normalized diagonals, inertial braking, 20-unit boundary margin. Do not introduce roadmap gameplay while working on networking.
