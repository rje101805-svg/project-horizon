import { MAX_AMMO, RELOAD_DURATION, FIRE_COOLDOWN,
  initialCombatState, clampCombatValue, type DamageSource, type PlayerStatus } from '../shared/combat';
import { ALIEN_HEALTH, ALIEN_MELEE_COOLDOWN_MS } from '../shared/alien';
import { RESPAWN_DELAY_MS } from '../shared/lifecycle';
import { retireInputs } from './inputs';
import { idleInput, TICK_MS } from '../shared/flight';
import type { RoomPlayer } from './rooms';
const RELOAD_TICKS = Math.ceil(RELOAD_DURATION / TICK_MS);
function syncTimers(player: RoomPlayer) {
  const s = player.state, t = player.combatTimers;
  s.isReloading = t.reload > 0;
  s.reloadRemainingMs = t.reload * TICK_MS;
  s.reloadProgress = t.reload > 0 ? 1 - t.reload / RELOAD_TICKS : t.reloadCompleted ? 1 : 0;
  s.fireCooldownRemainingMs = t.cooldown * TICK_MS;
  s.fireCooldownProgress = 1 - t.cooldown / Math.max(1, Math.ceil((s.status === 'ALIEN' ? ALIEN_MELEE_COOLDOWN_MS : FIRE_COOLDOWN) / TICK_MS));
}
export function resetCombatState(player: RoomPlayer) {
  const { controllerType, kills, reloadSession, status } = player.state;
  Object.assign(player.state, initialCombatState(), { controllerType, kills, reloadSession });
  if (player.humanEliminated || status === 'ALIEN') Object.assign(player.state, {status:'ALIEN', health:ALIEN_HEALTH, maxHealth:ALIEN_HEALTH, shield:0,maxShield:0,ammo:0,maxAmmo:0});
  player.invulnerableUntilMs = 0;
  player.combatTimers = { reload: 0, cooldown: 0, reloadCompleted: false }; syncTimers(player);
}
export function applyDamage(player: RoomPlayer, amount: number, source: DamageSource, simulationTimeMs = player.simulationTimeMs) {
  const validSource = source && ((source.type === 'PLAYER' && typeof source.playerId === 'string' && source.playerId.length > 0) ||
    (source.type === 'ENVIRONMENT' && ['BLACK_HOLE', 'HAZARD'].includes(source.cause)));
  if (!validSource || !Number.isFinite(amount) || amount <= 0 || player.state.lifeState === 'dead' || player.state.status === 'OUT' || !Number.isFinite(simulationTimeMs) || simulationTimeMs < 0) return null;
  // All damage shares the server-owned protection deadline.
  if (simulationTimeMs < player.invulnerableUntilMs) return null;
  const s = player.state;
  s.health = clampCombatValue(s.health, s.maxHealth); s.shield = clampCombatValue(s.shield, s.maxShield);
  const shieldAbsorbed = Math.min(s.shield, amount), healthDamage = Math.min(s.health, amount - shieldAbsorbed);
  s.shield -= shieldAbsorbed; s.health -= healthDamage;
  s.lastDamageSource = source.type === 'PLAYER' ? { type: 'PLAYER', playerId: source.playerId } : { type: 'ENVIRONMENT', cause: source.cause };
  if (s.health === 0) {
    player.humanEliminated = true; s.status = 'ALIEN'; s.lifeState = 'dead'; s.deathSequence++; s.teleportSequence++;
    s.deathSource = {...s.lastDamageSource}; s.respawnRemainingMs = RESPAWN_DELAY_MS;
    player.respawnAtMs = simulationTimeMs + RESPAWN_DELAY_MS;
    s.vx = s.vy = 0; retireInputs(player); player.input = idleInput(); player.lastInput = -Infinity; player.reset = false;
    player.invulnerableUntilMs = 0; s.spawnInvulnerabilityRemainingMs = 0;
    player.combatTimers = {reload:0,cooldown:0,reloadCompleted:false}; syncTimers(player);
    // Clear human resources immediately, including during the respawn delay.
    s.maxHealth = ALIEN_HEALTH; s.shield = s.maxShield = s.ammo = s.maxAmmo = 0;
  }
  return { shieldAbsorbed, healthDamage, depleted: s.health === 0 };
}
export function consumeAmmo(player: RoomPlayer, amount = 1): boolean {
  const s = player.state;
  if (!Number.isSafeInteger(amount) || amount <= 0 || s.lifeState !== 'active' || s.status !== 'ALIVE' || s.isReloading || !Number.isSafeInteger(s.ammo) || s.ammo < amount) return false;
  s.ammo = Math.max(0, Math.floor(clampCombatValue(s.ammo, MAX_AMMO)) - amount); return true;
}
export function startReload(player: RoomPlayer): boolean {
  const s = player.state;
  if (s.lifeState !== 'active' || s.status !== 'ALIVE' || s.health <= 0 || s.isReloading || !Number.isSafeInteger(s.ammo) || s.ammo < 0 || s.ammo >= MAX_AMMO) return false;
  player.combatTimers.reload = RELOAD_TICKS; player.combatTimers.reloadCompleted = false; syncTimers(player); return true;
}
export function completeReload(player: RoomPlayer): boolean {
  if (!player.state.isReloading || player.combatTimers.reload > 0) return false;
  player.state.ammo = MAX_AMMO; player.combatTimers.reloadCompleted = true; syncTimers(player); return true;
}
export function canFireFromCooldown(player: RoomPlayer): boolean { return player.combatTimers.cooldown === 0; }
export function startFireCooldown(player: RoomPlayer): boolean {
  if (player.state.lifeState !== 'active' || !canFireFromCooldown(player)) return false;
  player.combatTimers.cooldown = Math.ceil((player.state.status === 'ALIEN' ? ALIEN_MELEE_COOLDOWN_MS : FIRE_COOLDOWN) / TICK_MS); syncTimers(player); return true;
}
export function setStatus(player: RoomPlayer, status: PlayerStatus): boolean {
  if (!['ALIVE', 'ALIEN', 'OUT'].includes(status)) return false;
  if ((player.humanEliminated || player.state.status === 'ALIEN') && status === 'ALIVE') return false;
  if (status === 'ALIEN') player.humanEliminated = true;
  player.state.status = status; return true;
}
export function advanceCombatTick(player: RoomPlayer) {
  if (player.state.lifeState !== 'active') return;
  if (player.combatTimers.reload > 0 && --player.combatTimers.reload === 0) completeReload(player);
  if (player.combatTimers.cooldown > 0) player.combatTimers.cooldown--;
  syncTimers(player);
}

// Temporary debug refill API, never a gameplay reload or fire-validation bypass.
export function refillAmmo(player: RoomPlayer): boolean {
  if (player.state.lifeState !== 'active' || player.state.status !== 'ALIVE' || player.state.isReloading) return false;
  player.state.ammo = MAX_AMMO; return true;
}
