# P3S1 — visual foundation / manual acceptance

P3S1 is presentation inside the accepted 2400-unit arena. No new collision, planet mechanics, authoritative map, storm, gravity, surges, loot, landing or AI. P3S2 is the actual solar-system map and major world expansion; later P3 owns launch/planet/storm gameplay and the BR loop, and Phase 4 owns deeper content and final polish. Do not advance without acceptance.

## Local setup and controls

Use Node 22.12+; `npm ci`, `npm run server` in one terminal and `npm run dev` in another. Open Vite's URL in a hardware-accelerated browser. Set the Home server URL to the flight server (default localhost:3001), create a room, and share its code/URL for peers. COMBAT_DEBUG is unnecessary for the visual controls.

Press **F3** for **P3S1 visual study · DEV only**. Controls exist only in Vite development builds. Compositions place decorative prototypes beside the current rendered ship: they never teleport players, send requests, change health/ammo, create collisions or change the real singularity. A preview Horizon is explicitly visual-only; the actual arena hazard and its minimap position remain authoritative. Study compositions track the camera-follow anchor, including spectating. Restore arena returns the ice prototype to its default location. Only the real singularity appears on the minimap; a decorative planet indicator is not a collision promise.

- Open space: hides the nearby planet and study Horizon; distant universe remains.
- Planet · bright / Planet · dark: puts the ice world on the appropriate side of the ship under cool key lighting.
- Horizon study: brings a separate visual-only Horizon beside the ship; does not move the authoritative black hole.
- Combat backdrop: planet and study Horizon near the ships.
- Restore arena: removes studies and restores the original arena composition.
- Visual intensity: 0–1, smoothly blended over render time, independent of match/server time.
- Quality: Standard uses optional WebGL effects; Low uses baked planet and disk, no lensing, less infall, no haze/foreground dust, and fewer cached specks. Canvas starts in Low with the cinematic camera off; these controls can be re-enabled in DEV. WebGL starts in Standard with the cinematic camera on.
- Camera/parallax toggles allow comparisons. Camera OFF eases back to accepted zoom 1.

## Exact manual acceptance

**Shot A:** create room, F3 → Open space, intensity 0, Standard, camera/parallax ON. Hide F3, fly straight with D, then D+Shift. Capture canvas while moving. Look for tiny varied stars, faint regional haze, sparse fast dust, partially offscreen distant body/moon and strong negative space. Repeat with parallax OFF to compare depth, then re-enable.

**Shot B:** stop, F3 → Planet · bright, intensity 0, Standard. Hide F3 and capture the tiny ship beside the large ice sphere. Inspect surface detail, slow rotation (watch 15–30 seconds), lit/dark hemispheres, terminator and thin rim. Select Planet · dark to test the shadow side. Repeat at intensity .5 and 1: warm light faces the preview/actual Horizon, not an arbitrary global tint; opposite hemisphere stays dark. Test Low to inspect the baked approximation.

**Shot C:** F3 → Horizon study, intensity .5, Standard. Hide F3 and capture. Watch the rotating asymmetric gold/orange filaments, darkest center, lensed upper arc and sparse curved infall. Watch nearby stars bend as the camera moves. Compare intensity 0/.5/1 and Low (lens disabled) to distinguish genuine localized sky distortion from the accretion artwork. The study has no death/gravity/gameplay effects.

**Eight-participant combat:** Restore arena, FILL GAME, verify 8 / 8, then host START MATCH. F3 → Combat backdrop. Fly and fire; test intensity 0/.5/1 and both qualities. Repeat Open space, Planet · bright, Planet · dark and Horizon study. Check humans/bots, gold bullets crossing ice/haze, cyan tractor boundary/direction over ice/space/haze, hit feedback, reload, health/shield, elimination, winner/draw and reset. E uses the accepted authoritative tractor; visual controls grant no weapon privileges. Repeat with one real peer and fake lag 150ms+jitter, checking prediction/reconciliation, shooting handoff and reset.

**Aliens:** in the filled match, allow elimination (or use accepted server-gated development damage tools locally), wait for alien respawn, verify melee-only gameplay. With the real alien as the followed ship, repeat Open space, bright ice, dark ice and Horizon study at 0/.5/1. Inspect lavender ghost body, dark contrast edge, pale rim and ALIEN label. Repeat on a second client viewing a remote alien. Verify normal human appearance/resources/shooting after round reset. Do not mistake an outline for a health/shield change; accepted alien opacity remains unchanged.

**Performance:** use ordinary target hardware with WebGL hardware acceleration. Warm up 30 seconds across several rounds, pressing host START MATCH again after each automatic reset. Then collect at least 60 seconds of ACTIVE combat across repeated eight-participant rounds with planet/Horizon/intensity 1, bullets, tractor and aliens visible. Use F3 FPS/ping/server/correction and browser performance tools; compare Standard/Low and overlays hidden. Look for stable ~60 FPS where supported, no long repeated uploads/bakes, unbounded object growth or input delay. Repeat Back to home/create room five times and resize the browser. This headless cloud's software renderer cannot certify target-device FPS.

**Fallback:** disable WebGL/browser acceleration or use Low. Gameplay, baked spherical bodies, accretion disk and infall must remain; advanced planet motion/lensing may disappear. Also test clean exit/re-entry. Do not claim visual acceptance from test counts.

## Rendering architecture

`src/visual/space.ts`: four cached 1024² Canvas textures/TileSprites: void (-30), stars (-29, .035 parallax), haze (-28, .10), dust (8, 1.28). Distant baked bodies (-25, .20 conceptual depth) are low contrast, enormous/partly offscreen and decorative. No individual star objects, emitters or per-frame random generation. Canvas uses two lightweight custom Graphics renderers that stream only visible cached star/dust points; this avoids expensive transparent full-screen TileSprite copies. Brightness is quantized into 16 cached buckets. WebGL keeps the TileSprites. Tiles use slow world-camera offsets with inverse zoom compensation, so screen-fixed layers/HUD do not pulse with the cinematic camera.

`config.ts`: camera zoom 1–1.014, smooth bounded easing; boost relaxes toward 1 and nearby combat toward 1.006. It never shows more world than Phase 2 zoom 1. Existing Phaser world-pointer aiming remains intact. Ship, projectile, tractor, network and simulation coordinates remain world X/Y.

`celestial.ts`, `lighting.ts`, `shaders.ts`: one 760-unit ice visual plus atmosphere; no solid core/collision. A sphere normal from UV drives cool key and directional warm Horizon light. Three-octave procedural ice/fractures and slow longitude motion run in one optional quad. Distant spheres bake once. Canvas/Low uses a cached spherical texture with quantized light updates, capped at four bakes/s only when visible and changed; static lighting does not rebake each frame, and the initial cool texture is reused without a redundant first-visible bake. Shadow/highlight brightness is bounded to protect gameplay hierarchy.

`horizon.ts`: cached seeded accretion filaments, flattened disk with asymmetry; optional UV rotation, dark event-horizon core and upper far-side arc; at most 14 infall marks (5 Low), derived from the existing scene clock. Actual hole coordinates and radius come unchanged from server snapshots. Studies are separate DEV-only decoration. Renderer accepts variable visual scale; the lens quad is clipped to the viewport even at enormous radii.

`LENS_FRAGMENT`: three existing cached sky textures are sampled at their original camera/parallax coordinates with a radial nonlinear ray offset. Distortion fades out at 3.6 event radii. Only sky bends; celestial bodies, ships, bullets, beams, UI and aim remain crisp. No full framebuffer copy or full-screen gameplay postprocess. This is a stylized astronomical lens, not relativistic ray tracing.

`intensity.ts`: independently eased 0–1 visual parameter. Cool key fades while directional warm Horizon contribution increases; disk/lens/infall respond. No match timers or server fields. `debug.ts` is dynamically imported only in DEV, creates controls once, and cleans them up on scene shutdown.

## Performance and degradation

Shaders compile/link in a guarded preflight before insertion; temporary GL resources are deleted. No WebGL selects Low by default with the cinematic camera disabled; failed optional effects retain basic baked presentation. Individual effects can fail independently; failure does not replace gameplay with local simulation. Low disables costly effects. Planet visibility and lens viewport intersection bound work; fixed textures/objects and bounded infall reuse the existing scene frame loop. Cleanup removes owned graphics/shaders/textures/controls. No extra rendering timers or new HUD work every frame.

Known limitations: Canvas/Low ice does not animate surface rotation; Low disk is static except sparse infall. Lensing deliberately excludes the planet/distant bodies and gameplay plane. Current arena singularity remains its accepted gameplay hazard; this is not either future launch or BR storm mechanic. Study placements are local, decorative and unshared; use Restore arena when comparing actual world locations across clients. Browser GPU/context restoration remains Phaser's responsibility. Color, composition, lens credibility, alien visibility and target-device frame time require human judgment.

## Verification commands

`npm test -- --workers=1` (all Node + browser tests), `npm run build`, `npm run build:server`, `git diff --check`. Browser coverage includes Canvas and separately launched SwiftShader WebGL; no pixel-perfect/FPS assertions. A Canvas regression check observes real rendered frames and asserts zero star/dust TileSprite copies while cached specks still draw; it does not assert FPS. Focused tests cover bounded camera/intensity, directional light, culling, huge lens bounds, shader selection/failure, controls and bounded resource lifecycle. Production assets must exclude visual-control labels, inspection globals and accepted DEV combat tooling. Production build writes ignored dist; no Pages/deployment rebuild is part of P3S1.

During verification, three-client Canvas short-fire tests exposed transparent star/dust TileSprite copy overhead. Instrumented drawImage calls identified those two layers as the dominant new cost (roughly 5–7ms per layer in a concurrent software-browser sample). The visible-point Canvas renderer removes those copies without changing controls/gameplay; Canvas defaults to the reduced tier (camera off, no haze/dust, fewer cached specks), and the unchanged alien tests pass in normal and jitter modes in the final full run. These cloud measurements diagnose the path, not target-hardware FPS acceptance.

Final verification: 189 Node tests and 40 browser tests passed in one full run, including both Canvas/SwiftShader paths and existing normal/jitter cases. Production build and server TypeScript are checked separately. Manual visual and hardware-performance acceptance remains required.
