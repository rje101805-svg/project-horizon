# P2S4 reload / ammo manual acceptance

Baseline: accepted P2S3 `31121a4131a227f5b17fa1175c03f08cad9b8c5b`. This implements reload/ammo only; P2S5 remains out of scope. Older guides' R reset, F refill and Shield Up instructions are historical.

## Local setup

Update `work` and restart both processes. In the repository root run `COMBAT_DEBUG=1 npm run server` for authorized local debug reset/refill, and `npm run dev` separately. Use the displayed local server URL (default http://localhost:3001). Start with fake network OFF. Two browser clients in the same room are needed for damage testing. Normal reload/fire work without COMBAT_DEBUG; production vetoes debug even with the flag.

Controls: WASD/arrows and Shift retain flight behavior; mouse/Space fires, **R reloads once per key press**, F3 shows debug state. **DEV F4** or the marked DEV reset button performs the retained living flight reset when server-authorized. It never heals/refills and is blocked while dead. The DEV refill button remains in F3, is rejected during reload, and has **no F shortcut**. Do not use refill during ordinary reload acceptance.

## Expected rules

Magazine 12; reload duration 1500ms / 45 server simulation ticks; existing 200ms fire interval and projectile tuning unchanged. Partial/empty active ALIVE positive-health players may reload. A full magazine or an already-active reload is a no-op/rejection. Only the server tick completes reload and refills to 12. Requests cannot restart, shorten, extend or complete it. Moving and taking damage do not interrupt it. Zero-health state still does not eliminate ALIVE, but cannot initiate new combat actions; an existing reload continues in the active simulation. Black-hole death/respawn retains existing central combat reset behavior.

The final accepted round spawns normally, consumes ammo to zero, then immediately starts reload without a thirteenth request. An otherwise-valid empty/not-reloading fire attempt is rejected and starts reload as fallback. During reload no new shot, ammo consumption, damage, cooldown reset or cap change is caused by firing requests. Existing in-flight bullets continue normally.

The normal HUD shows snapshot ammo and RELOADING; F3 shows authoritative remaining time/progress. Client display delay never decides completion. Reload intents contain only a positive monotonic sequence, room code, server-issued reloadSession membership ID and current life/teleport markers. Unknown fields are rejected. The membership ID changes on leave/rejoin (even the same room code), survives respawn/reset, and is an identity check rather than an authorization secret. Known reload suppresses prediction; a stale predicted request rejected by the server cleans up through existing result/timeout handling. Accepted final-round and post-reload shots preserve P2S3 continuous handoff.

## Acceptance steps

1. **Partial reload:** Begin at 12. Tap Space three times more than 200ms apart, then press R once (also hold R to verify no repeats). Observe 9/12 and RELOADING rather than instant refill. Try firing and keep flying: no new shot and movement continues. At approximately 1.5 seconds, observe 12/12, no RELOADING, and working fire again. R must not reset ship position. Press R again mid-reload to verify its original completion time stays unchanged.
2. **Full magazine:** At 12/12 press R. No reload or flight reset occurs.
3. **Auto-reload:** Start at 12/12 and deliberately tap twelve times, spacing them by more than 200ms. Release Space after each tap, including the last. The twelfth projectile must appear and ammo must reach zero with RELOADING immediately, without pressing R or firing again. Repeated fire during reload must create no new projectile and not restart timing. After approximately 1.5 seconds ammo becomes 12; fire again. Also hold Space through an entire empty/reload/refire cycle and check cadence and authoritative ammo.
4. **Damage while reloading:** In the same room, A fires several rounds and presses R. B shoots A during that reload. Verify normal shield HP first, health overflow second; the original reload deadline still completes and refills A. Flight must remain available. No passive shield refill occurs.
5. **DEV reset/refill:** With COMBAT_DEBUG=1 and non-production server, move then press F4; safe flight reset still works without changing ammo/health/shield. R remains reload. F must not refill. F3's marked DEV refill remains useful outside reload and rejects during reload. Repeat with COMBAT_DEBUG absent, then NODE_ENV=production COMBAT_DEBUG=1: reset and all debug mutations must fail, while normal R reload still works. Production client has no bound DEV reset/refill controls.
6. **Latency:** Enable 150ms each way ±30ms jitter. Repeat partial reload, final-round auto-reload, attempts during reload, movement, and immediate post-completion fire. Modest snapshot/visual delay is acceptable; timer manipulation, incorrect ammo, duplicate identities, persistent ghost bullets and prediction buildup are not. Repeat ten stationary individual shots and held/moving fire to check the accepted P2S3 handoff.

Ship shield HP stays 50/50 initially with shield-first damage. Removed only obsolete `shieldUp`, setter, debug toggle and its label. No active shield stance, shield walls, regeneration, reserve ammo, weapon changes, loot, orb changes or ship-heading aiming redesign.

## Verification commands

```sh
npm test -- --workers=1
npx tsc --noEmit
npm run build:server
npm run build
npm run build:pages
git diff --check
```

New reload logic, real-socket and browser tests cover strict request/lifecycle/room validation, completion timing, reload gameplay, final round, fallback, prediction and authorized DEV reset. Existing tests retain gameplay assertions except deliberate R/reset, auto-reload and obsolete ability changes. Production dist/docs JS must exclude DEV inspection handles, fake-lag implementation and combat-debug implementation. Pages artifacts are synchronized under the existing work workflow; no deployment settings or manual deployment action changes. Pushing work may trigger the existing automatic deployment workflows.

## Change inventory

- Server: new `server/reload.ts`; modified `server/combat.ts`, `server/projectiles.ts`, `server/game.ts`, `server/rooms.ts`, `server/combat-debug.ts`.
- Shared protocol/state: `shared/combat.ts`, `shared/protocol.ts`. Existing tuning values and reload snapshot timing fields are reused; reloadSession is the added membership identity.
- Client/presentation: `src/network.ts`, `src/main.ts`, `src/combat-debug.ts`, `src/hud.ts`, `index.html`.
- New tests: `tests/reload.test.ts` (eight deterministic logic/authority cases), `tests/reload-server.test.ts` (three real-socket authorization/session cases), `tests/reload.spec.ts` (three browser input/gameplay/prediction cases).
- Updated tests for deliberate behavior changes: `tests/combat.test.ts`, `tests/combat-server.test.ts`, `tests/combat.spec.ts`, `tests/game.spec.ts`, `tests/hud.spec.ts`, `tests/lifecycle.spec.ts`, `tests/prediction.spec.ts`, `tests/projectiles.test.ts`, `tests/projectiles.spec.ts`, `tests/server.test.ts`.
- Documentation: `AGENTS.md`, `README.md`, this guide. Generated Pages: `docs/index.html`, `docs/build.json`, JavaScript asset replacement `index-CwvbujhO.js` → `index-DNoWKDjX.js`; existing CSS/.nojekyll are unchanged.

Shared flight/movement, client movement prediction/interpolation, projectile visual prediction/view/handoff, swept projectile simulation and BASIC_BLASTER tuning are unchanged.


## Final verification results

Full `npm test -- --workers=1` passed **100 Node tests / 23 browser tests**, zero failures, cancellations or skips. This retains 89 prior Node / 20 prior browser cases and adds 11 Node / 3 browser cases. The focused three-browser reload suite passed again after the final static milestone-label update. Coverage includes the complete twelve-round magazine, exact final-shot trigger, fixed-tick deadline, no timer manipulation, full/partial/empty reload, movement/damage, real-socket default/debug/production gates, leave/rejoin to the same room with a new session, known-reload suppression, stale rejection cleanup and final/post-reload handoff under fake network OFF and 150ms each way ±30ms jitter. The existing multiplayer and ten-tap/held-fire no-ghost tests pass.

`npx tsc --noEmit`, server TypeScript, production build, Pages build and whitespace checks pass. Final dist and docs JavaScript exclude window inspection handles, fake-lag/debug implementation, temporary traces and resetFlight socket emissions. The existing Phaser bundle-size advisory remains; builds succeed. Pages Build ID: `client-10481b819e11`. P2S4 awaits the owner's manual acceptance; no P2S5 work is included.
