# Phase 2 Step 2 — local manual acceptance

Feature branch: `phase2/step2-combat-state`, based on accepted Step 1 `fb6bee31bf54060dfefb7d3142288f9a0a8ca321` in `origin/work`. Do not merge or deploy before acceptance. GitHub Pages/Render deployment configuration and `docs/` remain unchanged.

## Run the feature branch

Use Node 22.12+ (24 recommended). In the repository, fetch and switch to the feature branch, then install dependencies:

```sh
git fetch origin
git switch phase2/step2-combat-state
npm ci
```

If your clone has no local feature branch, use `git switch --track origin/phase2/step2-combat-state` instead.

Terminal 1, Bash:

```sh
COMBAT_DEBUG=1 npm run server
```

Terminal 1, Windows PowerShell:

```powershell
$env:COMBAT_DEBUG = '1'
$env:NODE_ENV = 'development'
npm run server
```

For Bash, ensure NODE_ENV is unset or development (`unset NODE_ENV`) if your shell previously set production. Only exact `COMBAT_DEBUG=1` enables debug. Production always vetoes it.

Terminal 2:

```sh
npm run dev
```

Open the printed Vite address (normally http://localhost:5173) in two **visible browser windows**. Select http://localhost:3001 as server URL. Name the first player A and Create room. Name the second B and Join room with A's code. A cloud workspace's localhost is not your computer's localhost; run both processes locally for these instructions.

## Controls and expected results

F3 opens/closes the existing debug overlay. WASD/arrows, Shift boost, mouse aim, R/Reset flight and Back to home retain their previous behavior. The five F3 development buttons affect only the requesting socket's current active player:

| Button | Central API action | Expected result |
| --- | --- | --- |
| Damage 35 | ENVIRONMENT / HAZARD damage | Shield first, overflow to health |
| Consume 1 ammo | consumeAmmo | One round removed; reject when empty/reloading |
| Start reload | startReload | 45 active simulation ticks / 1500ms; refill 12 |
| Toggle Shield Up | setShieldUp | Boolean toggles, no gameplay effects |
| Start cooldown | startFireCooldown | 6 active simulation ticks / 200ms; then ready |

Acknowledgment text appears under the buttons. HUD updates only when authoritative snapshots arrive, not on button acknowledgment. Steps:

1. Both players start health **100/100**, shield **50/50**, ammo **12/12**. F3 shows **ALIVE**, **HUMAN**, kills **0**, Shield Up **OFF**, Reload ready, cooldown **0ms / 100%**.
2. On A, Damage 35: shield **15**, health **100**. Again: shield **0**, health **80**. Repeated clicks reach health **0**, never negative. Status remains ALIVE, life remains active, kills stay zero and no elimination/alien/winner UI appears. General debug damage does not start respawn. Fly A into the black-hole horizon to restore it through the existing death/respawn path before continuing.
3. Consume 1 ammo: **11/12**. Start reload: progress rises and remaining time decreases, finishing **12/12** after 45 server ticks. Click Start reload again during reload: rejection, original deadline retained. Full-ammo reload rejects. Consume repeatedly to zero: the next request rejects and ammo stays zero. Reload refills.
4. Toggle Shield Up: ON then OFF in debug. Damage 35 still absorbs exactly 35; speed/boost/inertia/gravity/turning stay identical. No weapon exists. Start cooldown: remaining/progress briefly change, then ready; duplicate starts while active reject.
5. B's own HUD stays unchanged by A's actions. To inspect A's **received** authoritative combat snapshot in B's development console:

```js
__HORIZON_FLIGHT__.latest.players.map(({id, name, health, maxHealth, shield, maxShield, ammo, maxAmmo, isReloading, reloadRemainingMs, reloadProgress, fireCooldownRemainingMs, fireCooldownProgress, shieldUp, status, controllerType, kills, lastDamageSource}) => ({id, name, health, maxHealth, shield, maxShield, ammo, maxAmmo, isReloading, reloadRemainingMs, reloadProgress, fireCooldownRemainingMs, fireCooldownProgress, shieldUp, status, controllerType, kills, lastDamageSource}))
```

6. Damage A, consume ammo, enable Shield Up and start reload. Fly into the black-hole horizon (use Shift boost). Horizon remains lethal even through full shields. Dead ship freezes; existing three-second simulation countdown remains. Respawn is safe and snaps: full health/shield/ammo, ALIVE/HUMAN, Shield Up OFF, reload/cooldown zero; reload progress reset to 0, cooldown progress ready at 1. Identity/name/color remain. R while living only resets flight and does not heal. Old inputs are discarded; no pre-death thrust jumps the ship on respawn. Repeat while holding thrust into the horizon.
7. Move both windows simultaneously in safe space. Flight/prediction/camera feel unchanged; remote ships remain smoothly interpolated, including black-hole gravity. Enable the existing development fake-network checkbox on both clients: **150ms each way**. Enable separate **±30ms jitter**. Repeat ammo/reload/shield and horizon/respawn. HUD/acknowledgment delivery is delayed; authoritative reload still takes 45 ticks from server acceptance, cooldown 6. F3 sequence/ack/pending/correction continue behaving as Step 1; local input predicts immediately, remote rendering remains buffered, respawn snaps and old-life inputs do not replay. Toggle fake lag off; return home/rejoin; disconnect/reconnect; verify safe new identity and full combat initialization.

## Verify the server gate, including fabricated messages

Stop terminal 1 (Ctrl+C). Start without authorization:

Bash:

```sh
unset COMBAT_DEBUG
npm run server
```

PowerShell:

```powershell
Remove-Item Env:COMBAT_DEBUG -ErrorAction SilentlyContinue
npm run server
```

Create/join a fresh room after reconnection. Click **each** of the five F3 buttons: every request reports **Combat debug disabled by server**; combat values remain unchanged. In the development browser console, fabricate the same messages directly (this bypasses all button visibility and client DEV checks):

```js
const c = __HORIZON_FLIGHT__;
const p = c.latest.players.find(p => p.id === c.socket.id);
for (const action of ['damage', 'ammo', 'reload', 'shield', 'cooldown']) {
  c.socket.emit('combatDebug', {action, lifeGeneration: p.lifeGeneration, teleportSequence: p.teleportSequence}, console.log);
}
```

Each reply is `{ok:false, message:'Combat debug disabled by server'}`. No state mutation occurs. Finally stop server and test the stronger production veto, deliberately supplying the flag:

Bash:

```sh
NODE_ENV=production COMBAT_DEBUG=1 npm run server
```

PowerShell:

```powershell
$env:NODE_ENV = 'production'
$env:COMBAT_DEBUG = '1'
npm run server
```

Repeat the fabricated messages: identical rejection. Restore normal shell values afterward (Bash `unset NODE_ENV COMBAT_DEBUG`; PowerShell `Remove-Item Env:NODE_ENV, Env:COMBAT_DEBUG -ErrorAction SilentlyContinue`). Do not enable COMBAT_DEBUG on the live service.

## Architecture and limits

`shared/combat.ts` centralizes temporary MAX_HEALTH=100, MAX_SHIELD=50, MAX_AMMO=12, RELOAD_DURATION=1500ms and FIRE_COOLDOWN=200ms. CombatState contains resources/maxima, reload/cooldown remaining/progress, shieldUp, status, controllerType, kills and lastDamageSource. Existing LifeState extends it, so existing PlayerState/snapshots carry combat and lifecycle/sequence/teleport data together; there is no second sync channel.

Statuses are independent of controller: ALIVE is an eligible contestant, ALIEN is eliminated/ineligible with later participation, OUT is removed/not participating. Real sockets are HUMAN; BOT is a type only. Disconnect still removes players as before. No eligibility/winner counting exists. `setStatus` changes only state; no automatic ALIVE→ALIEN transition exists. Kills initializes zero and is preserved by reset; no attribution increments it.

`server/combat.ts` exposes applyDamage, consumeAmmo, startReload, completeReload, startFireCooldown, canFireFromCooldown, setShieldUp, setStatus, resetCombatState and advanceCombatTick. DamageSource is PLAYER with playerId or ENVIRONMENT with BLACK_HOLE/HAZARD. Valid positive finite damage clamps shield/health, consumes shield first, records a copied typed source and reports depletion. Example health100/shield20/damage35 gives health85/shield0. Depletion alone never changes status/lifecycle/kills. `server/health.ts` retains BLACK_HOLE death scheduling separately; swept horizon contact applies maxHealth+maxShield through the same API.

Private integer counters advance in the existing 30Hz simulation for active players only; dead timers freeze until the central respawn reset cancels them. There is no authoritative wall-clock/client-time combat timer. Remaining/progress is derived from counters (idle reload 0, completed reload 1, cooldown ready 1). Reload rejects full/invalid ammo, inactive/OUT players and duplicates; completion cannot be requested early. Ammo consumption rejects invalid/insufficient amounts and reload-in-progress. Cooldown readiness is only the cooldown perspective, not future firing permission.

`server/combat-debug.ts` checks explicit server authorization before any mutation; `server/game.ts` resolves target from socket room membership, never request target IDs. Current life/teleport markers prevent stale delayed actions. Fixed self-only actions use the production combat API and accept no client damage amounts. `server/index.ts` reads the flag; NODE_ENV=production always vetoes. DEV client module is removed from production builds; F3 controls use the existing fake-input-lag/connection epoch scheduler. A client request timeout only affects its acknowledgment display, never authoritative timing.

Shield Up has no movement/damage/firing effects. There are no weapons, firing requests, projectiles, hits, aliens, bots, kills/winners, tractor beams, loot, growth or Phase 3 systems. Generic damage can leave an active ALIVE player at health0 until later elimination implementation; that is intentional. Only the existing horizon lifecycle triggers death/respawn. No persistent match/session or player authentication was added.

## Automated verification

```sh
npm test -- --workers=1
npm run build
npm run build:server
git diff --check
```

`tests/combat.test.ts` covers initialization, shield-first typed damage/clamps, ammo, reload duplicates/ticks/completion, cooldown, Shield Up neutrality, independent status/controller, horizon reset/markers and authorization. `tests/combat-server.test.ts` uses real sockets for default/explicit/production authorization, self-only targeting and complete snapshot propagation. `tests/combat.spec.ts` exercises default rejection and enabled controls/HUD/peer snapshots in browsers. All existing Phase 1 and Step 1 tests remain in the complete suite.

## Change inventory

Created: `shared/combat.ts` (configuration/types), `server/combat.ts` (central API), `server/combat-debug.ts` (server authorization/actions), `src/combat-debug.ts` (DEV controls), `tests/combat.test.ts` (8 logic tests), `tests/combat-server.test.ts` (3 real-socket authorization/snapshot tests), `tests/combat.spec.ts` (2 browser control/sync tests), and this manual guide.

Modified: `shared/lifecycle.ts` and `shared/protocol.ts` extend existing replicated state; `server/rooms.ts` initializes tick counters; `server/game.ts` gates requests; `server/index.ts` reads the debug flag; `server/health.ts` retains typed black-hole lifecycle; `server/simulation.ts` advances combat ticks and resets on respawn. `src/main.ts`, `src/hud.ts`, `src/network.ts`, `index.html`, and `src/style.css` connect snapshot HUD, DEV-only controls and existing lag scheduling. `tests/lifecycle.test.ts`, `tests/lifecycle.spec.ts`, and `tests/hud.spec.ts` adapt typed sources/real shield-ammo values and add respawn combat assertions while retaining existing lifecycle/prediction/teleport tests. `README.md` and `AGENTS.md` document current scope and architecture.

Validation completed: `npm test -- --workers=1` passed all **71 Node tests and 16 Playwright browser tests**, with no failures or skips. This includes all previous 60 Node/14 browser tests and 11 Node/2 browser additions. `npm run build`, `npm run build:server`, and `git diff --check` passed. Production JavaScript was inspected and excludes window inspection handles, fake-lag implementation and combat debug action code. Vite retains the existing large Phaser bundle advisory; it does not fail the build. No live deployment or owner manual acceptance is claimed.
