# P2S6 — Eliminations + Alien Respawn

Baseline: manually accepted P2S1–P2S5 on work, `51c037eccf02135043126a37cbce1c3e221a7b2f`. Manual acceptance remains required. P2S7 winner/ending/post-match flow is deliberately absent.

## Setup

Pull work. In Windows Command Prompt:

```bat
npm ci
set NODE_ENV=development
set COMBAT_DEBUG=1
npm run server
```

In a second terminal run `npm run dev`. Open two visible clients, select `http://localhost:3001`, create/join the same room, and stay outside black-hole influence. F3 opens diagnostic controls below the viewport. Fake latency is OFF by default; repeat the sequence with the 150ms-each-way checkbox and ±30ms jitter enabled in both clients, then close F3 for primary gameplay checks.

## Exact manual acceptance

1. Verify both human players start with 100 HP, 50 shield, ammo 12; Humans alive is 2. Fly/boost/rotate, fire, manually reload with R, and empty a magazine for auto-reload. Compare accepted prediction, gun handoff, cooldown, shield-first damage and HUD behavior.
2. Arrange A/B within shooting range. A shoots B: first two 25-damage hits drain shield, then health decreases. B begins R reload on a partial magazine before the lethal hit; A continues until B reaches 0 HP. Verify B becomes ALIEN/dead once, remains connected/in the room, freezes input, cancels reload, and hides human ammo/shield/reload. A sees actual clamped lethal damage feedback. Humans alive becomes 1. Play continues with no winner screen or ending.
3. Verify the temporary YOU ARE NOW AN ALIEN message on B, elimination countdown around 3 seconds, and no additional human bullets when B holds Space/left mouse during this delay.
4. For pre-elimination projectiles, arrange a longer-range trade: B fires toward A just before A's lethal hit lands. B's already-fired valid bullet must keep moving and may still damage A after B is eliminated. It retains normal swept collision, damage, horizon/bounds and 2-second lifetime; death does not invalidate it. Departure/disconnect and living reset still remove owned/old-teleport bullets. Deterministic automated tests cover this timing precisely.
5. After about 3 server seconds, verify B respawns at a map edge and both clients agree on position, ALIEN status and active life. B has 40/40 HP, zero shield, no ammo/reload display, an alien status/HP HUD, a distinctly lavender round ghost silhouette at 50% opacity, and a visible ALIEN tag. A stays a normal opaque triangular ship. B's own character is also translucent. No persistent enemy bars are added.
6. Immediately try shooting alien B during the 2-second protection window. HP must remain 40; no false damage number appears. After protection expires, one human bullet deals 25 HP, leaving 15; a second deals the remaining 15 and kills B. Repeat the 3-second respawn: B remains ALIEN, restores 40 HP, receives protection again and never adds to Humans alive.
7. Repeat a respawn, bring B near A, and have B press/hold the existing Space/left-mouse fire input. Protection must end immediately on the accepted attack attempt, including a miss. A can damage B immediately afterward. B must never spawn a gun projectile or predicted gun visual, consume ammo, or reload with R.
8. Alien melee hits one nearest active human within 60 world units between centers (roughly adjacent ships), in any direction. Test inside/outside that range. F3 on B shows `Alien melee`, range 60, configured damage 5 and `last applied 5` on successful normal hits (0 on a miss, or less for clamped remaining HP). Shield still absorbs melee first; 5 is exactly 20% of the unchanged 25-damage human blaster. Hold/rapidly press fire: accepted melee attempts remain separated by 23 server ticks, about 0.77 seconds.
9. Optional third client: eliminate C too, then put alien B beside alien C with A out of range. B's melee cannot damage C. Bring A nearby: B can damage A; A can damage both aliens. Humans alive remains 1. If A also dies, Humans alive becomes 0 and the sandbox still continues without P2S7 logic.
10. Repeat important elimination/reload cancellation, projectile trade, alien flight/melee, protection cancellation, repeated respawn and HUD checks with latency/jitter ON. All clients must converge on authoritative status, resources, counters and markers. No old-life inputs, reloads, gun predictions or damage receipts may survive reset/respawn. Watch F3 pending/ack/correction and check responsiveness against P2S5.
11. With F3 OFF/ON, check 1280/680/375-width layouts: ammo/alien HP sits below the existing map, Humans alive fits compactly, debug stays below the viewport, and alien transition message is readable. Verify the temporary message disappears and does not repeat on later alien deaths.
12. Check leave/disconnect cleanup and server/default production debug vetoes. Existing membership semantics are unchanged: reconnect is a new socket membership, not a persistent authenticated match identity. Within the retained membership, death, respawn, status/reset APIs and DEV refill must never restore human eligibility. Do not treat this step as a new persistent reconnect/authentication system.

## Authority and tuning

- `shared/alien.ts`: HP 40, damage `BASIC_BLASTER.damage * .2`, range 60, cooldown 750ms rounded up to 23 fixed ticks, protection 2000ms, lavender tint and opacity .5.
- `server/combat.ts`: sole damage/elimination path; shield-first/clamped actual damage, private monotonic humanEliminated guard, current simulation-time protection deadline, cancelled reload/timers, input retirement and 3000ms respawn deadline. Protection applies to all damage, including environment damage. `server/health.ts` retains its boolean adapter without a second damage path.
- `server/rooms.ts` and `server/simulation.ts`: bounded crypto-random shuffled edge candidates respecting map margins, other-ship separation and current black-hole safety; retry safely if blocked. Same membership/name/color/controller stays, life and teleport generations invalidate old input. Existing fixed loop advances countdown/protection; no new timer.
- `server/melee.ts` and `server/projectiles.ts`: existing typed intent dispatch, server range/target/cooldown/damage; protection cancelled before resolving an accepted attempt. Projectiles survive only the owner's valid elimination marker, not arbitrary teleports, later generations or departure. Protected alien contact consumes a bullet normally without damage/receipt.
- Snapshots add authoritative survivingHumans and combat state adds remaining protection/last actual melee damage. A melee fire acknowledgment is explicitly distinguished from a projectile acknowledgment; it cannot confirm a predicted bullet. No client target/hit/resource claims are trusted. No kill scoring, winner logic or new match lifecycle.
- `src/main.ts`, HUD/bar/presentation modules and HTML/CSS provide visual state only. Numeric alien HP uses maxHealth 40; shield bar and human resources disappear. First-transition message uses the existing HUD frame clock for 6-second expiry, not a timer. Existing prediction, movement/interpolation and human combat tuning remain unchanged.

## Automated verification

Run `npm test -- --workers=1`, `npx tsc --noEmit`, `npm run build:server`, `npm run build`, and `git diff --check`. Pages-compatible build can be validated into a temporary directory with `npx vite build --base=/project-horizon/ --outDir=/tmp/horizon-p2s6-pages`; tracked docs release artifacts remain unchanged because deployment was not requested. Check production bundles for exclusion of DEV handles, combat-debug tooling, fake-jitter implementation and test instrumentation.

`tests/alien.test.ts` covers elimination, reload/input cancellation, permanent eligibility, exact timers/edge validation, repeated deaths, invulnerability, gun hits, short-range human-only melee, cooldown/spam, clamped actual damage, pre-elimination projectile resolution and cleanup. `tests/alien.spec.ts` exercises real three-client snapshots and normal/150ms+jitter input for lethal gun hits, translucent local/remote aliens, HP/HUD/counter synchronization, real flight/melee, repeated respawn and one-human continued play. Existing lifecycle/zero-HP expectations are updated only for requested alien semantics; accepted prediction/handoff/reload/security assertions remain.
