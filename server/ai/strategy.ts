import {radio} from './radio';
import type {BotStrategy} from '../../shared/bots';
import type {PilotDecision,DecisionSource} from '../../shared/pilots';
import {buildContext,resolveTarget,safeTarget,type StrategicTarget} from './context';
import type {PilotState,PilotRuntime} from './types';
import type {GameRoom,RoomPlayer} from '../rooms';
export function history(state:PilotState,status:PilotState['history'][number]['status'],decision:PilotDecision,time:number){state.history.push({status,action:decision.action,atMs:time});if(state.history.length>8)state.history.shift();}
export function fallback(room:GameRoom,p:RoomPlayer,state:PilotState,exclude?:string):PilotDecision {
 const targets=buildContext(room,p).targets.filter(t=>t.id!==exclude),ships=targets.filter(t=>t.kind==='ship').sort((a,b)=>(a.health??1)-(b.health??1)||a.distance-b.distance),loot=targets.filter(t=>t.kind==='loot'||t.kind==='galaxy').sort((a,b)=>Number(b.kind==='galaxy')-Number(a.kind==='galaxy')||a.distance-b.distance),planets=targets.filter(t=>t.kind==='planet').sort((a,b)=>(b.progress??0)-(a.progress??0)||a.distance-b.distance),zones=targets.filter(t=>t.kind==='zone'&&t.distance>200).sort((a,b)=>a.distance-b.distance),hp=(p.state.health+p.state.shield)/(p.state.maxHealth+p.state.maxShield);
 let action:PilotDecision['action']='REPOSITION',target:StrategicTarget|undefined;
 const early=room.simulationTimeMs-(room.pilots?.startedAtMs??room.simulationTimeMs)<30000;const starter=early&&((p.state.inventory?.slots.filter(Boolean).length??0)<2?loot.find(t=>t.kind==='loot'&&room.loot?.pickups.get(t.id.slice(5))?.kind==='weapon'):(p.state.inventory?.survival?.materials??0)<40?loot.find(t=>t.label==='Materials'):undefined);
 if(starter){action='LOOT';target=starter;}
 else if(hp<.35&&ships.length){action='FLEE';target=zones.sort((a,b)=>Math.hypot(b.x-ships[0].x,b.y-ships[0].y)-Math.hypot(a.x-ships[0].x,a.y-ships[0].y))[0];}
 else if(planets[0]&&(planets[0].progress??0)>.7){action='CAPTURE';target=planets[0];}
 else if(state.personality==='Aggressor'&&ships[0]&&hp>.5){action='HUNT';target=ships[0];}
 else if(state.personality==='Strategist'&&planets.length){action='CAPTURE';target=planets[0];}
 else if(state.personality==='Survivor'&&hp<.7&&loot.some(t=>t.utility)){action='LOOT';target=loot.find(t=>t.utility);}
 else if(state.personality==='Wildcard'&&(Math.floor(room.simulationTimeMs/15000)+p.state.color)%2&&ships.length){action='HUNT';target=ships[0];}
 else if(loot.length){action='LOOT';target=loot[0];}
 else if(planets.length){action='CAPTURE';target=planets[0];}
 else target=zones[0];
 return {action,targetId:target?.id??null,reason:`${state.personality} deterministic objective`,commitmentSeconds:10,radio:null};
}
export function setIntent(runtime:PilotRuntime,state:PilotState,decision:PilotDecision,source:DecisionSource,time:number,sequence=0){
 if(state.intent)history(state,'superseded',state.intent.decision,time);
 state.intent={decision,source,expiresAtMs:time+decision.commitmentSeconds*1000,applied:false,sequence};state.effective={action:decision.action,target:'Tactical positioning',source,expiresAtMs:state.intent.expiresAtMs};state.progress=undefined;state.lastDecisionAtMs=time;history(state,'accepted',decision,time);if(source==='FALLBACK')runtime.fallbacks++;
}
export function strategicStrategy(room:GameRoom,p:RoomPlayer,base:BotStrategy):BotStrategy {
 const runtime=room.pilots,state=runtime?.states.get(p.state.id);if(!runtime||runtime.round!==room.match.round||!state||room.match.state!=='active')return base;
 const now=room.simulationTimeMs,critical=(p.state.health+p.state.shield)/(p.state.maxHealth+p.state.maxShield)<.3&&now-(p.lastAttackedMs??-Infinity)<5000,emergency=base.goal?.kind==='escape'||!!p.state.tractor.attackerId||critical||(p.state.stunRemainingMs??0)>0;
 if(emergency){if(!state.emergency){state.version++;if(state.intent)history(state,'superseded',state.intent.decision,now);state.intent=null;runtime.fallbacks++;}state.emergency=true;state.effective={action:'FLEE',target:p.state.tractor.attackerId?'Tractor escape':'Emergency safe sector',source:'FALLBACK',expiresAtMs:now+1000};return base;}
 state.emergency=false;
 let intent=state.intent,target=intent?.decision.targetId?resolveTarget(room,p,intent.decision.targetId):null;
 const nearComplete=buildOwnCapture(room,p);if(nearComplete&&intent?.decision.targetId!==nearComplete.id){setIntent(runtime,state,{action:'CAPTURE',targetId:nearComplete.id,reason:'Finish observed capture',commitmentSeconds:8,radio:null},'FALLBACK',now);intent=state.intent;target=nearComplete;}
 const completed=!!target&&(target.kind==='zone'&&target.distance<100||intent?.decision.action==='FLEE'&&now-(p.lastAttackedMs??-Infinity)>5000&&!buildContext(room,p).targets.some(t=>t.kind==='ship'));
 if(state.progress&&target&&state.progress.id===target.id){if(target.distance<state.progress.best-20){state.progress.best=target.distance;state.progress.atMs=now;}else if(target.kind==='planet'&&(target.progress??0)>(state.progress.capture??0)){state.progress.capture=target.progress;state.progress.atMs=now;}else if(now-state.progress.atMs>5000)target=null;}
 if(!intent||!target||intent.expiresAtMs<=now||completed){if(intent&&!target)radio(room,p,runtime,state,'lost');if(intent)history(state,completed?'completed':'invalidated',intent.decision,now);const old=intent?.decision.targetId??undefined;state.intent=null;setIntent(runtime,state,fallback(room,p,state,completed?old:undefined),'FALLBACK',now);intent=state.intent!;target=intent.decision.targetId?resolveTarget(room,p,intent.decision.targetId):null;}
 if(!target||!safeTarget(room,target)){state.effective={action:'REPOSITION',target:'Tactical positioning',source:'FALLBACK',expiresAtMs:now};return base;}
 if(!state.progress||state.progress.id!==target.id)state.progress={id:target.id,best:target.distance,atMs:now};
 state.effective={action:intent!.decision.action,target:target.label,source:intent!.source,expiresAtMs:intent!.expiresAtMs};if(!intent!.applied){intent!.applied=true;if(intent!.sequence>0)runtime.applied++;}
 const enemy=buildNearestEnemy(room,p),action=intent!.decision.action;
 if(action==='HUNT')return {mode:'HUNT',target:target.id.slice(5)};
 const kind=action==='CAPTURE'?'capture':target.kind==='galaxy'?'pickup':action==='LOOT'?'loot':'position';
 return {mode:action==='CAPTURE'?'CAPTURE':action==='LOOT'?'LOOT':'HUNT',target:kind==='position'?null:enemy,goal:{kind,id:target.id.replace(/^(loot|galaxy|planet):/,''),x:target.x,y:target.y}};
}
function buildNearestEnemy(room:GameRoom,p:RoomPlayer){let nearest:string|null=null,d=1101;for(const q of room.players.values()){const target=resolveTarget(room,p,'ship:'+q.state.id);if(target&&target.distance<d){d=target.distance;nearest=q.state.id;}}return nearest;}
function buildOwnCapture(room:GameRoom,p:RoomPlayer){const records=room.objectives?.planets??[];for(const r of records){const ticks=r.ticks.get(p.state.id)??0;if(ticks>=225&&ticks<300&&Math.hypot(p.state.x-r.planet.x,p.state.y-r.planet.y)<=r.planet.captureRadius)return resolveTarget(room,p,'planet:'+r.planet.id);}return null;}
