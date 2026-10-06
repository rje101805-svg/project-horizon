# Phase 2 Step 1: local prediction and reconciliation

Feature branch: `phase2/step1-prediction`. Manual acceptance is pending. This branch is not merged into `work` or deployed to Pages/Render. Use the feature branch client **and** server together; the new movement protocol is not compatible with the Phase 1 server. No combat systems are included.

## Start locally

Prerequisites: Node.js 24 (22.12+ is supported by the manifest), npm, and a desktop browser. In your existing checkout:

```sh
git fetch origin
git switch phase2/step1-prediction
npm ci
npm run server
```

Keep the server terminal running. In a second terminal in the same checkout:

```sh
npm run dev -- --port 5173 --strictPort
```

Open `http://localhost:5173` in **two separate visible browser windows**, side by side. Both must use `http://localhost:3001` in FLIGHT SERVER URL. Enter distinct display names, click Create room in one, and enter its four-character code and click Join room in the other. Do not use the live GitHub Pages URL to test this feature branch. Keep both windows visible: hidden tabs can throttle rendering. Click the game canvas before steering with keys.

WASD/arrows thrust; Shift boosts; mouse sets idle aim; R/Reset flight resets living flight; F3 toggles developer metrics; Back to home leaves the room. Health, room membership, region warnings and death countdown remain server-owned.

## Manual acceptance

Run the following with both clients in each network mode:

1. **Normal:** leave DEV ONLY fake network unchecked in both windows.
2. **150 ms:** check DEV ONLY fake network in both; uncheck ±30ms jitter in both. The delay is **150ms each direction**, about 300ms additional round trip; remote presentation adds its usual 100ms history delay. The displayed real Ping bypasses this synthetic delay.
3. **150 ms + jitter:** leave fake network checked and check ±30ms jitter in both. Delivery stays ordered.

For each mode:

- Tap and hold D/W, reverse direction, move diagonally, boost, then release. The local ship should begin moving within a fixed tick plus a rendered frame, before delayed authoritative movement arrives. Steering must stay responsive and retain the Phase 1 flight feel.
- Watch the other window's remote ship while flying in straight lines and turns. It should blend smoothly between authoritative positions, with about 100ms interpolation delay relative to received snapshots; it must never predict the other human's controls.
- Press F3. Sequence and acknowledged sequence should increase; pending inputs should remain bounded and acknowledgements should progress. Delayed clients normally retain about 10–15 inputs. Correction is the distance between the previous prediction and reset/replayed simulation. It should remain small in normal movement rather than produce recurring visible snaps or oscillation. Position/speed remain authoritative diagnostics, so their display can lag the rendered local ship.
- After releasing keys, wait for inertia to settle. The local ship should converge with authoritative position without persistent drift. Walk around the map boundaries and confirm the original clamp/speed behavior.
- Fly upward toward the black hole at X1200/Y450. Steer near its purple influence boundary, orbit/turn within the field, and check that gravitational pull feels consistent with no constant large corrections. Enter the event horizon. Both windows must show the same authoritative death; the HUD must show zero health and the respawn countdown.
- Hold a direction while dead. After roughly three server seconds, respawn must snap to a safe position with full health and the same room/name/color/socket identity. Old movement must not replay; a fresh key press should move again. Repeat a death/respawn cycle.
- While moving, press R or click Reset flight. The server's safe reset must snap immediately when its snapshot arrives, with no smoothing across the teleport or replay of pre-reset movement. Reset must remain disabled while dead.
- Toggle fake lag/jitter during movement and switch focus away from the canvas. Queued thrust should be canceled and neutralized safely. Re-enable controls with a fresh key press. No old delayed packet should revive a previous life or room.
- Leave/rejoin a room, test invalid/full room errors if desired, and disconnect/reconnect one client while the other keeps the room alive. On disconnect the local and remote visuals freeze. Reconnection creates the existing new socket identity, rejoins safely if the room survives, and discards old prediction/interpolation history. Leaving the last client still deletes the room.
- Confirm ordinary HUD health, placeholders, F3 toggling, telemetry, names/colors, copy-code/join-link actions, room isolation and the minimap remain usable.

Stop for owner manual acceptance. Do not merge, deploy, or begin Phase 2 Step 2.

## Implementation

`shared/movement.ts` runs one fixed 1/30s tick through the existing thrust/inertia/bounds/rotation physics plus black-hole gravity and swept horizon contact. Both server simulation and local prediction call this function. Predicted contact freezes local movement; only the authoritative server applies damage or chooses a respawn.

`server/inputs.ts` validates monotonic safe-integer sequences and current life/teleport generations. Its bounded eight-command queue preserves transport order. The existing server clock consumes at most one fresh command per simulation tick; receiving packets never increases the simulation rate. Expired commands are retired before fresh controls; held input retains the Phase 1 250ms expiry. A neutral release can supersede buffered controls. Snapshots carry each player's last processed/retired sequence. Health/death/respawn remain exclusively server-owned.

`src/prediction.ts` stores each fixed-tick command, immediately applies shared movement, then reconciles by resetting to authoritative state, dropping acknowledged commands, and replaying the remaining queue in sequence. Replay uses the authoritative snapshot's room-owned black-hole state. The current hole is static; future moving/growing holes require synchronized tick-specific force history before extending this model. There is no separate client physics approximation.

The pending queue caps at 90 commands; a full queue pauses new prediction until acknowledgement frees space. Disconnect/rejoin, death/respawn and explicit teleport revisions clear queues and snap without smoothing. The sequence counter never resets within a connection object. Client prediction pauses after a >250ms scheduling stall or >1s without a valid snapshot, so a suspended tab cannot send a catch-up burst.

Local rendering interpolates between fixed simulated ticks. After proper reset/replay reconciliation, corrections below 64 units may decay as a **visual-only** offset over about 80ms. Larger corrections snap. This offset never feeds physics, packets, health or the pending queue.

Remote rendering retains authoritative snapshot history, samples approximately 100ms behind the latest arrival's server-time estimate, blends position and shortest-angle rotation, and clamps to known states when delivery stalls. Life/teleport revisions purge only that player's previous history. No remote prediction/extrapolation is added.

## Automated validation

```sh
npm test -- --workers=1
npm run build
npm run build:server
```

The Node suites include deterministic gravity/contact, exact replay, monotonic sequences/acknowledgements, convergence, correction-only rendering, queue limits, stale backlog recovery, teleport clearing, real sockets, lifecycle/rooms and remote interpolation. Browser suites cover normal, 150ms and jitter response before acknowledgement, bounded corrections/queues, convergence, remote rendering, gravity and clean reset/death/respawn, alongside Phase 1 acceptance regressions.

Headless timing tests use Phaser's Canvas fallback by disabling WebGL in Chromium, avoiding software-WebGL stalls on CPU-only CI. Background throttling flags support simultaneous client checks. Manual acceptance must also cover your browser's normal WebGL path and subjective smoothness. Automated success is not public deployment or manual acceptance.

Known limits: fake lag models timing/jitter, not bandwidth limits or loss. Severe stalls intentionally freeze/catch up rather than extrapolate. In-memory rooms, ephemeral reconnect identity and existing single-process server limits are unchanged. Client/server must run this protocol version together. No prediction algorithm can know a future unsynchronized server force change.

## Verified results for this implementation

- `npm test -- --workers=1`: **60/60 Node tests and 14/14 browser tests passed**, with no failures or skips in the final full run.
- `npm run build`: passed client/server/shared/test TypeScript checking and the production Vite build. The existing Phaser bundle-size warning remains.
- `npm run build:server`: passed.
- Production bundle inspection: development window inspection handles and fake-network implementation are excluded.
- `git diff --check`: passed; `docs/`, dependency manifests/lockfile and deployment configuration are unchanged.
- Owner manual acceptance, subjective WebGL smoothness and public deployment are not claimed by these checks.
