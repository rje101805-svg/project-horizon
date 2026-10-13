import {WORLD,NORMAL_SPEED,RESPONSE} from './flight';
import type {BlackHoleState} from './black-hole';
export const HORIZON_CONFIG=Object.freeze({calmMs:60000,spawnNoticeMs:2000,planetFadeMs:700,deadlineMs:300000,gravityBand:1100,gravityMax:NORMAL_SPEED*RESPONSE*.6,coreDepth:240,stages:[{start:60000,end:110000,from:.10,to:.40,dps:10},{start:130000,end:180000,from:.40,to:.65,dps:15},{start:200000,end:250000,from:.65,to:.85,dps:25},{start:270000,end:300000,from:.85,to:1.05,dps:50}]});
export const MAP_DIAGONAL=Math.hypot(WORLD,WORLD);
export const HORIZON_CORNERS=[{x:0,y:0},{x:WORLD,y:0},{x:WORLD,y:WORLD},{x:0,y:WORLD}] as const;
export interface HorizonState {corner:number;startedAtMs:number;elapsedMs:number;radius:number;nextRadius:number;stage:number;dps:number;eventInMs:number;phase:'calm'|'growing'|'hold'|'finished'}
export function horizonAt(startedAtMs:number,timeMs:number,corner:number):HorizonState{
 const elapsedMs=Math.max(0,Math.round((timeMs-startedAtMs)*1e6)/1e6),stages=HORIZON_CONFIG.stages;
 if(elapsedMs<HORIZON_CONFIG.calmMs)return {corner,startedAtMs,elapsedMs,radius:0,nextRadius:stages[0].to*MAP_DIAGONAL,stage:0,dps:0,eventInMs:HORIZON_CONFIG.calmMs-elapsedMs,phase:'calm'};
 let i=0;while(i<3&&elapsedMs>=stages[i+1].start)i++;
 const s=stages[i],t=Math.min(1,Math.max(0,(elapsedMs-s.start)/(s.end-s.start))),hold=elapsedMs>=s.end;
 return {corner,startedAtMs,elapsedMs,radius:(s.from+(s.to-s.from)*t)*MAP_DIAGONAL,nextRadius:(hold&&i<3?stages[i+1].to:s.to)*MAP_DIAGONAL,stage:i+1,dps:s.dps,eventInMs:Math.max(0,(hold&&i<3?stages[i+1].start:s.end)-elapsedMs),phase:elapsedMs>=HORIZON_CONFIG.deadlineMs?'finished':hold?'hold':'growing'};
}
export function horizonHole(h:HorizonState):BlackHoleState{const c=HORIZON_CORNERS[h.corner];return {...c,eventHorizonRadius:h.radius,influenceRadius:h.radius?h.radius+HORIZON_CONFIG.gravityBand:0,horizon:true};}
