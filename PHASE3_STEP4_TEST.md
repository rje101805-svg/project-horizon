# P3S4 — Weapons, rarities, floating loot, ammunition and inventory

Implemented on `work` from P3S3 `af09d8f7f30521deb6ae7e5076f1b26dd483a07d`. The owner confirmed P3S3 local acceptance. P3S4 adds five regular weapon classes, three damage rarities, finite ammunition, three slots and Galaxy exclusivity, using procedural placeholders. **Next visual step: custom transparent weapon PNG integration and polish**, not implemented here.

## Balance and configuration

The existing durability model remains **100 HP + 50 shield = 150 effective HP**, with shield-first damage and 40-HP aliens. Following the specification's durability adaptation rule, regular damage is scaled by **1.5×** from its supplied 100-EHP table. This preserves intended shots-to-eliminate thresholds. Galaxy damage is an independent absolute **40**, not scaled or derived from Blaster rarity. Accepted alien melee remains **5**, now explicitly independent of Blaster damage.

`shared/weapons.ts` centralizes definitions, damage scale, ammo types/caps/packs, rarity weights, Galaxy stats, explosion radius and stun timing. Rarity changes **only damage**. Stable rendering asset IDs are in the same definitions; image loading stays out of server combat/inventory. `shared/combat.ts` retains compatible active-magazine fields for existing presentation.

| Weapon | Common / Rare / Legendary actual damage | Shots/s | Reload | Magazine | Fresh reserve grant | Ammo |
|---|---|---:|---:|---:|---:|---|
| Blaster | 40.5 / 45 / 51 | 5.5 | 2.3s | 30 | 60 | Energy Rounds |
| Nova Shotgun | 108 / 127.5 / 157.5 total | 0.7 | 4.0s | 6 | 12 | Plasma Shells |
| Missile Launcher | 82.5 / 97.5 / 112.5 direct | 0.75 | 3.0s | 3 | 6 | Missiles |
| Ion SMG | 18 / 21 / 25.5 | 11 | 2.2s | 40 | 80 | Light Energy Rounds |
| Zapper | 22.5 / 27 / 31.5 | 1.25 | 2.5s | 12 | 24 | Shock Cells |
| Galaxy Gun | 40, independent premium category | 6 | None | Infinite | None | None |

Server cadence uses fractional tick carry in the existing 30 Hz clock, avoiding a permanent round-up that would reduce 11/s SMG to 10/s or 5.5/s Blaster to 5/s. Actual shot timing is quantized to ticks; repeated packets cannot produce same-tick bursts. Reloads quantize to 69 / 120 / 90 / 66 / 75 ticks. Switching retains the ongoing fire cooldown and cancels unfinished reload without transferring rounds.

Theoretical TTE below assumes a full-health/shield target, every shot hits at full damage, first hit at time zero, no flight time, regeneration or reload. Values use configured average cadence; live tick scheduling, aim, range and spread can increase them.

| Weapon | Common hits / TTE | Rare hits / TTE | Legendary hits / TTE |
|---|---|---|---|
| Blaster | 4 / 0.545s | 4 / 0.545s | 3 / 0.364s |
| Nova Shotgun, all five close pellets | 2 / 1.429s | 2 / 1.429s | 1 / 0s |
| Missile Launcher, direct | 2 / 1.333s | 2 / 1.333s | 2 / 1.333s |
| Ion SMG | 9 / 0.727s | 8 / 0.636s | 6 / 0.455s |
| Zapper | 7 / 4.8s | 6 / 4.0s | 5 / 3.2s |
| Galaxy Gun | 4 / 0.5s | Same | Same |

These intentionally short initial thresholds need local balance testing. Common Blaster can kill an unprotected 40-HP alien in one hit; Legendary Shotgun can kill a full 150-EHP human with a complete close spread. No health changes were made to offset that. Galaxy theoretical sustained DPS is 240. With the instructed regular-damage scaling, Rare/Legendary Blaster theoretical DPS is 247.5/280.5, above Galaxy DPS; unlimited ammunition and no reload remain premium advantages. This balance tradeoff is flagged for playtesting rather than silently changing the specified absolute Galaxy stats.

## Combat

`server/projectiles.ts` retains authoritative request/life/sequence checks, muzzle position, velocity inheritance, swept nearest-hit collision, Horizon/world removal, central shield-first damage and valid same-tick trade behavior. Ownership determines stats; client weapon, damage, position and ammo fields confer no authority.

- Blaster is automatic, speed 800, two-second lifetime, general-purpose range.
- Shotgun creates **five** pellets per consumed shell, spread across 0.32 radians. Each receives one-fifth of rarity damage. Damage is full through 100 units, then decreases linearly with traveled distance to a 20% floor; lifetime is 0.6s. Partial pellet hits are proportional. Prediction hands each pellet into its authoritative identity.
- Missiles travel at 430 units/s for up to three seconds. A direct target receives only direct damage. Other eligible enemy ships within configurable radius **130** receive at most 50% direct damage, linearly reduced to zero at the radius. Owner is excluded; the direct target cannot also receive splash. Each missile is removed after one explosion, including expiry/world/Horizon contact. Planets remain non-collidable.
- SMG uses small bolts, speed 850, 0.8-second lifetime and deterministic bounded spread, limiting long-range pressure.
- Zapper uses electrical bolts, speed 650, two-second lifetime and **one shot per trigger pull**. Successful damage applies a **500 ms** stun unless already stunned or immune. Repeated hits never extend stun; hits during immunity still damage. All attackers share the target's **1500 ms post-stun immunity**. Stun removes thrust/boost/fire/tractor initiation while existing velocity, gravity and tractor forces remain coherent. Shared movement applies the same coasting behavior in prediction. Death/respawn/disconnect/reset clear both states.
- Galaxy retains gold presentation but uses absolute 40 damage and six shots/s, infinite ammo and no reload. Existing tractor-attacker firing restrictions remain.

Per-owner live projectile caps are bounded: Blaster 12, Shotgun 20, SMG 16, Missile/Zapper 8, Galaxy 18. All variants of a class share cadence, speed, lifetime, magazine, reload, spread and effects. Explosion/shock records are bounded to 24 with 400 ms visibility, rendered as simple Graphics rings without particle emitters or shaders.

## Inventory and ammunition conservation

`server/inventory.ts` is the authoritative equipment/loot boundary. Every regular instance has a unique ID, class, rarity, loaded magazine, capacity and consumed-grant flag. Three slots and active index are server state; reserve pools belong to the player. Eligible starting humans/bots receive one Common Blaster, 30 loaded and 60 reserve, with its grant already consumed. Match starts/resets create fresh starting IDs; aliens receive none. Active/ended late joiners and reconnecting OUT spectators have empty slots/reserves until reset admits them, so repeated spectator joins/disconnects cannot seed free loadout drops into an active round.

Fresh world guns have a full magazine and a **one-time two-magazine reserve grant**, committed atomically with first collection. Caps accept only available reserve space; excess grant is forfeited immediately and the flag remains consumed. Dropping, swapping, recollecting another owner's gun, switching and premium transitions never renew it. Loaded rounds follow the same instance ID through every transfer.

Reserve caps / standard pack sizes: Energy 180 / 30, Plasma 36 / 6, Missiles 18 / 3, Light Energy 240 / 40, Shock 72 / 12. Compatible ammo means an owned regular weapon uses that pool. A full pool leaves the pickup untouched; partial collection subtracts only accepted rounds and leaves the exact remainder in the world. Multiple same-ammo guns use one shared pool. Reload moves only available reserve into missing magazine space, once; empty reserve cannot reload or fire an empty gun. DEV refill remains explicitly server-authorized and forbidden in production.

Outside configured generation/loadouts/grants, every transfer conserves rounds. Death or Galaxy collection scatters each actual weapon instance, then finite small compatible ammo packs deducted from reserve, then additional finite packs for remaining reserves. Empty reserves produce no ammo. Inventory is cleared exactly once. Capacity/expiration destruction described below is an explicit finite-resource sink, not regeneration. Snapshot active `ammo/maxAmmo` fields are server getter views of the active weapon, not separate ammo owners.

Controls: **1 / 2 / 3** select an occupied slot; **mouse wheel over canvas** cycles occupied slots; **R** reload; **F** swaps active weapon with the nearest eligible regular pickup only when all slots are full. **E** remains tractor. Empty slots collect automatically; full slots never silently replace. Prompt: `F — SWAP FOR [RARITY] [WEAPON]`. Swap preserves the outgoing weapon identity, magazine and consumed flag; its drop blocks the same player for 750 ms and a server swap cooldown prevents held/replayed loops. F ignores key repeat. A swap during reload is rejected; switching cancels reload.

Inventory commands carry monotonic sequence, room, round, membership session, life/teleport markers and expected inventory revision. Server validates all of them; stale, duplicate, forged, unowned-slot, spectator, alien, stunned and cross-room actions fail. No client award or ammo-transfer message exists.

## Floating loot and Galaxy integration

The existing 12,000 × 12,000 map gets **20 regular weapons + 25 ammo pickups** at each active match start. Each of five classes can spawn with Common/Rare/Legendary probabilities **60% / 30% / 10%**; Galaxy is never in this pool. Bounded random rejection samples give natural open-space, between-objective and near-planet distribution rather than a grid, excluding planet visual discs plus clearance, existing Horizon influence region plus 250 units, player positions within 220 units, boundaries and other initial pickups within 180 units. Generation makes at most 160 attempts per item and safely skips an item if no valid location exists.

Conservative replenishment generates at most **one missing world resource every five seconds**, at a fresh safe position. It stops near the overall cap of **160 regular weapon/ammo pickups**, including drops. Drops expire after **120 simulation seconds**. If forced death/Galaxy drops encounter a full cap, the oldest regular pickup is deliberately destroyed to represent the new finite drop without unbounded accumulation. Premium pickups remain governed by P3S3 and are outside the regular cap. Match reset clears world loot after queued-replacement bot removal, so those drop hooks cannot reintroduce old-round instances; no cross-match pickup or weapon IDs persist.

Automatic pickup uses authoritative squared distance within **45** units, eligible current roster humans/bots and deterministic nearest-distance/ID ordering. World grants cannot be claimed twice, including concurrent socket intents. Newly spawned drops wait a tick; same-owner grace and F cooldown prevent immediate loops.

Galaxy collection preserves planetary captures, contesting, once-per-participant history, theft, automatic proximity collection, announcements/arrows and premium death drops. It drops all regular guns and exact reserves, clears slots/pools and equips the Galaxy Gun. Holders cannot collect regular guns/ammo, switch slots or hold another premium gun. Their death creates only the existing premium drop, with no phantom regular resources. Player-facing Gold Gun wording is now **Galaxy Gun**; internal `goldGunId` and `gold` projectile tags remain stable for compatibility.

## Bots, presentation and future assets

Regular FILL GAME bots use the same ownership, reserve, reload, pickup, swap, damage, stun and death rules. They discover loot within 1200 units, prefer upgrades by rarity and combat role, collect compatible ammo, choose slots by range/usefulness, deliberately swap stronger pickups and retain capture/premium goals. Close combat and existing tractor escape retain priority. Bots have finite regular ammo and no special stats. Aliens remain melee-only. No OpenAI calls or new navigation system were introduced.

`src/weapon-visuals.ts` centralizes rifle, wide shotgun, launcher, compact SMG and coil-rifle glyphs plus weapon-specific projectile shapes. Future asset IDs: `weapon-blaster`, `weapon-nova-shotgun`, `weapon-missile-launcher`, `weapon-ion-smg`, `weapon-zapper`, `weapon-galaxy`. Transparent PNG replacement belongs here; these procedural glyphs remain fallbacks. No final weapon images were generated.

`src/loot-visuals.ts` uses one cached Graphics object, culls off-screen loot and reuses at most 16 reusable labels with overlapping labels suppressed. Pickups hover/rotate gently and show class/rarity or ammo quantity. Rarity colors are gray/white, blue and purple; premium remains gold. Compact snapshot-driven HUD shows three slots, active marker, active magazine/reserve, reload, swap prompt and stun/immunity. Effects are bounded and scene/disconnect cleanup hides stale UI. Standard/WebGL and Canvas/Low retain all gameplay cues and F3 metrics.

## Verification and known limits

Verification on 2026-10-12:

| Check | Result |
|---|---|
| Final `npm run test:server` | **287 passed, 0 failed** (231 prior + 56 new); preceding full run had 286 before the last reset regression was added |
| Same full run — Playwright | **49 passed; 1 hit its unchanged 30s fixture deadline**, 10.7 minutes |
| Corrected held-fire fixture: `npx playwright test tests/projectiles.spec.ts --workers=1` | **1 passed in 16.4s**, same timeout and assertions |
| Final bot queued-replacement/reset retest, normal and 150ms/jitter | **2 passed** after clearing loot after removed-bot drop hooks |
| Final Canvas/WebGL inventory and screenshot retest | **2 passed** |
| Overall browser coverage | **All 50 scenarios verified**, no unresolved failures/timeouts; full-run and targeted-retest results distinguished above |
| `npm run build` | Passed client typecheck and Vite production build; existing large-chunk advisory remains |
| `npm run build:server` | Passed server typecheck |
| `git diff --check` | Passed |
| Original assets / visual scope | All **38 tracked public files byte-identical** to P3S3; no `src/visual`, Horizon, ship-geometry or normal-flight balance changes |

The existing four-planet Canvas/SwiftShader material and cleanup test passed in **48.8 seconds**, with its timeout unchanged. Standard/Low objective and loot scenarios passed in both renderers. No real-GPU FPS or separate-device results are claimed.

 The initial full run found obsolete stat fixtures and two introduced presentation/input regressions: inline reserve text widened the HUD, and a normal held-fire trigger survived release during reload. Both were corrected without disabling assertions or the connection-stall guard; the narrow-viewport HUD position was also adjusted to contain its added reserve row. Higher weapon damage now uses a centralized maximum in the hit-receipt parser rather than the old Common-Blaster-only bound. New unit and real-socket tests cover 15 variants, thresholds, fractional cadence, finite reloads, grants/caps/remainders, instance identity, swap/death/Galaxy conservation, stale commands, simultaneous pickup, missile direct/splash/owner rules, shotgun pellets/falloff, stun/immunity, bot actions, reset and bounded drops. Browser scenarios use actual slot keys, F key repeat, wheel, automatic collection, semi-auto triggers, premium capture/exclusivity and Standard/Low in Canvas and SwiftShader WebGL.

Historical tests now use the explicitly requested new magazine/reload/damage and Galaxy wording. Alien melee stays 5. The existing stall guard still freezes the client after a second without snapshots; controlled-clock browser fixtures synchronize snapshots instead of disabling it. No existing browser timeout or gameplay assertion is weakened to conceal failures. The held-fire browser fixture reached its existing 30-second deadline after migrating from 12 to 30 rounds and from 45 to 69 reload ticks: per-tick browser polling accounted for the extra wall time. It now batches controlled simulation ticks and waits on the final snapshot, preserving intermediate and terminal assertions and the timeout.

Known limitations:

- Real-GPU 60 FPS and separate-computer acceptance remain manual. Software WebGL success is not an FPS claim.
- Uniform bounded random loot placement can yield varied class/rarity mixes; configured probabilities are long-run weights, not exact per-match quotas.
- Fixed 30 Hz scheduling quantizes individual firing intervals. Blaster/SMG averages use fractional carry; aim, travel and reload increase theoretical TTE.
- Drops at an actual lethal Horizon death location may be unrecoverable. No hazard immunity, relocation or route-planning redesign was added.
- Missile splash damage applies to every eligible target, but the existing shooter damage-number model deduplicates by projectile ID and therefore displays one target receipt for a multi-target explosion. Actual health/shield damage and splash tests cover all targets; expanding those numbers is a presentation follow-up.
- Bots remain reactive, not omniscient or pathfinding pilots. They can be distracted by combat or choose contested capture objectives.
- Expiration/cap eviction deliberately destroys finite dropped resources. This bounds accumulation and is an explicit conservation exception; transfers and recollection never manufacture ammo.
- Client inventory is authoritative after snapshots, so rapid commands based on an old revision can be rejected; wait for the active-slot marker before the next switch/swap.
- Existing planet baked-art lighting tradeoffs remain. Ship/planet/cosmic asset bytes and Horizon visuals are preserved. No Pages build or deployment configuration was changed.

Screenshots from the final browser run (reviewed for pickup/HUD/planet readability):

- [Canvas regular inventory and placeholders](docs/art-reference/p3s4/p3s4-canvas-regular.png)
- [WebGL regular inventory and placeholders](docs/art-reference/p3s4/p3s4-webgl-regular.png)
- [Canvas Standard Galaxy transition](docs/art-reference/p3s4/p3s4-canvas-standard.png)
- [Canvas Low Galaxy transition](docs/art-reference/p3s4/p3s4-canvas-low.png)
- [WebGL Standard Galaxy transition](docs/art-reference/p3s4/p3s4-webgl-standard.png)
- [WebGL Low Galaxy transition](docs/art-reference/p3s4/p3s4-webgl-low.png)

## Windows manual acceptance

In PowerShell, preserve any local changes first, verify `git branch --show-current` prints `work`, then `git pull --ff-only origin work`, `npm ci`, and `npm run server`. In a second terminal run `npm run dev`. Open the printed Vite URL, usually `http://localhost:5173`, and use flight server `http://localhost:3001`. Create/join one room in three browser windows; start a match. Use three survivors for death-drop recovery so the round does not immediately end. Run a separate **FILL GAME → START MATCH** round for bot/performance testing.

- [ ] Start with slot 1 Common Blaster, 30 loaded / 60 reserve, slots 2–3 empty. Fly using WASD/arrows, Shift boost, mouse aim, Space/mouse fire, R reload and E tractor.
- [ ] Explore open space and near planets; find naturally scattered weapons and ammo. Inspect gray Common, blue Rare and purple Legendary glyphs. Fill empty slots automatically; a full inventory must not change on proximity alone.
- [ ] Select 1/2/3 and wheel over canvas. Check class, rarity, magazine, reserve and active marker. Partial R reload deducts exactly transferred reserve; switching cancels it. Run reserves to zero: no reload may manufacture rounds.
- [ ] With all three slots full, approach a weapon and see F swap prompt. Tap F once; the outgoing weapon drops. Hold/repeat F: no repeated loop. Recollect a used gun after grace and verify its old magazine persists and no extra reserve grant appears. Repeat across another player.
- [ ] Test every rarity/class. Blaster/SMG fire automatically; Shotgun spreads five pellets with reduced distant damage; missiles directly damage one target and splash nearby enemies, never the shooter or twice on the direct target. Zapper fires once per pull, stuns for 0.5s and permits damage but no new stun for the following 1.5s even from another attacker. Stunned ships coast and recover normal thrust/fire/tractor controls.
- [ ] Collect compatible ammo. At cap it remains; near cap only the accepted amount transfers and the remainder stays visible. Magazine rounds follow the gun; reserve stays with the player when swapping guns.
- [ ] Kill a three-weapon holder. Inspect three persistent weapon IDs/magazines and finite ammo drops; empty reserves must produce none. Recover with another living human/bot. Aliens ignore all regular loot and ammo.
- [ ] Capture any planet for ten uncontested seconds. Contest/decay/history and global announcements/arrows must remain familiar. Collect its Galaxy Gun: all regular guns and actual reserves drop; slots become disabled, ammo becomes infinite and gold ownership/projectiles remain visible. Regular loot/ammo must be ignored. Galaxy damage is 40 at six/s, with no reload. Kill/recover its premium drop; no phantom regular ammo should appear.
- [ ] End/reset the round: clear all pickups/ownership/progress/stun/history and restore a fresh Common Blaster with 30/60. Back/Create/Join must not duplicate graphics, prompts or slot UI.
- [ ] Observe FILL GAME bots collecting ammo/weapon upgrades, switching/reloading/firing all classes, swapping full inventories, capturing/pursuing Galaxy and respecting stun. Alien bots remain melee-only.
- [ ] Press **F3**, test **Standard** and **Low** for at least 60 seconds each with eight participants and combat near every planet. Record GPU, resolution, average FPS and stutters. Check loot glyphs, rarity colors, missiles/shock effects, ship names/outlines, capture/loot indicators and planet readability. Approximately 60 FPS remains the local target, not cloud-verified acceptance.
- [ ] Repeat capture/loot/swap/drop from another computer against a reachable server and separately with DEV 150 ms/jitter. Verify delayed inventory state cannot duplicate instances, ammunition or damage. Manual checks above have not been claimed completed in the cloud.
