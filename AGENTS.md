# Project Horizon architecture

Current scope: Phase 1, Step 6 — server-authoritative health/death/automatic respawn on `step-6-health-respawn`, directly based on accepted Step 5 `6db0ae704680afa46d029b9691e5a12ba97c3560`. Steps 5 and 6 are locally accepted. The owner reported Step 6 manual acceptance passed on October 5, 2026; see `STEP6_TEST.md`. Step 4 public acceptance remains pending. Do not begin Step 7/final HUD, combat, weapons, shields, ammo, loot, planetary physics, accounts, matchmaking or match lifecycle.

Protect production and baseline: leave `work` at `9f0c821` and `step-5-black-hole` at `6db0ae7`. Do not merge, deploy, rebuild or commit `docs/`, reconfigure Render/Pages, or cancel/retrigger the queued Step 4 Pages job. Normal `npm run build` writes `dist/`. Commit/push only `step-6-health-respawn`. The owner confirmed Render work-only Auto-Deploy On Commit, PR Previews Off; Pages work → /docs only. This confirmation authorizes the isolated Step 6 branch push, not deployment.

## Step 6 lifecycle

- `shared/lifecycle.ts` owns MAX_HEALTH 100, RESPAWN_DELAY_MS 3000, health clamping and replicated lifecycle fields. `active` means alive; death remains separate from membership.
- `server/health.ts` is the sole damage path: `applyDamage(player, amount, source, simulationTimeMs)`. No client health/damage/respawn event exists. It rejects invalid damage, clamps health, transitions once, zeros physics/input, records source/sequence and sets a room-player-owned deadline. Black hole is the only damage source.
- `server/simulation.ts` uses explicit simulation time for death/respawn. `server/game.ts` passes tick × TICK_MS while retaining monotonic real-time input freshness. Respawn is evaluated by the existing 30Hz loop, never a per-player timer. Server-only `{ autoTick: false }` / `step()` lets tests advance the SAME loop without wall-time sleeps; no browser/public clock control exists.
- Successful respawn preserves socket identity/name/color/room, restores full health, chooses a safe spawn from the CURRENT room black-hole state, resets velocity/input/rotation, clears the deadline, increments `lifeGeneration` and skips movement integration on that tick. No safe spawn means remain dead and retry, never revive unsafely.
- Replicated `respawnRemainingMs` avoids wall-clock skew; client display cannot decide respawn. `deathSequence` increments once per death; full snapshots carry source, health and life state. No repeated death-event stream.
- Inputs/reset carry their life generation; server validates current living generation. Old-life packets cannot move/reset a respawned ship. The retained living flight reset never heals/respawns. Client lifecycle changes clear delayed inputs/snapshots, held keys and neutralize input.
- Remote interpolation purges only a respawned player's old-generation records, snaps to the new state, then resumes ordinary interpolation. Generation changes handle even lost death snapshots. Local ship/camera snaps on respawn. Disconnect removes deadline ownership; stale references cannot revive removed membership.
- Death overlay and temporary health/life text are Step 6 test aids. Preserve existing ping/telemetry; do not create the final Step 7 health bar, shield/weapon/ammo slots or debug overlay. See `STEP6_TEST.md` for manual acceptance.


## Step 5 black hole

- `shared/black-hole.ts` centralizes fixed initial radii/position, gravity cap/strength, spawn clearance, region classification and swept horizon checks. Each `GameRoom` owns a fresh black-hole state; `RoomInfo` acknowledgments and every `Snapshot` contain its complete current state. No growth clock or match lifecycle yet.
- `server/simulation.ts` is called once per player by the existing 30Hz loop. It passes gravity acceleration into `stepFlight`; the browser never runs it. Gravity is zero outside influence, capped inverse-square inside, and finite at center. Existing response/speeds/inertia are unchanged in safe space.
- Spawn/reset selection excludes influence radius plus clearance and preserves separation. All joins/reconnects use it; fail cleanly if no safe candidate exists.
- Event-horizon death preserves the accepted swept inclusive segment-circle check, including tangent and exterior-to-exterior crossings. Step 6 routes contact through common damage and replaces permanent LOST with frozen DEAD followed by authoritative respawn.
- Reconnect creates a new socket identity and a safe active ship if the room survives. Death is not retained across identities; if the last socket leaves, room deletion/reconnect failure remains unchanged. No persistent session claims.
- Remote death immediately uses the newest authoritative position/status instead of interpolating back through alive states. Other remote flight retains interpolation. Client region warnings use the server's classification, never client-derived gameplay decisions.


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

Step 4 deployment documentation is retained for the production baseline; it does not authorize deploying Step 5 or Step 6. Render account/repository/service/billing actions require the owner; pause at those external actions. Do not invent a URL or claim public acceptance from local tests.

Render deploys from the repository ROOT (`server/` imports `shared/`). `PORT` and `0.0.0.0` binding are already supported. `tsx` is a runtime dependency; `npm run server`/`npm start` run the same authoritative process. See `DEPLOY.md` for commands that also work on the existing pushed Step 3 code while obtaining the real service URL before the final Step 4 commit.

`src/config.ts` centralizes endpoint validation: production defaults never fall back to localhost; public endpoints require HTTPS. `vite.config.ts` emits a content-based visible build ID plus `build.json`; HEAD at build time is metadata, not the final commit of generated output. `scripts/build-pages.mjs` requires an explicit real server URL before changing `docs/`. Keep Pages source `work` → `/docs`, rebuild and commit it only after the actual URL is supplied and verified.

Cold starts use one Socket.io manager with bounded initial waiting, automatic backoff and cancel handling. Never create duplicate connections/room requests during retry. `latencyProbe` is an acknowledgment-only real RTT sample, bypassing debug delay; it does not alter simulation. Retain Step 3 room/isolation/interpolation behavior and the DEV-only fake-lag boundary. No prediction or reconciliation.
