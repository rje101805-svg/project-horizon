import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBlackHole, gravityAt, classifyRegion, crossesHorizon, GRAVITY_CAP, SPAWN_CLEARANCE } from '../shared/black-hole';
import { RoomStore, chooseSpawn } from '../server/rooms';
import { simulatePlayer } from '../server/simulation';
import { idleInput } from '../shared/flight';
const hole = createBlackHole();
test('gravity points inward, increases with proximity, caps and is finite at/near center', () => {
  const far = gravityAt({ x: hole.x + 400, y: hole.y }, hole);
  const near = gravityAt({ x: hole.x + 200, y: hole.y }, hole);
  assert.ok(far.x < 0); assert.equal(far.y, 0); assert.ok(Math.abs(near.x) > Math.abs(far.x));
  assert.equal(Math.hypot(...Object.values(gravityAt({ x: hole.x + 1, y: hole.y }, hole))), GRAVITY_CAP);
  assert.deepEqual(gravityAt(hole, hole), { x: 0, y: 0 });
  assert.deepEqual(gravityAt({ x: hole.x + 501, y: hole.y }, hole), { x: 0, y: 0 });
  for (const offset of [0, 1e-10, 1, 90]) {
    const point = { x: hole.x + offset, y: hole.y + offset };
    const acceleration = gravityAt(point, hole);
    assert.ok(Number.isFinite(acceleration.x) && Number.isFinite(acceleration.y));
    assert.ok(Math.hypot(acceleration.x, acceleration.y) <= GRAVITY_CAP + 1e-9);
  }
});
test('classification includes lethal/danger boundaries and safe exterior', () => {
  assert.equal(classifyRegion(hole, hole), 'lethal');
  assert.equal(classifyRegion({ x: hole.x + 90, y: hole.y }, hole), 'lethal');
  assert.equal(classifyRegion({ x: hole.x + 91, y: hole.y }, hole), 'danger');
  assert.equal(classifyRegion({ x: hole.x + 500, y: hole.y }, hole), 'danger');
  assert.equal(classifyRegion({ x: hole.x + 501, y: hole.y }, hole), 'safe');
});
test('spawn search excludes danger plus clearance for every room member and reset', () => {
  const store = new RoomStore(() => 'ABCD'); store.create('0', 'P', 0);
  for (let i = 1; i < 8; i++) assert.ok(store.join(String(i), 'ABCD', 'P', 0).ok);
  const room = store.rooms.get('ABCD')!;
  for (const player of room.players.values()) {
    assert.ok(Math.hypot(player.state.x - hole.x, player.state.y - hole.y) > hole.influenceRadius + SPAWN_CLEARANCE);
    Object.assign(player.state, { x: hole.x + 110, y: hole.y }); player.reset = true;
    simulatePlayer(player, room, 0);
    assert.equal(player.state.region, 'safe');
  }
  assert.equal(chooseSpawn([], { ...hole, influenceRadius: 10000 }), null);
});
test('swept intersection catches exterior-to-exterior crossings, tangent, endpoints and stationary paths', () => {
  assert.ok(crossesHorizon({ x: hole.x - 1000, y: hole.y }, { x: hole.x + 1000, y: hole.y }, hole));
  assert.ok(crossesHorizon({ x: hole.x - 1000, y: hole.y + 90 }, { x: hole.x + 1000, y: hole.y + 90 }, hole));
  assert.ok(crossesHorizon(hole, hole, hole));
  assert.ok(crossesHorizon({ x: hole.x + 90, y: hole.y }, { x: hole.x + 120, y: hole.y }, hole));
  assert.equal(crossesHorizon({ x: hole.x - 1000, y: hole.y + 91 }, { x: hole.x + 1000, y: hole.y + 91 }, hole), false);
});
test('single authoritative step applies gravity, prevents tunneling and permanently freezes death', () => {
  const store = new RoomStore(() => 'ABCD'); store.create('a', 'A', 0);
  const room = store.rooms.get('ABCD')!, player = room.players.get('a')!;
  Object.assign(player.state, { x: hole.x + 300, y: hole.y });
  simulatePlayer(player, room, 0); assert.ok(player.state.vx < 0); assert.equal(player.state.region, 'danger');
  Object.assign(player.state, { x: hole.x - 200, y: hole.y, vx: 20000, vy: 0 });
  simulatePlayer(player, room, 0); assert.equal(player.state.lifeState, 'dead'); assert.equal(player.state.region, 'lethal');
  assert.equal(player.state.vx, 0); assert.equal(player.state.vy, 0);
  const frozen = { ...player.state }; player.input = { ...idleInput(), right: true }; player.reset = true;
  for (let i = 0; i < 100; i++) simulatePlayer(player, room, i * 33);
  assert.deepEqual(player.state, frozen);
  assert.ok(Object.values(player.state).filter(v => typeof v === 'number').every(Number.isFinite));
});

test('authoritative simulation remains finite at the center and immediately marks death', () => {
  for (const offset of [0, 1e-10, 1]) {
    const store = new RoomStore(() => 'ABCD'); store.create('a', 'A', 0);
    const room = store.rooms.get('ABCD')!, player = room.players.get('a')!;
    Object.assign(player.state, { x: hole.x + offset, y: hole.y });
    simulatePlayer(player, room, 0);
    assert.equal(player.state.lifeState, 'dead');
    for (const key of ['x', 'y', 'vx', 'vy', 'rotation'] as const) assert.ok(Number.isFinite(player.state[key]));
  }
});
