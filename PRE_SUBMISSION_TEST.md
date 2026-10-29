# Pre-submission reliability and UI cleanup

Scope: `work`, continuing the accepted P5B release (`456f26e`, P5B source `83d7e26`). No supplied artwork, weapon balance, pilot passives, AI integration/configuration, API credentials or billing changes. OpenAI setup and live API acceptance are deferred; no provider calls were made for this pass.

## Findings and corrections

- **Final collapse:** the normal last-survivor evaluator could finish stage 4 with one pilot still alive, before that pilot was consumed. Eligibility now locks at the beginning of the first final-collapse simulation tick, before combat, and normal victory waits for consumption. The final consumption tick selects its highest pre-consumption hull + shield; exact equality shares first place with DRAW. Old aliens cannot enter the eligible set or win from an earlier consumption record. Ordinary pre-collapse victory and solo WAIT behavior are retained. If the locked set was empty at collapse start, the explicit environmental outcome is `THE HORIZON CONSUMED ALL PILOTS`. Deaths from other causes after eligibility locks do not resurrect an earlier casualty as winner.
- **Results:** the original standings copied the consumed body's ALIEN status. Final result status now independently marks the winner WINNER (exact tied winners DRAW); same-tick collapse placements use durability consistently. Results show `LAST PILOT STANDING — survived the Horizon longest` for a collapse winner. The pilot named HORIZON is displayed normally and is distinct from the environmental outcome. Pending-respawn copy is cleared at round end; replay clears the winner explanation and eligibility records. Final statistics freeze at result finalization, so later departures or alien-body changes cannot rewrite the standings.
- **HUD:** lobby controls occupy the left lane, radar and combat the right lane, and announcements the center. Capture sits above survival utilities, including the healing ring. Danger/guardian/swap messages retain separate spaces. `Pilots remaining` counts eligible human/bot competitors and excludes aliens. Separate connection/bot/alien counts clarify membership. Obsolete phase labels and default technical connection chatter were removed; F3/F4 remain available.
- **Feedback:** existing authoritative, bounded announcement IDs/times deliver capture notices (`BOREALIS CAPTURED — CRYO STREAM IS LIVE`) and Galaxy pickup descriptions: slow, burn, homing, and spin-up/sustained spread. Rendering replaces the current bounded feed instead of appending per snapshot; notices expire after six simulation seconds and clear on replay/scene teardown. No extra timers/listeners or new gameplay effects.
- **Onboarding:** the existing Settings hotspot has an opaque code-rendered `CONTROLS — Keys & Tips` label over its baked wording; original image bytes remain intact. How to Play now separates goal/start/actions/objectives/elimination/final collapse, links to the full Controls screen, and places F3/F4 in Advanced. Both references explain that refresh/leave forfeits active participation; no reconnect feature was added.

## Verification

Local checks and screenshots are independent of hosted acceptance. Browser tests use actual socket/UI flows; accelerated authoritative clocks/fixture positioning are test-only, with no public lifecycle bypass.

- Node regression: **539/539 passed**, including eight new focused result cases, five complete FILL lifecycle/replay matches, and existing room/host-transfer, survival, inventory, focus and movement checks.
- Client build: passed; existing Phaser bundle-size advisory remains.
- Server typecheck: passed.
- Browser regression: initial full run **67/88 passed** with two workers; the 21-case serial rerun passed **17/21** after corrections. Final affected-case rerun **9/9 passed**, covering both alien-lifecycle paths, both battle/render paths, both combat-HUD/focus paths, and all three new submission scenarios. **87 of 88 cases passed across the full run and targeted reruns; this is not a claim of a single green 88-case full run.** The unchanged software-WebGL flash assertion still failed (352.8ms vs its 300ms upper bound).
- New browser cases cover three viewports, real two-human READY/START, movement after START/copy/inventory DOM clicks, capture/F pickup messages, staggered final consumption, WINNER state, exact draw, environmental outcome, replay, departure victory and room cleanup.
- Existing practice cases exercise Canvas/Low and Standard/software-WebGL, all four actual captures/Galaxy Guns, selected pilot/passives and three entry/exit cycles using both Esc and Back to Menu. The existing inventory-focus regression remains enabled.

Screenshot evidence: [submission captures](docs/art-reference/submission/), at 1366×768, 1440×900 and 1920×1080. Early browser verification found and corrected the new result explanation persisting after replay. F3 could intercept START and, in narrow windows, the room bar intercepted Back to Menu; separate responsive lanes fix both without forced clicks. The four-biome Canvas/WebGL material, 120-frame sampling and cleanup test subsequently passed in 1.1 minutes under its unchanged 180-second deadline. Accelerated test bursts intentionally drop volatile snapshots; the fixture now drains reliable transport before asserting the final snapshot tick, without relaxing assertions or gameplay timing. The alien-lifecycle fixture uses its existing one-intent client fire path (also used for its melee checks), avoiding zero/two automatic-fire requests from software-rendered timed pulses plus fake lag; all exact sequence/damage assertions remain, and separate real-keyboard held-fire tests remain enabled.

## Release identity and production artifact check

Source commit: `56219a41a8bf46a98b5b521047fa76d1e7a55a57`. Pages build: **`client-22cefbcce76f`**, source metadata `56219a41a8bf`, Render URL `https://project-horizon-server.onrender.com`. The later artifact/documentation commit publishes these exact files; its SHA is distinct from source-at-build metadata.

`npm run build`, `npm run build:server` and `npm run build:pages` passed. Current emitted JS/CSS contain no key-shaped values, OpenAI key configuration/endpoint, or development inspection handles. Original `public/` artwork, weapon/fighter values, AI implementation/configuration, dependencies and deployment URLs are unchanged.

The **local production Pages artifact** passed a separate real-input/browser smoke without development state handles: eight pilot PNG cards decoded, Controls opened/returned, the selected Horizon pilot flew/picked up/fired/reloaded, all four planets were reached by normal flight and captured with real timers, all four Galaxy Guns were claimed/fired/dropped, and two separate browser contexts joined/readied/launched/flew independently. Guest departure produced results; Main Menu cleaned up both sessions. Zero JavaScript/asset errors; backend health ended at zero players/rooms. This used a local backend override and local WebSocket transport, **not the public Render service or a live WSS acceptance check**. No FILL/AI/provider testing was performed in this production smoke. See [production report](docs/art-reference/submission/production/report.json), [practice](docs/art-reference/submission/production/practice.png) and [Controls](docs/art-reference/submission/production/controls.png).

## Public release / limitations

Established Pages process: `npm run build:pages`, using the existing HTTPS Render endpoint from `.env.production`. Pages source remains `work` → `/docs`; existing Render service is expected to auto-deploy `work`. No main or service-plan changes.

This environment still denies requests to both Pages `build.json` and Render `/health` with proxy CONNECT **403**. Consequently this pass cannot claim hosted frontend/backend version convergence or live flow acceptance. The owner independently verified the prior public build; that is not evidence for this new release. The prepared cloud-network allowlist draft from the deployment pass still needs owner publishing before live checks are possible. No OpenAI credential investigation or live API testing is needed for this cleanup.

Real Windows GPU performance, human balance and cross-device acceptance remain manual. Software-rendered cinematic flash timing has been intermittently outside its existing timing assertion in earlier milestones; assertions and cinematic durations remain unchanged.

## Windows update/run and acceptance

**Stop both running Horizon terminals with Ctrl+C before `npm ci`**, to avoid Windows Node/Vite file locks. In PowerShell, from your existing checkout (preserve any local edits if Git refuses the pull):

```powershell
git switch work
git pull --ff-only origin work
npm ci
npm run server
```

In a second PowerShell terminal, from the same checkout:

```powershell
npm run dev
```

Open `http://localhost:5173` (server defaults to `http://localhost:3001`). No AI setup or key is required for fallback gameplay.

1. How to Play → Full Controls → Back to Menu; reopen Controls and Esc. Confirm the visible menu label, readable rules and forfeiture warning.
2. Free Flight: move/boost, pick up with F, click a weapon slot, fly immediately, fire/reload, capture each planet, claim/fire/drop each Galaxy Gun. Confirm capture/effect messages and no repeated notices from unchanged snapshots. Exit/re-enter three times using Back to Menu and Esc.
3. Two browser profiles/tabs: host WAIT/PLAY, guest JOIN WITH CODE, guest READY, host START. Move after all DOM actions; confirm both ships launch and fly. Leave/refresh the guest; the host should receive the ordinary victory. PLAY AGAIN requires a new READY/START; returning home should not retain players or background sessions.
4. FILL/PLAY/START: observe all seven bots, ordinary play, then final collapse. Only currently eligible pilots may win; the last consumption wins, same tick uses pre-consumption hull + shield, exact tie draws. The consumed winner must be WINNER, not ALIEN. The environmental banner must never substitute for the pilot named HORIZON. Replay and leave.
5. At 1366×768, 1440×900 and 1920×1080, check lobby/radar, capture/utilities (including active healing), inventory/swap, warnings and announcements. N expands radar; hold M/Tab for overlays. Optional F3 reports actual FPS; use your Windows GPU for performance acceptance. F4 remains optional Intel; live AI acceptance stays deferred.
