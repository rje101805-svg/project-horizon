import type { BotDebugState } from './bots';
import type { TractorRequest, TractorResult } from './tractor';
import type { MatchState, StartMatchRequest, StartMatchResult } from './match';
import type { FireRequest, FireResult, ProjectileState } from './projectiles';
import type { ProjectileHit } from './hit-feedback';
import type { CombatDebugRequest, CombatDebugResult, ReloadRequest, ReloadResult } from './combat';
import type { LifeState } from './lifecycle';
import type { BlackHoleState, BlackHoleRegion } from './black-hole';
import type { FlightState, PlayerInput } from './flight';
export interface PlayerState extends FlightState, LifeState { queuedForNextRound?: boolean; bot?: BotDebugState; id: string; name: string; color: number; region: BlackHoleRegion; lastProcessedInput: number; teleportSequence: number }
export interface RoomInfo { match: MatchState; code: string; playerIds: string[]; participantIds?: string[]; queuedIds?: string[]; maxPlayers: number; blackHole: BlackHoleState }
export interface Snapshot { match: MatchState; survivingHumans: number; projectiles: ProjectileState[]; tick: number; timeMs: number; roomCode: string; players: PlayerState[]; blackHole: BlackHoleState }
export type RoomResult = { ok: true; room: RoomInfo; selfId: string } | { ok: false; error: string };
export interface RoomRequest { name: string }
export interface JoinRequest extends RoomRequest { code: string }
export interface ServerEvents {
  projectileHit: (hit: ProjectileHit) => void;
  snapshot: (snapshot: Snapshot) => void;
  roomState: (room: RoomInfo) => void;
}
export interface InputMessage extends PlayerInput { lifeGeneration: number; teleportSequence: number; sequence: number; release?: boolean }
export interface ClientEvents {
  fillGame:(request:{roomCode:string;round:number},reply:(result:StartMatchResult)=>void)=>void;
  tractor:(request:TractorRequest,reply:(result:TractorResult)=>void)=>void;
  startMatch: (request: StartMatchRequest, reply: (result: StartMatchResult) => void) => void;
  reload: (request: ReloadRequest, reply: (result: ReloadResult) => void) => void;
  fire: (request: FireRequest, reply: (result: FireResult) => void) => void;
  combatDebug: (request: CombatDebugRequest, reply: (result: CombatDebugResult) => void) => void;
  latencyProbe: (reply: () => void) => void;
  input: (input: InputMessage) => void;
  resetFlight: (lifeGeneration: number) => void; // Existing Step 2 development flight reset, not gameplay respawn.
  createRoom: (request: RoomRequest, reply: (result: RoomResult) => void) => void;
  joinRoom: (request: JoinRequest, reply: (result: RoomResult) => void) => void;
  leaveRoom: (reply: () => void) => void;
}
