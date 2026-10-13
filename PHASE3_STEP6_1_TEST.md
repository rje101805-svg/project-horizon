# P3S6.1 — Solo Match Start Fix

## Cause and fix

The menu passed its selected FILL/WAIT mode through FlightConnection to the server's existing `play` matchmaker. FILL defaulted on fresh browsers and populated seven bots. WAIT produced a human-only black-hole lobby, but client START eligibility and server `startMatch` both required two humans. Independently, `evaluateResult` immediately froze any ACTIVE round with one eligible survivor as a victory.

Fresh browsers now default to WAIT. Existing stored mode preferences are preserved: if FILL is already selected, choose WAIT once. The lobby explains “START solo or wait for players.” Host START doubles as the host's ready confirmation, as in P3S6; no additional button is needed. Guest READY remains mandatory when other humans are present. Server ownership, strict intent/round validation, asset-loading gate and duplicate-start protection remain intact.

WAIT allows one human to start. An ACTIVE WAIT round whose immutable launch roster contains exactly one participant bypasses victory/draw evaluation until the player leaves. This uses the existing gameplay loop, not a new mode or engine. Multiplayer rounds that lose players retain their original launch roster and still award the normal winner/draw. FILL still requires one human plus seven bots and uses ordinary victory detection. Solo elimination/alien behavior is unchanged; the session does not end automatically even after elimination. MAIN MENU/Back to home explicitly leaves the session and clears the empty room, allowing fresh entry.

The existing countdown (3 seconds), collapse (1.8 seconds), launch (1.4 seconds), flash and two-second launch protection are unchanged. Solo launch contains one ship and one launch angle. Inventory, weapons, movement, capture, rendering assets and quality settings are unchanged. WAIT remains a public lobby: another human may join before START; once the solo countdown starts, admission locks normally.

## Verification

- Full Node suite: **340 passed**, zero failures/skips (`/tmp/p3s61-node2.log`).
- Relevant Playwright suite: **9 passed in 1.4 minutes**, no unresolved failures/timeouts (`/tmp/p3s61-browser2.log`). Includes solo repeat entry/launch in Canvas and software WebGL, FILL victory/replay, two-human READY/host synchronization, menu compatibility, both cinematic renderers and both pickup/movement regressions.
- Client build and server typecheck: passed. Existing large-chunk advisory only.
- The entire browser suite was not rerun for this focused fix; the scoped suite above and full Node suite cover its lifecycle, graphics and input risks.

The obsolete solo-rejection assertions were replaced with stale-round validation in capacity/host-security tests; dedicated tests assert successful solo launch, immutable single-participant roster, duplicate rejection, continued ACTIVE state, no result even after elimination, final-member cleanup and fresh entry. Multiplayer readiness, victory/disconnect/draw and zero-human tests remain in the full Node suite.

The first solo browser attempt failed because an initially enabled but hidden START element was observed before the connection completed. The test now awaits the visible lobby control before checking eligibility and authoritative membership. No production behavior or timeout was changed to conceal that failure.

## Windows manual verification

1. In PowerShell on the repository, run `git switch work`, `git pull --ff-only origin work`, `npm ci`. Preserve local changes; do not reset them.
2. Run `npm run server` in one terminal and `npm run dev` in another. Open the printed localhost client URL (normally http://localhost:5173).
3. On a fresh browser, click PLAY directly. If an older saved FILL preference is highlighted, select WAIT FOR PLAYERS once, then PLAY. Confirm one human, zero bots and exactly one visible ship. Fly in the black-hole lobby; click START GAME to confirm host readiness.
4. Observe 3–2–1, inward collapse, flash, tight orbit and single-ship ejection. After protection expires, fly and fire; verify no VICTORY/DRAW overlay. Collect weapons with F while continuing WASD, switch slots, reload, use inventory/drop, capture planets and collect their Galaxy Guns. Existing elimination/alien rules still apply.
5. Use F3 and the development Standard/Low selector; check WebGL/Standard and Canvas/Low readability and record real Windows GPU FPS. Cloud SwiftShader results are not hardware FPS acceptance.
6. Back to home/Main Menu, PLAY and START again. Confirm a fresh single ship, no old room, duplicate countdown or stuck input. Repeat twice.
7. Select FILL: verify eight ships and normal victory. With two browser contexts select WAIT: verify guest READY is still required, both ships launch, and normal elimination/disconnect awards victory.

## Limitations

Real-GPU FPS and separate-device acceptance remain manual. Existing P3S6 silent audio hooks and unreleased hosted Pages bundle remain unchanged; this verification uses local development and the production dist build. No main changes, new dependencies or visual assets are included.
