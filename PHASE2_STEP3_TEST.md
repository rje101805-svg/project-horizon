# P2S3 manual acceptance

Starting work commit: `1df8f3607da5d4b060a049b2fbe854267c40a2f4`. Implementation has two mandatory checkpoints: verified authoritative shooting/projectiles first, then visual-only local projectile prediction. Stop after final push for owner acceptance; no P2S4.

## Local commands

Node 22.12+ (24 recommended). Fetch/switch/update work with a clean tree, then install:

```sh
git fetch origin
git switch work
git pull --ff-only origin work
npm ci
```

Terminal 1, Bash:

```sh
NODE_ENV=development COMBAT_DEBUG=1 npm run server
```

Or PowerShell:

```powershell
$env:NODE_ENV='development'
$env:COMBAT_DEBUG='1'
npm run server
```

Terminal 2: `npm run dev`. Open two visible browser windows at http://localhost:5173 (or printed Vite address), select server http://localhost:3001, create as A and join as B using A's room code. Use the same room, not two independent Create actions. Run both processes locally; a cloud workspace's localhost is not your laptop.

## Controls / expected behavior

WASD/arrows thrust, Shift boost, mouse aim, R living flight reset and F3 debug remain. **Hold left mouse over the canvas or Space to fire toward the mouse pointer.** Move the pointer to change shot direction; movement-facing rotation is separate, so strafing still allows mouse aim. Release stops attempts; blur/leave/disconnect/lifecycle changes clear old queued requests. No player-facing reload control was added.

**DEV F**, or F3's **DEV refill ammo · P2S3 temporary** button, requests ammo refill. It works only with explicit server combat-debug authorization, never changes client ammo directly, and does not reset cooldown/cancel reload. At zero ammo, wait and verify no automatic refill; then use F. Existing DEV Start reload remains infrastructure testing only. Refill rejects during reload. This temporary tool is for removal/replacement when P2S4 implements player-facing reload.

F3 shows authoritative ammo/capacity, cooldown ready/cooling down, reload remaining/progress, authoritative projectile count and predicted count. HUD resources remain snapshot-owned. Counts for authoritative bullets are room totals; local predicted count is visual-only.

1. Check both players start 100 health, 50 shield and 12 ammo. Fly both ships: movement/prediction/interpolation remain intact. Keep fake latency OFF first.
2. Place B nearby in safe space; move A until both are visible. Aim A's pointer at B. Hold fire. A's ammo decreases only on accepted shots, at at most five shots per second; B sees authoritative bullets. Miss deliberately: no damage. Hit B: shield decreases in increments of 25, then health in increments of 25. Inspect both clients' received snapshots (`__HORIZON_FLIGHT__.latest.players`) to verify the same combat values. Owner cannot damage itself. Zero-health B stays ALIVE/active with no elimination/winner; it cannot initiate new shots. Use existing horizon death/respawn to restore B for more tests.
3. Fire while thrusting sideways/backward/boosting. Bullets inherit the authoritative ship velocity plus muzzle direction at 800 units/s; they move in straight lines with no gravity. Use received `latest.projectiles` to inspect vx/vy. Planets do not collide with bullets. Horizon geometry removes contacting bullets without adding new black-hole mechanics.
4. Hold until ammo reaches zero. Keep holding for several seconds: no new authoritative shots and no negative ammo. F refills to 12. Resume firing. Start the DEV reload after spending one round: firing rejects throughout reload; refill also rejects. Cooldown is six server ticks regardless of browser frame rate or message arrival frequency.
5. Observe successful-hit cleanup; one bullet causes one hit and disappears. Missed bullets expire after 60 ticks/2000ms or leave world bounds earlier. Reset flight, die/respawn, leave/rejoin or disconnect: old owner-life projectiles are removed. No stale projectile state accumulates.
6. Enable fake latency (150ms each way), then ±30ms jitter. Local visual responsiveness should be immediate after the prediction checkpoint; remote bullets remain authoritative. Confirm predicted/authoritative duplicates do not remain, expired/rejected predictions disappear, combat changes still arrive only through snapshots, and movement/teleports continue working.
7. Try moving B sideways while A aims at the displayed interpolated B. A visual hit may be an authoritative miss: ship rendering is 100ms behind server state and there is no rewind/lag compensation. At high latency the discrepancy is expected to be more noticeable. Record its severity during manual acceptance. Local bullet prediction never confirms hits/damage.

## Debug security and malformed/spam testing

Restart server without the flag: Bash `COMBAT_DEBUG=0 npm run server`; PowerShell `$env:COMBAT_DEBUG='0'; npm run server`. Recreate the room. Press F/refill button: **Combat debug disabled by server** and ammo unchanged. Production veto test: Bash `NODE_ENV=production COMBAT_DEBUG=1 npm run server`; PowerShell set both variables accordingly. Even direct fabricated combatDebug refill requests must reject.

Development console direct request (bypasses button visibility):

```js
const c = __HORIZON_FLIGHT__;
const p = c.latest.players.find(p => p.id === c.socket.id);
c.socket.emit('combatDebug', {action:'refill', lifeGeneration:p.lifeGeneration, teleportSequence:p.teleportSequence}, console.log);
```

For adversarial firing, use a spare client so console sequencing does not interfere with its normal held-fire sequence. Keep it stationary, note ammo/projectile count, then send many requests:

```js
const c = __HORIZON_FLIGHT__;
const p = c.latest.players.find(p => p.id === c.socket.id);
for (let sequence=100000; sequence<100100; sequence++) {
  c.socket.emit('fire', {sequence, aim:0, lifeGeneration:p.lifeGeneration, teleportSequence:p.teleportSequence,
    targetId:'forged', damage:99999, vx:99999}, console.log);
}
```

Only a cooldown-eligible shot can succeed; forged fields are ignored. Repeating the same sequence rejects permanently, even after cooldown. Invalid/missing aim, infinite/NaN numbers, unsafe sequence or stale markers reject without mutation. NaN/Infinity become null through JSON and reject. No `hit` event exists. Reconnect this spare client afterward to restore fresh sequencing. Defaults/production still permit normal authoritative firing; only debug mutations are gated.

## Architecture / temporary balance

`shared/projectiles.ts` BASIC_BLASTER: damage25, muzzleSpeed800 units/s, lifetime2000ms, cooldown200ms, magazine12, owner cap12, muzzle offset28 units, projectile radius3, ship circular hit radius18. Magazine/cooldown reference P2S2 config, avoiding a parallel combat model. Normal five-shot/s firing with two-second lifetime stays below cap12; room maximum is 8×12 active bullets.

FireRequest contains only sequence, aim, lifeGeneration and teleportSequence. Server uses socket membership for ownership and ignores client position/velocity/target/damage/claims. FireResult acknowledges accepted ID/spawnTick or rejection reason; sequence is monotonically retired even on valid-but-rejected requests, preventing replay. Server current state, not client timestamp, determines hits.

Each room owns its projectile Map and ID counter. IDs combine room code and room-local counter. Each bullet carries owner, shot sequence, owner lifecycle markers, position, velocity, damage, spawnTick and remainingMs. Private lifetime ticks are omitted from snapshots. Fire acceptance never advances simulation. Existing 30Hz room loop first simulates ships, then advances bullets once. Continuous segment-circle checks select earliest current-state ship/horizon contact before bounds cleanup, preventing tunneling. Hits call existing P2S2 applyDamage with PLAYER/playerId. No automatic ALIVE→ALIEN or attribution/winner changes.

Snapshot projectiles extend the single existing replication channel. Visual-only ProjectileView uses bounded 32-frame interpolation, 100ms delay, no extrapolation when snapshots stop, immediate removal according to newest presence. Single persistent Phaser Graphics draws simple circles. Existing ship interpolation, prediction/reconciliation and fixed movement are unchanged.

Owner death/disconnect/teleport cancels its live bullets. Zero-health active players cannot start new shots; existing outgoing bullets remain until normal cleanup unless their lifecycle changes. No planet collisions, lag compensation, gravity-curved projectiles, polished VFX/HUD, sound, weapons/loot systems or later gameplay. Faint ship ghosting and the previously unreproduced FPS report are not changed by P2S3.

## Verification

```sh
npm test -- --workers=1
npm run build
npm run build:server
npm run build:pages
git diff --check
```

Pages artifacts remain synchronized because the established work workflow requires it. Only work is pushed after both verified commits. No deployment settings or manual release actions change; the existing work auto-deployment workflow may run on push.

## Authoritative checkpoint validation

Commit 1 validation: full `npm test -- --workers=1` passed **81 Node / 17 browser tests**, zero failures/skips. This preserves all prior 71 Node / 16 browser tests and adds nine projectile logic/interpolation cases, one real-socket security/replication case and one two-browser hold/fire/damage/refill case. Client typecheck/production build, server TypeScript check, Pages build and diff whitespace check pass. Existing combat security integration now checks refill alongside all earlier actions with default and production authorization disabled. Production JS excludes DEV handles, fake-lag and combat-debug implementation. No local projectile prediction is present in this checkpoint.


## Visual prediction checkpoint

The authoritative checkpoint is `13f28a80f35672ca8cb2a4667a8e5f96c4487788`. Only after that committed checkpoint, `src/projectile-prediction.ts` adds immediate temporary bullet circles using the locally predicted ship pose/velocity and the shared muzzle configuration. Records are bounded by the owner cap and contain visual positions/velocities plus request identifiers, not damage/collision/resource state. Rendering never mutates ammo, cooldown, health, snapshots or server projectiles.

Confirmation matches owner ID + shot sequence + lifeGeneration + teleportSequence. A matching authoritative snapshot replaces the local visual; a defensive render guard prevents duplicates even if render occurs before reconciliation. Accepted IDs absent in a subsequent tick remove the visual even when the shot hit before a replicated frame or an acknowledgment arrived late. Rejections remove the request's visual. Unconfirmed records expire after 1000ms. Life/teleport changes, disconnect, membership changes, release/canceled fake-lag queues clear pending visuals. Server logic is unchanged by this checkpoint. Under latency, replacement can visibly correct bullet position; prediction makes firing immediate but does not make displayed hit results authoritative.

### Change inventory

Created: `shared/projectiles.ts`, `server/projectiles.ts`, `src/projectile-view.ts`, `src/projectile-prediction.ts`, `tests/projectiles.test.ts`, `tests/projectiles-server.test.ts`, `tests/projectiles.spec.ts`, `tests/projectile-prediction.test.ts`, `tests/projectile-prediction.spec.ts`, and this guide.

Modified: `shared/protocol.ts` (fire/snapshot types), `shared/combat.ts` (DEV action union), `server/rooms.ts` (room bullets/sequence), `server/game.ts` (validation handler/tick replication), `server/combat.ts` (central DEV refill), `server/combat-debug.ts` (authorized refill), `src/network.ts` (hold cadence/lag/visual lifecycle), `src/main.ts` (input/render/debug), `src/hud.ts` (weapon diagnostics), `src/combat-debug.ts` (DEV F), `index.html` (controls/diagnostics), `tests/combat-server.test.ts` (refill security), `tests/interpolation.test.ts` (complete empty-projectile snapshot fixtures), `README.md`, `AGENTS.md`, and generated `docs/index.html`, `docs/build.json` and hashed assets. No dependency, deployment setting, shared movement, ship prediction/interpolation or unrelated artifact fix changes.

## Final verification results

Commit 2 validation: full `npm test -- --workers=1` passed **86 Node / 18 browser tests**, zero failures/skips. Five visual prediction logic tests cover immediate/velocity-only visuals and non-mutation, matching/deduplication, wrong-owner/rejection handling, accepted shots absent before replication, and timeout/cap/lifecycle cleanup. The new browser test verifies prediction before a 150ms-delayed server request, authoritative replacement without duplicates, rejected-shot cleanup and leave cleanup. The authoritative two-client firing test and every original Phase 1/P2S1/P2S2 test pass unchanged in their behavior assertions.

Client TypeScript/production build, server TypeScript check, Pages production build and git whitespace validation pass at both checkpoints. Final production JS exclusion checks pass for dist and docs (no window inspection handles, fake-lag or combat-debug implementation). Vite retains the existing advisory about the large Phaser bundle; builds succeed. Final Pages Build ID: `client-058527005acb`. Actual user perception of latency-related moving-target hit discrepancies remains a manual acceptance item, not a claim of lag compensation.


## P2S3 projectile visual acceptance fix

Investigation on `33501183ffeeea8e8c7610e996250b8be08b52f3` instrumented the actual development socket emissions, prediction creation/results, snapshot reconciliation and frame render output. Ten stationary Space taps (60ms down, 300ms up; fake latency/jitter OFF) generated exactly ten unique requests, ten predictions and ten accepted server bullets, zero rejections, and no simultaneous duplicate representation of the same shot. Each bullet nevertheless had one backward frame step: new-bullet fallback first rendered the newest authoritative position, then switched to the remote 100ms interpolation bracket once its older samples became available. Example observed reversals were approximately 42–52 world units. Prediction-to-confirmation also switched pose abruptly. Hypotheses 2/3 were responsible; hypothesis 1 was not reproduced. No input-generation changes are needed.

Locally owned confirmed projectiles now sample the latest snapshot with bounded (100ms maximum) visual extrapolation instead of the remote delay. Confirmation preserves the current predicted visual position under the authoritative ID, and each later snapshot preserves continuity. A visual-only offset eases toward server state with an 80ms correction time and a rate limit of half bullet speed, avoiding a backwards jump from offset decay. Remote bullets keep the existing authoritative interpolation. Server firing, geometry, IDs, cooldown, ammo, damage and cleanup are unchanged. Offsets freeze with their visual extrapolation bound during snapshot stalls; absence in a new snapshot immediately removes hit/expired bullets. Release cancels pending requests/visuals without dropping confirmed visual continuity; disconnect/membership invalidation still clears everything.

Temporary investigation counters lived only in an external probe and browser test wrappers, not production application code. No noisy logs or new debug framework remain. The repeated zero-lag probe after the fix again had exactly ten requests/predictions/acceptances, now with zero backwards render steps. This is evidence from actual render composition, not a subjective claim about every hardware/browser's display persistence.

Retest after updating work and restarting both local processes:

1. Fake network OFF, stationary ship and mouse: tap Space individually at least ten times, leaving more than 200ms between taps. Expect one immediate visual per accepted shot, continuous handoff, no second/ghost bullet, no backward step/brief interpolation stop, and pending count returning to zero.
2. Press DEV F to refill (server COMBAT_DEBUG=1), hold Space for multiple shots. Expect clean cadence, server-owned ammo/cooldown, one representation per shot and no buildup. Leave zero ammo untouched to verify rejection, then refill.
3. Enable 150ms each-way fake network and ±30ms jitter. Repeat taps, held fire, stationary and moving fire. Expect no duplicate identity or indefinite visual; latency may still change visual speed/position during bounded correction. No server rewind or hit compensation exists.
4. With two clients, recheck remote bullets, shield-first damage, misses, zero-health behavior, hit/lifetime/world/horizon cleanup, owner immunity and default/production debug refill rejection. Remote interpolation remains server-based.

The later gameplay preference of tying firing more directly to ship heading/nose instead of mouse aim is deferred; this acceptance fix does not change aiming or controls.

### Acceptance-fix verification

Full `npm test -- --workers=1` passed **89 Node / 20 browser tests**, zero failures/skips. New `tests/projectile-handoff.test.ts` covers local versus remote sampling, bounded continuous handoff, identity/lifecycle isolation, independent repeated shots, authoritative disappearance and snapshot non-mutation. New `tests/projectile-handoff.spec.ts` instruments actual socket/prediction/render output for ten individual taps and held fire with fake network OFF and with 150ms each-way latency plus ±30ms jitter; the latter includes moving held fire. Both cases pass without duplicate identities, backward frame steps or pending accumulation. Accepted held shots remain separated by at least six server ticks; ammo remains server-owned. Existing rejection, timeout, security and two-client combat tests pass.

Client TypeScript check, production build, server TypeScript check, Pages build and whitespace checks pass. Production JavaScript in both dist and docs excludes development inspection handles, fake-lag/debug implementation and temporary trace markers. Pages Build ID: `client-8f0595ea647b`. The existing Phaser bundle-size advisory remains. No server/shared combat code, ship prediction/interpolation, movement, dependencies or deployment settings changed.

Fix files: `src/projectile-view.ts`, `src/projectile-prediction.ts`, `src/main.ts`, `src/network.ts`, the two new handoff tests, `AGENTS.md`, this guide, and synchronized generated Pages index/build metadata/JavaScript asset. Subjective appearance on the acceptance machine remains the final manual check; artificial latency may still produce bounded visual speed/position correction and does not add hit compensation.
