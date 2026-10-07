import { parseProjectileHit, type ProjectileHit } from '../shared/hit-feedback';
import type { Snapshot } from '../shared/protocol';
import { HIT_FEEDBACK_LIFETIME_MS, MAX_HIT_FEEDBACK } from './combat-presentation';
export interface DamageFeedback { hit: ProjectileHit; born: number; slot: number }
// Bounded visual receipts only. No health/ammo/projectile mutation methods.
export class HitFeedback {
  private active = new Map<string, DamageFeedback>();
  private seen = new Set<string>();
  clear() { this.active.clear(); this.seen.clear(); }
  add(raw: unknown, snapshot: Snapshot | null, selfId: string, now: number): boolean {
    const hit = parseProjectileHit(raw);
    if (!hit || !snapshot || !Number.isFinite(now)) return false;
    const owner = snapshot.players.find(p => p.id === selfId);
    if (!owner || owner.lifeState !== 'active' || hit.roomCode !== snapshot.roomCode || hit.ownerId !== selfId ||
      hit.ownerSession !== owner.reloadSession || hit.lifeGeneration !== owner.lifeGeneration || hit.teleportSequence !== owner.teleportSequence) return false;
    if (snapshot.tick >= hit.hitTick && !this.currentTarget(hit, snapshot)) return false;
    const key = hit.projectileId;
    if (this.seen.has(key)) return false;
    this.expire(now);
    const occupied = new Set([...this.active.values()].filter(v => v.hit.targetId === hit.targetId).map(v => v.slot));
    let slot = 0; while (occupied.has(slot)) slot++;
    if (this.active.size >= MAX_HIT_FEEDBACK) this.active.delete(this.active.keys().next().value!);
    this.active.set(key, { hit, born: now, slot }); this.seen.add(key);
    if (this.seen.size > MAX_HIT_FEEDBACK * 4) this.seen.delete(this.seen.values().next().value!);
    return true;
  }
  private currentTarget(h: ProjectileHit, snapshot: Snapshot) {
    const p = snapshot.players.find(p => p.id === h.targetId);
    return p && p.reloadSession === h.targetSession && p.lifeGeneration === h.targetLifeGeneration &&
      p.teleportSequence === h.targetTeleportSequence;
  }
  reconcile(snapshot: Snapshot, selfId: string) {
    const owner = snapshot.players.find(p => p.id === selfId);
    for (const [key, v] of this.active) {
      const h = v.hit;
      if (!owner || owner.lifeState !== 'active' || h.roomCode !== snapshot.roomCode || h.ownerId !== selfId ||
        h.ownerSession !== owner.reloadSession || h.lifeGeneration !== owner.lifeGeneration || h.teleportSequence !== owner.teleportSequence ||
        snapshot.tick >= h.hitTick && !this.currentTarget(h, snapshot)) this.active.delete(key);
    }
  }
  removeMissing(ids: string[]) {
    const present = new Set(ids);
    for (const [key, v] of this.active) if (!present.has(v.hit.ownerId) || !present.has(v.hit.targetId)) this.active.delete(key);
  }
  private expire(now: number) { for (const [key, v] of this.active) if (now - v.born >= HIT_FEEDBACK_LIFETIME_MS) this.active.delete(key); }
  sample(now: number): DamageFeedback[] { this.expire(now); return [...this.active.values()]; }
}
