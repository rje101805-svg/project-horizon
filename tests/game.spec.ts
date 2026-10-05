import { test, expect } from '@playwright/test';
import { applyDamage, blackHoleRadius } from '../src/rules';
test('black hole grows and shields absorb damage before hull', () => {
  expect(blackHoleRadius(60)).toBe(820);
  expect(applyDamage(100, 20, 30)).toEqual({ health: 90, shield: 0 });
  expect(applyDamage(10, 0, 30).health).toBe(0);
});
test('launch, move, collect, survive, restart and extract', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Launch solo mission' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  // This handle exists only on the development server. Drive the actual scene,
  // including collisions and finish conditions, without waiting a full minute.
  const scene = () => page.evaluateHandle(() => (window as unknown as { __HORIZON_GAME__: { scene: { scenes: unknown[] } } }).__HORIZON_GAME__.scene.scenes[0]);
  const handle = await scene();
  const before = await handle.evaluate((s: any) => s.rocket.x);
  await page.keyboard.down('d');
  await expect.poll(() => handle.evaluate((s: any) => s.rocket.x)).toBeGreaterThan(before + 50);
  await page.keyboard.up('d');
  await handle.evaluate((s: any) => { const item = s.loot.find((l: any) => l.kind === 'supply'); s.vx = s.vy = 0; s.rocket.setPosition(item.x, item.y); });
  await expect(page.locator('#inventory')).toContainText('Supplies 1 / 5');
  await handle.evaluate((s: any) => { const item = s.loot.find((l: any) => l.kind === 'shield'); s.vx = s.vy = 0; s.rocket.setPosition(item.x, item.y); });
  await expect(page.locator('#shield-value')).toHaveText('40');
  await handle.evaluate((s: any) => { s.vx = s.vy = 0; s.rocket.setPosition(1200, 1200); });
  await expect.poll(() => page.locator('#shield-value').textContent()).not.toBe('40');
  await handle.evaluate((s: any) => { s.health = 0; });
  await expect(page.locator('#result-title')).toHaveText('Lost to the void.');
  await page.getByRole('button', { name: 'Play again' }).click();
  const fresh = await scene();
  await expect(page.locator('#health-value')).toHaveText('100');
  await page.keyboard.press('r');
  await expect(page.locator('#inventory')).toContainText('Supplies 0 / 5');
  await fresh.evaluate((s: any) => { s.supplies = 5; s.elapsed = 61; s.rocket.setPosition(2220, 220); });
  await expect(page.locator('#result-title')).toHaveText('You escaped.');
  await page.getByRole('button', { name: 'Back to home' }).click();
  await expect(page.locator('#home')).toBeVisible();
  expect(errors).toEqual([]);
});
