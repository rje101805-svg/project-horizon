import Phaser from 'phaser';
import './style.css';
import { WORLD, spawnFlight } from '../shared/flight';
import { FlightConnection } from './network';
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const colors: Record<string, number> = { cyan: 0x72eee0, orange: 0xffaa66, purple: 0xb9a0ff };
const planets = [{ x: 650, y: 700, r: 90, color: 0x6095d6, name: 'AZURE' }, { x: 1750, y: 650, r: 115, color: 0xc88066, name: 'EMBER' }, { x: 700, y: 1750, r: 105, color: 0x7caf9a, name: 'VERDANT' }, { x: 1800, y: 1750, r: 85, color: 0x9b8dd0, name: 'ECHO' }];
let game: Phaser.Game | undefined;
class Horizon extends Phaser.Scene {
  private rocket!: Phaser.GameObjects.Container;
  private map!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private connection!: FlightConnection;
  private aim = 0;
  create() {
    const stars = this.add.graphics();
    const random = new Phaser.Math.RandomDataGenerator(['horizon']);
    for (let i = 0; i < 650; i++) stars.fillStyle(0x9fb6dd, random.frac() * .6 + .15).fillCircle(random.between(0, WORLD), random.between(0, WORLD), random.frac() * 1.5 + .5);
    stars.lineStyle(1, 0x1a2a43, .45);
    for (let n = 0; n <= WORLD; n += 200) { stars.lineBetween(n, 0, n, WORLD); stars.lineBetween(0, n, WORLD, n); }
    stars.lineStyle(5, 0x405977).strokeRect(0, 0, WORLD, WORLD);
    for (const p of planets) {
      const g = this.add.graphics();
      g.lineStyle(1, p.color, .2).strokeCircle(p.x, p.y, p.r + 22);
      g.fillStyle(p.color, .15).fillCircle(p.x, p.y, p.r + 9);
      g.fillStyle(p.color).fillCircle(p.x, p.y, p.r);
      g.fillStyle(0x080e1e, .25).fillCircle(p.x + p.r * .35, p.y - p.r * .15, p.r * .8);
      this.add.text(p.x, p.y + p.r + 35, p.name, { fontSize: '12px', color: '#9aacc9', letterSpacing: 3 }).setOrigin(.5);
    }
    const hull = this.add.graphics();
    hull.fillStyle(colors[el<HTMLSelectElement>('rocket').value]).fillTriangle(22, 0, -13, -12, -8, 0).fillTriangle(22, 0, -8, 0, -13, 12);
    hull.fillStyle(0xffffff).fillCircle(2, 0, 4);
    const spawn = spawnFlight();
    this.rocket = this.add.container(spawn.x, spawn.y, [hull]).setDepth(4);
    this.cameras.main.setBounds(0, 0, WORLD, WORLD).startFollow(this.rocket, true, .12, .12);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,R') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE']);
    this.map = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.connection = new FlightConnection(el<HTMLInputElement>('server-url').value,
      (state, tick) => {
        // Rendering only: position/velocity are never integrated in this client.
        this.rocket.setPosition(state.x, state.y).setRotation(state.rotation);
        el('position').textContent = `X ${state.x.toFixed(1)} · Y ${state.y.toFixed(1)}`;
        el('velocity').textContent = `Speed ${Math.hypot(state.vx, state.vy).toFixed(1)}`;
        el('tick').textContent = `Server tick ${tick}`;
        this.drawMap();
      }, status => { el('status').textContent = status; });
    const release = () => { this.input.keyboard!.resetKeys(); this.connection.release(); };
    const visibility = () => { if (document.hidden) release(); };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', visibility);
    const cleanup = () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', visibility);
      this.connection.close();
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      pointer.updateWorldPoint(this.cameras.main);
      this.aim = Math.atan2(pointer.worldY - this.rocket.y, pointer.worldX - this.rocket.x);
    });
    this.drawMap();
    if (import.meta.env.DEV) Object.assign(window, { __HORIZON_FLIGHT__: this.connection });
  }
  resetFlight() { this.aim = 0; this.connection.reset(); }
  update() {
    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) this.resetFlight();
    const right = this.keys.D.isDown || this.keys.RIGHT.isDown;
    const left = this.keys.A.isDown || this.keys.LEFT.isDown;
    const up = this.keys.W.isDown || this.keys.UP.isDown;
    const down = this.keys.S.isDown || this.keys.DOWN.isDown;
    const dx = Number(right) - Number(left), dy = Number(down) - Number(up);
    // Preserve movement-facing flight; moving the mouse also sets aim when idle.
    if (dx || dy) this.aim = Math.atan2(dy, dx);
    this.connection.setInput({ up, down, left, right, boost: this.keys.SHIFT.isDown, aim: this.aim });
  }
  private drawMap() {
    const x = this.scale.width - 164, y = 14, size = 150, s = size / WORLD;
    this.map.clear().fillStyle(0x0e1729, .95).fillRoundedRect(x - 5, y - 5, size + 10, size + 10, 8);
    this.map.lineStyle(1, 0x384c68).strokeRect(x, y, size, size);
    for (const p of planets) this.map.fillStyle(p.color).fillCircle(x + p.x * s, y + p.y * s, p.r * s);
    this.map.fillStyle(0xffffff).fillCircle(x + this.rocket.x * s, y + this.rocket.y * s, 3);
  }
}
function launch() {
  el('position').textContent = 'Awaiting position';
  el('velocity').textContent = 'Speed —';
  el('tick').textContent = 'Server tick —';
  el('status').textContent = 'Connecting to flight server…';
  el('home').hidden = true; el('mission').hidden = false;
  if (game) { game.destroy(true); game = undefined; }
  game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: 1100, height: 600, backgroundColor: '#080e1e', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: Horizon });
  if (import.meta.env.DEV) Object.assign(window, { __HORIZON_GAME__: game });
}
el('play').onclick = () => {
  const field = el<HTMLInputElement>('server-url');
  try {
    const url = new URL(field.value);
    if (!['http:', 'https:'].includes(url.protocol) || (location.protocol === 'https:' && url.protocol !== 'https:')) throw new Error();
    launch();
  } catch { field.setCustomValidity('Enter a server URL (HTTPS is required on GitHub Pages).'); field.reportValidity(); }
};
el<HTMLInputElement>('server-url').oninput = () => el<HTMLInputElement>('server-url').setCustomValidity('');
el<HTMLInputElement>('server-url').value = import.meta.env.VITE_SERVER_URL || (['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:3001' : '');
el('restart').onclick = () => (game?.scene.scenes[0] as Horizon | undefined)?.resetFlight();
el('leave').onclick = () => { game?.destroy(true); game = undefined; el('mission').hidden = true; el('home').hidden = false; };
