import { initialBotState } from '../shared/bots';
import { clearTractorsFor, type TractorBeam, type TractorLOS } from './tractor';
import { initialMatchState, type MatchState } from '../shared/match';
import { matchSnapshot, roundHumans, evaluateResult, assignHost } from './match';
import type { ServerProjectile } from './projectiles';
import { initialLifeState } from '../shared/lifecycle';
import { createBlackHole, SPAWN_CLEARANCE, type BlackHoleState } from '../shared/black-hole';
import { randomInt, randomUUID } from 'node:crypto';
import { EDGE_MARGIN, idleInput, spawnFlight, WORLD, type PlayerInput } from '../shared/flight';
import { MAX_ROOM_PLAYERS, normalizeRoomCode, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, sanitizeName, SHIP_COLORS, SPAWN_MIN_DISTANCE } from '../shared/rooms';
import type { InputMessage, PlayerState, RoomInfo, RoomResult } from '../shared/protocol';
export interface RoomPlayer { botInputTick?:number; botInputLife?:number; botInputTeleport?:number; cancelTractor?:()=>void; lastTractorSequence?:number; gameplayEnabled: boolean; humanEliminated: boolean; simulationTimeMs: number; invulnerableUntilMs: number; lastReloadSequence: number; lastFireSequence: number; combatTimers: { reload: number; cooldown: number; reloadCompleted: boolean }; state: PlayerState; input: PlayerInput; lastInput: number; reset: boolean; respawnAtMs: number | null; pendingInputs: { message: InputMessage; receivedAt: number }[]; lastReceivedSequence: number }
export interface GameRoom { tractorBeams?:Map<string,TractorBeam>; tractorCooldowns?:Map<string,number>; tractorLOS?:TractorLOS; match: MatchState; simulationTimeMs: number; projectiles: Map<string, ServerProjectile>; projectileSequence: number; code: string; players: Map<string, RoomPlayer>; blackHole: BlackHoleState }
export const activeParticipants = (room:GameRoom) => [...room.players.values()].filter(p=>!p.state.queuedForNextRound);
export function removeBot(room:GameRoom,id:string) {
 const p=room.players.get(id);if(p?.state.controllerType!=='BOT')return;
 clearTractorsFor(room,id);room.tractorCooldowns?.delete(id);
 for(const [key,bullet] of room.projectiles)if(bullet.ownerId===id)room.projectiles.delete(key);
 room.players.delete(id);p.gameplayEnabled=false;p.state.bot=undefined;p.pendingInputs=[];p.input=idleInput();p.lastInput=-Infinity;p.respawnAtMs=null;p.state.respawnRemainingMs=0;p.combatTimers={reload:0,cooldown:0,reloadCompleted:false};p.cancelTractor=undefined;p.botInputTick=p.botInputLife=p.botInputTeleport=undefined;
 for(const other of room.players.values())if(other.state.bot?.target===id){other.state.bot.target=null;other.state.bot.mode='IDLE';}
}
export const roomChannel = (code: string) => `flight:${code}`;
export function generateRoomCode(): string {
  return Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]).join('');
}
export function chooseSpawn(existing: Iterable<Pick<PlayerState, 'x' | 'y'>>, hole = createBlackHole()) {
  const origin = spawnFlight();
  const players = [...existing];
  const candidates: { x: number; y: number }[] = [];
  // Stable grid near the original start; enough alternatives for eight ships.
  for (let row = -5; row <= 5; row++) for (let col = -5; col <= 5; col++) {
    const x = origin.x + col * 200, y = origin.y + row * 200;
    if (x >= EDGE_MARGIN && x <= WORLD - EDGE_MARGIN && y >= EDGE_MARGIN && y <= WORLD - EDGE_MARGIN) if (Math.hypot(x - hole.x, y - hole.y) > hole.influenceRadius + SPAWN_CLEARANCE) candidates.push({ x, y });
  }
  candidates.sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y));
  const point = candidates.find(p => players.every(other => Math.hypot(p.x - other.x, p.y - other.y) >= SPAWN_MIN_DISTANCE));
  // No arbitrary coordinates, and never silently overlap if capacity changes later.
  return point ? { ...origin, ...point } : null;
}
// Random valid edge point; bounded shuffled candidates preserve safe separation.
export function chooseAlienSpawn(existing: Iterable<Pick<PlayerState, 'x' | 'y'>>, hole = createBlackHole()) {
  const players = [...existing], candidates: {x:number;y:number}[] = [];
  for (let coordinate = EDGE_MARGIN; coordinate <= WORLD - EDGE_MARGIN; coordinate += 100) {
    candidates.push({x:EDGE_MARGIN,y:coordinate},{x:WORLD-EDGE_MARGIN,y:coordinate},
      {x:coordinate,y:EDGE_MARGIN},{x:coordinate,y:WORLD-EDGE_MARGIN});
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = randomInt(i + 1); [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const point = candidates.find(p => Math.hypot(p.x-hole.x,p.y-hole.y) > hole.influenceRadius + SPAWN_CLEARANCE &&
    players.every(other => Math.hypot(p.x-other.x,p.y-other.y) >= SPAWN_MIN_DISTANCE));
  return point ? {...spawnFlight(), ...point} : null;
}
export const survivingHumans = (room: GameRoom) => roundHumans(room).length;
export class RoomStore {
  readonly rooms = new Map<string, GameRoom>();
  private membership = new Map<string, string>();
  constructor(private nextCode: () => string = generateRoomCode) {}
  info(room: GameRoom): RoomInfo { return { match: matchSnapshot(room), code: room.code, playerIds: [...room.players.keys()], participantIds:activeParticipants(room).map(p=>p.state.id), queuedIds:[...room.players.values()].filter(p=>p.state.queuedForNextRound).map(p=>p.state.id), maxPlayers: MAX_ROOM_PLAYERS, blackHole: { ...room.blackHole } }; }
  roomFor(id: string): GameRoom | undefined { const code = this.membership.get(id); return code ? this.rooms.get(code) : undefined; }
  create(id: string, name: unknown, now: number): RoomResult {
    if (this.roomFor(id)) return { ok: false, error: 'Leave your current room before creating another.' };
    for (let attempt = 0; attempt < 64; attempt++) {
      const code = normalizeRoomCode(this.nextCode());
      if (!code || this.rooms.has(code)) continue;
      const room: GameRoom = { match: initialMatchState(), simulationTimeMs: 0, code, players: new Map(), blackHole: createBlackHole(), projectiles: new Map(), projectileSequence: 0 };
      const result = this.add(room, id, name, now);
      if (result.ok) this.rooms.set(code, room);
      return result;
    }
    return { ok: false, error: 'Could not allocate a room code. Please try again.' };
  }
  join(id: string, rawCode: unknown, name: unknown, now: number): RoomResult {
    const code = normalizeRoomCode(rawCode);
    if (!code) return { ok: false, error: 'Enter a valid 4-character room code.' };
    if (this.roomFor(id)) return { ok: false, error: 'Leave your current room before joining another.' };
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Room not found. Check the code or ask the host for a new room.' };
    const participants=activeParticipants(room),bots=participants.filter(p=>p.state.controllerType==='BOT');
    const realCount=[...room.players.values()].filter(p=>p.state.controllerType==='HUMAN').length;
    if(realCount>=MAX_ROOM_PLAYERS || (participants.length>=MAX_ROOM_PLAYERS && !bots.length))return {ok:false,error:`This room is full (${MAX_ROOM_PLAYERS} players).`};
    const replacement=participants.length>=MAX_ROOM_PLAYERS && room.match.state==='waiting' ? bots.at(-1) : undefined;
    // Reserve the replacement's safe position/color before removing anything.
    const result=this.add(room,id,name,now,replacement?.state.id,participants.length>=MAX_ROOM_PLAYERS && !replacement);
    if(result.ok && replacement){removeBot(room,replacement.state.id);result.room=this.info(room);}
    return result;
  }
  private add(room: GameRoom, id: string, name: unknown, now: number, replacing?:string, queued=false): RoomResult {
    const existing=[...room.players.values()].filter(p=>p.state.id!==replacing && !p.state.queuedForNextRound);
    const color = queued ? SHIP_COLORS[0] : SHIP_COLORS.find(c => existing.every(p => p.state.color !== c));
    const spawn = queued ? spawnFlight() : chooseSpawn(existing.map(p => p.state), room.blackHole);
    if (color === undefined || !spawn) return { ok: false, error: 'No safe spawn is available. Please try another room.' };
    room.players.set(id, { gameplayEnabled: room.match.state === 'waiting', humanEliminated: false, simulationTimeMs: 0, invulnerableUntilMs: 0, lastReloadSequence: 0, lastFireSequence: 0, combatTimers: { reload: 0, cooldown: 0, reloadCompleted: false }, state: { queuedForNextRound:queued, id, name: sanitizeName(name), color, ...initialLifeState(), reloadSession: randomUUID(), region: 'safe', lastProcessedInput: 0, teleportSequence: 0, ...spawn }, input: idleInput(), lastInput: now, reset: false, respawnAtMs: null, pendingInputs: [], lastReceivedSequence: 0 });
    if (room.match.state !== 'waiting') room.players.get(id)!.state.status = 'OUT';
    room.players.get(id)!.cancelTractor=()=>clearTractorsFor(room,id);
    assignHost(room);
    this.membership.set(id, room.code);
    return { ok: true, room: this.info(room), selfId: id };
  }
  fill(room:GameRoom|undefined,senderId:string,raw:unknown) {
    const reject=(message:string)=>({ok:false,message});
    if(!room || this.roomFor(senderId)!==room || room.match.hostId!==senderId || room.players.get(senderId)?.state.controllerType!=='HUMAN')return reject('Only the room host can fill');
    if(!raw || typeof raw!=='object' || Array.isArray(raw) || Object.keys(raw).some(k=>!['roomCode','round'].includes(k)) || (raw as {roomCode:unknown}).roomCode!==room.code || (raw as {round:unknown}).round!==room.match.round)return reject('Invalid or stale fill request');
    if(room.match.state!=='waiting')return reject('Match is not waiting');
    let added=0;
    const names=['Viper','Nova','Atlas','Echo','Comet','Orion','Vega'];
    while(activeParticipants(room).length<MAX_ROOM_PLAYERS){
      const id=`bot:${randomUUID()}`,used=new Set([...room.players.values()].map(p=>p.state.name));
      const name=names.find(n=>!used.has(n)) ?? `Bot ${added+1}`;
      const result=this.add(room,id,name,room.simulationTimeMs);if(!result.ok)return reject(result.error);
      this.membership.delete(id); // Bots never own socket membership.
      const p=room.players.get(id)!;p.state.controllerType='BOT';p.state.bot=initialBotState();p.gameplayEnabled=false;
      added++;
    }
    return {ok:true,message:added ? `Added ${added} bots` : 'Room already full'};
  }
  leave(id: string): GameRoom | undefined {
    const room = this.roomFor(id);
    this.membership.delete(id);
    if (room) { clearTractorsFor(room,id); room.tractorCooldowns?.delete(id); room.players.delete(id); assignHost(room); for (const [key, p] of room.projectiles) if (p.ownerId === id) room.projectiles.delete(key); evaluateResult(room, room.simulationTimeMs); if (![...room.players.values()].some(p=>p.state.controllerType==='HUMAN')) { for(const p of [...room.players.values()])removeBot(room,p.state.id);room.projectiles.clear();room.tractorBeams?.clear();room.tractorCooldowns?.clear();this.rooms.delete(room.code); } }
    return room;
  }
}
