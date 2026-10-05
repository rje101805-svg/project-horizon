import { test, expect, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import type { FlightConnection } from '../src/network';

type Ship = { body: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text };
type DebugScene = Phaser.Scene & { ships: Map<string, Ship> };
type DebugWindow = Window & { __HORIZON_FLIGHT__: FlightConnection; __HORIZON_GAME__: Phaser.Game };
async function home(page: Page, name: string, path = '/') {
  await page.goto(path); await page.locator('#server-url').fill('http://127.0.0.1:3002'); await page.locator('#display-name').fill(name);
}
async function ships(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as DebugWindow;
    const scene = w.__HORIZON_GAME__.scene.scenes[0] as DebugScene;
    return [...scene.ships.entries()].map(([id, ship]) => ({ id, name: ship.label.text, x: ship.body.x, y: ship.body.y }));
  });
}
test('two browser clients render names/colors, fly independently with fake lag, and remove departed ships', async ({ page: a, context }) => {
  const errors: string[] = []; const b = await context.newPage();
  for (const page of [a, b]) page.on('pageerror', e => errors.push(e.message));
  await home(a, '<b>A</b>'); await a.getByRole('button', { name: 'Create room', exact: true }).click();
  await expect(a.locator('#status')).toContainText('server-authoritative');
  const code = (await a.locator('#room-code-display').textContent())!;
  await home(b, 'B', `/?room=${code.toLowerCase()}`);
  await expect(b.locator('#room-code')).toHaveValue(code);
  await expect(b.locator('#home')).toBeVisible(); // link never auto-connects
  await b.getByRole('button', { name: 'Join room', exact: true }).click();
  for (const page of [a, b]) await expect(page.locator('#player-count')).toHaveText('2 / 8 players');
  await expect.poll(() => ships(b)).toHaveLength(2);
  await a.bringToFront(); await expect.poll(() => ships(a)).toHaveLength(2);
  const identities = await a.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest!.players);
  expect(new Set(identities.map(p => p.id)).size).toBe(2); expect(new Set(identities.map(p => p.color)).size).toBe(2);
  expect((await ships(a)).map(p => p.name)).toContain('<b>A</b> (you)');
  expect(await a.locator('b').count()).toBe(0); // name is Phaser text, never HTML
  const beforeA = await a.locator('#position').textContent(); const beforeB = await b.locator('#position').textContent();
  await a.keyboard.down('d'); await expect.poll(() => a.locator('#position').textContent()).not.toBe(beforeA); await a.keyboard.up('d');
  expect(await b.locator('#position').textContent()).toBe(beforeB);
  await b.bringToFront();
  await b.locator('#fake-lag').check();
  await expect(b.locator('#fake-lag')).toBeChecked();
  await b.keyboard.down('s'); await expect.poll(() => b.locator('#position').textContent()).not.toBe(beforeB); await b.keyboard.up('s');
  await a.bringToFront();
  const idB = await b.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.id!);
  const originalB = identities.find(p => p.id === idB)!;
  await expect.poll(async () => (await ships(a)).find(p => p.id === idB)?.y ?? 0).toBeGreaterThan(originalB.y);
  await a.locator('#fake-lag').check(); await a.keyboard.down('d'); await a.waitForTimeout(300); await a.keyboard.up('d');
  await a.locator('#fake-lag').uncheck(); await b.bringToFront(); await b.locator('#fake-lag').uncheck();
  await b.close(); await a.bringToFront();
  await expect(a.locator('#player-count')).toHaveText('1 / 8 players'); await expect.poll(() => ships(a)).toHaveLength(1);
  const after = await a.locator('#position').textContent(); await a.keyboard.down('w');
  await expect.poll(() => a.locator('#position').textContent()).not.toBe(after); await a.keyboard.up('w');
  expect(errors).toEqual([]);
});
test('room errors are shown cleanly; a failed join can be followed by successful creation', async ({ page }) => {
  await home(page, 'Pilot'); await page.locator('#room-code').fill('BAD'); await page.getByRole('button', { name: 'Join room', exact: true }).click();
  await expect(page.locator('#home-status')).toContainText('valid 4-character');
  await page.locator('#room-code').fill('ZZZZ'); await page.getByRole('button', { name: 'Join room', exact: true }).click();
  await expect(page.locator('#home-status')).toContainText('Room not found'); await expect(page.locator('#home')).toBeVisible();
  await page.getByRole('button', { name: 'Create room', exact: true }).click(); await expect(page.locator('#status')).toContainText('server-authoritative');
  await page.getByRole('button', { name: 'Back to home' }).click(); await expect(page.locator('#home')).toBeVisible();
});
test('fake lag is disabled by default, code/link clipboard actions preserve the client path', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await home(page, 'Nova'); await page.getByRole('button', { name: 'Create room', exact: true }).click(); await expect(page.locator('#status')).toContainText('server-authoritative');
  await expect(page.locator('#fake-lag')).not.toBeChecked();
  const code = await page.locator('#room-code-display').textContent();
  await page.getByRole('button', { name: 'Copy code', exact: true }).click(); await expect(page.locator('#share-status')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  await page.getByRole('button', { name: 'Copy join link', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(`?room=${code}`);
});
