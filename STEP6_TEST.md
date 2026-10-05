# Step 6 — health, death and automatic respawn

Status: implementation and automated verification; **manual acceptance pending**. This branch is `step-6-health-respawn`, based directly on accepted Step 5 `6db0ae704680afa46d029b9691e5a12ba97c3560`. Step 5's acceptance record remains in `STEP5_TEST.md` for that historical branch.

Production is unchanged: `work` remains at `9f0c821`, `/docs` contains Step 4, and neither Step 5 nor Step 6 is deployed. The owner reports the public Pages site still serves Step 2 while the Step 4 Pages job is queued. Do not reconfigure, cancel/retrigger or otherwise fix that deployment here. Step 4 public acceptance remains separately pending.

## Start locally — one action at a time

These steps run the matching Step 6 client and server on your own computer. Keep both terminals running while testing.

1. Open a terminal in your downloaded `project-horizon` folder.
2. Run `git fetch origin`.
3. Run `git switch step-6-health-respawn`. If Git reports the branch is unknown, run `git switch --track origin/step-6-health-respawn` instead.
4. Run `git pull --ff-only`.
5. Run `npm ci` (Node 24 recommended; minimum Node 22.12).
6. Run `npm run server`. It should report listening on port 3001 at 30 ticks/s.
7. Open a second terminal in the same folder.
8. Run `npm run dev`.
9. Open `http://localhost:5173` in your browser. Localhost only works on the computer running these processes.
10. Confirm the server field says `http://localhost:3001`. Do not use the production Render server: it runs the older Step 4 protocol.

## Manual acceptance — one action at a time

1. Enter the display name `Pilot A` and click **Create room**.
2. Confirm A shows **Alive · health 100 / 100** and **Safe space**.
3. Note the room code.
4. Open a second visible browser window at `http://localhost:5173`.
5. Enter `Pilot B`, the same code and the local server URL; click **Join room**.
6. Confirm B is alive at health 100 and safe; confirm both show the same black hole and two players.
7. Fly A using WASD/arrows and Shift boost; confirm B sees ordinary smooth motion.
8. Fly B normally and confirm A sees it move. Reset flight [R] remains a living sandbox control, not a heal or respawn button.
9. In B, fly toward black-hole X 1200 / Y 450 (use the position text/minimap). Steer toward its center: a timed turn can leave sideways inertia and miss the inner ring.
10. Confirm the danger warning appears inside influence and gravity strengthens toward the center, as accepted in Step 5.
11. Cross the event horizon; confirm B's health reaches zero and state becomes **Dead**.
12. Confirm B sees **Lost to the black hole**, zero health, and **Respawning in 3.0s** counting down from server snapshots.
13. In A, observe B's faded ship labeled **DEAD**. It remains in the room during the delay.
14. In B, try movement and R while dead. Its position must remain frozen; reset is disabled. A must see no dead-ship movement.
15. Wait for the automatic respawn, approximately three server simulation seconds after death. The UI disappears only when the server reports B alive, not when the display rounds to zero.
16. Confirm B is alive at health 100, with zero initial velocity and **Safe space**. It should appear outside current influence plus clearance, not near the horizon.
17. Confirm B stayed in the same room, without refreshing, reconnecting or entering its name again; the player count remains two and its name/color stay the same.
18. In A, confirm B reappears directly at the safe spawn instead of moving across the map from its death point. Normal interpolation resumes once it flies.
19. Release any movement keys held during death, then press them again. Confirm B can fly normally after respawn; old held keys do not automatically thrust in the new life.
20. Repeat B's trip into the black hole and verify a second automatic death/respawn cycle works with full health and a safe spawn.
21. During a later death countdown, open a third window and join the same room as `Pilot C`. Confirm C starts alive/full/safe and sees B's current death state, then sees its respawn.
22. Kill B once more; while it is dead, close B's window. Confirm A/C see its ship and roster entry disappear.
23. Wait longer than three seconds. Confirm no ghost ship or respawn for the disconnected B.
24. Reopen B and explicitly rejoin the surviving room. Confirm the existing new-identity reconnect behavior creates a safe, full-health living ship. It does not restore a persistent identity or pending deadline.
25. Create a separate room in another window; confirm lifecycle changes in the first room do not affect that room's players.
26. Close/leave all clients in one room, then try its old code; expect **Room not found**. No delayed respawn recreates the room.
27. Check both server and Vite terminals for unexpected runtime errors or crashes.
28. When done, press Ctrl+C in each terminal to terminate the local processes, then report your acceptance result. Do not merge or deploy.

## Architecture and testable time

- `shared/lifecycle.ts` defines `MAX_HEALTH = 100`, `RESPAWN_DELAY_MS = 3000`, lifecycle fields and health clamping. The existing protocol name `active` means alive; the only states are `active` and `dead`.
- `server/health.ts` provides the **single server-only damage entry point** `applyDamage(player, amount, source, simulationTimeMs)`. It rejects invalid/nonpositive damage/time, clamps health, ignores dead targets, zeros velocity/input, records the source, increments `deathSequence` exactly once and sets a private `respawnAtMs`. Black hole is the only actual damage source. There are no client damage/heal/respawn events and no weapons framework.
- The unchanged swept segment-circle horizon check in `server/simulation.ts` calls `applyDamage` with lethal black-hole damage. The existing 30Hz room loop remains the only production simulation.
- Respawn checks run within that loop. Deadline time is simulation time `tick × 1000/30`; input freshness retains its existing monotonic real-time timeout. Tests can call `simulatePlayer` with explicit times or instantiate `createGameServer(..., { autoTick: false })` and call its server-local `step()` to advance that same tick implementation. No public step endpoint, detached respawn timer or production fake clock exists. Timing tests never sleep through the three-second delay.
- Snapshots carry server-calculated `respawnRemainingMs`, not a wall-clock deadline. The death UI displays it directly and freezes on stale snapshots; it never compares server time with `Date.now()` or initiates respawn. Browser tests use opposite one-day clock offsets to verify this.
- At the deadline, selection reads `room.blackHole` **at that tick**, including its current position and influence radius, and excludes influence plus the existing 80-unit clearance. Other ships still require 180-unit separation and map bounds apply. If no safe location is available, the player stays dead at health zero with a waiting message; the next tick retries. No unsafe fallback.
- Successful respawn preserves socket ID, room, name and color, restores health/active state, clears source/deadline/countdown, resets velocity/rotation/input and increments `lifeGeneration`. It returns without integrating movement on that teleport tick. No fresh key press is carried from the previous life.
- Inputs and the living debug reset include the life generation they refer to. The server accepts them only for its current living generation. The generation is a stale-message guard, not client authority to create a life. Debug reset never heals, bypasses a death deadline or respawns a dead ship.
- Client lifecycle changes clear pending development lag/input and held keys. Remote interpolation removes just that player's prior-generation records when the generation changes. The first new-life state snaps immediately; subsequent same-generation samples resume ordinary interpolation. This also handles a lost series of death snapshots. Other players retain their buffers.
- Death synchronization uses full snapshots containing health, life state, remaining time, generation and the once-per-death sequence/source. There is no repeated death-event stream. Remote ships fade/label DEAD and recover full opacity on respawn. Reliable roster/disconnect cleanup remains unchanged.
- Disconnect removes the room-owned player, including its deadline; the loop never sees it again and a stale reference is guarded against membership removal. No timer can resurrect it. Reconnect retains the existing new-identity behavior.
- The compact alive/dead health text and death overlay are Step 6 acceptance aids. No final health bar, shields/weapons/ammo slots, FPS display or new debug/player-count/tick HUD was built. Existing Step 3/4 telemetry/ping remains unchanged.

## Intentional changes to old tests

The Step 5 unit test for permanent frozen death now verifies freezing **before the respawn deadline**; permanent LOST was intentionally replaced by automatic respawn. Its physics, gravity and swept-contact assertions remain. The old socket freeze assertion excludes the changing remaining-time field and still asserts frozen position/velocity, dead state and unchanged death sequence. Typed test fixtures gained lifecycle fields and inputs/reset gained a generation; original flight/room/isolation assertions remain. The historical Step 5 guide describes its original branch, not the current Step 6 lifecycle.

## Automated verification result

**54 tests passed**: 45 Node logic/real-socket tests and 9 Playwright browser tests, including the entire pre-existing suite with the intentional Step 6 adjustments described above. Controlled-time tests verify deadline boundaries, one death/respawn per cycle, current-state spawn safety, repeated cycles, stale input rejection, disconnect/ghost prevention and interpolation discontinuities. The two-browser test verifies death presentation, skew-safe countdown, remote visibility, same-identity automatic respawn and renewed movement.

`npm run build:server`, full TypeScript checking through `npm run build`, the client build to `dist/`, and the Pages-path compatibility build to `/tmp/horizon-step6-pages` all passed. The existing Phaser bundle-size warning remains. Local and remote `work`/`step-5-black-hole` were checked against their protected commits; `/docs` is unchanged. No production deployment/configuration/queue action was performed.

## Verification and deployment protections

Run `npm test`, `npm run build:server`, and `npm run build` (writes `dist/`). A Pages-path compatibility build can use `npx vite build --base=/project-horizon/ --outDir=/tmp/horizon-step6-pages`. **Do not run `npm run build:pages` or write `/docs`.**

Before commit/push, verify `/docs` is identical to `9f0c821`, `work` still resolves to `9f0c8216dd434a8c78b5cb1e1f15f083207a127e`, and `step-5-black-hole` still resolves to `6db0ae704680afa46d029b9691e5a12ba97c3560`. Commit and push only `step-6-health-respawn`.

The owner's prior dashboard confirmation persists: Render auto-deploys **work only**, On Commit, with PR Previews Off; GitHub Pages deploys **work → /docs only**. No repository Actions workflow/Render blueprint or configuration change is introduced. Pushing this isolated branch does not change either production source branch under those confirmed settings. Do not create a deployment, change settings or touch the queued Pages job.

Manual acceptance remains pending. Known limits: health currently changes only via lethal horizon contact; black-hole radii remain fixed; identity/sessions are nonpersistent; respawn may wait if no safe position exists; server stalls can lengthen wall-clock delay because the deadline uses simulation seconds. The existing Phaser bundle-size warning remains. Step 7, combat and deployment are out of scope.
