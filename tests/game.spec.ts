import { test, expect } from '@playwright/test';
import type { FlightConnection } from '../src/network';
import type Phaser from 'phaser';
import { createGameServer } from '../server/game';
import { io } from 'socket.io-client';
import type { RoomResult } from '../shared/protocol';

type DebugWindow = Window & { __HORIZON_FLIGHT__: FlightConnection; __HORIZON_GAME__: Phaser.Game };
test('browser predicts authoritative flight, resets and disconnects cleanly', async ({ page }) => {
  const server = createGameServer(['http://127.0.0.1:5175'], undefined, { combatDebug: true });
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const address = server.http.address(); if (!address || typeof address === 'string') throw Error('Missing address');
  const url = `http://127.0.0.1:${address.port}`;
  try {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('#server-url').fill(url);
  await page.getByRole('button', { name: 'Create room', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#status')).toContainText('server-authoritative');
  await expect(page.locator('#position')).toHaveText('X 1370.0 · Y 1200.0');
  await page.keyboard.down('d');
  await expect.poll(() => page.locator('#position').textContent()).not.toBe('X 1370.0 · Y 1200.0');
  await page.keyboard.down('Shift');
  await expect.poll(async () => Number((await page.locator('#velocity').textContent())?.split(' ')[1])).toBeGreaterThan(350);
  await page.keyboard.up('d'); await page.keyboard.up('Shift');
  await page.getByRole('button', { name: 'DEV reset flight [F4]', exact: true }).click();
  await expect(page.locator('#position')).toHaveText('X 1370.0 · Y 1200.0');
  // Mutating the render object is overwritten by the next predicted render.
  await page.evaluate(() => {
    const scene = (window as unknown as DebugWindow).__HORIZON_GAME__.scene.scenes[0] as Phaser.Scene & { rocket: Phaser.GameObjects.Container };
    scene.rocket.setPosition(50, 50);
  });
  await expect.poll(() => page.evaluate(() => {
    const scene = (window as unknown as DebugWindow).__HORIZON_GAME__.scene.scenes[0] as Phaser.Scene & { rocket: Phaser.GameObjects.Container };
    return scene.rocket.x;
  })).toBe(1370);
  // Keep the room alive through the tested reconnect (identity is ephemeral).
  const peer = io(url);
  await new Promise<void>(resolve => peer.once('connect', () => resolve()));
  const code = await page.locator('#room-code-display').textContent();
  await new Promise<RoomResult>(resolve => peer.emit('joinRoom', { code, name: 'Peer' }, resolve));
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
  peer.disconnect();
  expect(errors).toEqual([]);
  } finally { await page.close(); await server.close(); }
});
test('missing server never falls back to local movement', async ({ page }) => {
  await page.goto('/');
  await page.locator('#server-url').fill('http://127.0.0.1:39999');
  await page.getByRole('button', { name: 'Create room', exact: true }).click();
  await expect(page.locator('#home-status')).toContainText('Cannot reach', { timeout: 7000 });
  await page.keyboard.down('d'); await page.waitForTimeout(300); await page.keyboard.up('d');
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});
