import type { FlightState, PlayerInput } from './flight';
export interface PlayerState extends FlightState { id: string }
export interface Snapshot { tick: number; players: PlayerState[] }
export interface ServerEvents { snapshot: (snapshot: Snapshot) => void }
export interface ClientEvents { input: (input: PlayerInput) => void; resetFlight: () => void }
