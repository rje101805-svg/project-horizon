import { ALIEN_HEALTH } from '../shared/alien';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomStore } from '../server/rooms';
import { applyDamage, consumeAmmo, startReload, completeReload, startFireCooldown, canFireFromCooldown,
  setStatus, resetCombatState, advanceCombatTick } from '../server/combat';
import { combatDebugEnabled, runCombatDebug } from '../server/combat-debug';
import { MAX_HEALTH, MAX_SHIELD, MAX_AMMO, RELOAD_DURATION, FIRE_COOLDOWN, type DamageSource } from '../shared/combat';
import { TICK_MS } from '../shared/flight';
import { simulatePlayer } from '../server/simulation';
import { stepMovement } from '../shared/movement';
import { idleInput } from '../shared/flight';
import { RESPAWN_DELAY_MS } from '../shared/lifecycle';
function fixture() {
  const store = new RoomStore(); store.create('me', 'Me', 0);
  const room = store.roomFor('me')!, player = room.players.get('me')!;
  return { store, room, player };
}
const source: DamageSource = { type: 'PLAYER', playerId: 'attacker' };
test('new human combat state is full, ALIVE, idle, cooldown ready', () => {
  const { player: p } = fixture();
  assert.equal(p.state.health, MAX_HEALTH); assert.equal(p.state.maxHealth, MAX_HEALTH);
  assert.equal(p.state.shield, MAX_SHIELD); assert.equal(p.state.maxShield, MAX_SHIELD);
  assert.equal(p.state.ammo, MAX_AMMO); assert.equal(p.state.maxAmmo, MAX_AMMO);
  assert.equal(p.state.isReloading, false); assert.equal(p.state.reloadRemainingMs, 0);
  assert.equal(p.state.fireCooldownRemainingMs, 0); assert.equal(canFireFromCooldown(p), true);
  assert.equal(p.state.status, 'ALIVE'); assert.equal(p.state.controllerType, 'HUMAN');
  assert.equal(p.state.kills, 0); assert.equal(p.state.lastDamageSource, null);
});
test('damage absorbs shield first, overflows to health, clamps and eliminates once at zero', () => {
  const { player: p } = fixture(); p.state.shield = 20;
  assert.deepEqual(applyDamage(p, 35, source), { shieldAbsorbed: 20, healthDamage: 15, depleted: false });
  assert.equal(p.state.health, 85); assert.equal(p.state.shield, 0); assert.deepEqual(p.state.lastDamageSource, source);
  resetCombatState(p); applyDamage(p, MAX_SHIELD, { type: 'ENVIRONMENT', cause: 'HAZARD' });
  assert.equal(p.state.health, MAX_HEALTH); assert.equal(p.state.shield, 0);
  applyDamage(p, 10000, source); assert.equal(p.state.health, 0); assert.equal(p.state.shield, 0);
  assert.equal(p.state.status, 'ALIEN'); assert.equal(p.state.lifeState, 'dead'); assert.equal(p.state.kills, 0);
  assert.equal(p.state.deathSequence, 1); assert.equal(p.respawnAtMs, RESPAWN_DELAY_MS);
  for (const amount of [NaN, Infinity, -1, 0]) assert.equal(applyDamage(p, amount, source), null);
  const fresh = fixture().player; fresh.state.health = -4; fresh.state.shield = 999; applyDamage(fresh, 1, source);
  assert.equal(fresh.state.health, 0); assert.equal(fresh.state.shield, 0); assert.equal(fresh.state.status, 'ALIEN');
  assert.equal(applyDamage(p, 1, { type: 'PLAYER', playerId: '' }), null);
});
test('ammo rejects insufficient/invalid consumption and keeps its max', () => {
  const { player: p } = fixture();
  assert.equal(consumeAmmo(p, 3), true); assert.equal(p.state.ammo, MAX_AMMO - 3);
  for (const amount of [NaN, Infinity, -1, 0, .5, MAX_AMMO]) assert.equal(consumeAmmo(p, amount), false);
  assert.equal(consumeAmmo(p, MAX_AMMO - 3), true); assert.equal(p.state.ammo, 0);
  assert.equal(consumeAmmo(p), false); assert.equal(p.state.maxAmmo, MAX_AMMO);
});
test('reload advances only by fixed ticks, duplicate never restarts and premature completion is rejected', () => {
  const { player: p } = fixture(); assert.equal(startReload(p), false);
  consumeAmmo(p, 5); assert.equal(startReload(p), true);
  const ticks = Math.ceil(RELOAD_DURATION / TICK_MS);
  for (let i = 0; i < ticks - 1; i++) {
    const before = p.combatTimers.reload; assert.equal(startReload(p), false); assert.equal(p.combatTimers.reload, before);
    assert.equal(completeReload(p), false); advanceCombatTick(p);
  }
  assert.equal(p.state.isReloading, true); assert.ok(p.state.reloadRemainingMs > 0); assert.ok(p.state.reloadProgress > .9);
  assert.equal(consumeAmmo(p), false); advanceCombatTick(p);
  assert.equal(p.state.isReloading, false); assert.equal(p.state.reloadRemainingMs, 0); assert.equal(p.state.reloadProgress, 1);
  assert.equal(p.state.ammo, MAX_AMMO); assert.equal(completeReload(p), false);
  p.state.ammo = NaN; assert.equal(startReload(p), false);
});
test('cooldown ticks down exactly and combat state has no movement effects', () => {
  const a = fixture(), b = fixture();
  assert.equal(startFireCooldown(b.player), true); assert.equal(startFireCooldown(b.player), false);
  const duration = b.player.state.fireCooldownRemainingMs;
  assert.equal(duration, Math.ceil(FIRE_COOLDOWN / TICK_MS) * TICK_MS);
  for (let n = 1; n < Math.ceil(FIRE_COOLDOWN / TICK_MS); n++) { advanceCombatTick(b.player); assert.equal(canFireFromCooldown(b.player), false); }
  advanceCombatTick(b.player); assert.equal(canFireFromCooldown(b.player), true);
  assert.equal(b.player.state.fireCooldownProgress, 1);
  applyDamage(a.player, 35, source); applyDamage(b.player, 35, source);
  assert.equal(a.player.state.health, b.player.state.health); assert.equal(a.player.state.shield, b.player.state.shield);
  for (const p of [a.player, b.player]) stepMovement(p.state, { ...idleInput(), right: true }, a.room.blackHole);
  assert.equal(a.player.state.x, b.player.state.x); assert.equal(a.player.state.vx, b.player.state.vx);
});
test('status is centralized, controller independent and alien eligibility cannot be restored', () => {
  const { player: p } = fixture();
  for (const status of ['ALIVE', 'ALIEN', 'OUT'] as const) {
    assert.equal(setStatus(p, status), true); assert.equal(p.state.status, status); assert.equal(p.state.controllerType, 'HUMAN');
  }
  assert.equal(setStatus(p, 'FAKE' as 'ALIVE'), false);
  assert.equal(setStatus(p, 'ALIVE'), false);
  p.state.controllerType = 'BOT'; resetCombatState(p); assert.equal(p.state.status, 'ALIEN'); assert.equal(p.state.controllerType, 'BOT');
});
test('black-hole death stays lethal through shields and respawn resets alien combat fields', () => {
  const { player: p, room } = fixture(); consumeAmmo(p, 3); startReload(p); startFireCooldown(p);
  Object.assign(p.state, { x: room.blackHole.x, y: room.blackHole.y });
  simulatePlayer(p, room, 0, 0); assert.equal(p.state.lifeState, 'dead'); assert.equal(p.state.health, 0); assert.equal(p.state.shield, 0);
  assert.deepEqual(p.state.deathSource, { type: 'ENVIRONMENT', cause: 'BLACK_HOLE' });
  const marker = p.state.teleportSequence;
  simulatePlayer(p, room, 99999999, RESPAWN_DELAY_MS);
  assert.equal(p.state.lifeState, 'active'); assert.equal(p.state.health, ALIEN_HEALTH); assert.equal(p.state.shield, 0);
  assert.equal(p.state.ammo, 0); assert.equal(p.state.isReloading, false); assert.equal(p.state.reloadRemainingMs, 0);
  assert.equal(p.state.reloadProgress, 0); assert.equal(p.state.fireCooldownRemainingMs, 0);
  assert.equal(p.state.status, 'ALIEN'); assert.equal(p.state.controllerType, 'HUMAN'); assert.equal(p.state.lifeGeneration, 1);
  assert.ok(p.state.teleportSequence > marker); assert.equal(p.pendingInputs.length, 0);
});
test('debug requires an explicit server flag and production veto, with stale and unknown actions rejected', () => {
  assert.equal(combatDebugEnabled(undefined, 'development'), false); assert.equal(combatDebugEnabled(false, undefined), false);
  assert.equal(combatDebugEnabled(true, 'development'), true); assert.equal(combatDebugEnabled(true, 'production'), false);
  const { player: p } = fixture(), request = { action: 'damage' as const, lifeGeneration: 0, teleportSequence: 0 };
  const before = { ...p.state }; assert.equal(runCombatDebug(p, request, false).ok, false); assert.deepEqual(p.state, before);
  assert.equal(runCombatDebug(p, request, true).ok, true); assert.equal(p.state.shield, MAX_SHIELD - 35);
  assert.equal(runCombatDebug(p, { ...request, lifeGeneration: 1 }, true).ok, false);
  assert.equal(runCombatDebug(p, { ...request, action: 'unknown' as 'damage' }, true).ok, false);
});
