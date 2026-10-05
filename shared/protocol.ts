import type { FlightState, PlayerInput } from './flight';
export interface PlayerState extends FlightState { id: string; name: string; color: number }
export interface RoomInfo { code: string; playerIds: string[]; maxPlayers: number }
export interface Snapshot { tick: number; timeMs: number; roomCode: string; players: PlayerState[] }
export type RoomResult = { ok: true; room: RoomInfo; selfId: string } | { ok: false; error: string };
export interface RoomRequest { name: string }
export interface JoinRequest extends RoomRequest { code: string }
export interface ServerEvents {
  snapshot: (snapshot: Snapshot) => void;
  roomState: (room: RoomInfo) => void;
}
export interface ClientEvents {
  latencyProbe: (reply: () => void) => void;
  input: (input: PlayerInput) => void;
  resetFlight: () => void; // Existing Step 2 development flight reset, not gameplay respawn.
  createRoom: (request: RoomRequest, reply: (result: RoomResult) => void) => void;
  joinRoom: (request: JoinRequest, reply: (result: RoomResult) => void) => void;
  leaveRoom: (reply: () => void) => void;
}
