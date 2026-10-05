export const WORLD = 2400;
export const CENTER = WORLD / 2;
export const SUPPLIES_REQUIRED = 5;
export const EXTRACTION_TIME = 60;
export const blackHoleRadius = (seconds: number) => 100 + seconds * 12;
export function applyDamage(health: number, shield: number, amount: number) {
  const absorbed = Math.min(shield, amount);
  return { health: Math.max(0, health - (amount - absorbed)), shield: shield - absorbed };
}
