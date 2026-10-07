import { clampCombatValue, type CombatState } from '../shared/combat';
export const LOW_AMMO_THRESHOLD = 3;
export const LOW_HEALTH_RATIO = .25;
export const HIT_FEEDBACK_LIFETIME_MS = 750;
export const MAX_HIT_FEEDBACK = 32;
export const SHIP_BAR_WIDTH = 72;
export const SHIELD_COLOR = 0x65d9ff;
export const HEALTH_COLOR = 0x72eee0;
export const LOW_HEALTH_COLOR = 0xff705f;
export const RELOAD_COLOR = 0xffce73;
const ratio = (n: number, max: number) => Number.isFinite(max) && max > 0 ? clampCombatValue(n, max) / max : 0;
export function combatPresentation(s: CombatState) {
  const ammo = clampCombatValue(s.ammo, s.maxAmmo);
  return { alien: s.status === 'ALIEN', shield: ratio(s.shield, s.maxShield), health: ratio(s.health, s.maxHealth),
    ammo, maxAmmo: s.maxAmmo, lowAmmo: s.status === 'ALIVE' && ammo <= LOW_AMMO_THRESHOLD, lowHealth: ratio(s.health, s.maxHealth) <= LOW_HEALTH_RATIO,
    reloading: s.isReloading, reloadProgress: clampCombatValue(s.reloadProgress, 1) };
}
