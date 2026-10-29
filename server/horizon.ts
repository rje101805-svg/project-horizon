import {randomInt} from 'node:crypto';
import {HORIZON_CONFIG,horizonAt,horizonHole} from '../shared/horizon';
import {TICK_MS} from '../shared/flight';
import {applyDamage} from './combat';
import {objectiveState,consumePlanet} from './objectives';
import {lootState} from './inventory';
import {finishMatch,roundHumans} from './match';
import type {GameRoom} from './rooms';
export function beginHorizon(room:GameRoom,rng=()=>randomInt(4)/4){room.horizon=horizonAt(room.simulationTimeMs,room.simulationTimeMs,Math.min(3,Math.floor(rng()*4)));room.horizonConsumed=[];room.finalCollapseEligible=undefined;room.blackHole=horizonHole(room.horizon);}
export function updateHorizon(room:GameRoom){if(room.match.state!=='active'||!room.horizon)return;room.horizon=horizonAt(room.horizon.startedAtMs,room.simulationTimeMs,room.horizon.corner);room.blackHole=horizonHole(room.horizon);}
// Lock eligibility before the tick's combat/movement, not after consumption.
export function lockFinalCollapse(room:GameRoom){
 if(room.match.state==='active'&&room.horizon?.stage===4&&room.finalCollapseEligible===undefined)room.finalCollapseEligible=roundHumans(room).map(p=>p.state.id);
}
export function advanceHorizon(room:GameRoom){
 const h=room.horizon;if(room.match.state!=='active'||!h||h.phase==='calm')return;
 lockFinalCollapse(room);
 if(room.finalCollapseEligible?.length===0){finishMatch(room,{kind:'environment'},room.simulationTimeMs);return;}
 const deadline=h.elapsedMs>=HORIZON_CONFIG.deadlineMs,inside=(p:{x:number;y:number})=>Math.hypot(p.x-room.blackHole.x,p.y-room.blackHole.y)<=h.radius;
 const consumed=room.horizonConsumed??=[];
 for(const p of roundHumans(room)){
  const distance=Math.hypot(p.state.x-room.blackHole.x,p.state.y-room.blackHole.y),hp=p.state.health+p.state.shield;
  if(!deadline&&!inside(p.state))continue;
  applyDamage(p,deadline||distance<=h.radius-HORIZON_CONFIG.coreDepth?hp:h.dps*TICK_MS/1000,{type:'ENVIRONMENT',cause:'BLACK_HOLE'},room.simulationTimeMs,true);
  if(p.state.status!=='ALIVE')consumed.push({id:p.state.id,name:p.state.name,timeMs:room.simulationTimeMs,hp});
 }
 for(const record of objectiveState(room).planets)if(record.planet.status!=='CONSUMED'&&inside(record.planet))consumePlanet(room,record);
 // Run after all elimination drops and capture processing; no stale world IDs survive.
 for(const [id,p]of lootState(room).pickups)if(inside(p))lootState(room).pickups.delete(id);
 for(const [id,p]of objectiveState(room).pickups)if(inside(p))objectiveState(room).pickups.delete(id);
 const current=consumed.filter(p=>p.timeMs===room.simulationTimeMs);
 // Previous casualties cannot win when the remaining ships die in combat.
 if(deadline||roundHumans(room).length===0&&current.length){
  const last=current.filter(p=>!room.finalCollapseEligible||room.finalCollapseEligible.includes(p.id)),max=Math.max(...last.map(p=>p.hp)),winners=last.filter(p=>p.hp===max);
  const finale=room.finalCollapseEligible!==undefined;
  finishMatch(room,winners.length===1?{kind:'winner',winnerId:winners[0].id,winnerName:winners[0].name,...(finale?{reason:'final-collapse' as const}:{})}:{kind:'draw',...(finale&&winners.length?{reason:'final-collapse' as const,winnerIds:winners.map(p=>p.id)}:{})},room.simulationTimeMs);
 }
}
