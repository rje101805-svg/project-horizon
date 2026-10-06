# Phase 1 integration and deployment preparation

Accepted Steps 5–7 were integrated into `work` by a clean fast-forward from `9f0c8216dd434a8c78b5cb1e1f15f083207a127e` to `735d6b303441dce058b53c347f92ec4238dcfc8f`. No conflicts, squash, feature copying or new gameplay changes. Accepted feature branch heads remain unchanged:

- Step 5: `6db0ae704680afa46d029b9691e5a12ba97c3560`
- Step 6: `f7890cfb23c88c7f70673043103e83456df30fb5`
- Step 7: `735d6b303441dce058b53c347f92ec4238dcfc8f`

The owner confirmed local manual acceptance of all three steps, including Step 7 health/placeholders, F3, real metrics, two-client flight/lifecycle and cleanup. The previous public Step 4 Pages build `client-aae0fb5389ef` successfully deployed in deployment #5; old queued #4 is left untouched.

## Verification from integrated work

- `npm test`: 59 passed, 49 Node logic/real-socket tests + 10 Playwright browser tests; no failures or skips.
- `npm run build:server`: server/shared TypeScript check passed.
- `npm run build`: full TypeScript check and production `dist/` build passed.
- `npm run build:pages`: full TypeScript check and actual production `/docs` build passed.
- Existing Phaser bundle-size warning only (approximately 1.27 MB uncompressed / 352 KB gzip).
- Generated Pages-path browser smoke passed: assets loaded without errors, visible expected Build ID, Render HTTPS Socket.io request, cancellation and no page runtime errors. The request was intercepted locally; this is not live Render acceptance.
- Bundle/artifact inspection passed: correct referenced `/project-horizon/` assets, Render endpoint, Step 7 footer, no fake-lag implementation/deadline queue or DEV inspection globals; no common credential markers. No secrets/configuration were added.
- The shared URL helper retains a localhost literal gated by its DEV argument; production passes false and the actual default/request is Render. The static fake-network checkbox remains hidden/inert with no production handler; programmatically toggling it cannot enable simulation. Production code removes the delay implementation. HTTPS Socket.io selects secure polling/WSS normally; live WSS acceptance remains pending.

## Production artifact and deployment boundary

Build ID: `client-d8140eb0691f`

Server URL: `https://project-horizon-server.onrender.com`

Pages base: `/project-horizon/`

`docs/build.json` records source revision `735d6b303441`, the HEAD at artifact build time, not the later commit containing generated files. The content-based Build ID identifies the new client.

The integration commit changes only acceptance/deployment notes (`AGENTS.md`, `DEPLOY.md`, `README.md`, `STEP7_TEST.md`, this record) and generated `/docs` files (HTML, metadata and replacement JS/CSS assets). `.nojekyll` is retained. The inherited feature changes can be inspected with `git diff --name-status 9f0c821..work`; integration-only changes with `git diff --name-status 735d6b3..work`.

Only `work` is pushed. Pages source remains work → /docs; Render remains work-only Auto-Deploy On Commit, PR Previews Off. No settings, deployment workflow or manual deployment changed. The push is expected to trigger both deployments. Wait for the owner to confirm deployment success and the public Build ID before the separately coordinated Step 8 two-computer/different-network manual acceptance. Step 8 has not passed; Phase 1 is not yet complete. No Step 8 implementation or Phase 2 work.
