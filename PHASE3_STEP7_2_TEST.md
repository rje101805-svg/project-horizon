# P3S7.2 verification — long-distance launch and battle royale opening

Baseline: `e7e50300476a31c0db026e47edf10a2c1a31aeb1`, verified clean on `work` with matching `origin/work` before edits. No `main`, original asset bytes, weapon damage/aim tuning, planet radii/capture rules or Horizon damage/gravity/result rules changed. No P3S5 or Pages release.

## Root cause and geometry

The old 12,000-square map used a center circle of radius 2,155.828892: adjacent arrivals were only 1,650 units apart. No edge clamping caused this. The prior calculation used the largest nominal weapon range (1,100), but regular shots expire by lifetime and inherit ship velocity. Stationary blaster reach already exceeded 1,650. Conservatively including opening boost (440 units/s), full missile lifetime (3 seconds), muzzle (28) and splash (130), effective regular reach is **2,768**. Normal flight remains 290; boost remains 440. Required separation is max(3 × 2,768, 2 × 1,100) = **8,304**. Bots also immediately acquired the nearest enemy globally after collecting a second weapon, so distance alone could not fix the opening.

Four inset square corners plus four inner-diamond points achieve minimum separation sqrt(2−sqrt(3)) × usable side, approximately 0.517638 × side, exceeding the 0.5 achieved by perimeter/3-3-2 layouts. Placement maximizes subset separation for fewer participants; all eight simultaneous points pass planet/capture clearance and safe-bound checks. Server assignment is deterministic from room code, round and participant ID. Actual arrivals, not animation targets, are measured by `npx tsx scripts/landing-report.ts`.

| Quantity | Previous | Current |
|---|---:|---:|
| Width × height | 12,000 × 12,000 | 18,692 × 18,692 |
| Bounds | 20–11,980 | 20–18,672 |
| Diagonal | 16,970.562748 | 26,434.479908 |
| Per-axis scale | 1 | 1.557666667 |
| Minimum arrival gap | 1,650 | 8,304.458844 |
| Ejection duration | 2,000 ms | 3,000 ms |
| Protection after arrival | 2,000 ms | 5,000 ms |
| Initial weapons + ammo | 35 + 35 | 70 + 70 |

Inset 1,324.50873 preserves half-camera clearance and keeps all landing corners outside the Horizon's initial 0.05D radius plus unchanged 550-unit gravity band at 1:00. With that safe margin, 18,691 fails spacing; 18,692 is the smallest sufficient integer uniform enlargement and stays below the 24,000 limit. Enlarging further would conflict with the requested smallest enlargement. Map area ratio is 2.426325444; loot scaling caps at 2. Planet centers and existing decorative anchors scale from the map center; planet radii remain 825/735/975/470 and decoration counts do not increase. Starter guns at 140 units and matching ammo at 260 units reuse the pool. Mix remains 20 blaster/18 SMG/16 shotgun/10 Zapper/6 missile, unchanged rarity weights; 42 weapons use planet outskirts and 28 routes. Bounded total loot capacity scales to 320 to retain proportional drop headroom.

At maximum boost, even a stationary opponent requires over 12.5 seconds of intentional travel before the conservative normal-weapon reach closes, and over 16 seconds to enter bot awareness. These are distance/speed lower bounds, not promises of a combat-free minute: two approaching ships can meet faster, and Horizon pressure eventually forces contact.

## Actual eight-ship landing measurements

Zones are sorted by y then x, independent of shuffled participant identities. Full precision and planet centers are in [landing-measurements.json](docs/art-reference/p3s7_2/landing-measurements.json); [landing-layout.svg](docs/art-reference/p3s7_2/landing-layout.svg) plots the actual server arrivals.

| Zone | x | y |
|---|---:|---:|
| 1 | 1324.508730 | 1324.508730 |
| 2 | 17367.491270 | 1324.508730 |
| 3 | 9346.000000 | 3473.860838 |
| 4 | 3473.860838 | 9346.000000 |
| 5 | 15218.139162 | 9346.000000 |
| 6 | 9346.000000 | 15218.139162 |
| 7 | 1324.508730 | 17367.491270 |
| 8 | 17367.491270 | 17367.491270 |

All 28 measured pairwise distances:

| Pair | Distance |
|---|---:|
| 1–2 | 16042.982541 |
| 1–3 | 8304.458844 |
| 1–4 | 8304.458844 |
| 1–5 | 16042.982541 |
| 1–6 | 16042.982541 |
| 1–7 | 16042.982541 |
| 1–8 | 22688.203490 |
| 2–3 | 8304.458844 |
| 2–4 | 16042.982541 |
| 2–5 | 8304.458844 |
| 2–6 | 16042.982541 |
| 2–7 | 22688.203490 |
| 2–8 | 16042.982541 |
| 3–4 | 8304.458844 |
| 3–5 | 8304.458844 |
| 3–6 | 11744.278325 |
| 3–7 | 16042.982541 |
| 3–8 | 16042.982541 |
| 4–5 | 11744.278325 |
| 4–6 | 8304.458844 |
| 4–7 | 8304.458844 |
| 4–8 | 16042.982541 |
| 5–6 | 8304.458844 |
| 5–7 | 16042.982541 |
| 5–8 | 8304.458844 |
| 6–7 | 8304.458844 |
| 6–8 | 8304.458844 |
| 7–8 | 16042.982541 |

## Authority, cinematic and awareness

Countdown 3,000 ms, collapse 1,800 ms and orbit 1,400 ms remain unchanged; three-second smoothstep ejection puts ACTIVE at 9,200 ms after START. Shared `launchPose` supplies authoritative tick positions and launch-only render sampling, capped at 100 ms beyond the newest received snapshot. This avoids large 30 Hz correction jumps over the longer distance while ordinary prediction, input permissions and movement remain unchanged. The existing 150 ms peak +100 ms fade (250 ms total), trails, local camera follow and control locks remain intact.

Protection starts only at actual arrival, expires at arrival +5,000 ms, and successful weapon fire forfeits it immediately. Invalid/stale/empty/cooldown requests do not forfeit it. Existing combat validation and ordinary damage immunity remain server-owned. Reset/replay clears protection and attacker memory; join during locked launch remains prohibited.

Enemy acquisition, retention, weapon choice, aim and navigation require distance ≤1,100 or that specific enemy having actually damaged the bot within the preceding 5,000 ms. Blocked hits and misses grant no awareness. Losing awareness also clears the private aim target, so reacquisition requires the existing reaction delay. Entries expire and reset on replay. Loot/capture/Horizon escape navigation still uses world objectives. P3S7.1 reaction, switch delay, bounded turn, distance/speed error and relative velocity lead values stay unchanged. Nearby enemies still fight normally.

Horizon diagonal follows actual bounds. Calm ends at 60 seconds; continuous 0.05D→0.85D growth runs through 270 seconds; exact 255-second warning and 270–300 final countdown remain. At 300 seconds, 1.05D covers every map corner. Existing independent DPS 10/15/25/50 boundaries, 550-unit gravity band, maximum gravity 913.5, 240-unit core, alien immunity, last-consumption ranking and HP/draw ties remain covered by regression tests.

## Verification

`npm run test:server`: **387/387 pass**, no skips. Client `npm run build` and server `npm run build:server` pass; Vite retains the pre-existing large-bundle advisory. No new dependencies. **12/12 relevant Playwright tests pass in one final invocation** (2.5 minutes), no skips or unresolved timeouts:

```powershell
npx playwright test tests/pacing-launch.spec.ts tests/horizon.spec.ts tests/menu-lobby.spec.ts tests/solar-world.spec.ts tests/pickup-movement.spec.ts --workers=1
```

This is the requested relevant browser set, not a claim that every historical Playwright spec was rerun. It covers Canvas and SwiftShader WebGL, Standard WAIT and Low FILL launch/pickup/performance, Standard multiplayer Horizon/deadline/replay, menu/READY flows, both pickup movement/focus regressions and expanded planet/camera bounds. Node geometry/protection/awareness tests include all 28 actual pairs, starter accessibility, minimum world sizing, deterministic replay assignment, expired/blocked attacker awareness and shared trajectory arrival. Existing combat/inventory/multiplayer assertions are retained; old 8.2-second, two-second, 35-pickup and fixed map-center fixtures now use the new behavior.

## Windows manual acceptance

1. In PowerShell at the repository: `git switch work`, `git pull --ff-only origin work`, then `npm ci` (Node ≥22.12). In terminal one run `npm run server`; in terminal two run `npm run dev`. Open `http://localhost:5173`; if the server field is shown, use `http://localhost:3001`.
2. Select WAIT, click PLAY, then START alone. Observe countdown, inward collapse, brief flash and three seconds of visible outward travel. The ship stays in view, lands at its assigned region, and controls unlock. Move with WASD, hold Shift to boost, approach starter loot and press F. Continue moving, switch slots with 1/2/3, and pick up another gun. Confirm five-second SPAWN PROTECTED status; fire early in a fresh round and confirm protection ends.
3. Leave, select FILL GAME, click PLAY then START. Confirm exactly eight ships, widely separated arrivals, no immediate incoming fire and bots looting/positioning instead of tracking your distant location. Deliberately travel to locate opponents; verify nearby combat, shield/damage, ammo and inventory controls normally. Join a friend's room code/link, READY and START for a real multi-device check.
4. Press F3 and select Standard. Record the FPS overlay during lobby, long launch, landing with loot, all four planets, exploration and combat. Repeat in Low. Check camera/world edges and map/minimap positions, ship labels and projectiles against planet surfaces, unchanged planet sizing, loot icons, no new visual clutter and no prolonged blackout. Hardware FPS, game balance and separate-device latency acceptance are manual and must be measured on the target Windows GPU.
5. Play the complete five minutes: calm through 1:00, expanding Horizon, FINAL COLLAPSE IN 15 at 4:15, final countdown at 4:30 and full coverage/result at 5:00. Leave/replay and repeat WAIT/FILL; verify no ghost ships, duplicated loot/protection or stale countdowns.

## Browser captures and performance evidence

| Renderer / quality | Longer travel | Actual landing / starter loot |
|---|---|---|
| Canvas Standard / WAIT | [mid-travel](docs/art-reference/p3s7_2/canvas-wait-mid-travel.png) | [landed](docs/art-reference/p3s7_2/canvas-wait-landed.png) |
| Canvas Low / FILL | [mid-travel](docs/art-reference/p3s7_2/canvas-fill-mid-travel.png) | [landed](docs/art-reference/p3s7_2/canvas-fill-landed.png) |
| Software WebGL Standard / WAIT | [mid-travel](docs/art-reference/p3s7_2/webgl-wait-mid-travel.png) | [landed](docs/art-reference/p3s7_2/webgl-wait-landed.png) |
| Software WebGL Low / FILL | [mid-travel](docs/art-reference/p3s7_2/webgl-fill-mid-travel.png) | [landed](docs/art-reference/p3s7_2/webgl-fill-landed.png) |

These captures were inspected for visible local ships, camera follow, readable labels, loot and HUD. The same directory includes departure, arrival, flash, successful F pickup and final-warning/collapse captures. Browser geometry checks use actual arrivals and all 28 FILL pairs; WAIT remains one human with no bots. Existing two-client checks cover invitation/readiness, server-owned positions, planet/camera bounds, replay and cleanup. Keyboard and inventory-focus pickup regressions both pass.

An earlier real-time SwiftShader flash sample observed **312.5 ms**, exceeding the existing ≤300 ms assertion. [Raw overrun](docs/art-reference/p3s7_2/webgl-flash-overrun-observed.json) is retained; subsequent observations passed. Config remains 250 ms (150 peak +100 fade); slow software frames can skip the fade or delay its observation. Assertions and test timeouts were not relaxed. This is a known cloud-rendering timing variability, not a real-GPU timing guarantee.

Earlier development runs also exposed test-fixture synchronization failures: a Vite reload during verification, stopping manual snapshots while awaiting movement, checking movement against a timestamp passed during live FPS sampling, and publishing a joined client's first snapshot before its scene loaded. Corrections wait for scene/connection readiness, flush socket acknowledgments, supply fresh authoritative frames and advance relative to current simulation time. No gameplay checks were removed.

Performance samples use 60 requestAnimationFrame intervals with the actual server stepping at its normal cadence during sampling, beginning with 140 world pickups; FILL bots can collect loot during that interval. These are short cloud frame-cadence measurements, not a five-minute benchmark, isolated before/after comparison or hardware acceptance. Real Windows GPU FPS and multi-device latency/balance testing remain pending.

Final cloud frame-cadence samples:

| Renderer / mode / quality | Approx. RAF frames/s | p95 interval ms | Loot start → end |
|---|---:|---:|---:|
| Canvas / WAIT / Standard | 57.15 | 33.30 | 140 → 140 |
| Canvas / FILL / Low | 60.00 | 16.70 | 140 → 133 |
| SwiftShader / WAIT / Standard | 13.24 | 116.70 | 140 → 140 |
| SwiftShader / FILL / Low | 18.09 | 116.60 | 140 → 133 |

Final real-time flash observations: Canvas **267.6 ms**, SwiftShader **274.5 ms**, both within the unchanged 150–300 ms assertion. The previously observed 312.5 ms software overrun remains a documented intermittent limitation. Software WebGL has material frame stalls; no target-hardware 60 FPS or multi-device acceptance is claimed. Raw intervals and flash samples accompany the screenshots.
