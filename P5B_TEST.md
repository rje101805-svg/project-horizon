# P5B — Free Flight practice and Controls

Baseline `0f88b7ead6c65a5f2693aeb8cd880f4afe1af615`, branch `work`. P5A selection, assignments, fighter configuration, artwork and weapon definitions are preserved. No dependencies, preferences/rebinding system, audio/graphics settings or deployment changes were introduced.

## Implemented behavior and architecture

The main menu's Free Flight hotspot now enters **FREE FLIGHT — PRACTICE** directly. It uses the selected fighter and existing appearance, server movement/prediction, boost, aiming, finite regular ammunition, weapons, inventory, pickup/swap/drop/reorder, walls, consumables and planet capture/Galaxy logic. There is no countdown, opponent, guardian, damaging black hole, gravity hazard, collapse, extraction task or winner condition.

**A running game server is required.** This is an isolated private `practice` room on the existing authoritative fixed loop, not an offline/duplicate engine. A single ready-to-play player uses the internal ACTIVE gate required by existing gameplay APIs; it never starts or mutates a competitive match. Practice has capacity one, cannot be joined, cannot FILL, START, ready into a launch, reset through PLAY AGAIN, finish, award placements or publish battle stats. Normal WAIT and FILL admission remain separate. Separate practice sessions do not reserve fighters across rooms. Socket ownership and existing stale input/action validation remain enforced.

`shared/practice.ts` uses the existing map/planet geometry and bounded movement. Hazard geometry is absent from the playable world; client black-hole/cinematic rendering is suppressed only in practice. `server/practice.ts` initializes the ordinary player/inventory/objective pipeline and four depots outside the capture rings. Each depot has five Common weapon classes, five matching ammo packs, materials, a Shield Cell and Repair Kit: **52 pad items total**. Empty pads replenish every five simulation seconds with fresh pickup/weapon identities. Partial ammo packs, carried reserves, grants, capacity limits, drop locks and expiry use the ordinary mechanics. The pad map is bounded; no new timer or physics loop exists.

All four planets retain real ten-second capture (Horizon pilot: nine), ordinary spawned Galaxy pickups, manual F claim and weapon exclusivity. Drop the current Galaxy Gun with G before claiming another. Titan keeps its normal held-trigger spin-up. There is no contest because no other competitor can enter. Per-player once-per-planet history is preserved within a practice session; exiting/re-entering resets it. No guardian claims/respawns or competitive statistics are created by capturing, firing or placing walls.

Health/shield start at their selected pilot's normal caps (including Dreadnought 108). Supplies are real collectibles. With no damaging opponents/hazard, healing at full health/shield correctly reports FULL; no new self-damage system or dummy opponent was added. E remains the normal tractor control but has no target in practice. Practice does not silently refill regular magazines or bypass weapon/reload/cooldown rules.

Back to Menu and Escape use the existing `goHome` path: invalidate pending connection work, close transport/action/prediction timers, destroy the Phaser game and scene listeners/render resources, and delete server membership/world state. Re-entry creates a fresh private session. No background competitive room is launched. An interrupted practice connection returns home through the existing lost-room handling; it does not automatically create a replacement background session.

## Controls screen and current bindings

The baked **Settings** artwork is unchanged. Its hotspot/accessibility label now opens **CONTROLS**. The art-failure editable fallback says Controls. The screen is reference-only, with a scrollable laptop-sized modal, grouped definitions, a separate Back to Menu footer and Escape exit. Repeated open/close adds no network connection or per-open window listener. No volume/music sliders, preferences, graphics controls or rebinding were added.

`src/controls-reference.ts` was audited against `src/main.ts`, `src/inventory-ui.ts`, `src/battle-hud.ts`, `src/ai-intel.ts`, `src/network.ts` and `src/combat-debug.ts`:

- Movement: WASD/arrows, Shift boost, mouse weapon aim (idle ship facing follows pointer; thrust uses movement heading).
- Combat: left mouse/Space fire, R reload, E tractor (competitive target required).
- Inventory/items: F pickup/swap, G quick-drop, 1/2/3 slots, wheel over canvas cycles; click/drag inventory to select/reorder/drop; Q wall; 4 cell, 5 repair.
- Planet/Galaxy: remain in the uncontested ring for 10s / Horizon 9s; F at the resulting pickup; G to release current Galaxy ownership; Borealis Cryo, Cinder Inferno, Ashen Lunar, Pelagia Titan.
- Map/standings: N radar size, hold M map; hold Tab competitive standings, deliberately absent in practice.
- Other: Back to Menu/Esc in practice/Controls; existing Back to home in competitive play; fighter-select Left/Right, Enter, Esc.
- Optional F3 metrics and F4 AI Intel are distinguished from gameplay. Intel retains solo-FILL/multiplayer authorization and is not available in practice. Developer-only reset/combat/fake-network/visual-study tools are labeled optional; F4 is not flight reset.

## Files and scope

New: `shared/practice.ts`, `server/practice.ts`, `src/controls-reference.ts`, `tests/practice.test.ts`, `tests/practice.spec.ts`, this guide and `docs/art-reference/p5b/`.

Integrations: `shared/match.ts` adds a typed practice mode; RoomStore/private admission; existing server clock and explicit statistics/AI/guardian/result exclusions; menu and existing connection request path; practice-only presentation/map/Tab/Intel/exit handling; scoped CSS and two static practice labels. The existing menu regression replaces obsolete COMING SOON expectations with Controls behavior. `public/`, `shared/weapons.ts`, `shared/fighters.ts` and P5A selection/art definitions are unchanged.

## Verification

Executed commands:

```bash
npm_config_cache=/tmp/horizon-npm-cache npm run test:server
npm_config_cache=/tmp/horizon-npm-cache npm run build
npm_config_cache=/tmp/horizon-npm-cache npm run build:server
npm_config_cache=/tmp/horizon-npm-cache npx playwright test tests/practice.spec.ts --workers=1
npm_config_cache=/tmp/horizon-npm-cache npx playwright test tests/practice.spec.ts tests/menu-lobby.spec.ts tests/solo.spec.ts tests/multiplayer.spec.ts tests/bots.spec.ts tests/fighters.spec.ts tests/guardians.spec.ts tests/objectives.spec.ts tests/pickup-movement.spec.ts tests/survival.spec.ts tests/pilots.spec.ts --workers=1
```

- Full Node suite: **529/529 passed**, zero failures/skips/cancellations. Includes 13 new practice cases and all 516 prior regressions (including five complete competitive FILL matches).
- New practice cases verify all eight selected fighters/caps, map bounds, private admission, no bot fill/launch/replay/stats, finite weapon fire, Nova wall cost, replenishment without duplicates, all four captures/Galaxy firing including actual Titan spin-up, isolation from FILL and three clean entries/exits. The actual production server loop remains safe after 9,200 ticks (>5 minutes), with no Horizon, NPCs, results, AI runtime or stat rows, then removes the session on leave.
- Initial focused browsers: **4/4 passed (43.4s)**. Canvas/Low and WebGL/Standard each complete three entries/exits, regular pickup/fire/slot/wall, all four captures and Galaxy F/G/fire, selected Horizon appearance/nine-second capture, map/no-standings, Back to Menu and Escape. Server rooms and socket-client counts return to zero, practice DOM is destroyed, and window keydown-listener counts return to baseline after each exit. Fixture-only teleports shorten planet travel; real capture timers, inputs, pickups, cooldowns and spin-up remain exercised.
- Controls opens/exits three times at both **1366×768 and 1280×720**, with correct groups, bounded modal layout, Back to Menu/Escape and no Socket.io requests. Screenshots are retained under `docs/art-reference/p5b/`.
- Client production build and server typecheck: **passed**. The pre-existing large Phaser bundle advisory remains.
- Relevant browser regression run: **30/30 passed (6.2 minutes)**, including private FILL bot combat/winners/replay with normal and simulated lag, P5A selection/assignment, guardians, menu/lobby, two-client multiplayer, captures/Galaxy ownership, pickup-movement focus regressions, F4 room authorization, practice/Controls, solo start/restart and survival in both renderers.
- Final feature rerun after scoped layout fixes: **4/4 passed (48.2s)**. The unused practice tractor-ready badge is hidden so the mode banner stays readable. Controls now has a separate footer and a focusable scroll region; PageDown scrolling is verified at both laptop sizes. A synchronous scroll check initially ran before the browser scroll animation advanced; an eventual assertion now waits for that real scroll, without changing the required result or test deadline. Final build and server typecheck pass after these changes.

The initial Galaxy unit fixture tried to fire Titan without its required spin-up; the fixture now sends ordinary held-trigger intents and advances the actual spin-up path. Production weapon behavior was not changed.

## Limits / remaining acceptance

No real Windows GPU FPS or live paid OpenAI acceptance is claimed. Cloud browsers use Canvas and SwiftShader software WebGL. This update does not fix or retest the previously documented software-WebGL real-time flash-duration acceptance issue; practice bypasses that sequence, while competitive timings remain unchanged. Targeted competitive entry/launch/winner/replay, multiplayer and control regressions are included rather than claiming a full-browser-suite run. Local software tests do not establish deployed frontend/backend acceptance. Existing deployment configuration and all artwork are preserved.

The server must run for Free Flight. Practice is not an offline mode and is not persistent across exit/server restart. It intentionally has no opponent/target damage, competitive statistics or repeat capture at a completed planet until a fresh session. Healing at full resources is unavailable by the existing rules. No known new functional blockers remain in the tested flows. Real hardware/deployed acceptance and the prior competitive flash issue remain as stated above.

## Windows update and manual acceptance

**Stop BOTH running Horizon terminals with Ctrl+C before `npm ci`.** Vite/Node processes can lock files in `node_modules` on Windows; leaving them running can cause EPERM/file-lock errors or leave old servers on the expected ports. Preserve local changes if a Git command refuses; do not reset/discard them.

PowerShell, from the existing checkout:

```powershell
cd C:\Users\rje10\Downloads\project-horizon
git status --short
git switch work
git pull --ff-only origin work
npm ci
npm run server
```

Keep that server terminal running. In a second terminal:

```powershell
cd C:\Users\rje10\Downloads\project-horizon
npm run dev
```

Open **http://localhost:5173**; backend **http://localhost:3001**. Use the local URL printed by Vite if 5173 is occupied, and stop unintended old Horizon processes rather than testing against stale servers.

1. Choose a pilot in PILOT SELECT and confirm. Click Free Flight: one ship, correct appearance, FREE FLIGHT — PRACTICE label, no START/countdown, opponents, guardians, black hole or Horizon timer.
2. Fly/boost/aim/fire; collect nearby gear using F, switch/drop/reload, try Q with materials. Hold M to find all four planets; depots sit outside their rings and replenish empty pads after five seconds. Check N, inventory click/drag and subsequent WASD movement. Supplies obey real capacities; healing at full health is expected to say FULL.
3. Capture each planet for 10 seconds (Horizon 9). Claim its Galaxy Gun with F, fire (hold Titan through spin-up), then G-drop before trying another. Check no contest/guardian/winner appears. Fly to map edges: the ship stays inside.
4. Return with Back to Menu, enter again and leave with Esc; repeat a third time. Check fresh capture history/resources, no old projectiles/ships/listeners and correct selected fighter. Test both Standard and Low using the existing F3 diagnostic panel.
5. Click the baked Settings entry to open CONTROLS. Check all groups on a laptop-sized window, scroll as needed, close with Back to Menu and Esc. No settings/rebinding/audio sliders should appear.
6. Start FILL → PLAY → START: existing eight unique fighters, lobby/launch, bot play, guardians and results remain. Join a second browser/profile to a normal WAIT lobby, READY and START: check both move/fire independently. Finish/replay or leave normally. Existing competitive flash acceptance remains a separate real-hardware check.

Final delivery uses a normal commit/push to `origin/work`; local/remote SHA equality and clean tree are reported at completion. Main and production deployment settings are untouched.
