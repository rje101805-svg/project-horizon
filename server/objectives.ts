import {PLANET_REGIONS} from '../shared/planets';
import {CAPTURE_DURATION_MS,CAPTURE_TICKS,CAPTURE_RADIUS_FACTOR,CAPTURE_DECAY_RATE,GOLD_SPAWN_CLEARANCE,MAX_ANNOUNCEMENTS,type PlanetObjective,type GoldPickup,type ObjectiveAnnouncement,type ObjectiveSnapshot} from '../shared/objectives';
import {GOLD_GUN,GALAXY_WEAPONS,PLANET_GALAXY} from '../shared/weapons';
import {LOOT_CONFIG} from '../shared/loot';
import {EDGE_MARGIN,WORLD,TICK_MS} from '../shared/flight';
import {equipGoldGun,clearGoldGun} from './equipment';
import type {GameRoom,RoomPlayer} from './rooms';
export interface CaptureRecord {planet:PlanetObjective;ticks:Map<string,number>;completed:Set<string>}
export interface ObjectiveState {round:number;sequence:number;announcementSequence:number;planets:CaptureRecord[];pickups:Map<string,GoldPickup>;announcements:ObjectiveAnnouncement[];startedAtMs:number}
export function resetObjectives(room:GameRoom){
 const old=room.objectives;
 room.objectives={round:room.match.round,sequence:old?.sequence??0,announcementSequence:old?.announcementSequence??0,startedAtMs:room.simulationTimeMs,
  planets:PLANET_REGIONS.map(p=>({planet:{id:p.id,name:p.name,x:p.x,y:p.y,radius:p.radius,captureRadius:p.radius*CAPTURE_RADIUS_FACTOR,status:'AVAILABLE',capturingId:null,occupants:[],pickupId:null,progress:[]},ticks:new Map(),completed:new Set()})),pickups:new Map(),announcements:[]};
 for(const player of room.players.values())clearGoldGun(player);
}
export function objectiveState(room:GameRoom):ObjectiveState {if(!room.objectives)resetObjectives(room);return room.objectives!;}
export function eligibleShip(room:GameRoom,p:RoomPlayer):boolean {
 return room.match.state==='active'&&room.players.get(p.state.id)===p&&room.match.roster.includes(p.state.id)&&p.gameplayEnabled&&!p.state.queuedForNextRound&&p.state.status==='ALIVE'&&p.state.lifeState==='active'&&p.state.health>0;
}
function announce(room:GameRoom,event:Omit<ObjectiveAnnouncement,'id'|'round'|'timeMs'>){
 const s=objectiveState(room);s.announcements.push({...event,id:++s.announcementSequence,round:room.match.round,timeMs:room.simulationTimeMs});if(s.announcements.length>MAX_ANNOUNCEMENTS)s.announcements.shift();
}
function spawnPoint(room:GameRoom,record:CaptureRecord,p:RoomPlayer){
 const planet=record.planet,dx=p.state.x-planet.x,dy=p.state.y-planet.y,angle=Math.atan2(dy,dx)||p.state.rotation;
 const radius=Math.max(planet.radius*1.15+GOLD_SPAWN_CLEARANCE,Math.hypot(dx,dy)+GOLD_SPAWN_CLEARANCE);
 for(let i=0;i<16;i++){
  const a=angle+i*Math.PI/8,x=planet.x+Math.cos(a)*radius,y=planet.y+Math.sin(a)*radius;
  if(x>=EDGE_MARGIN&&x<=WORLD-EDGE_MARGIN&&y>=EDGE_MARGIN&&y<=WORLD-EDGE_MARGIN&&Math.hypot(x-p.state.x,y-p.state.y)>GOLD_GUN.pickupRadius&&Math.hypot(x-room.blackHole.x,y-room.blackHole.y)>room.blackHole.eventHorizonRadius+GOLD_GUN.pickupRadius)return {x,y};
 }
 return null;
}
export function dropGoldGun(room:GameRoom,p:RoomPlayer){
 const galaxyType=p.state.galaxyType??'cryo',id=clearGoldGun(p);if(!id)return;
 const s=objectiveState(room);s.pickups.set(id,{id,galaxyType,blockedId:p.state.id,blockedUntilMs:room.simulationTimeMs+LOOT_CONFIG.pickupGraceMs,x:Math.max(EDGE_MARGIN,Math.min(WORLD-EDGE_MARGIN,p.state.x)),y:Math.max(EDGE_MARGIN,Math.min(WORLD-EDGE_MARGIN,p.state.y)),source:'drop',planetId:null,spawnTimeMs:room.simulationTimeMs});
 announce(room,{kind:'dropped',text:`${GALAXY_WEAPONS[galaxyType].name.toUpperCase()} HAS DROPPED`,participantId:p.state.id});
}
export function removeObjectiveParticipant(room:GameRoom,p:RoomPlayer){
 dropGoldGun(room,p);
 for(const record of objectiveState(room).planets){record.ticks.delete(p.state.id);if(record.planet.capturingId===p.state.id)record.planet.capturingId=null;}
 // Successful history remains until reset; rejoining an active round is OUT.
}
export function collectGoldGun(room:GameRoom,p:RoomPlayer,id:string,recentValidated=false):boolean {
 const s=objectiveState(room),pickup=s.pickups.get(id);
 if(!pickup||!eligibleShip(room,p)||p.state.goldGunId||(p.state.stunRemainingMs??0)>0||pickup.blockedId===p.state.id&&room.simulationTimeMs<(pickup.blockedUntilMs??0)||!((p.state.x-pickup.x)**2+(p.state.y-pickup.y)**2<=(recentValidated?LOOT_CONFIG.paddedPickupRadius:GOLD_GUN.pickupRadius)**2))return false;
 if(!equipGoldGun(p,id,pickup.galaxyType??PLANET_GALAXY[pickup.planetId??'']??'cryo'))return false;
 s.pickups.delete(id);
 if(pickup.source==='planet'){const record=s.planets.find(r=>r.planet.id===pickup.planetId);if(record?.planet.pickupId===id){record.planet.pickupId=null;record.planet.status=record.planet.occupants.length>1?'CONTESTED':'AVAILABLE';}}
 announce(room,{kind:'claimed',text:`${p.state.name.toUpperCase()} CLAIMED ${GALAXY_WEAPONS[p.state.galaxyType!].name.toUpperCase()}`,participantId:p.state.id});return true;
}
export function advanceObjectives(room:GameRoom){
 const s=objectiveState(room);if(room.match.state!=='active')return;
 const eligible=[...room.players.values()].filter(p=>eligibleShip(room,p));
 for(const player of room.players.values())if(player.state.goldGunId&&!eligibleShip(room,player))dropGoldGun(room,player);
 for(const record of s.planets){
  const planet=record.planet,inside=eligible.filter(p=>(p.state.x-planet.x)**2+(p.state.y-planet.y)**2<=planet.captureRadius**2),insideIds=new Set(inside.map(p=>p.state.id)),previous=planet.capturingId;
  planet.occupants=inside.map(p=>p.state.id);planet.capturingId=null;
  for(const [id,ticks] of record.ticks){const p=room.players.get(id);if(!p||!eligibleShip(room,p)){record.ticks.delete(id);continue;}if(!insideIds.has(id)&&!record.completed.has(id))record.ticks.set(id,Math.max(0,ticks-CAPTURE_DECAY_RATE));}
  if(inside.length>1)planet.status='CONTESTED';
  else if(planet.pickupId&&s.pickups.has(planet.pickupId))planet.status='GOLD_GUN_AVAILABLE';
  else if(inside.length===1&&!record.completed.has(inside[0].state.id)){
   const p=inside[0],id=p.state.id;planet.status='CAPTURING';planet.capturingId=id;
   if(previous!==id)announce(room,{kind:'started',text:`${p.state.name.toUpperCase()} IS CAPTURING ${planet.name.toUpperCase()}`,planetId:planet.id,participantId:id});
   const ticks=Math.min(CAPTURE_TICKS,(record.ticks.get(id)??0)+1);record.ticks.set(id,ticks);
   if(ticks===CAPTURE_TICKS){const point=spawnPoint(room,record,p);if(point){const pickupId=`${room.code}:gold:${room.match.round}:${++s.sequence}`;record.completed.add(id);s.pickups.set(pickupId,{id:pickupId,galaxyType:PLANET_GALAXY[planet.id],...point,source:'planet',planetId:planet.id,spawnTimeMs:room.simulationTimeMs});planet.pickupId=pickupId;planet.status='GOLD_GUN_AVAILABLE';planet.capturingId=null;announce(room,{kind:'captured',text:`${p.state.name.toUpperCase()} CAPTURED ${planet.name.toUpperCase()}`,planetId:planet.id,participantId:id});}}
  }else planet.status='AVAILABLE';
 }
 // Human claims use F; bots use the same trusted collection boundary.
 for(const pickup of s.pickups.values()){
  if(pickup.spawnTimeMs>=room.simulationTimeMs)continue;
  const candidates=eligible.filter(p=>p.state.controllerType==='BOT'&&!p.state.goldGunId).sort((a,b)=>Math.hypot(a.state.x-pickup.x,a.state.y-pickup.y)-Math.hypot(b.state.x-pickup.x,b.state.y-pickup.y)||a.state.id.localeCompare(b.state.id));
  for(const p of candidates)if(collectGoldGun(room,p,pickup.id))break;
 }

}
export function objectivesSnapshot(room:GameRoom):ObjectiveSnapshot {
 const s=objectiveState(room);return {round:room.match.round,planets:s.planets.map(r=>({...r.planet,occupants:[...r.planet.occupants],progress:[...r.ticks].map(([participantId,ticks])=>({participantId,progressMs:Math.min(CAPTURE_DURATION_MS,ticks*TICK_MS),completed:r.completed.has(participantId),inside:r.planet.occupants.includes(participantId)}))})),pickups:[...s.pickups.values()].map(p=>({...p})),announcements:s.announcements.map(a=>({...a}))};
}
export function pauseObjectives(room:GameRoom){
 for(const record of objectiveState(room).planets){record.planet.capturingId=null;record.planet.occupants=[];record.planet.status=record.planet.pickupId?'GOLD_GUN_AVAILABLE':'AVAILABLE';}
}
