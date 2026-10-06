// Only instantiated behind import.meta.env.DEV; Vite removes it in production.
export class DebugLag {
  enabled = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private deadlines = { input: 0, snapshot: 0 };
  private delayMs = 150;
  private jitterMs = 30;
  setEnabled(enabled: boolean, delayMs = 150, jitterMs = 30) {
    this.clear(); this.enabled = enabled;
    this.delayMs = Math.max(0, Math.min(500, delayMs));
    this.jitterMs = Math.max(0, Math.min(this.delayMs, jitterMs));
  }
  schedule(direction: 'input' | 'snapshot', action: () => void) {
    if (!this.enabled) { action(); return; }
    const now = performance.now();
    // Preserve transport order despite jitter: no older input can overtake newer input.
    const deadline = Math.max(now + this.delayMs + (Math.random() * 2 - 1) * this.jitterMs, this.deadlines[direction] + 1);
    this.deadlines[direction] = deadline;
    const timer = setTimeout(() => { this.timers.delete(timer); action(); }, deadline - now);
    this.timers.add(timer);
  }
  clear() { for (const timer of this.timers) clearTimeout(timer); this.timers.clear(); this.deadlines = { input: 0, snapshot: 0 }; }
}
