# Phase 4 — OpenAI Strategic Pilots

Baseline: `8e3d62d201e53688519a4d45682b545c02e8ced7` (P3S5), branch `work`. This adds strategic decisions to the existing bot controller, not a second simulation. Live OpenAI verification is **pending**: this environment has no API key. Mocked results always display FALLBACK. No Render secrets or deployment settings were changed.

## Implementation and authority

`server/ai/openai.ts` uses the official OpenAI JavaScript SDK 7.45.0, Responses API, `gpt-4.1-mini` by default, configurable with `HORIZON_AI_MODEL`. Requests use strict JSON Schema, `store:false`, at most 256 output tokens, no retries and a 3000ms deadline. The SDK and key are server-only; the endpoint is pinned to OpenAI. Empty/refused/truncated JSON is counted as invalid output rather than an API outage. The schema requires exactly `action`, `targetId`, `reason` (<=120), `commitmentSeconds` (8–20) and `radio` (string <=100 or null). Unsupported, malformed, stale, hidden, missing or unsafe targets are rejected. The server revalidates targets after the response. Radio links, controls, markup, key-like strings and numbers are rejected. Reasons never become commands or replicated text.

`context.ts` builds compact observations: own inventory/health/survival, coarse sector, local opponents and useful loot within 1100 units, public planet availability/map status, own completion and capture progress and future-safe public sectors. No enemy inventories, hidden tracking, sessions, credentials, prompts or raw coordinate fields are supplied. Target coordinates remain server-private. Safe targets account for the Horizon ten seconds ahead. The system prompt treats names/context as untrusted data.

`strategy.ts` translates HUNT into the existing opponent chase, LOOT into existing pickup navigation, CAPTURE into planet-ring navigation, and FLEE/REPOSITION into safe-sector navigation. Existing hands still steer, aim, shoot, switch, reload and tractor through the usual authoritative input/combat pipeline. Existing survival code still collects materials, heals and builds walls. No weapon damage, movement constants, cooldowns, resources, launch timing, planet capture, aliens or victory rules changed.

Commitments persist until expiry, completion, target invalidation or defensive override. Imminent Horizon danger, tractor escape, critical health under fire and stun take precedence immediately. Near-complete captures are finished. A five-second progress watchdog detects ineffective navigation while recognizing actual capture progress. Requests superseded by emergencies cannot replace those overrides. Intent history is bounded to eight accepted/completed/invalidated/superseded entries. Opening fallback pilots collect useful starter weapons/materials before personality preferences; this preserves the real FILL survival regression.

## Actual roster

The repository has **seven named bots plus one user-named human slot**, not eight hardcoded bot names. Redline is not a configured bot. Names, identifiers and color assignments are preserved; no eighth identity was invented.

| Slot / existing name | Existing color in a fresh solo FILL | Archetype |
| --- | --- | --- |
| Human (default Pilot_01; user configurable) | #72eee0 | Human, no AI controller |
| Viper | #ffaa66 | Aggressor |
| Nova | #b9a0ff | Strategist |
| Atlas | #ff6e9c | Scavenger |
| Echo | #ffdf72 | Survivor |
| Comet | #71aaff | Wildcard |
| Orion | #8ee46a | Strategist |
| Vega | #f0f3ff | Scavenger |

Aggressors prioritize favorable known fights; Strategists captures; Scavengers useful supplies; Survivors healing/materials and retreat; Wildcards vary coherent objectives. These preferences enter both model context/instructions and deterministic objective selection, rather than only dialogue. Emergency survival wins over personality. Existing lobby replacement/refill can reassign available colors as before.

## Scheduling, limits and honest metrics

A lazy process-wide `PilotCoordinator` shares concurrency and the rolling request ledger across all rooms and registered game-server instances. It staggers each bot's first request (500ms + index*2100ms), then requests after 12–18 seconds when capacity permits. Fair round-robin room scheduling and oldest-due pilot selection avoid an unbounded queue. At most one pending request per pilot and three per process. Simulation never awaits the network.

Every dispatch, including failures, consumes the hard limits: 120 per match and 600 per rolling 60 minutes. A match token bucket refills at 120/300 seconds with a maximum three-token burst; this spreads spending over the five-minute match. Seven bots at 15 seconds would need 140 calls. The cap takes priority: the deterministic five-minute seven-bot scheduler test measured **120 requests, 17,469ms mean per-bot interval, 12,500–22,500ms range**, with 500ms test-clock sampling. Actual live cadence will depend on deaths, emergencies, latency and other rooms. No live average latency/token measurements are claimed.

The hourly ledger survives room destruction and round resets, but not process restart. It is **process-local**. Operate one Render instance, one Node worker and no overlapping load test to keep the cap operationally meaningful. Multiple instances/processes need shared durable rate-limit storage before scaling; restarting can replenish the in-memory hour ledger. Set an OpenAI project spending limit as an independent account safeguard.

Missing key, disabled AI, timeout, invalid response, 429, outage or exhausted budgets use deterministic FALLBACK and bounded radio. Hour exhaustion logs once per exhaustion period, stops calls and resumes only as timestamps age out. On hard cap exhaustion existing AI intents become fallback; the response that exhausts the last available budget is conservatively discarded. A one-call budget therefore cannot demonstrate AI; use at least two for a bounded smoke test. Failures are not retried immediately. Pending responses carry room/runtime generation, round, bot identity, sequence, request timestamp, life, teleport and strategy-version checks. Match end/elimination/reset abort or invalidate them, including end between dispatch and network invocation.

Metrics distinguish attempted requests, returned responses, validated decisions, decisions applied by bot hands and deterministic fallback assignments. Server runtime also tracks invalid/timeouts/429/stale, token usage of returned responses, latency and bounded achieved-cadence samples. Intel exposes sanitized aggregates. Applied count means the intent entered the tactical controller, not that its objective necessarily completed.

## Radio and F4 Intel

Radio supports capture attempts, hunting, retreat, supply-seeking/repositioning, Galaxy Gun acquisition, heavy damage, kills, late Horizon pressure, lost objectives and significant incoming combat. Personality-specific fallback lines describe actual events. Model dialogue comes only in the same strategic response; no extra dialogue calls. Limits: 100 characters, 25 seconds per pilot, four seconds globally, six messages retained, fifteen seconds visible, duplicate-line suppression. Each line displays the preserved pilot color/name and AI or FALLBACK source. The server sends radio only on revision changes; Intel is capped at 5 Hz.

F4 opens/closes a default-hidden, noninteractive Intel panel without pausing or capturing flight. It shows living pilots, personality, intent, safe target label, source and commitment seconds; footer shows enabled/availability, match/hour budgets and average latency. Only a validated response from the real OpenAI SDK adapter can label a current intention AI. Mocks and deterministic overrides are FALLBACK.

The previous DEV-only F4 reset binding conflicted: F4 is now dedicated to Intel. The existing authorized **DEV reset flight** button remains unchanged in function, with its historical F4 label removed. No other control binding changed.

Authorization is server-side per room:

- Exactly one connected HUMAN: always allowed, flag absent/false/true alike, including solo FILL and production.
- Two or more HUMANs: allowed only with backend `HORIZON_AI_INTEL_ENABLED=true` (default false).
- Human join/leave emits immediate reliable allowed/denied packets. Denied packets contain only roomCode/round/allowed; no rows or metrics. Client clears cached Intel, panel rows and old F3 strategic text immediately, even while closed or rendering paused.
- F4 is presentation only; there is no privileged client-toggle API. Raw private bot tactics/goals are removed from ordinary snapshots for every client. Authorized Intel contains labels, not hidden coordinates, prompts, responses, credentials or internal reasons.

Radio sits above the survival HUD; desktop F4 layout keeps the kill feed beside the Intel panel. Screenshots under [docs/art-reference/phase4](docs/art-reference/phase4/) show real fallback browser rendering, **not live AI**. Canvas/Low and WebGL/Standard use the same DOM Intel/radio view and existing game renderers.

## Automated verification

**448/448 Node tests passed** in the complete delivery run: 418 existing plus 29 strategic-pilot cases and one real-socket multiplayer case. This includes an actual 600-dispatch cross-room cap test. Client build and server typecheck passed. **Full Playwright: 72/72 passed in one 15.3-minute run.** After final SDK parsing, public-observation and radio/Intel layout polish, the affected three browser cases passed again (3/3 in 30.7 seconds), with DEV reset authorized to prove F4 does not reset flight. No unresolved functional test failure or four-planet timeout remains. The focused three-case browser suite passed Canvas absent/false flag and WebGL true flag, real one-to-two-to-one membership authorization, denied payload shape, DOM clearing, source labels, movement/boost and Q/4/5 controls.

The first browser fixture attempts correctly failed because FILL was requested on a WAIT lobby, because a manual server clock had not advanced to the 5Hz publication boundary, and because the Canvas test page remained behind the second browser tab. Fixtures now use the actual FILL menu, advance the simulation to publication, and foreground the controlled page. Assertions and production input guards remain intact; no test timeout was raised. No mock is labeled AI. The expanded checkbox-focus fixture initially retained its deliberately focused input, as intended; it now asserts that retention and restores body focus before the independent flight check. One intervening WebGL five-second cold-scene readiness poll timed out while the Node suite and builds ran concurrently; the isolated final rerun passed all three cases without changing deadlines. This is a remaining software-renderer test timing sensitivity, consistent with initialization contention, not proof of a gameplay or API regression.

P3S5 materials, walls, cells, repairs, death drops, inventory, Galaxy Guns, captures, launch/Horizon, aliens, room codes, multiplayer and movement remain covered by the full existing regression suites. Software WebGL is Chromium SwiftShader, not real GPU acceptance. Build still reports the existing large Phaser client-chunk advisory. The final built client contains no OPENAI_API_KEY, OpenAI API endpoint, response-schema name or key-bearing authorization marker. The existing tracked .env.production contains only the public VITE_SERVER_URL. Fresh regression timing/survival evidence is copied into phase4/regression; only this run’s generated changes to historical P3S5/P3S7.2 evidence were restored to the baseline.

## Exact Windows live check

Use PowerShell with Node 24 (or >=22.12). Do not paste a key into chat, Git, screenshots, browser settings or any `VITE_` variable.

1. Obtain a key from your OpenAI API project dashboard at https://platform.openai.com/api-keys and enable a small project spending limit. ChatGPT subscription does not itself supply API credits.
2. In PowerShell:

   ```powershell
   cd C:\Users\rje10\Downloads\project-horizon
   git status --short
   git branch --show-current
   git pull --ff-only origin work
   npm ci
   if (!(Test-Path .env)) { Copy-Item .env.example .env }
   notepad .env
   ```

   Confirm branch `work`; preserve local work if pull refuses. Set the key only in `.env`. For a bounded first check use:

   ```dotenv
   OPENAI_API_KEY=<your private API key>
   HORIZON_AI_ENABLED=true
   HORIZON_AI_MODEL=gpt-4.1-mini
   HORIZON_AI_MAX_CALLS_PER_MATCH=2
   HORIZON_AI_MAX_CALLS_PER_HOUR=10
   HORIZON_AI_MAX_CONCURRENT=1
   HORIZON_AI_TIMEOUT_MS=3000
   HORIZON_AI_INTEL_ENABLED=false
   ```

   `server/index.ts` explicitly calls Node `loadEnvFile('.env')` from the repository working directory. This is not assumed Vite dotenv behavior. Existing process environment variables take precedence; remove stale AI variables in the shell if necessary. Restart the backend after changes.
3. Optional bounded headless integration check:

   ```powershell
   npx tsx scripts/pilots-live-smoke.ts
   ```

   It loads `.env`, never prints the key, runs the existing bot hands, allows at most two API attempts and exits in <=25 seconds. Success requires a real validated AI intent, an applied counter and movement toward that intent's resolved objective. `LIVE NOT VERIFIED` is a failure to verify, not permission to claim AI. This headless check does not prove browser visuals. Missing key exits without any requests. Do not run this concurrently with the demo backend because each process has its own hourly ledger.
4. Backend terminal:

   ```powershell
   npm run server:dev
   ```

   Expected endpoint `http://localhost:3001`; keep this terminal visible. A missing-key warning means FALLBACK. Successful live acceptance logs `[AI] response` with `result:"accepted"`, pilot and latency, never the prompt/key. An outage prints a concise FALLBACK category. Do not screenshot credentials.
5. Second terminal:

   ```powershell
   cd C:\Users\rje10\Downloads\project-horizon
   npm run dev
   ```

   Open `http://localhost:5173` (or `http://localhost:5173/?devrooms=1` to expose development room/endpoint controls), set the backend to `http://localhost:3001` if needed, choose **FILL GAME**, click **PLAY**, then host **START**. Observe the unchanged countdown/collapse/flash/launch. No AI calls occur before ACTIVE.
6. Press **F4**. It must work automatically with the multiplayer flag false. Check seven living bot names/archetypes and initial FALLBACK. On the first live validated response, a pilot should show **AI**, a target/commitment countdown and a nonzero accepted/applied count in the connection's sanitized Intel metrics; server logs should agree. Watch that pilot move toward the stated objective. Optional supplied radio displays AI; deterministic radio always displays FALLBACK. At the two-call cap the server deliberately returns to FALLBACK, which is expected. Failure/invalid output can consume the small budget without showing AI; inspect concise status, correct configuration and restart a fresh test deliberately, never claim success from mock output.
7. Hold **WASD + Shift**, aim with the mouse and toggle F4 repeatedly. Verify immediate movement continues. Fire, switch/drop/pick up weapons, Q with 20 materials, 4 with a cell, 5 with a kit. Repeat F3 quality **Standard**, then **Low**; check ship/projectile/planet readability and radio/HUD overlap. F3 FPS is diagnostic; record actual desktop GPU measurements, not cloud SwiftShader numbers.
8. In a second browser, explicitly join the lobby code before START. With the flag false, F4 must say **INTEL DISABLED IN MULTIPLAYER** and have no retained rows; leave and confirm restoration. Repeat with backend flag true only if intentionally demonstrating multiplayer Intel. Check synchronized movement, inventory, damage and objectives on both clients, then replay a match and verify counters reset while the process hour total remains.
9. Stop both terminals with **Ctrl+C**. Before committing anything:

   ```powershell
   git check-ignore .env
   git ls-files .env
   git status --short
   git diff --cached --name-only
   ```

   `.env` must be ignored, absent from tracked/staged paths, and no key should appear in any source or log artifact. Do not print `.env` in a shared terminal recording. The pre-existing tracked `.env.production` contains only the public `VITE_SERVER_URL`; keep every OpenAI variable out of it. For normal play restore budgets to 120/600 and concurrency 3 in the private `.env`; do not leave a judging demo at two calls.

## Render / client readiness — owner action

Configure the existing backend service before **October 28, 2026**. No deployment or production-secret mutation was performed here. Set the following in Render's server environment, never Cloudflare Pages/Vite:

| Variable | Production value |
| --- | --- |
| OPENAI_API_KEY | Private project key |
| HORIZON_AI_ENABLED | true |
| HORIZON_AI_MODEL | gpt-4.1-mini (or verified compatible model) |
| HORIZON_AI_MAX_CALLS_PER_MATCH | 120 |
| HORIZON_AI_MAX_CALLS_PER_HOUR | 600 |
| HORIZON_AI_MAX_CONCURRENT | 3 |
| HORIZON_AI_TIMEOUT_MS | 3000 |
| HORIZON_AI_INTEL_ENABLED | false; solo judging requires no override |

Use Node 24, existing `npm run server`, existing PORT/CORS configuration, one instance and one worker. Render supplies environment variables directly; no `.env` file is needed there. Existing Render work auto-deploy behavior may react to an authorized push; no manual deploy command, service setting or secret was changed. The historical deployment document describes GitHub Pages `/docs`, while the request refers to Cloudflare Pages. The active hosting provider/configuration was not changed or assumed; **any frontend provider must build this new client (`npm ci && npm run build`, output `dist`) and receive no OpenAI key**. Tracked historical `/docs` client files were not rebuilt by this task. An old static frontend will not show F4 Intel even with the new server: owner must publish the current client through the configured hosting workflow.

After publishing client and server, verify the client build ID, open a solo FILL room, START and press F4. Check actual AI source/intent/radio, increasing call count and sanitized accepted logs, observe movement toward the objective, and maintain stable flight. Health `/health` proves server availability only, not OpenAI readiness. Repeat a two-human lobby to prove default Intel denial. No live deployed acceptance is claimed.

## Remaining acceptance and P3S8 handoff

Live OpenAI request/latency/token cost, live AI browser screenshots, deployed judging flow, separate-device networking, target-hardware FPS and human balance assessment remain manual. Optional AI director was intentionally omitted. Keep the process-local budget limitation in mind before scaling. P3S8 should consume the same authoritative action/observation boundary, preserve P3S5 survival/input behavior and add shared rate-limit storage before multi-instance AI hosting. Do not treat mocked strategy tests as proof of live API success.
