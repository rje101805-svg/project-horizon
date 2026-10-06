import { applyDamage as applyCombatDamage } from './combat';
import { retireInputs } from './inputs';
import { idleInput } from '../shared/flight';
import { RESPAWN_DELAY_MS, type DamageSource } from '../shared/lifecycle';
import type { RoomPlayer } from './rooms';
// Server-only entry point. Returns true only for a NEW death transition.
// Source is a typed server call, never an event exposed to clients.
export function applyDamage(player: RoomPlayer, amount: number, source: DamageSource, simulationTimeMs: number): boolean {
  if (player.state.lifeState === 'dead' || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(simulationTimeMs) || simulationTimeMs < 0) return false;
  const result = applyCombatDamage(player, amount, source);
  if (!result?.depleted || source.type !== 'ENVIRONMENT' || source.cause !== 'BLACK_HOLE') return false;
  player.state.lifeState = 'dead';
  player.state.deathSequence++;
  player.state.teleportSequence++;
  retireInputs(player);
  player.state.deathSource = player.state.lastDamageSource;
  player.state.vx = player.state.vy = 0;
  player.state.respawnRemainingMs = RESPAWN_DELAY_MS;
  player.respawnAtMs = simulationTimeMs + RESPAWN_DELAY_MS;
  player.input = idleInput(); player.lastInput = -Infinity; player.reset = false;
  return true;
}
