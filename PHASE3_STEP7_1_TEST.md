# P3S7.1 — pacing, bot aim and visible launch

Baseline: `c02d2a7069d99a85fd9ea09191cdc551a0f86eb6`, verified clean local `work` and fetched `origin/work` before changes. This step supersedes P3S7's growth/damage table. No subsequent roadmap work is included.

## Launch and flash root causes

P3S7 extended LAUNCH from 1,400 to 3,400 ms, but the client flash still used `phaseRemainingMs > 1150`. This hid 2,250 ms of launch plus the preceding 240 ms of collapse. The cinematic camera stayed at the center while destinations were 2,155.83 units away, so ships left the viewport before controls unlocked. Trails also appeared only after ACTIVE.

The existing authoritative state machine remains: countdown 3,000 ms, collapse 1,800 ms, orbit 1,400 ms, outward travel 2,000 ms, then ACTIVE with 2,000 ms launch protection. The orbit finishes facing the assigned radial path (one full turn). Ejection starts at radius 150 and uses `t²(3−2t)` to accelerate and decelerate continuously to the unchanged destination; positions are assigned every existing server tick. During LAUNCH the camera follows the local cinematic ship. Standard trails now render during outward travel; Low retains the actual ship motion. Input/combat permission stays disabled until ACTIVE.

There is one white overlay. `CinematicFlash` uses the synchronized phase timestamp, 150 ms peak and 100 ms fade, finishing at 250 ms. Monotonic render time prevents missing snapshots from holding or restarting the overlay. A bounded CSS animation also fades the overlay independently of Phaser update cadence. During the fully opaque peak, the camera does not submit a hidden WebGL pass; rendering resumes as the fade reveals the game. Late phase snapshots skip an expired flash. Phase/round identity prevents duplicates and permits replay.

Sequential browser captures in `docs/art-reference/p3s7_1/` cover Canvas and WebGL, WAIT and FILL: collapse, flash, departure, mid-travel, arrival and final warning. WAIT uses Standard; FILL uses Low. Browser assertions verify the rendered local ship stays in the viewport and moves through increasing radii, controls remain locked, destination/loot/protection stay correct, and another launch works after replay. Screenshot stepping uses a test-owned server clock; it is not a real-time recording.

## Horizon schedule and physical units

`D = hypot(WORLD, WORLD) = hypot(12000,12000) = 16970.56274847714` world units: corner-to-opposite-corner diagonal. Timing is elapsed authoritative simulation time from ACTIVE, rounded to microseconds to avoid floating-point deadline drift.

| Time | Radius |
| --- | --- |
| Before 60,000 ms | 0 |
| 60,000 through 270,000 ms | `D × (.05 + .8 × (elapsed−60000)/210000)` |
| 270,000 through 300,000 ms | `D × (.85 + .2 × (elapsed−270000)/30000)` |
| At/after 300,000 ms | `1.05D` and existing deadline resolution |

Ordinary growth is about 64.65 units/s; announced final growth about 113.14 units/s. There are no holds or discontinuities after the initial 0.05D spawn. DPS is independent of radius: 10 from 1:00, 15 from 2:30, 25 from 3:30, 50 from 4:30. At 4:15 the top-center warning reads exactly **FINAL COLLAPSE IN 15**, then counts down. At 4:30 it switches to a prominent **FINAL COLLAPSE · 0:30** countdown for the final thirty seconds. Current-tick consumption ordering, hull+shield tie-breaks, earlier-casualty exclusion, placement and normal multiplayer result logic remain unchanged.

Gravity band = `0.5 × DEFAULT_CAMERA_WIDTH = 0.5 × 1100 = 550` world units. Normal thrust acceleration = `NORMAL_SPEED × RESPONSE = 290 × 7 = 2030` units/s²; maximum Horizon pull = 45% = **913.5 units/s²**. Existing linear distance falloff ramps smoothly from zero at the outer influence edge to this cap at the danger boundary. No pull applies outside the band. Ordinary thrust and boost can overcome it; alien immunity remains.

Danger presentation uses an opaque dark disk, wider warm inner boundary and bright cream outer line, bounded animated arcs in Standard, existing near-edge/damage vignette and safe-direction cues. Consumption notices sit below the danger cues so they cannot cover the large final warning. Low keeps contrasting boundary rings and warnings. No giant shader surface, bloom, emitter, second game loop or effect covering ships/projectiles was added. Bots now predict the boundary ten seconds ahead instead of treating the entire future growth endpoint as currently dangerous; loot priorities, movement and HP are unchanged.

## Bot perception and actual hit measurements

Per-bot private seeded state is tied to life/teleport identity. First target delay is uniform 250–450 ms; direct switches 300–600 ms. Heading turns remain capped at 180°/s. Perception corrections occur every 160–340 ms. Angular error is uniform within `±(.06 + distance × .00009 + targetSpeed × .00016)` radians. Lead is target velocity relative to the bot (projectiles inherit the firing ship velocity), times travel estimate, multiplied by uniform 0.7–1.3. No collision/hit chance override exists. Movement, loot, HP, weapon values, cooldowns, reloads, tractor escape and Horizon survival retain their existing paths.

Reproduce with `npx tsx scripts/bot-accuracy.ts`. Each row aggregates four seeds (17,29,41,53), 400 accepted shots each. Harness fixes the bot at (6000,6000), places target 500 units horizontally away and strafes it across ±500 vertically using a triangular path. Actual separation varies 500–707.11; stationary target is exactly 500 away. Target speeds are 290 (normal) and 440 (boost) units/s. Turns are controlled direction reversals, not full inertial human input simulation. Navigation and target combat are isolated. Health/shields restore between ticks and reserve is supplied for long measurements; production magazine, cooldown/reload, aim and projectile geometry/damage registration execute unchanged. Hits are actual accepted server collision receipts, not projected aim overlap. SMG's 600-unit range limits when it fires; weapon results must not be averaged together. These are tuning benchmarks, not guarantees for every human tactic/weapon.

| Weapon | Target speed | Accepted shots | Registered hits | Hit rate |
| --- | ---: | ---: | ---: | ---: |
| Blaster | 0 | 1600 | 1008 | 63.00% |
| Blaster | 290 | 1600 | 560 | 35.00% |
| Blaster | 440 | 1600 | 463 | 28.94% |
| Ion SMG | 0 | 1600 | 1001 | 62.56% |
| Ion SMG | 290 | 1600 | 665 | 41.56% |
| Ion SMG | 440 | 1600 | 585 | 36.56% |
| Zapper | 0 | 1600 | 1016 | 63.50% |
| Zapper | 290 | 1600 | 532 | 33.25% |
| Zapper | 440 | 1600 | 381 | 23.81% |

Blaster meets the specified primary tuning bands. SMG moving accuracy remains above, and boosting Zapper below, the target band; recorded separately for manual balance review. Shotgun, missile and Galaxy weapons are not accuracy-benchmarked here; their existing weapon tests still verify legal firing/stats. No weapon damage was reduced.

## Presentation and regression evidence

The explicit `COLLAPSE` cinematic text has been removed. No replacement consumption explanation was added. The required final-collapse warning remains. Death/alien/spectator/results logic and consumption damage attribution remain untouched. Browser checks confirm no collapse text in elimination presentation and the final warning still renders.

Legacy weapon integration tests now establish settled perception before first-shot assertions; their exact ammo, damage, status and projectile assertions remain. Separate new tests exercise first acquisition, switches, bounded turning, lead limits and accuracy. Existing Horizon tests assert the replacement schedule and damage thresholds, preserve winner/core/deadline tests, and use a boundary position appropriate to the narrower band. A new browser fixture waits for connection and rendered frames rather than reading before scene initialization or before the camera pre-render pass.

Final verification:

- Full Node: **382 passed**, zero failures/skips (`/tmp/p3s71-node-final2.log`).
- Full Playwright run 1: **65/67 passed** (`/tmp/p3s71-browser-full.log`). The gravity fixture inverted the superseded staged curve; the ship-art fixture timed out waiting for a volatile snapshot after reliable membership updates. Corrected curve inversion and per-connected-peer bounded probe barriers preserve the original 45/30-second deadlines and assertions.
- **12/12** affected browser checks passed after those corrections, including bots, objectives, launch, warning layout, replay and real-time flash (`/tmp/p3s71-browser-corrections.log`).
- Full Playwright run 2: **65/67 passed** (`/tmp/p3s71-browser-final.log`). All P3S7.1 checks and both earlier failing cases passed. The lobby movement fixture advanced 400 ms of simulation before waiting for the browser's W command to arrive; it now awaits actual pending/accepted input. The pickup fixture now awaits rendered ACTIVE/scene readiness before keydown; its cleanup also checks button visibility to avoid masking an earlier error with a hidden-button timeout.
- Final menu/pickup checks: **15/15 passed**, three repetitions of all five cases (`/tmp/p3s71-fixture-repeat.log`). Final Canvas/WebGL Horizon boundary/consumption/replay checks: **2/2 passed** (`/tmp/p3s71-boundary-final.log`). All 67 unique browser cases passed across the final full run and corrected-case reruns. **A single fully green full-suite invocation was not obtained**; the two full-run failures above are reported rather than relabeled as success. No assertion, test deadline or test coverage was reduced, and no known case remains failing after its correction.
- Client production build and server TypeScript checks passed (`/tmp/p3s71-build-delivery.log`, `/tmp/p3s71-types-final3.log`). Existing large-chunk advisory remains.
- Actual real-time browser sampling observed the first clear frame after **272.20 ms Canvas** and **266.10 ms software WebGL**; both meet the unchanged 150–300 ms assertion. Configured flash remains 250 ms. Frame cadence makes these sampled visible windows coarser than compositor animation timing. Raw samples, stepped-clock timing records and launch/boundary captures are committed in `docs/art-reference/p3s7_1/`.

Earlier software-WebGL flash samples exceeded the target (306/395 ms) before eliminating the hidden opaque-peak WebGL pass; those failures were investigated, not accepted by widening the bound. Initial new capture fixtures also exposed scene-startup and pre-render synchronization races; explicit readiness/render-frame waits corrected them. Full-suite cloud timing reliability remains a limitation despite the passing corrected-case repetitions. No real-GPU FPS or separate-device acceptance is claimed.

## Windows manual acceptance

1. In PowerShell at the repository root, run `git switch work`, `git pull --ff-only origin work`, then `npm ci`. Use Node 22.12 or newer.
2. First terminal: `npm run server`. Second terminal: `npm run dev`. Open the Vite URL (normally `http://localhost:5173/`), use `http://localhost:3001` as server URL if asked. For DEV room controls append `?devrooms=1`.
3. Choose WAIT, click PLAY and START alone. Observe countdown, inward collapse, brief flash, center departure, visible outward travel and arrival. Controls unlock after approximately 8.2 seconds; fly with WASD, boost with Shift, aim/fire with mouse/Space, pick up the nearby gun with F, switch 1/2/3 and drop with G. The solo round must continue.
4. Return to menu. Choose FILL GAME, PLAY, START; verify eight ships launch, nearby gun/ammo, two-second protection, working inventory, and bots loot before normal combat. Compare stationary firing with strafe/boost dodging; bots should miss believable shots. Repeat with a friend joining the five-character code/link, READY and host START.
5. Press F3, select Standard, note renderer and FPS on your real GPU. Repeat in Low, and test Canvas using a separate Edge profile: `& "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe" --disable-webgl --user-data-dir="$env:TEMP\horizon-canvas-test" "http://localhost:5173/"`. The game automatically falls back to Canvas when WebGL is disabled. Confirm the boundary and projectiles stay readable in combat. Record real hardware, resolution, mode and observed FPS; cloud measurements are not GPU acceptance.
6. From ACTIVE, check calm through 0:59, small Horizon spawn at 1:00, smooth ongoing growth, the narrow pull near the bright edge, resistance with normal thrust, shield-first damage, consumed planet/loot removal, and **FINAL COLLAPSE IN 15** at 4:15. The five-minute deadline must resolve any remaining ships using current-tick hull+shield ties. Avoid normal elimination if you want to observe the whole deadline in multiplayer; solo WAIT is convenient for this.
7. Verify consumption has no unwanted Collapse label, alien/spectator transitions and result still work. PLAY AGAIN returns to a fresh lobby; START again must replay one flash and one full outward launch. Repeat a FILL guest departure/rejoin, public READY flow and menu leave/rejoin.

Hardware FPS, separate-device networking, subjective danger readability and player-versus-bot balance remain manual acceptance. Existing finite loot caps/TTL, silent cinematic audio hooks and separate tracked Pages release process remain unchanged. Stop at P3S7.1; owner acceptance is required before P3S5.
