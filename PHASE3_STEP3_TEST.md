# P3S3 — Planetary Capture & Gold Gun Spawns

Implemented on `work` from accepted P3S2.9 baseline `83bf8b0e195e079b99843c64d04541d1d8ccf6ac`. P3S3 replaces the planned harvesting objective with contested planetary weapon rewards. P3S4 is next and is not implemented. Manual visual, real-GPU performance and separate-device acceptance remain pending.

## Architecture and configuration

`shared/planets.ts` is the single planet geometry table, re-exported by the existing visual layout. Names, coordinates, artwork and rendered radii are unchanged. `shared/objectives.ts` holds capture configuration and snapshot DTOs; `shared/weapons.ts` holds Gold combat configuration. Server/shared modules do not import visual modules.

| Planet / stable ID | Center | Planet radius | Capture radius (1.25×) |
|---|---|---:|---:|
| Borealis / `borealis` | 2400, 2900 | 825 | 1031.25 |
| Cinder / `cinder` | 9000, 2400 | 735 | 918.75 |
| Pelagia / `pelagia` | 8400, 8900 | 975 | 1218.75 |
| Ashen / `ashen` | 2200, 9200 | 470 | 587.5 |

`server/objectives.ts` advances once in the existing 30 Hz simulation, after movement/projectile damage and before winner evaluation. Capture requires an ACTIVE match, current room membership, locked-roster eligibility, enabled gameplay, positive HP and ALIVE/active human-form status. Humans and regular bots use identical rules. Queued spectators, dead ships and aliens are excluded.

Exactly one eligible occupant earns one tick of independent progress toward 300 ticks / 10 seconds, provided that participant has not completed this planet and no unclaimed planetary reward is pending. Any two eligible occupants make the ring CONTESTED, including previous capturers and Gold holders. Inside progress pauses; outside unfinished progress decays two ticks per tick, clamped to zero. Damage, movement, boost and ordinary combat do not reset progress. Death/disconnect removes the unfinished attempt. Successful history persists until match reset; progress never transfers.

Participant IDs remain stable through the existing lifecycle. An active-round reconnect with a new socket is OUT and cannot join the locked roster or earn another capture. Successful history is retained after disconnect until reset. This uses the existing match admission policy; no new authentication or reconnect identity protocol was introduced.

Each completion creates one uniquely identified floating Gold Gun, outside the visible planet disc, at least 80 units farther than the capturer's radial position, within world bounds and outside the existing lethal Horizon plus pickup clearance. A newly created pickup cannot be collected on its creation tick. The planet remains blocked until this specific reward is collected; then other participants may capture it. A Gold holder may still capture a previously unused planet, but cannot carry a second reward.

Collection is automatic within 45 world units. Server checks eligibility, position, existing ownership and pickup existence. The closest eligible unarmed ship wins; equal distances use stable ID order. Equipment and pickup removal are synchronous and atomic. Opponents can steal rewards. No client capture, award or pickup RPC exists. Ordinary input/fire/reload packets cannot supply ownership, progress, damage or position authority.

`server/equipment.ts` owns trusted equip/clear checks. Gold ownership is explicit state, separate from numeric normal-ammo reserves. There is one held Gold Gun maximum; no general inventory or interaction button.

| Weapon property | Basic blaster | Gold Gun |
|---|---:|---:|
| Damage | 25 | 50 (2×) |
| Server fire interval | 6 ticks / 200 ms | 4 ticks / approximately 133 ms |
| Maximum sustained rate | 5/s | 7.5/s (1.5×) |
| Ammo / reload | Existing reserve and reload | Unlimited; reload rejected |
| Active projectile cap | 12 | 18 |

The Gold projectile cap scales by 1.5× to sustain the requested cadence over the unchanged two-second lifetime; leaving it at 12 would throttle Gold fire. Projectile speed, size, muzzle position, swept collision, shield-first damage and server validation remain unchanged. Gold adds no health, shield, movement or boost benefit. Existing tractor-attacker firing restrictions still apply. Gold cancels a normal reload on equip; death/reset never restores it. Normal resources retain their existing lifecycle behavior.

Central elimination/status/disconnect hooks drop ownership exactly once at the ship location (bounded to the existing world margin), with the same unique weapon ID and a global drop announcement. Dropped weapons are independent of planetary reward locks. Aliens cannot equip or collect them. Ended matches freeze objective advancement; reset clears progress, successful history, pickups, ownership, feed and capture UI. Room/scene disposal retains existing lifecycle behavior.

## Bots and presentation

Existing deterministic bot intent gains CAPTURE and GOLD_GUN goals. Nearby combat (within 320 units) takes priority; an unarmed bot otherwise pursues the nearest pickup within 5000 units. Capture opportunities rotate by slot and 45-second phase, with a 30-second objective window; unfinished captures continue. Steering uses existing keyboard-style controls, imperfect bounded aim and boost. Tractor escape retains highest priority. Existing alien melee behavior remains intact. No external AI service, navigation rewrite or special bot stats were added; the goal DTO is available for future pilots.

`src/objective-visuals.ts` owns bounded cached Graphics and eight reusable arrow labels. Available rings are gray, capturing cyan, contested salmon and pending Gold gold. A one-second gold completion pulse highlights materialization; pickups float with a small gun glyph and restrained glow. Holders show an attached gun and gold hull outline; Gold projectiles and the infinite-ammo HUD identify the weapon to all clients. Standard and Low retain these gameplay cues without new shaders, textures or particle emitters.

Capture HUD progress comes only from accepted snapshots. The server creates announcements on transitions, retains the newest eight records, and replicates them through the existing snapshots; the client shows the newest three for six seconds without appending duplicates on each tick. Off-screen arrows distinguish active captures, planetary Gold and dropped Gold, point to current world positions and disappear when the target is visible or removed. At most eight nearest indicators are displayed to bound clutter; this is a display limit, not a pickup limit. DOM and text textures update only when needed; scene shutdown destroys cached resources.

## Automated verification

Final verification on 2026-10-12:

| Command / check | Result |
|---|---|
| `npm test -- --workers=1` — Node | **231 passed, 0 failed** |
| Same command — Playwright Chromium | **48 passed, 0 failed**, 10.2 minutes |
| `npm run build` | Passed client typecheck and production Vite build |
| `npm run build:server` | Passed server typecheck |
| `git diff --check` | Passed |
| Asset bytes against P3S2.9 | All tracked `public/assets/` files unchanged |
| Environment / Horizon / movement / tractor source | No changes; only visual layout now re-exports shared planet geometry |

The existing four-planet Canvas/SwiftShader material and cleanup test passed in 50.3 seconds, with no timeout change. No unresolved automated timeouts remain. Production bundling retains Vite's existing large-chunk advisory; this is not a build failure.

New tests cover independent progress/decay/contesting, damage and combat during capture, once-per-match history, reconnect policy, Gold-holder capture, simultaneous completions and atomic pickup, alien/spectator exclusion, drop/reset, bot goals/actions, sustained Gold cadence and snapshot isolation. Real socket clients exercise forged fields/events and identical authoritative snapshots. Three-browser tests exercise capture, contest, third-party theft, Gold fire, death/recovery, announcements, arrows and repeated scene entry. Canvas and WebGL tests cover Standard/Low cues and WebGL error checks.

Existing assertions and timeouts were preserved. The new three-browser objective scenario has its own 90-second budget for three cold scenes and more than 700 controlled simulation ticks. Its snapshot barrier waits for the final authoritative tick rather than sleeping or dropping assertions. Two initial new unit-fixture failures were corrected: an unintended ring occupant correctly contested one test; a Gold holder correctly captured in another. Neither required weakening game rules.

Screenshots from the final run:

- [Planetary materialization](docs/art-reference/p3s3/p3s3-materialization.png)
- [Canvas Standard Gold ownership](docs/art-reference/p3s3/p3s3-gold-standard.png)
- [Canvas Low Gold ownership](docs/art-reference/p3s3/p3s3-gold-low.png)
- [WebGL Standard objectives](docs/art-reference/p3s3/p3s3-webgl-standard.png)
- [WebGL Low objectives](docs/art-reference/p3s3/p3s3-webgl-low.png)

## Known limitations and scope

- Cloud Chromium uses software rendering. Passing visual/GPU-error checks does not prove real-hardware 60 FPS or separate-device behavior.
- Drops use the actual death location. A weapon dropped deep inside the existing lethal Horizon may be unrecoverable. Capture-created rewards avoid the Horizon; this step does not relocate death drops or introduce hazard protection/navigation.
- Bots use deliberately simple reactive steering. They can be distracted by close combat or compete in the same ring; they do not have route planning around the Horizon.
- Existing planet images have baked lighting/background tradeoffs described in P3S2.9. Their bytes and alignment are preserved.
- No harvesting, physical chests, loot-opening animations, full weapon slots, consumables, materials, planet collision/cover/orbits or Horizon boundary mechanics are implemented. No tracked Pages build was rebuilt.

## Windows manual acceptance

Use PowerShell in the repository. Preserve local changes before pulling; use a fast-forward pull only:

```powershell
git branch --show-current  # must print work
git status --short
git pull --ff-only origin work
npm ci
npm run server
```

In a second PowerShell terminal in the same repository, run `npm run dev`. Open Vite's printed local URL (usually `http://localhost:5173`) and select server `http://localhost:3001`. Use three separate browser windows, create a room in the first and join its code in the others. The host can **FILL GAME** to add regular bots, then **Start match**. Capture is disabled while WAITING/ENDED. For an isolated rules check, start with three humans before adding bots in a separate round.

1. Fly with WASD/arrows and Shift boost to a planet using the minimap and coordinates above. Cross its visible ring: the local HUD should show its name and server progress toward 10 seconds. Keep moving, firing with mouse/Space, reloading with R and using E tractor; normal nonlethal damage must not reset progress. An active tractor attack still blocks firing under the existing rules.
2. Accumulate approximately eight seconds, leave for two seconds, and return: roughly four seconds should remain. Leave longer and verify zero, never negative. Bring a second living human inside: CONTESTED pauses both inside attempts. Move one out: the remaining eligible participant resumes its own progress; the outsider decays at 2×. A previous capturer or Gold holder must still contest. An alien must not contest or earn progress.
3. Finish ten uncontested seconds. All windows should see the capture announcement and gold pulse. Follow the floating gun just outside the planet, or its off-screen Gold arrow. Fly within pickup range: it equips automatically, with no key. Repeat with another human stealing the reward. A pending planetary gun must block new captures; after collection another unused participant can capture. The successful participant cannot capture that same planet again this match.
4. Check GOLD GUN / infinity ammo, visible gold ownership and gold bullets in another window. Hold fire and press R: no reload or ammo depletion; damage is doubled and cadence approximately 1.5×, without extra health/shield/speed. A Gold holder can capture another unused planet but cannot collect a second gun. Two simultaneous eligible collectors must yield one owner.
5. With at least three living participants, kill the holder while a recoverer remains alive. Confirm one drop, the global announcement and an off-screen dropped-Gold arrow; another living human can automatically recover it. The eliminated alien cannot collect it or regain it on respawn. Using only two survivors ends the round immediately, freezing pickups until reset, so use three for recovery acceptance.
6. Trigger winner/draw and wait the existing six-second reset. Verify normal human ammo/HUD, no Gold equipment/pickups, cleared capture progress/history/feed and fresh eligibility after the next host start. Back/Create/Join must not duplicate rings, arrows or stale messages. An active-round disconnect/rejoin is an OUT spectator until reset, preventing a capture-history bypass.
7. Start a separate **FILL GAME** round. Observe regular bots pursuing/contesting captures, collecting/firing/dropping Gold and escaping tractors; alien bots remain melee-only and cannot earn rewards. Close fighting may override capture intent.
8. Press **F3**, select **Standard** in the graphics-quality control and play for at least 60 seconds at your usual resolution; record the displayed average FPS and stutters. Repeat in **Low**, including FILL GAME and combat near each planet. Verify ship outlines, names, Gold bullets/gun cues, capture rings/arrows and planet readability against all four surfaces. Confirm custom planet/ship art, starfield and black-hole visuals remain familiar. Target approximately 60 FPS on real hardware; record the GPU, resolution and quality rather than treating cloud results as acceptance.
9. Repeat the room/capture/steal/drop flow from a second computer against a reachable server. In DEV, separately test the existing 150 ms fake-lag and jitter controls; capture completion, pickup and damage must follow authoritative snapshots. This separate-device check has not been performed in the cloud.
