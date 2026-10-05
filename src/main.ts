import Phaser from 'phaser';
import './style.css';
import { WORLD, CENTER, SUPPLIES_REQUIRED, EXTRACTION_TIME, blackHoleRadius, applyDamage } from './rules';
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const colors: Record<string, number> = { cyan: 0x72eee0, orange: 0xffaa66, purple: 0xb9a0ff };
type Loot = { x: number; y: number; kind: 'supply' | 'shield' | 'repair'; taken: boolean };
const planets = [{ x: 650, y: 700, r: 90, color: 0x6095d6, name: 'AZURE' }, { x: 1750, y: 650, r: 115, color: 0xc88066, name: 'EMBER' }, { x: 700, y: 1750, r: 105, color: 0x7caf9a, name: 'VERDANT' }, { x: 1800, y: 1750, r: 85, color: 0x9b8dd0, name: 'ECHO' }];
let game: Phaser.Game | undefined;
class Horizon extends Phaser.Scene {
  private rocket!: Phaser.GameObjects.Container;
  private ink!: Phaser.GameObjects.Graphics;
  private map!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private loot: Loot[] = [];
  private health = 100; private shield = 0; private supplies = 0; private elapsed = 0;
  private vx = 0; private vy = 0; private ended = false; private messageUntil = 0;
  create() {
    this.health = 100; this.shield = 0; this.supplies = 0; this.elapsed = 0; this.vx = 0; this.vy = 0; this.ended = false; this.messageUntil = 0;
    this.loot = planets.flatMap(p => Array.from({ length: 6 }, (_, i) => ({ x: p.x + Math.cos(i * Math.PI / 3) * (p.r + 65), y: p.y + Math.sin(i * Math.PI / 3) * (p.r + 65), kind: (i < 4 ? 'supply' : i === 4 ? 'shield' : 'repair') as Loot['kind'], taken: false })));
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
    this.ink = this.add.graphics().setDepth(3);
    const hull = this.add.graphics();
    hull.fillStyle(colors[el<HTMLSelectElement>('rocket').value]).fillTriangle(22, 0, -13, -12, -8, 0).fillTriangle(22, 0, -8, 0, -13, 12);
    hull.fillStyle(0xffffff).fillCircle(2, 0, 4);
    this.rocket = this.add.container(CENTER + 170, CENTER, [hull]).setDepth(4);
    this.cameras.main.setBounds(0, 0, WORLD, WORLD).startFollow(this.rocket, true, .12, .12);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,R') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE']);
    this.map = this.add.graphics().setScrollFactor(0).setDepth(10);
    el('results').hidden = true;
    this.status('Launch complete. Follow the minimap to planet supplies.', 5);
  }
  private status(text: string, seconds = 2) { el('status').textContent = text; this.messageUntil = this.elapsed + seconds; }
  update(_time: number, delta: number) {
    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) { this.scene.restart(); return; }
    if (this.ended) return;
    const dt = Math.min(delta / 1000, .05); this.elapsed += dt;
    const dx = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown);
    const dy = Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown);
    const length = Math.hypot(dx, dy) || 1; const speed = this.keys.SHIFT.isDown ? 440 : 290;
    this.vx = Phaser.Math.Linear(this.vx, dx / length * speed, 1 - Math.exp(-7 * dt));
    this.vy = Phaser.Math.Linear(this.vy, dy / length * speed, 1 - Math.exp(-7 * dt));
    this.rocket.x = Phaser.Math.Clamp(this.rocket.x + this.vx * dt, 20, WORLD - 20);
    this.rocket.y = Phaser.Math.Clamp(this.rocket.y + this.vy * dt, 20, WORLD - 20);
    if (dx || dy) this.rocket.rotation = Math.atan2(dy, dx);
    const radius = blackHoleRadius(this.elapsed);
    const danger = Phaser.Math.Distance.Between(this.rocket.x, this.rocket.y, CENTER, CENTER) < radius + 15;
    if (danger) { const result = applyDamage(this.health, this.shield, 30 * dt); this.health = result.health; this.shield = result.shield; }
    this.ink.clear();
    this.ink.lineStyle(3, 0xb08aff, .15).strokeCircle(CENTER, CENTER, radius + 25);
    this.ink.fillStyle(0x6c3c9a, .25).fillCircle(CENTER, CENTER, radius + 12);
    this.ink.fillStyle(0x02030a).fillCircle(CENTER, CENTER, radius);
    this.ink.lineStyle(3, 0xb78bf5, .8).strokeCircle(CENTER, CENTER, radius);
    for (const item of this.loot) {
      if (item.taken) continue;
      if (Phaser.Math.Distance.Between(item.x, item.y, CENTER, CENTER) < radius) { item.taken = true; continue; }
      if (Phaser.Math.Distance.Between(item.x, item.y, this.rocket.x, this.rocket.y) < 32) {
        item.taken = true;
        if (item.kind === 'supply') { this.supplies++; this.status('Supply secured. Keep moving.'); }
        if (item.kind === 'shield') { this.shield = Math.min(100, this.shield + 40); this.status('Shield charged +40'); }
        if (item.kind === 'repair') { this.health = Math.min(100, this.health + 30); this.status('Hull repaired +30'); }
        continue;
      }
      const color = item.kind === 'supply' ? 0xffd178 : item.kind === 'shield' ? 0x72eee0 : 0xff8597;
      this.ink.lineStyle(1, color, .3).strokeCircle(item.x, item.y, 16);
      this.ink.fillStyle(color).fillRect(item.x - 6, item.y - 6, 12, 12);
    }
    const open = this.elapsed >= EXTRACTION_TIME;
    this.ink.lineStyle(3, open ? 0x72eee0 : 0x52647f).strokeCircle(2220, 220, 48);
    this.ink.lineBetween(2190, 220, 2250, 220).lineBetween(2220, 190, 2220, 250);
    this.drawMap(radius, open);
    el<HTMLMeterElement>('health').value = this.health; el<HTMLMeterElement>('shield').value = this.shield;
    el('health-value').textContent = String(Math.ceil(this.health)); el('shield-value').textContent = String(Math.ceil(this.shield));
    el('inventory').textContent = `Supplies ${this.supplies} / ${SUPPLIES_REQUIRED} · Weapon: none`;
    el('timer').textContent = `${Math.floor(this.elapsed / 60).toString().padStart(2, '0')}:${Math.floor(this.elapsed % 60).toString().padStart(2, '0')}`;
    if (this.elapsed > this.messageUntil) el('status').textContent = danger ? 'WARNING: inside the black hole! Boost away.' : open ? 'Beacon open in the northeast. Bring 5 supplies to extract.' : `Collect yellow supplies · cyan shield · pink repair. Beacon opens in ${Math.ceil(EXTRACTION_TIME - this.elapsed)}s.`;
    if (this.health <= 0) this.finish(false);
    else if (open && this.supplies >= SUPPLIES_REQUIRED && Phaser.Math.Distance.Between(this.rocket.x, this.rocket.y, 2220, 220) < 58) this.finish(true);
  }
  private drawMap(radius: number, open: boolean) {
    const x = this.scale.width - 164, y = 14, size = 150, s = size / WORLD;
    this.map.clear().fillStyle(0x0e1729, .95).fillRoundedRect(x - 5, y - 5, size + 10, size + 10, 8);
    this.map.lineStyle(1, 0x384c68).strokeRect(x, y, size, size);
    for (const p of planets) this.map.fillStyle(p.color).fillCircle(x + p.x * s, y + p.y * s, p.r * s);
    this.map.fillStyle(0x070510).fillCircle(x + CENTER * s, y + CENTER * s, radius * s);
    this.map.lineStyle(1, 0xb78bf5).strokeCircle(x + CENTER * s, y + CENTER * s, radius * s);
    this.map.fillStyle(open ? 0x72eee0 : 0x52647f).fillRect(x + 2220 * s - 3, y + 220 * s - 3, 6, 6);
    this.map.fillStyle(0xffffff).fillCircle(x + this.rocket.x * s, y + this.rocket.y * s, 3);
  }
  private finish(won: boolean) {
    this.ended = true;
    this.scene.pause();
    el('mission').hidden = true; el('results').hidden = false;
    el('result-title').textContent = won ? 'You escaped.' : 'Lost to the void.';
    el('result-detail').textContent = `${el<HTMLSelectElement>('pilot').value} · Survived ${Math.floor(this.elapsed)} seconds · Supplies ${this.supplies}. ${won ? 'Solo mission successful.' : 'Collect shields and boost beyond the expanding ring.'} Placement and eliminations arrive with multiplayer.`;
  }
}
function launch() {
  el('home').hidden = true; el('results').hidden = true; el('mission').hidden = false;
  if (game) { game.destroy(true); game = undefined; }
  game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: 1100, height: 600, backgroundColor: '#080e1e', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: Horizon });
  if (import.meta.env.DEV) Object.assign(window, { __HORIZON_GAME__: game });
}
el('play').onclick = launch; el('again').onclick = launch;
el('restart').onclick = () => game?.scene.scenes[0].scene.restart();
el('home-button').onclick = () => { game?.destroy(true); game = undefined; el('results').hidden = true; el('mission').hidden = true; el('home').hidden = false; };
