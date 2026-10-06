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
