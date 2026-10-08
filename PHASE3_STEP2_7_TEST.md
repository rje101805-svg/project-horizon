# P3S2.7 — cinematic deep-space visual checkpoint

Status: implementation stages are on `work`; owner visual approval is required before the full regression suite. This is not final acceptance. Real Windows GPU FPS acceptance is pending. Baseline: `6b054f2c4f11d4f5304b5ece4c7d195ff2ded16a`.

## Audit and rendering approach

The previous sky used an opaque 1024-pixel procedural nebula bake enlarged 2×, spreading blurred colored structures across gameplay views. Galaxies were drawn in a 1024-pixel canvas representing a 4096-pixel field and then enlarged 4×. Stars were predominantly very faint, and the `silhouette` decorative body intentionally used nearly black surface colors. Large, dim spheres consequently resembled holes.

The replacement uses all eight original 1536 × 1024 RGB PNGs in `public/assets/cosmic/`. Their edges peak at RGB 1–2 and they have no alpha channel. A one-time full-resolution mask removes the near-black pedestal and unpremultiplies color before upload; additive blending preserves image radiance and existing stars through black backgrounds and dust lanes. Source files remain byte-identical. Galaxies and nebulae use linear filtering, eight cached textures, sparse non-repeating anchors, viewport culling and modest parallax. No per-frame noise generation, texture processing or emitter exists.

Stars remain a deterministic 2048-pixel cached field with 13,650 individual pinpoints, four concentrated clusters, a mostly white/cool-white palette and rare brighter anchors. Canvas streams cached visible point buckets; WebGL uses a cached tile with nearest filtering on the actual TileSprite fill texture and whole-pixel offsets. Low uses a quarter-density field. Both modes keep full source detail and the same cosmic landmarks. Low additionally disables ambient twinkling/shooting stars, reduces existing asteroid decoration and uses existing baked primary-planet fallbacks.

Decorative bodies have brighter directional surfaces, a restrained lit rim and smaller apparent sizes (largest 138 pixels). The four primary planet regions, positions, radii, material renderer and physics are unchanged.

The original `space-haze` texture is retained only as the unchanged Horizon lens shader's compatibility input. It is never drawn as a background layer. Horizon files, arcs, shaders, mechanics and their existing sampling contract remain untouched.

## Apparent formation sizes

At the reference 1100 × 600 game canvas, full nebula image quads are 460–500 pixels wide; galaxies are 235–290 pixels wide. Unlike the old 2× haze and 4× galaxy enlargement, no source image is magnified. Formations shrink on smaller viewports and never grow beyond these reference dimensions.

The source-colored silhouette, defined conservatively as source max(R,G,B) >= 24, occupies the following viewport areas when fully visible. These estimates exclude image transparency and account for the irregular colored formation, rather than treating the black source rectangle as the formation. They are upper estimates before opacity, rotation, clipping and overlapping stars.

| Formation | Width | Colored area / viewport |
| --- | ---: | ---: |
| Isolated Magenta Nebula | 500 px | 6.94% |
| Electric Blue Nebula | 480 px | 8.71% |
| Luminous Purple and Teal Nebula | 490 px | 7.55% |
| Magenta Nebula in the Void | 460 px | 6.55% |
| Edge-On Galaxy | 290 px | 1.46% |
| Colorful Spiral Galaxy | 235 px | 1.71% |
| Golden Spiral Galaxy | 285 px | 2.62% |
| Tilted Golden Spiral Galaxy | 245 px | 1.54% |

## Evidence and approval gate

The [screenshot index](docs/art-reference/p3s27/README.md) contains before/after images and eight requested checkpoint views, plus Standard/Low and software-WebGL comparisons. Captures include real eight-participant FILL GAME combat and server-produced bot projectiles; inspection views move only the client camera.

Pre-checkpoint validation consists of `npx tsc --noEmit`, seven focused `tests/environment.test.ts` checks, and browser capture/smoke checks. This is not the full Node or Playwright regression suite. The captures check asset loads, Canvas and WebGL Standard/Low rendering, live FILL GAME startup, and deferred scene shutdown/recreation. Metrics are recorded beside screenshots. Canvas star primitive counts over six frames are 16,572 Standard versus 4,200 Low (25.3%). Eight full-resolution image textures contain approximately 48 MiB of RGBA pixel data, excluding GPU copies, star caches and other existing assets. This memory cost is bounded, not a measured total-process memory value.

Dark-space coverage is measured from screenshot pixels with max(R,G,B) < 24. Representative game canvases include foreground ships, scenery and HUD; the measure is a composition proxy, not semantic image segmentation. See the screenshot index for current percentages. Real GPU timing, movement feel, artwork approval and full regression remain pending; SwiftShader verifies a rendering path, not Windows GPU performance.

After explicit visual approval, run the full Node/server and browser suites, client/server TypeScript checks, production build, fallback checks, scene recreation tests and relevant planet rendering tests. Investigate failures without weakening assertions. Do not run `build:pages`, begin P3S3 or change deployment configuration.

## Windows manual visual and FPS acceptance

1. In PowerShell at the repository root, run `git switch work`, `git pull --ff-only origin work`, then `npm ci`. Keep one terminal running `npm run server`; run `npm run dev` in a second terminal. No COMBAT_DEBUG flag is needed for FILL GAME or visual inspection.
2. Open `http://localhost:5173` in a hardware-accelerated Chrome or Edge window. Enter a name, use `http://localhost:3001` as the server URL, and click **Create room**. Record your GPU, browser/version, resolution and browser zoom. Keep the window visible and foreground.
3. Press **F3**. In the visual controls, select **Standard** quality. Verify the renderer label actually reports WebGL; a Canvas fallback is not the intended Standard GPU performance test. Allow several seconds for **FPS: … (3s avg)** to settle. Record a minimum and typical rolling average over 60 seconds; approximately 60 FPS is a target, not an established result.
4. For camera-only scenery review, use **Inspect camera**: **Dense starfield / distant bodies**, **Nebula / dark dust lanes** (purple), **Northeast corner** (cyan), **Southwest corner** (golden spiral), and **Southeast corner** (purple/teal). Verify crisp stars, detailed small formations, large dark gaps, natural spheres and no image rectangles. Inspection releases flight input and does not teleport the player.
5. Select **Follow player** before combat. While WAITING, click **FILL GAME**, confirm eight participants, then click **Start match**. Keep F3/FPS visible. Fly with WASD/arrows and Shift boost, aim/fire with the mouse or Space, and use normal R reload/E tractor controls. Check ships, lilac aliens when present, labels, projectiles, health/shield bars, ammo and minimap against black space and formations. Record FPS for another 60 seconds with active bots.
6. Use the existing **Planet · bright** / **Planet · dark** visual-study buttons and biome selector to review ship and projectile readability beside all four primary planets. These are decorative studies. Select **Restore arena** afterward. Do not confuse a study position with authoritative planet geography.
7. Repeat the same views and FILL GAME scenario in **Low**. Expect fewer stars and ambient effects while image detail and dark-space composition remain recognizable. Record minimum/typical FPS and any quality-switch artifacts. Keep visual intensity and camera/parallax toggles consistent when comparing modes.
8. **Back to home**, create another room and repeat twice. Look for missing/duplicated textures, lingering overlays, console errors or worsening memory/performance. Record screenshots and approve or request targeted visual changes before final automated regression proceeds.
