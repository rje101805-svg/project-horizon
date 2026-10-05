# Project: Horizon

A stylized space battle royale concept for the Handshake/OpenAI multiplayer game challenge.

**Launch → explore → loot → fight → survive.** Players will choose a pilot and rocket, launch out of a black hole, explore a solar system, and compete as the expanding black hole consumes the map. This first build is **single-player groundwork**, not a multiplayer game or a complete challenge submission.

## Play locally

1. Install **Node.js 22.12 or newer** (Node 24 LTS recommended) from https://nodejs.org.
2. Download this repository, or clone it with Git:
   ```sh
   git clone https://github.com/rje101805-svg/project-horizon.git
   cd project-horizon
   ```
3. In a terminal inside the project folder, install packages:
   ```sh
   npm ci
   ```
4. Start the game:
   ```sh
   npm run dev
   ```
5. Open the local address printed in the terminal, normally **http://localhost:5173**. Select a pilot and rocket color, then click **Launch solo mission**. Keep the terminal running; press Ctrl+C to stop it.

No API keys, accounts, or backend are needed. A desktop browser and keyboard are required. Touch controls are planned.

### Controls and objective

- **WASD / arrow keys:** move in any direction. The rocket rotates toward your movement.
- **Shift (hold):** boost. Boost is unlimited in this prototype.
- **R / Restart button:** begin a fresh round.
- Fly over **yellow squares** to collect supplies, **cyan squares** for +40 shield, and **pink squares** for +30 hull repair. Hull and shields cap at 100.
- Collect **at least 5 supplies**, survive **60 seconds**, then enter the **northeast extraction beacon** (the small square on the minimap). A successful extraction ends the solo mission.
- The black hole grows continuously at the center, destroys loot, obscures planets, and inflicts 30 damage per second inside its ring. Shields absorb damage before hull. The world boundary prevents leaving the map, so waiting forever will end in defeat.
- The minimap shows planets, the growing black hole, your white position marker, and the beacon (gray until it opens, cyan afterward).

Planets are exploration landmarks: flying over them is allowed. There is no landing or gravity simulation yet. Pilot and rocket selections are cosmetic, with identical handling. Extraction is a prototype win condition; last-player-standing victory will replace it when multiplayer combat is implemented.

## Current progress

Implemented:
- Phaser game with TypeScript and Vite, procedural placeholder graphics, camera follow, and deterministic star field.
- Home screen, cosmetic selections, gameplay HUD, hull/shields, supply inventory, minimap, and results with play again/back home.
- Four planets, collectible loot, boost movement, expanding black hole, damage, and solo extraction/death conditions.
- Type checking, production build, browser smoke tests and survival rule checks.

Planned (not implemented):
- Create/join room lobby, player list, ready state, and real networking.
- Weapons, shooting, opponents, eliminations, placement, and last-player-standing winner.
- Ship customization and deeper resource/inventory systems.
- Later: ship combat improvements, planetary landing, ground combat, and planet-specific gravity.

The HUD explicitly shows weapon as “none”; there are no simulated multiplayer players or fake room controls.

## Checks and production preview

```sh
npm run build
npm run preview
```

`build` checks TypeScript and writes a static website to `dist/`. `preview` serves that build locally, normally at http://localhost:4173. It is a local check, not a public deployment. The Phaser engine creates a relatively large JavaScript bundle; this is acceptable for the initial prototype.

For automated checks:

```sh
npx playwright install chromium
npm test
```

Tests use system Chromium when available and Playwright Chromium otherwise. They exercise keyboard movement, pickups, damage, restart, defeat and extraction; the long round is accelerated by manipulating scene state through a **development-only** handle. No such handle is exposed by the production build. Tests verify gameplay logic and browser errors, not a full minute of human gameplay or multiplayer behavior.

In a cloud coding workspace, its localhost belongs to that workspace, not your own computer. Use a forwarded port/preview if your workspace supports one, or run locally. No public hosted preview is configured. The dev server binds to all interfaces so workspace port forwarding can reach it.

## Project layout and decisions

- `src/main.ts`: Phaser scene and screen transitions.
- `src/rules.ts`: shared survival rules, suitable for later server-side reuse.
- `src/style.css`: HTML interface styling.
- `tests/game.spec.ts`: browser and rule verification.

Vite provides a straightforward fast development server and static build. Phaser handles rendering, keyboard input, and the camera. HTML controls keep menus and HUD easy to edit. The small prototype uses direct movement and distance-based collisions; no physics engine or backend is needed yet. Art is generated locally without asset downloads.

## Next milestone

Add a small **server-authoritative two-player room** with create/join, ready state, synchronized rocket positions, and synchronized black hole timing. Keep damage and loot decisions on the server so clients cannot decide their own outcomes. Validate two separate browser clients before adding shooting, elimination, and battle royale results. Public hosting will require a separate deployment decision, especially for the persistent multiplayer server.
