import { initialMatchState } from '../shared/match';
import { initialLifeState } from '../shared/lifecycle';
import { createBlackHole } from '../shared/black-hole';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RemoteInterpolator } from '../src/interpolation';
import { roomFromSearch, roomLink } from '../src/room-links';
import { spawnFlight } from '../shared/flight';
import type { Snapshot } from '../shared/protocol';
function frame(tick: number, timeMs: number, x: number, rotation = 0): Snapshot {
  return { match: initialMatchState(), survivingHumans: 1, projectiles: [], tick, timeMs, roomCode: 'ABCD', blackHole: createBlackHole(), players: [{ ...spawnFlight(), id: 'me', name: 'Me', color: 1, ...initialLifeState(), region: 'safe', lastProcessedInput: 0, teleportSequence: 0 }, { ...spawnFlight(), id: 'remote', name: 'Remote', color: 2, ...initialLifeState(), region: 'safe', lastProcessedInput: 0, teleportSequence: 0, x, rotation }] };
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

test('remote death freezes at newest authoritative position without interpolation rewind', () => {
  const buffer = new RemoteInterpolator(); buffer.push(frame(1, 0, 0), 0);
  const dead = frame(2, 100, 100); dead.players[1].lifeState = 'dead'; dead.players[1].region = 'lethal';
  buffer.push(dead, 100); const remote = buffer.sample(150, 'me')[0];
  assert.equal(remote.x, 100); assert.equal(remote.lifeState, 'dead');
});

test('respawn purges prior-life samples, snaps remote position and resumes normal interpolation', () => {
  const buffer = new RemoteInterpolator(); buffer.push(frame(1, 0, 0), 0);
  const dead = frame(2, 100, 90); dead.players[1].lifeState = 'dead'; buffer.push(dead, 100);
  const respawn = frame(3, 200, 1500); respawn.players[1].lifeGeneration = 1;
  buffer.push(respawn, 200);
  assert.equal(buffer.sample(200, 'me')[0].x, 1500);
  // The buffer really discarded the remote old-life records, not just a visual shortcut.
  const frames = (buffer as unknown as { frames: Snapshot[] }).frames;
  assert.ok(frames.every(f => f.players.every(p => p.id !== 'remote' || p.lifeGeneration === 1)));
  const moved = frame(4, 300, 1600); moved.players[1].lifeGeneration = 1; buffer.push(moved, 300);
  assert.equal(buffer.sample(350, 'me')[0].x, 1550);
  buffer.push(dead, 400); assert.ok(buffer.sample(400, 'me')[0].lifeGeneration === 1);
});
test('respawn still snaps when every death snapshot was lost; other ships retain their history', () => {
  const buffer = new RemoteInterpolator(); buffer.push(frame(1, 0, 0), 0);
  const next = frame(2, 100, 1800); next.players[1].lifeGeneration = 1;
  next.players.push({ ...next.players[0], id: 'other', x: 100 });
  buffer.push(next, 100); assert.equal(buffer.sample(100, 'me').find(p => p.id === 'remote')?.x, 1800);
  const later = frame(3, 200, 1900); later.players[1].lifeGeneration = 1;
  later.players.push({ ...later.players[0], id: 'other', x: 200 }); buffer.push(later, 200);
  const sample = buffer.sample(250, 'me');
  assert.equal(sample.find(p => p.id === 'remote')?.x, 1850);
  assert.equal(sample.find(p => p.id === 'other')?.x, 150);
});

test('same-life flight reset purges pre-teleport remote history without blending', () => {
  const buffer = new RemoteInterpolator(); buffer.push(frame(1, 0, 0), 0);
  const reset = frame(2, 100, 1370); reset.players[1].teleportSequence = 1; buffer.push(reset, 100);
  assert.equal(buffer.sample(100, 'me')[0].x, 1370);
  const later = frame(3, 200, 1470); later.players[1].teleportSequence = 1; buffer.push(later, 200);
  assert.equal(buffer.sample(250, 'me')[0].x, 1420);
});
test('remote interpolation absorbs ordered latency jitter and clamps a short delivery stall', () => {
  const buffer = new RemoteInterpolator(); let previous = 0;
  for (let tick = 1; tick <= 30; tick++) {
    const time = tick * 1000 / 30, arrival = time + 150 + (tick % 2 ? -20 : 20);
    buffer.push(frame(tick, time, time * .29), arrival);
    const remote = buffer.sample(arrival + 10, 'me')[0];
    assert.ok(Number.isFinite(remote.x)); assert.ok(remote.x >= previous); assert.ok(remote.x <= time * .29);
    previous = remote.x;
  }
  const frozen = buffer.sample(3000, 'me')[0].x;
  assert.equal(frozen, 290); assert.equal(buffer.sample(4000, 'me')[0].x, frozen);
});
