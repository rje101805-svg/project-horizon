# Project Horizon architecture

Current scope: Phase 1, Step 4 — deploy the accepted rooms/flight build early. Do not implement Step 5 or add combat, health, death/respawn, loot, black holes, planetary physics, accounts or matchmaking unless explicitly requested. The previous Step 2 reset is retained only as an explicit flight-sandbox/debug control, not a death/respawn system.

## Authority and rooms

- `shared/flight.ts` is the source of truth for fixed-step flight. Preserve normal speed 290 units/s, boost 440, response 7, normalized diagonals, inertia and the 20-unit map margin. Only the server calls `stepFlight`.
- `shared/rooms.ts` owns the 8-player cap, color palette, 4-character unambiguous code alphabet, 180-unit spawn separation, name sanitization, and code normalization.
- `shared/protocol.ts` types all events. Inputs contain keys/aim, never client positions, velocities, speeds, timesteps, IDs or room membership. Snapshots include server tick, simulation time, room code, identities and flight state.
- `server/rooms.ts` manages authoritative membership, server-generated codes, color allocation, names and safe spawns. Each connected socket uses its server-owned socket ID. One socket can belong to at most one gameplay room; it must leave before switching. Code collisions retry up to 64 times, then return a clean error. Empty rooms are deleted immediately.
- `server/game.ts` preserves Step 2's monotonic 30Hz fixed-step accumulator and 250ms stale-input braking. The loop iterates room-owned players and broadcasts only to `flight:<code>`. Unjoined sockets receive no gameplay state. Membership changes are reliable `roomState` events; per-tick snapshots are volatile. Input messages never advance simulation. Leave/disconnect removes membership/resources.
- `server/index.ts` configures `PORT` and exact comma-separated `CLIENT_ORIGINS`. Origin checks cover polling and WebSocket upgrades, but are not authentication. Use the single-process in-memory adapter in this milestone; async/distributed adapters require revisiting membership transaction ordering.

## Client rendering and lifecycle

- `src/network.ts` handles room request acknowledgments/timeouts, inputs, snapshots and cleanup. Reconnect tries to rejoin the existing room with a NEW socket identity; if the room no longer exists, return home with a clear message. No persistent sessions or automatic room recreation. Late callbacks/packets are guarded by a connection/membership epoch and monotonic snapshot ticks.
- `src/main.ts` reuses the existing Phaser scene/scenery/camera. Own-ship position and rotation are copied directly from the newest accepted server snapshot. Do not add local prediction, reconciliation, offline movement fallback or local flight integration.
- `src/interpolation.ts` buffers at most 32 snapshots and interpolates REMOTE ships only, 100ms behind estimated server simulation time. Blend positions and the shortest rotation arc. Clamp to available frames, discard older/duplicate ticks, and never rewind render time or extrapolate past the newest state. Reliable roster updates remove ships immediately and delayed snapshots cannot resurrect them.
- `src/debug-lag.ts` is instantiated only under `import.meta.env.DEV`; production removes the fake-lag implementation. The development checkbox is off by default. It delays client inputs AND snapshot handling by approximately 100ms ±30ms EACH WAY, with ordered deadlines. Membership/room requests are undelayed. Toggling, disconnecting, leaving or focus release cancels queued work; neutral input/focus release bypasses lag for safety. Physics and tick rate are unchanged.
- `src/room-links.ts` parses/normalizes `?room=ABCD` and creates share links preserving the current path. Prefill only; never auto-connect before name confirmation. Do not encode a private/local server URL into shared links.
- Names are plain text (Phaser Text or DOM textContent), never innerHTML. Multiplayer ship colors come from the server; no client color/identity claim is trusted.
- Development-only `window.__HORIZON_GAME__` and `window.__HORIZON_FLIGHT__` are inspection handles, not authority. They and fake-lag logic must be absent from production.

## Checks and publishing

`npm test` runs Node logic/real-socket integration tests and Playwright browser tests on dedicated ports 3002/5175. `npm run build` checks client/server/shared/tests and builds `dist/`. System Chromium is used when installed; otherwise install Playwright Chromium.

Step 4 authorizes publishing the client/server once the actual Render URL and dashboard setup are resolved. Render account/repository/service/billing actions require the owner; pause at those external actions. Do not invent a URL or claim public acceptance from local tests.

Render deploys from the repository ROOT (`server/` imports `shared/`). `PORT` and `0.0.0.0` binding are already supported. `tsx` is a runtime dependency; `npm run server`/`npm start` run the same authoritative process. See `DEPLOY.md` for commands that also work on the existing pushed Step 3 code while obtaining the real service URL before the final Step 4 commit.

`src/config.ts` centralizes endpoint validation: production defaults never fall back to localhost; public endpoints require HTTPS. `vite.config.ts` emits a content-based visible build ID plus `build.json`; HEAD at build time is metadata, not the final commit of generated output. `scripts/build-pages.mjs` requires an explicit real server URL before changing `docs/`. Keep Pages source `work` → `/docs`, rebuild and commit it only after the actual URL is supplied and verified.

Cold starts use one Socket.io manager with bounded initial waiting, automatic backoff and cancel handling. Never create duplicate connections/room requests during retry. `latencyProbe` is an acknowledgment-only real RTT sample, bypassing debug delay; it does not alter simulation. Retain Step 3 room/isolation/interpolation behavior and the DEV-only fake-lag boundary. No prediction or reconciliation.
