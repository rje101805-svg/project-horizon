import { test, expect } from '@playwright/test';
test('cold-start retries recover through one room request; ping and build stamp are visible', async ({ page }) => {
  let unavailable = true;
  await page.route('**/socket.io/**', route => unavailable ? route.abort() : route.continue());
  await page.goto('/'); await page.locator('#server-url').fill('http://127.0.0.1:3002');
  await page.getByRole('button', { name: 'Create room', exact: true }).click();
  await expect(page.locator('#home-status')).toContainText('retrying automatically');
  await expect(page.locator('#create')).toBeDisabled(); await expect(page.locator('#cancel-connect')).toBeVisible();
  unavailable = false;
  await expect(page.locator('#status')).toContainText('server-authoritative', { timeout: 15000 });
  await expect(page.locator('#player-count')).toHaveText('1 / 8 players');
  await page.keyboard.press('F3'); await expect(page.locator('#ping')).toBeVisible();
  await expect(page.locator('#ping')).toHaveText(/Ping: \d+ ms/, { timeout: 7000 });
  await expect(page.locator('#build-stamp')).toHaveText(/Build: client-[a-f0-9]{12}/);
});
test('cancelled connection cannot race a subsequent healthy create attempt', async ({ page }) => {
  await page.goto('/'); await page.locator('#server-url').fill('http://127.0.0.1:39999');
  await page.getByRole('button', { name: 'Create room', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel connection' }).click();
  await expect(page.locator('#home-status')).toHaveText('Connection cancelled.');
  await page.locator('#server-url').fill('http://127.0.0.1:3002');
  await page.getByRole('button', { name: 'Create room', exact: true }).click();
  await expect(page.locator('#status')).toContainText('server-authoritative');
  await expect(page.locator('#player-count')).toHaveText('1 / 8 players');
  await page.waitForTimeout(1000); await expect(page.locator('#mission')).toBeVisible();
});
