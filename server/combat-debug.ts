import { applyDamage, consumeAmmo, startReload, startFireCooldown, refillAmmo } from './combat';
import type { CombatDebugRequest, CombatDebugResult } from '../shared/combat';
import type { RoomPlayer } from './rooms';
export function combatDebugEnabled(flag: boolean | undefined, nodeEnv = process.env.NODE_ENV): boolean {
  return flag === true && nodeEnv !== 'production';
}
export function runCombatDebug(player: RoomPlayer | undefined, raw: CombatDebugRequest, authorized: boolean): CombatDebugResult {
  if (!authorized) return { ok: false, message: 'Combat debug disabled by server' };
  if (!player || player.state.lifeState !== 'active' || !raw || raw.lifeGeneration !== player.state.lifeGeneration ||
      raw.teleportSequence !== player.state.teleportSequence) return { ok: false, message: 'No current active player' };
  let ok = false;
  switch (raw.action) {
    case 'refill': ok = refillAmmo(player); break;
    case 'damage': ok = applyDamage(player, 35, { type: 'ENVIRONMENT', cause: 'HAZARD' }) !== null; break;
    case 'ammo': ok = consumeAmmo(player); break;
    case 'reload': ok = startReload(player); break;
    case 'cooldown': ok = startFireCooldown(player); break;
    default: return { ok: false, message: 'Unknown combat debug action' };
  }
  return { ok, message: ok ? `Combat debug: ${raw.action}` : 'Action unavailable or already in progress' };
}
