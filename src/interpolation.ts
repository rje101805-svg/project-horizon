import { TICK_MS } from '../shared/flight';
import type { PlayerState, Snapshot } from '../shared/protocol';
export const INTERPOLATION_DELAY_MS = 100; // three ticks, remote ships only
const MAX_BUFFERED_SNAPSHOTS = 32;
export class RemoteInterpolator {
  private frames: Snapshot[] = [];
  private anchorTime = 0;
  private anchorArrival = 0;
  private lastRenderTime = -Infinity;
  clear() { this.frames = []; this.lastRenderTime = -Infinity; }
  push(snapshot: Snapshot, arrivalMs: number) {
    if (this.frames.length && snapshot.tick <= this.frames[this.frames.length - 1].tick) return;
    this.frames.push({ ...snapshot, players: snapshot.players.map(p => ({ ...p })) });
    if (this.frames.length > MAX_BUFFERED_SNAPSHOTS) this.frames.shift();
    this.anchorTime = snapshot.timeMs; this.anchorArrival = arrivalMs;
  }
  sample(nowMs: number, selfId: string): PlayerState[] {
    if (!this.frames.length) return [];
    const latest = this.frames[this.frames.length - 1];
    // Estimate server time from the latest received tick. Never run backward or
    // past the latest authoritative frame (no extrapolation when packets stop).
    const target = Math.min(latest.timeMs, Math.max(this.lastRenderTime,
      this.anchorTime + Math.max(0, nowMs - this.anchorArrival) - INTERPOLATION_DELAY_MS));
    this.lastRenderTime = target;
    while (this.frames.length > 2 && this.frames[1].timeMs <= target) this.frames.shift();
    const before = [...this.frames].reverse().find(f => f.timeMs <= target) ?? this.frames[0];
    const after = this.frames.find(f => f.timeMs >= target) ?? latest;
    const fraction = before === after ? 0 : Math.max(0, Math.min(1, (target - before.timeMs) / Math.max(TICK_MS / 100, after.timeMs - before.timeMs)));
    // The newest roster controls presence immediately, even while visuals lag.
    return latest.players.filter(p => p.id !== selfId).map(player => {
      const a = before.players.find(p => p.id === player.id);
      const b = after.players.find(p => p.id === player.id);
      if (!a || !b) return { ...player }; // new arrival, no earlier sample
      const angle = Math.atan2(Math.sin(b.rotation - a.rotation), Math.cos(b.rotation - a.rotation));
      return { ...player, x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction,
        rotation: a.rotation + angle * fraction };
    });
  }
  removeMissing(ids: string[]) {
    const active = new Set(ids);
    for (const frame of this.frames) frame.players = frame.players.filter(p => active.has(p.id));
  }
}
