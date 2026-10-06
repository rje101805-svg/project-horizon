import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalPredictor, MAX_PENDING_INPUTS, SNAP_CORRECTION_DISTANCE } from '../src/prediction';
import { createBlackHole } from '../shared/black-hole';
import { idleInput, spawnFlight, TICK_MS } from '../shared/flight';
import { initialLifeState } from '../shared/lifecycle';
import { stepMovement } from '../shared/movement';
import { RoomStore } from '../server/rooms';
import { simulatePlayer } from '../server/simulation';
import { acceptMovementInput, MAX_SERVER_INPUTS } from '../server/inputs';
import type { PlayerState, InputMessage } from '../shared/protocol';
const state = (): PlayerState => ({ ...spawnFlight(), ...initialLifeState(), id: 'me', name: 'Me', color: 1,
  region: 'safe', lastProcessedInput: 0, teleportSequence: 0 });
const input = { ...idleInput(), right: true, boost: true, aim: .5 };
test('shared complete movement is deterministic including gravity, inertia, bounds and swept contact', () => {
  const hole = createBlackHole();
  const store = new RoomStore(); store.create('me', 'Me', 0);
  const room = store.roomFor('me')!, player = room.players.get('me')!;
  Object.assign(player.state, { x: hole.x + 300, y: hole.y + 100 });
  const predicted = { ...player.state };
  for (let n = 1; n <= 100; n++) {
    player.input = input; player.lastInput = n * TICK_MS;
    stepMovement(predicted, input, hole);
    simulatePlayer(player, room, n * TICK_MS, n * TICK_MS);
    for (const key of ['x', 'y', 'vx', 'vy', 'rotation'] as const) assert.equal(player.state[key], predicted[key]);
  }
  const a = { ...state(), x: hole.x - 200, y: hole.y, vx: 20000 };
  assert.equal(stepMovement(a, idleInput(), hole), true); assert.equal(a.vx, 0);
});
test('sequences increase, acknowledgements remove only processed inputs, replay exactly converges', () => {
  const p = new LocalPredictor(), hole = createBlackHole(), authority = state(); p.reconcile(authority, hole);
  const messages = Array.from({ length: 12 }, () => p.tick(input)!);
  assert.deepEqual(messages.map(i => i.sequence), Array.from({ length: 12 }, (_, i) => i + 1));
  const target = { ...p.state! };
  for (const message of messages.slice(0, 5)) stepMovement(authority, message, hole);
  authority.lastProcessedInput = 5; p.reconcile(authority, hole);
  assert.deepEqual(p.pending.map(i => i.sequence), [6, 7, 8, 9, 10, 11, 12]);
  assert.equal(p.state!.x, target.x); assert.equal(p.state!.vx, target.vx); assert.equal(p.correction, 0);
  for (const message of messages.slice(5)) stepMovement(authority, message, hole);
  authority.lastProcessedInput = 12; p.reconcile(authority, hole);
  assert.equal(p.pending.length, 0); assert.equal(p.state!.x, authority.x);
});
test('gravity reconciliation uses authority hole state and converges after acknowledgement', () => {
  const p = new LocalPredictor(), hole = createBlackHole(), authority = { ...state(), x: hole.x + 300, y: hole.y };
  p.reconcile(authority, hole); const messages = Array.from({ length: 6 }, () => p.tick(idleInput())!);
  assert.ok(p.state!.x < authority.x);
  for (const m of messages.slice(0, 3)) stepMovement(authority, m, hole);
  authority.lastProcessedInput = 3; const before = p.state!.x;
  p.reconcile(authority, hole); assert.equal(p.state!.x, before); assert.equal(p.correction, 0);
  const changed = { ...hole, x: hole.x + 10 };
  p.reconcile(authority, changed);
  const expected = { ...authority }; for (const m of messages.slice(3)) stepMovement(expected, m, changed);
  assert.equal(p.state!.x, expected.x);
});
test('death, respawn, same-life reset and reconnect clear queue and snap without smoothing', () => {
  const p = new LocalPredictor(), hole = createBlackHole(); let authority = state(); p.reconcile(authority, hole);
  for (const transition of [{ lifeState: 'dead' as const, teleportSequence: 1 },
    { lifeState: 'active' as const, lifeGeneration: 1, teleportSequence: 2 },
    { teleportSequence: 3 }, { id: 'new-socket' }]) {
    p.tick(input); const sequence = p.sequence;
    authority = { ...authority, ...transition, x: 1800, vx: 0 };
    assert.equal(p.reconcile(authority, hole), true); assert.equal(p.pending.length, 0);
    assert.equal(p.render(0, 0)!.x, authority.x); assert.equal(p.sequence, sequence);
  }
  p.clear(); assert.equal(p.pending.length, 0); assert.equal(p.state, null);
  p.reconcile(state(), hole); assert.ok(p.tick(input)!.sequence > 1);
});
test('small corrections smooth rendering only, large corrections snap and offset decays', () => {
  const p = new LocalPredictor(), hole = createBlackHole(); const authority = state(); p.reconcile(authority, hole);
  p.reconcile({ ...authority, x: authority.x + 5 }, hole);
  assert.equal(p.state!.x, authority.x + 5); assert.equal(p.render(1, 0)!.x, authority.x);
  assert.ok(Math.abs(p.render(1, 800)!.x - p.state!.x) < .001);
  p.reconcile({ ...authority, x: authority.x + SNAP_CORRECTION_DISTANCE * 2 }, hole);
  assert.equal(p.render(0, 0)!.x, p.state!.x);
});
test('pending queue is bounded and pauses safely until acknowledgement, without reusing sequence', () => {
  const p = new LocalPredictor(), hole = createBlackHole(), authority = state(); p.reconcile(authority, hole);
  for (let i = 0; i < MAX_PENDING_INPUTS; i++) assert.ok(p.tick(input));
  const x = p.state!.x; assert.equal(p.tick(input), null); assert.equal(p.state!.x, x); assert.equal(p.overflow, true);
  assert.equal(p.pending.length, MAX_PENDING_INPUTS);
  p.reconcile({ ...authority, lastProcessedInput: MAX_PENDING_INPUTS }, hole);
  assert.equal(p.overflow, false); assert.equal(p.tick(input)!.sequence, MAX_PENDING_INPUTS + 1);
});
test('server orders commands, rejects duplicates/forgeries, and consumes at most one per tick', () => {
  const store = new RoomStore(); store.create('me', 'Me', 0); const room = store.roomFor('me')!, player = room.players.get('me')!;
  const message = (sequence: number): InputMessage => ({ ...input, sequence, lifeGeneration: 0, teleportSequence: 0 });
  assert.equal(acceptMovementInput(player, message(1), 0), true);
  assert.equal(acceptMovementInput(player, message(1), 0), false);
  assert.equal(acceptMovementInput(player, { ...message(2), sequence: NaN }, 0), false);
  assert.equal(acceptMovementInput(player, { ...message(2), lifeGeneration: 10 }, 0), false);
  assert.equal(acceptMovementInput(player, { ...message(2), teleportSequence: 10 }, 0), false);
  for (let n = 2; n <= MAX_SERVER_INPUTS; n++) assert.equal(acceptMovementInput(player, message(n), 0), true);
  assert.equal(acceptMovementInput(player, message(9), 0), false);
  const expected = { ...player.state }; stepMovement(expected, input, room.blackHole);
  simulatePlayer(player, room, TICK_MS, TICK_MS);
  assert.equal(player.state.lastProcessedInput, 1); assert.equal(player.pendingInputs.length, 7);
  assert.equal(player.state.x, expected.x);
  assert.equal(acceptMovementInput(player, { ...message(10), release: true }, 0), false);
  assert.equal(acceptMovementInput(player, { ...message(10), ...idleInput(), release: true }, 0), true);
  simulatePlayer(player, room, TICK_MS * 2, TICK_MS * 2); assert.equal(player.state.lastProcessedInput, 10);
  assert.equal(player.pendingInputs.length, 0);
  player.reset = true; simulatePlayer(player, room, TICK_MS * 3, TICK_MS * 3);
  assert.equal(player.state.teleportSequence, 1); assert.equal(acceptMovementInput(player, message(11), 0), false);
});

test('expired input backlog is retired before fresh controls, without extra movement ticks', () => {
  const store = new RoomStore(); store.create('me', 'Me', 0); const room = store.roomFor('me')!, player = room.players.get('me')!;
  for (let sequence = 1; sequence <= 6; sequence++) acceptMovementInput(player,
    { ...idleInput(), sequence, lifeGeneration: 0, teleportSequence: 0 }, 0);
  acceptMovementInput(player, { ...input, sequence: 7, lifeGeneration: 0, teleportSequence: 0 }, 300);
  const expected = { ...player.state }; stepMovement(expected, input, room.blackHole);
  simulatePlayer(player, room, 310, TICK_MS);
  assert.equal(player.state.lastProcessedInput, 7); assert.equal(player.pendingInputs.length, 0);
  assert.equal(player.state.x, expected.x); assert.equal(player.state.vx, expected.vx);
});
