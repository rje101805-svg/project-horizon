import { applyDamage as applyCombatDamage } from './combat';
import type { DamageSource } from '../shared/lifecycle';
import type { RoomPlayer } from './rooms';
// Historical boolean wrapper; all damage and elimination now share the combat API.
export function applyDamage(player: RoomPlayer, amount: number, source: DamageSource, simulationTimeMs: number): boolean {
  return applyCombatDamage(player, amount, source, simulationTimeMs)?.depleted ?? false;
}
