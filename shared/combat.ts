// Central combat balance. Durations are milliseconds, quantized to fixed ticks
// by the authoritative server; this is the only balance configuration location.
export const MAX_HEALTH = 100;
export const MAX_SHIELD = 50;
export const MAX_AMMO = 12;
export const RELOAD_DURATION = 1500;
export const FIRE_COOLDOWN = 200;
export type PlayerStatus = 'ALIVE' | 'ALIEN' | 'OUT';
export type ControllerType = 'HUMAN' | 'BOT';
export type DamageSource = { type: 'PLAYER'; playerId: string } | { type: 'TRACTOR'; playerId: string } |
  { type: 'ENVIRONMENT'; cause: 'BLACK_HOLE' | 'HAZARD' };
export interface CombatState {
  spawnInvulnerabilityRemainingMs: number; lastMeleeDamage: number;
  reloadSession: string; // Server-issued membership identity; not a client authority token.
  health: number; maxHealth: number;
  shield: number; maxShield: number;
  ammo: number; maxAmmo: number;
  isReloading: boolean; reloadRemainingMs: number; reloadProgress: number;
  fireCooldownRemainingMs: number; fireCooldownProgress: number;
  status: PlayerStatus; controllerType: ControllerType; kills: number;
  lastDamageSource: DamageSource | null;
}
export const initialCombatState = (): CombatState => ({
  spawnInvulnerabilityRemainingMs: 0, lastMeleeDamage: 0, reloadSession: '', health: MAX_HEALTH, maxHealth: MAX_HEALTH, shield: MAX_SHIELD, maxShield: MAX_SHIELD,
  ammo: MAX_AMMO, maxAmmo: MAX_AMMO, isReloading: false, reloadRemainingMs: 0, reloadProgress: 0,
  fireCooldownRemainingMs: 0, fireCooldownProgress: 1, status: 'ALIVE',
  controllerType: 'HUMAN', kills: 0, lastDamageSource: null,
});
export const clampCombatValue = (value: number, max: number) => Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0;
export type CombatDebugAction = 'damage' | 'ammo' | 'reload' | 'cooldown' | 'refill';
export interface CombatDebugRequest { action: CombatDebugAction; lifeGeneration: number; teleportSequence: number }
export interface CombatDebugResult { ok: boolean; message: string }

// Intent only: no client timer, ammo, target or completion fields are accepted.
export interface ReloadRequest { sequence: number; lifeGeneration: number; teleportSequence: number; roomCode: string; reloadSession: string }
export interface ReloadResult { ok: boolean; reason: string }
export function parseReload(raw: unknown): ReloadRequest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).some(k => !['sequence', 'lifeGeneration', 'teleportSequence', 'roomCode', 'reloadSession'].includes(k)) ||
    !Number.isSafeInteger(r.sequence) || (r.sequence as number) <= 0 ||
    !Number.isSafeInteger(r.lifeGeneration) || (r.lifeGeneration as number) < 0 ||
    !Number.isSafeInteger(r.teleportSequence) || (r.teleportSequence as number) < 0 ||
    typeof r.reloadSession !== 'string' || !/^[0-9a-f-]{36}$/.test(r.reloadSession) ||
    typeof r.roomCode !== 'string' || !/^[A-Z2-9]{4}$/.test(r.roomCode)) return null;
  return { sequence: r.sequence as number, lifeGeneration: r.lifeGeneration as number,
    teleportSequence: r.teleportSequence as number, roomCode: r.roomCode, reloadSession: r.reloadSession };
}
