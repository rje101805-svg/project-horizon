# P3S6 — Main Menu, Black-Hole Lobby and Cinematic Launch

Baseline: `7db04c87fb402769e4ede17a8c5d3fbcabb70e82` on `work`, including the P3S4.1 completion and inventory-focus movement fix. The approved `public/assets/ui/main-menu.png` is unchanged (1672 × 941 RGB). All existing image assets and weapon values remain unchanged. No Pages build or deployment settings are changed.

## Tier 1

The existing fixed 30 Hz server loop owns the replicated phases. Protocol `waiting` means LOBBY for compatibility; subsequent phases are `countdown`, `collapse`, `launch`, `active`, `ended`.

| Phase | Duration / transition | Permissions |
| --- | --- | --- |
| LOBBY | Indefinite, explicit valid host START | Normal flight with shared soft circular guide; no combat, tractor, loot collection or capture |
| COUNTDOWN | 3000 ms | Frozen controls and bot AI, synchronized 3–2–1 |
| COLLAPSE | 1800 ms | Server positions spiral inward; final whiteout hides transfer |
| LAUNCH | 1400 ms | Server tight orbit at existing map hole; map objectives and exactly 35 weapons + 35 ammo prepared |
| ACTIVE | Existing BR lifecycle | Evenly spaced randomized ejection; existing combat/capture/loot/bots/aliens/winner rules |
| ENDED | Explicit PLAY AGAIN or MAIN MENU | Frozen simulation/actions, immutable winner/draw |

START to controllable flight is about 6.2 seconds, quantized to the next fixed tick. Each ship launches from an in-bounds 360-unit ring around the unchanged map hole at (1200,450), with a 600-unit outward initial velocity. The hole's proximity to the top map edge prevents an in-bounds launch ring outside the entire 500-unit gravity influence. A separate two-second server launch deadline prevents receiving/dealing damage or tractor elimination and suppresses launch-only gravity/contact in shared prediction; normal Horizon physics resumes afterward. Protection is visible in the HUD and a ship ring. It cannot be canceled by an attack attempt. Existing alien respawn protection keeps its original behavior.

FILL creates a fresh private room for one human and seven deterministic bots. Bots already fly around the lobby, keep their IDs, and never gain socket membership. No other humans can join. WAIT joins the earliest eligible public WAIT lobby, otherwise creates one; max eight humans, zero bots, no admission after START. Earliest connected human is host, including an eliminated human if the prior host leaves during a round. All nonhost guests must READY, and at least two humans must remain. Host START counts as its readiness and locks the roster. Strict round/membership validation rejects duplicate, stale or forged intents. Leaving updates host and eligibility; final human departure destroys the room and bot/phase resources.

PLAY AGAIN is a server-owned full reset into the same mode's lobby. Names, membership, host and bot identities remain. Hull/shield restore to 100/100, each pilot receives a fresh Common Blaster with 30 magazine + 60 reserve; captures/history/ownership/rewards/statuses/protection/aliens/deaths/reloads/effects/inputs and world pickups are cleared. WAIT readiness resets, FILL bots remain ready. World loot is regenerated once at the next LAUNCH. A new START is always required.

START/READY are disabled until the ship/map assets finish loading. Lobby controls occupy the upper-right margin, combat inventory is hidden outside ACTIVE, and the lobby keeps dark stars while the normal map retains its original cosmic images.

The menu fits the image's original aspect within the viewport with letterboxing. `src/menu.ts` centralizes percentage regions used by artwork and controls; `?hotspots=1` displays labeled outlines. FILL/WAIT mode and trimmed 16-character name persist locally; empty names receive unique server-session `Pilot_XX` fallbacks. All names use safe DOM/Phaser text, including a six-entry server-owned elimination feed with five-second expiry and reset cleanup. Hosting never changes human/alien winner eligibility. HOW TO PLAY lists actual controls, capture, rarities and alien eligibility. FREE FLIGHT/PILOT SELECT/SETTINGS are clickable COMING SOON overlays. Escape, close and outside clicks dismiss overlays. Menu typing never reaches gameplay, and retained button/slot focus never locks flight. Missing artwork produces usable labeled controls.

## Hotspot calibration

Coordinates are percentages of the fitted image, never the page. Values are centralized in `MENU_HOTSPOTS`.

| Control | Left | Top | Width | Height |
| --- | ---: | ---: | ---: | ---: |
| FILL | 4.0 | 36.1 | 15.4 | 6.1 |
| WAIT | 20.6 | 36.1 | 18.6 | 6.1 |
| PLAY | 4.0 | 43.4 | 35.2 | 5.7 |
| FREE FLIGHT | 2.8 | 52.9 | 37.9 | 10.6 |
| PILOT SELECT | 2.8 | 65.6 | 37.9 | 14.8 |
| PLAYER NAME | 3.0 | 82.0 | 12.3 | 7.8 |
| HOW TO PLAY | 16.0 | 82.0 | 12.0 | 7.8 |
| SETTINGS | 28.8 | 82.0 | 11.9 | 7.8 |

The name input sits inside its region and covers only the baked value; the approved PLAYER NAME title/icon remain. FILL/WAIT height was calibrated to cover the full original button edge. The source image Git blob remains `55d99180e33a55afcbdc4b50239f10d52dfb156c`, identical to the baseline.

## Verification record

- Node suite: **339 passed**, zero failed/skipped at the initial complete logic verification. Full verification log: `/tmp/p3s6-tier1-node.log`.
- Full Playwright suite: **57 passed**, zero failures (10.7 minutes). After final lobby layout/readability changes, all **11 affected browser checks passed**, including both software renderers. No unresolved cloud timeouts remain.
- Client build and server typecheck pass; existing Vite large-chunk advisory remains.
- Focused production lifecycle tests cover modes, strict readiness/host/membership, non-ACTIVE damage gates, timings, inward collapse, loot preparation, 1–8 direction geometry, two-second protection and two complete resets.
- Real polling/WebSocket integration tests cover private rooms, launch snapshots, immutable results, explicit replay and stable bot membership. WAIT socket tests exercise host migration and forged/stale requests.
- Existing weapon/physics unit tests explicitly initialize ACTIVE test fixtures. These test-only helpers cannot run through a production endpoint. Public lifecycle tests use production RoomStore and real socket/UI APIs. Obsolete pre-START sandbox combat, mixed-human FILL, late spectator joins and six-second auto-replay expectations were replaced with P3S6 assertions; active damage/ammo/inventory/capture/prediction assertions remain.
- The first full browser run recorded42 passes/15 failures. Fixes included fresh room metadata for READY feedback, F3 controls intercepting START (the actual cause of the solar/visual timeouts), narrow F3 layout, obsolete automatic-reset assertions, remote interpolation barriers after adding actors, and a projectile fixture teleporting while lobby guide forces were still active. Exact projectile damage assertions and all120-frame renderer measurements remain. Final full suite is green.
- Forced inventory/Galaxy drops now clear equipment without spawning resources outside ACTIVE. Disconnects during countdown preserve the locked roster but assign evenly spaced directions to the remaining launch participants. Fallback names are unique across rooms. Added regression coverage verifies host transfer to the earliest connected eliminated human without awarding it victory.
- Auto-tick browser ACTIVE polls allow 10 seconds because the newly required transition itself lasts 6.2 seconds. No performance assertions were removed. Manual-tick fixtures flush socket probes and poll a fresh authoritative frame instead of racing listener registration.

## Screenshots

Saved and visually reviewed in `docs/art-reference/p3s6/`: menu hotspot captures at 1920×1080, 1366×768 and 600×900; unobscured full-viewport lobby; countdown; inward collapse; whiteout; map-hole launch. The browser suite checks all initial ship bodies/labels inside the camera and unobscured by DOM overlays. Standard/Low battle rendering and all nine weapon textures are also covered by the existing asset/graphics suite.

## Tier 2

Not started until Tier 1 verification, separate commit and push complete.

## Known limitations

Real Windows GPU 60 FPS, separate-device/network acceptance and subjective cinematic/audio review remain manual. The cloud WebGL checks use software SwiftShader and cannot establish hardware FPS. No P3S5/P3S7/P3S8 gameplay systems, Settings contents, Pilot Select contents, Free Flight or OpenAI integration are included. The tracked Pages client bundle was not rebuilt; a separate client release is needed to expose this flow on the hosted Pages site. Local development and the new production `dist/` build contain P3S6. No audio assets exist in the repository; audio hooks must remain silent without failed requests. Existing finite loot caps/TTL, high-latency F grace limits and projectile feedback dedup limitations remain documented in P3S4.1.

## Windows manual testing

1. Open PowerShell in the repository. Run `git switch work`, `git pull --ff-only origin work`, `npm ci`. Keep any local changes; a failed fast-forward needs review, never reset.
2. Server terminal: `npm run server` (port3001 by default). Client terminal: `npm run dev` and open the printed localhost URL (normally http://localhost:5173). Optional endpoint diagnostics use `/?devrooms=1` in development; the normal menu uses the configured default server. For a custom endpoint, set `$env:VITE_SERVER_URL='http://localhost:3001'` before starting Vite.
3. Check the approved full-screen menu at 1920×1080 and 1366×768 and in a narrow window. Add `?hotspots=1` to verify outlined buttons stay aligned with letterboxing. Edit name, reload, check persistence; select both modes. Open HOW TO PLAY and all COMING SOON panels, close with Escape/X/outside.
4. FILL GAME → PLAY: verify exactly your ship and seven already flying named bots, HOST label, private FILL and counts. Fly WASD/arrows and Shift for at least a minute. Space/mouse/E/F/G/R must not grant damage/loot/capture. The lobby must never start automatically. Click START GAME; observe synchronized 3–2–1, visible inward spiral, whiteout, tight map-hole spin and distinct outward ejection. Controls return after about6.2seconds. Confirm two-second shimmer/PROTECTED HUD; neither firing nor being hit can cause damage in that window.
5. Press F3 for the real FPS/receive-rate overlay. Record Windows browser/GPU/resolution and Standard/Low measurements after warmup. In development, F3 visual quality offers Standard/Low until Settings is implemented. Confirm Low omits costly ambience while keeping ships/labels/countdown/ejection readable. Do not interpret cloud SwiftShader FPS as hardware acceptance.
6. In ACTIVE, fly away from the map hole, verify normal Horizon danger, combat, 100hull+100shield, existing weapon values/reloads/ammo, F pickup including continued WASD after clicking a weapon slot, G/drop/reorder, tractor and all four planetary Galaxy Guns. Check ships/projectiles/labels over every planet and the 35guns+35ammo before any captures. Compare both qualities.
7. Finish a match; aliens cannot win. Verify copied winner or DRAW. PLAY AGAIN returns to the lobby with the same seven bots, fresh full human resources and no stale weapons/planets/effects, then waits for another explicit START. Repeat three times. MAIN MENU removes the room when its final human leaves.
8. WAIT test: open two separate browser contexts (normal + InPrivate, or two browsers), set distinct names, select WAIT then PLAY in both. Verify one shared room, two humans, zero bots, same names and one HOST. Guest toggles READY; host START is disabled before that and enabled afterward. Start; both see the same phases and launch. Before START, close/leave the host and verify the remaining earliest guest becomes HOST. A new WAIT player joins a lobby, never an already started match. Two FILL windows must always get separate rooms.
9. Leave/disconnect during lobby and each cinematic phase, confirm unaffected other rooms and no persistent input locks. After returning from any overlay or inventory click, release/repress WASD and fly immediately.
