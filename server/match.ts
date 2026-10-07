import { MATCH_RESET_DELAY_MS, type MatchState } from '../shared/match';
import { initialLifeState } from '../shared/lifecycle';
import { idleInput } from '../shared/flight';
import { retireInputs } from './inputs';
import { chooseSpawn, type GameRoom, type RoomPlayer } from './rooms';

export function matchSnapshot(room: GameRoom): MatchState {
  return {...room.match, roster:[...room.match.roster], result:room.match.result ? {...room.match.result} : null};
}
export function roundHumans(room: GameRoom): RoomPlayer[] {
  const ids = room.match.state === 'waiting' ? [...room.players.keys()] : room.match.roster;
  return ids.flatMap(id => {const p=room.players.get(id);return p && p.state.status==='ALIVE' && p.state.lifeState==='active' && p.state.health>0 ? [p] : [];});
}
function freeze(player: RoomPlayer) {
  player.gameplayEnabled = false; retireInputs(player); player.input = idleInput(); player.lastInput = -Infinity;
  player.reset = false; player.state.vx = player.state.vy = 0;
  player.respawnAtMs = null; player.state.respawnRemainingMs = 0;
}
export function evaluateResult(room: GameRoom, timeMs: number) {
  if (room.match.state !== 'active') return;
  const humans = roundHumans(room);
  if (humans.length > 1) return;
  room.match.state = 'ended'; room.match.endedAtMs = timeMs; room.match.resetRemainingMs = MATCH_RESET_DELAY_MS;
  room.match.result = humans.length ? {kind:'winner', winnerId:humans[0].state.id, winnerName:humans[0].state.name} : {kind:'draw'};
  room.projectiles.clear();
  for (const player of room.players.values()) freeze(player);
}
// Reset is a room transaction: validate every spawn before changing any player.
function resetRound(room: GameRoom): boolean {
  const spawns: NonNullable<ReturnType<typeof chooseSpawn>>[] = [];
  for (const _player of room.players.values()) {
    const spawn = chooseSpawn(spawns, room.blackHole); if (!spawn) return false; spawns.push(spawn);
  }
  let i=0;
  for (const player of room.players.values()) {
    const s=player.state, lifeGeneration=s.lifeGeneration+1, teleportSequence=s.teleportSequence+1, deathSequence=s.deathSequence, reloadSession=s.reloadSession;
    retireInputs(player);
    Object.assign(s, initialLifeState(), spawns[i++], {lifeGeneration,teleportSequence,deathSequence,reloadSession,region:'safe'});
    player.simulationTimeMs=room.simulationTimeMs;
    player.humanEliminated=false; player.gameplayEnabled=true; player.invulnerableUntilMs=0;
    player.combatTimers={reload:0,cooldown:0,reloadCompleted:false}; player.respawnAtMs=null;
    player.input=idleInput();player.lastInput=-Infinity;player.reset=false;
    // Keep monotonic command/fire/reload IDs and membership session; new life/teleport
    // markers invalidate all old-round packets, including delayed DEV requests.
  }
  room.projectiles.clear(); room.match.state='waiting';room.match.roster=[];room.match.result=null;
  room.match.endedAtMs=null;room.match.resetRemainingMs=0;
  return true;
}
// Called by the existing fixed simulation clock, never a per-room timeout.
export function advanceMatch(room: GameRoom, timeMs: number): boolean {
  room.simulationTimeMs=timeMs;
  if (room.match.state==='ended') {
    room.match.resetRemainingMs=Math.max(0, MATCH_RESET_DELAY_MS-(timeMs-room.match.endedAtMs!));
    if (room.match.resetRemainingMs>0 || !resetRound(room)) return false;
    startRound(room); return true; // reset is a teleport-only tick
  }
  startRound(room); return false;
}
function startRound(room: GameRoom) {
  if (room.match.state!=='waiting') return;
  const humans=roundHumans(room);
  if (humans.length<2) return;
  room.match.state='active';room.match.round++;room.match.roster=humans.map(p=>p.state.id);
  for (const player of room.players.values()) if (!room.match.roster.includes(player.state.id)) {
    player.state.status='OUT'; freeze(player);
  }
}
