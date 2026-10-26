# P3S5 — Complete survival system verification

Starting point: clean `work`, local/remote P3S7.2 `9754b1979f99f9d89d14c446560ef3c29557e46e`, fetched and verified before implementation. The current user request supersedes historical “no P3S5” restrictions. No main, Pages release, original asset edits, new dependencies or Phase 4/API calls.

## Architecture and authority

The existing 30 Hz authoritative room loop, central damage/elimination API, inventory, floating loot, projectile sweep and snapshots are extended. There is no second inventory, health model or physics world. `WeaponInventory.survival` holds materials, cell/kit counts and one pending use; the existing health/shield fields remain the only durability values. Private command sequences, wall cooldowns and bot combat memory remain server-only.

`shared/survival.ts` defines balance, intent validation, replicated wall/use types and swept rectangle geometry. `server/survival.ts` implements resource placement, atomic auto-collection, healing, placement, wall lifetime/damage and drops. `server/projectiles.ts` resolves walls in its existing earliest-contact traversal. The original Cryo/Inferno streams are short-lived Galaxy projectiles, so they traverse that same interception path; there is no parallel ray or stream engine to bypass walls. Tractor LOS and ship movement are unchanged.

The `survival` request contains action plus sequence, room/round/session and life/teleport markers. A wall request may carry aim, never position/cost/HP. The server calculates geometry at the current authoritative ship position. Unknown outcome fields, duplicates and stale membership/lifecycle requests reject. Accepted inventory changes and projectile collisions are synchronous room transactions. Rejections retire sequence IDs; replay retains monotonic IDs while new rounds/lives invalidate old packets.

Snapshots carry the authoritative wall set plus existing player inventory and loot. Wall IDs include room/round and a monotonic counter. The established membership epoch and monotonic snapshot tick filters prevent delayed packets from recreating destroyed/expired walls. No new broadcast loop, service, renderer pass or timer is introduced.

## Materials and pickup economy

- Stack value 25; player cap 300. Material pickups use a triangle glyph and warm amber, separate from ammo/weapon silhouettes.
- Whole-stack policy: reject collection if the entire value cannot fit, leaving that same pickup intact. Smaller death-drop remainders use their exact value. Example: 290 +25 rejects; 295 +5 succeeds. Simultaneous overlap chooses distance then server ID and deletes a pickup exactly once.
- Actual map is 18,692², area ratio 2.42632544 over the 12,000² baseline. Base provision is eight pilots ×ceil(2 walls ×20 /25) stacks =16. Scaling that density by area gives **39 material pickups**, not an arbitrary count.
- Initial healing is half the existing 70 weapons: **35 pickups**, initially 24 cells/11 kits. Existing **70 weapons +70 ammo** and mix/rarities remain unchanged. Total initial ACTIVE pool is **214**.
- Each landing has two material stacks 550/1,050 units inward, with valid terrain checks; other materials/healing use the existing bounded safe placement and spacing logic. No resource collection or survival world pickups appear in lobby/launch. Seeding occurs on the first normal ACTIVE tick following the arrival transaction.
- At unchanged ordinary speed 290 (boost 440), the route report drives real authoritative input/movement/collection from every actual landing. Each pilot finds 50 materials in approximately 3.3 seconds of direct travel, funding two walls with 10 left. This establishes access within the requested first minute; it is not a promise that an exploring player cannot find more during that minute. Looting/capture detours and competitive balance remain manual acceptance.
- [Economy report](docs/art-reference/p3s5/economy-report.json), reproduced with `npx tsx scripts/survival-report.ts`, records all eight coordinates, travel distances, funding times, total counts and initial spawning CPU time.
- Replenishment checks run every five simulation seconds, add at most one missing survival world pickup, and never exceed target category counts. Existing drop expiration and Horizon consumption apply. Total pool cap **530** reserves the previous 320-item capacity, 74 survival world items and at most 136 survival death stacks (8 ×[12 material stacks +3 cells +2 kits]). At cap, world loot is reclaimed before regular drops; survival drops are not evicted to make room.

Human-form living bots and humans collect automatically within the existing 130-unit radius. Galaxy holders remain eligible. Dead/OUT/alien ships, queued identities and non-ACTIVE phases cannot collect. Carry limits leave unreceivable items in the world. Utility data survives the regular-inventory clearing performed when equipping a Galaxy Gun.

## Q shield walls

| Property | Implemented value |
|---|---:|
| Materials | 20 |
| HP | 75 |
| Lifetime | 15,000 ms |
| Per-owner live cap | 3 |
| Placement cooldown | 500 ms |
| Center ahead of ship | 90 units |
| Width / thickness | 90 / 8 units |

Width is 1.5 × the existing 60-unit ship diameter. Wall `angle` is the aim-facing normal; the long edge is perpendicular. Bounds, planet intersection and overlapping walls reject before charging materials or setting cooldown. Q is a non-repeating key-down action. Galaxy holders may place walls; eliminated/alien/non-ACTIVE players cannot.

All regular and Galaxy projectile types sweep against oriented walls, with projectile radius included. The earliest valid wall/ship/Horizon/boundary contact wins. An intact wall consumes the incoming projectile; destroying a wall removes its collision immediately. A missile's direct wall damage applies once, and its existing explosion also damages other eligible walls/ships with unchanged falloff. Intact walls occlude splash rays; once the direct hit destroys the wall, exposed splash targets may be damaged. Wall splash distance uses the closest rectangle surface, not just its center.

Ships/bots/aliens, tractors, capture interaction and Horizon damage/gravity have no wall collision or LOS hooks. Walls persist after owner death and expire normally, including finite remaining lifetime after disconnect; destroying the room clears them. Replay/start clears the whole wall set and cooldown/bot state. There is no indefinite owner record or orphaned timer.

One bounded Graphics object renders thin amber edges, translucent interiors, a 160 ms deployment scale, brief hit highlighting, HP-dependent cracks and a 250 ms disappearance fade. Removed-object fades are capped at 24, and geometry is culled to the viewport. Standard/WebGL and Canvas/Low use the same readable silhouette without extra particles or shaders.

## 4/5 healing

| Action | Restore | Duration | Carry limit |
|---|---:|---:|---:|
| 4 — Shield Cell | 50 shield | 2,000 ms | 3 |
| 5 — Repair Kit | 40 hull | 3,000 ms | 2 |

Only one pending use exists. It records server start/end time and life/teleport markers. No immediate healing or up-front consumption occurs. Completion follows the normal projectile/tractor damage batch, revalidates living ACTIVE membership and restores only its intended existing durability field, clamped to its maximum. Exactly one carried item is deducted once.

Movement and incoming damage do not interrupt use. A successful weapon shot, actual weapon switch, active-slot replacement/drop, acquiring a Galaxy Gun, becoming either tractor participant, death, teleport/life change or leaving ACTIVE cancels without healing/spending the item. Invalid fire or switching to the already-selected slot does not count as firing/switching. Repeated activation returns USING without restarting/queuing; another consumable cannot overlap. Full durability returns FULL without consuming; empty inventory returns NO CELLS/NO KITS.

The compact utility HUD shows materials and real carried quantities. Its circular CSS progress ring uses authoritative snapshot timestamps and the replicated pending use. FULL, NO CELLS, NO KITS, USING, CANCELLED, collection, deployment and completion feedback are bounded messages; the HUD is hidden outside a living ACTIVE ship. Pointer events are disabled on utility presentation, so it cannot steal flight focus.

## Death, disconnect and lifecycle

Elimination cancels use and clears held utility quantities before emitting drops, then invokes the unchanged regular weapon/ammo and Galaxy drop paths. Material stacks sum exactly to the held balance, including remainders (287 →11×25 +12); each cell/kit drops separately. Repeated elimination/callback/disconnect sees zero held quantities and emits no duplicates. Drop scatter follows the existing death position, rejects planets/world edges, and retains resources under crowding. The existing Horizon sweep may consume these drops normally; five-minute full-world consumption cannot throw or resurrect a player.

Reset/new START clears balances/counts/use, pending timers, cooldowns, wall ownership, pickups, bot defense and combat memory. Monotonic action/loot IDs remain safe across consecutive rounds. Match end cancels all unfinished healing and disables new actions/spawning. No health regeneration, movement tuning, weapon damage/cadence, Galaxy damage/status tuning, launch/protection timing, capture radius or victory rule is changed.

## Deterministic bots and Phase 4 boundary

Existing movement/aim/strategy/hands remain intact. Bots seek useful utility within 900 units, auto-collect through the same server path and keep ordinary combat/capture/loot priorities. They receive no starting or regenerated resources.

Healing requires combined durability <60%, no incoming hit or accepted outgoing fire/hit in the preceding two seconds, a useful carried item and no existing use/tractor restriction. Cells take priority, then kits. Bots do not fire or activate tractor while completing a chosen heal; normal movement/escape continues. No instant healing or inventory bypass exists. Incoming pressure retains the full two-second window (at most 64 tick timestamps), avoiding a false sustained-fire signal from one shotgun burst and a missed signal from high-rate streams.

Walls require durability <70%, at least two distinct enemy hit ticks within two seconds, at least 500 ms since the first hit, a recent meaningful attacker allowed by existing awareness, material/cap/placement validation and at least three seconds since the previous successful bot wall. Aim faces that attacker, not hidden global coordinates. The ordinary 20 cost/75 HP/15-second lifetime and per-owner three-wall cap bound defensive loops.

Phase 4 should extend the intent writers in `server/bots.ts`: `selectBotStrategy`, `selectObjectiveStrategy`, `selectSurvivalStrategy` and `botSurvival`. Keep `botHands`, accepted movement/action APIs, `startHealing`, `deployWall`, server inventory, damage and validation as deterministic tactical execution. No OpenAI package, secret, request or strategic integration is included here.

## Automated validation

Current logic/build validation: **418/418 Node tests pass**, including 31 dedicated survival tests, with no failures/skips. Client production build and server typecheck pass; the existing large Vite chunk advisory remains. No lint script exists in the repository.

Commands:

```powershell
npm run test:server
npm run build
npm run build:server
npx playwright test --workers=1
npx tsx scripts/survival-report.ts
```

The focused two-client survival browser test passes in Canvas/Low and SwiftShader WebGL/Standard. It verifies actual Q/4/5 keys, synchronized balances/walls/HP, delayed healing and fire cancellation, movement after inventory clicks and key-up/repress, material/consumable drop totals, replay cleanup and no page errors. The complete 69-test browser suite was run: 61 passed and eight failed on its first invocation. Focused recovery ran 19 tests: 18 passed; the remaining solo WebGL test exceeded its old whole-test budget. All other original failures passed after the documented fixture corrections, including the solar four-biome Canvas/WebGL test. **Final solo/survival delivery: 4/4 pass** in one invocation (1.4 minutes), including the previously failing WebGL solo case, two complete real launches per renderer and both two-client survival paths. Every one of the 69 browser cases has a passing result across the complete run and focused recovery; no single all-green 69-test invocation is claimed. This is not a claim of one all-green 69-test invocation.

Node cases cover all five regular classes and all four Galaxy Guns against walls, splash occlusion/no duplicate wall damage, expiry/destruction, planet/bound rejection, resource caps, simultaneous collection, Galaxy holders, exact/capped healing, repeated/overlapping requests, movement/damage during use, both tractor sides, death/end/lifecycle invalidation, duplicate drops, bots and five-minute cleanup.

The old bounded bot soak assumed multiple emergent combat wins within 3,600 ticks. Survival looting changes those paths, so it now exercises 18,200 ticks with the actual Horizon and retains the multiple-round, socket-free, finite-coordinate/ammo/input assertions. Historical browser fixtures now use current lobby coordinates, scaled weapon counts, complete survival pool totals and P3S7.2's three-second ejection. Assertions remain active.

## Screenshots and manual Windows acceptance

| Renderer / quality | Utilities | Healing progress | Deployed / damaged wall |
|---|---|---|---|
| Canvas / Low | [counts](docs/art-reference/p3s5/canvas-utilities.png) | [progress](docs/art-reference/p3s5/canvas-healing.png) | [deployed](docs/art-reference/p3s5/canvas-wall-deployed.png), [damaged](docs/art-reference/p3s5/canvas-wall-damaged.png) |
| Software WebGL / Standard | [counts](docs/art-reference/p3s5/webgl-utilities.png) | [progress](docs/art-reference/p3s5/webgl-healing.png) | [deployed](docs/art-reference/p3s5/webgl-wall-deployed.png), [damaged](docs/art-reference/p3s5/webgl-wall-damaged.png) |

1. On Windows with Node ≥22.12, use `work`, `git pull --ff-only origin work`, then `npm ci`. Run `npm run server` in terminal one and `npm run dev` in terminal two. Open `http://localhost:5173`; server URL is `http://localhost:3001` if shown.
2. Select WAIT →PLAY →START alone. Confirm the existing black-hole countdown/collapse/flash/visible launch. Fly with WASD/Shift, F-pick up a gun, switch 1/2/3 and click/drag the inventory. Release/repress movement after UI gestures, click canvas and return from menus; no key should remain stuck or permanently stop flight. Q/4/5 must not consume keys while typing a name/server/code.
3. Travel inward from the landing to find triangle material stacks. Confirm +25, cap 300, and intact stacks when they cannot fit. Collect cell/battery and repair/cross shapes without pressing F, including while holding a Galaxy Gun. Confirm 3-cell/2-kit limits and that aliens cannot collect.
4. Aim with the mouse and press Q. Confirm 20 spent, narrow perpendicular wall, distinct placement flash, damaged appearance, destruction and 15-second expiration. Test insufficient materials, bounds/planet/overlapping rejection, 0.5-second cooldown and three-wall cap. Move and tractor through walls. Fire regular weapons and all four Galaxy Guns at them; inspect missiles/splash on both sides and confirm Horizon still damages/pulls normally.
5. After losing shields/hull, press 4/5. Check 2/3-second rings, continued movement/damage, exact +50/+40 only on completion, no spending on cancellation and FULL/empty messages. Cancel by firing, switching or tractor. Repeated presses and mixing 4/5 must not restart or overlap uses.
6. FILL GAME →PLAY →START for real eight-ship behavior. Observe resource-seeking, delayed healing and occasional threat-facing walls; bots should spend real finite resources and remain beatable. Deliberately approach opponents rather than expecting launch combat. With two PCs, share the room code/link, READY/START, verify matching wall positions/damage/removal, simultaneous pickup resolution, healing, death/drop totals and disconnect behavior.
7. Die during a heal and inspect exact drops; deployed walls should remain only until destroyed/expired. Replay without restarting the server and verify empty survival inventories/world/walls in the lobby, then fresh ACTIVE resources. Repeat leave/rejoin and play through the five-minute Horizon deadline.
8. Press F3 and record actual GPU FPS during loot-rich flight, active walls/healing and combat in Standard, then Low. Check HUD at 16:9, ultrawide and small windows. Software WebGL measurements cannot certify target Windows 60 FPS. Separate-device latency, subjective combat/economy balance and target-GPU performance remain manual acceptance.

## Delivery and remaining limits

Final browser results, performance samples and verified delivery SHA are reported with the completed commit. No test failure or software rendering limitation will be described as a pass. Wall/utility visuals are procedural, bounded and support both renderers; no placeholder gameplay or Phase 4 integration is included. Runtime services must restart in a fresh cloud task; reusable startup instructions were saved in an environment draft, which still needs review/save/publish in environment settings to activate for future environments.

Two targeted timing changes retain their assertions: the solar ACTIVE wait now derives from the actual 9.2-second cinematic plus two seconds for delivery/rendering instead of the stale 10-second limit. The solo browser test runs two complete real-time cinematics and scene recreations; diagnostics measured 30.1 seconds total, with the second input check starting at 28.8 seconds. Its previous 30-second whole-test deadline cut off normal input processing. The new whole-test budget derives from two actual cinematic durations plus 10 seconds per scene/interaction; each movement assertion still has its original five-second limit. Client ACTIVE readiness and foreground focus are checked before sending movement. No gameplay timing or damage assertion was relaxed.

## Cloud performance and retained test limitations

The full run observed a **334.3 ms SwiftShader flash**, exceeding the unchanged 300 ms assertion. [Raw overrun](docs/art-reference/p3s5/webgl-flash-overrun-full-run.json) is retained. Its recovery rerun passed; the established 250 ms configuration was not changed and the timing assertion was not widened. This cloud-rendering flake was already documented for P3S7.2. The solar readiness deadline and solo whole-test budget corrections above address actual 9.2-second cinematics plus scene delivery/creation; they do not weaken movement, duration, image/shader or sample-count assertions.

The complete browser run also exposed fixtures still using the old six-thousand-unit lobby center, unscaled environment camera anchors and the prior shorter ejection. Three-client capture now flushes each client's acknowledgment before the final manually stepped volatile snapshot. Continuous real servers keep publishing future snapshots normally; no networking delivery semantics were changed.

Short live-server render-cadence samples from the launch tests include actual spawning/collection of the new survival pool. They begin at the arrival-only 140 weapon/ammo snapshot, then the first normal ACTIVE tick seeds 74 utility pickups; bots may collect items during sampling. These samples are not an isolated before/after benchmark or target-GPU FPS guarantee:

| Renderer / mode / quality | Approximate RAF frames/s | Pool at end |
|---|---:|---:|
| Canvas / WAIT / Standard | 59.02 | 214 |
| Canvas / FILL / Low | 60.01 | 208 |
| SwiftShader / WAIT / Standard | 12.81 | 214 |
| SwiftShader / FILL / Low | 16.74 | 193 |

The 18,200-tick, eight-participant production-loop soak additionally asserts ≤24 walls, materials 0–300, cells 0–3, kits 0–2, finite coordinates, nonnegative ammo and bounded input queues across real Horizon-driven rounds. A separate real FILL launch test starts every bot with zero materials and observes all seven bots earning at least 40 through ordinary movement and shared auto-collection. Two regression tests first reproduced incorrect single-burst/high-rate pressure detection and then passed with deduplicated per-tick, full-window history.

Remaining manual acceptance: Windows hardware FPS, separate-device latency/loss, subjective resource economy/combat beatability, and long-session production bandwidth. The existing full-snapshot architecture is retained; extra pickup/wall state is bounded but adds payload. Automated correctness and tactical API boundaries support Phase 4 development; complete the Windows acceptance checklist before treating target-hardware performance/balance as approved. Phase 4 itself remains unimplemented.

The survival screenshot fixture also places uncollected materials, a Shield Cell and a Repair Kit nearby, outside pickup radius, so the captures verify all three distinct silhouettes alongside real carried counts. The final 4-test delivery run uses the documented solo budget; the earlier 45-second CLI run was diagnostic only. Survival controls and UI do not modify the existing focus-release behavior: an inventory pointer gesture neutralizes held input, and releasing/repressing movement resumes normally; the regression asserts continued flight and fresh key-up/down handling.

Final screenshot-fixture verification: **2/2 survival browser tests pass** after adding visible uncollected utility silhouettes. Final production build and server typecheck pass. No unresolved functional test failure remains after focused recovery; the intermittent software flash timing limitation remains documented.
