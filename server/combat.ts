import {applyFighterCaps} from './fighters';
import {GUARDIAN_PROFILES} from '../shared/guardians';
import {cancelHealing} from './survival';
import {initializeInventory,clearInventory} from './inventory';
import {activeWeapon,WEAPONS,fireInterval,reloadDuration,STUN_MS,hasGoldGun} from '../shared/weapons';
import {
  initialCombatState, clampCombatValue, type DamageSource, type PlayerStatus } from '../shared/combat';
import { ALIEN_HEALTH, ALIEN_MELEE_COOLDOWN_MS } from '../shared/alien';
import { RESPAWN_DELAY_MS } from '../shared/lifecycle';
import { retireInputs } from './inputs';
import { idleInput, TICK_MS } from '../shared/flight';
import type { RoomPlayer } from './rooms';
const reloadTicks=(player:RoomPlayer)=>Math.ceil(reloadDuration(player.state)/TICK_MS);
function syncTimers(player: RoomPlayer) {
  const s = player.state, t = player.combatTimers;
  s.isReloading = t.reload > 0;
  s.reloadRemainingMs = t.reload * TICK_MS;
  s.reloadProgress = t.reload > 0 ? 1 - t.reload / reloadTicks(player) : t.reloadCompleted ? 1 : 0;
  s.fireCooldownRemainingMs = Math.max(0,Math.ceil(t.cooldown-1e-9)) * TICK_MS;
  s.fireCooldownProgress = Math.min(1,1-Math.max(0,t.cooldown)/Math.max(1,(s.status==='ALIEN'?ALIEN_MELEE_COOLDOWN_MS:fireInterval(s))/TICK_MS));
}
export function resetCombatState(player: RoomPlayer) {
  const { controllerType, kills, reloadSession, status } = player.state;
  Object.assign(player.state, initialCombatState(), { controllerType, kills, reloadSession });
  if (!player.humanEliminated && status!=='ALIEN')initializeInventory(player);else clearInventory(player);
  if (player.humanEliminated || status === 'ALIEN') Object.assign(player.state, {status:'ALIEN', health:ALIEN_HEALTH, maxHealth:ALIEN_HEALTH, shield:0,maxShield:0,ammo:0,maxAmmo:0});
  applyFighterCaps(player,true);player.burnOwnerId=undefined;player.titanTriggerUntilMs=0;player.recentPickups?.clear();
  player.invulnerableUntilMs = 0;
  player.combatTimers = { reload: 0, cooldown: 0, reloadCompleted: false }; syncTimers(player);
}
export function applyDamage(player: RoomPlayer, amount: number, source: DamageSource, simulationTimeMs = player.simulationTimeMs, horizonDamage=false) {
  const validSource = source && ((source.type === 'PLAYER' && typeof source.playerId === 'string' && source.playerId.length > 0) ||
    (source.type==='GUARDIAN'&&!!GUARDIAN_PROFILES[source.planetId]&&typeof source.guardianId==='string'&&source.guardianId.length>0)||
    (source.type === 'ENVIRONMENT' && ['BLACK_HOLE', 'HAZARD'].includes(source.cause)));
  if (source?.type==='GUARDIAN'&&player.state.status!=='ALIVE')return null;
  if ((!player.gameplayEnabled || player.combatEnabled===false) || !validSource || !Number.isFinite(amount) || amount <= 0 || player.state.lifeState === 'dead' || player.state.status === 'OUT' || !Number.isFinite(simulationTimeMs) || simulationTimeMs < 0) return null;
  // All damage shares the server-owned protection deadline.
  if (!(horizonDamage&&source.type==='ENVIRONMENT'&&source.cause==='BLACK_HOLE') && simulationTimeMs < Math.max(player.invulnerableUntilMs,player.launchProtectionUntilMs??0)) return null;
  // Count distinct hit ticks, not pellets; retain two seconds even for 30Hz streams.
  if(source.type==='PLAYER'||source.type==='GUARDIAN'){player.incomingDamageTimes=[...(player.incomingDamageTimes??[]).filter(t=>simulationTimeMs-t<=2000&&Math.abs(t-simulationTimeMs)>1e-7),simulationTimeMs].slice(-64);player.lastAttackedMs=simulationTimeMs;if(source.type==='PLAYER')(player.recentAttackers??=new Map()).set(source.playerId,simulationTimeMs);}
  const s = player.state;
  s.health = clampCombatValue(s.health, s.maxHealth); s.shield = clampCombatValue(s.shield, s.maxShield);
  const shieldAbsorbed = Math.min(s.shield, amount), healthDamage = Math.min(s.health, amount - shieldAbsorbed);
  s.shield -= shieldAbsorbed; s.health -= healthDamage;
  s.lastDamageSource = {...source};player.onDamaged?.(shieldAbsorbed+healthDamage,source);
  if (s.health === 0) eliminate(player, s.lastDamageSource, simulationTimeMs,horizonDamage);
  return { shieldAbsorbed, healthDamage, depleted: s.health === 0 };
}
// Explicit lethal transition shared by ordinary depletion and tractor lock finisher.
export function eliminate(player: RoomPlayer, source: DamageSource, simulationTimeMs = player.simulationTimeMs,horizonDamage=false): boolean {
  const s=player.state;
  if((!player.gameplayEnabled || player.combatEnabled===false) || (!horizonDamage&&simulationTimeMs<(player.launchProtectionUntilMs??0)) || s.lifeState!=='active' || s.status==='OUT')return false;
  const wasCompetitor=s.status==='ALIVE';s.guardianSlowRemainingMs=0;cancelHealing(player,simulationTimeMs);player.dropSurvival?.();player.dropRegular?.();player.dropGold?.();s.stunRemainingMs=s.stunImmunityRemainingMs=s.slowRemainingMs=s.burnRemainingMs=s.titanSpin=s.titanSustainMs=0;player.burnOwnerId=undefined;player.titanTriggerUntilMs=0;
  s.health=0; s.lastDamageSource={...source};
  player.humanEliminated = true; s.status = 'ALIEN'; s.lifeState = 'dead'; s.deathSequence++; s.teleportSequence++;
  s.deathSource = {...s.lastDamageSource}; s.respawnRemainingMs = RESPAWN_DELAY_MS;
  player.respawnAtMs = simulationTimeMs + RESPAWN_DELAY_MS;
  s.vx = s.vy = 0; retireInputs(player); player.input = idleInput(); player.lastInput = -Infinity; player.reset = false;
  player.invulnerableUntilMs = 0;player.launchProtectionUntilMs=0;s.launchProtectionRemainingMs=0; s.spawnInvulnerabilityRemainingMs = 0;
  player.combatTimers = {reload:0,cooldown:0,reloadCompleted:false}; syncTimers(player);
  // Clear human resources immediately, including during the respawn delay.
  s.maxHealth = ALIEN_HEALTH; s.shield = s.maxShield = s.ammo = s.maxAmmo = 0;
  player.cancelTractor?.();player.onEliminated?.(source,simulationTimeMs,wasCompetitor);
  return true;
}
export function consumeAmmo(player: RoomPlayer, amount = 1): boolean {
  const s = player.state;
  if ((!player.gameplayEnabled || player.combatEnabled===false) || !Number.isSafeInteger(amount) || amount <= 0 || s.lifeState !== 'active' || s.status !== 'ALIVE' || s.isReloading || !Number.isSafeInteger(s.ammo) || s.ammo < amount) return false;
  s.ammo = Math.max(0, Math.floor(clampCombatValue(s.ammo, s.maxAmmo)) - amount); return true;
}
export function startReload(player: RoomPlayer): boolean {
  const s = player.state;
  if ((!player.gameplayEnabled || player.combatEnabled===false) || s.lifeState !== 'active' || s.status !== 'ALIVE' || s.health <= 0 || hasGoldGun(s) || s.isReloading || !Number.isSafeInteger(s.ammo) || s.ammo < 0 || s.ammo >= s.maxAmmo) return false;
  const w=activeWeapon(s),inv=s.inventory;if(!w||!inv||inv.reserve[WEAPONS[w.class].ammoType]<=0||(s.stunRemainingMs??0)>0)return false;
  player.reloadWeaponId=w.id;player.combatTimers.reload = reloadTicks(player); player.combatTimers.reloadCompleted = false; syncTimers(player); return true;
}
export function completeReload(player: RoomPlayer): boolean {
  if (!player.state.isReloading || player.combatTimers.reload > 0) return false;
  const w=activeWeapon(player.state),inv=player.state.inventory;if(!w||!inv||w.id!==player.reloadWeaponId)return false;
  const type=WEAPONS[w.class].ammoType,transfer=Math.min(w.capacity-w.magazine,inv.reserve[type]);w.magazine+=transfer;inv.reserve[type]-=transfer;player.reloadWeaponId=undefined;player.combatTimers.reloadCompleted = true; syncTimers(player); return true;
}
export function canFireFromCooldown(player: RoomPlayer): boolean { return player.combatTimers.cooldown <= 1e-9; }
export function startFireCooldown(player: RoomPlayer): boolean {
  if ((!player.gameplayEnabled || player.combatEnabled===false) || player.state.lifeState !== 'active' || !canFireFromCooldown(player)) return false;
  player.combatTimers.cooldown = Math.max(-1,player.combatTimers.cooldown)+(player.state.status === 'ALIEN' ? ALIEN_MELEE_COOLDOWN_MS : fireInterval(player.state))/TICK_MS; syncTimers(player); return true;
}
export function setStatus(player: RoomPlayer, status: PlayerStatus): boolean {
  if (!['ALIVE', 'ALIEN', 'OUT'].includes(status)) return false;
  if ((player.humanEliminated || player.state.status === 'ALIEN') && status === 'ALIVE') return false;
  if (status === 'ALIEN') player.humanEliminated = true;
  if(status!=='ALIVE'){player.state.guardianSlowRemainingMs=0;cancelHealing(player);player.dropSurvival?.();player.dropRegular?.();player.dropGold?.();player.state.stunRemainingMs=player.state.stunImmunityRemainingMs=player.state.slowRemainingMs=player.state.burnRemainingMs=0;player.burnOwnerId=undefined;player.titanTriggerUntilMs=0;}
  player.state.status = status; if(status!=='ALIVE')player.cancelTractor?.(); return true;
}
export function advanceCombatTick(player: RoomPlayer) {
  if ((!player.gameplayEnabled || player.combatEnabled===false) || player.state.lifeState !== 'active') return;
  if (player.combatTimers.reload > 0 && --player.combatTimers.reload === 0) completeReload(player);
  player.combatTimers.cooldown=player.combatTimers.cooldown>1e-9?player.combatTimers.cooldown-1:0;
  if((player.state.stunRemainingMs??0)<=0)player.state.stunImmunityRemainingMs=Math.max(0,(player.state.stunImmunityRemainingMs??0)-TICK_MS);
  if((player.state.stunImmunityRemainingMs??0)<1e-7)player.state.stunImmunityRemainingMs=0;
  syncTimers(player);
}

// Temporary debug refill API, never a gameplay reload or fire-validation bypass.
export function refillAmmo(player: RoomPlayer): boolean {
  if ((!player.gameplayEnabled || player.combatEnabled===false) || player.state.lifeState !== 'active' || player.state.status !== 'ALIVE' || player.state.isReloading) return false;
  player.state.ammo = player.state.maxAmmo;const inv=player.state.inventory,w=activeWeapon(player.state);if(inv&&w)inv.reserve[WEAPONS[w.class].ammoType]=WEAPONS[w.class].magazine*2; return true;
}

export function applyStun(p:RoomPlayer){if((!p.gameplayEnabled||p.combatEnabled===false)||p.state.lifeState!=='active'||p.state.health<=0||(p.state.stunRemainingMs??0)>0||(p.state.stunImmunityRemainingMs??0)>0)return false;p.state.stunRemainingMs=STUN_MS;return true;}
