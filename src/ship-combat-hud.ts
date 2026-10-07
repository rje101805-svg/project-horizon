import type Phaser from 'phaser';
import type { PlayerState } from '../shared/protocol';
import { RELOAD_DURATION } from '../shared/combat';
import { combatPresentation, SHIP_BAR_WIDTH, SHIELD_COLOR, HEALTH_COLOR, LOW_HEALTH_COLOR, RELOAD_COLOR } from './combat-presentation';
export class ShipCombatHud {
  readonly graphics: Phaser.GameObjects.Graphics;
  presentation: ReturnType<typeof combatPresentation> | null = null;
  private arrival = 0;
  private alive = false;
  private progress = 0;
  private key = '';
  constructor(scene: Phaser.Scene) { this.graphics = scene.add.graphics().setName('local-combat-bars').setDepth(8).setVisible(false); }
  accept(player: PlayerState, now: number) {
    const next = combatPresentation(player);
    if (!next.reloading || !this.presentation?.reloading) this.progress = 0;
    this.presentation = next; this.arrival = now; this.alive = player.lifeState === 'active';
  }
  render(x: number, y: number, now: number) {
    const s = this.presentation;
    this.graphics.setVisible(this.alive && !!s).setPosition(x - SHIP_BAR_WIDTH / 2, y - 55);
    if (!s || !this.alive) return;
    // Visual interpolation only. Never display completion until a snapshot ends reload.
    this.progress = s.reloading ? Math.max(this.progress, Math.min(.98, s.reloadProgress + Math.max(0, now - this.arrival) / RELOAD_DURATION)) : 0;
    const shield = Math.round(s.shield * (SHIP_BAR_WIDTH - 2)), health = Math.round(s.health * (SHIP_BAR_WIDTH - 2));
    const reload = Math.round(this.progress * (SHIP_BAR_WIDTH - 2));
    const key = `${s.alien}:${shield}:${health}:${s.lowHealth}:${s.reloading}:${reload}`;
    if (key === this.key) return; this.key = key;
    const g = this.graphics.clear(), w = SHIP_BAR_WIDTH;
    const bar = (top: number, height: number, color: number, fill: number) => {
      g.fillStyle(0x080e1e, .95).fillRect(0, top, w, height);
      g.lineStyle(1, color).strokeRect(0, top, w, height);
      if (fill > 0) g.fillStyle(color).fillRect(1, top + 1, fill, height - 2);
    };
    if (!s.alien) bar(10, 6, SHIELD_COLOR, shield); // Outline persists with zero fill.
    bar(19, 6, s.lowHealth ? LOW_HEALTH_COLOR : HEALTH_COLOR, health);
    if (s.reloading) bar(0, 4, RELOAD_COLOR, reload);
  }
  clear() { this.presentation = null; this.alive = false; this.key = ''; this.graphics.clear().setVisible(false); }
}
