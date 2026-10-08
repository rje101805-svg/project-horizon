# P3S2.6 — Cinematic cosmic environment

Manual art/gameplay and real-hardware performance acceptance remain pending. This is a presentation-only pass on `work`; no deployment, Pages rebuild or next roadmap step.

## Implementation

- Stage 1: seeded, irregular purple/blue/magenta/cyan nebulae and illuminated stardust baked once into a 1024² canvas; five distant galaxies (spirals, bands and an elliptical) share one cached atlas. Approximately 65% dark / 35% colorful is an artistic guideline, not a pixel guarantee for every camera position.
- Stage 2: a much denser, masked starfield with localized concentrations, twelve bright anchors and six subtle animated twinkles. One short, pale shooting-star trail appears for 550 ms in each 18-second cycle, with six different trajectories. It has no bullet head, damage, entity or gameplay clock.
- Stage 3: six new decorative worlds, eleven total, including rocky moons, a warm gas giant, a blue ringed world, a silhouette and an atmospheric body. Four new localized asteroid groups contain 44 rocks/fragments; the existing 47 world fragments remain. Visible rocks rotate slowly and tiny fragments drift slightly.
- Stage 4: visual radii are Borealis 825, Cinder 735, Pelagia 975 and Ashen 470 (25%, 25%, 25% and 34.7% smaller). Centers and the 12,000-unit world remain fixed. Main planets retain world-space placement, original surface maps, lighting, gentle existing surface/cloud rotation and recognizable identities. A bounded 3% atmospheric pulse and small ring motion add subtle life.
- Stage 5: integrated depth, culling, Low fallback, cleanup, real draw-work checks, responsive captures and regression verification. F3 retains its actual post-render rolling three-second FPS average.

Deep backgrounds sit behind distant bodies, asteroid groups, main planets and combat. Decorative parallax never applies to the main planets. No server/shared gameplay files, black-hole visual implementation/arc lines, movement, networking, bots or combat rules change. The new galaxy/ambient layers are not sampled by the existing background lens; extending that effect was deliberately outside this pass.

## Rendering and Low quality

Static textures and star brightness/color buckets are cached once per scene and explicitly destroyed on exit. There are no new timers, frame loops, per-frame random placement or particle emitters. Meteor calculations reuse storage. The additional named texture storage is approximately 10.5 MiB of RGBA pixels (higher-resolution haze, galaxy atlas and larger distant-body atlases), excluding renderer copies and driver overhead; this is not a peak VRAM measurement. Existing planet PNG assets and their memory footprint are unchanged.

Low hides nebulae, galaxies, foreground dust, twinkles and shooting stars; hides the six new distant worlds; disables new rock/ring animation; and shows at most two new asteroid groups with four static rocks each. Canvas Low samples one quarter of cached star points. Main planets use their cached fallback instead of live fragment shaders. The automated Canvas check counts actual star fill operations over six rendered frames: Low must draw less than 40% of Standard. This tests reduced work, not an invented FPS target.

Software Canvas/SwiftShader observations exercise fallback and shader correctness only. They do not establish preservation of the owner's approximately 60 FPS hardware FILL GAME baseline. Confirm that baseline on the target machine before accepting the step.

## Readability review

Captured eight-participant encounters over all four planet limbs and directly over purple/cyan nebulae retain human outlines, translucent alien identity/ALIEN tags, projectile dots, tractor geometry and HUD. Nebula captures retain vivid blue/purple and magenta formations separated by dark space. The lilac alien's translucent fill is less distinct against bright violet clouds, while its silhouette and ALIEN label remain readable. The cyan ship retains a clear outline in the cyan-region capture. Final moving-combat readability over the brightest formations requires owner review. No broad desaturation or gameplay appearance change was applied.

## Automated verification

Run `npm test -- --workers=1 --retries=1`, `npm run build`, `npm run build:server`, and `git diff --check`.

Coverage includes seeded distribution/seams, galaxy shapes, bounded meteor lifetime, decorative counts, planet resize bounds, atmospheric uniforms, real Low draw reduction, F3 FPS visibility, eight-player FILL/START/combat presentation, responsive 1920/800/375-width canvases, repeated scene cleanup, WebGL compilation and all existing gameplay suites. Browser captures are inspection aids, not image-difference assertions or FPS assertions. Production output is checked for excluded DEV controls/debug globals, unchanged planet assets and unchanged server/shared/Pages/black-hole files.

Fixture corrections preserve all assertions: repeated room creation waits for the new live connection before a bounded probe; the two-renderer planet test closes the finished Canvas page before SwiftShader, uses the same background-rendering flags as the existing shader suite and allows three minutes for four planet captures, 150 rendered frames and full teardown/recreation per renderer. The older visual case now shares the solar fixture's bounded 15-second cold-readiness wait: measured SwiftShader startup had exceeded its former five-second budget. Timings identify shader/capture versus startup/cleanup cost; these deadlines are not FPS acceptance thresholds.

Final verification: **208/208 Node tests passed**. The full browser run passed 42 cases on their first attempts and failed the older visual case at its five-second cold-readiness wait. After correcting that fixture, both visual cases passed without retries, verifying **all 43 browser cases across the full and focused runs**. The separate environment/four-planet investigation run also passed both cases without retries. No rendering/behavior assertions or frame sample counts were removed. Client TypeScript + production Vite build, server TypeScript, DEV-code exclusion, nine byte-identical packaged planet PNGs, unchanged gameplay/Pages/black-hole files and `git diff --check` passed.

Final software observation, 120 postrender intervals after 30 warm-up frames: Canvas Low mean 16.64 ms, p95 18.8 ms, all 120 samples ACTIVE; SwiftShader Standard mean 196.75 ms, p95 320.4 ms, 42 ACTIVE samples and the rest ended/waiting. Cold readiness was 2.00 s Canvas / 4.72 s SwiftShader in that run. The four-planet browser case finished in 1.3 minutes, including cleanup/recreation. These are cloud software observations, not real GPU acceptance or a sustained-combat benchmark. Hardware FPS, moving-color readability and peak VRAM remain manual checks.

## Exact manual acceptance

1. Pull `work`, run `npm ci`, then `npm run server` and `npm run dev` in separate terminals. Open the printed client address in hardware-accelerated Chrome. Connect to `http://localhost:3001`, create a room, press F3, select Standard and leave fake network latency off.
2. Fly normally, inspect dark corridors and colorful formations, then use the existing DEV camera views/open-space/planet controls. Verify irregular clouds, different galaxy shapes, localized stars, six new distant bodies and four asteroid groups. Background layers move at different subtle rates; main planets stay fixed in the gameplay plane. After inspection restore the automatic gameplay view.
3. Watch open space for at least 40 seconds for occasional short fading shooting stars and subtle twinkles. They must not look like yellow combat bullets. Observe slow rock drift/rotation and small ring/atmospheric changes; surface rotation is intentionally extremely slow.
4. Check Borealis white/blue glacier contrast, Cinder's dark crust/thin lava fissures and Ashen's consistent crater lighting. Confirm the four resized planets are recognizable and the minimap matches their unchanged centers. Verify the black-hole presentation and arc lines remain as before.
5. FILL GAME to eight participants, START MATCH, warm up for 30 seconds, then observe F3 render FPS during at least 60 seconds of flight, shooting/reloading and tractor use. Restart host rounds as necessary. Compare with the prior approximately 60 FPS baseline on the same machine/browser, and repeat in Low. Also test weaker hardware if available; cloud software rendering is not hardware acceptance.
6. Inspect cyan humans and lilac aliens directly over bright cyan and purple nebulae. Check labels, projectiles and tractor beams during motion. Report specific low-contrast situations for targeted follow-up; retain the colorful art direction.
7. Test desktop, narrower window and phone-width layouts; F3 and quality controls must remain usable. Check FILL GAME, elimination/alien respawn, winner/draw/reset, spectators and another round. Exit/recreate several rooms and confirm no rendering errors or accumulating decorations.

Stop here for manual acceptance. No next roadmap step.

### Windows Command Prompt / real GPU

In the existing checkout:

```bat
git switch work
git pull --ff-only origin work
npm ci
set NODE_ENV=development
npm run server
```

In a second Command Prompt in the same folder:

```bat
npm run dev
```

Open the printed Vite URL, not the unchanged Pages deployment. In Chrome Settings → System enable graphics acceleration and restart Chrome. Check `chrome://gpu` for hardware-accelerated WebGL; F3 should report WebGL. Connect to localhost:3001, keep latency simulation off, FILL GAME, START MATCH and perform steps 5–7 above in Standard and Low at the same resolution as the previous baseline. Record GPU/browser, resolution, mode, three-second FPS range and visible stutter after warmup. Restart ended rounds so the comparison includes ACTIVE eight-participant combat, rather than only waiting/ended scenes.
