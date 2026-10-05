import { applyDamage } from './health';
import { MAX_HEALTH } from '../shared/lifecycle';
import { classifyRegion, crossesHorizon, gravityAt } from '../shared/black-hole';
import { idleInput, INPUT_TIMEOUT_MS, stepFlight } from '../shared/flight';
import { chooseSpawn, type GameRoom, type RoomPlayer } from './rooms';
// Called exactly once by the existing 30Hz loop. No additional clock/physics loop.
export function simulatePlayer(player: RoomPlayer, room: GameRoom, now: number, simulationTimeMs = now) {
  // No stale reference can respawn a player after leave/disconnect.
  if (room.players.get(player.state.id) !== player) return;
  if (player.state.lifeState === 'dead') {
    player.reset = false;
    player.state.respawnRemainingMs = Math.max(0, (player.respawnAtMs ?? simulationTimeMs) - simulationTimeMs);
    if (player.respawnAtMs === null || simulationTimeMs < player.respawnAtMs) return;
    const spawn = chooseSpawn([...room.players.values()].filter(p => p !== player).map(p => p.state), room.blackHole);
    // Retry next tick if no safe spawn exists. Never revive into danger.
    if (!spawn) return;
    Object.assign(player.state, spawn, { health: MAX_HEALTH, lifeState: 'active', region: 'safe',
      lifeGeneration: player.state.lifeGeneration + 1, deathSource: null, respawnRemainingMs: 0 });
    player.respawnAtMs = null;
    player.input = idleInput(); player.lastInput = -Infinity;
    return; // teleport only; no movement integration on the respawn tick
  }
  if (player.reset) {
    const spawn = chooseSpawn([...room.players.values()].filter(p => p !== player).map(p => p.state), room.blackHole);
    if (spawn) Object.assign(player.state, spawn);
    player.input = idleInput(); player.reset = false;
  }
  if (now - player.lastInput > INPUT_TIMEOUT_MS) player.input = { ...idleInput(), aim: player.state.rotation };
  const previous = { x: player.state.x, y: player.state.y };
  stepFlight(player.state, player.input, gravityAt(player.state, room.blackHole));
  if (crossesHorizon(previous, player.state, room.blackHole)) {
    applyDamage(player, MAX_HEALTH, 'black-hole', simulationTimeMs);
    player.state.region = 'lethal';
    return;
  }
  player.state.region = classifyRegion(player.state, room.blackHole);
}
