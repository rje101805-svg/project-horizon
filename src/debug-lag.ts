// Only instantiated behind import.meta.env.DEV; Vite removes it in production.
export class DebugLag {
  enabled = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private deadlines = { input: 0, snapshot: 0 };
  setEnabled(enabled: boolean) { this.clear(); this.enabled = enabled; }
  schedule(direction: 'input' | 'snapshot', action: () => void) {
    if (!this.enabled) { action(); return; }
    const now = performance.now();
    // Preserve transport order despite jitter: no older input can overtake newer input.
    const deadline = Math.max(now + 100 + (Math.random() * 60 - 30), this.deadlines[direction] + 1);
    this.deadlines[direction] = deadline;
    const timer = setTimeout(() => { this.timers.delete(timer); action(); }, deadline - now);
    this.timers.add(timer);
  }
  clear() { for (const timer of this.timers) clearTimeout(timer); this.timers.clear(); this.deadlines = { input: 0, snapshot: 0 }; }
}
