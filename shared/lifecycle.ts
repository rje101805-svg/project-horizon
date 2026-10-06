// Step 6 gameplay constants/state; no weapons, lives or match lifecycle.
import { MAX_HEALTH, initialCombatState, clampCombatValue, type CombatState, type DamageSource } from './combat';
export { MAX_HEALTH } from './combat';
export type { DamageSource } from './combat';
export const RESPAWN_DELAY_MS = 3000;
export interface LifeState extends CombatState {
  lifeState: 'active' | 'dead'; // active means alive; retain the accepted protocol name
  lifeGeneration: number; // increments on respawn: movement/render discontinuity
  deathSequence: number; // increments exactly once per death, not per snapshot
  deathSource: DamageSource | null;
  respawnRemainingMs: number; // server duration, never a wall-clock timestamp
}
export const initialLifeState = (): LifeState => ({
  ...initialCombatState(), lifeState: 'active', lifeGeneration: 0,
  deathSequence: 0, deathSource: null, respawnRemainingMs: 0,
});
export const clampHealth = (value: number) => clampCombatValue(value, MAX_HEALTH);
