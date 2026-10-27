# P3S8 — Battle royale completion and planet guardian gangs

Starting local/remote baseline: `c05a096f6e46d8ffe97668019b13e39f612c11c7` (verified Phase 4), branch `work`. The working tree was clean before P3S8; the interrupted session's Part A edits were recovered and preserved. Part A must be verified, committed and pushed before Part B starts. No main, destructive Git, deployment settings, production secrets or original image assets are changed.

## Part A — implemented

- Always-visible 180px upper-right radar, N toggles to 280px. M holds a centered full map, Tab holds standings and prevents browser focus navigation. No existing M/N binding was found. These overlays never pause simulation or acquire DOM focus, and ignore typing/key repeats appropriately. Blur, leave, end and reset clear held overlays/listeners. Existing controls including F3/F4 remain intact.
- Maps redraw at approximately 10 Hz through the existing scene update, independently of camera zoom. Offscreen 2D buffers provide the same map in Canvas/Low and WebGL/Standard; only the original Phaser canvas is attached to the DOM. New HUD placement and objective-arrow clearances account for both radar sizes. Planet icons distinguish ice, volcanic, terrestrial and moon; capture/contest/completion rings, destroyed-planet hiding, Galaxy pickups, local heading, current dark Horizon region and authoritative next boundary are shared between both maps. Full map includes planet names, Horizon stage and countdown. Completion color means per-pilot capture history: the game does not have permanent exclusive territorial ownership.
- Enemy dots use a fixed **1650 world-unit** radius (1.5 × default camera width), independent of map/browser zoom. Only living locked-roster human/bot competitors appear. Dead ships and aliens do not. Accepted shots record authoritative firing origins and audiences inside **2750 units** at shot time; rejected shots never ping. Recipients receive only entitled pings, expiring after two simulation seconds or source elimination. Each listener retains only the latest shot they actually heard per actor (at most 56 actor/listener pairs), so a later inaudible shot cannot erase or reveal information about an earlier ping. No all-enemy radar-coordinate list is added.
- **Privacy limitation:** existing gameplay snapshots already replicate other players/projectiles/objectives globally within a room. Dot filtering is a presentation rule; it is not server-side fog of war. The new per-recipient firing-ping field is server-filtered. Existing combat/render synchronization is preserved; true secrecy for baseline positions would require a broader replication redesign.
- Authoritative standings retain the launch roster, including disconnected participants, and track eliminations, damage actually absorbed (not overkill), survival time, successful Galaxy capture completions and shield walls. Counts are updated at accepted server operations, not inferred from client animations. Death/drop/pickup repetition cannot double-count captures or walls. Aliens may still attack through existing mechanics but cannot win or count as living competitors.
- Eliminations sharing a simulation timestamp share competition rank. Later casualties rank above earlier casualties, without iteration-order tie breaking. Same-tick finalists share #1 for a draw. The existing final-Horizon durability rule remains authoritative: its selected winner receives #1 and other same-tick finalists #2. No new victory rule is introduced.
- Server kill feed: at most five entries, six-second lifetime, final 1.5-second fade, one competitor-elimination event per participant/round. Projectile metadata captures the actual weapon name/rarity at firing time, so switching weapons cannot misattribute the kill. Tractor, alien melee, Inferno burn, Horizon and hazards retain their actual sources. No assist system is invented. Radio remains separate.
- Local first elimination shows `YOU PLACED #X OF Y` and the authoritative killer/weapon/cause for 2.5 simulation seconds. The alien banner follows, accurately describing existing flight/melee and inability to win. The existing three-second server respawn remains unchanged; the final half second is still respawn-pending. Subsequent alien deaths keep the ordinary respawn card, without another competitor-placement event. Persistent ALIEN HUD remains.
- Existing end/replay flow now displays WINNER/name or DRAW, all final standings and local placement/kills/damage/time/captures/walls. Existing PLAY AGAIN returns the same room to a fresh lobby and requires START; MAIN MENU leaves through the existing cleanup. Old overlays/statistics disappear on replay.

## Files and architecture

New: `shared/battle.ts` (DTOs/radar rules), `server/battle.ts` (round-owned authoritative statistics and entitled shot records), `src/battle-hud.ts` (maps, standings and presentation), `tests/battle.test.ts`, `tests/battle-network.test.ts`, `tests/battle.spec.ts` and evidence in `docs/art-reference/p3s8/`.

Integrations: `server/rooms.ts` attaches authoritative damage/elimination callbacks; `combat.ts` reports accepted absorbed damage and preserves source metadata; `projectiles.ts`, `galaxy.ts` and `melee.ts` attach actual weapon sources; `objectives.ts` and `survival.ts` count accepted operations; `match.ts` starts/clears/finalizes telemetry; `game.ts` adds standings and individually filtered pings to existing snapshots. `shared/combat.ts`/`protocol.ts` add typed metadata. `src/main.ts`, `objective-visuals.ts`, `style.css`, `menu.ts` and `index.html` integrate presentation. AGENTS.md records the authorized priority. Existing attribution and alien presentation tests are updated to assert the required new behavior, not removed or weakened.

Phase 4 strategy scheduling, SDK, budgets, source labels and Intel authorization remain in place. No weapon damage/cadence, movement tuning, capture duration, Horizon schedule or alien balance changes are made in Part A.

## Part A verification

- Full Node suite: **457/457 passed**. This includes eight new battle cases and one eight-client network case, existing Phase 4 tests and all previous survival/inventory/weapon/capture/lifecycle regressions.
- Client build: **passed**, with the pre-existing large Phaser chunk advisory. Server TypeScript build/check: **passed**.
- Focused browsers: **4/4 passed** (Canvas/Low and WebGL/Standard battle flow, plus normal/150ms-jitter alien lifecycle). The battle test exercises near/far red dots, accepted/rejected and expired/out-of-range shot pings, N sizing, M/Tab, held WASD/Shift and firing, placement/cause, alien transition, winner statistics and replay.
- Full existing + new browser suite: **71/74 passed** in the first 15.5-minute run; three software-renderer fixture waits failed before their intended checks completed. After corrections, the final affected set passed **10/10** in 3.2 minutes (battle, aliens, all launch/flash cases and visual studies). Thus all 74 distinct browser cases passed across these runs; this is **not** claimed as one all-green full run after the corrections.
- Initial failures: one disconnect test incorrectly tried to disconnect a socket-free bot through RoomStore's human membership API; it now joins/leaves a real human. The old projectile assertion expected source metadata to be absent; it now asserts the exact weapon/rarity. The initial browser fixture used nonexistent `#name` instead of `#display-name`, consuming its 90-second deadline; the selector is corrected. No production workaround or assertion deletion was used for those failures. The subsequent full run exposed two inherited WebGL fixture waits that gave cold scene/connection startup only five seconds: they now await actual scene readiness separately with a 15-second cold-start allowance. A visual study also budgeted only 10 seconds for the real 9.2-second launch; it now uses the authoritative countdown + collapse + launch constants plus two seconds for delivery. Runtime frame checks, cinematic timings and the 150–300ms rendered-flash assertions remain unchanged. Final review also fixed listener-specific ping history, literal name delimiters, nonliving roster counts and scaled radar backgrounds, with regression coverage.

## Five complete consecutive FILL matches

The automated case uses one backend and the actual 30 Hz game loop from lobby/countdown/launch to natural winner determination, then the existing replay/fill functions, five times. It does not force winners, shortcut Horizon, grant bot resources or duplicate the engine. Eight identities remain stable; each round produces complete placements and verifies all seven bots resume movement; old pickups, Galaxy Guns, walls and capture histories clear; all pending model work becomes inactive; deliberately late mocked replies cannot recreate AI state after reset. The process-level hourly ledger remains independent of per-match resets.

Exact per-match ticks, winners and mean/p95 server tick durations are in [part-a-five-matches.json](docs/art-reference/p3s8/part-a-five-matches.json). These are accelerated Node simulation timings, **not rendered FPS or real-GPU acceptance**. An additional real eight-socket test verifies identical standings and per-recipient ping filtering while eight ships, eight walls, world pickups and three Galaxy owners are present. Its 300-tick measurement was mean **3.014ms**, p95 **4.007ms**; see [part-a-eight-client.json](docs/art-reference/p3s8/part-a-eight-client.json). This measures server tick/serialization cost, not browser rendering. No evidence required adding pathfinding or another stuck-bot controller; the existing Phase 4 navigation watchdog remains.

## Performance and limitations

Cloud environment: Linux, Node 24, Chromium Canvas and SwiftShader software WebGL. The minimap redraw is throttled to 10 Hz; no new animation/timer loop is created. The five-match log records actual server tick cost. Existing browser cases cover eight-ship planet rendering, pickups, walls, Galaxy effects and Horizon in both qualities; they do not establish real desktop-GPU frame rate or a worst-case combined stress guarantee. The full browser run sampled 120 active frames per renderer: Canvas/Low mean **16.667ms**, p95 **18.4ms**; SwiftShader/Standard mean **78.443ms**, p95 **230.4ms**. These are software-renderer frame intervals, not target-hardware gameplay FPS or a controlled baseline comparison. Target-GPU F3 FPS, separate-device play, narrow viewport layout and human balance acceptance remain manual.

OpenAI credentials are not available. Mocked strategy tests and fallback radio are not live API verification. Do not claim live requests succeeded. Follow PHASE4_TEST.md for secure live testing; no new key, model, deployment or cost configuration is required by Part A.

## Part B — implemented after the Part A checkpoint

Part A was committed/pushed as **`2321e1dfe31a415f838059a55b3bc42eff9af735`**. Local HEAD and origin/work were verified equal, and the working tree clean, **before any guardian implementation began**. Main was untouched. Part B is a separate, reversible change from that checkpoint.

### Shared authoritative NPC system

`shared/guardians.ts` contains tunable count/HP/hitbox, sensing/leash, damage/aggression/cadence, reaction/aim error, respawn and reward constants. `server/guardians.ts` is one deterministic controller for all profiles. Each real ACTIVE world starts four defenders per planet: **16 NPCs, 60 HP, no shield, radius 11** (smaller than player radius), no inventory, no socket membership, no participant/placement slot and no OpenAI calls. Actual lifecycle activation requires the initialized Horizon; existing isolated physics fixtures without a world lifecycle do not implicitly create NPCs.

Movement uses bounded home-region goals; target selection runs at 5 Hz and movement/projectiles use the existing 30 Hz simulation. Patrol/evasion clocks reset per round. Acquisition is approximately 1.8 capture radii, with a 2.5-radius leash (Cinder 2.1). Targets must be living roster competitors; player-controlled aliens are excluded from acquisition, projectile collision and central damage. Return-to-patrol and target invalidation are immediate. Attacks have 450ms base reaction, slot staggering, seeded aim error, partial motion lead and a 300ms telegraph, with at most three projectiles per guardian. No perfect hit or forced damage outcome is imposed.

| Profile | Pattern | Speed | Base damage | Nominal interval / aggression | Range |
| --- | --- | --- | --- | --- | --- |
| Borealis | Tight ice formation; short 20% slow | 85 | 6 | 1300ms / 1.0 | 760 |
| Cinder | Fast close pursuit, shorter leash, 1.35x damage inside 260 units | 165 | 6 (8.1 close) | 1300ms / 1.15 | 620 |
| Pelagia | Spread formation and alternating flanking angles | 120 | 6 | 1200ms / 1.0 | 800 |
| Ashen | Longer-range lateral evasion, lower pressure | 145 | 4 | 1400ms / 0.9 | 1050 |

There is additional bounded cadence jitter. Borealis refreshes a **600ms, 20% movement slow**, without duration stacking. Shared prediction/server movement chooses the stronger active slow: existing Cryo remains **30%**, never multiplied by Borealis. All effects clear at the appropriate death/reset boundaries. No regular or Galaxy weapon damage values changed.

### Combat, capture and rewards

Guardians use the existing room projectile collection, swept circle collision, walls, Horizon contact and projectile lifetime handling. Player/bot weapons hit the smaller guardian radius; shotgun falloff, missile splash, Lunar homing, Cryo slowing, Inferno timed burn and Zapper stun/immunity work against NPCs. NPC projectiles carry a typed guardian source for correct player elimination cards/feed. Guardian death cancels that guardian's outgoing shots, produces a bounded hit/death effect and can drop a physical **five-material pickup**, capped at **40 materials per planet per round (160 total)**. No direct resource grant, healing item or Galaxy Gun is awarded. Guardian HP damage counts as actual damage dealt; defeating a guardian does **not** increment pilot eliminations or affect placement/remaining competitors.

Guardians are outside the player registry, so they do not contest capture or reset progress. The existing ten-second capture and per-player completion history remain unchanged. A real **planet-source Galaxy claim** schedules one replenishment opportunity after 60 seconds; dropped-gun reclaims do not. Only missing slots are filled, with fresh identities, and existing living defenders are preserved. Spawn candidates avoid active ships by at least 110 units; blocked spawns retry at a bounded rate. The Horizon permanently despawns a consumed planet's gang, removes its projectiles and cancels pending replenishment. End freezes pending schedules; replay clears all NPC state and creates fresh round identities.

### Bots, context and presentation

`server/guardian-bots.ts` adapts local threats into the existing bot strategy/hands. Under-equipped or hurt bots retreat from full gangs and temporarily avoid that planet; equipped bots can use their ordinary imperfect aim, movement, finite ammo and weapons. Guardian hits feed the existing sustained-damage wall and out-of-combat healing rules, using actual carried supplies. Existing Horizon/tractor/survival priorities remain first. Reactive replacement is labeled FALLBACK in Intel, not AI.

The existing OpenAI context gains public per-planet defender counts and only locally known guardian target IDs. HUNT can select a currently valid observed guardian through the same five-action schema. No hidden coordinates, NPC private goals/targets/seeds or extra per-guardian API calls are introduced. All Phase 4 request limits, source validation and missing-key behavior remain unchanged.

`src/guardian-view.ts` reuses one culled graphics object: ice hexagons, volcanic darts, terrestrial paired diamonds and moon wings, with HP bars and attack telegraphs. Hostile shots have profile colors/shapes and a red hostile outline. Minimap/full map show defender counts beside planet icons; a brief defended-zone warning is separate from radio/kill feed. NPC projectiles reuse existing interpolation/presence handling. Scene shutdown removes graphics/warnings; no new production frame/timer/listener loop is created.

### Part B verification and measured limits

- Complete Node suite: **483/483 passed**, including 25 guardian cases, a live eight-client guardian network/stress case, all Part A/Phase 4/previous regressions and the five-full-match loop with guardians active.
- Client build and server typecheck: **passed**; existing large Phaser chunk advisory remains.
- Focused guardian browsers: **2/2 passed** in Canvas/Low and WebGL/Standard. Four styles/hostile shots, capture with live defenders, real F/G weapon-exclusivity/re-pickup behavior, actual Common weapon kills/material drops, no pilot kill/placement inflation, client synchronization, map/Tab/N flight, consumption and replay cleanup are exercised. The visual/capture fixture deliberately protects the human to isolate UI/capture coexistence; it is **not** a balance claim. Damage/lethality are tested separately without protection.
- Full browser suite: **75/76 passed (17.8 minutes)**. The software-WebGL real-time flash case measured **305.5ms** against its unchanged 150–300ms requirement. Its samples jump from 78.5ms at full opacity to 305.5ms at zero opacity: a **227ms sampling/render stall** prevents resolving the fade. The existing CSS animation remains 250ms, and guardian AI is inactive during launch. This is an intermittent cloud software-renderer timing limitation, not a claimed all-green full run. Evidence is retained in `part-b-regression/webgl-realtime-flash-full-run-failure.json`; the unchanged launch cases and affected HUD/guardian cases subsequently passed **8/8 (3.6 minutes)**. All 76 distinct cases have passed across the full run and focused rerun; this is not represented as one clean 76-case run. Final real-time flash samples are retained beside the failed sample. No assertion or cinematic duration was relaxed.
- The first wall fixture tried to deploy inside a planet and was corrected to a legal location, preserving production wall rules. Browser fixtures incorrectly assumed Galaxy ownership preserves regular slots and that drops use the 250ms recent-F grace; the real game drops regular inventory and uses a separate 750ms re-pickup lock. Tests now recover the actual dropped Common weapon with F after the real lock; inventory mechanics were not changed.
- All nine regular/Galaxy weapon tests, guardian alien immunity, wall interception, nonstacking slow, ten-second capture, delayed/missing-slot respawn, collision-safe spawn, permanent consumption, reward caps, clean rounds, real bot walls/healing and stale target validation pass.

Final review found that the existing pickup constructor spreads its supplied position object. Passing a whole guardian would therefore have exposed private NPC fields in material loot. The call now passes only `{x, y}`; a regression asserts the exact public pickup fields and absence of NPC goals, targets, seeds and timers. Final Node verification passes 483/483 after this correction. Screenshot review also found that the new longer defender labels clipped at the map edge; text positions now stay within the map bounds. The final client build and server typecheck pass, and the eight affected browser cases pass after that presentation correction.

### Balance probe (not human acceptance)

`scripts/guardian-report.ts` runs the production loop with starting Common Blaster, actual cooldowns/ammo/damage and ordinary input, without invulnerability or granted supplies. It compares five trials per planet of ten seconds stationary at **1.2 capture radii (outside the capture ring)** against twenty seconds of idealized leading aim and ordinary strafing/approach. This is an automated approach encounter, **not a guarantee that standing inside a ring for ten seconds is safe**. NPC balance has no forced damage result.

Recorded five-trial mean damage out of the fresh 200 durability pool: Borealis **102** (51%), Cinder **132.6** (66.3%), Pelagia **45.6** (22.8%), Ashen **23.2** (11.6%). Cinder was reduced from an initial ~181-damage mean by changing only its NPC base damage/cadence. Pelagia/Ashen are deliberately gentler in this approach probe; not every profile is claimed to meet the 50–70% target. The scripted Common pilot defeated the gang alive in **20/20** trials, with idealized aim being easier than actual human play. Real-player movement/cover/aim and capture balancing still need manual review; no regular/Galaxy weapon nerf was used.

Raw results are in `docs/art-reference/p3s8/guardian-balance.json`. The eight-real-client protected stress fixture includes 16 guardians, eight initial walls, three Galaxy owners, world pickups and actual hostile projectiles. Final concurrent-suite tick measurements were mean **4.599ms**, p95 **11.902ms**; exact observations are saved in `guardian-eight-client.json`. Five further complete guardian-enabled FILL rounds and reset measurements are saved in `part-b-five-matches.json`; every round produced a winner and all seven bots resumed movement. This is server simulation/serialization cost, not rendered FPS or a worst-case hardware guarantee.

The focused browser records sixty **actual render frames with the server running** in each quality, eight participants and 14–15 remaining world guardians (two/three visible near the camera). The protected visual fixture and software rendering are explicitly marked in each JSON. Final focused measurements were Canvas/Low mean **17.847ms**, p95 **24.3ms**; SwiftShader/Standard mean **91.760ms**, p95 **242.0ms**. Cloud software WebGL is slow and variable; these are not real GPU results, not a controlled A/B benchmark and not proof of target-hardware performance. Exact final observations are retained in the renderer JSON files.

New Part B files: `shared/guardians.ts`, `server/guardians.ts`, `server/guardian-bots.ts`, `src/guardian-view.ts`, `tests/guardians.test.ts`, `tests/guardians-network.test.ts`, `tests/guardians.spec.ts`, `scripts/guardian-report.ts`. Integrations touch the existing room/projectile/combat/movement/match/objective/bot/context/UI files; no new dependencies or original assets are added.

### Remaining acceptance and polish

No known failing deterministic guardian or gameplay regression remains. Cloud WebGL flash timing is intermittently outside the existing bound, as recorded above. Real Windows GPU FPS, human difficulty (especially gentler Pelagia/Ashen), narrow-window layout and separate-device acceptance remain manual. Existing globally replicated player snapshots do not provide network fog of war. Missing-key fallback and mocked strategic responses are verified; live OpenAI requests and deployed frontend/backend acceptance are not. Production deployment configuration and keys were not changed.

## Windows manual acceptance

In PowerShell:

```powershell
cd C:\Users\rje10\Downloads\project-horizon
git status --short
git branch --show-current
git pull --ff-only origin work
npm ci
npm run server:dev
```

Confirm `work` and preserve local edits if pull refuses. In a second terminal in the same folder, run `npm run dev`; open `http://localhost:5173/?devrooms=1` and use `http://localhost:3001` as backend. Choose FILL GAME → PLAY → START.

1. Check the 180px radar throughout lobby/launch/play. Press N repeatedly for 280/180 sizing. Hold M and Tab separately/together while holding WASD/Shift, aiming and firing. Release overlays, switch slots, F-pickup, G-drop, R-reload, E-tractor, Q and 4/5. Check no focus theft, stuck keys or flight freeze. F3/F4 retain their existing functions.
2. Check planet type icons, capture/contest/completion, Horizon current/next boundaries and countdown; watch consumed planets disappear. Watch nearby red dots and short firing pings, without treating this as full network fog of war. Check radar at both sizes and map labels at your window size.
3. Join with a second human before START. Compare standings, kills and remaining competitors. Test combat/Horizon elimination and same-tick ties. Confirm a 2.5-second placement/cause card, then the alien banner, normal three-second respawn, persistent ALIEN HUD and inability to win.
4. Finish a match. Check winner/draw, all rows, local placement, kills, actual damage, survival time, captures and walls. PLAY AGAIN must return everyone to a clean lobby. Repeat at least five times without restarting; test MAIN MENU and a fresh PLAY.
5. F3 → graphics quality Standard, then Low. Record the F3 FPS overlay during eight-ship play with pickups, Q walls, Galaxy fire and Horizon pressure. Verify kill-feed/radio/HUD/map readability. These Windows GPU measurements are still required; cloud measurements are not substitutes.
6. Approach each planet: Borealis ice hexagons, Cinder volcanic darts, Pelagia paired diamonds and Ashen wings. Check the defended-zone warning, health bars, telegraphs and red-outlined hostile shots. Compare counts on the radar and M map. Fight with ordinary weapons, use Q cover, and retreat beyond the leash: defenders should return home. As an alien, verify they ignore you and cannot damage you. Defeating defenders must not increase pilot kills or change the remaining-player count.
7. Capture a planet with defenders alive: the existing ten-second capture must still complete. Claim its Galaxy Gun using F, defeat some defenders and wait 60 seconds: only missing slots should replenish, avoiding nearby ships. Reclaiming a dropped Galaxy Gun must not schedule another wave. Check physical material rewards (five per defeated defender, maximum 40 per planet per round), without direct grants or NPC Galaxy drops. When the Horizon consumes the planet, all defenders and pending replenishment must disappear permanently for that round.
8. Repeat the guardian checks in Standard and Low while flying, firing, switching slots, using F/G and holding M/Tab. Watch equipped FILL bots fight with ordinary weapons and under-equipped bots retreat. Assess difficulty with unprotected human play; the automated visual fixture uses protection and does not establish human balance or GPU FPS.
9. If testing live strategic AI, use the private git-ignored `.env` setup in PHASE4_TEST.md; solo F4 requires no Intel flag. Never put keys in frontend configuration, screenshots or commits. Stop both terminals with Ctrl+C.

## Git checkpoints and delivery

Baseline local/remote: `c05a096f6e46d8ffe97668019b13e39f612c11c7`. Part A and Part B use separate commits on work. Check exact local/remote SHA equality with:

```powershell
git rev-parse HEAD
git ls-remote origin refs/heads/work
git status --porcelain
```

Part A local/remote SHA was verified as `2321e1dfe31a415f838059a55b3bc42eff9af735`, with a clean tree before Part B. The final Part B local/remote equality is verified at delivery and reported with HEAD; the commit cannot embed its own hash. No main modifications, force-push, automatic deployment or production-secret changes are authorized. Publishing the current frontend and configuring deployed AI remain owner actions documented in PHASE4_TEST.md.
