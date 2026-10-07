import { FIRE_COOLDOWN, MAX_AMMO } from './combat';
// Temporary basic blaster balance; magazine/cooldown share the combat configuration.
export const BASIC_BLASTER = Object.freeze({ damage: 25, muzzleSpeed: 800, lifetimeMs: 2000,
  fireIntervalMs: FIRE_COOLDOWN, magazineSize: MAX_AMMO, maxActive: 12,
  muzzleOffset: 28, projectileRadius: 3, shipRadius: 18 });
export interface FireRequest { sequence: number; aim: number; lifeGeneration: number; teleportSequence: number }
export type FireResult = { ok: true; sequence: number; projectileId: string; spawnTick: number; kind?: 'projectile' } |
  { ok: true; kind: 'melee'; sequence: number; damageApplied: number } |
  { ok: false; sequence: number; reason: string };
export interface ProjectileState { id: string; ownerId: string; shotSequence: number; lifeGeneration: number;
  teleportSequence: number; x: number; y: number; vx: number; vy: number; damage: number; spawnTick: number; remainingMs: number }
export function parseFire(raw: unknown): FireRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as FireRequest;
  if (!Number.isSafeInteger(r.sequence) || r.sequence <= 0 || !Number.isFinite(r.aim) || Math.abs(r.aim) > Math.PI ||
    !Number.isSafeInteger(r.lifeGeneration) || r.lifeGeneration < 0 || !Number.isSafeInteger(r.teleportSequence) || r.teleportSequence < 0) return null;
  return { sequence: r.sequence, aim: r.aim, lifeGeneration: r.lifeGeneration, teleportSequence: r.teleportSequence };
}
// Earliest contact on a complete swept segment, including tangent and starting inside.
export function circleEntry(a: {x:number;y:number}, b: {x:number;y:number}, c: {x:number;y:number}, radius: number): number | null {
  const ox = a.x - c.x, oy = a.y - c.y, dx = b.x - a.x, dy = b.y - a.y;
  const q = ox * ox + oy * oy - radius * radius, length = dx * dx + dy * dy;
  if (q <= 0) return 0;
  if (!length) return null;
  const dot = ox * dx + oy * dy, disc = dot * dot - length * q;
  if (disc < 0) return null;
  const t = (-dot - Math.sqrt(disc)) / length;
  return t >= 0 && t <= 1 ? t : null;
}
