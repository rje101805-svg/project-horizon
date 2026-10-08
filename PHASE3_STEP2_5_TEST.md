# P3S2.5 — deep space and planet refinement

Implementation only; owner art/gameplay and desktop GPU acceptance remains pending. All server/shared gameplay files, world dimensions, planet positions/radii, prediction/reconciliation, minimap mapping and accepted Phase 2 behavior remain unchanged. No P3S3, collision, harvesting, LOS obstruction, bot navigation, storm/gravity redesign, deployment command or Pages rebuild.

## Environment architecture

Four owned cached layers: dark base, stars, nebula and sparse foreground dust. The deterministic 2048-pixel star field contains approximately 6,700 points, versus approximately 700 in the old 1024-pixel field. A normal 1100×600 view contains roughly 1,100–1,350 points in Standard; Canvas Low draws about half. Brightness is strongly weighted toward faint stars; exactly five restrained bright anchors. Cool white, pale blue, warm white and faint amber use four desaturated palettes. Warped periodic density creates richer/sparser regions. The logical period exceeds the world's parallax travel, and seamless boundaries support continuous camera movement without repeatedly revealing the same cluster. Stars have no halos, streaks or projectile-sized shapes.

WebGL batches cached star/dust TileSprites. Canvas retains the accepted sparse geometry renderer: cached brightness/color buckets, only on-screen point drawing, no full-screen transparent star/dust copies, no star GameObjects or new frame loop. Slightly larger faint point sizes were selected after inspecting actual captures; most remain extremely faint. Stars use parallax .035, nebula .10, foreground dust 1.28. Static low-saturation, warped multiscale periodic color fields with broad dark lanes are baked once at 512×512 and displayed over a 2048-pixel period. No stamped circular fog or animated noise. Nebula draws below stars. Horizon's existing background-only lens samples the same updated periods/order; disk/arc/gravity architecture is unchanged. Low hides nebula/dust while retaining richer sparse stars.

Five distant bodies: banded gas giant, rocky world, ice body, moon, ringed planet. Two shared atlases (512×512 and 512×256) contain dim, directionally shaded variants. Apparent sizes 36–180 pixels, alpha .42–.50, parallax .035–.12. Screen culling, inverse-zoom placement and fixed ownership keep them bounded. No protocol/server objects, minimap markers, collision or gameplay interaction.

The same seven landmark clusters retain exactly 47 fragments at unchanged positions. Eight irregular 7–10 vertex rocky silhouettes share one 256×128 atlas. Facets have a dim directional light, varied proportions/rotation/size, and subdued mineral tones. One culled container per cluster; no glow, pickups, emitters or physics. All decoration stays subordinate to ships, aliens, attacks and danger cues.

## Planet investigation and corrections

Phaser uses linear filtering; the existing direct scene shaders have no reduced-resolution intermediate render target or active mipmap chain. A 1024-wide equirectangular map provides only a fraction of its texels across the front hemisphere, especially a large limb near the player. The old Canvas sphere was only 384 pixels across then magnified to more than 2000. New original multiscale 2048×1024 albedo maps add detail rather than upscale old maps; cached fallback spheres are 768×768. Quality/culling/independent cloud drift/rotation/emission and premultiplied output remain intact. Low surfaces/clouds remain static; changed DEV intensity can cause a culled, quantized fallback rebake at most 4Hz. Default zero-intensity play performs no recurring bakes/uploads. CPU UV sampling now interpolates the source maps before magnification (the old nearest lookup visibly blocked clouds/coasts even with linear final-image filtering). Reused RGBA output buffers avoid per-pixel sample allocation.

- Borealis: sharpened blue/white glacier boundaries; flow-aligned ice strata within pale sheets; blue-tinted fractures replace dense dark vein/speck noise. Reduced atmosphere (halo .16→.07, inner rim .09→.035). Smooth exposure compression replaces hard .64 channel clipping, preserving pale terrain detail.
- Cinder: much narrower, variable warped plate fissures and darker obsidian crust. Emission metadata above 64/255 covers 7.23% rather than the old 31.46%. Thin boundaries retain orange-red emission while the crust dominates.
- Pelagia: sharper coastline threshold, finer terrain, more defined cloud opacity. Separate 1024×512 clouds retain independent Standard drift; no extra ocean specular/glare pass.
- Ashen: the old fixed horizontal height difference multiplied brightness regardless of actual illumination, causing embossed/split-looking impacts. New radial-height derivatives generate a tangent-space normal map. Both CPU and GLSL transform it into the visible sphere basis, then use the same cool key and Horizon directional light as the sphere. Craters are not prelit into albedo. Varied erosion/ellipticity/rim widths/depth, 410 impacts, larger basins and small secondary craters replace repeated circular stamps. No atmosphere.

Six maps are high resolution: four albedos plus volcanic emission and moon normals at 2048×1024; clouds remain 1024×512, two currently unused ice/terrestrial height metadata maps are 512×256. All nine PNGs have exact horizontal seams; albedo stays opaque so Phaser premultiplication does not destroy RGB. Generator: `python3 scripts/art/generate-planets.py` (numpy/Pillow only for regeneration); `--only-ice` regenerates Borealis without rewriting other assets. No new application dependency.

The nine PNGs total 9.43 MiB compressed. Nominal RGBA source texture storage is 51 MiB versus 18 MiB previously, plus 9 MiB for four fallback spheres, 25 MiB for sky source textures, and ~1.6 MiB shared distant/debris atlases. About 86.6 MiB of these named textures before engine copies, render buffers and existing effects. CPU surface arrays add 51 MiB; decoded images/Canvas backing stores and TileSprite caches add further memory. These are size-based accounting estimates, not measured peak process/VRAM usage. No mipmap overhead is enabled. Scene-owned textures/objects are removed and repeated create/home tests verify stable names/counts; ordinary Low still loads the shared source maps, so a separate low-resolution asset pack remains a possible future optimization.

## F3 and inspection

F3 remains hidden by default. FPS now counts actual Phaser `postrender` events and displays a weighted rolling average of up to three one-second windows (`FPS: … (3s avg)`). Counters reset on scene entry, listeners detach on shutdown, DOM refresh stays capped at 4Hz, and no timer, RAF loop, dependency or network message is added. Server receive rate remains its separate one-second metric. DEV renderer diagnostics show WebGL/Canvas, quality, visible planets/fragments/distant bodies and bounded cached star count. They update only with F3 visible. Visual controls/inspection handles are excluded from production JS.

Existing composition, biome, intensity, camera, parallax and quality controls remain. Camera inspection adds dense/distant, sparse, nebula/dust lanes and two debris corridor views. It releases input once, holds neutral input without clearing delayed snapshot queues and never teleports a player. Follow player and Restore arena return to normal gameplay. The dense and sparse viewports sample approximately 1357 and 1090 cached stars before Low decimation.

## Manual acceptance and real hardware performance

Use the pulled `work` checkout; do not use the unchanged published Pages client for this test. Two Windows Command Prompt terminals:

```bat
npm ci
set NODE_ENV=development
set COMBAT_DEBUG=1
npm run server
```

In the second terminal:

```bat
npm run dev
```

Open the Vite address printed by the terminal (usually http://localhost:5173) in Chrome. Enter `http://localhost:3001` as server and Create room. Keep the tab visible/focused, fake network OFF, and browser hardware acceleration enabled. F3 → Renderer should show WebGL on GPU-capable machines; `chrome://gpu` can confirm acceleration. COMBAT_DEBUG is only needed for optional accepted DEV combat actions, not scenery or FPS.

1. F3 → Open space → Standard. Inspect density, mostly faint varied stars, subtle gas/dust, dim distant spheres/rings. Toggle Low to compare. Try Parallax on/off; restore on. Decoration must never read as loot, an enemy or an incoming attack.
2. Restore arena → Inspect camera: Dense starfield/distant bodies, Sparse starfield, Nebula/dark dust lanes, Western debris cluster, Northern debris corridor. Check irregular shaded rocks and open corridors. Camera studies must not move the player's minimap dot. Return Follow player before flight.
3. Biome selector: ice, volcanic, terrestrial, moon; use Planet bright and Planet dark with intensity 0/1. Look for glacier detail without dirty spots/clipped white, dark crust with thin lava, clear coasts/clouds and concave coherent moon craters. Do not treat extreme close-up photographic fidelity as this step's objective. Restore intensity 0 and arena afterward.
4. Fly naturally to Borealis (2400,2900), Cinder (9000,2400), Pelagia (8400,8900), Ashen (2200,9200). Their radii remain 1100/980/1300/720. Inspect normal-distance limbs, parallax stability, all map edges/corners and the center. Check no seam, culling pop, planet collision, bullet/tractor obstruction or new hazard. Full-map movement remains the accepted 12k world.
5. Create/join with a second visible client. Compare remote human/alien appearance and authoritative gameplay. Fire ten Space taps at least 300ms apart after initialization, expect 10 shots and ammo 2/12, then R reload in 1.5s. Repeat with fake lag/jitter, then disable it.
6. Host FILL GAME → START MATCH (eight participants). Check human hull/bars, aliens at .5 opacity with ALIEN tags, yellow projectiles and tractor outlines over stars, nebula, debris and all four planetary backgrounds. Use the accepted biome/combat studies for repeatable backdrop checks; no gameplay elements were brightened/rebalanced.
7. Verify eliminations, alien respawn/protection/melee, winner/DRAW, ~6-second freeze, full human reset to waiting and explicit host restart. Repeat rounds and Home/Create to check no stale textures, panels/listeners or console errors.
8. Hardware FPS test: choose Standard, FILL GAME, allow 30 seconds of warm-up, then START MATCH. With F3 visible, move/boost/fire/tractor for at least 60 seconds. Record FPS every 5 seconds, minimum observed FPS, machine/GPU, Chrome version and any choppiness. Restart matches if they end during the observation so the sample includes eight-participant ACTIVE combat. Repeat with Low and on a weaker laptop if available. Repeat near bright Pelagia/ice and Cinder's lava as well as open space. Measure cold scene load separately. Target smooth 60 FPS; this remains pending user measurement on a real GPU.

## Automated verification and observations

Stage A: 8 focused Node cases, TypeScript, 2 Canvas/WebGL readability/fallback browser cases passed. Stage B: 9 focused Node cases, TypeScript, same 2 browser cases passed. Stage C: refined PNG decoding/seams/coverage, relief normals/light direction, bounded silhouettes and biome tests passed; all 3 focused browser cases passed, followed by another successful material run after the final Borealis sharpening.

Stage D final counts and performance observations are recorded after the final regression/build run below. Software WebGL performance is not real desktop GPU performance. Standard's shader cost remains unsuitable for SwiftShader; Low is the fallback. Procedural art does not claim photographic reference fidelity. Full-resolution user surface maps were not supplied. The existing faint Horizon arc-line artifacts and accretion-disk polish are deliberately deferred. Art, subjective readability, hardware FPS and peak memory acceptance remain the owner's manual checks.

Final `npm test -- --workers=1 --retries=1`: **204/204 Node and 43/43 browser tests passed on their first attempts** (browser suite 9.6 minutes). Includes DEV authorization/production veto, prediction/reconciliation, projectile handoff, bots, reload, tractor, winner/DRAW/spectator and repeated reset coverage. The new eight-participant encounter fixture was then spread into eight distinct on-screen positions for representative captures and its browser case passed separately again.

Final postrender observation (120 intervals after 30 warm-up frames): Canvas Low mean 16.8 ms (~59.5 FPS), p95 18.5 ms, 120 ACTIVE samples. SwiftShader Standard mean 168.52 ms (~5.9 FPS), p95 282.5 ms, 16 ACTIVE samples; remaining samples were ended/waiting with eight connected participants. Cold readiness observed 1.579s Canvas / 3.651s SwiftShader. These short, software-only observations do not establish hardware FPS, sustained eight-human combat performance or peak memory. Subjective art/readability and the specified 30-second warm-up/60-second desktop GPU test remain pending.

Checkpoint commits: A `3e82b348e49faf8b8a1fb9b4ac3b54547f20ecd6`; B `86fba0b7cfa9892708728937d941ccaa997119fb`; C `bd85095d5908ea04b9e21d67e44ba85e7372557b`; D is the final integration commit containing this document (its hash is reported after commit). No history was rewritten.

`npm run build` (all client/server/shared/test TypeScript plus production Vite), `npm run build:server`, production DEV UI/inspection/fake-lag exclusion, byte-identical packaging of all nine PNGs and `git diff --check` passed. The existing large Phaser bundle warning remains. `server/`, `shared/` and `docs/` have no changes from P3S2. The separate eight-visible-participant capture test passed after the final fixture refinement. No deployment commands or Pages rebuild were performed.
