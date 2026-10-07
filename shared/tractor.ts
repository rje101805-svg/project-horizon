import type { FlightState } from './flight';
export const TRACTOR_RANGE = 220;
export const TRACTOR_CONE_ANGLE = Math.PI / 3;
export const TRACTOR_PULL_STRENGTH = 200; // acceleration; terminal drag ~32 < normal thrust 290
export const TRACTOR_KILL_LOCK_MS = 3000;
export const TRACTOR_ATTACKER_MOVEMENT_MULTIPLIER = 0.55;
export const TRACTOR_COOLDOWN_MS = 15000;
export const TRACTOR_MAX_DURATION_MS = 5000;
export interface TractorState { targetId:string|null; attackerId:string|null; cooldownRemainingMs:number; remainingMs:number; lockElapsedMs:number; incomingLockElapsedMs:number; anchorX:number; anchorY:number }
export const initialTractorState = ():TractorState => ({targetId:null,attackerId:null,cooldownRemainingMs:0,remainingMs:0,lockElapsedMs:0,incomingLockElapsedMs:0,anchorX:0,anchorY:0});
export interface TractorRequest { sequence:number; round:number; lifeGeneration:number; teleportSequence:number; reloadSession:string }
export interface TractorResult { ok:boolean; message:string }
export function parseTractor(raw:unknown):TractorRequest|null {
 if(!raw || typeof raw!=='object' || Array.isArray(raw))return null;
 const r=raw as Record<string,unknown>;
 if(Object.keys(r).some(k=>!['sequence','round','lifeGeneration','teleportSequence','reloadSession'].includes(k)) ||
 !['sequence','round','lifeGeneration','teleportSequence'].every(k=>Number.isSafeInteger(r[k]) && (r[k] as number)>=0) || (r.sequence as number)<1 || typeof r.reloadSession!=='string')return null;
 return r as unknown as TractorRequest;
}
export function inTractorCone(attacker:FlightState,target:Pick<FlightState,'x'|'y'>):boolean {
 const dx=target.x-attacker.x,dy=target.y-attacker.y,d=Math.hypot(dx,dy);
 return d<=TRACTOR_RANGE && (d===0 || (dx*Math.cos(attacker.rotation)+dy*Math.sin(attacker.rotation))/d >= Math.cos(TRACTOR_CONE_ANGLE/2)-1e-12);
}
export function tractorAcceleration(state:FlightState & {tractor?:TractorState}) {
 const t=state.tractor;if(!t?.attackerId)return {x:0,y:0};
 const dx=t.anchorX-state.x,dy=t.anchorY-state.y,d=Math.hypot(dx,dy);
 return d ? {x:dx/d*TRACTOR_PULL_STRENGTH,y:dy/d*TRACTOR_PULL_STRENGTH} : {x:0,y:0};
}
