import { test, expect } from '@playwright/test';
import type { FlightConnection } from '../src/network';
import type Phaser from 'phaser';

type DebugWindow = Window & { __HORIZON_FLIGHT__: FlightConnection; __HORIZON_GAME__: Phaser.Game };
test('browser flies only from server snapshots, resets and disconnects cleanly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('#server-url').fill('http://127.0.0.1:3002');
  await page.getByRole('button', { name: 'Connect and fly' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#status')).toContainText('server-authoritative');
  await expect(page.locator('#position')).toHaveText('X 1370.0 · Y 1200.0');
  await page.keyboard.down('d');
  await expect.poll(() => page.locator('#position').textContent()).not.toBe('X 1370.0 · Y 1200.0');
  await page.keyboard.down('Shift');
  await expect.poll(async () => Number((await page.locator('#velocity').textContent())?.split(' ')[1])).toBeGreaterThan(350);
  await page.keyboard.up('d'); await page.keyboard.up('Shift');
  await page.getByRole('button', { name: 'Reset flight [R]', exact: true }).click();
  await expect(page.locator('#position')).toHaveText('X 1370.0 · Y 1200.0');
  // Mutating the rendered rocket is overwritten by the next server snapshot.
  await page.evaluate(() => {
    const scene = (window as unknown as DebugWindow).__HORIZON_GAME__.scene.scenes[0] as Phaser.Scene & { rocket: Phaser.GameObjects.Container };
    scene.rocket.setPosition(50, 50);
  });
  await expect.poll(() => page.evaluate(() => {
    const scene = (window as unknown as DebugWindow).__HORIZON_GAME__.scene.scenes[0] as Phaser.Scene & { rocket: Phaser.GameObjects.Container };
    return scene.rocket.x;
  })).toBe(1370);
  // Explicitly disconnect the actual transport. Keys cannot move the rocket now.
  await page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.disconnect());
  await expect(page.locator('#status')).toContainText('Disconnected');
  const frozen = await page.locator('#position').textContent();
  await page.keyboard.down('d'); await page.waitForTimeout(500); await page.keyboard.up('d');
  expect(await page.locator('#position').textContent()).toBe(frozen);
  await page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.connect());
  await expect(page.locator('#status')).toContainText('server-authoritative');
  await page.getByRole('button', { name: 'Back to home' }).click();
  await expect(page.locator('#home')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.connected)).toBe(false);
  expect(errors).toEqual([]);
});
test('missing server never falls back to local movement', async ({ page }) => {
  await page.goto('/');
  await page.locator('#server-url').fill('http://127.0.0.1:39999');
  await page.getByRole('button', { name: 'Connect and fly' }).click();
  await expect(page.locator('#status')).toContainText('Cannot reach');
  await page.keyboard.down('d'); await page.waitForTimeout(300); await page.keyboard.up('d');
  await expect(page.locator('#position')).toHaveText('Awaiting position');
});
