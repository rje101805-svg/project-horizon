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
export interface RoomPlayer { cancelTractor?:()=>void; lastTractorSequence?:number; gameplayEnabled: boolean; humanEliminated: boolean; simulationTimeMs: number; invulnerableUntilMs: number; lastReloadSequence: number; lastFireSequence: number; combatTimers: { reload: number; cooldown: number; reloadCompleted: boolean }; state: PlayerState; input: PlayerInput; lastInput: number; reset: boolean; respawnAtMs: number | null; pendingInputs: { message: InputMessage; receivedAt: number }[]; lastReceivedSequence: number }
export interface GameRoom { tractorBeams?:Map<string,TractorBeam>; tractorCooldowns?:Map<string,number>; tractorLOS?:TractorLOS; match: MatchState; simulationTimeMs: number; projectiles: Map<string, ServerProjectile>; projectileSequence: number; code: string; players: Map<string, RoomPlayer>; blackHole: BlackHoleState }
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
  info(room: GameRoom): RoomInfo { return { match: matchSnapshot(room), code: room.code, playerIds: [...room.players.keys()], maxPlayers: MAX_ROOM_PLAYERS, blackHole: { ...room.blackHole } }; }
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
    if (room.players.size >= MAX_ROOM_PLAYERS) return { ok: false, error: `This room is full (${MAX_ROOM_PLAYERS} players).` };
    return this.add(room, id, name, now);
  }
  private add(room: GameRoom, id: string, name: unknown, now: number): RoomResult {
    const color = SHIP_COLORS.find(c => [...room.players.values()].every(p => p.state.color !== c));
    const spawn = chooseSpawn([...room.players.values()].map(p => p.state), room.blackHole);
    if (color === undefined || !spawn) return { ok: false, error: 'No safe spawn is available. Please try another room.' };
    room.players.set(id, { gameplayEnabled: room.match.state === 'waiting', humanEliminated: false, simulationTimeMs: 0, invulnerableUntilMs: 0, lastReloadSequence: 0, lastFireSequence: 0, combatTimers: { reload: 0, cooldown: 0, reloadCompleted: false }, state: { id, name: sanitizeName(name), color, ...initialLifeState(), reloadSession: randomUUID(), region: 'safe', lastProcessedInput: 0, teleportSequence: 0, ...spawn }, input: idleInput(), lastInput: now, reset: false, respawnAtMs: null, pendingInputs: [], lastReceivedSequence: 0 });
    if (room.match.state !== 'waiting') room.players.get(id)!.state.status = 'OUT';
    room.players.get(id)!.cancelTractor=()=>clearTractorsFor(room,id);
    assignHost(room);
    this.membership.set(id, room.code);
    return { ok: true, room: this.info(room), selfId: id };
  }
  leave(id: string): GameRoom | undefined {
    const room = this.roomFor(id);
    this.membership.delete(id);
    if (room) { clearTractorsFor(room,id); room.tractorCooldowns?.delete(id); room.players.delete(id); assignHost(room); for (const [key, p] of room.projectiles) if (p.ownerId === id) room.projectiles.delete(key); evaluateResult(room, room.simulationTimeMs); if (!room.players.size) this.rooms.delete(room.code); }
    return room;
  }
}
