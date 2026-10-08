# P3S2.8 — Custom ship artwork

Visual-only integration on `work`, starting from supplied asset commit `fc0ce3885b4d900097b5db8e4d2cdc58f0524642`. All eight original RGBA PNGs decoded successfully, contained recognizable artwork and genuine transparency, and remain byte-for-byte unchanged. No Pages deployment or P3S3 work is included.

## Rendering

`src/visual/ships.ts` is the editable appearance table: filename, texture key, hull origin, scale, nose offset and rotation offset. The existing local predicted and remote interpolated containers retain their positions and headings. Both humans and bots use the same cached Phaser Image. Alien graphics, opacity and lifecycle are retained; the custom image is hidden during alien form and restored on reset.

Replicated server-reserved color slots bind to the eight designs in `SHIP_COLORS` order. Those unique slots survive deaths/reset, agree across clients, and do not shift when another participant leaves. This adds no protocol fields or server logic. Queued OUT spectators are not drawn.

All supplied art points upward. A local image rotation of `Math.PI/2` makes heading zero point right. Each image uses a hull-centered origin ahead of the full PNG midpoint, excluding the baked flame tail (Zenith uses its circular midpoint). Per-ship scales fit substantial hull pixels into an approximately 21-unit circle, close to the previous 22-unit triangle extent; the authoritative 18-unit hitbox is unchanged. The editable estimates should receive owner visual review at normal zoom.

Only the drawn tractor cone's nose vertex uses the per-ship offset. Authoritative range, origin, targeting and forces remain unchanged. Existing indicators, shields, projectile positions, prediction and interpolation are unchanged. There is no separate existing muzzle-flash or dynamic boost-exhaust renderer to relocate.

## Runtime assets

PNG RGBA copies use high-quality Lanczos downsampling, preserve aspect ratio to integer-pixel rounding, retain transparency and flame/glow content, and add no padding. Gameplay preloads only `public/assets/ships/runtime/`; texture keys are reused and released during scene cleanup. No shaders, particles, per-frame texture generation or image decoding were added. The source files remain in `public/assets/ships/`.

| Source filename | Source pixels | Runtime pixels |
|---|---:|---:|
| ship-redline.png | 938 × 1004 | 239 × 256 |
| ship-dreadnought.png | 969 × 1446 | 172 × 256 |
| ship-rocket.png | 800 × 1491 | 137 × 256 |
| ship-horizon.png | 1007 × 1507 | 171 × 256 |
| ship-nova.png | 921 × 1473 | 160 × 256 |
| ship-zenith.png | 1336 × 1006 | 256 × 193 |
| ship-raider-provisional.png | 724 × 1002 | 185 × 256 |
| ship-eclipse-provisional.png | 983 × 1419 | 177 × 256 |

All eight runtime PNGs total 536,023 bytes (about 524 KiB), compared with 17,339,642 source bytes. Decoded RGBA data totals 1,468,416 bytes (about 1.4 MiB), excluding browser/GPU copies. Dimensions, alignment values and source bounds are recorded in [runtime-manifest.json](docs/art-reference/p3s28/runtime-manifest.json).

## Verification

- Node suite: 210 passed (208 existing plus two assignment/runtime-asset checks).
- Client TypeScript/Vite and server TypeScript builds pass. The existing Phaser bundle-size warning remains.
- Initial full browser run: 41/43 passed, including four-planet Canvas/SwiftShader checks, normal/lag combat, bots, prediction, projectiles, tractor, alien/reset and winner lifecycle.
- Two existing fixture issues were identified: the encounter test read visibility before camera/remote teleport presentation settled; the Canvas star counter still used the palette replaced in P3S2.7. The same visual fixture also omitted eight P3S2.7 cosmic textures from its exact resource counts. Tests now poll for all eight visible ships, count the actual current palette, and expect the exact updated texture totals (18 with preview / 17 after recreation). Assertions and test timeouts were not weakened.
- Final focused browser runs: visual.spec.ts 2/2 passed (Canvas and SwiftShader); environment.spec.ts + ship-art.spec.ts 2/2 passed. All 44 distinct browser tests passed across the full run and subsequent focused runs, rather than one clean full invocation. No unresolved timeout. The new test checks all eight designs at four headings, on two clients, and through leave/scene recreation.
- Source PNG byte comparisons against `fc0ce38` passed. No server/shared/network/prediction/interpolation or cosmic/planet/black-hole implementation files changed.

Two-client ship-art coverage checks eight unique designs, matching client assignments, heading/pivot transforms, Standard/Low captures, departure stability and texture release/recreation. Existing lifecycle coverage additionally checks image hiding/restoration around alien transformations. Test layout adjustments affect only fixtures, with no runtime ship switcher.

Visual evidence: [eight ships](docs/art-reference/p3s28/eight-ships.png), [Standard](docs/art-reference/p3s28/standard.png), [Low](docs/art-reference/p3s28/low.png), and [SwiftShader active combat](docs/art-reference/p3s28/combat.png). Captures show transparent backgrounds and recognizable silhouettes at game zoom. Cloud Canvas/SwiftShader checks do **not** verify real-hardware FPS.

## Remaining cosmetic limitations

- Supplied flames are baked into PNGs and remain visible at idle; no dynamic flame alterations were made.
- Raider resembles Dreadnought and Eclipse resembles Redline. The supplied provisional images are distinct but visually similar; replacement art is an owner decision.
- Diffuse glow/background remnants within source alpha are preserved, without opaque rectangular backgrounds in reviewed captures.
- The unchanged authoritative projectile muzzle is 28 units forward. Hull tips are approximately 14–21 units forward, so some ships have a small projectile-to-nose gap. Gameplay takes precedence over perfect cosmetic alignment.
- Owner review of all hull origin/scale estimates, maximum supported zoom and sustained real-GPU 60 FPS remains pending.

## Windows manual acceptance

In PowerShell in your repository:

```powershell
git switch work
git pull --ff-only origin work
npm ci
npm run server
```

Leave that terminal running. Open a second PowerShell in the same folder:

```powershell
npm run dev
```

Open the client address printed by Vite (usually `http://localhost:5173`), set the game-server URL to `http://localhost:3001`, and create a room. Click **FILL GAME**, confirm eight participants, then **Start match**. Inspect all eight custom hulls, readable names/health indicators and the supplied provisional similarities. Use a second browser window joining the room to compare assignments.

Use **WASD/arrows** to thrust, **Shift** to boost, mouse aim while idle, **left mouse/Space** to fire, **R** to reload and **E** for the existing tractor beam when another living human-form participant is in range/cone. Turn through all directions: hull centers should stay fixed on their entity, noses should follow heading, and no opaque rectangles should appear. Confirm firing, shields, tractor alignment, eliminations/alien form, winner and reset continue normally.

Press **F3** to show the existing FPS (3-second average) and rendering controls. Compare **Standard** and **Low** while fighting, boosting, near bright planet surfaces and purple/cyan nebulae. Inspect ship/label/projectile readability at your normal zoom and maximum supported zoom. Run at your normal resolution for at least 60 seconds per quality and record approximate FPS and visible stutters; the target is about 60 FPS on your real GPU. F3's existing camera-only planet views may help inspect backgrounds; return to automatic camera for combat. Repeat **Back to home → Create room → FILL GAME** and check assets reload without errors.
