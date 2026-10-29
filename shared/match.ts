import {WORLD} from './world';
import {EJECTION_MS,LAUNCH_ORBIT_MS} from './launch';
export const MATCH_RESET_DELAY_MS = 6000;
export type MatchResult = { kind: 'winner'; winnerId: string; winnerName: string; reason?: 'final-collapse' } | { kind: 'draw'; winnerIds?: string[]; reason?: 'final-collapse' } | { kind: 'environment' };
export type RoomMode = 'fill' | 'wait' | 'practice';
export const COUNTDOWN_MS=3000, COLLAPSE_MS=1800, LAUNCH_MS=LAUNCH_ORBIT_MS+EJECTION_MS, LAUNCH_PROTECTION_MS=5000;
export const LOBBY_HOLE={x:WORLD/2,y:WORLD/2,eventHorizonRadius:150,influenceRadius:0};
export const LOBBY_RADIUS=620;
export interface StartMatchRequest { round: number }
export interface StartMatchResult { ok: boolean; message: string }
export interface MatchState {
  hostId: string | null;
  state: 'waiting' | 'countdown' | 'collapse' | 'launch' | 'active' | 'ended';
  mode: RoomMode;
  readyIds: string[];
  phaseStartedAtMs: number;
  phaseRemainingMs: number;
  launchDestinations: Record<string,{x:number;y:number}>;
  launchAngles: Record<string,number>;
  round: number;
  roster: string[];
  result: MatchResult | null;
  endedAtMs: number | null;
  resetRemainingMs: number;
}
export const initialMatchState = (mode:RoomMode='wait'): MatchState => ({mode,readyIds:[],phaseStartedAtMs:0,phaseRemainingMs:0,launchAngles:{},launchDestinations:{},hostId:null, state:'waiting', round:0, roster:[], result:null, endedAtMs:null, resetRemainingMs:0});
