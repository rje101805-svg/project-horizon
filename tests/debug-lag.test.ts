import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DebugLag } from '../src/debug-lag';
test('fake network is immediate by default and preserves packet order when enabled', async () => {
  const lag = new DebugLag(); let immediate = false; lag.schedule('input', () => { immediate = true; }); assert.equal(immediate, true);
  lag.setEnabled(true); const events: number[] = []; const start = performance.now();
  const finished = new Promise<void>(resolve => {
    lag.schedule('input', () => { assert.ok(performance.now() - start >= 60); events.push(1); });
    lag.schedule('input', () => events.push(2)); lag.schedule('input', () => { events.push(3); resolve(); });
  });
  assert.deepEqual(events, []); await finished; assert.deepEqual(events, [1, 2, 3]); lag.clear();
});
test('disabling fake network cancels delayed packets instead of replaying stale inputs', async () => {
  const lag = new DebugLag(); lag.setEnabled(true); let calls = 0;
  lag.schedule('input', () => calls++); lag.schedule('snapshot', () => calls++); lag.setEnabled(false);
  lag.schedule('input', () => calls++); await new Promise(r => setTimeout(r, 160)); assert.equal(calls, 1);
});
test('150ms latency without jitter delays both directions and toggling discards work', async () => {
  const lag = new DebugLag(); lag.setEnabled(true, 150, 0);
  const start = performance.now(), delivered: number[] = [];
  await Promise.all((['input', 'snapshot'] as const).map(direction => new Promise<void>(resolve => {
    lag.schedule(direction, () => { delivered.push(performance.now() - start); resolve(); });
  })));
  assert.equal(delivered.length, 2); assert.ok(delivered.every(ms => ms >= 140)); lag.clear();
});
