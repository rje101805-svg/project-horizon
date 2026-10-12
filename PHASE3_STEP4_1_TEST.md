# P3S4.1 — World loot, inventory and planet Galaxy weapons

Branch `work`, starting from P3S4 `2bf1821c14201aa5491f4621a8f541c246ddeed2`. Original regular damage, rate, reload, magazine, ammo ownership, ordinary flight, tractor, planet/capture geometry, environment and Horizon remain accepted. Human ships and bots now have 100 hull +100 shield. Eliminated aliens retain their existing 40 HP/zero shield lifecycle.

## Root causes and fixes

The primary loot bug was lifecycle initialization: `startMatch` called `resetLoot(room)` without `spawn=true`. The match therefore started with **zero** regular loot, then the five-second replenisher added one resource at a time. The isolated P3S4 population test explicitly called `resetLoot(room,true)` and missed this integration defect. P3S4.1 tests inspect the actual start path with eight participants and real browser snapshots.

Other contributors were uniform random placement across a 12000-unit map, 20 small procedural pickups, a 45-unit radius, automatic empty-slot collection, and an F prompt restricted to full inventories. Capture is not a dependency of regular loot. Render order was already above planet/background art; it was audited and retained. Processed PNG pickups now measure 68 world units across, bob gently over rarity rings, and appear as minimap dots. World loot depth is 4.4/4.6, Galaxy loot/equipment 4.5/4.7; backgrounds/planets remain below zero. Offscreen culling, persistent graphics, pooled images and 16 reusable labels keep the work bounded.

Browser testing also exposed Phaser's window mouse-down handling during native inventory drags. Firing/aiming now require a press/event that originated on the canvas. Inventory mouse/keyboard/wheel events stop propagation and release held input; focus in inventory suspends flight/combat input. Teardown removes UI/document handlers and only the current UI owner can clear the shared HUD during scene restarts.

## Initial distribution and lifecycle

Each playable match starts immediately with **35 regular weapons +35 ammo pickups** before any capture:

| Class | Weapons | Magazine | First-collection reserve |
|---|---:|---:|---:|
| Blaster | 10 | 30 | 60 |
| Ion SMG | 9 | 40 | 80 |
| Nova Shotgun | 8 | 6 | 12 |
| Zapper | 5 | 12 | 24 |
| Missile Launcher | 3 | 3 | 6 |

Counts exclude starting Blasters, player drops and Galaxy rewards. Classes are shuffled over 21 planet-outskirt positions (6 Borealis, 5 each other planet) and 14 open-space travel-route positions. Each independent rarity roll uses Common60% /Rare30% /Legendary10%; no guaranteed per-match rarity quotas. All four planets receive loot. Ammo is preferably placed 190–370 units from weapons, with matching ammo types and safe-position fallback. Spacing≥180, player clearance220, planet clearance beyond1.15radius+80, Horizon influence+250 and world-edge margins are mandatory for initial/replenished world loot.

One missing world resource replenishes at most every5000ms of simulation time; no instant restoration after pickup. Ordinary drops try24 nearby positions with80-unit separation so stationary G/click/drag drops do not stack their PNGs. At extreme crowding a forced drop retains its resource even if it must overlap. The existing160 regular-pickup cap and120-second drop TTL remain finite destruction limits. Reset removes old IDs/history/drops in the waiting lobby; the next explicit START MATCH recreates35+35. Late joiners receive the same current loot snapshots; active late joiners remain OUT spectators until next round.

## F, G and interactive inventory

- **F** picks up the highlighted nearest eligible regular or Galaxy weapon. No automatic human weapon collection remains. Empty regular slots receive the weapon; full slots replace the active weapon and drop that exact instance. Reload is canceled on a successful pickup/swap. No separate unequip action exists.
- Normal pickup radius130 units. Server remembers actual proximity each simulation tick and on an intent; after leaving range, eligibility lasts **250ms**, only within a bounded250-unit padded radius. The client keeps the last prompt through the same snapshot-time interval. No client timestamp/position is accepted. Life/teleport/round changes clear remembered proximity. Recent eligibility cannot revive a missing pickup.
- A250ms simulation pickup/swap debounce, monotonic retired request sequence, inventory revision, room membership/session, round/life/teleport validation and atomic removal prevent replay/duplicate claims. At30Hz, eligibility boundaries are sampled in33.3ms steps. Dropped items block their original owner for750ms to prevent immediate recollection; other eligible ships may claim them.
- **G** drops the current regular or Galaxy equipment on a non-repeated keydown. Click **DROP** works for any occupied slot. Reserve ammunition stays player-owned when dropping one regular gun. A remaining gun becomes active; dropping all guns naturally leaves an empty inventory and both server/client prevent firing.
- **1/2/3**, canvas mouse wheel or clicking another occupied slot equip it. Clicking the selected slot does nothing. Clicking does not shoot or activate E. **R** remains reload; **E** remains tractor.
- Native HTML drag between regular slots swaps their positions while preserving the selected weapon identity, IDs, rarity, magazine and any valid reload target. Drag outside inventory requests a drop. Galaxy equipment has one exclusive slot: dragging outside drops it; moving it into a regular slot is intentionally inapplicable.
- HUD slots display PNG, name/rarity, actual magazine/reserve, active marker and DROP. F prompt uses white/blue/**purple** rarity ink. Galaxy framing is gold/cosmic with planet accent. Text/glyph fallback remains available if a processed image fails.

## Ammo conservation and durability

A newly generated weapon carries a full magazine and an unconsumed grant. First legitimate collection consumes its two-magazine reserve grant exactly once, capped by the existing reserve limits; overflow is forfeited. Magazine belongs to its weapon instance; reserves belong to the player by ammo type. Drops/reorders/swaps preserve magazine and grantConsumed. Reload transfers finite compatible reserves. Automatic ammo pickup transfers only available capacity and leaves the finite remainder in the world.

Death, disconnect and acquiring a Galaxy gun use existing exact-quantity regular weapon/reserve drops. Galaxy collection empties all regular slots/reserves; Galaxy drop/death/recollection retains its original reward ID and type and cannot mint ammunition. Initial Common Blaster grant is already consumed. OUT reconnects cannot farm starting resources. Human maxShield is centralized at100; regular damage scaling remains the P3S4 constant1.5, **not rescaled for200 effective HP**.

| Regular class | Common /Rare /Legendary damage | Rate/s | Reload ms |
|---|---|---:|---:|
| Blaster |40.5 /45 /51|5.5|2300|
| Nova Shotgun (all5pellets)|108 /127.5 /157.5|0.7|4000|
| Missile Launcher (direct)|82.5 /97.5 /112.5|0.75|3000|
| Ion SMG|18 /21 /25.5|11|2200|
| Zapper|22.5 /27 /31.5|1.25|2500|

Shotgun falloff, regular missile splash and Zapper500ms stun/1500ms immunity are preserved. The old150-EHP lethal fixtures now use200, and shield-first assertions account for100 starting shields; regular projectile damage assertions remain exact.

## Nine untouched originals and optimized assets

The originals already have genuine0–255 alpha with no opaque external black background. Derivatives crop only transparent bounds and downsample proportionally to≤480×240 using Lanczos, then losslessly optimize PNG storage. Dark weapon pixels are never color-keyed. Original filenames/bytes remain untouched. The nine runtime PNGs total1,341,426bytes, with individual files117,392–178,396bytes. No generated replacement artwork is used.

Central mapping: `src/weapon-assets.ts`, keyed by existing stable regular IDs and four Galaxy IDs. Preload happens once; bounded sprite pools reuse Phaser images in both renderers. UI uses the same asset mapping with object-fit containment. `public/assets/weapons/processed/manifest.json` records original SHA256, original/runtime dimensions, runtime size and actual alpha range. All nine derivatives decode with alpha0–255. Reproduction: `python scripts/process-weapon-assets.py` with Pillow installed.

| Original under `public/assets/weapons/` | Runtime under `processed/` |
|---|---|
|regular/Futuristic Blue-Glow Sci-Fi Rifle.png|regular/blaster.png|
|regular/Futuristic Orange-Glow Heavy Shotgun.png|regular/nova-shotgun.png|
|regular/Futuristic Red-Armored Rocket Launcher.png|regular/missile-launcher.png|
|regular/Neon Green Futuristic SMG Render.png|regular/ion-smg.png|
|regular/Futuristic Blue-Energy Zapper Rifle.png|regular/zapper.png|
|galaxy/Frostbound Cryo Energy Cannon.png|galaxy/cryo-stream.png|
|galaxy/Inferno Cinder Plasma Cannon.png|galaxy/inferno-cannon.png|
|galaxy/Futuristic Quad-Missile Launcher Render.png|galaxy/lunar-seeker.png|
|galaxy/Futuristic Blue-Energy Minigun.png|galaxy/titan-minigun.png|

## Four planet-exclusive Galaxy configurations

Capture requirements remain10seconds,2× outside decay, contesting and once-per-participant-per-planet per round. Only successful captures create new Galaxy IDs. Human claims now use F; bots call the same trusted pickup/collection boundaries. Internal `goldGunId` and historical GOLD_GUN_AVAILABLE protocol names remain compatibility identifiers; live equipment carries a replicated `galaxyType` and no generic Gold weapon is awarded.

| Planet | Galaxy | Absolute damage/rate | Server behavior |
|---|---|---|---|
|Borealis|Cryo Stream|13 at16/s =208 DPS|30% reduction in normal/boost target movement speed;600ms refresh-only slow, not stun. Cyan-white stream/impact and frost ring.|
|Cinder|Inferno Cannon|45 at4/s =180 direct DPS|10 DPS burn for2000ms, each hit refreshes one duration/source, never stacks. Orange plasma, impact and burning ring.|
|Ashen|Lunar Seeker|90 at2/s; splash≤45|Forward60° cone acquires nearest eligible enemy within1500; turn≤1.1rad/s. Direct target excluded from130-radius linear splash; owner excluded. Dodgeable guided missiles with lavender trails/explosions. The initial guidance heading uses actual inherited velocity, so boosted launches cannot instantly snap; range clips the final swept segment.|
|Pelagia|Titan Minigun|24 at10/s full spin =240 DPS|750ms spin-up from25% to100% cadence,500ms spin-down. Held trigger expires after300ms without refresh. Sustained spread grows .012→.13rad over2000ms; decreases on release. Blue rapid fire plus spin% cue.|

Ranges/speeds/lifetimes: Cryo700/950/.75s; Inferno600/680/.9s; Lunar1800/520/3.5s; Titan750/900/.85s. Projectile cap48 per Galaxy owner. Swept ship/Horizon/world collisions stay authoritative; planets remain noncolliding as before. Tick-quantized fractional cooldown retains configured sustained rates and denies same-tick spam. Titan trigger contains only held intent and strict membership/round/life/sequence markers; client cannot supply spin/spread/damage. Burn uses the existing simulation tick, including copied owner attribution after departure, without timers. Lethal damage/respawn/reset clear statuses and spin.

Bots retain normal hands/flight, finite regular reloads, imperfect aim, capture rules, and reactive tractor escape. They deliberately claim nearby empty-slot pickups, prefer useful rarity/range upgrades, and use class-specific Galaxy range/trigger behavior. Guidance is the same for bots and humans; no special damage, input or status privileges exist.

## Automated verification and screenshots

Final checks on the completed source:

| Check | Result |
|---|---|
|`npm run test:server`|**322 passed,0 failed,0 skipped**,8.4s. All287 prior tests retained with explicit balance/interaction fixture updates;35 added checks.|
|Full `npx playwright test --workers=1`|**51 passed,1 bot reset fixture failed**,11.2minutes. Full52-scenario suite ran, including unchanged four-planet test46.7s, Canvas/WebGL shaders and all latency regressions.|
|Final targeted `tests/bots.spec.ts tests/arsenal.spec.ts tests/galaxy-assets.spec.ts --workers=1`|**6 passed**,1.5minutes, including the corrected bot fixture in normal and150ms/jitter modes plus both renderers after final Lunar/range/drop corrections. **All52 distinct scenarios verified across full run and targeted retests; no unresolved failure/timeout.**|
|`npm run build`|Passed client/shared/server/test typecheck and production build. Existing Vite chunk-size advisory remains.|
|`npm run build:server`|Passed.|
|`git diff --check`|Passed.|
|Original assets/regular configuration audit|All47 prior public files byte-identical to baseline; all regular weapon definitions byte-identical.9 derivatives fully decoded, alpha0–255.|

Do not interpret this as52passing in one uninterrupted browser invocation. The first parallel full run had40passes/12failures: watched-file edits caused Vite navigation interruptions, outdated shield expectations failed, and software rendering exceeded an unchanged remote-motion bound. Those were corrected/rechecked with stable source and one worker. The subsequent full serial run passed51; the remaining bot fixture verified server waiting but stopped manual ticks before clients received a reset snapshot displaced by reliable membership traffic. Its fix flushes transport, then sends a fresh volatile snapshot before client assertions, with one extra tick for floating-point deadline sampling. Ship recreation now waits for all8loaded textures rather than treating canvas insertion as load completion. Assertions remain exact; no existing timeouts, motion bounds or shader checks were weakened, skipped or suppressed.

Browser coverage includes actual F/G edges and repeats, wheel, click equip/drop, native regular drag reorder/drop, Galaxy G/click/drag drop/F recovery, no UI shooting/tractor, safe empty inventory, all nine loaded images, actual35+35 match start before capture, four Galaxy firing and Standard/Low GL-error checks. Node coverage includes15 deterministic distribution seeds, all four planet reward mappings/identity, duplicate/stale/distant/teleported claims, exact ammo conservation, refresh-only statuses, homing turn/evasion/splash including boosted-launch heading, final-segment range bounds, absolute damage, sustained cadence, Titan trigger/spread, same bot damage/effect rules, shield restoration and separated stationary drops.

Logs remain local in `/tmp/p3s41-node-completion.log`, `/tmp/p3s41-browser-final.log`, `/tmp/p3s41-browser-completion.log`, `/tmp/p3s41-build-completion.log` and `/tmp/p3s41-typecheck-completion.log`.

Captures are in `docs/art-reference/p3s41/`: renderer-prefixed initial-loot, regular inventory/F prompt, nine-pngs, dropped, cryo/inferno/lunar/titan-firing, standard/low-pngs. Initial-loot captures use real randomized server world positions; the nine-PNG/firing comparison places existing resources in a compact trusted test fixture to inspect every asset, not to demonstrate natural loot density. These screenshots are reference artifacts, not a Pages rebuild.

## Known limits and manual acceptance

- Cloud Chromium Canvas and SwiftShader are software-rendered. No real-GPU60FPS or separate-device verification is claimed.
- Planet interiors remain decorative/noncolliding; core flight/Horizon/capture systems are untouched. Initial/replenished world loot is excluded from planets and the Horizon influence region. Death-location drops can still land in dangerous/unrecoverable locations through the retained death/drop contract.
- Finite world cap/TTL can destroy old drops under pressure. Galaxy objective pickups retain the existing objective lifecycle rather than the regular-loot TTL.
- At30Hz,750ms Titan full spin arrives on the23rd tick;600ms slow is18ticks. Slow changes target movement speed through the accepted inertia response, so velocity transitions smoothly rather than teleporting. Burn damage is tick-distributed and may have fractional shield/HP; HUD rounds presentation only.
- Extremely high latency can outlast the250ms pickup window; bounded distance and lifecycle checks intentionally refuse stale intents. Requests awaiting a fresh inventory revision can also be refused rather than applied to changed slots.
- Bots remain reactive controllers, not obstacle pathfinding. Individual rarity rolls do not guarantee every tier per match.
- The existing hit-number UI deduplicates receipts per projectile, so a missile's extra splash recipients may lack separate damage numbers; actual server splash damages every eligible target correctly.
- No P3S5 systems, Pages/server deployment configuration, asset replacement generation, or real-hardware balance acceptance are included.

## Exact Windows local test instructions

Install Node22.12+ and use two PowerShell windows at your repository root. Preserve local changes; do not reset them.

```powershell
git status --short
git branch --show-current  # must be work; stop if another branch or unexpected local edits
git fetch origin work
git pull --ff-only origin work
npm ci
```

Terminal A starts the current authoritative server (stop an older process using3001 first):

```powershell
$env:PORT = "3001"
$env:CLIENT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
npm run server
```

Terminal B starts Vite:

```powershell
npm run dev -- --port 5173 --strictPort
```

1. Open `http://localhost:5173` in hardware-accelerated Chrome/Edge. Enter server URL `http://localhost:3001`, enter a name and CREATE ROOM. Click **FILL GAME**, confirm8/8, then **START MATCH**. Every participant starts with Common Blaster30/30 +reserve60 and100hull/100shield. Loot/minimap dots appear immediately; do not capture a planet first.
2. Fly along the four planet outskirts and between planets with WASD/arrows and Shift boost. Find multiple PNG guns and green ammo packs. Legendary is **purple**, Rare blue, Common gray/white. Stay outside the Horizon. Ammo flies into compatible reserves automatically; guns wait for F. At boost speed cross a gun and press F just after passing it; the prompt briefly remains. Far/stale F must do nothing. Fill all3slots, use1/2/3/wheel, then F-swap and verify the replaced gun appears with its actual magazine.
3. Fire some rounds (hold left mouse/Space; Zapper is discrete presses). R reload uses finite reserve. Press/hold **G**: only the equipped gun drops once. Verify its remaining magazine after waiting750ms and collecting with F. Reserve does not refill. Click other slots to equip; click the equipped slot and verify no unequip. Click DROP, drag between slots, then drag outside to drop. UI interaction must not fire, steer or activate E. Drop all guns; firing must stop without crashing.
4. Hold a planet's capture ring alone10seconds, then F-claim its reward. Borealis gives **Cryo Stream**, Cinder **Inferno Cannon**, Ashen **Lunar Seeker**, Pelagia **Titan Minigun**. Galaxy claiming drops regular guns/reserves; Galaxy has infinite ammo/no reload, gold framing and correct PNG. G or DROP drops it; F-recollect preserves type/ID. Check Cryo slow/frost for.6s, Inferno refresh-only burn2s, dodge Lunar via hard turn/boost, and hold/release Titan to watch750ms spin-up/spread and spin-down. Repeat with bots/opponents and a second browser/client; all clients must agree on removal/drops/damage. Death/respawn/reset clears status effects; next started round restores35+35.
5. Press **F3** for the existing FPS overlay and renderer/quality controls. Measure after at least10seconds of warm-up, then fly/fight for60seconds in an8-ship match. Repeat **Standard** and **Low** at the same resolution and record average/low FPS, hardware, browser, resolution and renderer. Target60FPS on real hardware; cloud captures do not certify it. Low must still show every weapon PNG, prompts, effects and inventory. Verify planet limb/ship/projectile readability over all four surfaces and gold/purple contrast in dark/colorful space. Check console errors and reload once for asset/cache fallback.
6. For regressions run `npm test`, `npm run build`, `npm run build:server` from a clean local test-port setup (3002/5175 free). If Playwright Chromium is not installed, run `npx playwright install chromium`. Separate-device/LAN testing remains owner acceptance; configure the existing allowed origins/endpoint for those devices without changing authority rules.
