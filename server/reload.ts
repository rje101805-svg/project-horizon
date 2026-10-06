import { parseReload, type ReloadResult } from '../shared/combat';
import { startReload } from './combat';
import type { GameRoom, RoomPlayer } from './rooms';
export function reload(room: GameRoom | undefined, player: RoomPlayer | undefined, raw: unknown): ReloadResult {
  const request = parseReload(raw);
  if (!request || !room || !player || room.players.get(player.state.id) !== player || request.roomCode !== room.code || request.reloadSession !== player.state.reloadSession) return { ok: false, reason: 'Invalid reload request or membership' };
  if (request.sequence <= player.lastReloadSequence) return { ok: false, reason: 'Duplicate or stale reload' };
  player.lastReloadSequence = request.sequence;
  if (request.lifeGeneration !== player.state.lifeGeneration || request.teleportSequence !== player.state.teleportSequence)
    return { ok: false, reason: 'Stale player' };
  return startReload(player) ? { ok: true, reason: 'Reload started' } : { ok: false, reason: 'Reload unavailable' };
}
