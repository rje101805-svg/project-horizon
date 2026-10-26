import {battleMetric} from './battle';
import {SURVIVAL,initialSurvival,parseSurvival,wallEntry,type ShieldWall,type Consumable,type SurvivalResult} from '../shared/survival';
import {WORLD,EDGE_MARGIN} from '../shared/flight';
import {PLANET_REGIONS} from '../shared/planets';
import {LOOT_CONFIG,type LootPickup} from '../shared/loot';
import {lootState,addPickup,safeLootPoint} from './inventory';
import type {GameRoom,RoomPlayer} from './rooms';
export const utility=(p:RoomPlayer)=>p.state.inventory?(p.state.inventory.survival??=initialSurvival()):undefined;
export const survivalEligible=(room:GameRoom,p:RoomPlayer)=>room.players.get(p.state.id)===p&&room.match.state==='active'&&room.match.roster.includes(p.state.id)&&p.gameplayEnabled&&p.state.status==='ALIVE'&&p.state.lifeState==='active'&&p.state.health>0&&!p.state.queuedForNextRound;
export function notice(p:RoomPlayer,text:string,time=p.simulationTimeMs){const u=utility(p);if(u){u.notice=text;u.noticeUntilMs=time+1400;}}
export function cancelHealing(p:RoomPlayer,time=p.simulationTimeMs){const u=utility(p);if(u?.use){u.use=null;notice(p,'CANCELLED',time);}}
export function startHealing(room:GameRoom,p:RoomPlayer,kind:Consumable):SurvivalResult {
 const u=utility(p),reject=(reason:string)=>{notice(p,reason,room.simulationTimeMs);return {ok:false,reason};};
 if(!survivalEligible(room,p)||!u||(p.state.stunRemainingMs??0)>0||p.state.tractor.attackerId||p.state.tractor.targetId)return reject('UNAVAILABLE');
 if(u.use)return reject('USING');
 if(kind==='cell'?p.state.shield>=p.state.maxShield:p.state.health>=p.state.maxHealth)return reject('FULL');
 if((kind==='cell'?u.cells:u.kits)<=0)return reject(kind==='cell'?'NO CELLS':'NO KITS');
 u.use={kind,startedAtMs:room.simulationTimeMs,endsAtMs:room.simulationTimeMs+(kind==='cell'?SURVIVAL.cellMs:SURVIVAL.repairMs),life:p.state.lifeGeneration,teleport:p.state.teleportSequence};notice(p,'USING',room.simulationTimeMs);return {ok:true,reason:'USING'};
}
export function completeHealing(room:GameRoom){for(const p of room.players.values()){const u=utility(p),use=u?.use;if(!u||!use)continue;
 if(!survivalEligible(room,p)||use.life!==p.state.lifeGeneration||use.teleport!==p.state.teleportSequence||p.state.tractor.attackerId||p.state.tractor.targetId){cancelHealing(p,room.simulationTimeMs);continue;}
 if(room.simulationTimeMs+1e-7<use.endsAtMs)continue;
 if(use.kind==='cell'&&u.cells>0){u.cells--;p.state.shield=Math.min(p.state.maxShield,p.state.shield+SURVIVAL.cellRestore);}else if(use.kind==='repair'&&u.kits>0){u.kits--;p.state.health=Math.min(p.state.maxHealth,p.state.health+SURVIVAL.repairRestore);}
 u.use=null;notice(p,'RESTORED',room.simulationTimeMs);
}}
export function walls(room:GameRoom){return room.walls??=new Map<string,ShieldWall>();}
export function deployWall(room:GameRoom,p:RoomPlayer,aim:number):SurvivalResult {
 const u=utility(p),reject=(reason:string)=>({ok:false,reason});
 if(!survivalEligible(room,p)||!u||(p.state.stunRemainingMs??0)>0||!Number.isFinite(aim))return reject('UNAVAILABLE');
 if(u.materials<SURVIVAL.wallCost)return reject('NO MATERIALS');
 if(room.simulationTimeMs<(p.nextWallMs??0))return reject('WALL COOLDOWN');
 const live=[...walls(room).values()].filter(w=>w.hp>0&&w.expiresAtMs>room.simulationTimeMs);
 if(live.filter(w=>w.ownerId===p.state.id).length>=SURVIVAL.wallCap)return reject('WALL LIMIT');
 const angle=Math.atan2(Math.sin(aim),Math.cos(aim)),x=p.state.x+Math.cos(angle)*SURVIVAL.wallAhead,y=p.state.y+Math.sin(angle)*SURVIVAL.wallAhead;
 const wall:ShieldWall={id:`${room.code}:${room.match.round}:wall:${(room.wallSequence??0)+1}`,ownerId:p.state.id,x,y,angle,hp:SURVIVAL.wallHp,createdAtMs:room.simulationTimeMs,expiresAtMs:room.simulationTimeMs+SURVIVAL.wallMs,hitAtMs:-1e9};
 const points=[-1,1].flatMap(side=>[-1,1].map(face=>({x:x+Math.cos(angle)*face*SURVIVAL.wallThickness/2-Math.sin(angle)*side*SURVIVAL.wallWidth/2,y:y+Math.sin(angle)*face*SURVIVAL.wallThickness/2+Math.cos(angle)*side*SURVIVAL.wallWidth/2})));
 if(points.some(q=>q.x<EDGE_MARGIN||q.y<EDGE_MARGIN||q.x>WORLD-EDGE_MARGIN||q.y>WORLD-EDGE_MARGIN)||PLANET_REGIONS.some(planet=>wallEntry(planet,planet,wall,planet.radius)!==null)||live.some(w=>wallEntry({x:x-Math.sin(angle)*SURVIVAL.wallWidth/2,y:y+Math.cos(angle)*SURVIVAL.wallWidth/2},{x:x+Math.sin(angle)*SURVIVAL.wallWidth/2,y:y-Math.cos(angle)*SURVIVAL.wallWidth/2},w,SURVIVAL.wallThickness)!==null))return reject('INVALID PLACEMENT');
 u.materials-=SURVIVAL.wallCost;battleMetric(room,p.state.id,'walls');p.nextWallMs=room.simulationTimeMs+SURVIVAL.wallCooldownMs;room.wallSequence=(room.wallSequence??0)+1;walls(room).set(wall.id,wall);notice(p,'WALL DEPLOYED',room.simulationTimeMs);return {ok:true,reason:'WALL DEPLOYED'};
}
export function survivalCommand(room:GameRoom|undefined,p:RoomPlayer|undefined,raw:unknown):SurvivalResult {
 const r=parseSurvival(raw);if(!r||!room||!p||room.players.get(p.state.id)!==p)return {ok:false,reason:'Invalid survival request'};
 if(r.sequence<=(p.lastSurvivalSequence??0))return {ok:false,reason:'Duplicate survival request'};p.lastSurvivalSequence=r.sequence;
 if(r.roomCode!==room.code||r.round!==room.match.round||r.reloadSession!==p.state.reloadSession||r.lifeGeneration!==p.state.lifeGeneration||r.teleportSequence!==p.state.teleportSequence)return {ok:false,reason:'Stale survival request'};
 const result=r.action==='wall'?deployWall(room,p,r.aim!):startHealing(room,p,r.action);if(!result.ok)notice(p,result.reason,room.simulationTimeMs);return result;
}
export function damageWall(room:GameRoom,wall:ShieldWall,amount:number){if(!walls(room).has(wall.id)||wall.hp<=0||wall.expiresAtMs<=room.simulationTimeMs||!Number.isFinite(amount)||amount<=0)return;wall.hp=Math.max(0,wall.hp-amount);wall.hitAtMs=room.simulationTimeMs;if(!wall.hp)walls(room).delete(wall.id);}
export function wallBlocked(room:GameRoom,a:{x:number;y:number},b:{x:number;y:number},ignore?:string){return [...walls(room).values()].some(w=>w.id!==ignore&&w.hp>0&&w.expiresAtMs>room.simulationTimeMs&&wallEntry(a,b,w)!==null);}
export function validResourcePoint(room:GameRoom,p:{x:number;y:number}){return p.x>=EDGE_MARGIN+50&&p.y>=EDGE_MARGIN+50&&p.x<=WORLD-EDGE_MARGIN-50&&p.y<=WORLD-EDGE_MARGIN-50&&PLANET_REGIONS.every(v=>Math.hypot(p.x-v.x,p.y-v.y)>v.radius+80);}
export function spawnUtility(room:GameRoom,kind:'material'|'cell'|'repair',point:{x:number;y:number},quantity=kind==='material'?25:1,source:'world'|'drop'='world'){
 return addPickup(room,{...point,kind,quantity,source,spawnTimeMs:room.simulationTimeMs} as Omit<LootPickup,'id'>);
}
function seedResources(room:GameRoom){
 // Each route supplies two whole stacks within ~1,100 units / four seconds of
 // ordinary travel; remaining density covers planet approaches and exploration.
 let count=0;for(const at of Object.values(room.match.launchDestinations)){const a=Math.atan2(WORLD/2-at.y,WORLD/2-at.x);for(const radius of [550,1050]){const point={x:at.x+Math.cos(a)*radius,y:at.y+Math.sin(a)*radius};if(validResourcePoint(room,point)){spawnUtility(room,'material',point);count++;}}}
 for(let i=count;i<SURVIVAL.materialCount;i++){const point=safeLootPoint(room);if(!point)throw Error('Unable to place materials');spawnUtility(room,'material',point);}
 for(let i=0;i<SURVIVAL.healingCount;i++){const point=safeLootPoint(room);if(!point)throw Error('Unable to place healing');spawnUtility(room,i%3===2?'repair':'cell',point);}
}
export function collectUtility(room:GameRoom,p:RoomPlayer,id:string){const item=lootState(room).pickups.get(id),u=utility(p);if(!item||!u||!survivalEligible(room,p)||item.kind==='weapon'||item.kind==='ammo'||Math.hypot(p.state.x-item.x,p.state.y-item.y)>LOOT_CONFIG.pickupRadius)return false;
 if(item.kind==='material'){if(u.materials+item.quantity>SURVIVAL.materialCap)return false;u.materials+=item.quantity;}else if(item.kind==='cell'){if(u.cells>=SURVIVAL.cellCap)return false;u.cells++;}else{if(u.kits>=SURVIVAL.kitCap)return false;u.kits++;}
 lootState(room).pickups.delete(id);notice(p,item.kind==='material'?`+${item.quantity} MATERIALS`:item.kind==='cell'?'+1 SHIELD CELL':'+1 REPAIR KIT',room.simulationTimeMs);return true;
}
export function advanceSurvival(room:GameRoom){
 for(const [id,w]of walls(room))if(w.expiresAtMs<=room.simulationTimeMs||w.hp<=0)walls(room).delete(id);
 if(room.match.state!=='active'){for(const p of room.players.values())cancelHealing(p,room.simulationTimeMs);return;}
 if(room.survivalRound!==room.match.round){seedResources(room);room.survivalRound=room.match.round;room.nextSurvivalSpawnMs=room.simulationTimeMs+5000;}
 for(const item of [...lootState(room).pickups.values()])if(item.kind!=='weapon'&&item.kind!=='ammo'){
  const candidates=[...room.players.values()].filter(p=>survivalEligible(room,p)).sort((a,b)=>Math.hypot(a.state.x-item.x,a.state.y-item.y)-Math.hypot(b.state.x-item.x,b.state.y-item.y)||a.state.id.localeCompare(b.state.id));for(const p of candidates)if(collectUtility(room,p,item.id))break;
 }
 if(room.simulationTimeMs>=(room.nextSurvivalSpawnMs??Infinity)){room.nextSurvivalSpawnMs=room.simulationTimeMs+5000;const items=[...lootState(room).pickups.values()].filter(p=>p.source==='world'),kind=items.filter(p=>p.kind==='material').length<SURVIVAL.materialCount?'material':items.filter(p=>p.kind==='cell'||p.kind==='repair').length<SURVIVAL.healingCount?'cell':null;if(kind){const at=safeLootPoint(room);if(at)spawnUtility(room,kind,at);}}
}
export function dropSurvival(room:GameRoom,p:RoomPlayer){const u=utility(p);if(!u)return;cancelHealing(p,room.simulationTimeMs);const held={materials:u.materials,cells:u.cells,kits:u.kits};u.materials=u.cells=u.kits=0;if(room.match.state!=='active')return;
 const values:('material'|'cell'|'repair')[]=[...Array(Math.ceil(held.materials/25)).fill('material'),...Array(held.cells).fill('cell'),...Array(held.kits).fill('repair')];let left=held.materials;
 values.forEach((kind,i)=>{let point:{x:number;y:number}|undefined;for(let n=0;n<96;n++){const angle=(i+n)*2.399963,radius=70+Math.floor(n/8)*120,candidate={x:p.state.x+Math.cos(angle)*radius,y:p.state.y+Math.sin(angle)*radius};if(validResourcePoint(room,candidate)){point=candidate;break;}}point??=safeLootPoint(room)??undefined;if(!point)throw Error('No valid survival drop position');const quantity=kind==='material'?Math.min(25,left):1;if(kind==='material')left-=quantity;spawnUtility(room,kind,point,quantity,'drop');});
}
export function resetSurvival(room:GameRoom){room.walls?.clear();room.survivalRound=undefined;room.nextSurvivalSpawnMs=undefined;for(const p of room.players.values()){p.lastCombatMs=undefined;p.nextWallMs=undefined;p.botWallAtMs=undefined;p.incomingDamageTimes=undefined;cancelHealing(p,room.simulationTimeMs);}}
