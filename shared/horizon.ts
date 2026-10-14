import {WORLD,NORMAL_SPEED,RESPONSE} from './flight';
import {DEFAULT_CAMERA_WIDTH} from './launch';
import type {BlackHoleState} from './black-hole';
export const HORIZON_CONFIG=Object.freeze({calmMs:60000,spawnNoticeMs:2000,planetFadeMs:700,deadlineMs:300000,gravityBand:DEFAULT_CAMERA_WIDTH*.5,gravityMax:NORMAL_SPEED*RESPONSE*.45,coreDepth:240,stages:[{start:60000,end:270000,from:.05,to:.85},{start:270000,end:300000,from:.85,to:1.05}]});
export const MAP_DIAGONAL=Math.hypot(WORLD,WORLD);
export const HORIZON_CORNERS=[{x:0,y:0},{x:WORLD,y:0},{x:WORLD,y:WORLD},{x:0,y:WORLD}] as const;
export interface HorizonState {corner:number;startedAtMs:number;elapsedMs:number;radius:number;nextRadius:number;stage:number;dps:number;eventInMs:number;phase:'calm'|'growing'|'finished'}
export function horizonAt(startedAtMs:number,timeMs:number,corner:number):HorizonState{
 const elapsedMs=Math.max(0,Math.round((timeMs-startedAtMs)*1e6)/1e6),stages=HORIZON_CONFIG.stages;
 if(elapsedMs<HORIZON_CONFIG.calmMs)return {corner,startedAtMs,elapsedMs,radius:0,nextRadius:stages[0].to*MAP_DIAGONAL,stage:0,dps:0,eventInMs:HORIZON_CONFIG.calmMs-elapsedMs,phase:'calm'};
 const i=elapsedMs<270000?0:1,s=stages[i],t=Math.min(1,Math.max(0,(elapsedMs-s.start)/(s.end-s.start)));
 const dps=elapsedMs<150000?10:elapsedMs<210000?15:elapsedMs<270000?25:50;
 return {corner,startedAtMs,elapsedMs,radius:(s.from+(s.to-s.from)*t)*MAP_DIAGONAL,nextRadius:s.to*MAP_DIAGONAL,stage:elapsedMs<150000?1:elapsedMs<210000?2:elapsedMs<270000?3:4,dps,eventInMs:Math.max(0,s.end-elapsedMs),phase:elapsedMs>=HORIZON_CONFIG.deadlineMs?'finished':'growing'};
}
export function horizonHole(h:HorizonState):BlackHoleState{const c=HORIZON_CORNERS[h.corner];return {...c,eventHorizonRadius:h.radius,influenceRadius:h.radius?h.radius+HORIZON_CONFIG.gravityBand:0,horizon:true};}
