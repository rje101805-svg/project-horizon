import type {MatchState} from '../shared/match';
export const FLASH_MS=250,FLASH_PEAK_MS=150;
// Snapshot timing establishes the synchronized start. Monotonic render time
// finishes the overlay even if the next volatile snapshot is late or missing.
export class CinematicFlash{
 private key='';private started=-Infinity;
 opacity(match:MatchState|undefined,timeMs:number,now:number){
  const key=match?`${match.round}:${match.state}:${match.phaseStartedAtMs}`:'';
  if(key!==this.key){this.key=key;this.started=match?.state==='launch'?now-Math.max(0,timeMs-match.phaseStartedAtMs):-Infinity;}
  if(match?.state!=='launch')return 0;
  const age=Math.max(timeMs-match.phaseStartedAtMs,now-this.started);
  return age<FLASH_PEAK_MS?1:Math.max(0,(FLASH_MS-age)/(FLASH_MS-FLASH_PEAK_MS));
 }
}
