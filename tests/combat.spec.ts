import { test, expect } from '@playwright/test';
import { createGameServer } from '../server/game';
import { RoomStore } from '../server/rooms';
import type { FlightConnection } from '../src/network';
type DebugWindow = Window & { __HORIZON_FLIGHT__: FlightConnection };

test('development controls report default server rejection without changing HUD', async ({ page }) => {
  await page.goto('/'); await page.locator('#server-url').fill('http://127.0.0.1:3002'); await page.locator('#create').click(); await expect(page.locator('canvas')).toBeVisible();
  await page.keyboard.press('F3'); await page.locator('[data-combat-action="damage"]').click();
  await expect(page.locator('#combat-debug-result')).toHaveText('Combat debug disabled by server');
  await expect(page.locator('#hud-health-value')).toHaveText('100 / 100');
  await expect(page.locator('#hud-shield')).toHaveText('SHIELD 50 / 50');
});

test('enabled controls use authoritative snapshots for damage, ammo, reload', async ({ page, context }) => {
  const store = new RoomStore(), server = createGameServer(['http://127.0.0.1:5175'], store, { autoTick: false, combatDebug: true });
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const address = server.http.address(); if (!address || typeof address === 'string') throw new Error('Missing address');
  const peer = await context.newPage();
  try {
    await page.goto('/'); await page.locator('#server-url').fill(`http://127.0.0.1:${address.port}`);
    await page.locator('#create').click(); await expect(page.locator('canvas')).toBeVisible();
    const code = (await page.locator('#room-code-display').textContent())!;
    await peer.goto('/'); await peer.locator('#server-url').fill(`http://127.0.0.1:${address.port}`);
    await peer.locator('#room-code').fill(code); await peer.locator('#join').click(); await expect(peer.locator('canvas')).toBeVisible();
    const id = await page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.id);
    const p = store.rooms.get(code)!.players.get(id!)!;
    let tick = 0;
    const step = () => { server.step(); tick++; };
    const frame = async () => {
      // Reliable probe flushes earlier volatile sends before the next snapshot.
      await page.evaluate(() => new Promise<void>((resolve, reject) => {
        (window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.timeout(1000).emit('latencyProbe', e => e ? reject(e) : resolve());
      }));
      step();
      await expect.poll(() => page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.tick)).toBe(tick);
    };
    await frame(); await page.keyboard.press('F3');
    const click = async (action: string) => {
      await page.locator('[data-combat-action="' + action + '"]').click();
      await expect(page.locator('#combat-debug-result')).toHaveText('Combat debug: ' + action); await frame();
    };
    await click('damage'); await expect(page.locator('#hud-shield')).toHaveText('SHIELD 15 / 50');
    await page.locator('[data-combat-action="damage"]').click();
    await expect.poll(() => p.state.health).toBe(80); await frame();
    await expect(page.locator('#hud-health-value')).toHaveText('80 / 100');
    await click('ammo'); await expect(page.locator('#hud-ammo')).toHaveText('AMMO 11 / 12');
    await click('reload'); await expect(page.locator('#debug-reload')).toContainText('Reload 1.');
    const remaining = p.combatTimers.reload;
    await page.locator('[data-combat-action="reload"]').click();
    await expect(page.locator('#combat-debug-result')).toHaveText('Action unavailable or already in progress');
    expect(p.combatTimers.reload).toBe(remaining);
    for (let i = 0; i < remaining; i++) { step(); await new Promise<void>(resolve => setImmediate(resolve)); }
    expect(p.state.ammo).toBe(12); await frame();
    await expect(page.locator('#hud-ammo')).toHaveText('AMMO 12 / 12');
    await expect(page.locator('#debug-reload')).toHaveText('Reload ready');
    await expect(page.locator('#debug-combat')).toHaveText('ALIVE · HUMAN · kills 0');
    await click('cooldown'); expect(p.state.fireCooldownRemainingMs).toBeGreaterThan(0);
    await expect.poll(() => peer.evaluate(id => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.players.find(s => s.id === id)?.shield, id)).toBe(0);
    expect(p.state.health).toBe(80); expect(p.state.ammo).toBe(12);
    // Real delayed request/snapshot handling never changes the tick deadline.
    await page.locator('#fake-lag').check();
    await click('ammo'); await click('reload');
    expect(p.combatTimers.reload).toBe(44); // One frame after acceptance.
    for (let i = 0; i < 43; i++) { step(); await new Promise<void>(resolve => setImmediate(resolve)); }
    expect(p.state.isReloading).toBe(true); expect(p.state.ammo).toBe(11);
    step(); expect(p.state.isReloading).toBe(false); expect(p.state.ammo).toBe(12);
    await frame(); await expect(page.locator('#hud-ammo')).toHaveText('AMMO 12 / 12');
  } finally { await peer.close(); await page.close(); await server.close(); }
});
