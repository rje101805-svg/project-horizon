import {randomUUID,randomInt} from 'node:crypto';
import {activeWeapon,emptyReserve,WEAPONS,WEAPON_CLASSES,RARITIES,RARITY_WEIGHTS,RESERVE_CAPS,AMMO_PACKS,AMMO_TYPES,type WeaponInstance,type WeaponClass,type Rarity} from '../shared/weapons';
import {LOOT_CONFIG,WORLD_WEAPON_COUNTS,parseInventoryCommand,type LootPickup,type LootSnapshot,type InventoryResult} from '../shared/loot';
import {collectGoldGun,dropGoldGun,objectiveState,eligibleShip} from './objectives';
import {PLANET_REGIONS} from '../shared/planets';
import {WORLD,EDGE_MARGIN} from '../shared/flight';
import type {GameRoom,RoomPlayer} from './rooms';
export interface LootState {pickups:Map<string,LootPickup>;nextReplenishMs:number;sequence:number}
const random=()=>randomInt(0,1000000)/1000000;
export function freshWeapon(kind:WeaponClass,rarity:Rarity='COMMON'):WeaponInstance {return {id:randomUUID(),class:kind,rarity,magazine:WEAPONS[kind].magazine,capacity:WEAPONS[kind].magazine,grantConsumed:false};}
export function initializeInventory(p:RoomPlayer){
 const weapon=freshWeapon('blaster');weapon.grantConsumed=true;
 p.state.inventory={slots:[weapon,null,null],activeSlot:0,reserve:{...emptyReserve(),energy:WEAPONS.blaster.magazine*2},revision:(p.state.inventory?.revision??0)+1};
 p.state.stunRemainingMs=p.state.stunImmunityRemainingMs=0;
 // Legacy HUD fields are views of the active magazine, never another ammo owner.
 let spareAmmo=0,spareMax=0;
 Object.defineProperties(p.state,{ammo:{enumerable:true,configurable:true,get(){return activeWeapon(this)?.magazine??spareAmmo;},set(v:number){const w=activeWeapon(this);if(w)w.magazine=v;else spareAmmo=v;}},maxAmmo:{enumerable:true,configurable:true,get(){return activeWeapon(this)?.capacity??spareMax;},set(v:number){spareMax=v;}}});
}
export function clearInventory(p:RoomPlayer){if(p.state.inventory){p.state.inventory={slots:[null,null,null],activeSlot:0,reserve:emptyReserve(),revision:p.state.inventory.revision+1};}p.state.ammo=p.state.maxAmmo=0;}
export function lootState(room:GameRoom):LootState {return room.loot??= {pickups:new Map(),nextReplenishMs:Infinity,sequence:0};}
export function lootEligible(room:GameRoom,p:RoomPlayer){return room.players.get(p.state.id)===p&&room.match.state==='active'&&room.match.roster.includes(p.state.id)&&p.gameplayEnabled&&p.state.status==='ALIVE'&&p.state.lifeState==='active'&&p.state.health>0&&!p.state.goldGunId&&!p.state.queuedForNextRound;}
function addPickup(room:GameRoom,item:Omit<LootPickup,'id'>):LootPickup {
 const s=lootState(room);
 // Bounded lifetime/cap intentionally destroys the oldest world resource under pressure.
 if(s.pickups.size>=LOOT_CONFIG.cap){const oldest=s.pickups.keys().next().value;if(oldest)s.pickups.delete(oldest);}
 const pickup={...item,id:`${room.code}:loot:${++s.sequence}`} as LootPickup;s.pickups.set(pickup.id,pickup);return pickup;
}
export function safeLootPoint(room:GameRoom,rng= random):{x:number;y:number}|null {
 const pickups=lootState(room).pickups;
 for(let i=0;i<160;i++){
  const x=EDGE_MARGIN+100+rng()*(WORLD-2*EDGE_MARGIN-200),y=EDGE_MARGIN+100+rng()*(WORLD-2*EDGE_MARGIN-200);
  if(Math.hypot(x-room.blackHole.x,y-room.blackHole.y)<room.blackHole.influenceRadius+250)continue;
  if(PLANET_REGIONS.some(p=>Math.hypot(x-p.x,y-p.y)<p.radius*1.15+LOOT_CONFIG.planetClearance))continue;
  if([...room.players.values()].some(p=>Math.hypot(x-p.state.x,y-p.state.y)<LOOT_CONFIG.playerClearance))continue;
  if([...pickups.values()].some(p=>Math.hypot(x-p.x,y-p.y)<LOOT_CONFIG.spacing))continue;
  return {x,y};
 }
 return null;
}
export function chooseRarity(value:number,weights:readonly number[]=RARITY_WEIGHTS):Rarity {const total=weights.reduce((a,b)=>a+b,0);let n=value*total;for(let i=0;i<3;i++){n-=weights[i];if(n< -1e-12)return RARITIES[i];}return 'LEGENDARY';}
function spawnWorld(room:GameRoom,kind:'weapon'|'ammo',rng=random,type?:WeaponClass,position?:{x:number;y:number}){
 const point=position??safeLootPoint(room,rng);if(!point)return false;
 if(kind==='weapon'){const weaponType=type??WEAPON_CLASSES[Math.min(4,Math.floor(rng()*5))];addPickup(room,{...point,kind,weapon:freshWeapon(weaponType,chooseRarity(rng())),spawnTimeMs:room.simulationTimeMs,source:'world'} as Omit<LootPickup,'id'>);}
 else{const ammoType=AMMO_TYPES[Math.min(4,Math.floor(rng()*5))];addPickup(room,{...point,kind,ammoType,quantity:AMMO_PACKS[ammoType],spawnTimeMs:room.simulationTimeMs,source:'world'} as Omit<LootPickup,'id'>);}
 return true;
}
function pointAllowed(room:GameRoom,x:number,y:number){return x>=EDGE_MARGIN+100&&y>=EDGE_MARGIN+100&&x<=WORLD-EDGE_MARGIN-100&&y<=WORLD-EDGE_MARGIN-100&&Math.hypot(x-room.blackHole.x,y-room.blackHole.y)>room.blackHole.influenceRadius+250&&!PLANET_REGIONS.some(p=>Math.hypot(x-p.x,y-p.y)<p.radius*1.15+LOOT_CONFIG.planetClearance)&&![...room.players.values()].some(p=>Math.hypot(x-p.state.x,y-p.state.y)<LOOT_CONFIG.playerClearance)&&![...lootState(room).pickups.values()].some(p=>Math.hypot(x-p.x,y-p.y)<LOOT_CONFIG.spacing);}
function regionPoint(room:GameRoom,index:number,rng:()=>number){
 const planet=PLANET_REGIONS[index%4];
 for(let attempt=0;attempt<200;attempt++){const angle=rng()*Math.PI*2,radius=planet.radius*1.15+LOOT_CONFIG.planetClearance+80+rng()*550,x=planet.x+Math.cos(angle)*radius,y=planet.y+Math.sin(angle)*radius;if(pointAllowed(room,x,y))return {x,y};}
 return null;
}
function routePoint(room:GameRoom,index:number,rng:()=>number){
 const a=PLANET_REGIONS[index%4],b=PLANET_REGIONS[(index+1)%4];
 for(let attempt=0;attempt<200;attempt++){const t=.18+rng()*.64,x=a.x+(b.x-a.x)*t+(rng()-.5)*1800,y=a.y+(b.y-a.y)*t+(rng()-.5)*1800;if(pointAllowed(room,x,y)&&PLANET_REGIONS.every(p=>Math.hypot(x-p.x,y-p.y)>p.radius*1.15+LOOT_CONFIG.planetClearance+710))return {x,y};}
 return safeLootPoint(room,rng);
}
export function resetLoot(room:GameRoom,spawn=false,rng=random){
 const s=lootState(room);s.pickups.clear();s.nextReplenishMs=room.simulationTimeMs+LOOT_CONFIG.replenishMs;
 for(const p of room.players.values())p.recentPickups=new Map();
 if(!spawn)return;
 const types=Object.entries(WORLD_WEAPON_COUNTS).flatMap(([kind,count])=>Array.from({length:count},()=>kind as WeaponClass));
 // Shuffle class positions without changing the exact class totals.
 for(let i=types.length-1;i>0;i--){const j=Math.min(i,Math.floor(rng()*(i+1)));[types[i],types[j]]=[types[j],types[i]];}
 for(let i=0;i<types.length;i++){const point=i<21?regionPoint(room,i,rng):routePoint(room,i,rng);if(!point||!spawnWorld(room,'weapon',rng,types[i],point))throw Error('Unable to initialize safe world weapons');}
 const guns=[...s.pickups.values()];
 for(let i=0;i<LOOT_CONFIG.ammoCount;i++){
  const gun=guns[i%guns.length];let point:{x:number;y:number}|null=null;
  for(let a=0;a<80;a++){const angle=rng()*Math.PI*2,radius=190+rng()*180,x=gun.x+Math.cos(angle)*radius,y=gun.y+Math.sin(angle)*radius;if(pointAllowed(room,x,y)){point={x,y};break;}}
  point??=safeLootPoint(room,rng);if(!point)throw Error('Unable to initialize safe world ammo');
  const ammoType=gun.kind==='weapon'?WEAPONS[gun.weapon.class].ammoType:AMMO_TYPES[i%5];addPickup(room,{...point,kind:'ammo',ammoType,quantity:AMMO_PACKS[ammoType],spawnTimeMs:room.simulationTimeMs,source:'world'} as Omit<LootPickup,'id'>);
 }
}
function dropPoint(room:GameRoom,p:RoomPlayer,index:number){
 const point=(attempt:number)=>{const angle=(index+attempt)*2.399963,radius=100+Math.floor(index/6)*65+Math.floor(attempt/8)*70;return {x:Math.max(EDGE_MARGIN,Math.min(WORLD-EDGE_MARGIN,p.state.x+Math.cos(angle)*radius)),y:Math.max(EDGE_MARGIN,Math.min(WORLD-EDGE_MARGIN,p.state.y+Math.sin(angle)*radius))};};
 for(let attempt=0;attempt<24;attempt++){const at=point(attempt);if([...lootState(room).pickups.values()].every(item=>Math.hypot(at.x-item.x,at.y-item.y)>=80))return at;}
 return point(0); // Under extreme crowding retain the resource rather than lose a forced drop.
}
export function dropWeapon(room:GameRoom,p:RoomPlayer,weapon:WeaponInstance,index=0){return addPickup(room,{...dropPoint(room,p,index),kind:'weapon',weapon,source:'drop',spawnTimeMs:room.simulationTimeMs,blockedId:p.state.id,blockedUntilMs:room.simulationTimeMs+LOOT_CONFIG.pickupGraceMs} as Omit<LootPickup,'id'>);}
export function dropRegularInventory(room:GameRoom,p:RoomPlayer){
 if(room.match.state!=='active'){clearInventory(p);cancelReload(p);return;}
 const inv=p.state.inventory;if(!inv)return;let scatter=0;
 for(const weapon of inv.slots){if(!weapon)continue;dropWeapon(room,p,weapon,scatter++);
  const type=WEAPONS[weapon.class].ammoType,quantity=Math.min(inv.reserve[type],Math.ceil(AMMO_PACKS[type]/2));
  if(quantity){inv.reserve[type]-=quantity;addPickup(room,{...dropPoint(room,p,scatter++),kind:'ammo',ammoType:type,quantity,source:'drop',spawnTimeMs:room.simulationTimeMs,blockedId:p.state.id,blockedUntilMs:room.simulationTimeMs+LOOT_CONFIG.pickupGraceMs} as Omit<LootPickup,'id'>);}
 }
 for(const type of AMMO_TYPES){while(inv.reserve[type]>0){const quantity=Math.min(inv.reserve[type],RESERVE_CAPS[type]);inv.reserve[type]-=quantity;addPickup(room,{...dropPoint(room,p,scatter++),kind:'ammo',ammoType:type,quantity,source:'drop',spawnTimeMs:room.simulationTimeMs,blockedId:p.state.id,blockedUntilMs:room.simulationTimeMs+LOOT_CONFIG.pickupGraceMs} as Omit<LootPickup,'id'>);}}
 clearInventory(p);cancelReload(p);
}
export function cancelReload(p:RoomPlayer){p.combatTimers.reload=0;p.combatTimers.reloadCompleted=false;p.reloadWeaponId=undefined;p.state.isReloading=false;p.state.reloadRemainingMs=p.state.reloadProgress=0;}
function within(room:GameRoom,p:RoomPlayer,item:LootPickup){return room.simulationTimeMs>item.spawnTimeMs&&!(item.blockedId===p.state.id&&room.simulationTimeMs<(item.blockedUntilMs??0))&&(p.state.x-item.x)**2+(p.state.y-item.y)**2<=LOOT_CONFIG.pickupRadius**2;}
function grant(p:RoomPlayer,w:WeaponInstance){if(w.grantConsumed)return;const inv=p.state.inventory!,type=WEAPONS[w.class].ammoType;inv.reserve[type]=Math.min(RESERVE_CAPS[type],inv.reserve[type]+WEAPONS[w.class].magazine*2);w.grantConsumed=true;}
export function collectLoot(room:GameRoom,p:RoomPlayer,id:string):boolean {
 const item=lootState(room).pickups.get(id),inv=p.state.inventory;
 if(!item||!inv||!lootEligible(room,p)||(p.state.stunRemainingMs??0)>0||!within(room,p,item))return false;
 if(item.kind==='ammo'){if(!inv.slots.some(w=>w&&WEAPONS[w.class].ammoType===item.ammoType))return false;
  const transfer=Math.min(item.quantity,RESERVE_CAPS[item.ammoType]-inv.reserve[item.ammoType]);if(transfer<=0)return false;inv.reserve[item.ammoType]+=transfer;item.quantity-=transfer;if(!item.quantity)lootState(room).pickups.delete(id);return true;
 }
 const slot=inv.slots.indexOf(null);if(slot<0)return false;grant(p,item.weapon);inv.slots[slot]=item.weapon;if(!inv.slots[inv.activeSlot])inv.activeSlot=slot;inv.revision++;lootState(room).pickups.delete(id);return true;
}
export function nearestWeapon(room:GameRoom,p:RoomPlayer){return [...lootState(room).pickups.values()].filter((item):item is LootPickup&{kind:'weapon'}=>item.kind==='weapon'&&within(room,p,item)).sort((a,b)=>(p.state.x-a.x)**2+(p.state.y-a.y)**2-((p.state.x-b.x)**2+(p.state.y-b.y)**2)||a.id.localeCompare(b.id))[0];}
export function switchSlot(p:RoomPlayer,slot:number){const inv=p.state.inventory;if(!inv||!Number.isInteger(slot)||slot<0||slot>2||!inv.slots[slot]||p.state.goldGunId||p.state.status!=='ALIVE'||p.state.lifeState!=='active'||!p.gameplayEnabled||(p.state.stunRemainingMs??0)>0)return false;if(slot===inv.activeSlot)return true;cancelReload(p);inv.activeSlot=slot;inv.revision++;return true;}
export function rememberPickupProximity(room:GameRoom,p:RoomPlayer){
 const life=`${room.match.round}:${p.state.lifeGeneration}:${p.state.teleportSequence}`;if(p.recentPickupLife!==life){p.recentPickups?.clear();p.recentPickupLife=life;}
 const recent=p.recentPickups??=new Map<string,number>();
 if(!eligibleShip(room,p)){recent.clear();return;}
 for(const [id,time]of recent)if(room.simulationTimeMs-time>LOOT_CONFIG.recentPickupMs)recent.delete(id);
 for(const item of [...lootState(room).pickups.values(),...objectiveState(room).pickups.values()]){
  if('kind' in item&&item.kind!=='weapon'||item.blockedId===p.state.id&&room.simulationTimeMs<(item.blockedUntilMs??0))continue;
  if((p.state.x-item.x)**2+(p.state.y-item.y)**2<=LOOT_CONFIG.pickupRadius**2)recent.set(item.id,room.simulationTimeMs);
 }
}
export function pickupWeapon(room:GameRoom,p:RoomPlayer,id?:string){
 if(!eligibleShip(room,p)||p.state.goldGunId||(p.state.stunRemainingMs??0)>0||room.simulationTimeMs<(p.nextSwapMs??0))return false;
 const inv=p.state.inventory;if(!inv)return false;
 rememberPickupProximity(room,p);
 const pickups=[...[...lootState(room).pickups.values()].filter(i=>i.kind==='weapon'),...objectiveState(room).pickups.values()];
 const available=pickups.filter(item=>!(item.blockedId===p.state.id&&room.simulationTimeMs<(item.blockedUntilMs??0))&&((p.state.x-item.x)**2+(p.state.y-item.y)**2<=LOOT_CONFIG.pickupRadius**2||room.simulationTimeMs-(p.recentPickups?.get(item.id)??-Infinity)<=LOOT_CONFIG.recentPickupMs&&(p.state.x-item.x)**2+(p.state.y-item.y)**2<=LOOT_CONFIG.paddedPickupRadius**2));
 available.sort((a,b)=>(p.state.x-a.x)**2+(p.state.y-a.y)**2-((p.state.x-b.x)**2+(p.state.y-b.y)**2)||a.id.localeCompare(b.id));
 const item=id?available.find(i=>i.id===id):available[0];if(!item)return false;
 if(!('kind' in item)){const ok=collectGoldGun(room,p,item.id,true);if(ok){p.recentPickups?.delete(item.id);p.nextSwapMs=room.simulationTimeMs+LOOT_CONFIG.recentPickupMs;}return ok;}
 if(item.kind!=='weapon')return false;
 const empty=inv.slots.indexOf(null),slot=empty>=0?empty:inv.activeSlot,old=inv.slots[slot];
 lootState(room).pickups.delete(item.id);cancelReload(p);grant(p,item.weapon);inv.slots[slot]=item.weapon;if(!inv.slots[inv.activeSlot])inv.activeSlot=slot;inv.revision++;
 if(old)dropWeapon(room,p,old);p.recentPickups?.delete(item.id);p.nextSwapMs=room.simulationTimeMs+LOOT_CONFIG.recentPickupMs;return true;
}
export function swapWeapon(room:GameRoom,p:RoomPlayer){return pickupWeapon(room,p);}
export function dropSlot(room:GameRoom,p:RoomPlayer,slot=p.state.inventory?.activeSlot??0){
 if(!eligibleShip(room,p)||(p.state.stunRemainingMs??0)>0)return false;
 const inv=p.state.inventory;if(!inv)return false;
 if(p.state.goldGunId){dropGoldGun(room,p);inv.revision++;cancelReload(p);return true;}
 if(!Number.isInteger(slot)||slot<0||slot>2)return false;const weapon=inv.slots[slot];if(!weapon)return false;
 dropWeapon(room,p,weapon);inv.slots[slot]=null;
 if(inv.activeSlot===slot){cancelReload(p);inv.activeSlot=Math.max(0,inv.slots.findIndex(w=>!!w));}
 inv.revision++;return true;
}
export function reorderSlots(p:RoomPlayer,from:number,to:number){
 const inv=p.state.inventory;if(!inv||p.state.goldGunId||!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>2||to>2||!inv.slots[from])return false;
 if(from===to)return true;[inv.slots[from],inv.slots[to]]=[inv.slots[to],inv.slots[from]];if(inv.activeSlot===from)inv.activeSlot=to;else if(inv.activeSlot===to)inv.activeSlot=from;inv.revision++;return true;
}
export function inventoryCommand(room:GameRoom|undefined,p:RoomPlayer|undefined,raw:unknown):InventoryResult {
 const r=parseInventoryCommand(raw),reject=(reason:string)=>({ok:false,reason});if(!r||!room||!p||room.players.get(p.state.id)!==p)return reject('Invalid inventory request');
 if(r.sequence<=(p.lastInventorySequence??0))return reject('Duplicate inventory request');p.lastInventorySequence=r.sequence;
 if(r.roomCode!==room.code||r.round!==room.match.round||r.reloadSession!==p.state.reloadSession||r.lifeGeneration!==p.state.lifeGeneration||r.teleportSequence!==p.state.teleportSequence||r.revision!==p.state.inventory?.revision||room.match.state!=='active'||!p.gameplayEnabled||p.state.status!=='ALIVE'||p.state.lifeState!=='active'||(p.state.stunRemainingMs??0)>0)return reject('Inactive or stale inventory');
 const ok=r.action==='switch'?switchSlot(p,r.slot!):r.action==='drop'?dropSlot(room,p,r.slot):r.action==='reorder'?reorderSlots(p,r.slot!,r.toSlot!):pickupWeapon(room,p,r.pickupId);return {ok,reason:ok?'Inventory updated':'Inventory action unavailable'};
}
export function advanceLoot(room:GameRoom){
 if(room.match.state!=='active')return;const s=lootState(room);
 for(const [id,item]of s.pickups)if(item.source==='drop'&&room.simulationTimeMs-item.spawnTimeMs>=LOOT_CONFIG.dropLifetimeMs)s.pickups.delete(id);
 const players=[...room.players.values()].filter(p=>lootEligible(room,p));
 for(const p of room.players.values())rememberPickupProximity(room,p);
 for(const item of [...s.pickups.values()]){
  if(item.kind!=='ammo')continue;
  const candidates=players.filter(p=>within(room,p,item)).sort((a,b)=>(a.state.x-item.x)**2+(a.state.y-item.y)**2-((b.state.x-item.x)**2+(b.state.y-item.y)**2)||a.state.id.localeCompare(b.state.id));
  for(const p of candidates){collectLoot(room,p,item.id);if(!s.pickups.has(item.id))break;}
 }
 if(room.simulationTimeMs>=s.nextReplenishMs){s.nextReplenishMs=room.simulationTimeMs+LOOT_CONFIG.replenishMs;if(s.pickups.size>=LOOT_CONFIG.cap-20)return;
 const world=[...s.pickups.values()].filter(p=>p.source==='world');if(world.filter(p=>p.kind==='weapon').length<LOOT_CONFIG.weaponCount)spawnWorld(room,'weapon');else if(world.filter(p=>p.kind==='ammo').length<LOOT_CONFIG.ammoCount)spawnWorld(room,'ammo');}
}
export function lootSnapshot(room:GameRoom):LootSnapshot {return {pickups:[...lootState(room).pickups.values()].map(p=>p.kind==='weapon'?{...p,weapon:{...p.weapon}}:{...p})};}
