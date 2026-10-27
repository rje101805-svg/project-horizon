# P5A — Fighter selection and authoritative passives

Baseline: `ef950c7144db4baa37ef1ce6015567ed396a3f00`, branch `work`. Original eight PNGs were decoded before implementation. P3S8 Parts A/B remain the baseline; no source art, weapon definitions, dependency, deployment or secret changes. Free Flight and Settings remain out of scope.

## Selection and artwork

PILOT SELECT opens the original 1024×1536 artwork in a contained 2:3 stage. Eight retained Image objects begin loading with the main menu. There is no replacement portrait, duplicate biography, stat bar or SELECT button. Transparent semantic buttons overlay the artwork; hover/focus outlines are deliberately small. The image stage occupies only the contained image rectangle, excluding letter/pillarboxing, so percentage hit areas remain correctly mapped.

`src/fighter-select.ts` centralizes thumbnail/arrow/confirm rectangles, calibrated against the actual PNGs. Nova, Shadow, Zenith and Vulcan have a lower thumbnail/button row and use overrides. `?hotspots=1` outlines and labels all 11 targets. Left/Right cycle, Enter confirms and Escape cancels. Tab/Shift+Tab stay in the dialog; selection keys prevent browser scrolling. Confirm saves `horizon-fighter`, updates a small label near PLAYER NAME and returns home. Invalid/unavailable storage defaults to REDLINE; unavailable storage still allows a confirmed in-memory choice until reload. Escape leaves the saved preference unchanged. Failed artwork leaves keyboard-accessible controls and a clear message.

The original embedded titles/art are preserved verbatim. Gameplay metadata uses the approved identity names below. Existing eight runtime ship textures are reused: SHADOW uses the existing provisional raider texture and VULCAN the existing rocket texture; no new in-game hull artwork or changed hitboxes are claimed. Every fighter maps to a distinct existing texture. Colors remain server-reserved room colors, independent of fighter choice.

## Approved configuration

`shared/fighters.ts` contains the eight IDs, identity/archetype, passives and existing ship binding. All server systems derive stats from the assigned ID, never request-supplied multipliers.

| Fighter | Identity / existing AI archetype | Passives |
| --- | --- | --- |
| REDLINE | Rocket Man / Aggressor | +3% maximum normal/boost speed; +3% thrust acceleration |
| NOVA | Scientist / Strategist | wall cost 18; cell 1.8s, repair 2.7s |
| HORIZON | Adventurist / Wildcard | 9s capture; automatic and manual F/proximity/grace ranges ×1.15 |
| SHADOW | Rogue / Survivor | enemy radar detection against this pilot ×0.88; heading rate ×1.04 |
| DREADNOUGHT | Commander / Strategist | maximum shield 108; repair restores 42 hull; maximum normal/boost speed ×0.98 |
| ZENITH | Oracle / Strategist | ordinary minimap detection range ×1.12; heading rate ×1.04 |
| VULCAN | Scavenger / Scavenger | standard world material stack 28; walls last 19s |
| ECLIPSE | Hunter / Aggressor | +3% thrust acceleration; first qualifying competitor elimination restores 10 shield, capped |

All hull maxima remain 100; material cap remains 300. Standard shields are 100, wall cost 20/lifetime 15s, cell 2s/+50 shield, repair 3s/+40 hull and capture 10s. Modifier calculations do not accumulate on spawn/reset.

### Adaptations to actual architecture

- Flight uses a first-order velocity response rather than a separately configured thrust acceleration. The blend is baseline blend × acceleration modifier / maximum-speed modifier. Thus the thrust increment from rest changes by exactly +3% for REDLINE/ECLIPSE, independent of maximum-speed changes; the terminal speed changes only by the speed factor. Existing normalized diagonals, external forces, slow, boost, boundaries and fixed tick remain. No weapon aim, cooldown, projectile definition or damage value changed.
- Heading formerly snapped instantly to aim, so there was no finite turn rate to increase. Assigned living fighters now share a 720°/s heading limit; SHADOW/ZENITH use 748.8°/s. This changes ship-facing response, including the existing facing-dependent tractor cone, but does not gate mouse weapon aim. Shared fixed movement is used by authority and prediction; unassigned legacy geometry fixtures and aliens keep neutral/snapping behavior. Manual handling acceptance is required.
- Capture retains its normalized 300-tick progress store and existing contest/history/decay. HORIZON contributes 10/9 progress units per simulation tick, completing at 270 ticks; others complete at 300. Snapshot duration metadata lets the HUD show actual 9s rather than mislabeling normalized progress as 10s.
- Ordinary radar range uses observer × target factors, so Zenith viewing Shadow is base ×1.12×0.88. Audible firing-origin pings retain their separate P3S8 range/lifetime rules. On-screen visibility and existing globally replicated snapshots are unchanged; this is not network fog of war.
- Vulcan's bonus applies only to standard 25-material **world** pickups. Conserved player death drops and five-material guardian drops keep their exact quantities, preventing repeated drop/re-pickup farming. Bot loot/context checks use the actual reward when assessing the 300 cap.
- Feed is in the existing once-only competitor elimination accounting. It requires a living ALIVE Eclipse killer and a target that was ALIVE before the lethal transition, never triggers on guardian death, subsequent alien death, environment damage, a duplicate event or nonlethal damage, and never heals above the current maximum shield.
- Shield-first damage, cell restoration, combat/round reset and HUD presentation use selected maximum shield. Dreadnought stays at 108 through healing/reset; alien conversion still has zero shield and no human passives.

## Assignment, multiplayer and AI

RoomStore accepts an optional approved `fighterId` alongside existing play/create/join intents. Omitted legacy requests default to REDLINE; invalid IDs reject without allocating membership. Existing humans retain their reservations. A later conflicting human gets the first available ID in the approved ordering and a visible `REDLINE TAKEN — FLYING AS NOVA`-style lobby/launch message. Local preference stays the user's preference, separate from the resolved server assignment.

Human joins may displace/reassign lobby bots after safe membership validation. FILL remains eight participants; bots take only remaining IDs. Pilot selection is locked during countdown/collapse/launch/active/ended. A strict round-validated `selectFighter` intent permits waiting-lobby changes, and rejects forged fields, stale rounds, nonmembers and bots. The menu remains the normal selection flow. Current admission remains lobby-only; no new spectator or reconnect bypass was added. Departures free reservations; replay retains valid current assignments, clears gameplay/AI state and restores exact caps. No additional membership registry, socket, timer or gameplay engine was introduced.

Phase 4 personality lookup uses the assigned fighter ID, not color or mutable player name. Existing five archetypes, centralized scheduler, model/schema, budgets, safety checks and fallback remain. Bot display names are assigned pilot names for Intel, radio, feed, standings and winner. Human custom names are preserved; lobby/standings also identify their fighter. Lobby reassignment discards stale AI identity state before ACTIVE; humans never enter the AI state map. No separate guardian/pilot API calls were introduced.

## Files

New: `shared/fighters.ts`, `server/fighters.ts`, `src/fighter-select.ts`, `tests/fighters.test.ts`, `tests/fighters-network.test.ts`, `tests/fighters.spec.ts`, this guide and `docs/art-reference/p5a/` evidence.

Integrations: room/protocol/game/network intents; existing flight, combat, match, survival, inventory, objectives and battle statistics; AI context and bot utility planning; menu, assigned ship textures, lobby/assignment status, radar/standings and existing HUDs. Existing tests now assert exact pilot-dependent caps/names/costs instead of obsolete universal assumptions. `shared/weapons.ts` is unchanged.

## Automated verification

Commands (Linux cloud uses a writable npm cache):

```bash
npm_config_cache=/tmp/horizon-npm-cache npm run build
npm_config_cache=/tmp/horizon-npm-cache npm run build:server
npm_config_cache=/tmp/horizon-npm-cache npm run test:server
npm_config_cache=/tmp/horizon-npm-cache npx playwright test --workers=1
```

- Client build and server typecheck pass. The existing large Phaser chunk advisory remains; no new dependency was added.
- Full Node suite: **516/516 passed after the final Feed correction**, with zero skipped/cancelled tests. Includes 32 new fighter cases and an eight-real-socket test, previous guardian/alien/combat/lobby/results/Phase 4 regressions and five complete FILL matches using the production loop. Exact five-round observations are retained in this phase's evidence directory.
- Initial dedicated browser run: **4/5 passed**; 1920×1080, 1366×768, invalid/unavailable storage and two-browser conflict/launch/108-shield/input checks passed. The 800×1000 case required a realistic subpixel-layout tolerance: Chromium rounds dimensions to fractions of a CSS pixel (0.0104px width difference), rather than the test's too-tight ratio precision. The test now requires less than 0.1 CSS pixel of aspect error and retains all hotspot containment/decode assertions.
- Full-run new fighter browsers: **5/5 passed**, including all three viewport sizes and the real multiplayer path.
- Full-run fixture review: the capture test expected `5.0 / 10 seconds` while the accurate duration-aware HUD renders `5.0 / 10.0 seconds`; its exact expectation was updated. The HUD test allowed only 10s for the existing 9.2s cinematic and three rendering clients, and timed out at `launch`. Its phase wait now derives from COUNTDOWN + COLLAPSE + LAUNCH plus 5s delivery/scheduling margin. Production timings and all gameplay/layout assertions remain unchanged. The three Intel browser variants also expected the former mixed-case `Nova`; they now assert the assigned `NOVA` identity while preserving all authorization, source, row-count and input checks. The final rerun verifies the corrected fixtures against final source.
- Full browser run: **75/81 passed (19.9 minutes)**. Six failures: HUD phase-wait margin, exact capture-label decimal, three former `Nova` name expectations, and the pre-existing SwiftShader flash timing case (**353.9ms** versus unchanged 150–300ms). The flash samples jump from 122.2ms at full opacity to 353.9ms at zero opacity (231.7ms sampling gap). Original failure evidence is retained in `docs/art-reference/p5a/full-run-failures/`. The 19 affected/core browser cases are rerun against final source below; this full run is not described as all green.
- Final affected/core browser rerun: **18/19 passed (4.4 minutes)**. HUD, capture/contest/steal, three Intel authorization/name variants, five fighter-selection cases, alien respawn, standings/winner/replay and both controlled launch/render cases pass. The unchanged software-WebGL real-time flash case remains failing: final visible sample duration **78.6ms** versus required 150–300ms. The first sample can be late relative to the authoritative/monotonic flash start; software-render scheduling does not establish the complete visible duration. Both the 353.9ms full-run and 78.6ms final traces are preserved. **80/81 distinct browser cases passed across these runs; one cloud timing case remains unresolved.** No all-green full browser run or reliable flash acceptance is claimed.
- Five-match reset, eight-socket identity results, per-fighter numerical caps, independent acceleration/terminal speed, heading, shared prediction parity, pickup/grace bounds, capture/contest/history, material conservation, Feed exclusions and missing-key AI identity are exercised. No test is marked skipped or assertion relaxed to allow a gameplay failure.

The eight pilot PNGs were decoded again and compared byte-for-byte with artwork commit `ef950c7`; all are unchanged. Dimensions, sizes and hashes are in `docs/art-reference/p5a/assets.json`. The final concurrent test stress sample used eight sockets, 16 guardians, eight walls and three Galaxy owners: 300 server ticks averaged **9.042ms**, p95 **26.550ms**. These are simulation/serialization timings under concurrent test load, not rendered FPS or a controlled before/after comparison.

Final Feed review reproduced an already-alien target with no prior battle record granting +10 shield. The existing elimination callback now carries the authoritative pre-death competitor flag; Feed requires it. The added regression verifies no shield gain, independently of the once-only statistics record. Ordinary player elimination, alien respawn and guardian rules are preserved.

## Known limits and remaining acceptance

Cloud Chromium Canvas and SwiftShader software WebGL do not establish Windows GPU performance. P3S8's real-time software-WebGL flash test remains unreliable here: it failed above and below its unchanged timing bounds. Late first-frame observation and long rendering/sampling gaps limit the measurement. Real Windows hardware must verify the complete flash; no production cinematic change or test-bound relaxation was made. Live OpenAI requests cannot be claimed without a configured valid key; missing-key fallback and mocked strategy tests are separate. Real human balance/handling, separate-device latency and deployed frontend/backend acceptance remain manual. No public deployment was performed.

## Windows manual testing

PowerShell, preserving any local edits:

```powershell
cd C:\Users\rje10\Downloads\project-horizon
git branch --show-current
git status --short
git pull --ff-only origin work
npm ci
npm run server:dev
```

In a second terminal in the same folder, run `npm run dev`. Open `http://localhost:5173/?hotspots=1` (or `?devrooms=1&hotspots=1` for DEV room controls), backend `http://localhost:3001`.

1. PILOT SELECT: click each of eight portraits/arrows. Compare the visible debug outlines against baked artwork, especially Nova/Shadow/Zenith/Vulcan. Resize to 1920×1080, 1366×768 and a portrait window. Check no stretch/clipped controls. Use Left/Right, Enter, Escape and Tab. Escape must cancel; SELECT/Enter saves, updates the small menu label and survives reload. Remove `hotspots=1` for normal presentation.
2. Select DREADNOUGHT → FILL GAME → PLAY. Check seven uniquely named bots, `FLYING AS DREADNOUGHT`, 108 shield and existing lobby/launch. A second browser/profile choosing Dreadnought and joining before START should receive a clear reassignment message; no pilot duplicates are allowed. Ready guests and START. Verify assigned ships/names remain stable; F4 Intel/radio names match bots, never control humans.
3. Test each ability with normal gameplay: Redline speed/acceleration, Nova 18-material wall and 1.8/2.7s channel, Horizon 9s capture/extended auto and F pickups, Shadow/Zenith radar and heading, Dread 108 cell cap/+42 repair/slower terminal speed, Vulcan 28-world-material/19s wall and Eclipse +10 shield only on competitor elimination. Common and Galaxy weapon values must remain unchanged. Guardian kills/alien kills must not grant Feed.
4. Fly while holding M/Tab, press N, switch weapons, F-pickup, G-drop, R-reload, Q and 4/5; click/drag inventory, then release/repress WASD. Check no stuck movement/focus lock. Test normal alien respawn without human passives. Check radar, feed, standings, placement and winner/replay.
5. F3: compare Standard/WebGL and Low/Canvas, record actual GPU FPS with eight ships, guardians, world loot, walls, Galaxy fire and Horizon. Verify status/108-shield bars/readability. Repeat five FILL matches with PLAY AGAIN and then return home/rejoin; check names, assignments and resources reset without ghost ships.
6. For live strategic AI use only the private server-side setup in PHASE4_TEST.md. Do not put keys in frontend config/screenshots. Production/real-GPU/live-API acceptance is not implied by cloud automation. Stop both terminals with Ctrl+C.

## Delivery

Use a normal commit/push to `origin/work`, verify `git rev-parse HEAD` equals `git ls-remote origin refs/heads/work`, and check `git status --porcelain` is empty. Final commit SHA is reported at delivery; it cannot be embedded in its own commit. Never modify main, force-push, reset/discard work or begin P5B here.
