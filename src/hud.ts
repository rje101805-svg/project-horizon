import { ALIEN_MELEE_DAMAGE, ALIEN_MELEE_RANGE } from '../shared/alien';
import { combatPresentation } from './combat-presentation';
import { MAX_SHIELD, MAX_AMMO, clampCombatValue, type CombatState } from '../shared/combat';
import { TICK_RATE } from '../shared/flight';
import { MAX_HEALTH } from '../shared/lifecycle';
import type { PlayerState } from '../shared/protocol';

export function healthPresentation(health: unknown, max = MAX_HEALTH) {
  const value = clampCombatValue(typeof health === 'number' ? health : NaN, max);
  return { value, max, text: `${Math.round(value * 10) / 10} / ${max}` };
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
  private lastStatus: CombatState['status'] | null = null;
  private alienMessageUntil = 0;
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
    this.lastStatus = null; this.alienMessageUntil = 0; this.node('alien-message').hidden = true; this.node('hud-alien').hidden = true; this.node('hud-ammo').hidden = false; write(this.node('humans-remaining'), 'Humans alive: —');
    this.bar.value = 0; write(this.node('hud-health-value'), `— / ${MAX_HEALTH}`);
    write(this.node('hud-life'), 'Awaiting server');
    write(this.node('hud-shield'), 'SHIELD —'); write(this.node('hud-ammo'), 'AMMO —'); this.node('ammo-hud').classList.remove('low-ammo', 'reloading'); this.node('ammo-hud').dataset.state = 'awaiting'; write(this.node('hud-reload'), '');
  }
  health(player: Pick<PlayerState, 'health' | 'lifeState'> & Partial<Pick<PlayerState, 'maxHealth'>>) {
    const shown = healthPresentation(player.health, player.maxHealth ?? MAX_HEALTH);
    if (this.bar.max !== shown.max) this.bar.max = shown.max;
    if (this.bar.value !== shown.value) this.bar.value = shown.value;
    write(this.node('hud-health-value'), shown.text);
    write(this.node('hud-life'), player.lifeState === 'dead' ? 'Dead · respawning' : 'Alive');
  }
  combat(s: CombatState) {
    const alien = s.status === 'ALIEN';
    if (!alien) { this.alienMessageUntil = 0; this.node('alien-message').hidden = true; }
    if (alien && this.lastStatus === 'ALIVE') { this.alienMessageUntil = performance.now() + 6000; this.node('alien-message').hidden = false; }
    this.lastStatus = s.status;
    const alienHud = this.node('hud-alien'), humanAmmo = this.node('hud-ammo');
    if (alienHud.hidden !== !alien) alienHud.hidden = !alien;
    if (humanAmmo.hidden !== alien) humanAmmo.hidden = alien;
    write(this.node('hud-alien'), `ALIEN · HP ${s.health} / ${s.maxHealth}`);
    const shown = combatPresentation(s), ammoHud = this.node('ammo-hud');
    ammoHud.classList.toggle('low-ammo', shown.lowAmmo);
    ammoHud.classList.toggle('reloading', shown.reloading);
    const state = alien ? 'alien' : shown.reloading ? 'reloading' : shown.lowAmmo ? 'low' : 'ready';
    if (ammoHud.dataset.state !== state) ammoHud.dataset.state = state;
    write(this.node('hud-shield'), alien ? 'Shield unavailable · ALIEN' : `SHIELD ${clampCombatValue(s.shield, MAX_SHIELD)} / ${s.maxShield}`);
    write(this.node('hud-ammo'), alien ? '' : `AMMO ${clampCombatValue(s.ammo, MAX_AMMO)} / ${s.maxAmmo}`);
    write(this.node('hud-reload'), !alien && s.isReloading ? 'RELOADING' : '');
    write(this.node('debug-weapon'), alien ? `Alien melee · range ${ALIEN_MELEE_RANGE} · damage ${ALIEN_MELEE_DAMAGE} · last applied ${s.lastMeleeDamage} · protection ${s.spawnInvulnerabilityRemainingMs.toFixed(0)}ms` : `Blaster · ammo ${s.ammo} / ${s.maxAmmo} · ${s.fireCooldownRemainingMs === 0 ? 'cooldown ready' : 'cooling down'}`);
    write(this.node('debug-combat'), `${s.status} · ${s.controllerType} · kills ${s.kills}`);
    write(this.node('debug-reload'), alien ? 'Human reload unavailable · ALIEN' : s.isReloading ? `Reload ${(s.reloadRemainingMs / 1000).toFixed(2)}s · ${Math.round(s.reloadProgress * 100)}%` : 'Reload ready');
    write(this.node('debug-cooldown'), alien ? 'Alien melee · no cooldown' : `Cooldown ${s.fireCooldownRemainingMs.toFixed(0)}ms · ${Math.round(s.fireCooldownProgress * 100)}%`);
  }
  humans(count: number) { write(this.node('humans-remaining'), `Humans alive: ${count}`); }
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
    if (this.alienMessageUntil && now >= this.alienMessageUntil) { this.node('alien-message').hidden = true; this.alienMessageUntil = 0; }
    this.frames.record();
    const fps = this.frames.sample(now), receive = this.snapshots.sample(now);
    if (now - this.lastRefresh < 250) return;
    this.lastRefresh = now;
    write(this.node('debug-fps'), fps === null ? 'FPS: —' : `FPS: ${Math.round(fps)}`);
    this.renderServer(this.connected ? receive : null);
  }
}
