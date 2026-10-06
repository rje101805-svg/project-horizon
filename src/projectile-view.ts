import type { Snapshot } from '../shared/protocol';
import type { ProjectileState } from '../shared/projectiles';
import { INTERPOLATION_DELAY_MS } from './interpolation';
// Remote bullets interpolate; local confirmations use bounded present-time visuals.
// Latest authoritative set still governs presence; these positions never drive hits.
export const LOCAL_PROJECTILE_EXTRAPOLATION_MS = 100;
export class ProjectileView {
  private frames: {timeMs:number;tick:number;projectiles:ProjectileState[]}[] = [];
  private arrival = 0;
  private renderTime = -Infinity;
  clear() { this.frames = []; this.renderTime = -Infinity; }
  push(snapshot: Snapshot, now: number) {
    if (this.frames.length && snapshot.tick <= this.frames.at(-1)!.tick) return;
    this.frames.push({ tick: snapshot.tick, timeMs: snapshot.timeMs, projectiles: snapshot.projectiles.map(p => ({ ...p })) });
    if (this.frames.length > 32) this.frames.shift(); this.arrival = now;
  }
  removeOwners(ids: string[]) { const owners = new Set(ids); for (const f of this.frames) f.projectiles = f.projectiles.filter(p => owners.has(p.ownerId)); }
  sample(now: number, selfId = ''): ProjectileState[] {
    const latest = this.frames.at(-1); if (!latest) return [];
    const target = Math.min(latest.timeMs, Math.max(this.renderTime, latest.timeMs + Math.max(0, now - this.arrival) - INTERPOLATION_DELAY_MS));
    this.renderTime = target;
    while (this.frames.length > 2 && this.frames[1].timeMs <= target) this.frames.shift();
    const a = [...this.frames].reverse().find(f => f.timeMs <= target) ?? this.frames[0];
    const b = this.frames.find(f => f.timeMs >= target) ?? latest;
    const t = a === b ? 0 : Math.max(0, Math.min(1, (target - a.timeMs) / (b.timeMs - a.timeMs)));
    return latest.projectiles.map(p => {
      if (p.ownerId === selfId) {
        const seconds = Math.min(LOCAL_PROJECTILE_EXTRAPOLATION_MS, Math.max(0, now - this.arrival)) / 1000;
        return { ...p, x: p.x + p.vx * seconds, y: p.y + p.vy * seconds };
      }
      const from = a.projectiles.find(q => q.id === p.id), to = b.projectiles.find(q => q.id === p.id);
      return from && to ? { ...p, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t } : { ...p };
    });
  }
}
