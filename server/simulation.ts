import { classifyRegion, crossesHorizon, gravityAt } from '../shared/black-hole';
import { idleInput, INPUT_TIMEOUT_MS, stepFlight } from '../shared/flight';
import { chooseSpawn, type GameRoom, type RoomPlayer } from './rooms';
// Called exactly once by the existing 30Hz loop. No additional clock/physics loop.
export function simulatePlayer(player: RoomPlayer, room: GameRoom, now: number) {
  if (player.state.lifeState === 'dead') { player.reset = false; return; }
  if (player.reset) {
    const spawn = chooseSpawn([...room.players.values()].filter(p => p !== player).map(p => p.state), room.blackHole);
    if (spawn) Object.assign(player.state, spawn);
    player.input = idleInput(); player.reset = false;
  }
  if (now - player.lastInput > INPUT_TIMEOUT_MS) player.input = { ...idleInput(), aim: player.state.rotation };
  const previous = { x: player.state.x, y: player.state.y };
  stepFlight(player.state, player.input, gravityAt(player.state, room.blackHole));
  if (crossesHorizon(previous, player.state, room.blackHole)) {
    player.state.lifeState = 'dead';
    player.state.region = 'lethal';
    player.state.vx = player.state.vy = 0;
    player.input = idleInput();
    return;
  }
  player.state.region = classifyRegion(player.state, room.blackHole);
}
