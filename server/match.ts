import { MATCH_RESET_DELAY_MS, type MatchState, type StartMatchResult } from '../shared/match';
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
    return true; // reset is a teleport-only tick
  }
  return false;
}
export function startMatch(room: GameRoom | undefined, senderId: string, raw: unknown): StartMatchResult {
  const reject = (message: string): StartMatchResult => ({ok:false,message});
  if (!room || !room.players.has(senderId) || room.match.hostId !== senderId) return reject('Only the room host can start');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k=>k!=='round') ||
      !Number.isSafeInteger((raw as {round?:unknown}).round) || (raw as {round:number}).round !== room.match.round) return reject('Invalid or stale start request');
  if (room.match.state!=='waiting') return reject('Match is not waiting');
  const humans=roundHumans(room);
  if (humans.length<2) return reject('At least 2 eligible humans are required');
  room.match.state='active';room.match.round++;room.match.roster=humans.map(p=>p.state.id);
  for (const player of room.players.values()) if (!room.match.roster.includes(player.state.id)) {
    player.state.status='OUT'; freeze(player);
  }
  return {ok:true,message:'Match started'};
}
// Keep the current connected host; otherwise prefer surviving humans, then a
// connected future-round member. Map insertion order makes reassignment stable.
export function assignHost(room: GameRoom) {
  if (room.match.hostId && room.players.has(room.match.hostId)) return;
  room.match.hostId = roundHumans(room)[0]?.state.id ?? room.players.keys().next().value ?? null;
}
