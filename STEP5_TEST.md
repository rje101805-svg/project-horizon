# Step 5 — local black-hole sandbox

This branch is **not deployed**. Production `work` and `/docs` remain at Step 4 (`9f0c821`). Step 4's public/two-network acceptance test is still pending because of the reported Pages runner outage. Do not use the public Pages/Render deployment to test Step 5.

## Start locally

Do these actions one at a time. On a computer with this checkout and Node 24 installed:

1. Open a terminal in the `project-horizon` folder.
2. Run `git switch step-5-black-hole`. If the branch has not been pushed, it exists only in the coding workspace; wait for the deployment-settings check below before trying to download it from GitHub.
3. Run `npm ci`.
4. Run `npm run server`. Leave this terminal running (port 3001).
5. Open a second terminal in the same folder.
6. Run `npm run dev`. Leave this terminal running (port 5173).
7. Open `http://localhost:5173` in your browser. Localhost only works on the computer running those terminals.
8. Confirm the server field says `http://localhost:3001`; use the local server, not the production Render URL.

## Manual acceptance — one action at a time

1. Enter the name `Pilot A` and click **Create room**.
2. Confirm the warning says **Safe space** and note the room code.
3. Open a second browser tab at `http://localhost:5173`.
4. Enter `Pilot B`, the same room code and the local server URL; click **Join room**.
5. Confirm both show the same room code and two players. Both spawn outside the purple influence boundary.
6. Compare the minimaps: both show the black hole at world X 1200, Y 450, influence radius 500, horizon radius 90. The purple boundary is danger; the bright inner ring surrounds the lethal center.
7. In A, fly around safe space with WASD/arrows, Shift boost, and mouse aim. B should see A move normally. R/reset remains a sandbox reset for living ships.
8. Return A to its initial safe position using R. Fly left briefly to about X 1200, then fly upward toward the black hole.
9. When Y approaches 950, confirm A's warning changes to **DANGER · gravitational pull**. Release movement briefly and observe the server pull upward; then continue inward. Pull increases toward the center. Use Shift and fly away if you want to compare farther/closer approaches.
10. Cross the inner ring. Confirm A says **Lost to the black hole**, freezes, and has a dim ship marked **LOST**. Reset becomes disabled; movement and R must not revive it.
11. In B, approach if needed to see A's frozen LOST ship. The latest server snapshot records the same death; ordinary remote flight retains its interpolation.
12. Open a third tab, join this room as C, and confirm its black-hole state is complete immediately and A is still dead. C spawns safely.
13. Keep B in the room. Refresh A's tab, re-enter its name and join the same code. This creates a new server-owned identity and a new safe living ship; the former identity is removed. Death does not persist across connections in Step 5.
14. Close C's tab; confirm the player count and ship disappear in the other tabs.
15. Leave/close every client; then try joining the old room code. Expect **Room not found**. Empty-room deletion is unchanged.
16. Optionally enable the existing DEV fake-network checkbox on a living client and compare remote motion. It remains off by default and absent from production.

## Architecture and deliberate limits

- One existing server-authoritative 30Hz loop applies existing flight response plus capped inverse-square gravity inside influence. Safe-space movement is unchanged. Clients send only inputs and render authoritative regions/state.
- Complete room-owned black-hole state is included in reliable room acknowledgments/rosters and every snapshot, so late joins need no historical events. Position and both radii are fields, ready for future growth; Step 5 keeps them fixed. Unbounded room-time growth without match/reset rules would eventually invalidate safe spawning, so no growth clock/lifecycle is introduced.
- Every initial/join/reconnect/reset spawn is outside influence plus 80 units of clearance; separation and map bounds still apply. A failed safe-spawn search reports an error rather than spawning into danger.
- Swept segment-circle checks catch inclusive tangent, stationary-inside, endpoint and exterior-to-exterior crossings at any speed. Death is server-owned even if a fast ship's tick endpoint is beyond the circle.
- Temporary death freezes the authoritative tick-end position/rotation, zeros velocity, retains membership/color/capacity, rejects movement/reset, and marks `lifeState: dead`/`region: lethal`. There is no health, respawn, lives, combat or victory system. The lethal value remains a death cause after a swept crossing, even if the endpoint lies outside the horizon.
- Reconnect uses the existing new socket identity. If another player preserves the room, reconnect/explicit rejoin gets a new safe active ship; if not, the room is gone and the existing room-lost behavior applies. This intentionally does not provide persistent elimination and must be revisited with Step 6/session rules.
- The original interpolation test fixture gained the new required state fields. Existing Step 1–4 behavior assertions were retained; the interpolation change only prevents a dead ship rewinding through its former living positions.

## Verification and deployment guard

Run `npm test`, `npm run build:server`, and `npm run build` (outputs `dist/`). Do **not** run `npm run build:pages` on this branch. A Pages-path build can safely use `npx vite build --base=/project-horizon/ --outDir=/tmp/horizon-step5-pages`.

Before committing, verify `git diff 9f0c821 -- docs` is empty and `git rev-parse work` still starts with `9f0c821`. Commit only on `step-5-black-hole`; do not merge into `work` or deploy.

No repository Actions workflow or Render blueprint was found. `DEPLOY.md` and prior setup specify Pages `work` → `/docs` and Render `work`, but documentation does not prove current live dashboard settings. The workspace's GitHub API request returned proxy 403, and no Render dashboard access is available. **This branch must remain unpushed until both settings are confirmed:**

1. GitHub repository → Settings → Pages: confirm **Deploy from a branch**, branch **work**, folder **/docs**; no other automation deploys Step 5 branches.
2. Render → `project-horizon-server` → Settings → Build & Deploy: confirm connected repository `rje101805-svg/project-horizon`, branch **work**, and that automatic deployment follows only that branch. Do not change the branch to Step 5 or manually deploy it.
3. Report those settings before pushing `step-5-black-hole`. Pushing is optional and must not alter production.

Final automated result: **42 tests passed** (34 Node logic/real-socket tests and 8 Playwright browser tests). Server-only type check, full TypeScript check, client production build to `dist/`, and Pages-path build to `/tmp/horizon-step5-pages` passed. Production assets contain no development inspection handles or fake-lag implementation. Original Step 1–4 behavior assertions passed. `/docs` is unchanged from `9f0c821` and `work` remains at that commit.

Remaining manual concerns: gravity strength/visual readability need playtesting; public Step 4 acceptance remains pending; Step 5 changes the snapshot protocol and must be tested against its matching local server, not the Step 4 server. The existing Phaser bundle-size warning remains. Step 6 has not begun.
