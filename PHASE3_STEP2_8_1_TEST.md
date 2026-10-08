# P3S2.8.1 — Ship visual polish and uniform hitbox alignment

Branch `work`; verified clean baseline `a9c264f11124063eea8575183e5dbae4a8354713` in `rje101805-svg/project-horizon`. All eight runtime PNGs decoded before editing. All eight originals and all eight runtime PNGs remain byte-for-byte unchanged from that baseline.

## Size and alignment

Every normalized main hull is 40% larger, with the original aspect ratio, hull origin and +90° local rotation correction retained. No texture regeneration, extra shaders, halos, particles or texture-resolution increases were needed. Larger native artwork improves detail/silhouette visibility while preserving its supplied colors. Provisional artwork similarities remain.

| Ship | Previous scale | New scale | Increase |
|---|---:|---:|---:|
| Redline | 0.133103 | 0.1863442 | 40% |
| Dreadnought | 0.159596 | 0.2234344 | 40% |
| Rocket | 0.171380 | 0.2399320 | 40% |
| Horizon | 0.192247 | 0.2691458 | 40% |
| Nova | 0.159511 | 0.2233154 | 40% |
| Zenith | 0.163851 | 0.2293914 | 40% |
| Raider | 0.155294 | 0.2174116 | 40% |
| Eclipse | 0.158156 | 0.2214184 | 40% |

The main opaque hull footprints, measured from the existing origins and excluding manually estimated flame-tail regions, are approximately 29.4 world units in radius. A shared 30-unit circle is the smallest practical whole-unit radius covering that normalization. Browser coverage iterates all eight runtime textures' alpha >=128 pixels within their established main-hull regions and checks their scaled distance against the shared radius. Glow fringes, flames and tiny decorative details are not solid hull geometry.

Human labels move from +27 to +44 units below the entity. Local human combat bars move 17 units upward (their anchor becomes -72 rather than -55), retaining their centered, unrotated layout and all shield/health/reload behavior. Alien artwork, label offset and bar offset remain unchanged. Cosmetic tractor nose offsets increase with artwork size; authoritative tractor origin, reach and targeting remain unchanged.

## Shared collision radius and audit

Previous physical projectile ship-body radius: **18 units**. New radius: **30 units**, a **66.67% increase**. This exceeds the 40% visual enlargement because the previous normalized hull radius was already approximately 21, outside the former 18-unit hitbox.

`shared/ship-geometry.ts` defines the only numeric ship-body radius, `SHIP_HITBOX_RADIUS`. No design-specific collision fields exist. Readers:

- `shared/projectiles.ts`: `BASIC_BLASTER.shipRadius` aliases the shared constant for compatibility.
- `server/projectiles.ts`: existing swept ship collision reads that alias and adds the unchanged 3-unit projectile radius. Combined radius changes from 21 to 33. The earliest-contact algorithm, owner exclusion, lifecycle checks, damage and projectile trajectory are unchanged.
- `src/main.ts`: development F3 hitbox rendering imports the shared constant directly.
- Boundary and browser tests import that same value; cosmetic ship configuration never supplies gameplay geometry.

Other audited systems intentionally remain unchanged:

| System | Existing geometry / decision |
|---|---|
| Client projectile prediction/view | Visual-only; no client collision, hit claim or damage calculation exists. |
| Ship-to-ship collision | Not implemented. Ships can overlap; no new collision system was added. |
| Primary planets, distant bodies and asteroids | Client-only scenery; no physical collision or projectile/tractor obstruction exists. |
| Tractor targeting/pull/lock | Center-distance 220-unit reach and 60° cone, independent of body radius; no radius-based capture/contact check. |
| Bot targeting and maneuvering | Center-based nearest target, 100-unit retreat / 320-unit orbit / 650-unit action decisions. These are strategy distances, not physical collision avoidance; no obstacle-navigation system exists. |
| Alien melee | Independent center-based 60-unit reach, not combined body radii. |
| Black-hole death/gravity | Existing swept center contact against event-horizon radius and center-based region/gravity geometry; no ship-radius dependency. Preserved. |
| World edges/spawns | Existing 20-unit center margin, 180-unit spawn separation and black-hole clearance; flight/spawn policy preserved. |

Projectile speed/size/damage, fire rate, reload, muzzle offset (28), movement/boost/turning, health/shields, tractor rules, bot strategy, match lifecycle, networking, prediction/reconciliation, environment and quality controls are unchanged. The larger uniform projectile target circle is the only gameplay adjustment.

## F3 circles

Development F3 adds one persistent world-space Graphics object, hidden during normal gameplay. While F3 is open it draws thin cyan, 30-unit outlines at the latest authoritative snapshot centers of active, positive-health participants, including bots and aliens. OUT/dead entities are omitted. Camera scroll/zoom transform the circles normally; circles do not inherit ship rotation. At most eight circles are drawn, with no extra collision loops, textures or image decoding.

The outlines deliberately represent authority. Under prediction/interpolation or network delay they can differ from the currently rendered sprite center; they do not move the hull or change simulation. At a stationary synchronized fixture, all hull pivots coincide with circle centers. The existing FPS and other diagnostics remain intact. Production builds omit this development-only visualization.

## Automated and visual verification

- Node suite: **212 passed**, including all existing tests and two new geometry checks.
- New boundary checks exercise every server color/design slot: swept grazing hits just inside the new combined radius damage the target; just-outside grazes miss. Tangent segment contact is included.
- Existing hit-receipt tests retain exact contact assertions, now derived from the shared body/projectile radii. Contact moves 12 units earlier, from x=249 to x=237 in that fixture; damage, count and tick assertions remain intact.
- Existing normal/lag HUD tests retain follow/rotation assertions with the new cosmetic vertical clearance.
- Extended ship-art browser coverage checks all eight hull footprints, four headings per design, cross-client assignments, exact authoritative F3 centers/radius, debug visibility, texture cleanup/recreation, and Standard/Low captures.
- Initial screenshot fixture run reached hull/F3 checks but timed out serializing a returned Phaser ScenePlugin object. Its resume call now returns nothing; the test timeout was not increased.
- Full browser suite: **44/44 passed** in 9.0 minutes, including four-planet Canvas/SwiftShader, normal/lag alien/reset, combat, bots, prediction, projectiles, tractor and winner/zero-human checks. No unresolved timeout.
- Final review restored the original alien label clamp offset; focused normal/lag alien + reset and ship-art rechecks **5/5 passed**. Refreshed captures keep all eight labels clear of the HUD. World-space circle scale/scroll factors are explicitly checked.
- Client TypeScript/Vite and server TypeScript builds pass; the existing Phaser bundle-size warning remains.

Before/after captures use the same viewport, camera zoom and frozen eight-player fixture. The before capture restores baseline scales and HUD/label offsets in the test only; source/gameplay implementations are not reset or swapped. Reviewed captures show visibly larger, transparent hulls inside the debug circles with readable labels and local bars. Final artifacts: [before](docs/art-reference/p3s281/before.png), [after](docs/art-reference/p3s281/after.png), [F3 hitboxes](docs/art-reference/p3s281/hitboxes.png).

Real-hardware FPS and owner visual acceptance remain manual. Canvas/SwiftShader verification does not establish the 60 FPS GPU target.

## Files changed

- `src/visual/ships.ts`: scales and cosmetic nose offsets.
- `src/main.ts`: human label/bar clearance and F3 circles.
- `shared/ship-geometry.ts` (new), `shared/projectiles.ts`: single radius constant and existing blaster alias.
- `tests/ship-geometry.test.ts` (new): authoritative inside/outside grazes across eight slots and tangent checks.
- `tests/ship-art.spec.ts`, `tests/ship-art.test.ts`: hull coverage, F3 geometry/visibility/world-space transform, comparison captures and updated cosmetic bounds.
- `tests/hit-feedback-server.test.ts`, `tests/combat-hud.spec.ts`: exact expected contact and HUD placement for authorized changes.
- `README.md`, this guide, and three PNGs under `docs/art-reference/p3s281/`: current milestone and review evidence.

## Windows manual testing

In PowerShell in the repository:

```powershell
git switch work
git pull --ff-only origin work
npm ci
npm run server
```

In a second PowerShell in the same folder, run `npm run dev`. Open Vite's printed address (usually `http://localhost:5173`), choose game-server URL `http://localhost:3001`, create a room, click **FILL GAME**, and then **Start match**.

Inspect all eight ships at your normal resolution/zoom. Use WASD/arrows, Shift boost, mouse/Space firing, R reload and E tractor. Rotate in all directions and confirm that hull centers remain fixed, the larger silhouettes are readable, labels/bars stay clear, and no rectangular backgrounds appear. Compare Standard and Low near dark space, bright nebulae and all four planet surfaces.

Press **F3**: active ships should have thin cyan hitbox circles. Stop briefly to compare the authoritative circle with the hull center; under lag/motion remember that prediction and remote interpolation display different time samples. Main hulls should fit inside; flames need not. Fire near hull edges and check shield/health feedback. Test eliminations, alien form, respawn, winner/reset and Back/Create/FILL GAME texture reload. Press F3 again: circles should disappear.

Record F3's three-second average FPS and visible stutters for at least 60 seconds per quality on your real GPU, targeting approximately 60 FPS. Include your resolution and graphics mode in feedback. No new tools or debug server flags are required.

## Remaining limitations

Supplied baked flames remain visible at idle; provisional Raider/Dreadnought and Eclipse/Redline remain visually similar. Translucent source glow and decorative protrusions may lie outside the normalized circle. The round hitbox necessarily includes empty space around slender hulls, equally for all designs. Authority circles may separate from rendered hulls under latency, as described above. The unchanged 28-unit muzzle may sit slightly inside Horizon's enlarged tip; no weapon spawn coordinate was moved. Planets, asteroids and ships remain non-colliding with each other. At the unchanged world-center margin, hulls can extend beyond the boundary line. Owner origin/scale review and real-GPU FPS testing are still required.
