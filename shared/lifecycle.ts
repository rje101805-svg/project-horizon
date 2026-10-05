// Step 6 gameplay constants/state; no weapons, lives or match lifecycle.
export const MAX_HEALTH = 100;
export const RESPAWN_DELAY_MS = 3000;
export type DamageSource = 'black-hole';
export interface LifeState {
  health: number;
  lifeState: 'active' | 'dead'; // active means alive; retain the accepted protocol name
  lifeGeneration: number; // increments on respawn: movement/render discontinuity
  deathSequence: number; // increments exactly once per death, not per snapshot
  deathSource: DamageSource | null;
  respawnRemainingMs: number; // server duration, never a wall-clock timestamp
}
export const initialLifeState = (): LifeState => ({
  health: MAX_HEALTH, lifeState: 'active', lifeGeneration: 0,
  deathSequence: 0, deathSource: null, respawnRemainingMs: 0,
});
export const clampHealth = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(MAX_HEALTH, value)) : 0;
