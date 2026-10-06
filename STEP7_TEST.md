# Step 7 — gameplay HUD and debug overlay

Status: implementation complete; **local manual acceptance passed (owner-confirmed)**. Branch `step-7-hud-debug` is based directly on accepted Step 6 `f7890cfb23c88c7f70673043103e83456df30fb5`. Step 5 and Step 6 acceptance records remain historical records for their respective branches.

The accepted branch remains at `735d6b303441dce058b53c347f92ec4238dcfc8f`. The subsequent Phase 1 integration request authorizes fast-forwarding `work`, rebuilding `/docs` and pushing `work`; the branch-isolation instructions below document the original Step 7 task, not the integration authorization. The previous Step 4 Pages deployment now succeeded; do not interact with the old queued job.

Owner-confirmed manual results: authoritative 100/100 health, em-dash placeholders, F3 toggling, real RTT/FPS, player count 1 → 2 → 1, 30 Hz target and approximately 30/s receive rate, smooth two-client flight, black-hole death/0 health/death presentation, approximately three-second safe full-health respawn, correct remote lifecycle, continued telemetry after respawn and disconnect cleanup. No obvious runtime regressions were observed. Steps 5–7 are locally accepted; public deployment and cross-network acceptance remain pending.

## Start locally — one action at a time

1. Open a terminal in your downloaded `project-horizon` folder.
2. Run `git fetch origin`.
3. Run `git switch step-7-hud-debug` (or `git switch --track origin/step-7-hud-debug` if the local branch does not exist).
4. Run `git pull --ff-only`.
5. Run `npm ci` (Node 24 recommended).
6. Run `npm run server` and leave the terminal running.
7. Open a second terminal in the same folder and run `npm run dev`.
8. Open `http://localhost:5173` and confirm the server field is `http://localhost:3001`. Use the local matching client/server, not public Pages/Render.

## Focused manual acceptance — one action at a time

1. Enter `Pilot A` and click **Create room**. Confirm health **100 / 100**, a full bar, and **SHIELD —**, **WEAPON —**, **AMMO —**. These are placeholders, with no equipped items or gameplay values.
2. Press **F3**. Confirm debug appears with real ping, numeric FPS, **Players: 1**, and **Server: 30 Hz (recv approximately 30/s)** after the first one-second measurement. Values can fluctuate; FPS is not guaranteed to be 60.
3. Hold a movement key and press F3 once to hide/show debug. Flight should continue. Holding F3 should not rapidly toggle; R/reset should still work for a living ship.
4. Open another visible window, enter `Pilot B`, and join A's code. Confirm the debug player count becomes **2**. Keep both windows visible: background tabs may report lower FPS because browsers throttle rendering.
5. Fly both ships. Confirm normal movement and remote interpolation remain smooth. Debug position/speed/tick details are available when F3 is on.
6. Fly B into black-hole X 1200 / Y 450, steering toward the inner ring. Confirm B's HUD reaches **0 / 100**, its bar empties, and the accepted death/respawn overlay appears. A should see B's faded DEAD ship.
7. Leave B connected through its three-second server-owned countdown. Confirm automatic safe respawn, **100 / 100**, and full bar; A should see the accepted snap rather than a cross-map streak.
8. Fly B again. Confirm debug stays in its chosen visibility state and continues displaying ping, FPS, Players: 2, target Hz and measured receive rate after death/respawn.
9. Close B's window. Confirm A eventually shows **Players: 1**. Optionally create a separate room to confirm its players are not counted in A's room.
10. Check server/Vite terminals and the browser console for unexpected errors. Stop both terminals with Ctrl+C when finished and report acceptance. Do not merge, deploy or begin Step 8.

## Sources and measurement

- **Health:** `src/main.ts` passes the local player from each accepted authoritative snapshot to `GameplayHud.health`. `src/hud.ts` clamps only presentation to the existing shared `MAX_HEALTH`; it never writes back to player state, applies damage, heals or respawns. The shared maximum also sets the native progress bar's maximum. Before a first snapshot the value is unavailable rather than a fake full-health value.
- **Placeholders:** shield/weapon/ammo are static em-dash labels. No Phase 2 system, values or inventory model was added.
- **Ping:** the existing Step 4 Socket.io acknowledgment RTT callback updates the debug ping. No additional probes/messages were added to the application. DEV fake-network delay does not delay this RTT path.
- **FPS:** actual Phaser scene-frame updates are counted over elapsed `performance.now()` time. One-second samples smooth the number. It reflects client frame performance, including browser throttling; no fixed 60, extra animation loop, timer or monitoring dependency exists.
- **Players:** the existing reliable `RoomInfo.playerIds.length` drives the count, including living/dead local membership. Join/disconnect updates remain room-scoped; no second room model exists.
- **Server target:** `TICK_RATE` is imported from the existing `shared/flight.ts` used by the server. The server tick number remains a separate debug detail, not a rate measurement.
- **Receive rate:** an optional client-local observation callback counts actual valid current-room snapshot arrivals, with monotonic tick/identity guards, BEFORE the DEV fake-lag queue. `SampleRate` divides the counted packets by actual elapsed time over one-second intervals. It does not infer delivery from tick differences, frame callbacks or the configured target, and generates no traffic. Lower delivery can read 18/s while the target remains 30 Hz; no arrivals produce 0/s once sampled while still connected.
- **Unavailable/reconnect:** disconnected ping/count/receive values show em dashes. Last authoritative health is labeled as last known; a new snapshot restores the live presentation. Receive counters reset on connection changes instead of leaking across memberships.
- **Toggle/layout:** F3 is discoverable in the controls, defaults hidden on entry and ignores repeat keydowns. It does not alter flight input or lifecycle state. On wider screens HUD/debug sit over the canvas without capturing pointer input; on narrow screens they flow above/below it to avoid overlap. Health remains visible during the death overlay. DOM values are written only when changed; metrics refresh at most four times/second and rates sample once/second.

**Protocol changes: none.** `ConnectionCallbacks.snapshotReceived` and its monotonic observation marker are client-local instrumentation only. Socket.io events/payloads, shared gameplay state, server code, damage/health/respawn, physics, interpolation, input generation and DEV-only fake-lag guards are unchanged.

## Verification and existing test adjustments

Focused unit tests use controlled event counts and times for FPS/receive rate and sanitize health presentation. Browser checks cover authoritative full/current/zero/respawn health, placeholders, F3/repeat/flight/reset, the actual existing RTT callback, positive measured receive rate, roster isolation/disconnect, narrow layouts, and debug visibility through repeated death/respawn. They do not assume exact real-world FPS or sleep through respawn deadlines.

The existing controlled-time Step 6 browser test gained HUD/debug assertions and a server-only partial-damage fixture through the existing `applyDamage` API; its original lifecycle assertions remain. It advances one extra tick beyond the deadline for the presentation check, avoiding floating-point boundary sensitivity; exact timing boundaries remain tested by the existing deterministic unit tests. The Step 4 ping-visibility test now presses F3 because existing telemetry moved into the default-hidden debug panel. No gameplay assertions were removed.

Verification commands: `npm test`, `npm run build:server`, `npm run build` (outputs `dist/`), and `npx vite build --base=/project-horizon/ --outDir=/tmp/horizon-step7-pages` for Pages-path compatibility. **Do not run `npm run build:pages` or modify `/docs`.** The existing Phaser bundle-size warning remains.

Final result: **59 tests passed** (49 Node logic/real-socket tests and 10 Playwright browser tests). Full/server TypeScript checks, client build to `dist/`, and Pages-path compatibility build to `/tmp/horizon-step7-pages` passed. Referenced production assets were checked for correct base paths and absence of DEV inspection handles/fake-lag implementation. Server/shared gameplay and dependency files have no changes from accepted Step 6. `/docs` and all protected local/remote branch heads remain unchanged. No deployment/configuration/queued-job action was performed. Manual acceptance subsequently passed as recorded above.

## Branch and deployment guard

Before committing/pushing, verify `/docs` equals Step 4 and these protected local/remote branch heads remain unchanged:

- `work`: `9f0c8216dd434a8c78b5cb1e1f15f083207a127e`
- `step-5-black-hole`: `6db0ae704680afa46d029b9691e5a12ba97c3560`
- `step-6-health-respawn`: `f7890cfb23c88c7f70673043103e83456df30fb5`

The owner's confirmed settings remain Render **work only**, Auto-Deploy On Commit, PR Previews Off; GitHub Pages **work → /docs only**. No deployment workflow, configuration change, PR, merge or manual deployment is added. Push only `step-7-hud-debug`; under those settings it cannot change production. Leave the queued Pages job untouched. Step 8 and all new gameplay systems are out of scope.
