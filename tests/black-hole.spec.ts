import { test, expect } from '@playwright/test';
import type { FlightConnection } from '../src/network';
type DebugWindow = Window & { __HORIZON_FLIGHT__: FlightConnection };
test('two browsers see gravity/death and reconnect recovers safely', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.locator('#server-url').fill('http://127.0.0.1:3002');
  await page.locator('#display-name').fill('Falling'); await page.locator('#create').click();
  await expect(page.locator('#black-hole-status')).toHaveText('Safe space');
  const code = (await page.locator('#room-code-display').textContent())!;
  const peer = await context.newPage(); peer.on('pageerror', e => errors.push(e.message));
  await peer.goto('/'); await peer.locator('#server-url').fill('http://127.0.0.1:3002');
  await peer.locator('#room-code').fill(code); await peer.locator('#join').click();
  await expect(peer.locator('#black-hole-status')).toHaveText('Safe space');
  await page.locator('#start-match').click();await expect.poll(()=>page.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.match.state)).toBe('active');
  const hole = await page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.blackHole);
  expect(await peer.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.blackHole)).toEqual(hole);
  // Use ordinary movement inputs, never a server-position fixture in this test.
  let sawDanger = false;
  await page.keyboard.down('w');
  await expect.poll(async () => {
    const local = await page.evaluate(() => {
      const connection = (window as unknown as DebugWindow).__HORIZON_FLIGHT__;
      return connection.latest?.players.find(p => p.id === connection.socket.id);
    });
    if (!local || !hole) return 'waiting';
    sawDanger ||= local.region === 'danger';
    // Steer with keys toward the center instead of timing a turn; CI frame
    // scheduling varies, and residual sideways inertia can miss a small circle.
    if (local.x > hole.x + 15) { await page.keyboard.up('d'); await page.keyboard.down('a'); }
    else if (local.x < hole.x - 15) { await page.keyboard.up('a'); await page.keyboard.down('d'); }
    else { await page.keyboard.up('a'); await page.keyboard.up('d'); }
    return local.lifeState;
  }, { timeout: 15000, intervals: [50] }).toBe('dead');
  await page.keyboard.up('a'); await page.keyboard.up('d');
  expect(sawDanger).toBe(true);
  await expect(page.locator('#black-hole-status')).toContainText('Lost to the black hole');
  await page.keyboard.up('w'); await expect(page.locator('#restart')).toBeDisabled();
  await expect.poll(() => peer.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.players.find(p => p.name === 'Falling')?.lifeState)).toBe('dead');
  const frozen = await page.locator('#position').textContent();
  await page.keyboard.press('r'); await page.keyboard.down('d'); await page.waitForTimeout(250); await page.keyboard.up('d');
  expect(await page.locator('#position').textContent()).toBe(frozen);
  const oldId = await page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.id);
  await page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.disconnect());
  await expect(page.locator('#status')).toContainText('Disconnected');
  await page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.connect());
  await expect(page.locator('#black-hole-status')).toHaveText('Safe space');
  // Reconnect during ended is waiting; the authoritative reset restores access.
  await expect(page.locator('#restart')).toBeEnabled({timeout:10000});
  expect(await page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.id)).not.toBe(oldId);
  expect(errors).toEqual([]);
});
