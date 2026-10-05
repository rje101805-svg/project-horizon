import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_HEALTH, RESPAWN_DELAY_MS, clampHealth } from '../shared/lifecycle';
import { RoomStore } from '../server/rooms';
import { simulatePlayer } from '../server/simulation';
import { applyDamage } from '../server/health';
import { idleInput } from '../shared/flight';
import { classifyRegion, SPAWN_CLEARANCE } from '../shared/black-hole';
function fixture() {
  const store = new RoomStore(() => 'ABCD'); store.create('a', 'A', 0);
  const room = store.rooms.get('ABCD')!, player = room.players.get('a')!;
  const kill = (time: number) => {
    Object.assign(player.state, { x: room.blackHole.x, y: room.blackHole.y, vx: 0, vy: 0 });
    simulatePlayer(player, room, time, time);
  };
  return { store, room, player, kill };
}
test('new players have full bounded health and initial active lifecycle state', () => {
  const { player } = fixture();
  assert.equal(player.state.health, MAX_HEALTH); assert.equal(player.state.lifeState, 'active');
  assert.equal(player.state.lifeGeneration, 0); assert.equal(player.state.deathSequence, 0);
  assert.equal(player.respawnAtMs, null); assert.equal(player.state.deathSource, null);
  for (const [input, expected] of [[-1, 0], [0, 0], [45, 45], [500, MAX_HEALTH], [NaN, 0], [Infinity, 0]]) assert.equal(clampHealth(input), expected);
});
test('damage ignores invalid amounts/time and clamps health through one reusable server path', () => {
  const { player } = fixture();
  for (const amount of [NaN, Infinity, -Infinity, -10, 0]) {
    assert.equal(applyDamage(player, amount, 'black-hole', 0), false);
    assert.equal(player.state.health, MAX_HEALTH);
  }
  assert.equal(applyDamage(player, MAX_HEALTH, 'black-hole', NaN), false);
  assert.equal(applyDamage(player, MAX_HEALTH, 'black-hole', -1), false);
  assert.equal(applyDamage(player, 25, 'black-hole', 0), false); assert.equal(player.state.health, 75);
  player.state.health = 1000; applyDamage(player, 1, 'black-hole', 0); assert.equal(player.state.health, 99);
  assert.equal(applyDamage(player, 10000, 'black-hole', 100), true);
  assert.equal(player.state.health, 0); assert.equal(player.state.deathSource, 'black-hole');
  assert.equal(player.state.deathSequence, 1); assert.equal(player.respawnAtMs, 100 + RESPAWN_DELAY_MS);
  assert.equal(applyDamage(player, MAX_HEALTH, 'black-hole', 200), false);
  assert.equal(player.state.deathSequence, 1); assert.equal(player.respawnAtMs, 100 + RESPAWN_DELAY_MS);
});
test('horizon death uses damage state, blocks movement/reset and cannot repeat while dead', () => {
  const { room, player, kill } = fixture(); kill(1000);
  assert.equal(player.state.health, 0); assert.equal(player.state.lifeState, 'dead');
  assert.equal(player.state.deathSource, 'black-hole'); assert.equal(player.state.deathSequence, 1);
  assert.equal(player.state.respawnRemainingMs, RESPAWN_DELAY_MS);
  const location = { x: player.state.x, y: player.state.y };
  player.input = { ...idleInput(), right: true, boost: true }; player.reset = true;
  for (let time = 1100; time < 1000 + RESPAWN_DELAY_MS; time += 100) simulatePlayer(player, room, time, time);
  assert.deepEqual({ x: player.state.x, y: player.state.y }, location);
  assert.equal(player.state.vx, 0); assert.equal(player.state.vy, 0);
  assert.equal(player.state.deathSequence, 1); assert.equal(player.state.lifeState, 'dead');
  assert.equal(player.reset, false);
});
test('controlled simulation time drives the deadline, countdown and exactly-once same-identity respawn', () => {
  const { room, player, kill } = fixture(); kill(1000);
  // Input freshness time is deliberately unrelated to simulation time.
  simulatePlayer(player, room, 9999999, 1000 + RESPAWN_DELAY_MS - 1);
  assert.equal(player.state.lifeState, 'dead'); assert.equal(player.state.respawnRemainingMs, 1);
  simulatePlayer(player, room, 9999999, 1000 + RESPAWN_DELAY_MS);
  assert.equal(player.state.id, 'a'); assert.equal(player.state.name, 'A');
  assert.equal(player.state.lifeState, 'active'); assert.equal(player.state.health, MAX_HEALTH);
  assert.equal(player.state.lifeGeneration, 1); assert.equal(player.state.deathSequence, 1);
  assert.equal(player.state.deathSource, null); assert.equal(player.state.respawnRemainingMs, 0);
  assert.equal(player.respawnAtMs, null); assert.equal(player.state.vx, 0); assert.equal(player.state.vy, 0);
  assert.deepEqual(player.input, idleInput()); assert.equal(player.lastInput, -Infinity);
  const spawn = { x: player.state.x, y: player.state.y };
  simulatePlayer(player, room, 9999999, 1000 + RESPAWN_DELAY_MS + 100);
  assert.equal(player.state.lifeGeneration, 1); assert.deepEqual({ x: player.state.x, y: player.state.y }, spawn);
});
test('repeated respawns use current moved/grown black-hole state and retain safety clearance', () => {
  const { room, player, kill } = fixture();
  for (let cycle = 0; cycle < 20; cycle++) {
    const time = cycle * (RESPAWN_DELAY_MS + 100);
    kill(time);
    // Changed after death: selection must read the current authoritative state.
    Object.assign(room.blackHole, { x: 1200 + cycle * 5, y: 1200, influenceRadius: 600 + cycle * 2 });
    simulatePlayer(player, room, time + RESPAWN_DELAY_MS, time + RESPAWN_DELAY_MS);
    assert.equal(player.state.lifeState, 'active'); assert.equal(player.state.lifeGeneration, cycle + 1);
    assert.equal(player.state.health, MAX_HEALTH); assert.equal(classifyRegion(player.state, room.blackHole), 'safe');
    assert.ok(Math.hypot(player.state.x - room.blackHole.x, player.state.y - room.blackHole.y) > room.blackHole.influenceRadius + SPAWN_CLEARANCE);
    assert.equal(player.state.vx, 0); assert.equal(player.state.vy, 0);
  }
});
test('no available safe spawn keeps the player dead and retries safely without extra deaths', () => {
  const { room, player, kill } = fixture(); kill(0);
  room.blackHole.influenceRadius = 10000;
  simulatePlayer(player, room, RESPAWN_DELAY_MS, RESPAWN_DELAY_MS);
  assert.equal(player.state.lifeState, 'dead'); assert.equal(player.state.health, 0);
  assert.equal(player.state.respawnRemainingMs, 0); assert.equal(player.state.lifeGeneration, 0);
  room.blackHole.influenceRadius = 500;
  simulatePlayer(player, room, RESPAWN_DELAY_MS + 1, RESPAWN_DELAY_MS + 1);
  assert.equal(player.state.lifeState, 'active'); assert.equal(player.state.lifeGeneration, 1);
  assert.equal(player.state.deathSequence, 1);
});
test('disconnect/removal prevents resurrection even through a stale simulation reference', () => {
  const { store, room, player, kill } = fixture(); kill(0);
  store.leave('a'); assert.equal(store.rooms.size, 0);
  simulatePlayer(player, room, RESPAWN_DELAY_MS * 10, RESPAWN_DELAY_MS * 10);
  assert.equal(player.state.lifeState, 'dead'); assert.equal(player.state.lifeGeneration, 0);
  assert.equal(room.players.size, 0); assert.equal(store.rooms.size, 0);
});
