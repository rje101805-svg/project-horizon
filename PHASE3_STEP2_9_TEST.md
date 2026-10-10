# P3S2.9 — Custom planet images

Visual-only work on `work`, from renamed asset baseline `c242f3446490396bdba7ba6d3781c11b5bf65230`. No gameplay, collision, networking, bot, ship, cosmic scenery, harvesting or P3S3 changes. No Pages release rebuild.

## Assets and transparency

All four PNGs verified and decoded before implementation and remain byte-for-byte unchanged. Each is 1254 × 1254 RGBA. Images are loaded directly: no background-removal copies, resizing, recoloring or image processing was necessary.

| Mapping | Source path | Bytes | Actual alpha range | Outer border alpha |
|---|---|---:|---:|---:|
| Borealis / ice | public/assets/planets/borealis.png | 2,650,299 | 0–253 | 0–1 |
| Cinder / volcanic | public/assets/planets/cinder.png | 2,684,640 | 0–253 | 0–1 |
| Terrestrial / terrestrial | public/assets/planets/terrestrial.png | 2,887,090 | 0–253 | 0–1 |
| Ashen / moon | public/assets/planets/ashen.png | 2,959,868 | 0–254 | 0–2 |

There are genuinely zero-alpha external pixels, with faint residual opacity elsewhere along the outside borders. Near-opaque disc pixels, dark night-side regions, atmospheric fringes and all original artwork are preserved. Reviewed captures show no opaque square backgrounds.

## Integration and alignment

`src/visual/planet-images.ts` centralizes filenames, texture keys and disc calibration. The scene preloads them through Phaser using `import.meta.env.BASE_URL`, preserving existing deployment base-path handling. `CelestialWorld` uses each custom texture in its existing primary Image at depth -12, with equal X/Y scale and a disc-centered origin. The old shader and baked material textures remain available when an image fails to load.

Disc calibration uses source bounds at alpha >=240, excluding the square PNG margins and most atmospheric glow. It does not alter or mask pixels. The normalized maximum disc axis maps to the existing planet radius; small baked silhouette irregularities remain, without stretching.

| Asset | Source disc center (pixels) | Source disc radius | Existing map center | Existing radius |
|---|---|---:|---|---:|
| Borealis | 623, 616 | 545 | 2400, 2900 | 825 |
| Cinder | 622.5, 609 | 558.5 | 9000, 2400 | 735 |
| Terrestrial | 622.5, 614 | 573.5 | 8400, 8900 | 975 |
| Ashen | 621.5, 613.5 | 567.5 | 2200, 9200 | 470 |

Origin = source disc center / 1254; uniform scale = existing radius / source disc radius. Full texture extents include the existing transparent atmosphere margins, so the PNG's display rectangle can be wider than the physical disc. This does not resize map radii. The terrestrial planet retains its existing map name **Pelagia**; its replacement asset is called `terrestrial.png`.

`solar-layout.ts` is unchanged. Camera behavior, minimap, planet identity, visibility culling (`radius × 1.075`), study selectors, positions and radii retain their existing logic. Primary planets and decorative asteroids remain non-colliding, as before. No mountains or 3D structures were added.

## Quality, fallback and tradeoffs

Custom sprites use the same cached image in Standard/WebGL and Canvas/Low, with no additional shader pass, particle system or per-frame image masking/decoding. Quality still controls existing scenery and effects. Missing/unavailable custom textures select the original procedural material per planet: Standard/WebGL uses its shader; Canvas/Low uses its baked texture. Tests intentionally abort all four asset requests and verify both fallback paths and the Low transition.

The supplied PNGs contain fixed lighting, cloud patterns and surface detail. Their appearance does **not** perform the old procedural globe rotation, moving clouds, animated atmosphere pulse or Horizon-dependent primary-planet relighting. Those behaviors remain in the procedural fallback. This is the explicit tradeoff for preserving the supplied artwork without remapping it or adding expensive shader passes. Existing Horizon/black-hole and cosmic effects are unchanged.

All four custom texture keys are removed at scene cleanup and reloaded on recreation. Original procedural surface inputs and cached bakes remain resident for fallback. The new PNG transfer total is 11,181,897 bytes (about 10.7 MiB); decoded RGBA data is 25,160,256 bytes (about 24 MiB), excluding browser/GPU copies and the existing fallback textures. Real-GPU FPS and cold-load performance require owner testing.

## Verification

- `npm run build`: passed; existing Phaser bundle-size warning remains.
- `npm run build:server`: passed.
- Focused browser checks: 5/5 passed (all four custom planets in Canvas/WebGL, texture cleanup/recreation, existing visual checks, and two procedural load-failure fallback checks).
- `npm test -- --workers=1`: 212/212 Node tests passed; initial browser run 45/46 passed. The remaining test failed solely on a newly observed console 404 for the existing absent `/favicon.ico`, reproduced on the home page without entering a game. The planet fixture now supplies an embedded data-URL favicon rather than requesting that unrelated file; all console/error assertions remain intact. Final focused solar rerun **1/1 passed** in 47.9 seconds with every console/error assertion intact. All 46 distinct browser checks passed across the full run and focused rerun; this was not one clean full invocation. No unresolved planet/test timeout. One worker avoids concurrent software-GPU contention; no timeouts or rendering assertions were weakened.
- Asset bytes compared with the baseline: identical.

The four-planet browser test additionally asserts the correct custom texture, disc-centered origin, equal X/Y scale, exact body/image center, depth -12, and hidden procedural shader for each image. It checks custom keys release/recreation, samples eight-player combat, and records actual software-renderer timings without asserting or claiming hardware FPS. Healthy planet pages record console errors as well as page exceptions. The existing visual visibility check now accepts the primary Image even when the retained fallback shader exists but is hidden; it still requires a visible planet.

Visual evidence for both renderers:

| Planet | WebGL / Standard | Canvas / Low |
|---|---|---|
| Borealis | [capture](docs/art-reference/p3s29/p3s29-webgl-ice.png) | [capture](docs/art-reference/p3s29/p3s29-canvas-ice.png) |
| Cinder | [capture](docs/art-reference/p3s29/p3s29-webgl-volcanic.png) | [capture](docs/art-reference/p3s29/p3s29-canvas-volcanic.png) |
| Terrestrial | [capture](docs/art-reference/p3s29/p3s29-webgl-terrestrial.png) | [capture](docs/art-reference/p3s29/p3s29-canvas-terrestrial.png) |
| Ashen | [capture](docs/art-reference/p3s29/p3s29-webgl-moon.png) | [capture](docs/art-reference/p3s29/p3s29-canvas-moon.png) |

These use the existing camera/planet studies and are cropped by the game viewport, consistent with massive planets viewed from orbit. Source images were also visually reviewed in full. Captures show soft limbs, preserved dark discs and supplied detail; no square backing is visible. Gameplay labels/bars remain readable; owner combat/readability review near bright ice/cloud regions is still recommended.

## Files changed

- `src/visual/planet-images.ts`: new source/calibration table and preload helper.
- `src/main.ts`: import and preload invocation only.
- `src/visual/celestial.ts`: primary image selection, calibrated scale/origin, procedural fallback and texture cleanup.
- `tests/solar.spec.ts`: custom texture/alignment/lifecycle assertions and captures.
- `tests/planet-images.spec.ts`: new missing-image Canvas/WebGL fallback checks.
- `tests/visual.spec.ts`: primary visibility check supports a custom Image with a hidden procedural shader.
- README, this guide and eight review PNGs under `docs/art-reference/p3s29/`.

## Known issues

The application still has no `/favicon.ico`; a fresh browser may log an unrelated favicon 404. Only the isolated planet fixture supplies its own embedded icon. No application icon or unrelated file was added. Fixed lighting/clouds, near-transparent source border residues, and real-GPU FPS acceptance are described above.

## Windows manual testing

In PowerShell in the repository:

```powershell
git switch work
git pull --ff-only origin work
npm ci
npm run server
```

In a second terminal, run `npm run dev`. Open Vite's printed address (usually `http://localhost:5173`), set the game server to `http://localhost:3001`, create a room, **FILL GAME**, then **Start match**.

Press **F3** and use the existing planet/camera views to inspect Borealis, Cinder, Pelagia/Terrestrial and Ashen. Use automatic camera mode for normal flight and combat. Compare Standard and Low: all four should use the new artwork. Check soft atmospheric limbs against stars/nebulae, preserved dark regions, unchanged map locations/sizes, no square backing, and ship/projectile/label visibility over bright surfaces. Surface lighting and clouds are intentionally fixed in these PNGs.

Fly with WASD/arrows, Shift boost; shoot with mouse/Space, reload with R and use E tractor. Confirm bots, eliminations/aliens, winner/reset and Back/Create/FILL GAME remain normal. Repeat scene entry to check textures reload. Record F3's three-second average FPS and stutters for at least 60 seconds per quality at your normal resolution. Approximately 60 FPS on your real GPU remains the target; cloud software-renderer observations do not verify it.
