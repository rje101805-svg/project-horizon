import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomStore, generateRoomCode, chooseSpawn } from '../server/rooms';
import { MAX_ROOM_PLAYERS, normalizeRoomCode, ROOM_CODE_ALPHABET, sanitizeName, SPAWN_MIN_DISTANCE } from '../shared/rooms';
import { EDGE_MARGIN, spawnFlight, WORLD } from '../shared/flight';

test('room codes have four uppercase unambiguous characters', () => {
  for (let i = 0; i < 100; i++) { const code = generateRoomCode(); assert.equal(code.length, 4); assert.ok([...code].every(c => ROOM_CODE_ALPHABET.includes(c))); assert.equal(code, code.toUpperCase()); }
  assert.equal(normalizeRoomCode(' abcd '), 'ABCD');
  for (const value of ['ABIO', 'AB01', 'ABCDE', '', null, 123]) assert.equal(normalizeRoomCode(value), null);
});
test('names remove controls, trim, cap Unicode characters and safely fall back', () => {
  assert.equal(sanitizeName(' \x00Nova\n\u200b '), 'Nova');
  assert.equal(sanitizeName('   '), 'Pilot'); assert.equal(sanitizeName({ name: 'X' }), 'Pilot');
  assert.equal(sanitizeName('12345678901234567890'), '1234567890123456');
  assert.equal([...sanitizeName('🚀'.repeat(20))].length, 16);
  assert.equal(sanitizeName('<b>Nova</b>'), '<b>Nova</b>'); // plain text, not markup
});
test('create allocates identity, room membership and first spawn', () => {
  const store = new RoomStore(() => 'ABCD'); const result = store.create('id-a', ' A ', 0);
  assert.ok(result.ok); assert.equal(result.selfId, 'id-a'); assert.deepEqual(result.room.playerIds, ['id-a']);
  assert.equal(store.roomFor('id-a')?.players.get('id-a')?.state.name, 'A');
  assert.equal(store.rooms.size, 1); assert.equal(result.room.maxPlayers, MAX_ROOM_PLAYERS);
  assert.equal(store.roomFor('id-a')?.players.get('id-a')?.state.x, spawnFlight().x);
});
test('code collisions retry safely and exhausted generator fails cleanly', () => {
  const codes = ['ABCD', 'ABCD', 'EFGH']; const store = new RoomStore(() => codes.shift() ?? 'ABCD');
  assert.ok(store.create('a', 'A', 0).ok); const second = store.create('b', 'B', 0); assert.ok(second.ok); assert.equal(second.room.code, 'EFGH');
  const exhausted = store.create('c', 'C', 0); assert.equal(exhausted.ok, false); assert.equal(store.rooms.size, 2);
});
test('joins normalize case, missing/invalid rooms error, current membership cannot be overwritten', () => {
  const store = new RoomStore(() => 'ABCD'); store.create('a', 'A', 0);
  assert.ok(store.join('b', ' abcd ', 'B', 0).ok);
  assert.equal(store.join('c', 'EFGH', 'C', 0).ok, false);
  assert.equal(store.join('c', 'BAD', 'C', 0).ok, false);
  assert.equal(store.create('a', 'A', 0).ok, false);
  assert.equal(store.join('a', 'ABCD', 'A', 0).ok, false);
  assert.equal(store.roomFor('a')?.players.size, 2);
});
test('eight players have unique colors, IDs and separated valid server spawns; ninth rejected', () => {
  const store = new RoomStore(() => 'ABCD'); store.create('0', 'P', 0);
  for (let i = 1; i < MAX_ROOM_PLAYERS; i++) assert.ok(store.join(String(i), 'ABCD', 'P', 0).ok);
  assert.equal(store.join('9', 'ABCD', 'Ninth', 0).ok, false);
  const players = [...store.rooms.get('ABCD')!.players.values()].map(p => p.state);
  assert.equal(new Set(players.map(p => p.id)).size, 8); assert.equal(new Set(players.map(p => p.color)).size, 8);
  for (const p of players) {
    assert.ok(p.x >= EDGE_MARGIN && p.x <= WORLD - EDGE_MARGIN && p.y >= EDGE_MARGIN && p.y <= WORLD - EDGE_MARGIN);
    for (const q of players) if (p !== q) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= SPAWN_MIN_DISTANCE);
  }
});
test('departures release color and capacity; last departure deletes room', () => {
  const store = new RoomStore(() => 'ABCD'); store.create('a', 'A', 0); store.join('b', 'ABCD', 'B', 0);
  const color = store.roomFor('a')!.players.get('a')!.state.color;
  store.leave('a'); assert.ok(store.join('c', 'ABCD', 'C', 0).ok);
  assert.equal(store.roomFor('c')!.players.get('c')!.state.color, color);
  store.leave('b'); store.leave('c'); assert.equal(store.rooms.size, 0); assert.equal(store.roomFor('a'), undefined);
  assert.equal(store.leave('c'), undefined);
});
test('safe spawn search tolerates moving players blocking the original origin', () => {
  const other = { id: 'a', name: 'A', color: 1, ...spawnFlight() };
  const spawn = chooseSpawn([other]); assert.ok(spawn);
  assert.ok(Math.hypot(spawn.x - other.x, spawn.y - other.y) >= SPAWN_MIN_DISTANCE);
});
