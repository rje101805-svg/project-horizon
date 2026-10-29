# Public P5B release — deployment and verification

Target frontend: https://rje101805-svg.github.io/project-horizon/
Existing backend: https://project-horizon-server.onrender.com
Health: https://project-horizon-server.onrender.com/health

Release gameplay baseline: `83d7e26b4d5aaf893aad833c431e19ac6a92b4a7` (P5B). The rebuilt production artifact is **`client-89b0a9e3f68b`**, with source revision at build `83d7e26b4d5a`. `docs/build.json` identifies the exact artifact and public HTTPS server URL. The publication commit is newer than this gameplay baseline; generated files cannot embed their own future commit hash.

## Existing deployment setup

The repository's documented active setup is GitHub Pages **work → /docs**, plus the existing root-directory Node Render service on work with auto-deploy enabled. No paid service, billing-plan change or new hosting provider is required. This task does not change gameplay, artwork, weapon definitions or fighter passives.

The previous committed Pages build was `client-b66091c83b1a`, from source `5a4d8cc1e45b`, generated October 6. Work had advanced through P5B without regenerating `/docs`, explaining the old public UI.

`npm run build:pages` now preserves authored `docs/art-reference` evidence instead of emptying the whole directory. It copies current public assets and emits new hashed JS/CSS plus `.nojekyll`, the Pages-base HTML and build metadata. Old unreferenced generated hashes are retained; current HTML points to the new hash. Every pilot, planet, ship, cosmic and weapon asset needed by the current client is included. The public endpoint remains the existing Render HTTPS base URL, not localhost.

A deployment-only `/health` field, `commit`, exposes a validated 40-hex Render commit (`RENDER_GIT_COMMIT`) or the local Git revision. Source archives without either truthfully report `unknown`. No environment dump, key, room code or private player data is added. This makes backend/frontend compatibility verifiable after deployment.

## Security and connectivity

- Production configuration: `VITE_SERVER_URL=https://project-horizon-server.onrender.com`. Vite receives only this public endpoint. No OpenAI credential is added to Vite, client source, generated assets or Git.
- Render must retain `CLIENT_ORIGINS=https://rje101805-svg.github.io` (exact origin, without the repository path or trailing slash). Existing defaults and documented service configuration already include this origin; do not broaden CORS to `*`.
- Render supplies PORT and terminates TLS. Socket.io uses HTTPS polling at `/socket.io/` and upgrades to WSS. No second TLS server or laptop endpoint is needed.
- Live CORS, WSS and running backend commit must be checked from the actual hosted site; source settings alone are not proof of the service's current configuration.
- An artifact scan covered all generated JS/CSS/HTML plus authored JSON/Markdown text: no key-shaped credential was found. Generated JS contains no `OPENAI_API_KEY`, `api.openai.com`, or development inspection handle markers.

## Verification completed before publication

- Production Pages build and server typecheck pass.
- Deployment version/URL tests: **5/5 passed**.
- Full Node regression suite: **531/531 passed**, zero failures/skips/cancellations.
- The actual generated `/project-horizon/` production files were served locally and tested in Chromium Canvas, with a separately running production-mode game server. Only the local preview's endpoint field was overridden to that local server; the generated artifact itself remains configured for Render.
- All eight pilot artworks decoded, selection saved, and Controls opened/closed successfully. Production inspection handles were absent; no asset or JavaScript errors were recorded.
- Practice used real keyboard flight and real capture time, without travel teleports or capture shortcuts. It collected/fired/reloaded a regular SMG, then captured all four planets and claimed/fired/dropped Cryo, Inferno, Titan (normal spin-up) and Lunar. Practice had one player and no opponents, guardians, Horizon or standings.
- Two separate browser contexts created/joined one normal room through production menu/code controls, readied, launched, and moved independently. After peer departure, the normal victory screen's MAIN MENU action returned the host home. The initial harness incorrectly tried the obscured in-game exit after victory; the harness was corrected, with no gameplay change.
- Solo FILL launched eight ships. F4 showed seven bots and **local-preview** `API UNAVAILABLE`/`FALLBACK`, with zero calls. This is not a claim about Render's credentials or live AI.
- Saved local-only production verification/screenshots: `docs/art-reference/public-release/`. These do not substitute for live public verification or real-GPU FPS acceptance.

## Public checks still required

At preparation time the managed cloud network policy denied CONNECT access to the public Pages site, Render service and GitHub API (403 at the environment proxy). The supported environment configuration tool saved a narrow allowlist draft for `rje101805-svg.github.io`, `project-horizon-server.onrender.com`, `api.github.com`, `api.render.com` and `dashboard.render.com`. It returned `requires_publish: true`; saving the draft did not apply it. Environment settings must be reviewed/saved and published before this executor can perform live checks. This is separate from Git push access, which works.

Until actual live requests succeed, do not claim that Pages/Render deployment completed, the backend runs the publication commit, the hosted game is playable, CORS/WSS works, or live OpenAI works. Recheck the exact live build/health versions and production menu/practice/multiplayer flows once access is available.

Existing documented auto-deploy settings should react to the authorized work push. If Pages does not deploy, inspect repository Settings → Pages for work /docs. If Render's health version stays old, use the **existing** project-horizon-server service and deploy the latest work commit; do not create a new service or change billing. Owner UI actions, if needed, should be requested one at a time after the actual blocker is identified.

## Secure OpenAI setup if Render reports missing credentials

Never paste a key into chat or put it in a VITE-prefixed variable, public asset, frontend hosting environment or repository file. In the existing Render backend service, use **Environment** to enter a private project key as `OPENAI_API_KEY` directly in Render, then save/redeploy there. Preserve the existing single-instance budget architecture. Relevant server-only configuration:

- `HORIZON_AI_ENABLED=true`
- `HORIZON_AI_MODEL=gpt-4.1-mini` (or an already verified compatible model)
- Existing caps: `HORIZON_AI_MAX_CALLS_PER_MATCH=120`, `HORIZON_AI_MAX_CALLS_PER_HOUR=600`, `HORIZON_AI_MAX_CONCURRENT=3`, `HORIZON_AI_TIMEOUT_MS=3000`
- `HORIZON_AI_INTEL_ENABLED=false` keeps multiplayer Intel restricted; solo FILL needs no override.

Do not change a paid plan or claim credentials are absent based only on this cloud environment. Verify actual Render behavior in a solo FILL round: START, F4, increasing accepted/applied calls and real `AI` sources. `API UNAVAILABLE`, `DISABLED`, budget limits and provider failures are distinct states. The game remains playable with deterministic FALLBACK, and Free Flight needs no AI at all.

## Judge / public-browser flow after deployment is confirmed

Open the frontend URL on any Internet-connected computer; the owner's laptop/terminals are not part of hosted serving. Use PILOT SELECT, then Free Flight to test a selected pilot and all four planets. Settings artwork opens CONTROLS. Practice requires the hosted Render backend but no API key or opponent. Use FILL → PLAY → START for a full match, or WAIT → PLAY and share the room code with a second browser; the guest joins through JOIN WITH CODE, READY, then the host STARTs.

A free Render instance may sleep/cold-start, and restarts erase in-memory rooms. Allow the existing connection retry/waking UI to finish or cancel and retry; a sleeping backend is not a laptop dependency. Existing software-WebGL flash timing, real hardware FPS, human balance and separate-device performance acceptance remain limitations unless separately verified. No new feature or balance change is included in this release.
