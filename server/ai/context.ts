import {FIGHTERS,materialAmount} from '../../shared/fighters';
import {GUARDIAN_PROFILES} from '../../shared/guardians';
import {WORLD,DEFAULT_CAMERA_WIDTH} from '../../shared/world';
import {SHIP_COLORS} from '../../shared/rooms';
import {WEAPONS,RARITIES,RESERVE_CAPS} from '../../shared/weapons';
import {horizonAt,HORIZON_CORNERS} from '../../shared/horizon';
import {objectiveState} from '../objectives';
import {lootState} from '../inventory';
import type {GameRoom,RoomPlayer} from '../rooms';
import type {Archetype,PilotAction,PilotDecision} from '../../shared/pilots';
export interface StrategicTarget {id:string;label:string;kind:'ship'|'loot'|'galaxy'|'planet'|'zone'|'guardian';x:number;y:number;distance:number;health?:number;progress?:number;utility?:boolean}
export const PERSONALITIES:Readonly<Record<string,Archetype>>={Viper:'Aggressor',Nova:'Strategist',Atlas:'Scavenger',Echo:'Survivor',Comet:'Wildcard',Orion:'Strategist',Vega:'Scavenger'};
const COLOR_ARCHETYPES:Archetype[]=['Aggressor','Aggressor','Strategist','Scavenger','Survivor','Wildcard','Strategist','Scavenger'];
export const personality=(p:RoomPlayer):Archetype=>p.state.fighterId?FIGHTERS[p.state.fighterId].personality:PERSONALITIES[p.state.name]??COLOR_ARCHETYPES[Math.max(0,(SHIP_COLORS as readonly number[]).indexOf(p.state.color))];
export const livingBot=(room:GameRoom,p:RoomPlayer)=>room.players.get(p.state.id)===p&&p.state.controllerType==='BOT'&&p.state.status==='ALIVE'&&p.state.lifeState==='active'&&p.state.health>0&&room.match.roster.includes(p.state.id)&&p.gameplayEnabled;
export function safeTarget(room:GameRoom,point:{x:number;y:number}){if(point.x<100||point.y<100||point.x>WORLD-100||point.y>WORLD-100)return false;const h=room.horizon;if(!h)return true;const future=horizonAt(h.startedAtMs,room.simulationTimeMs+10000,h.corner),c=HORIZON_CORNERS[h.corner];return Math.hypot(point.x-c.x,point.y-c.y)>future.radius+350;}
function usefulLoot(p:RoomPlayer,item:ReturnType<typeof lootState>['pickups'] extends Map<string,infer T>?T:never){const s=p.state,inv=s.inventory;if(!inv)return false;
 if(item.kind==='material')return (inv.survival?.materials??0)+materialAmount(p.state,item.quantity,item.source)<=300;
 if(item.kind==='cell')return (inv.survival?.cells??0)<3;
 if(item.kind==='repair')return (inv.survival?.kits??0)<2;
 if(s.goldGunId)return false;
 if(item.kind==='ammo')return inv.slots.some(w=>w&&WEAPONS[w.class].ammoType===item.ammoType)&&inv.reserve[item.ammoType]<RESERVE_CAPS[item.ammoType];
 if(item.kind!=='weapon')return false;return inv.slots.includes(null)||inv.slots.some(w=>w&&RARITIES.indexOf(w.rarity)<RARITIES.indexOf(item.weapon.rarity));
}
export function resolveTarget(room:GameRoom,p:RoomPlayer,id:string):StrategicTarget|null{
 const s=p.state,distance=(q:{x:number;y:number})=>Math.hypot(q.x-s.x,q.y-s.y),make=(q:{x:number;y:number},kind:StrategicTarget['kind'],label:string,extra:Partial<StrategicTarget>={})=>safeTarget(room,q)?{id,kind,label,x:q.x,y:q.y,distance:distance(q),...extra}:null;
 if(id.startsWith('ship:')){const target=room.players.get(id.slice(5));if(!target||target===p||target.state.status!=='ALIVE'||target.state.lifeState!=='active'||target.state.health<=0||!target.gameplayEnabled||!room.match.roster.includes(target.state.id)||distance(target.state)>DEFAULT_CAMERA_WIDTH)return null;return make(target.state,'ship',target.state.name,{health:(target.state.health+target.state.shield)/(target.state.maxHealth+target.state.maxShield)});}
 if(id.startsWith('guardian:')){const g=room.guardians?.units.get(id.slice(9));return g&&g.health>0&&distance(g)<=DEFAULT_CAMERA_WIDTH?make(g,'guardian',GUARDIAN_PROFILES[g.planetId].name,{health:g.health/g.maxHealth}):null;}
 if(id.startsWith('loot:')){const item=lootState(room).pickups.get(id.slice(5));if(!item||distance(item)>DEFAULT_CAMERA_WIDTH||!usefulLoot(p,item)||item.blockedId===s.id&&room.simulationTimeMs<(item.blockedUntilMs??0))return null;return make(item,'loot',item.kind==='weapon'?`${item.weapon.rarity} ${WEAPONS[item.weapon.class].name}`:item.kind==='ammo'?'Ammo':item.kind==='material'?'Materials':item.kind==='cell'?'Shield Cell':'Repair Kit',{utility:item.kind==='material'||item.kind==='cell'||item.kind==='repair'});}
 if(id.startsWith('galaxy:')){const item=objectiveState(room).pickups.get(id.slice(7));return item&&!s.goldGunId&&distance(item)<=DEFAULT_CAMERA_WIDTH?make(item,'galaxy','Galaxy Gun'):null;}
 if(id.startsWith('planet:')){const r=objectiveState(room).planets.find(r=>r.planet.id===id.slice(7));if((p.guardianAvoid?.get(id.slice(7))??0)>room.simulationTimeMs)return null;if(!r||r.planet.status==='CONSUMED'||r.completed.has(s.id)||r.planet.pickupId)return null;return make(r.planet,'planet',r.planet.name,{progress:(r.ticks.get(s.id)??0)/300});}
 const zones:Record<string,{x:number;y:number}>={'zone:NW':{x:WORLD*.2,y:WORLD*.2},'zone:NE':{x:WORLD*.8,y:WORLD*.2},'zone:SW':{x:WORLD*.2,y:WORLD*.8},'zone:SE':{x:WORLD*.8,y:WORLD*.8},'zone:center':{x:WORLD*.5,y:WORLD*.5}};
 const point=zones[id];return point?make(point,'zone',id==='zone:center'?'Central corridor':`${id.slice(5)} safe sector`):null;
}
export function buildContext(room:GameRoom,p:RoomPlayer,current?:PilotDecision){
 const ids=[...room.players.keys()].filter(id=>id!==p.state.id).map(id=>'ship:'+id);
 ids.push(...[...room.guardians?.units.keys()??[]].map(id=>'guardian:'+id));
 ids.push(...[...lootState(room).pickups.keys()].map(id=>'loot:'+id),...[...objectiveState(room).pickups.keys()].map(id=>'galaxy:'+id),...objectiveState(room).planets.map(r=>'planet:'+r.planet.id),'zone:NW','zone:NE','zone:SW','zone:SE','zone:center');
 const all=ids.map(id=>resolveTarget(room,p,id)).filter((t):t is StrategicTarget=>!!t),near=all.filter(t=>t.kind==='loot'||t.kind==='galaxy').sort((a,b)=>a.distance-b.distance).slice(0,8),targets=[...all.filter(t=>t.kind!=='loot'&&t.kind!=='galaxy'),...near];
 const inv=p.state.inventory,h=room.horizon,alive=[...room.players.values()].filter(q=>q.state.status==='ALIVE'&&q.state.lifeState==='active'&&room.match.roster.includes(q.state.id));
 // Deliberately exclude sessions, raw coordinates, enemy inventories, unseen
 // capture occupants/progress, killfeed text and all process/environment data.
 const context={pilot:{name:p.state.name,personality:personality(p),sector:[Math.floor(p.state.x/WORLD*4),Math.floor(p.state.y/WORLD*4)],hull:p.state.health,shield:p.state.shield,kills:p.state.kills,weapons:inv?.slots.map(w=>w?{class:w.class,rarity:w.rarity,ammo:w.magazine}:null),reserve:inv?.reserve,galaxy:p.state.galaxyType??null,materials:inv?.survival?.materials??0,cells:inv?.survival?.cells??0,kits:inv?.survival?.kits??0,recentCombat:room.simulationTimeMs-Math.max(p.lastAttackedMs??-Infinity,p.lastCombatMs??-Infinity)<5000,current:current?{action:current.action,targetId:current.targetId}:null},match:{remainingSeconds:Math.max(0,300-(h?room.simulationTimeMs-h.startedAtMs:0)/1000),humans:alive.filter(q=>q.state.controllerType==='HUMAN').length,bots:alive.filter(q=>q.state.controllerType==='BOT').length,horizon:h?{corner:h.corner,radius:Math.round(h.radius)}:null},planetMap:objectiveState(room).planets.map(r=>({id:r.planet.id,name:r.planet.name,status:r.planet.status,completedBySelf:r.completed.has(p.state.id),galaxyAvailable:!!r.planet.pickupId,...(room.guardians?{defenders:[...room.guardians.units.values()].filter(g=>g.planetId===r.planet.id).length}:{})})),targets:targets.map(({x:_x,y:_y,utility:_u,...t})=>({...t,distance:Math.round(t.distance),travelSeconds:Math.round(t.distance/290)}))};
 return {context,targets};
}
export function validateDecision(raw:unknown,allowed:StrategicTarget[],room:GameRoom,p:RoomPlayer):PilotDecision|null{
 if(room.match.state!=='active'||!livingBot(room,p))return null;
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;const r=raw as PilotDecision;
 if(Object.keys(r).some(k=>!['action','targetId','reason','commitmentSeconds','radio'].includes(k))||!['HUNT','LOOT','CAPTURE','FLEE','REPOSITION'].includes(r.action)||!(r.targetId===null||typeof r.targetId==='string')||typeof r.reason!=='string'||r.reason.length>120||!Number.isFinite(r.commitmentSeconds)||!(r.radio===null||typeof r.radio==='string')||typeof r.radio==='string'&&(r.radio.length>100||/[\x00-\x1f<>`]|https?:|www\.|bearer|sk[-_]|api.?key|\d/i.test(r.radio)))return null;
 const kinds:Record<PilotAction,StrategicTarget['kind'][]>= {HUNT:['ship','guardian'],LOOT:['loot','galaxy'],CAPTURE:['planet'],FLEE:['zone'],REPOSITION:['zone']};
 let targetId=r.targetId;
 if(targetId===null){if(!['FLEE','REPOSITION'].includes(r.action))return null;const target=allowed.filter(t=>t.kind==='zone'&&t.distance>200).sort((a,b)=>a.distance-b.distance)[0];if(!target)return null;targetId=target.id;}
 const target=allowed.find(t=>t.id===targetId);if(!target||!kinds[r.action].includes(target.kind)||!resolveTarget(room,p,target.id))return null;
 return {action:r.action,targetId:target.id,reason:r.reason,commitmentSeconds:Math.max(8,Math.min(20,Math.round(r.commitmentSeconds))),radio:r.radio};
}
