import { ALIEN_MELEE_DAMAGE, ALIEN_MELEE_RANGE } from '../shared/alien';
import { applyDamage } from './combat';
import type { FireResult } from '../shared/projectiles';
import type { GameRoom, RoomPlayer } from './rooms';
// Called only after the common socket/lifecycle/sequence validation in fire().
export function melee(room: GameRoom, player: RoomPlayer, sequence: number): FireResult {
  // An accepted attack attempt (including a miss) forfeits protection first.
  player.invulnerableUntilMs = 0; player.state.spawnInvulnerabilityRemainingMs = 0;
  let nearest: RoomPlayer | null = null, distance = ALIEN_MELEE_RANGE;
  for (const target of room.players.values()) {
    if (target === player || target.state.status !== 'ALIVE' || target.state.lifeState !== 'active' || target.state.health <= 0) continue;
    const d = Math.hypot(target.state.x - player.state.x, target.state.y - player.state.y);
    if (d <= distance && (!nearest || d < distance)) {nearest = target; distance = d;}
  }
  const damage = nearest && applyDamage(nearest, ALIEN_MELEE_DAMAGE, {type:'PLAYER',playerId:player.state.id}, player.simulationTimeMs);
  player.state.lastMeleeDamage = damage ? damage.shieldAbsorbed + damage.healthDamage : 0;
  return {ok:true,kind:'melee',sequence,damageApplied:player.state.lastMeleeDamage};
}
