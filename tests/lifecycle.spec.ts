import { applyDamage } from '../server/health';
import { test, expect, type Page } from '@playwright/test';
import { createGameServer } from '../server/game';
import { RoomStore } from '../server/rooms';
import { MAX_HEALTH, RESPAWN_DELAY_MS } from '../shared/lifecycle';
import { TICK_MS } from '../shared/flight';
import type { FlightConnection } from '../src/network';
type DebugWindow = Window & { __HORIZON_FLIGHT__: FlightConnection; __HORIZON_GAME__: {
  scene: { scenes: { ships: Map<string, { body: { x: number; y: number; alpha: number }; label: { text: string } }> }[] }
} };
const localState = (page: Page) => page.evaluate(() => {
  const c = (window as unknown as DebugWindow).__HORIZON_FLIGHT__;
  return c.latest?.players.find(p => p.id === c.socket.id);
});
test('controlled server ticks drive skew-safe death UI, automatic respawn snap and repeat cycles in two browsers', async ({ page, context }) => {
  const store = new RoomStore(); const server = createGameServer(['http://127.0.0.1:5175'], store, { autoTick: false });
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const address = server.http.address(); if (!address || typeof address === 'string') throw new Error('Missing test server');
  const url = `http://127.0.0.1:${address.port}`, errors: string[] = [];
  const peer = await context.newPage();
  let tick = 0;
  const flush = async (pages: Page[]) => Promise.all(pages.map(p => p.evaluate(() => new Promise<void>((resolve, reject) => {
    (window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.timeout(1000).emit('latencyProbe', error => error ? reject(error) : resolve());
  }))));
  const frame = async () => {
    await flush([page, peer]); server.step(); tick++;
    for (const p of [page, peer]) await expect.poll(() => p.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.tick)).toBe(tick);
  };
  const advance = async (ticks: number) => {
    for (let i = 0; i < ticks; i++) { server.step(); tick++; await new Promise<void>(resolve => setImmediate(resolve)); }
  };
  try {
    for (const [p, skew] of [[page, 86400000], [peer, -86400000]] as const) {
      p.on('pageerror', e => errors.push(e.message));
      await p.addInitScript(offset => { const original = Date.now; Date.now = () => original() + offset; }, skew);
      await p.goto('/'); await p.locator('#server-url').fill(url);
    }
    await page.locator('#display-name').fill('Dying'); await page.locator('#create').click();
    await expect(page.locator('canvas')).toBeVisible();
    const code = (await page.locator('#room-code-display').textContent())!;
    await peer.locator('#display-name').fill('Watching'); await peer.locator('#room-code').fill(code); await peer.locator('#join').click();
    await expect(peer.locator('canvas')).toBeVisible(); await frame();
    await expect(page.locator('#life-status')).toHaveText(`Alive · health ${MAX_HEALTH} / ${MAX_HEALTH}`);
    await expect(peer.locator('#life-status')).toHaveText(`Alive · health ${MAX_HEALTH} / ${MAX_HEALTH}`);
    const id = (await localState(page))!.id, room = store.rooms.get(code)!, player = room.players.get(id)!;
    await page.keyboard.press('F3'); await expect(page.locator('#debug-overlay')).toBeVisible();
    await expect(page.locator('#hud-health-value')).toHaveText(`${MAX_HEALTH} / ${MAX_HEALTH}`);
    applyDamage(player, 25, 'black-hole', tick * TICK_MS); await frame();
    await expect(page.locator('#hud-health-value')).toHaveText(`${MAX_HEALTH - 25} / ${MAX_HEALTH}`);
    await expect(page.locator('#hud-health-bar')).toHaveJSProperty('value', MAX_HEALTH - 25);
    for (let cycle = 0; cycle < 2; cycle++) {
      // Server-side fixture avoids waiting for flight time or respawn wall time.
      Object.assign(player.state, { x: room.blackHole.x - 200, y: room.blackHole.y, vx: 20000, vy: 0 });
      await frame();
      await expect(page.locator('#death-overlay')).toBeVisible();
      await expect(page.locator('#hud-health-value')).toHaveText(`0 / ${MAX_HEALTH}`);
      await expect(page.locator('#hud-health-bar')).toHaveJSProperty('value', 0);
      await expect(page.locator('#debug-overlay')).toBeVisible();
      await expect(page.locator('#death-health')).toHaveText(`Health 0 / ${MAX_HEALTH} · Black hole`);
      await expect(page.locator('#death-countdown')).toHaveText('Respawning in 3.0s');
      await expect(page.locator('#restart')).toBeDisabled();
      await expect.poll(() => peer.evaluate(id => {
        const ship = (window as unknown as DebugWindow).__HORIZON_GAME__.scene.scenes[0].ships.get(id);
        return { alpha: ship?.body.alpha, label: ship?.label.text };
      }, id)).toEqual({ alpha: .25, label: 'Dying · DEAD' });
      const death = { x: player.state.x, y: player.state.y };
      await page.keyboard.down('d'); await page.keyboard.press('r'); await frame();
      expect({ x: player.state.x, y: player.state.y }).toEqual(death); expect(player.state.health).toBe(0);
      // No real three-second wait: advance the same simulation used in production.
      await advance(43); await frame();
      await expect(page.locator('#death-countdown')).toHaveText('Respawning in 1.5s');
      expect(player.state.lifeState).toBe('dead'); expect(player.state.deathSequence).toBe(cycle + 1);
      if (cycle === 0) await page.screenshot({ path: 'test-results/step6-death.png' });
      await advance(Math.ceil(RESPAWN_DELAY_MS / TICK_MS) - 45 + 1); await frame();
      await expect(page.locator('#death-overlay')).toBeHidden();
      await expect(page.locator('#hud-health-value')).toHaveText(`${MAX_HEALTH} / ${MAX_HEALTH}`);
      await expect(page.locator('#hud-health-bar')).toHaveJSProperty('value', MAX_HEALTH);
      await expect(page.locator('#debug-overlay')).toBeVisible();
      await expect(page.locator('#life-status')).toHaveText(`Alive · health ${MAX_HEALTH} / ${MAX_HEALTH}`);
      expect(player.state.id).toBe(id); expect(player.state.lifeGeneration).toBe(cycle + 1);
      expect(player.state.vx).toBe(0); expect(player.state.vy).toBe(0);
      await expect.poll(() => peer.evaluate(id => {
        const body = (window as unknown as DebugWindow).__HORIZON_GAME__.scene.scenes[0].ships.get(id)?.body;
        return { x: body?.x, y: body?.y, alpha: body?.alpha };
      }, id)).toEqual({ x: player.state.x, y: player.state.y, alpha: 1 });
      // Held key from the old life was cleared; fresh press restores movement.
      const spawnX = player.state.x; await frame(); expect(player.state.x).toBe(spawnX);
      await page.keyboard.up('d'); await page.keyboard.down('d');
      // Wait for the browser's normal frame/input delivery, not respawn time.
      await expect.poll(() => player.input.right).toBe(true); await frame();
      expect(player.state.x).toBeGreaterThan(spawnX); await page.keyboard.up('d');
    }
    expect(errors).toEqual([]);
  } finally { await peer.close(); await page.close(); await server.close(); }
});
