> **Branch status: Step 6 fully accepted locally.** Based on accepted Step 5 `6db0ae7`. Production `work` remains at Step 4 `9f0c821`, `/docs` is untouched, and this branch is not deployed. The reported queued Pages job/public old Step 2 build is a separate issue. See [STEP6_TEST.md](STEP6_TEST.md) for one-action-at-a-time local testing.


# Project: Horizon

A multiplayer space battle royale concept for the Handshake/OpenAI challenge: **launch → explore → loot → fight → survive** in a collapsing solar system.

**Current implementation: Phase 1, Step 6 — health, death and automatic respawn.** The accepted black-hole flight sandbox now has server-owned health (100), one damage path, a three-second tick-owned respawn delay, clear death presentation and safe same-identity respawn. Fixed black-hole radii, gravity, swept horizon detection, rooms and normal interpolation are preserved. Steps 5 and 6 are accepted locally. The owner reported Step 6 manual acceptance passed with no gameplay issues observed; the acceptance record is in STEP6_TEST.md. No combat, weapons, shields, loot, final health HUD, landing, matchmaking, accounts or match lifecycle was added.


## Run locally

Use Node.js 22.12+ (Node 24 LTS recommended). From your project folder:

```sh
git switch step-6-health-respawn
npm ci
npm run server
```

Keep that terminal running. In a second terminal in the same folder:

```sh
npm run dev
```

Open **http://localhost:5173**, enter a display name, leave the server URL at **http://localhost:3001**, and click **Create room**. In a second tab/window, enter another name and **Join room** with the generated code. Both programs run on your computer; a cloud workspace's localhost address is not your laptop's address.

See [MANUAL_TEST.md](MANUAL_TEST.md) for one-action-at-a-time Windows instructions and the full two-client acceptance test, including fake lag and disconnects.

Controls: WASD/arrows for thrust, Shift boost, mouse aim while idle, R/Reset flight for the retained Step 2 debug flight reset, Back to home to leave. This living debug reset never heals or triggers respawn and is rejected while dead. Black-hole deaths now respawn automatically without refreshing or changing identity. Planets remain non-colliding landmarks, and ship colors are server-assigned for multiplayer. Normal speed (290), boost (440), inertia, camera, stars, map bounds and minimap preserve Step 2's flight feel.

## Health, death and respawn

`server/health.ts` exposes the server-only `applyDamage` entry point. Event-horizon contact sets health to zero exactly once, freezes the ship and starts a private simulation-time deadline. The existing 30Hz loop restores full health and selects a safe position from the black hole's current room state after 3000ms of simulation time. No detached per-player timers exist; disconnect removes the deadline with its player. The client displays server-provided remaining milliseconds, avoiding wall-clock skew, and never initiates respawn.

Every respawn increments a life generation. Old-generation inputs/reset are rejected; client pending inputs/held keys are cleared. Remote interpolation discards only that player's previous-life samples so the teleport snaps, then ordinary smoothing resumes. If no safe position exists, remain dead and retry each tick. Reconnect continues to use a new nonpersistent identity, separately from same-identity automatic respawn.

## Rooms and identity

- Codes are four uppercase characters drawn from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no I/O/0/1). Joins trim/normalize lowercase. Server generation retries occupied codes up to 64 times, then gives a clean error instead of overwriting a room.
- Cap: **8 players**, shared in `shared/rooms.ts`. Eight distinct predefined colors are allocated within a room, released on departure. Increasing the cap also requires expanding the palette.
- Names have controls removed, whitespace trimmed, and at most 16 Unicode code points; empty/invalid names become `Pilot`. They are rendered as plain text, never HTML. The browser field also limits typed names.
- Each socket has a unique server-side socket ID. The server owns name/color, room membership, input, position, velocity and rotation. No persistent identity or authentication.
- Spawn selection searches a deterministic grid near the previous start, within map bounds, keeping at least 180 units from existing ships and outside black-hole influence plus 80 units clearance. The first player starts at X1370/Y1200. Clients cannot choose spawn coordinates.
- One socket belongs to at most one gameplay room. Leave before changing rooms. Snapshots/membership broadcasts target only `flight:<room code>`; sockets outside rooms receive no gameplay snapshots.
- Leaving, closing a tab or losing the connection removes membership and releases resources. Last departure deletes the room. A network outage is detected by Socket.io heartbeat timeout; it is not always instantaneous.
- Reconnect uses a new socket identity and tries to rejoin the old room if it still exists. If nobody kept it alive, or the server restarted, return home with a clear error and create/join again. Rooms/sessions are deliberately not persistent.

## Simulation and rendering

The existing Node.js + Socket.io monotonic accumulator still runs **30 fixed simulation ticks/s**, using exactly 1/30 second per step. Catch-up remains bounded to five steps under a stall. The server applies each player's latest valid keys/aim and expires stale inputs after 250ms, braking with the original inertia. Messages cannot advance simulation or supply position/velocity/speed/identity/room state. The server publishes room-scoped volatile snapshots every tick and reliable membership updates when players join/leave.

**Local ship: copied directly from the newest accepted authoritative snapshot. No client-side prediction or reconciliation was added.** Camera smoothing remains visual only. Without snapshots the local position freezes; there is no offline movement fallback.

**Remote ships only: buffered interpolation.** `src/interpolation.ts` retains at most 32 ordered snapshots. Snapshots carry simulation time (`tick × 1000/30`). At each render, estimate server time from the latest snapshot plus elapsed local monotonic time, then render **100ms (three ticks) behind**. Select the two surrounding frames and linearly blend x/y; rotate along the shortest angular arc. Clamp render time to available state and never move it backward.

Late/duplicate/out-of-order ticks are discarded. If snapshots pause, remote visuals may finish blending up to the newest known position, then **freeze there**; they never extrapolate indefinitely. Small gaps blend over the available surrounding frames; long outages can produce a catch-up jump rather than guessing future flight. Reliable roster removal immediately deletes a ship and clears its buffered entries. Delayed old snapshots cannot resurrect departed ships. On transport disconnect, freeze the remaining visuals and clear interpolation history.

## Development fake network

Run `npm run dev`. After entering a room, check **DEV ONLY: fake network · 100ms each way ±30ms jitter** above the HUD. Enable it in both clients for a symmetric test; uncheck in both to disable. It is off by default (reload resets it), and toggling cancels queued work.

`src/debug-lag.ts` delays outgoing **input delivery** and incoming **snapshot handling**, by approximately 100ms ±30ms in each direction. That adds about 200ms round trip; remote rendering then adds its 100ms interpolation buffer. Ordered deadlines prevent jitter from reordering older inputs. Room requests/reliable membership are undelayed. Focus release/neutral input bypasses the delay and clears pending work, avoiding stuck thrust. Disconnect/leave cancels queued packets, guarded again by a connection/membership epoch.

This does not change server physics, tick rate, or authority. It simulates timing only, not bandwidth/loss. Production builds remove the fake-lag implementation and have no active checkbox or inspection handles. Local response will feel delayed with fake lag because prediction was intentionally excluded.

## Share links

**Copy code** copies the code. **Copy join link** copies the current client URL with `?room=ABCD`. The link preserves the existing path, including `/project-horizon/` on Pages. Valid codes are normalized/prefilled only; the user still confirms their name and clicks **Join room**. Invalid query values are ignored. Clipboard failures show text for manual copying.

Links do not include a server URL. A localhost link works only on the computer running these programs. Connecting from another device or deploying the server is outside Step 3.

## Tests and builds

```sh
npm test             # All logic, real-socket server integration, and browser tests
npm run build        # TypeScript checks for client/server/shared/tests + dist/
npm run preview      # Local production preview on localhost:4173; server still needed
npm run server:dev   # Optional server restart-on-edit mode
```

If needed, run `npx playwright install chromium` before tests. They use system Chromium when available. Browser tests manage client/server on dedicated ports 5175/3002; integration tests use ephemeral ports. Tests cover code format/collisions, sanitation, capacities, spawns/colors, room isolation, independent movement, forged state rejection, tick cadence, stale inputs, resets, cleanup, join links, interpolation, fake lag and browser behavior. Automated success does not replace the manual feel/acceptance test.

Phaser still gives a bundle-size warning; builds succeed. Production type-checking includes shared/server/tests. The Pages base-path build is compatible with `/project-horizon/` and query parameters, but **the committed `docs/` is now the Step 4 production client**, configured for `https://project-horizon-server.onrender.com` by `.env.production`. `npm run build:pages` now requires the actual HTTPS server URL; do not rebuild or commit `docs/` on this branch. Confirm the footer build ID matches `docs/build.json`. Pages hosts only static files, not the Node server.

## Files and configuration

- `shared/flight.ts`: original flight values/validation, with optional server-owned acceleration.
- `shared/black-hole.ts`: state/constants, gravity, region and swept horizon helpers.
- `server/simulation.ts`: per-player gravity, swept damage and tick-owned safe respawn.
- `server/health.ts`, `shared/lifecycle.ts`: common damage, health and respawn state/constants.
- `shared/rooms.ts`, `shared/protocol.ts`: room configuration, sanitization and typed events.
- `server/rooms.ts`: room/membership/color/spawn allocation.
- `server/game.ts`: existing fixed loop, now room-scoped.
- `server/index.ts`: existing startup/shutdown.
- `src/network.ts`: input/snapshot transport, room acknowledgments, reconnect and cleanup.
- `src/main.ts`: reused Phaser scene plus room UI and multi-ship rendering.
- `src/interpolation.ts`, `src/debug-lag.ts`, `src/room-links.ts`: visual interpolation, development timing simulation, and share links.
- `tests/`: Node logic/server tests and Playwright browser tests.
- `AGENTS.md`: architecture/scope rules; `MANUAL_TEST.md`: Windows acceptance instructions.

`PORT` defaults to 3001. `CLIENT_ORIGINS` accepts comma-separated exact client origins (no paths/trailing slash); defaults cover localhost/127.0.0.1 on 5173/4173 and the previous Pages origin. `VITE_SERVER_URL` optionally provides the client's build-time default; the UI can override it. The server runs TypeScript via `tsx`, so install with `npm ci` including development dependencies. No API keys/database are needed. `/health` reports tick rate/count and room/player counts without exposing room codes/player state.

## Remaining public acceptance checks

- Step 3 local manual testing passed; two-computer real-network acceptance is still pending. Background/hidden tabs can throttle Phaser rendering; use visible windows to assess remote interpolation.
- Local movement has real latency by design. Real-network testing must decide whether prediction/reconciliation is necessary; it was not added here.
- Rooms/identities are in memory. Empty rooms and all rooms on server restart disappear; rejoin can fail cleanly.
- This single-process development server has validation/origin checks, but no authentication, per-client rate limiting, global room cap, persistence, or load testing. Room codes are convenient join codes, not a security boundary.
- Socket.io's in-memory adapter makes membership operations synchronous. A later distributed/async adapter needs transaction/ack ordering changes before scale-out.
- Interpolation chooses safe freezing/catch-up over extrapolation on larger stalls. The fake-lag tool does not emulate every real-network failure.
- Existing debug flight reset was retained for Step 2 compatibility and should be reconsidered before actual match rules.

Step 4 deployment preparation is documented in DEPLOY.md; Step 5 manual acceptance is documented in STEP5_TEST.md; Step 6 manual instructions are in STEP6_TEST.md; Step 7 and later systems remain unimplemented.

## Public Step 4 client

Client: https://rje101805-svg.github.io/project-horizon/
Server: https://project-horizon-server.onrender.com
Health: https://project-horizon-server.onrender.com/health

Wait for GitHub Pages and Render to deploy the Step 4 commit before testing. The footer shows the client build ID and the HUD shows actual Socket.io RTT. Production fake lag/jitter is compiled out. Initial connection retries accommodate Render cold starts; Cancel connection stops the pending attempt. The owner confirmed Render health; this workspace's proxy blocks that host, so it could not verify the live server independently. See DEPLOY.md for the remaining two-network acceptance test. Do not deploy this Step 6 branch or begin Step 7.
