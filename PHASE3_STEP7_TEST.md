> P3S7.2 supersedes launch geometry, map dimensions, loot counts, protection and bot awareness below. Current verification: [PHASE3_STEP7_2_TEST.md](PHASE3_STEP7_2_TEST.md).

# P3S7 — The Horizon, launch spread, loot-first bots and invitations

Baseline: P3S6.1 `f33a30a99135f59db6b0e7cdc1b0f5500c014b84` on `work`. No original public image, weapon balance, inventory focus handling, deployment bundle or main branch was changed.

## Authoritative Horizon

`shared/horizon.ts` owns the complete schedule and physics configuration; `server/horizon.ts` advances it in the existing fixed 30 Hz room loop. ACTIVE begins after ejection arrival. The snapshot includes corner, ACTIVE start, elapsed time, current/next radius, stage, DPS, next event and phase. No client timestamp or radius claim is accepted.

Map bounds are 0–12,000 on each axis (ship centers retain the existing 20-unit edge margin); diagonal D = 16,970.562748. A cryptographic server draw selects one of (0,0), (12000,0), (12000,12000), (0,12000). Tests inject a seeded generator and cover all four. The corner never moves. Replay clears it; the next ACTIVE selects again, with independent draws allowed to repeat a corner.

| ACTIVE interval | Behavior | Radius |
|---|---|---|
| 0–60 s | Calm, no hole/pull | 0 |
| 60–110 s | Stage 1 growth | 0.10D → 0.40D |
| 110–130 s | Hold | 0.40D |
| 130–180 s | Stage 2 growth | 0.40D → 0.65D |
| 180–200 s | Hold | 0.65D |
| 200–250 s | Stage 3 growth | 0.65D → 0.85D |
| 250–270 s | Hold | 0.85D |
| 270–300 s | Final collapse | 0.85D → 1.05D |

Growth is linear and continuous between stage endpoints; the deliberate spawn begins at 0.10D. Final radius = 17,819.090886, larger than the full diagonal. Elapsed time is derived from server simulation time, rounded to microseconds to avoid floating-point tick multiplication postponing the exact deadline.

The outer gravity band is 1,100 units. Acceleration ramps linearly from zero at its outside to `0.6 × NORMAL_SPEED × RESPONSE = 1218` units/s² near the edge. It is applied through existing shared movement for server and prediction. Normal thrust escapes slowly; boost escapes faster. The growing hole uses shield-first 10/15/25/50 DPS by stage, fixed tick elapsed time, and instant consumption at 240 units inside its edge. The explicit Horizon damage boundary bypasses both spawn/launch protection; ordinary weapon protection is unchanged. Aliens ignore Horizon pull/damage and can respawn even inside its region; end removes any surviving alien from active play, zeroes its HP and clears pending respawns/actions.

At or beyond 300 seconds, remaining eligible ships are forcibly consumed even through protection, and the match ends with no overtime. Consumption records copy identity/name, server tick time and combined hull+shield immediately before lethal consumption. With no surviving contestants, only the current consumption tick is considered; earlier casualties cannot win a subsequent combat draw. Within that final consumption batch, the highest pre-consumption combined HP wins. Exactly equal highest HP in that same tick gives DRAW, with no ID/order/random tie-breaker. Normal sole-survivor victory can end multiplayer earlier. P3S6.1 single-ship WAIT still avoids immediate launch victory, but Horizon consumption/deadline can end it.

Consumed planets retain their static definitions but authoritative objective status becomes CONSUMED, progress/occupants/capture are disabled, capture rings vanish, their unclaimed Galaxy pickups are deleted, and a bounded announcement is replicated. Client art fades over 700 ms with a brief consumption pulse, then remains hidden even after announcements expire. Any floating regular weapon, ammo or Galaxy pickup inside the circle is removed after the tick's combat/capture/drop processing. Held weapons remain until ordinary elimination. Replenishment still uses existing finite caps/TTL and safe-point rejection; replay starts from a fresh 35+35 pool.

The client uses an opaque black consumed disk, warm boundary/accretion arcs, synchronized event HUD, off-screen Horizon and SAFE directions, and red gravity/damage vignette. Low keeps required black coverage and two simple boundary strokes; Standard uses five strokes and twelve bounded arcs. No giant shader framebuffer or particle emitter is allocated. Existing lobby/launch black-hole artwork remains. The existing minimap shows current and next radii, clipped to its own panel; no new full M-map system is added.

## Launch calculations and observed coordinates

`shared/launch.ts` reads map WORLD, weapon ranges and the shared default camera width used by the Phaser game. Original P3S6 ejection radius = **360**. Radius A = **900**. Longest regular effective weapon range = **1,100** (Blaster/Missile). Default camera width = **1,100**. D_min = max(1.5×1100, 1.2×1100) = **1,650**. Radius B = 1650 / (2 sin(π/8)) = **2,155.828892**. Selected target = max(A,B) = **2,155.828892**.

Launch origin is exactly `(WORLD/2, WORLD/2) = (6000,6000)`. Existing server-randomized participant assignment and angular offset are retained. A bounded deterministic rotation search validates every landing against bounds and all planet capture radii plus 300-unit landing/loot clearance. On the present map, the full target circle fits for every angle: no radius reduction or individual boundary correction is needed, and all eight adjacent pairs achieve 1,650 units (within floating-point precision). This exceeds the full default viewport diagonal, so opponents are outside the initial default view. If future map geometry/ranges change, placement constraints must be reviewed; this step validates the current map, not arbitrary future layouts.

Observed production placement probe (randomized assignment/offset, not fixed permanent spawns):

| Ship | x | y |
|---|---:|---:|
| Probe | 8154.887 | 6063.736 |
| Viper | 4521.333 | 4431.197 |
| Nova | 7478.667 | 7568.803 |
| Atlas | 6063.736 | 3845.113 |
| Echo | 3845.113 | 5936.264 |
| Comet | 5936.264 | 8154.887 |
| Orion | 4431.197 | 7478.667 |
| Vega | 7568.803 | 4521.333 |

Minimum observed pairwise distance: **1649.9999999999993**. Full D_min was achievable; no boundary or planet adjustments were required for this probe. Each landing receives one relocated existing regular weapon 140 units away and one compatible ammo pack 260 units away, comfortably reachable in about 1–2 seconds at normal speed including acceleration. Total initial resources remain 35 weapons + 35 ammo, without additional accumulation.

Countdown remains 3 seconds; collapse 1.8 seconds; tight launch-hole orbit remains 1.4 seconds. The LAUNCH phase now also includes 2 seconds of cubic ease-out radial flight, with controls/combat locked. Ships settle exactly at landings with zero residual velocity; only then does ACTIVE/control and two seconds of bilateral weapon protection begin. START → controls is approximately **8.2 seconds** plus network/render delay.

## Bots

Starting Blaster counts as weapon one. After arrival, bots seek safe available loot until two weapons or 30 ACTIVE seconds. They collect compatible ammo through the existing authoritative inventory boundaries. Loot-first fire is limited to threats inside 60% of equipped range or a recent attack; no firing/tractor attack during protection. All fire remains within the current regular/Galaxy effective range.

Horizon survival overrides loot/capture/combat. Bots evaluate current/next-stage radius plus a 350-unit goal margin and 450-unit flight margin, with ten-second schedule lookahead; threatened bots boost toward the opposite safe corner. Unsafe/consumed objectives are filtered. At less than 30% combined max HP with a recent attacker, bots retreat rather than pursue. Loot target progress must improve by 20 units within five seconds; stalled targets are excluded for ten seconds, missing targets are discarded, and no reachable loot falls back to normal tactics. All transient goals reset at a new START. Existing deterministic hands, ammo/reload, Galaxy selection, capture and tractor escape are retained; no API calls or new dependencies.

## Five-character room invitations

All generated codes use `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, length five, unique among live rooms. Server normalization/validation is reused by join/reload/link parsing. Destroying a room releases its code. Synchronous room transactions reserve a valid human position/color before replacing exactly one bot. Duplicate joins to the same room return existing membership without removing another bot; different-room joins cannot overwrite membership. Concurrent socket intents execute serially on the server and never exceed eight. Public WAIT matchmaking still excludes FILL rooms.

ROOM CODE, COPY CODE, COPY LINK and copied feedback use existing lobby controls. Share links preserve the actual client origin/deployment path. JOIN WITH CODE is a small code-drawn menu button; it opens an explicit name confirmation and five-character JOIN form. `?room=CODE` prefills it but never auto-connects. Errors distinguish Room not found, Match in progress and Room full.

FILL invitations replace lobby bots, preserve eight total participants and the existing host. All non-host humans must READY. Host departure transfers to the earliest remaining human; a departing lobby human refills with a bot when another human remains. Final-human departure destroys the room instead of refilling an abandoned session. Departures during a locked match do not add bots mid-match; Play Again refills any vacant FILL slots only after returning to LOBBY, preserving surviving bot IDs and allowing the next START. A real-socket regression reproduced the former seven-ship blocked replay before this correction; it now passes, as do both browser renderers. Once countdown starts, admission is locked. WAIT invitation/readiness and solo START remain available.

## Verification

- Full Node suite: **376 passed**, zero failures/skips (`/tmp/p3s7-node-final4.log`).
- Full Playwright suite: **63 passed in 11.7 minutes**, zero failures/timeouts (`/tmp/p3s7-browser-final3.log`).
- After the final replay refill correction: **7 affected browser tests passed** in 1.3 minutes, covering both Horizon renderers, ACTIVE departure/replay refill, repeated FILL victory/replay, menu compatibility and WAIT readiness (`/tmp/p3s7-replay-final.log`).
- Weapon-assets reliability check: **10 passed** (five Canvas and five WebGL repetitions), with all assertions intact (`/tmp/p3s7-assets-repeat.log`).
- Client build: **passed** (`/tmp/p3s7-build-final5.log`); server typecheck: **passed** (`/tmp/p3s7-types-final4.log`). Existing large-chunk advisory only.

The full browser run preceded the final narrowly scoped replay handler change; its affected tests were rerun afterward as recorded above. No unresolved test failures or timeouts remain in final verification.

Regression assertions for damage, ammo, capture, movement and graphics were retained. Obsolete four-character fixtures/reload validation, private-FILL invitation rejection and 6.2-second lifecycle timing were updated to the new contract. Pure combat/physics fixtures still isolate ordinary gameplay from the new match clock; dedicated Horizon/launch tests exercise production paths. The initial Horizon browser attempt exposed a test readiness race before Phaser installed the inspection handle; the fixture now waits for actual scene readiness. The first full browser run had 59 passes and four obsolete-fixture failures: the central-hole test expected lethal contact during the new calm period, two FILL tests expected the former private-join error instead of Match in progress, and the invite-link multiplayer test clicked a legacy control behind the required JOIN modal. The repaired gravity test uses ordinary key inputs with only its private server schedule accelerated; the modal test uses explicit name confirmation/JOIN. Its original assertions for movement, death, reconnect, synchronization and room cleanup remain intact. A later full run passed 62 tests but timed out in the Canvas assets fixture, which had passed in the first full run. Its unbounded latency-probe Promise provided no failure details. The fixture now waits for a connected inspection handle and bounds each acknowledgement at five seconds with socket/phase/tick diagnostics, while retaining the original two-minute test limit and every asset/gameplay assertion. This addresses the indefinite fixture wait; the underlying one-off missing acknowledgement was not reproduced. Repeated renderer results and the final full run are recorded below. Review also reproduced an earlier Horizon casualty incorrectly winning a later combat draw; two regressions failed before the current-tick-only correction and now pass. No tests are suppressed and no failure is hidden.

Screenshots in `docs/art-reference/p3s7/` (refreshed from the final run): calm/landing view, corner spawn/gravity warning, consumed planet and lobby room code in Canvas and WebGL.

## Windows local testing

1. In PowerShell: `git switch work`, `git pull --ff-only origin work`, `npm ci`. Preserve local edits; never reset to obtain the update.
2. Server terminal: `npm run server`. Client terminal: `npm run dev`. Open the printed client URL, normally http://localhost:5173. For a custom endpoint set `$env:VITE_SERVER_URL='http://localhost:3001'` before Vite.
3. Select FILL GAME then PLAY. Confirm ROOM CODE with five unambiguous characters, eight named ships and no automatic start. Copy code/link. START: observe inward collapse, exact central hole, wide two-second flight and control at about 8.2 seconds. No shooting/damage until flight ends plus protection. Fly to the nearby regular gun/ammo; F pickup and inventory clicking must leave WASD responsive.
4. Watch bots collect loot. Deliberately approach/attack one to test defensive close fire. Press F3 and compare Standard/Low. Record actual Windows GPU/browser/resolution FPS after warmup; cloud SwiftShader is not hardware acceptance.
5. Wait 60 ACTIVE seconds: read the Horizon spawn announcement and identify its fixed corner. Approach the edge carefully: gravity warning/vignette, normal thrust escaping slowly, boost escaping faster. Inside, shields then hull drain; deeper than 240 units means consumption. Aliens should ignore the pull/damage but cannot win.
6. Watch a planet disappear and announce consumption. Its ring/capture/unclaimed Galaxy gun must disappear for every client; nearby floating loot vanishes, while a held Galaxy Gun stays usable until elimination. Observe growth/holds at the documented times and bots fleeing away from danger.
7. A match may end early with its ordinary last survivor. If contenders remain, final collapse ends at or before 5:00 ACTIVE with highest pre-consumption HP for a same-tick final batch or DRAW only on exact equality. There must be no overtime. PLAY AGAIN restores planets/loot/ships, clears the old Horizon and waits for another START; the next corner is freshly drawn.
8. Invite: open COPY LINK in a separate browser/InPrivate context. Confirm the JOIN form is prefilled but disconnected; enter a name and JOIN. Verify one bot is replaced, total remains eight, host remains, guest READY is required, and both launch together. Before starting, have the guest leave: one bot refills. Have the host leave with the guest present: earliest guest becomes host and another bot fills. Two unrelated WAIT clients must never randomly join FILL.
9. Check missing code, full eight-human lobby and already-started code errors. Double-click JOIN and refresh/reconnect: no duplicate humans, extra bot removals or stuck countdown. Leave the last human and create again: no stale room.
10. Solo WAIT/PLAY remains one ship and playable without immediate victory, but the Horizon now ends that session by five minutes. Return to menu and START fresh again.

## Remaining manual acceptance

Real-GPU FPS, separate-device internet latency, subjective black-hole/readability polish and bot balance need Windows testing. The existing large-chunk build advisory remains. Audio assets remain absent, so P3S6 hooks stay silent. The tracked Pages bundle was not rebuilt; local dev/dist contains this step, and hosted client release remains separate. Historical finite loot caps/TTL, high-latency F-grace and projectile-feedback limitations remain unchanged. No P3S5, P3S8, PvE, AI, new weapons, planet collision or Settings/Pilot/Free Flight content was added.
