import type { BlackHoleState } from '../shared/black-hole';
import { parseInput, type PlayerInput } from '../shared/flight';
import { stepMovement } from '../shared/movement';
import type { InputMessage, PlayerState } from '../shared/protocol';

export const MAX_PENDING_INPUTS = 90;
export const SNAP_CORRECTION_DISTANCE = 64;
export class LocalPredictor {
  state: PlayerState | null = null;
  pending: InputMessage[] = [];
  sequence = 0;
  acknowledged = 0;
  correction = 0;
  overflow = false;
  private hole: BlackHoleState | null = null;
  private previous: PlayerState | null = null;
  private contact = false;
  private offset = { x: 0, y: 0 };
  clear() {
    this.state = this.previous = null; this.pending = []; this.hole = null;
    this.contact = this.overflow = false; this.offset = { x: 0, y: 0 };
    this.correction = 0;
    // Never reuse a sequence, including across disconnect/rejoin and teleports.
  }
  reconcile(authority: PlayerState, hole: BlackHoleState): boolean {
    const old = this.state;
    const teleport = !old || old.id !== authority.id || old.lifeGeneration !== authority.lifeGeneration ||
      old.lifeState !== authority.lifeState || old.teleportSequence !== authority.teleportSequence;
    this.hole = { ...hole };
    this.acknowledged = authority.lastProcessedInput;
    this.sequence = Math.max(this.sequence, this.acknowledged);
    this.pending = teleport ? [] : this.pending.filter(input => input.sequence > this.acknowledged);
    this.state = { ...authority }; this.contact = false;
    if (authority.lifeState === 'active') for (const input of this.pending) {
      if (!this.contact) this.contact = stepMovement(this.state, input, this.hole);
    }
    this.correction = old ? Math.hypot(old.x - this.state.x, old.y - this.state.y) : 0;
    if (!teleport && old && this.correction < SNAP_CORRECTION_DISTANCE) {
      this.offset.x += old.x - this.state.x; this.offset.y += old.y - this.state.y;
      if (Math.hypot(this.offset.x, this.offset.y) >= SNAP_CORRECTION_DISTANCE) this.offset = { x: 0, y: 0 };
    } else this.offset = { x: 0, y: 0 };
    if (!teleport && old && this.previous && this.correction < SNAP_CORRECTION_DISTANCE) {
      this.previous = { ...this.state, x: this.previous.x + this.state.x - old.x,
        y: this.previous.y + this.state.y - old.y, rotation: this.previous.rotation };
    } else this.previous = { ...this.state };
    if (this.pending.length < MAX_PENDING_INPUTS) this.overflow = false;
    return teleport;
  }
  tick(input: PlayerInput, release = false): InputMessage | null {
    if (!this.state || !this.hole || this.state.lifeState !== 'active') return null;
    if (this.pending.length >= MAX_PENDING_INPUTS) { this.overflow = true; return null; }
    const normalized = parseInput(input);
    if (!normalized) return null;
    const message: InputMessage = { ...normalized, sequence: ++this.sequence,
      lifeGeneration: this.state.lifeGeneration, teleportSequence: this.state.teleportSequence,
      ...(release ? { release: true } : {}) };
    this.pending.push(message);
    this.previous = { ...this.state };
    if (!this.contact) this.contact = stepMovement(this.state, message, this.hole);
    return message;
  }
  render(alpha: number, elapsedMs: number): PlayerState | null {
    if (!this.state) return null;
    const decay = Math.exp(-Math.max(0, elapsedMs) / 80);
    this.offset.x *= decay; this.offset.y *= decay;
    const a = this.previous ?? this.state, t = Math.max(0, Math.min(1, alpha));
    const angle = Math.atan2(Math.sin(this.state.rotation - a.rotation), Math.cos(this.state.rotation - a.rotation));
    return { ...this.state, x: a.x + (this.state.x - a.x) * t + this.offset.x,
      y: a.y + (this.state.y - a.y) * t + this.offset.y, rotation: a.rotation + angle * t };
  }
}
