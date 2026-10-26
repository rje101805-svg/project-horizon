import {dropSurvival} from './survival';
import {initializeInventory,clearInventory,dropRegularInventory,type LootState} from './inventory';
import {resetObjectives,dropGoldGun,removeObjectiveParticipant,type ObjectiveState} from './objectives';
import { initialBotState } from '../shared/bots';
import { clearTractorsFor, type TractorBeam, type TractorLOS } from './tractor';
import { initialMatchState, LOBBY_HOLE, type RoomMode, type MatchState } from '../shared/match';
import { matchSnapshot, roundHumans, evaluateResult, assignHost } from './match';
import type { ServerProjectile } from './projectiles';
import { initialLifeState } from '../shared/lifecycle';
import { createBlackHole, SPAWN_CLEARANCE, type BlackHoleState } from '../shared/black-hole';
import { randomInt, randomUUID } from 'node:crypto';
import { EDGE_MARGIN, idleInput, spawnFlight, WORLD, type PlayerInput } from '../shared/flight';
import { MAX_ROOM_PLAYERS, normalizeRoomCode, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, sanitizeName, SHIP_COLORS, SPAWN_MIN_DISTANCE } from '../shared/rooms';
import type { InputMessage, PlayerState, RoomInfo, RoomResult } from '../shared/protocol';
export interface RoomPlayer {lastCombatMs?:number;dropSurvival?:()=>void; lastSurvivalSequence?:number;nextWallMs?:number;botWallAtMs?:number;incomingDamageTimes?:number[]; botAim?:{target:string|null;readyAt:number;seed:number;error:number;lead:number;nextCorrection:number;life:number;teleport:number}; botLootEnded?:boolean; lastAttackedMs?:number; recentAttackers?:Map<string,number>; botLootTarget?:{id:string;best:number;progressAtMs:number}; botLootBlocked?:Map<string,number>; onEliminated?:(source:import('../shared/lifecycle').DamageSource,timeMs:number)=>void; combatEnabled?:boolean; launchProtectionUntilMs?:number; lastTriggerSequence?:number; recentPickupLife?:string; recentPickups?:Map<string,number>; burnOwnerId?:string; titanTriggerUntilMs?:number; dropRegular?:()=>void; reloadWeaponId?:string; lastInventorySequence?:number; nextSwapMs?:number; lastFireInputMs?:number; dropGold?:()=>void; botInputTick?:number; botInputLife?:number; botInputTeleport?:number; cancelTractor?:()=>void; lastTractorSequence?:number; gameplayEnabled: boolean; humanEliminated: boolean; simulationTimeMs: number; invulnerableUntilMs: number; lastReloadSequence: number; lastFireSequence: number; combatTimers: { reload: number; cooldown: number; reloadCompleted: boolean }; state: PlayerState; input: PlayerInput; lastInput: number; reset: boolean; respawnAtMs: number | null; pendingInputs: { message: InputMessage; receivedAt: number }[]; lastReceivedSequence: number }
export interface GameRoom {pilots?:import('./ai/types').PilotRuntime;walls?:Map<string,import('../shared/survival').ShieldWall>;wallSequence?:number;survivalRound?:number;nextSurvivalSpawnMs?:number; horizon?:import('../shared/horizon').HorizonState; horizonConsumed?:{id:string;name:string;timeMs:number;hp:number}[]; killFeed?:import('../shared/protocol').KillAnnouncement[]; collapseOrigins?:Map<string,{radius:number;angle:number}>; combatEffects?:import('../shared/protocol').CombatEffect[];effectSequence?:number; loot?:LootState; objectives?:ObjectiveState; tractorBeams?:Map<string,TractorBeam>; tractorCooldowns?:Map<string,number>; tractorLOS?:TractorLOS; match: MatchState; simulationTimeMs: number; projectiles: Map<string, ServerProjectile>; projectileSequence: number; code: string; players: Map<string, RoomPlayer>; blackHole: BlackHoleState }
export const activeParticipants = (room:GameRoom) => [...room.players.values()].filter(p=>!p.state.queuedForNextRound);
export function removeBot(room:GameRoom,id:string) {
 const p=room.players.get(id);if(p?.state.controllerType!=='BOT')return;
 p.state.stunRemainingMs=p.state.stunImmunityRemainingMs=0;p.dropSurvival?.();p.dropRegular?.();removeObjectiveParticipant(room,p);clearTractorsFor(room,id);room.tractorCooldowns?.delete(id);
 for(const [key,bullet] of room.projectiles)if(bullet.ownerId===id)room.projectiles.delete(key);
 room.players.delete(id);p.gameplayEnabled=false;p.state.bot=undefined;p.pendingInputs=[];p.input=idleInput();p.lastInput=-Infinity;p.respawnAtMs=null;p.state.respawnRemainingMs=0;p.combatTimers={reload:0,cooldown:0,reloadCompleted:false};p.cancelTractor=undefined;p.botInputTick=p.botInputLife=p.botInputTeleport=undefined;
 for(const other of room.players.values())if(other.state.bot?.target===id){other.state.bot.target=null;other.state.bot.mode='IDLE';}
}
export const roomChannel = (code: string) => `flight:${code}`;
export function generateRoomCode(): string {
  return Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]).join('');
}
export function chooseLobbySpawn(existing:Iterable<Pick<PlayerState,'x'|'y'>>,index=0){
 const players=[...existing];
 const candidates=[240,440,600].flatMap(radius=>Array.from({length:8},(_,n)=>{const angle=(index+n)*Math.PI*2/8;return {x:LOBBY_HOLE.x+Math.cos(angle)*radius,y:LOBBY_HOLE.y+Math.sin(angle)*radius};}));
 const point=candidates.find(candidate=>players.every(p=>Math.hypot(p.x-candidate.x,p.y-candidate.y)>=SPAWN_MIN_DISTANCE));return point?{...spawnFlight(),...point}:null;
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
  const point = candidates.find(p => (hole.horizon||Math.hypot(p.x-hole.x,p.y-hole.y) > hole.influenceRadius + SPAWN_CLEARANCE) &&
    players.every(other => Math.hypot(p.x-other.x,p.y-other.y) >= SPAWN_MIN_DISTANCE));
  return point ? {...spawnFlight(), ...point} : null;
}
export const survivingHumans = (room: GameRoom) => roundHumans(room).length;
export class RoomStore {
  readonly rooms = new Map<string, GameRoom>();
  private pilotSequence=0;
  private membership = new Map<string, string>();
  constructor(private nextCode: () => string = generateRoomCode) {}
  info(room: GameRoom): RoomInfo { return { match: matchSnapshot(room), code: room.code, playerIds: [...room.players.keys()], participantIds:activeParticipants(room).map(p=>p.state.id), queuedIds:[...room.players.values()].filter(p=>p.state.queuedForNextRound).map(p=>p.state.id), maxPlayers: MAX_ROOM_PLAYERS, blackHole: { ...room.blackHole } }; }
  roomFor(id: string): GameRoom | undefined { const code = this.membership.get(id); return code ? this.rooms.get(code) : undefined; }
  create(id: string, name: unknown, now: number, mode:RoomMode='wait'): RoomResult {
    if (this.roomFor(id)) return { ok: false, error: 'Leave your current room before creating another.' };
    for (let attempt = 0; attempt < 64; attempt++) {
      const code = normalizeRoomCode(this.nextCode());
      if (!code || this.rooms.has(code)) continue;
      const room: GameRoom = { match: initialMatchState(mode), simulationTimeMs: 0, code, players: new Map(), blackHole: createBlackHole(), projectiles: new Map(), projectileSequence: 0 };
      resetObjectives(room);
      const result = this.add(room, id, name, now);
      if (result.ok) this.rooms.set(code, room);
      return result;
    }
    return { ok: false, error: 'Could not allocate a room code. Please try again.' };
  }
  join(id: string, rawCode: unknown, name: unknown, now: number): RoomResult {
    const code = normalizeRoomCode(rawCode);
    if (!code) return { ok: false, error: 'Enter a valid 5-character room code.' };
    const current=this.roomFor(id);if(current)return current.code===code?{ok:true,room:this.info(current),selfId:id}:{ok:false,error:'Leave your current room before joining another.'};
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Room not found.' };
    if(room.match.state!=='waiting')return {ok:false,error:'Match in progress.'};
    const participants=activeParticipants(room),bots=participants.filter(p=>p.state.controllerType==='BOT');
    const realCount=[...room.players.values()].filter(p=>p.state.controllerType==='HUMAN').length;
    if(realCount>=MAX_ROOM_PLAYERS || (participants.length>=MAX_ROOM_PLAYERS && !bots.length))return {ok:false,error:'Room full.'};
    const replacement=participants.length>=MAX_ROOM_PLAYERS && room.match.state==='waiting' ? bots.at(-1) : undefined;
    // Reserve the replacement's safe position/color before removing anything.
    const result=this.add(room,id,name,now,replacement?.state.id,participants.length>=MAX_ROOM_PLAYERS && !replacement);
    if(result.ok && replacement){removeBot(room,replacement.state.id);room.match.readyIds=room.match.readyIds.filter(key=>key!==replacement.state.id);result.room=this.info(room);}
    return result;
  }
  private add(room: GameRoom, id: string, name: unknown, now: number, replacing?:string, queued=false): RoomResult {
    const existing=[...room.players.values()].filter(p=>p.state.id!==replacing && !p.state.queuedForNextRound);
    const color = queued ? SHIP_COLORS[0] : SHIP_COLORS.find(c => existing.every(p => p.state.color !== c));
    const spawn = queued ? spawnFlight() : chooseSpawn(existing.map(p => p.state), room.blackHole);
    if (color === undefined || !spawn) return { ok: false, error: 'No safe spawn is available. Please try another room.' };
    room.players.set(id, { combatEnabled:false, gameplayEnabled: room.match.state === 'waiting', humanEliminated: false, simulationTimeMs: 0, invulnerableUntilMs: 0, lastReloadSequence: 0, lastFireSequence: 0, combatTimers: { reload: 0, cooldown: 0, reloadCompleted: false }, state: { queuedForNextRound:queued, id, name: this.pilotName(room,name), color, ...initialLifeState(), reloadSession: randomUUID(), region: 'safe', lastProcessedInput: 0, teleportSequence: 0, ...spawn }, input: idleInput(), lastInput: now, reset: false, respawnAtMs: null, pendingInputs: [], lastReceivedSequence: 0 });
    if (room.match.state !== 'waiting') room.players.get(id)!.state.status = 'OUT';
    const member=room.players.get(id)!;initializeInventory(member);if(member.state.status==='OUT')clearInventory(member);member.dropSurvival=()=>dropSurvival(room,member);member.dropRegular=()=>dropRegularInventory(room,member);member.dropGold=()=>dropGoldGun(room,member);
    room.players.get(id)!.cancelTractor=()=>clearTractorsFor(room,id);
    const point=chooseLobbySpawn(existing.map(p=>p.state),SHIP_COLORS.indexOf(color));
    if(!point){room.players.delete(id);return {ok:false,error:'No safe lobby position available. Try again.'};}
    Object.assign(member.state,point);
    member.onEliminated=(source,timeMs)=>{
      if(room.match.state!=='active')return;
      const killer='playerId' in source?room.players.get(source.playerId)?.state.name??'Unknown pilot':source.cause==='BLACK_HOLE'?'Horizon':'Hazard';
      const text=source.type==='ENVIRONMENT'?`${member.state.name} was lost to ${killer}`:`${killer} eliminated ${member.state.name}`;
      room.killFeed=[...(room.killFeed??[]),{id:`${room.match.round}:${member.state.id}:${member.state.deathSequence}`,timeMs,text}].slice(-6);
    };
    assignHost(room);
    this.membership.set(id, room.code);
    return { ok: true, room: this.info(room), selfId: id };
  }
  fill(room:GameRoom|undefined,senderId:string,raw:unknown) {
    const reject=(message:string)=>({ok:false,message});
    if(!room || this.roomFor(senderId)!==room || room.match.hostId!==senderId || room.players.get(senderId)?.state.controllerType!=='HUMAN')return reject('Only the room host can fill');
    if(!raw || typeof raw!=='object' || Array.isArray(raw) || Object.keys(raw).some(k=>!['roomCode','round'].includes(k)) || (raw as {roomCode:unknown}).roomCode!==room.code || (raw as {round:unknown}).round!==room.match.round)return reject('Invalid or stale fill request');
    if(room.match.state!=='waiting' || room.match.mode!=='fill')return reject('Only private FILL lobbies accept bots');
    let added=0;
    const names=['Viper','Nova','Atlas','Echo','Comet','Orion','Vega'];
    while(activeParticipants(room).length<MAX_ROOM_PLAYERS){
      const id=`bot:${randomUUID()}`,used=new Set([...room.players.values()].map(p=>p.state.name));
      const name=names.find(n=>!used.has(n)) ?? `Bot ${added+1}`;
      const result=this.add(room,id,name,room.simulationTimeMs);if(!result.ok)return reject(result.error);
      this.membership.delete(id); // Bots never own socket membership.
      const p=room.players.get(id)!;p.state.controllerType='BOT';p.state.bot=initialBotState();p.gameplayEnabled=true;room.match.readyIds.push(id);
      added++;
    }
    return {ok:true,message:added ? `Added ${added} bots` : 'Room already full'};
  }
  private pilotName(room:GameRoom,name:unknown){
    const text=typeof name==='string'?name.replace(/[\p{Cc}\p{Cf}]/gu,'').trim():'';
    if(text)return sanitizeName(text);
    for(;;){const candidate=`Pilot_${String(++this.pilotSequence).padStart(2,'0')}`;if(![...this.rooms.values(),room].some(r=>[...r.players.values()].some(p=>p.state.name===candidate)))return candidate;}
  }
  play(id:string,name:unknown,mode:unknown,now:number):RoomResult{
    const current=this.roomFor(id);if(current)return {ok:true,room:this.info(current),selfId:id};
    if(mode!=='fill'&&mode!=='wait')return {ok:false,error:'Choose FILL or WAIT.'};
    if(mode==='wait'){const room=[...this.rooms.values()].find(r=>r.match.mode==='wait'&&r.match.state==='waiting'&&r.players.size<8);if(room)return this.join(id,room.code,name,now);}
    const result=this.create(id,name,now,mode);
    if(result.ok&&mode==='fill'){const room=this.roomFor(id)!;const filled=this.fill(room,id,{roomCode:room.code,round:room.match.round});if(!filled.ok){this.leave(id);return {ok:false,error:filled.message};}result.room=this.info(room);}
    return result;
  }
  leave(id: string): GameRoom | undefined {
    const room = this.roomFor(id);
    this.membership.delete(id);
    if (room) { const departing=room.players.get(id);if(departing){departing.state.stunRemainingMs=departing.state.stunImmunityRemainingMs=0;departing.dropSurvival?.();departing.dropRegular?.();removeObjectiveParticipant(room,departing);}clearTractorsFor(room,id); room.tractorCooldowns?.delete(id); room.players.delete(id);room.match.readyIds=room.match.readyIds.filter(key=>key!==id); assignHost(room); for (const [key, p] of room.projectiles) if (p.ownerId === id) room.projectiles.delete(key); evaluateResult(room, room.simulationTimeMs);if(room.match.mode==='fill'&&room.match.state==='waiting'&&room.match.hostId)this.fill(room,room.match.hostId,{roomCode:room.code,round:room.match.round}); if (![...room.players.values()].some(p=>p.state.controllerType==='HUMAN')) { for(const p of [...room.players.values()])removeBot(room,p.state.id);room.walls?.clear();room.projectiles.clear();room.tractorBeams?.clear();room.tractorCooldowns?.clear();room.loot?.pickups.clear();room.objectives?.pickups.clear();room.combatEffects=[];room.killFeed=[];room.horizon=undefined;room.horizonConsumed=[];room.collapseOrigins=undefined;room.match.launchAngles={};room.match.launchDestinations={};room.match.readyIds=[];this.rooms.delete(room.code); } }
    return room;
  }
}
