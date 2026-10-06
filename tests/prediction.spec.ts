import { test, expect, type Page } from '@playwright/test';
import { createGameServer } from '../server/game';
import { RoomStore } from '../server/rooms';
import { SNAP_CORRECTION_DISTANCE } from '../src/prediction';
import type { FlightConnection } from '../src/network';
type DebugWindow = Window & { __HORIZON_FLIGHT__: FlightConnection; __HORIZON_GAME__: {
  scene: { scenes: { rocket: { x: number; y: number }; ships: Map<string, { body: { x: number; y: number } }> }[] }
} };
const metrics = (page: Page) => page.evaluate(() => {
  const w = window as unknown as DebugWindow, c = w.__HORIZON_FLIGHT__, p = c.prediction;
  const a = c.latest?.players.find(p => p.id === c.socket.id), r = w.__HORIZON_GAME__.scene.scenes[0].rocket;
  return { sequence: p.sequence, ack: p.acknowledged, pending: p.pending.length, correction: p.correction,
    x: p.state?.x ?? 0, y: p.state?.y ?? 0, serverX: a?.x ?? 0, renderedX: r.x, teleport: a?.teleportSequence };
});
for (const [label, enabled, jitter] of [['normal', false, 0], ['150ms', true, 0], ['150ms+jitter', true, 30]] as const) {
  test(`prediction responds before acknowledgement and converges; remote interpolation under ${label}`, async ({ page, browser }, info) => {
    const peerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5175' });
    const peer = await peerContext.newPage(); const errors: string[] = [];
    for (const p of [page, peer]) {
      p.on('pageerror', e => errors.push(e.message));
      await p.goto('/'); await p.locator('#server-url').fill('http://127.0.0.1:3002');
    }
    await page.locator('#create').click(); await expect(page.locator('canvas')).toBeVisible();
    const code = (await page.locator('#room-code-display').textContent())!;
    await peer.locator('#room-code').fill(code); await peer.locator('#join').click();
    for (const p of [page, peer]) {
      await p.waitForFunction(() => !!(window as unknown as DebugWindow).__HORIZON_FLIGHT__?.latest);
      await expect.poll(() => metrics(p).then(m => m.ack)).toBeGreaterThan(0);
      await p.evaluate(({ enabled, jitter }) => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.setFakeLag(enabled, 150, jitter), { enabled, jitter });
    }
    // Let toggling's neutral release settle, without relying on background tabs.
    await page.waitForTimeout(500);
    await page.bringToFront(); await page.locator('canvas').click({ position: { x: 400, y: 300 } }); const start = await metrics(page);
    await page.keyboard.down('d');
    const samples = await page.evaluate(async () => {
      const w = window as unknown as DebugWindow, c = w.__HORIZON_FLIGHT__, output = [];
      const start = performance.now();
      while (performance.now() - start < 1800) {
        const a = c.latest!.players.find(p => p.id === c.socket.id)!;
        output.push({ ms: performance.now() - start, x: c.prediction.state!.x, rendered: w.__HORIZON_GAME__.scene.scenes[0].rocket.x,
          serverX: a.x, correction: c.prediction.correction, pending: c.prediction.pending.length,
          sequence: c.prediction.sequence, ack: c.prediction.acknowledged });
        await new Promise(r => setTimeout(r, 15));
      }
      return output;
    });
    await info.attach(`samples-${label}`, { body: JSON.stringify({ start, samples }), contentType: 'application/json' });
    const early = samples.filter(s => s.ms < 140);
    expect(early.some(s => s.x > start.x + .2 && s.rendered > start.renderedX + .1), JSON.stringify({ start, early })).toBe(true);
    if (enabled) expect(early.every(s => Math.abs(s.serverX - start.serverX) < .01)).toBe(true);
    expect(samples.every(s => s.pending <= 90)).toBe(true);
    // Under load a short delivery stall may retire stale inputs. It must not
    // require a large snap or turn into continuous reconciliation oscillation.
    expect(Math.max(...samples.map(s => s.correction))).toBeLessThan(SNAP_CORRECTION_DISTANCE);
    expect(samples.filter(s => s.correction > 15).length / samples.length).toBeLessThan(.2);
    expect(samples.at(-1)!.x - start.x).toBeGreaterThan(250);
    expect(samples.every((s, i) => !i || s.sequence >= samples[i - 1].sequence)).toBe(true);
    // Check remote render positions between real authoritative frames, never local prediction.
    const remote = await peer.evaluate(async () => {
      const w = window as unknown as DebugWindow, c = w.__HORIZON_FLIGHT__;
      const id = c.latest!.players.find(p => p.id !== c.socket.id)!.id;
      const points = [];
      for (let i = 0; i < 30; i++) {
        const body = w.__HORIZON_GAME__.scene.scenes[0].ships.get(id)?.body;
        points.push(body?.x ?? 0); await new Promise(r => setTimeout(r, 15));
      }
      return points;
    });
    await page.keyboard.up('d');
    expect(remote.every(Number.isFinite)).toBe(true);
    expect(Math.max(...remote.slice(1).map((x, i) => Math.abs(x - remote[i])))).toBeLessThan(35);
    await expect.poll(async () => { const m = await metrics(page); return Math.abs(m.x - m.serverX); }, { timeout: 5000 }).toBeLessThan(1);
    const final = await metrics(page); expect(final.pending).toBeLessThan(25);
    await info.attach(`prediction-${label}`, { body: JSON.stringify({ start, samples, remote, final }), contentType: 'application/json' });
    expect(errors).toEqual([]); await peerContext.close();
  });
}
test('gravity predictions stay stable and reset/respawn discard old inputs under jitter', async ({ page }) => {
  const store = new RoomStore(); const server = createGameServer(['http://127.0.0.1:5175'], store, { combatDebug: true });
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const address = server.http.address(); if (!address || typeof address === 'string') throw Error('Missing server');
  try {
    await page.goto('/'); await page.locator('#server-url').fill(`http://127.0.0.1:${address.port}`);
    await page.locator('#create').click(); await page.waitForFunction(() => !!(window as unknown as DebugWindow).__HORIZON_FLIGHT__?.latest); await expect.poll(() => metrics(page).then(m => m.ack)).toBeGreaterThan(0);
    const id = await page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.id!);
    const room = store.roomFor(id)!, player = room.players.get(id)!;
    // Explicit server teleport into the gravity field, with its revision marker.
    Object.assign(player.state, { x: room.blackHole.x + 450, y: room.blackHole.y + 100, vx: 0, vy: 0 });
    player.state.teleportSequence++;
    await expect.poll(() => metrics(page).then(m => m.teleport)).toBe(1);
    await page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.setFakeLag(true, 150, 30));
    await page.waitForTimeout(400);
    const corrections = await page.evaluate(async () => {
      const c = (window as unknown as DebugWindow).__HORIZON_FLIGHT__, values = [];
      for (let i = 0; i < 30; i++) { values.push(c.prediction.correction); await new Promise(r => setTimeout(r, 20)); }
      return values;
    });
    expect(Math.max(...corrections)).toBeLessThan(10);
    await page.locator('#restart').click();
    await expect.poll(() => metrics(page).then(m => m.teleport)).toBe(2);
    await expect.poll(() => metrics(page).then(m => Math.abs(m.x - 1370))).toBeLessThan(1);
    // Old pending thrust must not survive authoritative death/respawn.
    await page.keyboard.down('d');
    Object.assign(player.state, { x: room.blackHole.x, y: room.blackHole.y });
    await expect(page.locator('#death-overlay')).toBeVisible();
    expect((await metrics(page)).pending).toBe(0);
    await expect(page.locator('#death-overlay')).toBeHidden({ timeout: 5000 });
    await expect.poll(() => metrics(page).then(m => Math.abs(m.x - 1370))).toBeLessThan(1);
    expect(player.state.vx).toBe(0); await page.keyboard.up('d');
  } finally { await server.close(); }
});
