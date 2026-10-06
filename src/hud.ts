import { MAX_SHIELD, MAX_AMMO, clampCombatValue, type CombatState } from '../shared/combat';
import { TICK_RATE } from '../shared/flight';
import { clampHealth, MAX_HEALTH } from '../shared/lifecycle';
import type { PlayerState } from '../shared/protocol';

export function healthPresentation(health: unknown) {
  const value = clampHealth(typeof health === 'number' ? health : NaN);
  return { value, max: MAX_HEALTH, text: `${Math.round(value * 10) / 10} / ${MAX_HEALTH}` };
}
// Counts actual events over elapsed monotonic time; one-second samples smooth
// values without a new timer, requestAnimationFrame loop or monitoring dependency.
export class SampleRate {
  private count = 0;
  private value: number | null = null;
  constructor(private startedAt: number) {}
  record() { this.count++; }
  reset(now: number) { this.startedAt = now; this.count = 0; this.value = null; }
  sample(now: number): number | null {
    const elapsed = now - this.startedAt;
    if (Number.isFinite(elapsed) && elapsed >= 1000) {
      this.value = this.count * 1000 / elapsed;
      this.startedAt = now; this.count = 0;
    }
    return this.value;
  }
}
const write = (node: HTMLElement, text: string) => { if (node.textContent !== text) node.textContent = text; };
export class GameplayHud {
  private frames: SampleRate;
  private snapshots: SampleRate;
  private connected = false;
  private lastRefresh = -Infinity;
  private readonly bar: HTMLProgressElement;
  private readonly overlay: HTMLElement;
  private node(id: string) { return this.document.getElementById(id)!; }
  constructor(private document: Document, now = performance.now()) {
    this.frames = new SampleRate(now); this.snapshots = new SampleRate(now);
    this.bar = this.node('hud-health-bar') as HTMLProgressElement;
    this.bar.max = MAX_HEALTH;
    this.overlay = this.node('debug-overlay');
    this.clearHealth(); this.setPing(null); this.setRoom(0, false, now);
  }
  begin(now = performance.now()) {
    this.frames.reset(now); this.lastRefresh = -Infinity;
    this.overlay.hidden = true; this.clearHealth();
  }
  private clearHealth() {
    this.bar.value = 0; write(this.node('hud-health-value'), `— / ${MAX_HEALTH}`);
    write(this.node('hud-life'), 'Awaiting server');
    write(this.node('hud-shield'), 'SHIELD —'); write(this.node('hud-ammo'), 'AMMO —');
  }
  health(player: Pick<PlayerState, 'health' | 'lifeState'>) {
    const shown = healthPresentation(player.health);
    if (this.bar.value !== shown.value) this.bar.value = shown.value;
    write(this.node('hud-health-value'), shown.text);
    write(this.node('hud-life'), player.lifeState === 'dead' ? 'Dead · respawning' : 'Alive');
  }
  combat(s: CombatState) {
    write(this.node('hud-shield'), `SHIELD ${clampCombatValue(s.shield, MAX_SHIELD)} / ${s.maxShield}`);
    write(this.node('hud-ammo'), `AMMO ${clampCombatValue(s.ammo, MAX_AMMO)} / ${s.maxAmmo}`);
    write(this.node('debug-weapon'), `Blaster · ammo ${s.ammo} / ${s.maxAmmo} · ${s.fireCooldownRemainingMs === 0 ? 'cooldown ready' : 'cooling down'}`);
    write(this.node('debug-combat'), `${s.status} · ${s.controllerType} · kills ${s.kills} · Shield Up ${s.shieldUp ? 'ON' : 'OFF'}`);
    write(this.node('debug-reload'), s.isReloading ? `Reload ${(s.reloadRemainingMs / 1000).toFixed(2)}s · ${Math.round(s.reloadProgress * 100)}%` : 'Reload ready');
    write(this.node('debug-cooldown'), `Cooldown ${s.fireCooldownRemainingMs.toFixed(0)}ms · ${Math.round(s.fireCooldownProgress * 100)}%`);
  }
  setRoom(players: number, connected: boolean, now = performance.now()) {
    if (connected !== this.connected) this.snapshots.reset(now);
    this.connected = connected;
    write(this.node('debug-players'), connected ? `Players: ${players}` : 'Players: —');
    if (!connected) {
      this.setPing(null); this.renderServer(null);
      write(this.node('hud-life'), 'Disconnected · last known health');
    }
  }
  setPing(milliseconds: number | null) {
    write(this.node('ping'), milliseconds !== null && Number.isFinite(milliseconds) && milliseconds >= 0 ? `Ping: ${Math.round(milliseconds)} ms` : 'Ping: —');
  }
  snapshotReceived() { if (this.connected) this.snapshots.record(); }
  toggle() { this.overlay.hidden = !this.overlay.hidden; }
  private renderServer(rate: number | null) {
    write(this.node('debug-server'), `Server: ${TICK_RATE} Hz (recv ${rate === null ? '—' : `${rate.toFixed(1)}/s`})`);
  }
  frame(now = performance.now()) {
    this.frames.record();
    const fps = this.frames.sample(now), receive = this.snapshots.sample(now);
    if (now - this.lastRefresh < 250) return;
    this.lastRefresh = now;
    write(this.node('debug-fps'), fps === null ? 'FPS: —' : `FPS: ${Math.round(fps)}`);
    this.renderServer(this.connected ? receive : null);
  }
}
