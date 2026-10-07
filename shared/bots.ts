// Replicated inspection state; the strategy writer and hands live on the server.
export interface BotStrategy { mode: 'IDLE' | 'HUNT'; target: string | null }
export interface BotDebugState extends BotStrategy {
  override: 'TRACTOR_ESCAPE' | null;
  desiredHeading: number; distance: number;
  thrust: boolean; boost: boolean; fire: boolean; reload: boolean; tractor: boolean; melee: boolean;
}
export const initialBotState = (): BotDebugState => ({mode:'IDLE',target:null,override:null,desiredHeading:0,distance:0,thrust:false,boost:false,fire:false,reload:false,tractor:false,melee:false});
