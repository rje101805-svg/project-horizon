import { idleInput } from '../shared/flight';
import { clampHealth, RESPAWN_DELAY_MS, type DamageSource } from '../shared/lifecycle';
import type { RoomPlayer } from './rooms';
// Server-only entry point. Returns true only for a NEW death transition.
// Source is a typed server call, never an event exposed to clients.
export function applyDamage(player: RoomPlayer, amount: number, source: DamageSource, simulationTimeMs: number): boolean {
  if (player.state.lifeState === 'dead' || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(simulationTimeMs) || simulationTimeMs < 0) return false;
  player.state.health = clampHealth(clampHealth(player.state.health) - amount);
  if (player.state.health > 0) return false;
  player.state.lifeState = 'dead';
  player.state.deathSequence++;
  player.state.deathSource = source;
  player.state.vx = player.state.vy = 0;
  player.state.respawnRemainingMs = RESPAWN_DELAY_MS;
  player.respawnAtMs = simulationTimeMs + RESPAWN_DELAY_MS;
  player.input = idleInput(); player.lastInput = -Infinity; player.reset = false;
  return true;
}
