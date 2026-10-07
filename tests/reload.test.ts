import { initialMatchState } from '../shared/match';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomStore } from '../server/rooms';
import { reload } from '../server/reload';
import { startReload, advanceCombatTick, applyDamage, completeReload } from '../server/combat';
import { fire, projectileSnapshot } from '../server/projectiles';
import { simulatePlayer } from '../server/simulation';
import { RELOAD_DURATION, MAX_AMMO, parseReload } from '../shared/combat';
import { TICK_MS, idleInput } from '../shared/flight';
import { ProjectilePrediction } from '../src/projectile-prediction';

function fixture() {
  const store = new RoomStore(() => 'ABCD'); store.create('a', 'A', 0);
  const room = store.roomFor('a')!, p = room.players.get('a')!;
  Object.assign(p.state, { x: 200, y: 1800 });
  return { store, room, p, request: { sequence: 1, lifeGeneration: 0, teleportSequence: 0, roomCode: room.code, reloadSession: p.state.reloadSession } };
}
const shot = (sequence: number) => ({ sequence, aim: 0, lifeGeneration: 0, teleportSequence: 0 });
const ticks = Math.ceil(RELOAD_DURATION / TICK_MS);

test('manual partial/empty reload completes only on tick 45, with duplicates unable to alter it', () => {
  assert.equal(ticks, 45);
  for (const ammo of [0, 7]) {
    const { room, p, request } = fixture(); p.state.ammo = ammo;
    assert.equal(reload(room, p, request).ok, true);
    for (let n = 0; n < ticks - 1; n++) {
      const before = structuredClone(p.combatTimers);
      assert.equal(reload(room, p, { ...request, sequence: n + 2 }).ok, false);
      assert.deepEqual(p.combatTimers, before); assert.equal(completeReload(p), false);
      advanceCombatTick(p); assert.equal(p.state.ammo, ammo); assert.equal(p.state.isReloading, true);
    }
    assert.equal(p.state.reloadRemainingMs, TICK_MS);
    advanceCombatTick(p); assert.equal(p.state.ammo, MAX_AMMO); assert.equal(p.state.isReloading, false);
    assert.equal(p.state.reloadRemainingMs, 0); assert.equal(p.state.reloadProgress, 1);
    assert.equal(fire(room, p, shot(1), 45).ok, true);
  }
});

test('reload rejects full, inactive, noncontestant, zero health, malformed and stale requests without mutation', () => {
  const { room, p, request } = fixture(); assert.equal(reload(room, p, request).ok, false);
  p.state.ammo = 3;
  for (const raw of [null, [], {}, { ...request, sequence: 0 }, { ...request, sequence: Infinity },
    { ...request, lifeGeneration: -1 }, { ...request, teleportSequence: .5 }, { ...request, ammo: 12 },
    { ...request, reloadDuration: 0 }, { ...request, completionTime: 0 }, { ...request, targetId: 'b' }]) {
    assert.equal(parseReload(raw), null); assert.equal(reload(room, p, raw).ok, false);
  }
  for (const raw of [{ ...request, sequence: 2, lifeGeneration: 1 }, { ...request, sequence: 3, teleportSequence: 1 },
    { ...request, roomCode: 'ABCD' === room.code ? 'EFGH' : 'ABCD' }]) assert.equal(reload(room, p, raw).ok, false);
  assert.equal(reload(room, p, request).ok, false); // Previously rejected sequence cannot be replayed.
  for (const state of [{ health: 0 }, { health: 100, status: 'ALIEN' }, { status: 'OUT' }, { status: 'ALIVE', lifeState: 'dead' }]) {
    Object.assign(p.state, state); assert.equal(startReload(p), false);
  }
  assert.equal(p.state.ammo, 3); assert.equal(p.combatTimers.reload, 0);
});

test('last accepted round spawns normally and immediately starts reload without a thirteenth request', () => {
  const { room, p } = fixture(); p.state.ammo = 2;
  assert.equal(fire(room, p, shot(1), 0).ok, true); assert.equal(p.state.ammo, 1); assert.equal(p.state.isReloading, false);
  for (let i = 0; i < 6; i++) advanceCombatTick(p);
  const last = fire(room, p, shot(2), 6); assert.ok(last.ok && last.kind !== 'melee');
  assert.equal(room.projectiles.size, 2); assert.equal(room.projectiles.get(last.projectileId)!.shotSequence, 2);
  assert.equal(p.state.ammo, 0); assert.equal(p.state.isReloading, true); assert.equal(p.combatTimers.reload, 45);
  assert.equal(p.combatTimers.cooldown, 6);
  for (let i = 0; i < 45; i++) advanceCombatTick(p);
  assert.equal(p.state.ammo, 12); assert.equal(fire(room, p, shot(3), 51).ok, true);
});

test('a complete twelve-round magazine begins reload on exactly its twelfth accepted request', () => {
  const { room, p } = fixture();
  for (let n = 1; n <= 12; n++) {
    assert.equal(fire(room, p, shot(n), (n - 1) * 6).ok, true);
    assert.equal(p.state.ammo, 12 - n); assert.equal(p.state.isReloading, n === 12);
    if (n < 12) for (let i = 0; i < 6; i++) advanceCombatTick(p);
  }
  assert.equal(room.projectiles.size, 12); assert.equal(p.lastFireSequence, 12);
  assert.equal(p.combatTimers.reload, 45); assert.equal(p.combatTimers.cooldown, 6);
});

test('empty fallback begins reload; repeated fire cannot create bullets, damage or manipulate timers/cap', () => {
  const { store, room, p } = fixture(); store.join('b', room.code, 'B', 0);
  const b = room.players.get('b')!, before = structuredClone(b.state); p.state.ammo = 0;
  assert.equal(fire(room, p, shot(1), 0).ok, false); assert.equal(p.combatTimers.reload, 45);
  for (let n = 2; n < 100; n++) assert.equal(fire(room, p, shot(n), 0).ok, false);
  assert.equal(p.combatTimers.reload, 45); assert.equal(p.combatTimers.cooldown, 0);
  assert.equal(p.state.ammo, 0); assert.equal(room.projectiles.size, 0); assert.equal(room.projectileSequence, 0);
  assert.deepEqual(b.state, before);
  for (let n = 0; n < 44; n++) advanceCombatTick(p);
  assert.equal(p.state.isReloading, true); advanceCombatTick(p); assert.equal(p.state.ammo, 12);
  assert.equal(fire(room, p, shot(100), 45).ok, true);
});

test('partial reload blocks fire without changing existing bullets, ammo or cooldown, and survives flight/damage', () => {
  const { room, p } = fixture(); fire(room, p, shot(1), 0); assert.equal(startReload(p), true);
  const bullets = projectileSnapshot(room), timer = structuredClone(p.combatTimers), ammo = p.state.ammo;
  for (let n = 2; n < 20; n++) assert.equal(fire(room, p, shot(n), 0).ok, false);
  assert.deepEqual(projectileSnapshot(room), bullets); assert.deepEqual(p.combatTimers, timer); assert.equal(p.state.ammo, ammo);
  applyDamage(p, 60, { type: 'PLAYER', playerId: 'b' });
  assert.equal(p.state.shield, 0); assert.equal(p.state.health, 90); assert.equal(p.combatTimers.reload, 45);
  const x = p.state.x; p.input = { ...idleInput(), right: true }; p.lastInput = 0;
  for (let n = 1; n <= 44; n++) simulatePlayer(p, room, n * TICK_MS, n * TICK_MS);
  assert.ok(p.state.x > x); assert.equal(p.state.isReloading, true); assert.equal(p.state.ammo, ammo);
  simulatePlayer(p, room, 45 * TICK_MS, 45 * TICK_MS); assert.equal(p.state.ammo, 12);
});

test('final-round prediction hands off while reloading; stale rejection clears without mutating snapshots', () => {
  const { room, p } = fixture(), prediction = new ProjectilePrediction(); p.state.ammo = 1;
  assert.equal(prediction.add(shot(1), p.state, 0), true);
  const result = fire(room, p, shot(1), 0); assert.ok(result.ok); assert.equal(p.state.isReloading, true);
  const snapshot = { tick: 1, timeMs: TICK_MS, roomCode: room.code, players: [{ ...p.state }],
    blackHole: { ...room.blackHole }, match: initialMatchState(), survivingHumans: 1, projectiles: projectileSnapshot(room) }, before = structuredClone(snapshot);
  prediction.result(result, snapshot); prediction.reconcile(snapshot, p.state.id, 10);
  assert.equal(prediction.count(10), 0); assert.equal(prediction.render(snapshot.projectiles, 10).length, 1);
  assert.deepEqual(snapshot, before);
  assert.equal(prediction.add(shot(2), { ...p.state, isReloading: false, ammo: 1 }, 20), true);
  const rejected = fire(room, p, shot(2), 1); assert.equal(rejected.ok, false);
  prediction.result(rejected, snapshot); assert.equal(prediction.count(20), 0);
  assert.equal(prediction.render(snapshot.projectiles, 20).length, 1);
  assert.equal(p.state.ammo, 0); assert.equal(p.state.health, 100); assert.equal(p.state.shield, 50);
});

test('room changes/disconnects cannot apply an old reload intent to a new membership', () => {
  const { store, room, p, request } = fixture(); p.state.ammo = 1;
  store.leave('a'); assert.equal(reload(room, p, request).ok, false);
  store.create('a', 'A', 0); const next = store.roomFor('a')!, player = next.players.get('a')!; player.state.ammo = 1;
  assert.equal(next.code, room.code); assert.notEqual(player.state.reloadSession, request.reloadSession);
  assert.equal(reload(next, player, request).ok, false); assert.equal(player.state.isReloading, false);
});
