import { BASIC_BLASTER } from './projectiles';
import { WORLD } from './flight';
// A receipt for one already-resolved server hit, never a damage command or HP feed.
export interface ProjectileHit {
  projectileId: string; shotSequence: number; hitTick: number; roomCode: string;
  ownerId: string; ownerSession: string; lifeGeneration: number; teleportSequence: number;
  targetId: string; targetSession: string; targetLifeGeneration: number; targetTeleportSequence: number;
  x: number; y: number; shieldDamage: number; healthDamage: number;
}
export function parseProjectileHit(raw: unknown): ProjectileHit | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const h = raw as ProjectileHit;
  if ([h.projectileId, h.ownerId, h.ownerSession, h.targetId, h.targetSession, h.roomCode]
    .some(s => typeof s !== 'string' || !s.length || s.length > 80) || h.ownerId === h.targetId ||
    !Number.isSafeInteger(h.shotSequence) || h.shotSequence <= 0 ||
    [h.hitTick, h.lifeGeneration, h.teleportSequence, h.targetLifeGeneration, h.targetTeleportSequence]
      .some(n => !Number.isSafeInteger(n) || n < 0) ||
    [h.x, h.y].some(n => !Number.isFinite(n) || n < 0 || n > WORLD) ||
    [h.shieldDamage, h.healthDamage].some(n => !Number.isFinite(n) || n < 0) ||
    h.shieldDamage + h.healthDamage <= 0 || h.shieldDamage + h.healthDamage > BASIC_BLASTER.damage) return null;
  return { projectileId: h.projectileId, shotSequence: h.shotSequence, hitTick: h.hitTick, roomCode: h.roomCode,
    ownerId: h.ownerId, ownerSession: h.ownerSession, lifeGeneration: h.lifeGeneration, teleportSequence: h.teleportSequence,
    targetId: h.targetId, targetSession: h.targetSession, targetLifeGeneration: h.targetLifeGeneration,
    targetTeleportSequence: h.targetTeleportSequence, x: h.x, y: h.y, shieldDamage: h.shieldDamage, healthDamage: h.healthDamage };
}
