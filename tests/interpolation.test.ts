import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RemoteInterpolator } from '../src/interpolation';
import { roomFromSearch, roomLink } from '../src/room-links';
import { spawnFlight } from '../shared/flight';
import type { Snapshot } from '../shared/protocol';
function frame(tick: number, timeMs: number, x: number, rotation = 0): Snapshot {
  return { tick, timeMs, roomCode: 'ABCD', players: [{ ...spawnFlight(), id: 'me', name: 'Me', color: 1 }, { ...spawnFlight(), id: 'remote', name: 'Remote', color: 2, x, rotation }] };
}
test('remote rendering blends buffered positions and excludes local player', () => {
  const buffer = new RemoteInterpolator(); buffer.push(frame(1, 0, 0), 0); buffer.push(frame(2, 100, 100), 100);
  const sampled = buffer.sample(150, 'me'); assert.equal(sampled.length, 1); assert.equal(sampled[0].x, 50);
});
test('rotation interpolates across the shortest angle rather than spinning', () => {
  const buffer = new RemoteInterpolator(); buffer.push(frame(1, 0, 0, Math.PI - .1), 0); buffer.push(frame(2, 100, 100, -Math.PI + .1), 100);
  assert.ok(Math.abs(buffer.sample(150, 'me')[0].rotation - Math.PI) < 1e-8);
});
test('stopped snapshots clamp safely, late/out-of-order packets cannot rewind', () => {
  const buffer = new RemoteInterpolator(); buffer.push(frame(1, 0, 0), 0); buffer.push(frame(2, 100, 100), 100);
  assert.equal(buffer.sample(1000, 'me')[0].x, 100); assert.equal(buffer.sample(10000, 'me')[0].x, 100);
  buffer.push(frame(1, 0, -999), 10000); assert.equal(buffer.sample(10001, 'me')[0].x, 100);
  buffer.push(frame(3, 130, 130), 10002); assert.ok(buffer.sample(10003, 'me')[0].x >= 100);
});
test('reliable departures remove buffered players immediately; clear drops stale sessions', () => {
  const buffer = new RemoteInterpolator(); buffer.push(frame(1, 0, 10), 0); buffer.removeMissing(['me']);
  assert.deepEqual(buffer.sample(0, 'me'), []); buffer.clear(); assert.deepEqual(buffer.sample(1000, 'me'), []);
});
test('join links normalize valid codes, reject invalid codes, preserve Pages paths', () => {
  assert.equal(roomFromSearch('?room=abcd'), 'ABCD'); assert.equal(roomFromSearch('?room=ABIO'), null); assert.equal(roomFromSearch('?x=1'), null);
  const link = roomLink('https://example.github.io/project-horizon/?x=1#top', 'ABCD');
  assert.equal(link, 'https://example.github.io/project-horizon/?x=1&room=ABCD#top');
});
