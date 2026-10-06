import { BASIC_BLASTER, parseFire, type FireRequest, type FireResult, type ProjectileState } from '../shared/projectiles';
import type { PlayerState, Snapshot } from '../shared/protocol';
import { LOCAL_PROJECTILE_EXTRAPOLATION_MS } from './projectile-view';
export interface BulletVisual { id: string; x: number; y: number }
export const PREDICTED_SHOT_TIMEOUT_MS = 1000;
const CORRECTION_TIME_MS = 80;
interface PendingVisual { request: FireRequest; ownerId: string; x: number; y: number; vx: number; vy: number; born: number;
  accepted?: { id: string; spawnTick: number } }
interface ConfirmedVisual { state: ProjectileState; arrival: number; offsetX: number; offsetY: number }
const sameShot = (a: ProjectileState, b: ProjectileState) => a.ownerId === b.ownerId && a.shotSequence === b.shotSequence &&
  a.lifeGeneration === b.lifeGeneration && a.teleportSequence === b.teleportSequence;
const matches = (p: ProjectileState, v: PendingVisual) => p.ownerId === v.ownerId && p.shotSequence === v.request.sequence &&
  p.lifeGeneration === v.request.lifeGeneration && p.teleportSequence === v.request.teleportSequence;
const pendingPosition = (v: PendingVisual, now: number) => {
  const seconds = Math.max(0, now - v.born) / 1000;
  return { x: v.x + v.vx * seconds, y: v.y + v.vy * seconds };
};
function confirmedPosition(v: ConfirmedVisual, now: number) {
  const elapsed = Math.min(LOCAL_PROJECTILE_EXTRAPOLATION_MS, Math.max(0, now - v.arrival));
  const distance = Math.hypot(v.offsetX, v.offsetY), speed = Math.hypot(v.state.vx, v.state.vy);
  // Smooth toward authority, limiting correction to half bullet speed so a
  // forward-moving shot cannot reverse solely because its visual offset decays.
  const corrected = Math.min(distance * (1 - Math.exp(-elapsed / CORRECTION_TIME_MS)), speed * .5 * elapsed / 1000);
  const remaining = distance ? 1 - corrected / distance : 0;
  return { x: v.state.x + v.state.vx * elapsed / 1000 + v.offsetX * remaining,
    y: v.state.y + v.state.vy * elapsed / 1000 + v.offsetY * remaining };
}
// No collision, damage, ammo or cooldown logic. All corrections are visual only.
export class ProjectilePrediction {
  private pending = new Map<number, PendingVisual>();
  private confirmed = new Map<string, ConfirmedVisual>();
  cancelPending() { this.pending.clear(); }
  clear() { this.cancelPending(); this.confirmed.clear(); }
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
    if (latest && latest.tick > result.spawnTick && !latest.projectiles.some(p => p.id === result.projectileId)) this.pending.delete(result.sequence);
  }
  reconcile(snapshot: Snapshot, ownerId: string, now: number) {
    this.expire(now);
    const owner = snapshot.players.find(p => p.id === ownerId);
    const owned = snapshot.projectiles.filter(p => p.ownerId === ownerId && owner?.lifeState === 'active' &&
      p.lifeGeneration === owner.lifeGeneration && p.teleportSequence === owner.teleportSequence);
    const ids = new Set(owned.map(p => p.id));
    for (const id of this.confirmed.keys()) if (!ids.has(id)) this.confirmed.delete(id);
    for (const p of owned) {
      const cached = this.confirmed.get(p.id), previous = cached && sameShot(cached.state, p) ? cached : undefined, pending = this.pending.get(p.shotSequence);
      // Preserve the current visual across prediction handoff and each snapshot.
      // Never create a second visible representation for the same identity.
      const position = previous ? confirmedPosition(previous, now) : pending && matches(p, pending) ? pendingPosition(pending, now) : p;
      this.confirmed.set(p.id, { state: { ...p }, arrival: now, offsetX: position.x - p.x, offsetY: position.y - p.y });
      if (pending && matches(p, pending)) this.pending.delete(p.shotSequence);
    }
    for (const [sequence, visual] of this.pending) {
      if (!owner || owner.id !== visual.ownerId || owner.lifeState !== 'active' || owner.lifeGeneration !== visual.request.lifeGeneration || owner.teleportSequence !== visual.request.teleportSequence ||
        visual.accepted && snapshot.tick > visual.accepted.spawnTick && !snapshot.projectiles.some(p => p.id === visual.accepted!.id)) this.pending.delete(sequence);
    }
  }
  private expire(now: number) { for (const [seq, v] of this.pending) if (now - v.born >= PREDICTED_SHOT_TIMEOUT_MS) this.pending.delete(seq); }
  count(now: number): number { this.expire(now); return this.pending.size; }
  render(authoritative: ProjectileState[], now: number): BulletVisual[] {
    this.expire(now);
    const visuals: BulletVisual[] = authoritative.map(p => {
      const cached = this.confirmed.get(p.id), confirmed = cached && sameShot(cached.state, p) ? cached : undefined, pending = this.pending.get(p.shotSequence);
      const position = confirmed ? confirmedPosition(confirmed, now) : pending && matches(p, pending) ? pendingPosition(pending, now) : p;
      return { id: p.id, x: position.x, y: position.y };
    });
    for (const [seq, v] of this.pending) {
      if (authoritative.some(p => matches(p, v))) continue;
      visuals.push({ id: `predicted:${v.ownerId}:${seq}`, ...pendingPosition(v, now) });
    }
    return visuals;
  }
}
