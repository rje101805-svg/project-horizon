export const MATCH_RESET_DELAY_MS = 6000;
export type MatchResult = { kind: 'winner'; winnerId: string; winnerName: string } | { kind: 'draw' };
export interface MatchState {
  state: 'waiting' | 'active' | 'ended';
  round: number;
  roster: string[];
  result: MatchResult | null;
  endedAtMs: number | null;
  resetRemainingMs: number;
}
export const initialMatchState = (): MatchState => ({state:'waiting', round:0, roster:[], result:null, endedAtMs:null, resetRemainingMs:0});
