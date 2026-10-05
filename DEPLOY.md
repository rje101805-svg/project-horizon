# Project Horizon — Step 4 deployment

Status: the owner created the Render service and confirmed its health endpoint. The production client is configured for **https://project-horizon-server.onrender.com** and the Step 4 release includes a rebuilt `docs/`. Public acceptance is still pending. Step 5 is out of scope.

Server: https://project-horizon-server.onrender.com
Health: https://project-horizon-server.onrender.com/health
Client: https://rje101805-svg.github.io/project-horizon/

This coding workspace's outbound proxy returns 403 for the Render host, so live Render health/polling/WSS could not be independently verified here. Local HTTPS/WSS, origin enforcement, RTT, retry/cancellation and production-client checks passed. Wait for Render to deploy the Step 4 commit (the previously deployed Step 3 server has no RTT probe) and GitHub Pages to publish its updated artifacts before manual acceptance.

## Render service

Create a **Web Service**, not a Static Site, from `rje101805-svg/project-horizon`.

| Setting | Value |
| --- | --- |
| Name | `project-horizon-server` (Render may require a unique name; its URL is generated, not assumed) |
| Branch | `work` |
| Runtime | Node |
| Root Directory | **Leave blank** — repository root, not `server/` |
| Build Command | `npm ci --include=dev && npx tsc --noEmit` |
| Start Command | `npm run server` |
| Health Check Path | `/health` |
| Instance Type | Free for this early test, if offered; do not approve paid billing without the owner's decision |
| Environment: `NODE_VERSION` | `24` |
| Environment: `NODE_ENV` | `production` |
| Environment: `CLIENT_ORIGINS` | `https://rje101805-svg.github.io` |
| Environment: `PORT` | **Do not set manually**; use Render's provided value |

These exact build/start commands work on the already-pushed Step 3 branch as well as the prepared Step 4 code. This lets the owner create the service and obtain its real URL **before** the requested final Step 4 commit. Once that URL is provided, configure/rebuild the Pages client, verify and commit/push everything together. Render can then redeploy the new server from `work`. Wait for that deployment to be Live before public testing; the old Step 3 server does not have the new RTT probe.

The build context must include `package.json`, `server/`, `shared/`, and the TypeScript config. Existing server imports require `shared/`; deploying `server/` alone will fail. `tsx` is now a runtime dependency. `npm start` is also available after the Step 4 commit; the existing `npm run server` command remains valid and avoids a bootstrap mismatch. `npm run build:server` optionally checks only server/shared types locally; Render's configured command checks the whole repository.

Sign in to https://dashboard.render.com, authorize GitHub repository access, choose **New → Web Service**, and enter the settings above. If the service requires payment or a change of plan, stop and let the owner decide. Copy the **actual `https://…onrender.com` service URL shown by Render**, then provide it to the coding session. Never invent this URL. The confirmed service URL is **https://project-horizon-server.onrender.com**.

When Live, open https://project-horizon-server.onrender.com/health. Expect HTTP 200 and JSON with `ok: true`. This existing lightweight endpoint reports process/loop readiness and anonymous counts; it exposes no names, room codes, credentials or player state. It sends `Cache-Control: no-store`. A cold request may wait while Render wakes; an error here points to service/build/start readiness rather than Phaser rendering.

The Node server listens on `0.0.0.0` using `PORT`. Render terminates public TLS and proxies HTTP polling/WebSocket upgrades to Node; do not add a second TLS server or hardcode port 3001 in the public URL. Socket.io uses the default `/socket.io/` path. With an **HTTPS base URL**, it starts secure polling and upgrades to **WSS** automatically. Do not use `http://` from the HTTPS Pages client, disable certificate checks, or set CORS to `*`. Allowed origins are exact browser origins, without `/project-horizon/` or trailing slash. One Render instance runs the current in-memory rooms; scaling to multiple instances is outside Step 4.

## GitHub Pages — after the actual Render URL is known

Keep the existing source: **`work` branch → `/docs`**. Public client address: https://rje101805-svg.github.io/project-horizon/

1. Record the confirmed public HTTPS server URL as `VITE_SERVER_URL` in a root `.env.production` file. This file will contain only this public URL, not credentials. The committed value is `VITE_SERVER_URL=https://project-horizon-server.onrender.com`. Do not use a placeholder URL.
2. Run `npm run build:pages`. It type-checks and rebuilds `docs/` with the `/project-horizon/` base path and `.nojekyll`. It refuses to build without an explicit server URL and rejects production localhost/HTTP configuration before changing output.
3. Inspect `docs/build.json`. Confirm `serverUrl` equals the actual Render URL and note `buildId`.
4. Test the production build, then commit source, deployment configuration, and the freshly generated `docs/` together on `work`. Push only once configuration and checks are resolved.
5. Wait for GitHub Pages and Render to finish deploying the same commit.
6. Open the public client. Its footer must show **Build: `<buildId>`** matching `docs/build.json` (or the public `/project-horizon/build.json`). If it does not, hard-refresh with Ctrl+F5, then check Pages deployment status.

The lightweight stamp is a deterministic hash of client/shared source, build configuration, dependency files, mode and public server URL. It changes when those inputs change. `sourceRevisionAtBuild` records HEAD at build time (before committing generated files); the **build ID**, not that parent revision field, is the exact artifact identifier. `builtAt` records generation time. Hashed JS filenames ensure the new HTML refers to the new bundle.

`src/config.ts` centralizes default URL selection and validation. Development on localhost defaults to `http://localhost:3001`. Production bundles never fall back to localhost, even when previewed locally. An explicitly entered loopback URL is permitted only for a localhost preview (HTTPS previews still require HTTPS endpoints); the public Pages client rejects it. `npm run build` may generate a deliberately unconfigured local preview before deployment setup; **it is not the public Pages release**. Public releases must use the guarded `build:pages` command.

## Cold starts and real ping

Click Create/Join once. One Socket.io connection retries initial failures with a 2–5 second backoff, up to two minutes. The UI shows connecting / server may be waking / retrying. Buttons stay disabled to prevent duplicate room requests; **Cancel connection** closes the pending attempt. A successful connection submits the room request once. There is no offline movement fallback. Reconnect still follows Step 3: rejoin if the room survived, otherwise return home and create/join again.

The HUD's **Ping: N ms** measures actual client-to-server Socket.io acknowledgment RTT approximately every three seconds. It includes real transport/network/server scheduling time, works with polling or WebSocket, bypasses development fake lag, and clears on disconnect. It is not a prediction or full debug overlay. Old Step 3 servers cannot reply; update the Render server after pushing Step 4.

## Local development

```sh
npm ci
npm run server
```

In a second terminal in the same folder:

```sh
npm run dev
```

Open http://localhost:5173, create a room, then join from another tab. Keep both terminals running. Local steps remain in `MANUAL_TEST.md`. `.node-version` selects Node 24; supported minimum is Node 22.12. `npm start` starts the same server, and `npm run server:dev` watches for changes.

To simulate local conditions, check **DEV ONLY: fake network** after joining. Uncheck to disable. `import.meta.env.DEV` guards the implementation/UI: production removes the simulated-delay code and has no active debug checkbox or development inspection handles. Real RTT probes bypass that queue. No fake latency, jitter, prediction or reconciliation is enabled in production.

## Checks and public acceptance

Before the final push: run `npm test`, `npm run build:server`, `npm run build`, and the configured `npm run build:pages`. Verify Pages-path assets, build stamp/metadata, no production debug functionality, exact HTTPS server configuration, `/health`, Socket.io polling/WSS, permitted/rejected origins, RTT and initial retry/cancellation. Smoke-test the real Render server if the environment network policy permits; report an access restriction rather than bypassing it.

The owner then tests two computers on different networks: both open Pages, confirm the expected build ID, create/join the same room/link, see both names/ships, move independently, assess smoothness and plausible ping, close/rejoin a client, and confirm removal/room recovery. Do not call Step 4 complete before this manual confirmation, and do not begin Step 5 afterward.

Troubleshooting: `/health` unavailable → Render logs/start/wake; health works but Socket.io fails → URL/origin/TLS/proxy; connected but old UI/stamp → stale Pages deployment/cache; no ping → old server or failed probe; long latency → regional distance/cold start/network, not simulated production lag. Free-service sleeps/restarts can delete all in-memory rooms.
