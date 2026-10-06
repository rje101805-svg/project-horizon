# P2S5 Combat HUD — manual acceptance

Baseline: accepted P2S1–P2S4, work `5a4d8cc1e45b5e5c3a383e198c3b0545c31ae961`. P2S5 is presentation plus narrow server-to-shooter hit receipts. No P2S6, movement changes, new damage rules, elimination rules, or new minimap system.

## Local setup

In Windows Command Prompt, run:

```bat
npm ci
set NODE_ENV=development
set COMBAT_DEBUG=1
npm run server
```

In another terminal run `npm run dev`. Open three visible browser windows at the printed client URL; select `http://localhost:3001`, create a room in A and join it in B/C. Keep ships outside black-hole influence. F3 starts hidden. Space/left mouse fires toward the pointer, R reloads, F4 is DEV reset. Enable fake latency and ±30ms jitter inside F3 in each window when requested below, then close F3. Production has no enabled DEV controls.

## Exact retest procedure

1. With fake latency OFF and F3 closed, verify initial local cyan shield over green health, full bars, no permanent remote bars, and compact `AMMO 12 / 12` at top right beneath the existing minimap. The old large combat panel and `WEAPON —` are gone.
2. Fly straight, diagonally, boost and rotate. Bars follow your locally rendered ship upright, without affecting camera, input, FPS, prediction or reconciliation. Compare the accepted P2S4 feel. No new continuous DOM writes or timer is used.
3. Have A hit B once at full resources: A alone sees cyan `25`; B's local shield bar drops to half. A second hit displays cyan `25` and leaves B's empty outlined shield bar visible. The next hit shows white `25`, reducing health. C sees no numbers. Misses and rejected/cooldown shots produce no numbers.
4. For a split hit, restore B using the authorized DEV refill button. Use B's existing DEV Damage 35 once: shield becomes 15. A's next accepted shot shows separate cyan `15` and white `10`, reflecting actual server damage. Automated coverage additionally checks exactly cyan 10 / white 15 and clamped damage against 7 remaining health.
5. Fire rapidly at B: successive hits stay separate in vertically offset rows; split components have distinct horizontal positions. Each expires after 750ms. Keep firing/reloading to confirm no persistent text or buildup; numbers do not reveal remaining target HP.
6. Reduce B's health to 25 or below: B's local health bar changes to red. Zero health remains ALIVE under accepted P2S2 rules; do not infer elimination. Shield and health widths use their own maxima.
7. Fire A down to three rounds: compact ammo becomes amber at 3/2/1. Press R: the thin amber progress bar appears above A's shield, ammo remains authoritative and shooting remains blocked. After 1.5 server seconds the magazine refills and the reload bar disappears. Repeat with the final round's immediate auto-reload. Movement and damage during reload remain accepted P2S4 behavior; repeated R does not restart it.
8. Open F3. Confirm old numeric health/shield/reload, ping, FPS, server/snapshot rates, input acknowledgments, correction and projectile diagnostics still work. Debug appears below the game viewport, separate from ammo and map. At widths 1280, 680 and 375 pixels verify normal HUD/debug do not overlap.
9. Repeat steps 1–8 with fake latency 150ms each way and ±30ms jitter ON, F3 closed during play. Hits are delayed authoritative feedback, never predicted damage. Reload completion follows snapshots. Turn lag OFF and verify recovery.
10. With feedback visible or pending, test shooter/target F4 reset, black-hole death/respawn, target leave, shooter leave, disconnect/reconnect and fresh room. Old session/life/teleport/room receipts must disappear or be rejected; departed targets cannot reappear through delayed feedback. Respawn restores accepted combat resources. Fresh membership has no old numbers or bars.
11. Repeat sustained fire/reload and movement with only one connected client, lag OFF, debug OFF/ON. Check memory/object cleanup and P2S4-level responsiveness; automated tests verify bounds rather than inventing an FPS assertion.
12. Recheck P2S4 security: without COMBAT_DEBUG, and with NODE_ENV=production even when COMBAT_DEBUG=1, debug requests/reset are rejected. Fabricated client hit events, IDs, HP/ammo/damage claims do not mutate server state. Stop for owner acceptance; do not begin P2S6.

## Implementation and limits

- `shared/hit-feedback.ts` validates a bounded hit receipt: projectile/shot/tick, room, owner/target identities, existing membership sessions and life/teleport generations, world impact position, and actual shield/health damage. No remaining HP totals. `shared/protocol.ts` adds only a server event.
- `server/projectiles.ts` observes the existing single `applyDamage` result. `server/game.ts` sends the existing volatile snapshot first, then direct reliable receipts to each owning socket; reliable receipts otherwise could occupy the transport and skip that shooter's volatile snapshot. Nothing is broadcast to targets, spectators, other rooms or unjoined clients.
- `src/network.ts` uses the existing delayed incoming channel and guards connection epoch, current room, owner and reliable target roster. `src/hit-feedback.ts` additionally guards snapshot lifecycle/session, deduplicates projectile IDs, reconciles targets and clears lifecycle/room/disconnect data.
- `src/combat-presentation.ts` centralizes thresholds/colors, 750ms lifetime and cap 32. Active receipts are capped at 32 (at most 64 Text objects), dedup IDs at 128. Rapid same-target rows are spaced 18 world pixels. `src/damage-numbers.ts` creates objects only on new receipts and destroys them on expiry/removal. No new timer.
- `src/ship-combat-hud.ts` owns one local Graphics object, redraws only changed quantized values and follows the rendered ship. Reload smoothing is visual only, clamped below completion until authoritative state ends reload. Shield zero keeps its outline; health ≤25% and ammo ≤3 warn inclusively.
- `src/main.ts`, `src/hud.ts`, `index.html`, `src/style.css` wire cleanup and layout. Existing numeric values/debug controls move into F3; existing minimap stays unchanged and ammo is positioned below its reserved footprint.
- New tests: `tests/combat-hud.test.ts`, `tests/hit-feedback-server.test.ts`, `tests/combat-hud.spec.ts`. Existing HUD tests reflect the layout; multiplayer/projectile/reload fixtures open F3 before accessing its DEV controls. Their gameplay assertions remain intact.

## Validation commands

```sh
npm test -- --workers=1
npx tsc --noEmit
npm run build:server
npm run build
npm run build:pages
git diff --check
```

Check both production asset trees for absence of DEV inspection handles, debug request strings, fake jitter implementation and test instrumentation. Pages artifacts are synchronized under the existing work workflow; no deployment settings are changed. Automated results and final commit/build identifiers are reported with the implementation, not claimed as manual acceptance.
