# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hud.spec.ts >> compact HUD, F3 controls, actual RTT/metrics and room-scoped roster updates work
- Location: tests/hud.spec.ts:6:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "active"
Received: "launch"

Call Log:
- Timeout 10000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- main [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e6]:
      - button "DEV reset flight" [ref=e7] [cursor=pointer]
      - button "Back to home" [ref=e8] [cursor=pointer]
    - generic [ref=e9]:
      - strong [ref=e10]: "ROOM CODE: L2FM7"
      - generic [ref=e11]: 2 / 8 players
      - button "Copy code" [ref=e12] [cursor=pointer]
      - button "Copy join link" [ref=e13] [cursor=pointer]
      - status
    - generic [ref=e14]:
      - generic [ref=e15]:
        - 'checkbox "DEV ONLY: fake network · 150ms each way" [ref=e16]'
        - text: "DEV ONLY: fake network · 150ms each way"
      - generic [ref=e17]:
        - checkbox "±30ms jitter" [checked] [ref=e18]
        - text: ±30ms jitter
      - generic [ref=e19]: Fake network OFF
    - generic: HORIZON IN 0:59
    - paragraph: Safe space
    - generic [ref=e20]:
      - generic [ref=e21]:
        - complementary "Tractor beam":
          - generic: TRACTOR READY · E
        - complementary "Ammunition":
          - generic: Round 1 · active · SPAWN PROTECTED
          - generic: "Humans alive: 2"
          - text: AMMO 30 / 30
          - generic: RESERVE 60
        - group "Weapon inventory" [ref=e22]:
          - generic [ref=e23] [cursor=pointer]:
            - generic: ▶ 1 COMMON Blaster 30/30 · RESERVE 60
            - button "Drop slot 1" [ref=e24]: DROP
          - generic [ref=e25] [cursor=pointer]: 2 EMPTY
          - generic [ref=e26] [cursor=pointer]: 3 EMPTY
        - generic "Radar minimap; N changes size"
      - complementary "Debug metrics" [ref=e29]:
        - strong [ref=e30]: DEBUG · F3 to hide
        - generic [ref=e31]:
          - text: 100 / 100 · Alive
          - progressbar "Debug health" [ref=e32]
          - text: SHIELD 100 / 100 ·
        - generic [ref=e33]: "Ping: 24 ms"
        - generic [ref=e34]: "FPS: 32 (3s avg)"
        - generic [ref=e35]: "Players: 2"
        - generic [ref=e36]: "Server: 30 Hz (recv 29.6/s)"
        - generic [ref=e37]:
          - generic [ref=e38]: X 17367.5 · Y 17367.5
          - generic [ref=e39]: Speed 0.0
          - generic [ref=e40]: Server tick 14415
          - generic [ref=e41]: Input 178 · ack 177 · pending 1
          - generic [ref=e42]: Correction 0.00 · remote delay 100 ms
          - generic [ref=e43]: Alive · health 100 / 100
          - generic [ref=e44]: ALIVE · HUMAN · kills 0
          - generic [ref=e45]: Blaster · ammo 30 / 30 · cooldown ready
          - generic [ref=e46]: "Authoritative projectiles: 0 · predicted: 0"
          - generic [ref=e47]: Tractor TRACTOR READY · E · attacker — · target — · range 220 · cone — · LOS — · pull 200 · elapsed —/5s · lock 0/3000ms · predicted pull false
          - generic [ref=e48]: Reload ready
          - generic [ref=e49]: Cooldown 0ms · 100%
          - generic [ref=e50]:
            - button "DEV refill ammo" [ref=e51] [cursor=pointer]
            - button "Damage 35" [ref=e52] [cursor=pointer]
            - button "Consume 1 ammo" [ref=e53] [cursor=pointer]
            - button "Start reload" [ref=e54] [cursor=pointer]
            - button "Start cooldown" [ref=e55] [cursor=pointer]
            - status
        - group "P3S2.6 cosmic study · DEV only" [ref=e56]:
          - paragraph [ref=e58]: "Presentation only: compositions move decorative studies beside your ship. They do not teleport players or add hazards. The real arena singularity stays authoritative. Camera inspection releases flight input and never teleports players."
          - generic [ref=e59]:
            - button "Open space" [ref=e60] [cursor=pointer]
            - button "Planet · bright" [ref=e61] [cursor=pointer]
            - button "Planet · dark" [ref=e62] [cursor=pointer]
            - button "Horizon study" [ref=e63] [cursor=pointer]
            - button "Combat backdrop" [ref=e64] [cursor=pointer]
            - button "Restore arena" [ref=e65] [cursor=pointer]
          - generic [ref=e66]:
            - text: Biome
            - combobox "Biome" [ref=e67]:
              - option "ice" [selected]
              - option "volcanic"
              - option "terrestrial"
              - option "moon"
          - generic [ref=e68]:
            - text: Inspect camera
            - combobox "Inspect camera" [ref=e69]:
              - option "Follow player" [selected]
              - option "Borealis"
              - option "Cinder"
              - option "Pelagia"
              - option "Ashen"
              - option "Central corridor"
              - option "Northwest corner"
              - option "Northeast corner"
              - option "Southwest corner"
              - option "Southeast corner"
              - option "Dense starfield / distant bodies"
              - option "Sparse starfield"
              - option "Nebula / dark dust lanes"
              - option "Western debris cluster"
              - option "Northern debris corridor"
          - generic [ref=e70]:
            - text: Visual intensity
            - slider "Visual intensity" [ref=e71]: "0"
          - generic [ref=e72]:
            - text: Quality
            - combobox "Quality" [ref=e73]:
              - option "Standard · WebGL if available"
              - option "Low · baked bodies / no lens" [selected]
          - generic [ref=e74]:
            - checkbox "Cinematic camera" [ref=e75]
            - text: Cinematic camera
          - generic [ref=e76]:
            - checkbox "Parallax" [checked] [ref=e77]
            - text: Parallax
          - paragraph [ref=e78]: "Renderer: Canvas · low · planets 0/4 · debris 5/47 · distant 0/11 · asteroid groups 0/4 · galaxies 5 · cached stars 13650"
          - status [ref=e79]: Arena · no visual study
    - generic:
      - status: Connected · server-authoritative flight · 30 Hz
    - region "Survival utilities":
      - generic: MATERIALS 0 / 300 · [Q] WALL −20 [4] SHIELD CELL ×0 · [5] REPAIR KIT ×0
      - status
    - generic "Pilot radio"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { TICK_RATE } from '../shared/flight';
  3  | import { MAX_HEALTH } from '../shared/lifecycle';
  4  | import type { FlightConnection } from '../src/network';
  5  | type DebugWindow = Window & { __HORIZON_FLIGHT__: FlightConnection };
  6  | test('compact HUD, F3 controls, actual RTT/metrics and room-scoped roster updates work', async ({ page, context }) => {
  7  |   test.setTimeout(60000);
  8  |   const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  9  |   await page.goto('/?devrooms=1'); await page.locator('#server-url').fill('http://127.0.0.1:3002');
  10 |   await page.locator('#create').click();
  11 |   await expect(page.locator('#hud-health-value')).toHaveText(`${MAX_HEALTH} / ${MAX_HEALTH}`);
  12 |   await expect(page.locator('#hud-health-bar')).toHaveJSProperty('value', MAX_HEALTH);
  13 |   await expect(page.locator('#hud-health-bar')).toHaveJSProperty('max', MAX_HEALTH);
  14 |   for (const [id, text] of [['shield', 'SHIELD 100 / 100'], ['ammo', 'AMMO 30 / 30']]) await expect(page.locator(`#hud-${id}`)).toHaveText(text);
  15 |   await expect(page.locator('#hud-weapon')).toHaveCount(0);
  16 |   await expect(page.locator('#debug-overlay')).toBeHidden();
  17 |   await page.keyboard.press('F3'); await expect(page.locator('#debug-overlay')).toBeVisible();
  18 |   await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F3', repeat: true })));
  19 |   await expect(page.locator('#debug-overlay')).toBeVisible();
  20 |   await expect(page.locator('#debug-players')).toHaveText('Players: 1');
  21 |   // Observe the real, existing RTT callback; never substitute a fake ping value.
  22 |   const measured = await page.evaluate(() => new Promise<number>(resolve => {
  23 |     const c = (window as unknown as DebugWindow).__HORIZON_FLIGHT__ as unknown as {
  24 |       callbacks: { ping: (ms: number | null) => void }; measurePing: () => void;
  25 |     };
  26 |     const original = c.callbacks.ping;
  27 |     c.callbacks.ping = ms => { original(ms); if (ms !== null) { c.callbacks.ping = original; resolve(ms); } };
  28 |     c.measurePing();
  29 |   }));
  30 |   await expect(page.locator('#ping')).toHaveText(`Ping: ${measured} ms`);
  31 |   await expect(page.locator('#debug-fps')).toHaveText(/FPS: \d+/);
  32 |   await expect(page.locator('#debug-server')).toHaveText(new RegExp(`Server: ${TICK_RATE} Hz \\(recv \\d+\\.\\d/s\\)`));
  33 |   await expect.poll(async () => Number((await page.locator('#debug-server').textContent())?.match(/recv ([\d.]+)/)?.[1] ?? 0)).toBeGreaterThan(0);
  34 |   const before = await page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest!.players[0].x);
  35 |   await page.keyboard.down('d'); await page.keyboard.press('F3');
  36 |   await expect(page.locator('#debug-overlay')).toBeHidden();
  37 |   await expect.poll(() => page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest!.players[0].x)).toBeGreaterThan(before);
  38 |   await page.keyboard.up('d'); await page.keyboard.press('r');
  39 |   await expect(page.locator('#hud-reload')).toHaveText(''); // R on a full magazine is a no-op, not a flight reset.
  40 |   expect(await page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest!.players[0].x)).toBeGreaterThan(before);
  41 |   await page.keyboard.press('F3');
  42 |   const code = (await page.locator('#room-code-display').textContent())!;
  43 |   const peer = await context.newPage(); await peer.goto('/?devrooms=1'); await peer.locator('#server-url').fill('http://127.0.0.1:3002');
  44 |   await peer.locator('#room-code').fill(code); await peer.locator('#join').click();
  45 |   await expect(page.locator('#debug-players')).toHaveText('Players: 2');
  46 |   const isolated = await context.newPage(); await isolated.goto('/?devrooms=1'); await isolated.locator('#server-url').fill('http://127.0.0.1:3002'); await isolated.locator('#create').click();
  47 |   await expect(isolated.locator('#debug-players')).toHaveText('Players: 1');
  48 |   await expect(page.locator('#debug-players')).toHaveText('Players: 2');
  49 |   await page.screenshot({ path: 'test-results/step7-hud.png', fullPage: true });
  50 |   await page.setViewportSize({ width: 680, height: 960 });
  51 |   // Lobby suppresses combat UI; F3 remains available over the full viewport.
  52 |   await expect(page.locator('.gameplay-hud')).toBeHidden();
> 53 |   await peer.locator('#ready-match').click();await expect(page.locator('#start-match')).toBeEnabled();await page.locator('#start-match').click();await expect.poll(()=>page.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.match.state),{timeout:10000}).toBe('active');
     |                                                                                                                                                                                                                                                                                      ^ Error: expect(received).toBe(expected) // Object.is equality
  54 |   const hudBox = await page.locator('.gameplay-hud').boundingBox();
  55 |   const debugBox = await page.locator('#debug-overlay').boundingBox();
  56 |   const gameBox = await page.locator('#game').boundingBox();
  57 |   expect(hudBox && debugBox && gameBox).toBeTruthy();
  58 |   expect(hudBox!.y).toBeGreaterThan(gameBox!.y + 90);
  59 |   expect(hudBox!.x + hudBox!.width).toBeLessThanOrEqual(gameBox!.x + gameBox!.width);
  60 |   expect(hudBox!.y + hudBox!.height).toBeLessThanOrEqual(gameBox!.y + gameBox!.height);
  61 |   expect(debugBox!.y).toBeGreaterThanOrEqual(gameBox!.y);expect(debugBox!.y+debugBox!.height).toBeLessThanOrEqual(gameBox!.y+gameBox!.height);expect(debugBox!.x+debugBox!.width<=hudBox!.x||debugBox!.y>=hudBox!.y+hudBox!.height).toBe(true);
  62 |   await peer.close(); await expect(page.locator('#debug-players')).toHaveText('Players: 1');
  63 |   await page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.disconnect());
  64 |   await expect(page.locator('#ping')).toHaveText('Ping: —');
  65 |   await expect(page.locator('#debug-players')).toHaveText('Players: —');
  66 |   await expect(page.locator('#debug-server')).toHaveText(`Server: ${TICK_RATE} Hz (recv —)`);
  67 |   await isolated.close(); expect(errors).toEqual([]);
  68 | });
  69 |
```
