import { MAX_HEALTH, MAX_SHIELD, MAX_AMMO, RELOAD_DURATION, FIRE_COOLDOWN,
  initialCombatState, clampCombatValue, type DamageSource, type PlayerStatus } from '../shared/combat';
import { TICK_MS } from '../shared/flight';
import type { RoomPlayer } from './rooms';
const RELOAD_TICKS = Math.ceil(RELOAD_DURATION / TICK_MS);
const COOLDOWN_TICKS = Math.ceil(FIRE_COOLDOWN / TICK_MS);
function syncTimers(player: RoomPlayer) {
  const s = player.state, t = player.combatTimers;
  s.isReloading = t.reload > 0;
  s.reloadRemainingMs = t.reload * TICK_MS;
  s.reloadProgress = t.reload > 0 ? 1 - t.reload / RELOAD_TICKS : t.reloadCompleted ? 1 : 0;
  s.fireCooldownRemainingMs = t.cooldown * TICK_MS;
  s.fireCooldownProgress = 1 - t.cooldown / COOLDOWN_TICKS;
}
export function resetCombatState(player: RoomPlayer) {
  const { controllerType, kills } = player.state;
  Object.assign(player.state, initialCombatState(), { controllerType, kills });
  player.combatTimers = { reload: 0, cooldown: 0, reloadCompleted: false }; syncTimers(player);
}
export function applyDamage(player: RoomPlayer, amount: number, source: DamageSource) {
  const validSource = source && ((source.type === 'PLAYER' && typeof source.playerId === 'string' && source.playerId.length > 0) ||
    (source.type === 'ENVIRONMENT' && ['BLACK_HOLE', 'HAZARD'].includes(source.cause)));
  if (!validSource || !Number.isFinite(amount) || amount <= 0 || player.state.lifeState === 'dead') return null;
  const s = player.state;
  s.health = clampCombatValue(s.health, MAX_HEALTH); s.shield = clampCombatValue(s.shield, MAX_SHIELD);
  const shieldAbsorbed = Math.min(s.shield, amount), healthDamage = Math.min(s.health, amount - shieldAbsorbed);
  s.shield -= shieldAbsorbed; s.health -= healthDamage;
  s.lastDamageSource = source.type === 'PLAYER' ? { type: 'PLAYER', playerId: source.playerId } : { type: 'ENVIRONMENT', cause: source.cause };
  // Zero health is recorded, but Step 6 owns combat elimination/attribution.
  return { shieldAbsorbed, healthDamage, depleted: s.health === 0 };
}
export function consumeAmmo(player: RoomPlayer, amount = 1): boolean {
  const s = player.state;
  if (!Number.isSafeInteger(amount) || amount <= 0 || s.lifeState !== 'active' || s.isReloading || !Number.isSafeInteger(s.ammo) || s.ammo < amount) return false;
  s.ammo = Math.max(0, Math.floor(clampCombatValue(s.ammo, MAX_AMMO)) - amount); return true;
}
export function startReload(player: RoomPlayer): boolean {
  const s = player.state;
  if (s.lifeState !== 'active' || s.status === 'OUT' || s.isReloading || !Number.isSafeInteger(s.ammo) || s.ammo < 0 || s.ammo >= MAX_AMMO) return false;
  player.combatTimers.reload = RELOAD_TICKS; player.combatTimers.reloadCompleted = false; syncTimers(player); return true;
}
export function completeReload(player: RoomPlayer): boolean {
  if (!player.state.isReloading || player.combatTimers.reload > 0) return false;
  player.state.ammo = MAX_AMMO; player.combatTimers.reloadCompleted = true; syncTimers(player); return true;
}
export function canFireFromCooldown(player: RoomPlayer): boolean { return player.combatTimers.cooldown === 0; }
export function startFireCooldown(player: RoomPlayer): boolean {
  if (player.state.lifeState !== 'active' || !canFireFromCooldown(player)) return false;
  player.combatTimers.cooldown = COOLDOWN_TICKS; syncTimers(player); return true;
}
export function setShieldUp(player: RoomPlayer, enabled: boolean): boolean {
  if (typeof enabled !== 'boolean' || player.state.lifeState !== 'active') return false;
  player.state.shieldUp = enabled; return true; // No damage, flight or firing effects.
}
export function setStatus(player: RoomPlayer, status: PlayerStatus): boolean {
  if (!['ALIVE', 'ALIEN', 'OUT'].includes(status)) return false;
  player.state.status = status; return true; // State only, no alien/winner gameplay.
}
export function advanceCombatTick(player: RoomPlayer) {
  if (player.state.lifeState !== 'active') return;
  if (player.combatTimers.reload > 0 && --player.combatTimers.reload === 0) completeReload(player);
  if (player.combatTimers.cooldown > 0) player.combatTimers.cooldown--;
  syncTimers(player);
}
