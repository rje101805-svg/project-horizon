import { initialTractorState, inTractorCone, parseTractor, TRACTOR_CAPTURE_DISTANCE, TRACTOR_COOLDOWN_MS, TRACTOR_MAX_DURATION_MS, type TractorResult } from '../shared/tractor';
import { eliminate } from './combat';
import type { GameRoom, RoomPlayer } from './rooms';
export interface TractorBeam { attackerId:string; targetId:string; round:number; startedAtMs:number; attackerLife:number; attackerTeleport:number; targetLife:number; targetTeleport:number }
// Phase 3 obstacles can provide this server-only hook. Current map has no LOS obstacles.
export type TractorLOS = (attacker:Readonly<RoomPlayer['state']>,target:Readonly<RoomPlayer['state']>)=>boolean;
export const clearTractorLOS:TractorLOS=()=>true;
function human(room:GameRoom,p:RoomPlayer|undefined):p is RoomPlayer {
 return !!p && room.match.state==='active' && room.match.roster.includes(p.state.id) && p.gameplayEnabled && !p.humanEliminated && p.state.status==='ALIVE' && p.state.controllerType==='HUMAN' && p.state.lifeState==='active' && p.state.health>0;
}
export function clearBeam(room:GameRoom,id:string) {
 const beam=room.tractorBeams?.get(id);if(!beam)return;
 const a=room.players.get(id),b=room.players.get(beam.targetId);
 if(a)a.state.tractor={...a.state.tractor,targetId:null,remainingMs:0};
 if(b?.state.tractor.attackerId===id)b.state.tractor={...b.state.tractor,attackerId:null,anchorX:0,anchorY:0};
 room.tractorBeams!.delete(id);
}
export function clearTractorsFor(room:GameRoom,id:string) {
 for(const [key,b] of room.tractorBeams??[])if(key===id || b.targetId===id)clearBeam(room,key);
}
export function clearAllTractors(room:GameRoom,reset=false) {
 for(const id of room.tractorBeams?.keys()??[])clearBeam(room,id);
 if(reset){room.tractorCooldowns?.clear();for(const p of room.players.values())p.state.tractor=initialTractorState();}
}
export function activateTractor(room:GameRoom|undefined,p:RoomPlayer|undefined,raw:unknown):TractorResult {
 const reject=(message:string):TractorResult=>({ok:false,message}),r=parseTractor(raw);
 if(!r || !room || !p || room.players.get(p.state.id)!==p)return reject('Invalid tractor request');
 if(r.reloadSession!==p.state.reloadSession || r.round!==room.match.round || r.lifeGeneration!==p.state.lifeGeneration || r.teleportSequence!==p.state.teleportSequence || r.sequence<=(p.lastTractorSequence??0))return reject('Stale tractor request');
 p.lastTractorSequence=r.sequence;
 if(!human(room,p) || room.tractorBeams?.has(p.state.id) || (room.tractorCooldowns?.get(p.state.id)??0)>room.simulationTimeMs)return reject('Tractor unavailable');
 const los=room.tractorLOS??clearTractorLOS;
 const targets=[...room.players.values()].filter(t=>t!==p && human(room,t) && !t.state.tractor.attackerId && inTractorCone(p.state,t.state) && los(p.state,t.state));
 targets.sort((a,b)=>Math.hypot(a.state.x-p.state.x,a.state.y-p.state.y)-Math.hypot(b.state.x-p.state.x,b.state.y-p.state.y));
 const target=targets[0];if(!target)return reject('No human in tractor cone');
 const beam:TractorBeam={attackerId:p.state.id,targetId:target.state.id,round:room.match.round,startedAtMs:room.simulationTimeMs,attackerLife:p.state.lifeGeneration,attackerTeleport:p.state.teleportSequence,targetLife:target.state.lifeGeneration,targetTeleport:target.state.teleportSequence};
 (room.tractorBeams??=new Map()).set(p.state.id,beam);(room.tractorCooldowns??=new Map()).set(p.state.id,room.simulationTimeMs+TRACTOR_COOLDOWN_MS);
 p.state.tractor={...p.state.tractor,targetId:target.state.id,cooldownRemainingMs:TRACTOR_COOLDOWN_MS,remainingMs:TRACTOR_MAX_DURATION_MS};
 target.state.tractor={...target.state.tractor,attackerId:p.state.id,anchorX:p.state.x,anchorY:p.state.y};
 return {ok:true,message:'Tractor active'};
}
// Run before movement to provide a coherent force snapshot and after the damage
// batch to validate escape/capture before the existing winner/draw evaluator.
export function advanceTractors(room:GameRoom,timeMs:number,capture=false) {
 for(const p of room.players.values())p.state.tractor={...p.state.tractor,cooldownRemainingMs:Math.max(0,(room.tractorCooldowns?.get(p.state.id)??0)-timeMs)};
 for(const [id,beam] of room.tractorBeams??[]) {
  const a=room.players.get(id),b=room.players.get(beam.targetId);
  if(!human(room,a)||!human(room,b)||beam.round!==room.match.round||a.state.lifeGeneration!==beam.attackerLife||a.state.teleportSequence!==beam.attackerTeleport||b.state.lifeGeneration!==beam.targetLife||b.state.teleportSequence!==beam.targetTeleport||timeMs-beam.startedAtMs>=TRACTOR_MAX_DURATION_MS||!inTractorCone(a.state,b.state)||!(room.tractorLOS??clearTractorLOS)(a.state,b.state)){clearBeam(room,id);continue;}
  a.state.tractor={...a.state.tractor,remainingMs:Math.max(0,TRACTOR_MAX_DURATION_MS-(timeMs-beam.startedAtMs))};
  b.state.tractor={...b.state.tractor,anchorX:a.state.x,anchorY:a.state.y};
  if(capture && Math.hypot(a.state.x-b.state.x,a.state.y-b.state.y)<=TRACTOR_CAPTURE_DISTANCE){eliminate(b,{type:'TRACTOR',playerId:id},timeMs);clearBeam(room,id);}
 }
}
