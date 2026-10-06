import type Phaser from 'phaser';
import type { DamageFeedback } from './hit-feedback';
export class DamageNumbers {
  readonly objects = new Map<string, Phaser.GameObjects.Text[]>();
  constructor(private scene: Phaser.Scene) {}
  render(active: DamageFeedback[]) {
    const present = new Set(active.map(v => v.hit.projectileId));
    for (const [id, texts] of this.objects) if (!present.has(id)) { for (const text of texts) text.destroy(); this.objects.delete(id); }
    for (const { hit: h, slot } of active) {
      if (this.objects.has(h.projectileId)) continue;
      const split = h.shieldDamage > 0 && h.healthDamage > 0, y = h.y - 28 - slot * 18;
      const texts: Phaser.GameObjects.Text[] = [];
      const add = (amount: number, color: string, x: number, layer: string) => {
        if (amount <= 0) return;
        texts.push(this.scene.add.text(x, y, `${Math.round(amount * 10) / 10}`, {
          fontFamily: 'Arial', fontSize: '16px', color, stroke: '#080e1e', strokeThickness: 3,
        }).setOrigin(.5).setDepth(9).setName(`hit-${layer}`));
      };
      add(h.shieldDamage, '#65d9ff', h.x - (split ? 17 : 0), 'shield');
      add(h.healthDamage, '#ffffff', h.x + (split ? 17 : 0), 'health');
      this.objects.set(h.projectileId, texts);
    }
  }
  clear() { for (const texts of this.objects.values()) for (const text of texts) text.destroy(); this.objects.clear(); }
}
