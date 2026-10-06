import { BASIC_BLASTER, parseFire, type FireRequest, type FireResult, type ProjectileState } from '../shared/projectiles';
import type { PlayerState, Snapshot } from '../shared/protocol';
export interface BulletVisual { id: string; x: number; y: number }
export const PREDICTED_SHOT_TIMEOUT_MS = 1000;
interface PendingVisual { request: FireRequest; ownerId: string; x: number; y: number; vx: number; vy: number; born: number;
  accepted?: { id: string; spawnTick: number } }
// No collision, damage, ammo or cooldown logic. This layer owns only temporary visuals.
export class ProjectilePrediction {
  private pending = new Map<number, PendingVisual>();
  clear() { this.pending.clear(); }
  add(raw: FireRequest, player: PlayerState, now: number): boolean {
    const request = parseFire(raw);
    this.expire(now);
    if (!request || this.pending.has(request.sequence) || this.pending.size >= BASIC_BLASTER.maxActive ||
      player.lifeGeneration !== request.lifeGeneration || player.teleportSequence !== request.teleportSequence) return false;
    const dx = Math.cos(request.aim), dy = Math.sin(request.aim);
    this.pending.set(request.sequence, { request, ownerId: player.id, born: now,
      x: player.x + dx * BASIC_BLASTER.muzzleOffset, y: player.y + dy * BASIC_BLASTER.muzzleOffset,
      vx: player.vx + dx * BASIC_BLASTER.muzzleSpeed, vy: player.vy + dy * BASIC_BLASTER.muzzleSpeed });
    return true;
  }
  result(result: FireResult, latest: Snapshot | null) {
    const visual = this.pending.get(result.sequence); if (!visual) return;
    if (!result.ok) { this.pending.delete(result.sequence); return; }
    visual.accepted = { id: result.projectileId, spawnTick: result.spawnTick };
    // A shot may hit/expire between snapshots, before the acknowledgment arrives.
    if (latest && latest.tick > result.spawnTick && !latest.projectiles.some(p => p.id === result.projectileId)) this.pending.delete(result.sequence);
  }
  reconcile(snapshot: Snapshot, ownerId: string, now: number) {
    this.expire(now);
    const owner = snapshot.players.find(p => p.id === ownerId);
    for (const [sequence, visual] of this.pending) {
      if (!owner || owner.id !== visual.ownerId || owner.lifeState !== 'active' || owner.lifeGeneration !== visual.request.lifeGeneration || owner.teleportSequence !== visual.request.teleportSequence ||
        snapshot.projectiles.some(p => p.ownerId === ownerId && p.shotSequence === sequence && p.lifeGeneration === visual.request.lifeGeneration && p.teleportSequence === visual.request.teleportSequence) ||
        visual.accepted && snapshot.tick > visual.accepted.spawnTick && !snapshot.projectiles.some(p => p.id === visual.accepted!.id)) this.pending.delete(sequence);
    }
  }
  private expire(now: number) { for (const [seq, v] of this.pending) if (now - v.born >= PREDICTED_SHOT_TIMEOUT_MS) this.pending.delete(seq); }
  count(now: number): number { this.expire(now); return this.pending.size; }
  render(authoritative: ProjectileState[], now: number): BulletVisual[] {
    this.expire(now);
    const visuals: BulletVisual[] = authoritative.map(p => ({ id: p.id, x: p.x, y: p.y }));
    for (const [seq, v] of this.pending) {
      // Defensive deduplication also works if rendering precedes snapshot reconciliation.
      if (authoritative.some(p => p.ownerId === v.ownerId && p.shotSequence === seq && p.lifeGeneration === v.request.lifeGeneration && p.teleportSequence === v.request.teleportSequence)) continue;
      const seconds = Math.max(0, now - v.born) / 1000;
      visuals.push({ id: `predicted:${v.ownerId}:${seq}`, x: v.x + v.vx * seconds, y: v.y + v.vy * seconds });
    }
    return visuals;
  }
}
