import { test, expect } from '@playwright/test';
import { createGameServer } from '../server/game';
import { RoomStore } from '../server/rooms';
import type { FlightConnection } from '../src/network';
import type { ProjectileView } from '../src/projectile-view';
type DebugWindow = Window & { __HORIZON_FLIGHT__: FlightConnection; __reloadTrace: { reload: number; fire: number; adds: number };
  __HORIZON_GAME__: { scene: { scenes: { projectileView: ProjectileView }[] } } };

for (const lag of [false, true]) test(`R edge, authoritative reload, final-round handoff and no firing during reload (${lag ? '150ms ±30ms' : 'no fake latency'})`, async ({ page, context }) => {
  test.setTimeout(60000);
  const store = new RoomStore(), server = createGameServer(['http://127.0.0.1:5175'], store, { autoTick: false, combatDebug: true });
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const address = server.http.address(); if (!address || typeof address === 'string') throw Error('Missing server');
  const peer = await context.newPage(); let tick = 0;
  const frame = async () => {
    await page.evaluate(() => new Promise<void>(resolve => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.emit('latencyProbe', resolve)));
    server.step(); tick++;
    await expect.poll(() => page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.tick)).toBe(tick);
  };
  const advance = async (n: number) => { for (let i = 0; i < n; i++) { server.step(); tick++; await new Promise<void>(resolve => setImmediate(resolve)); } };
  const pending = () => page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.projectilePrediction.count(performance.now()));
  try {
    const url = `http://127.0.0.1:${address.port}`;
    await page.goto('/'); await page.locator('#server-url').fill(url); await page.locator('#create').click();
    await expect(page.locator('canvas')).toBeVisible();
    const code = (await page.locator('#room-code-display').textContent())!;
    await peer.goto('/'); await peer.locator('#server-url').fill(url); await peer.locator('#room-code').fill(code); await peer.locator('#join').click(); await expect(peer.locator('canvas')).toBeVisible();
    const id = await page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.id!);
    const room = store.roomFor(id)!, p = room.players.get(id)!, b = [...room.players.values()].find(p => p.state.id !== id)!;
    Object.assign(p.state, { x: 200, y: 1800 }); Object.assign(b.state, { x: 130, y: 1800 }); await frame();
    await page.bringToFront(); if (lag) { await page.keyboard.press('F3'); await page.locator('#fake-lag').check(); await page.keyboard.press('F3'); }
    await page.evaluate(() => {
      const w = window as unknown as DebugWindow, c = w.__HORIZON_FLIGHT__;
      w.__reloadTrace = { reload: 0, fire: 0, adds: 0 };
      c.socket.onAnyOutgoing(event => { if (event === 'reload') w.__reloadTrace.reload++; if (event === 'fire') w.__reloadTrace.fire++; });
      const add = c.projectilePrediction.add.bind(c.projectilePrediction);
      c.projectilePrediction.add = (r, p, now) => { const ok = add(r, p, now); if (ok) w.__reloadTrace.adds++; return ok; };
    });
    // Full-magazine R does nothing and must not reset flight.
    await page.keyboard.press('r'); await expect.poll(() => p.lastReloadSequence).toBe(1);
    expect(p.state.isReloading).toBe(false); expect(p.reset).toBe(false); expect(p.state.x).toBe(200);
    p.state.ammo = 7; await frame();
    await page.keyboard.down('r');
    for (let i = 0; i < 5; i++) await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', repeat: true })));
    await expect.poll(() => p.state.isReloading).toBe(true); await page.keyboard.up('r');
    expect(p.combatTimers.reload).toBe(45); expect(p.state.ammo).toBe(7);
    expect(await page.evaluate(() => (window as unknown as DebugWindow).__reloadTrace.reload)).toBe(2);
    await frame(); await expect(page.locator('#hud-reload')).toHaveText('RELOADING');
    await page.keyboard.down('Space'); await page.waitForTimeout(400); await page.keyboard.up('Space');
    expect(await pending()).toBe(0);
    expect(await page.evaluate(() => (window as unknown as DebugWindow).__reloadTrace.fire)).toBe(0);
    expect(room.projectiles.size).toBe(0); expect(p.state.ammo).toBe(7);
    await page.keyboard.down('d'); await page.waitForTimeout(lag ? 250 : 80); const x = p.state.x;
    await expect.poll(async () => { await frame(); return p.state.x; }, { timeout: 5000, intervals: [20] }).toBeGreaterThan(x);
    await page.keyboard.up('d'); expect(p.state.isReloading).toBe(true);
    // A second real client shoots during the original reload deadline.
    await peer.evaluate(() => new Promise<void>(resolve => {
      const c = (window as unknown as DebugWindow).__HORIZON_FLIGHT__;
      c.socket.emit('fire', { sequence: 1, aim: 0, lifeGeneration: 0, teleportSequence: 0 }, () => resolve());
    }));
    const remaining = p.combatTimers.reload; await frame();
    expect(p.state.shield).toBe(25); expect(p.state.health).toBe(100); expect(p.combatTimers.reload).toBe(remaining - 1);
    await advance(p.combatTimers.reload - 1); expect(p.state.ammo).toBe(7); expect(p.state.isReloading).toBe(true);
    await frame(); expect(p.state.ammo).toBe(12); await expect(page.locator('#hud-reload')).toHaveText('');
    // Final round triggers reload before any extra input and retains its one visual.
    p.state.ammo = 1; await frame(); await page.keyboard.down('Space');
    await page.waitForTimeout(60); await page.keyboard.up('Space'); await expect.poll(() => room.projectileSequence).toBe(2);
    expect(p.state.ammo).toBe(0); expect(p.combatTimers.reload).toBe(45); expect(room.projectiles.size).toBe(1);
    await frame(); await expect.poll(pending).toBe(0); await expect(page.locator('#hud-reload')).toHaveText('RELOADING');
    const visuals = await page.evaluate(() => {
      const w = window as unknown as DebugWindow, c = w.__HORIZON_FLIGHT__, now = performance.now();
      return c.projectilePrediction.render(w.__HORIZON_GAME__.scene.scenes[0].projectileView.sample(now, c.socket.id), now);
    });
    expect(visuals).toHaveLength(1); expect(visuals[0].id.startsWith('predicted:')).toBe(false);
    await page.keyboard.down('Space'); await page.waitForTimeout(400); await page.keyboard.up('Space');
    expect(await page.evaluate(() => (window as unknown as DebugWindow).__reloadTrace)).toEqual({ reload: 2, fire: 1, adds: 1 });
    await advance(p.combatTimers.reload - 1); expect(p.state.ammo).toBe(0); await frame();
    expect(p.state.ammo).toBe(12); await page.keyboard.down('Space'); await expect.poll(() => p.state.ammo).toBe(11); await page.keyboard.up('Space');
    await frame(); await expect.poll(pending).toBe(0);
    // Reset moved to authorized DEV F4, retaining ammo and shield HP.
    await page.keyboard.press('F4'); await expect.poll(() => p.reset).toBe(true); await frame();
    expect(p.state.x).toBe(1370); expect(p.state.ammo).toBe(11); expect(p.state.shield).toBe(25);
  } finally { await peer.close(); await page.close(); await server.close(); }
});

test('stale predicted shot rejected during reload clears, and known reload suppresses further predictions', async ({ page }) => {
  const store = new RoomStore(), server = createGameServer(['http://127.0.0.1:5175'], store, { autoTick: false });
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const address = server.http.address(); if (!address || typeof address === 'string') throw Error('Missing server');
  try {
    await page.goto('/'); await page.locator('#server-url').fill(`http://127.0.0.1:${address.port}`); await page.locator('#create').click(); await expect(page.locator('canvas')).toBeVisible();
    await page.evaluate(() => new Promise<void>(resolve => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.emit('latencyProbe', resolve)));
    server.step(); await page.waitForFunction(() => !!(window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest);
    const id = await page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.id!);
    const p = store.roomFor(id)!.players.get(id)!;
    await page.keyboard.press('F3'); await page.locator('#fake-lag').check(); await page.keyboard.press('F3');
    await page.keyboard.down('Space');
    await expect.poll(() => page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.projectilePrediction.count(performance.now())), { intervals: [5, 10] }).toBe(1);
    await page.keyboard.up('Space');
    // Server-owned fixture starts reload before the delayed request arrives.
    p.state.ammo = 5;
    const { startReload } = await import('../server/combat'); expect(startReload(p)).toBe(true);
    await expect.poll(() => p.lastFireSequence).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.projectilePrediction.count(performance.now()))).toBe(0);
    expect(store.roomFor(id)!.projectiles.size).toBe(0); expect(p.combatTimers.reload).toBe(45); expect(p.state.ammo).toBe(5);
    server.step(); await expect(page.locator('#hud-reload')).toHaveText('RELOADING');
    await page.keyboard.down('Space'); await page.waitForTimeout(400); await page.keyboard.up('Space'); expect(p.lastFireSequence).toBe(1);
    await page.keyboard.press('F4'); await page.waitForTimeout(100); expect(p.reset).toBe(false);
  } finally { await page.close(); await server.close(); }
});
