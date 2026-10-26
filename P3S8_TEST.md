# P3S8 — Battle royale completion and planet guardian gangs

Starting local/remote baseline: `c05a096f6e46d8ffe97668019b13e39f612c11c7` (verified Phase 4), branch `work`. The working tree was clean before P3S8; the interrupted session's Part A edits were recovered and preserved. Part A must be verified, committed and pushed before Part B starts. No main, destructive Git, deployment settings, production secrets or original image assets are changed.

## Part A — implemented

- Always-visible 180px upper-right radar, N toggles to 280px. M holds a centered full map, Tab holds standings and prevents browser focus navigation. No existing M/N binding was found. These overlays never pause simulation or acquire DOM focus, and ignore typing/key repeats appropriately. Blur, leave, end and reset clear held overlays/listeners. Existing controls including F3/F4 remain intact.
- Maps redraw at approximately 10 Hz through the existing scene update, independently of camera zoom. Offscreen 2D buffers provide the same map in Canvas/Low and WebGL/Standard; only the original Phaser canvas is attached to the DOM. New HUD placement and objective-arrow clearances account for both radar sizes. Planet icons distinguish ice, volcanic, terrestrial and moon; capture/contest/completion rings, destroyed-planet hiding, Galaxy pickups, local heading, current dark Horizon region and authoritative next boundary are shared between both maps. Full map includes planet names, Horizon stage and countdown. Completion color means per-pilot capture history: the game does not have permanent exclusive territorial ownership.
- Enemy dots use a fixed **1650 world-unit** radius (1.5 × default camera width), independent of map/browser zoom. Only living locked-roster human/bot competitors appear. Dead ships and aliens do not. Accepted shots record authoritative firing origins and audiences inside **2750 units** at shot time; rejected shots never ping. Recipients receive only entitled pings, expiring after two simulation seconds or source elimination. Each listener retains only the latest shot they actually heard per actor (at most 56 actor/listener pairs), so a later inaudible shot cannot erase or reveal information about an earlier ping. No all-enemy radar-coordinate list is added.
- **Privacy limitation:** existing gameplay snapshots already replicate other players/projectiles/objectives globally within a room. Dot filtering is a presentation rule; it is not server-side fog of war. The new per-recipient firing-ping field is server-filtered. Existing combat/render synchronization is preserved; true secrecy for baseline positions would require a broader replication redesign.
- Authoritative standings retain the launch roster, including disconnected participants, and track eliminations, damage actually absorbed (not overkill), survival time, successful Galaxy capture completions and shield walls. Counts are updated at accepted server operations, not inferred from client animations. Death/drop/pickup repetition cannot double-count captures or walls. Aliens may still attack through existing mechanics but cannot win or count as living competitors.
- Eliminations sharing a simulation timestamp share competition rank. Later casualties rank above earlier casualties, without iteration-order tie breaking. Same-tick finalists share #1 for a draw. The existing final-Horizon durability rule remains authoritative: its selected winner receives #1 and other same-tick finalists #2. No new victory rule is introduced.
- Server kill feed: at most five entries, six-second lifetime, final 1.5-second fade, one competitor-elimination event per participant/round. Projectile metadata captures the actual weapon name/rarity at firing time, so switching weapons cannot misattribute the kill. Tractor, alien melee, Inferno burn, Horizon and hazards retain their actual sources. No assist system is invented. Radio remains separate.
- Local first elimination shows `YOU PLACED #X OF Y` and the authoritative killer/weapon/cause for 2.5 simulation seconds. The alien banner follows, accurately describing existing flight/melee and inability to win. The existing three-second server respawn remains unchanged; the final half second is still respawn-pending. Subsequent alien deaths keep the ordinary respawn card, without another competitor-placement event. Persistent ALIEN HUD remains.
- Existing end/replay flow now displays WINNER/name or DRAW, all final standings and local placement/kills/damage/time/captures/walls. Existing PLAY AGAIN returns the same room to a fresh lobby and requires START; MAIN MENU leaves through the existing cleanup. Old overlays/statistics disappear on replay.

## Files and architecture

New: `shared/battle.ts` (DTOs/radar rules), `server/battle.ts` (round-owned authoritative statistics and entitled shot records), `src/battle-hud.ts` (maps, standings and presentation), `tests/battle.test.ts`, `tests/battle-network.test.ts`, `tests/battle.spec.ts` and evidence in `docs/art-reference/p3s8/`.

Integrations: `server/rooms.ts` attaches authoritative damage/elimination callbacks; `combat.ts` reports accepted absorbed damage and preserves source metadata; `projectiles.ts`, `galaxy.ts` and `melee.ts` attach actual weapon sources; `objectives.ts` and `survival.ts` count accepted operations; `match.ts` starts/clears/finalizes telemetry; `game.ts` adds standings and individually filtered pings to existing snapshots. `shared/combat.ts`/`protocol.ts` add typed metadata. `src/main.ts`, `objective-visuals.ts`, `style.css`, `menu.ts` and `index.html` integrate presentation. AGENTS.md records the authorized priority. Existing attribution and alien presentation tests are updated to assert the required new behavior, not removed or weakened.

Phase 4 strategy scheduling, SDK, budgets, source labels and Intel authorization remain in place. No weapon damage/cadence, movement tuning, capture duration, Horizon schedule or alien balance changes are made in Part A.

## Part A verification

- Full Node suite: **457/457 passed**. This includes eight new battle cases and one eight-client network case, existing Phase 4 tests and all previous survival/inventory/weapon/capture/lifecycle regressions.
- Client build: **passed**, with the pre-existing large Phaser chunk advisory. Server TypeScript build/check: **passed**.
- Focused browsers: **4/4 passed** (Canvas/Low and WebGL/Standard battle flow, plus normal/150ms-jitter alien lifecycle). The battle test exercises near/far red dots, accepted/rejected and expired/out-of-range shot pings, N sizing, M/Tab, held WASD/Shift and firing, placement/cause, alien transition, winner statistics and replay.
- Full existing + new browser suite: **71/74 passed** in the first 15.5-minute run; three software-renderer fixture waits failed before their intended checks completed. After corrections, the final affected set passed **10/10** in 3.2 minutes (battle, aliens, all launch/flash cases and visual studies). Thus all 74 distinct browser cases passed across these runs; this is **not** claimed as one all-green full run after the corrections.
- Initial failures: one disconnect test incorrectly tried to disconnect a socket-free bot through RoomStore's human membership API; it now joins/leaves a real human. The old projectile assertion expected source metadata to be absent; it now asserts the exact weapon/rarity. The initial browser fixture used nonexistent `#name` instead of `#display-name`, consuming its 90-second deadline; the selector is corrected. No production workaround or assertion deletion was used for those failures. The subsequent full run exposed two inherited WebGL fixture waits that gave cold scene/connection startup only five seconds: they now await actual scene readiness separately with a 15-second cold-start allowance. A visual study also budgeted only 10 seconds for the real 9.2-second launch; it now uses the authoritative countdown + collapse + launch constants plus two seconds for delivery. Runtime frame checks, cinematic timings and the 150–300ms rendered-flash assertions remain unchanged. Final review also fixed listener-specific ping history, literal name delimiters, nonliving roster counts and scaled radar backgrounds, with regression coverage.

## Five complete consecutive FILL matches

The automated case uses one backend and the actual 30 Hz game loop from lobby/countdown/launch to natural winner determination, then the existing replay/fill functions, five times. It does not force winners, shortcut Horizon, grant bot resources or duplicate the engine. Eight identities remain stable; each round produces complete placements and verifies all seven bots resume movement; old pickups, Galaxy Guns, walls and capture histories clear; all pending model work becomes inactive; deliberately late mocked replies cannot recreate AI state after reset. The process-level hourly ledger remains independent of per-match resets.

Exact per-match ticks, winners and mean/p95 server tick durations are in [part-a-five-matches.json](docs/art-reference/p3s8/part-a-five-matches.json). These are accelerated Node simulation timings, **not rendered FPS or real-GPU acceptance**. An additional real eight-socket test verifies identical standings and per-recipient ping filtering while eight ships, eight walls, world pickups and three Galaxy owners are present. Its 300-tick measurement was mean **3.014ms**, p95 **4.007ms**; see [part-a-eight-client.json](docs/art-reference/p3s8/part-a-eight-client.json). This measures server tick/serialization cost, not browser rendering. No evidence required adding pathfinding or another stuck-bot controller; the existing Phase 4 navigation watchdog remains.

## Performance and limitations

Cloud environment: Linux, Node 24, Chromium Canvas and SwiftShader software WebGL. The minimap redraw is throttled to 10 Hz; no new animation/timer loop is created. The five-match log records actual server tick cost. Existing browser cases cover eight-ship planet rendering, pickups, walls, Galaxy effects and Horizon in both qualities; they do not establish real desktop-GPU frame rate or a worst-case combined stress guarantee. The full browser run sampled 120 active frames per renderer: Canvas/Low mean **16.667ms**, p95 **18.4ms**; SwiftShader/Standard mean **78.443ms**, p95 **230.4ms**. These are software-renderer frame intervals, not target-hardware gameplay FPS or a controlled baseline comparison. Target-GPU F3 FPS, separate-device play, narrow viewport layout and human balance acceptance remain manual.

OpenAI credentials are not available. Mocked strategy tests and fallback radio are not live API verification. Do not claim live requests succeeded. Follow PHASE4_TEST.md for secure live testing; no new key, model, deployment or cost configuration is required by Part A.

## Part B

**Not started before the Part A checkpoint.** Guardian features, tests, tuning, evidence and the separately reversible commit will be recorded here only after Part A is pushed and verified clean. Guardian indicators are not presented as implemented in Part A.

## Windows manual acceptance

In PowerShell:

```powershell
cd C:\Users\rje10\Downloads\project-horizon
git status --short
git branch --show-current
git pull --ff-only origin work
npm ci
npm run server:dev
```

Confirm `work` and preserve local edits if pull refuses. In a second terminal in the same folder, run `npm run dev`; open `http://localhost:5173/?devrooms=1` and use `http://localhost:3001` as backend. Choose FILL GAME → PLAY → START.

1. Check the 180px radar throughout lobby/launch/play. Press N repeatedly for 280/180 sizing. Hold M and Tab separately/together while holding WASD/Shift, aiming and firing. Release overlays, switch slots, F-pickup, G-drop, R-reload, E-tractor, Q and 4/5. Check no focus theft, stuck keys or flight freeze. F3/F4 retain their existing functions.
2. Check planet type icons, capture/contest/completion, Horizon current/next boundaries and countdown; watch consumed planets disappear. Watch nearby red dots and short firing pings, without treating this as full network fog of war. Check radar at both sizes and map labels at your window size.
3. Join with a second human before START. Compare standings, kills and remaining competitors. Test combat/Horizon elimination and same-tick ties. Confirm a 2.5-second placement/cause card, then the alien banner, normal three-second respawn, persistent ALIEN HUD and inability to win.
4. Finish a match. Check winner/draw, all rows, local placement, kills, actual damage, survival time, captures and walls. PLAY AGAIN must return everyone to a clean lobby. Repeat at least five times without restarting; test MAIN MENU and a fresh PLAY.
5. F3 → graphics quality Standard, then Low. Record the F3 FPS overlay during eight-ship play with pickups, Q walls, Galaxy fire and Horizon pressure. Verify kill-feed/radio/HUD/map readability. These Windows GPU measurements are still required; cloud measurements are not substitutes.
6. If testing live strategic AI, use the private git-ignored `.env` setup in PHASE4_TEST.md; solo F4 requires no Intel flag. Never put keys in frontend configuration, screenshots or commits. Stop both terminals with Ctrl+C.

## Git checkpoints and delivery

Baseline local/remote: `c05a096f6e46d8ffe97668019b13e39f612c11c7`. Part A and Part B use separate commits on work. Check exact local/remote SHA equality with:

```powershell
git rev-parse HEAD
git ls-remote origin refs/heads/work
git status --porcelain
```

The Part A SHA and remote verification will be recorded after its checkpoint. Final HEAD is also provided in the completion report (a commit cannot embed its own hash). No main modifications, force-push, automatic deployment or production-secret changes are authorized. Publishing the current frontend and configuring deployed AI remain owner actions documented in PHASE4_TEST.md.
