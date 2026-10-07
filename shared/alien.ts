import { BASIC_BLASTER } from './projectiles';
// P2S6 balance only; flight and human weapon values are unchanged.
export const ALIEN_HEALTH = 40;
export const ALIEN_MELEE_DAMAGE = BASIC_BLASTER.damage * .2;
export const ALIEN_MELEE_RANGE = 60; // center-to-center, one nearest human per attempt
export const ALIEN_MELEE_COOLDOWN_MS = 750;
export const ALIEN_SPAWN_PROTECTION_MS = 2000;
export const ALIEN_COLOR = 0xcf9dff;
export const ALIEN_OPACITY = .5;
