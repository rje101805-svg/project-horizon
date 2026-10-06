// Temporary Step 2 balance. Durations are milliseconds, quantized to fixed ticks
// by the authoritative server; this is the only balance configuration location.
export const MAX_HEALTH = 100;
export const MAX_SHIELD = 50;
export const MAX_AMMO = 12;
export const RELOAD_DURATION = 1500;
export const FIRE_COOLDOWN = 200;
export type PlayerStatus = 'ALIVE' | 'ALIEN' | 'OUT';
export type ControllerType = 'HUMAN' | 'BOT';
export type DamageSource = { type: 'PLAYER'; playerId: string } |
  { type: 'ENVIRONMENT'; cause: 'BLACK_HOLE' | 'HAZARD' };
export interface CombatState {
  health: number; maxHealth: number;
  shield: number; maxShield: number;
  ammo: number; maxAmmo: number;
  isReloading: boolean; reloadRemainingMs: number; reloadProgress: number;
  fireCooldownRemainingMs: number; fireCooldownProgress: number;
  shieldUp: boolean; status: PlayerStatus; controllerType: ControllerType; kills: number;
  lastDamageSource: DamageSource | null;
}
export const initialCombatState = (): CombatState => ({
  health: MAX_HEALTH, maxHealth: MAX_HEALTH, shield: MAX_SHIELD, maxShield: MAX_SHIELD,
  ammo: MAX_AMMO, maxAmmo: MAX_AMMO, isReloading: false, reloadRemainingMs: 0, reloadProgress: 0,
  fireCooldownRemainingMs: 0, fireCooldownProgress: 1, shieldUp: false, status: 'ALIVE',
  controllerType: 'HUMAN', kills: 0, lastDamageSource: null,
});
export const clampCombatValue = (value: number, max: number) => Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0;
export type CombatDebugAction = 'damage' | 'ammo' | 'reload' | 'shield' | 'cooldown' | 'refill';
export interface CombatDebugRequest { action: CombatDebugAction; lifeGeneration: number; teleportSequence: number }
export interface CombatDebugResult { ok: boolean; message: string }
