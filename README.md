> Current milestone: **P2S8 Tractor Beam**, awaiting manual acceptance; P2S1–P2S7 are accepted. In an ACTIVE host-started round, living humans tap **E** to grab the nearest human inside a 220-unit/60° nose-facing cone. Shared predicted pull is weaker than deliberate escape thrust; attacker thrust is reduced and firing blocked. Capture at 28 units explicitly eliminates through the existing alien/winner lifecycle. Ordinary damage does not break the beam; escape, invalidation or five-second timeout does. Successful activation commits a 15-second server cooldown. LOS hook is tested; manual obstacle checks wait for Phase 3. See [PHASE2_STEP8_TEST.md](PHASE2_STEP8_TEST.md). No deployment or tracked Pages artifact rebuild; no later phases. Historical notes below are superseded by the current milestone.

# Phase 2 Step 3 — shooting/projectiles

Work is based on accepted P2S2 `1df8f3607da5d4b060a049b2fbe854267c40a2f4`. The authoritative projectile checkpoint precedes a separate visual prediction checkpoint. Manual acceptance is pending. See [PHASE2_STEP3_TEST.md](PHASE2_STEP3_TEST.md) for two-client tests and temporary DEV refill/security instructions.

Hold left mouse or Space to fire toward the mouse. F3 shows weapon state; DEV F refills ammo only when the server explicitly permits combat debug. Movement-facing aim, P2S1 prediction and P2S2 shield-first damage remain intact. No P2S4+ gameplay or unrelated ghosting/FPS changes are included. Historical milestone notes below are superseded where appropriate.

# Phase 2 Step 2 feature branch

`phase2/step2-combat-state` adds server-owned shield/ammo/reload/cooldown/status state, shield-first typed damage and centralized reset/API infrastructure. Step 1 prediction/reconciliation remains intact. Manual acceptance is pending; this branch is not deployed.

See [PHASE2_STEP2_TEST.md](PHASE2_STEP2_TEST.md) for exact local two-client instructions, server debug authorization, security checks and implementation details. Start the development server with `COMBAT_DEBUG=1 npm run server` (Bash) or `$env:COMBAT_DEBUG='1'; npm run server` (PowerShell). Run `npm run dev` separately; F3 exposes fixed self-only test actions. Without the explicit flag, the server rejects them. `NODE_ENV=production` always rejects them, even with the flag.

The historical notes below describe earlier milestones. Health/shield/ammo are now real snapshot values; there are still no weapons, projectiles, eliminations, Shield Up effects or later gameplay.

# Phase 2 Step 1 feature branch

`phase2/step1-prediction` adds fixed-tick local ship prediction and server reconciliation, with shared thrust/inertia/bounds/gravity and the existing 100ms remote interpolation. Health, death/respawn and room membership remain authoritative. No combat features are included. Manual acceptance is pending; this branch is not deployed to the live Pages URL.

Run `npm ci`, `npm run server`, and (in a second terminal) `npm run dev`. Use two visible browser windows at the printed local client address, create/join the same room, and select the local server at `http://localhost:3001`. Enable the development fake-network checkbox for **150ms each way**; toggle its separate jitter checkbox for **±30ms**. F3 shows prediction metrics. See [PHASE2_STEP1_TEST.md](PHASE2_STEP1_TEST.md) for the complete acceptance procedure and implementation details.

The Phase 1 notes below describe the accepted historical baseline. Their statements excluding local prediction and describing 100ms fake lag are superseded on this feature branch.

> **Integration status: Steps 5–7 accepted locally and integrated into `work`.** Production `/docs` is rebuilt for the Render server. After the push, wait for both deployments and verify the new footer Build ID. Deployed acceptance and Step 8 two-computer testing remain pending; Phase 1 is not yet complete.


# Project: Horizon

A multiplayer space battle royale concept for the Handshake/OpenAI challenge: **launch → explore → loot → fight → survive** in a collapsing solar system.

**Current implementation: Phase 1, Step 7 — gameplay HUD and debug overlay.** Live authoritative health bar/value, shield/weapon/ammo placeholders and F3-toggleable real metrics extend the accepted Step 6 sandbox. Death, three-second safe respawn, flight, gravity, rooms and interpolation remain unchanged. Steps 5/6/7 have passed local manual acceptance. No weapons, shields/ammo gameplay, loot, growth, landing, matchmaking, accounts or match lifecycle was added.


## Run locally

Use Node.js 22.12+ (Node 24 LTS recommended). From your project folder:

```sh
git switch work
npm ci
npm run server
```

Keep that terminal running. In a second terminal in the same folder:

```sh
npm run dev
```

Open **http://localhost:5173**, enter a display name, leave the server URL at **http://localhost:3001**, and click **Create room**. In a second tab/window, enter another name and **Join room** with the generated code. Both programs run on your computer; a cloud workspace's localhost address is not your laptop's address.

See [MANUAL_TEST.md](MANUAL_TEST.md) for one-action-at-a-time Windows instructions and the full two-client acceptance test, including fake lag and disconnects.

Controls: WASD/arrows for thrust, Shift boost, mouse aim while idle, F3 for debug, R for gameplay reload, DEV F4/Reset flight for the retained debug flight reset (requires COMBAT_DEBUG=1 and a non-production server), Back to home to leave. This living debug reset never heals or triggers respawn and is rejected while dead. Black-hole deaths now respawn automatically without refreshing or changing identity. Planets remain non-colliding landmarks, and ship colors are server-assigned for multiplayer. Normal speed (290), boost (440), inertia, camera, stars, map bounds and minimap preserve Step 2's flight feel.

## HUD and debug

Health is read from the local player's authoritative snapshots and defensively clamped only for display using shared MAX_HEALTH. Shield/weapon/ammo slots show **—** until future systems exist. Press **F3** to show/hide debug; it starts hidden and ignores key-repeat. Existing position/speed/tick details and real ping are inside the panel.

Ping reuses Step 4's measured RTT. FPS counts actual Phaser frame updates over elapsed monotonic time; receive rate counts valid current-room snapshot arrivals before DEV fake-lag delay. One-second samples smooth both. Room counts use the existing reliable roster, and configured server Hz comes from shared TICK_RATE. These measurements add no network traffic or timers and never drive simulation. Disconnected values show em dashes; background tabs may have lower FPS. HUD/debug updates avoid rewriting unchanged DOM values.

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

Phaser still gives a bundle-size warning; builds succeed. Production type-checking includes shared/server/tests. The Pages base-path build is compatible with `/project-horizon/` and query parameters, and **the committed `docs/` contains the integrated Steps 5–7 production client**, configured for `https://project-horizon-server.onrender.com` by `.env.production`. `npm run build:pages` now requires the actual HTTPS server URL; rebuild and commit `docs/` on `work` only when a production release is authorized. Confirm the footer build ID matches `docs/build.json`. Pages hosts only static files, not the Node server.

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
- `src/main.ts`: reused Phaser scene plus room UI, multi-ship rendering and HUD hooks.
- `src/hud.ts`: health presentation and lightweight real debug metrics.
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

Step 4 deployment preparation is documented in DEPLOY.md; Step 5 manual acceptance is documented in STEP5_TEST.md; Step 6 manual instructions are in STEP6_TEST.md; Step 7 manual instructions are in STEP7_TEST.md; Step 8 and later systems remain unimplemented.

## Public integrated client

Client: https://rje101805-svg.github.io/project-horizon/
Server: https://project-horizon-server.onrender.com
Health: https://project-horizon-server.onrender.com/health

Wait for GitHub Pages and Render to deploy the integration commit before testing. The footer shows the client Build ID (also in `/project-horizon/build.json`). Production fake lag/jitter is compiled out. Initial connection retries accommodate Render cold starts; Cancel connection stops the pending attempt. See DEPLOY.md for deployment details. The owner reports the previous Step 4 Pages build `client-aae0fb5389ef` successfully deployed after resetting the source; the old queued job is left untouched. First verify the new deployment and Build ID, then perform Step 8 manually with two computers on different networks. No Step 8 or Phase 2 implementation is included.
