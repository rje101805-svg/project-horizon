import {horizonAt,HORIZON_CORNERS,HORIZON_CONFIG} from '../shared/horizon';
import {triggerIntent} from './galaxy';
import {activeWeapon,WEAPONS,RARITIES,GALAXY_WEAPONS} from '../shared/weapons';
import {lootState,nearestWeapon,swapWeapon,pickupWeapon,switchSlot,lootEligible} from './inventory';
import type {GoldPickup} from '../shared/objectives';
import {objectiveState,eligibleShip} from './objectives';
import {SHIP_COLORS} from '../shared/rooms';
import { initialBotState, type BotStrategy } from '../shared/bots';
import { idleInput, TICK_SECONDS, type PlayerInput } from '../shared/flight';
import { ALIEN_MELEE_RANGE } from '../shared/alien';
import { inTractorCone } from '../shared/tractor';
import { acceptMovementInput } from './inputs';
import { fire } from './projectiles';
import { reload } from './reload';
import { activateTractor } from './tractor';
import type { GameRoom, RoomPlayer } from './rooms';

const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const eligible=(room:GameRoom,p:RoomPlayer)=>room.match.roster.includes(p.state.id) && p.gameplayEnabled && p.state.status==='ALIVE' && p.state.lifeState==='active' && p.state.health>0;

// Replace this writer in a future phase; reactive safety and hands stay intact.
export function selectBotStrategy(bot:RoomPlayer,candidates:RoomPlayer[]):BotStrategy {
 let target:RoomPlayer|undefined,distance=Infinity;
 for(const p of candidates){if(p===bot)continue;const d=Math.hypot(p.state.x-bot.state.x,p.state.y-bot.state.y);if(d<distance){distance=d;target=p;}}
 return {mode:target?'HUNT':'IDLE',target:target?.state.id??null};
}

// Replaceable deterministic intent writer; close combat and escape retain priority.
export function selectObjectiveStrategy(room:GameRoom,bot:RoomPlayer,combat:BotStrategy):BotStrategy {
 if(!eligibleShip(room,bot))return combat;
 const enemy=combat.target?room.players.get(combat.target):undefined;
 if(enemy&&Math.hypot(enemy.state.x-bot.state.x,enemy.state.y-bot.state.y)<320)return combat;
 const inv=bot.state.inventory;
 if(inv&&!bot.state.goldGunId){
  const loot=[...lootState(room).pickups.values()].filter(item=>Math.hypot(item.x-bot.state.x,item.y-bot.state.y)<1200).filter(item=>item.kind==='weapon'?(inv.slots.includes(null)||weaponValue(item.weapon,600)>weaponValue(activeWeapon(bot.state),600)+1):inv.slots.some(w=>w&&WEAPONS[w.class].ammoType===item.ammoType)&&inv.reserve[item.ammoType]<WEAPONS[inv.slots.find(w=>w&&WEAPONS[w.class].ammoType===item.ammoType)!.class].magazine*2);
  loot.sort((a,b)=>Math.hypot(a.x-bot.state.x,a.y-bot.state.y)-Math.hypot(b.x-bot.state.x,b.y-bot.state.y)||a.id.localeCompare(b.id));
  if(loot[0])return {...combat,mode:'LOOT',goal:{kind:'loot',id:loot[0].id,x:loot[0].x,y:loot[0].y}};
 }
 const objectives=objectiveState(room);
 if(!bot.state.goldGunId){let nearest:GoldPickup|undefined,distance=5000;
  for(const pickup of objectives.pickups.values()){const d=Math.hypot(pickup.x-bot.state.x,pickup.y-bot.state.y);if(d<distance){distance=d;nearest=pickup;}}
  if(nearest)return {...combat,mode:'GOLD_GUN',goal:{kind:'pickup',id:nearest.id,x:nearest.x,y:nearest.y}};
 }
 const elapsed=Math.max(0,room.simulationTimeMs-objectives.startedAtMs),slot=Math.max(0,SHIP_COLORS.findIndex(color=>color===bot.state.color));
 const continuing=objectives.planets.find(r=>r.planet.status!=='CONSUMED'&&!r.completed.has(bot.state.id)&&!r.planet.pickupId&&(r.ticks.get(bot.state.id)??0)>0);
 if(!continuing&&(elapsed+slot*5000)%45000>=30000)return combat;
 const candidates=objectives.planets.filter(r=>r.planet.status!=='CONSUMED'&&!r.completed.has(bot.state.id)&&!r.planet.pickupId);
 const record=continuing??candidates[(slot+Math.floor(elapsed/45000))%Math.max(1,candidates.length)];
 return record?{...combat,mode:'CAPTURE',goal:{kind:'capture',id:record.planet.id,x:record.planet.x,y:record.planet.y}}:combat;
}

function effectiveRange(bot:RoomPlayer){return bot.state.goldGunId?GALAXY_WEAPONS[bot.state.galaxyType??'cryo'].range:WEAPONS[activeWeapon(bot.state)?.class??'blaster'].range;}
export function lootFirst(room:GameRoom,bot:RoomPlayer){return !bot.botLootEnded&&!!room.horizon&&room.simulationTimeMs-room.horizon.startedAtMs<30000&&(bot.state.inventory?.slots.filter(Boolean).length??0)<2;}
function safeGoal(room:GameRoom,point:{x:number;y:number}){const h=room.horizon;if(!h)return true;const future=horizonAt(h.startedAtMs,room.simulationTimeMs+10000,h.corner),corner=HORIZON_CORNERS[h.corner];return Math.hypot(point.x-corner.x,point.y-corner.y)>future.radius+350;}
export function selectSurvivalStrategy(room:GameRoom,bot:RoomPlayer,combat:BotStrategy):BotStrategy{
 const s=bot.state,h=room.horizon;
 if(s.status==='ALIVE'&&h){const corner=HORIZON_CORNERS[h.corner],future=horizonAt(h.startedAtMs,room.simulationTimeMs+10000,h.corner),distance=Math.hypot(s.x-corner.x,s.y-corner.y);
  if(distance<future.radius+450){return {mode:'HUNT',target:null,goal:{kind:'escape',id:'horizon',x:corner.x===0?11900:100,y:corner.y===0?11900:100}};}
 }
 if(s.status==='ALIVE'&&s.health+s.shield<(s.maxHealth+s.maxShield)*.3&&room.simulationTimeMs-(bot.lastAttackedMs??-Infinity)<5000){const target=combat.target?room.players.get(combat.target):undefined;if(target){return {mode:'HUNT',target:null,goal:{kind:'escape',id:'retreat',x:Math.max(20,Math.min(11980,s.x+(s.x-target.state.x))),y:Math.max(20,Math.min(11980,s.y+(s.y-target.state.y)))}};}}
 const blocked=bot.botLootBlocked??=new Map();for(const [id,until]of blocked)if(until<=room.simulationTimeMs)blocked.delete(id);
 const previous=bot.botLootTarget;if(previous){const item=lootState(room).pickups.get(previous.id);if(!item){bot.botLootTarget=undefined;}else{const d=Math.hypot(item.x-s.x,item.y-s.y);if(d<previous.best-20){previous.best=d;previous.progressAtMs=room.simulationTimeMs;}else if(room.simulationTimeMs-previous.progressAtMs>5000){blocked.set(previous.id,room.simulationTimeMs+10000);bot.botLootTarget=undefined;}}}
 let strategy=selectObjectiveStrategy(room,bot,combat);
 if(lootFirst(room,bot)){
  const items=[...lootState(room).pickups.values()].filter(p=>!blocked.has(p.id)&&safeGoal(room,p)&&(p.kind==='weapon'||s.inventory?.slots.some(w=>w&&WEAPONS[w.class].ammoType===p.ammoType))).sort((a,b)=>Math.hypot(a.x-s.x,a.y-s.y)-Math.hypot(b.x-s.x,b.y-s.y)||a.id.localeCompare(b.id));
  if(items[0])strategy={...combat,mode:'LOOT',goal:{kind:'loot',id:items[0].id,x:items[0].x,y:items[0].y}};else{bot.botLootEnded=true;strategy=combat;}
 }
 if(strategy.goal&&(!safeGoal(room,strategy.goal)||blocked.has(strategy.goal.id)))strategy=combat;
 if(strategy.goal?.kind==='loot'&&bot.botLootTarget?.id!==strategy.goal.id)bot.botLootTarget={id:strategy.goal.id,best:Math.hypot(strategy.goal.x-s.x,strategy.goal.y-s.y),progressAtMs:room.simulationTimeMs};
 if(!strategy.goal)bot.botLootTarget=undefined;
 return strategy;
}

// Normal keyboard-style controls, bounded turning, and imperfect heading aim.
// No position/velocity writes or special bot movement statistics.
export function botHands(room:GameRoom,bot:RoomPlayer,strategy:BotStrategy,tick:number):PlayerInput {
 const s=bot.state,d=s.bot??=initialBotState(),target=strategy.target?room.players.get(strategy.target):undefined;
 d.goal=strategy.goal;
 Object.assign(d,strategy,{override:null,thrust:false,boost:false,fire:false,reload:false,tractor:false,melee:false,distance:0});
 const input={...idleInput(),aim:s.rotation};
 let dx=0,dy=0,heading=s.rotation;
 if(target && eligible(room,target)){
   dx=target.state.x-s.x;dy=target.state.y-s.y;d.distance=Math.hypot(dx,dy);
   heading=Math.atan2(dy,dx);
   const aim=updateBotAim(room,bot,target);
   if(s.status!=='ALIEN'){const speed=s.goldGunId?GALAXY_WEAPONS[s.galaxyType??'cryo'].speed:WEAPONS[activeWeapon(s)?.class??'blaster'].speed,travel=d.distance/speed;heading=Math.atan2(dy+(target.state.vy-s.vy)*travel*aim.lead,dx+(target.state.vx-s.vx)*travel*aim.lead)+aim.error;}
   const alien=s.status==='ALIEN';
   if(!alien && d.distance<100){
     // Exact overlap has no away vector; back out through normal controls.
     if(d.distance===0){dx=-Math.cos(s.rotation);dy=-Math.sin(s.rotation);}else{dx=-dx;dy=-dy;}
   } // Reposition, retaining independent weapon heading.
   else if(!alien && d.distance<320){const side=s.color%2?1:-1;const x=dx;dx=-dy*side;dy=x*side;}
   input.boost=d.distance>650;
   const error=Math.abs(angleDelta(heading,s.rotation));
   d.melee=alien && d.distance<=ALIEN_MELEE_RANGE;
   d.fire=!alien && d.distance<(s.goldGunId?GALAXY_WEAPONS[s.galaxyType??'cryo'].range:WEAPONS[activeWeapon(s)?.class??'blaster'].range) && room.simulationTimeMs>=aim.readyAt && error<.20 && !s.tractor.targetId && !s.isReloading;
   d.reload=!alien && !s.goldGunId && s.ammo===0 && !s.isReloading;
   d.tractor=!alien && !s.tractor.targetId && !s.tractor.cooldownRemainingMs && error<.25 && inTractorCone(s,target.state);
 }
 if(strategy.goal&&s.status==='ALIVE'){
  dx=strategy.goal.x-s.x;dy=strategy.goal.y-s.y;const distance=Math.hypot(dx,dy);
  if(distance<(strategy.goal.kind==='capture'?80:20))dx=dy=0;
  input.boost=distance>500;
  if(!target||d.distance>(s.goldGunId?GALAXY_WEAPONS[s.galaxyType??'cryo'].range:WEAPONS[activeWeapon(s)?.class??'blaster'].range))heading=Math.atan2(dy,dx);
 }
 if(s.status==='ALIVE' && s.tractor.attackerId){
   const attacker=room.players.get(s.tractor.attackerId);
   if(attacker){
     d.override='TRACTOR_ESCAPE';
     const ax=s.x-attacker.state.x,ay=s.y-attacker.state.y,length=Math.hypot(ax,ay)||1;
     const side=((ax*-Math.sin(attacker.state.rotation)+ay*Math.cos(attacker.state.rotation))>=0)?1:-1;
     dx=ax/length-Math.sin(attacker.state.rotation)*side*1.5;
     dy=ay/length+Math.cos(attacker.state.rotation)*side*1.5;
     heading=Math.atan2(dy,dx);
     input.boost=true;d.fire=d.tractor=d.melee=false;
   }
 }
 if(strategy.goal?.kind==='escape'){input.boost=true;d.fire=d.tractor=d.melee=false;d.override='HORIZON_ESCAPE';}
 if((s.launchProtectionRemainingMs??0)>0){d.fire=d.tractor=d.melee=false;}
 else if(lootFirst(room,bot)&&d.distance>=effectiveRange(bot)*.6&&room.simulationTimeMs-(bot.lastAttackedMs??-Infinity)>3000){d.fire=d.tractor=false;}
 if(dx || dy){const move=Math.atan2(dy,dx),x=Math.cos(move),y=Math.sin(move);input.right=x>.38;input.left=x<-.38;input.down=y>.38;input.up=y<-.38;}
 // 180 degrees/sec; seeded perception corrections never snap the heading.
 if(!target&&bot.botAim)bot.botAim.target=null;
 const desired=heading;
 input.aim=s.rotation+Math.max(-Math.PI*TICK_SECONDS,Math.min(Math.PI*TICK_SECONDS,angleDelta(desired,s.rotation)));
 if((s.stunRemainingMs??0)>0){d.fire=d.reload=d.tractor=d.melee=false;input.up=input.down=input.left=input.right=input.boost=false;}
 d.desiredHeading=desired;d.thrust=input.up||input.down||input.left||input.right;d.boost=input.boost;
 return input;
}

// Called once by the existing authoritative tick. No timers or fake clients.
export function advanceBots(room:GameRoom,now:number,tick:number) {
 if(room.match.state!=='active')return;
 const candidates:RoomPlayer[]=[];
 for(const p of room.players.values())if(eligible(room,p))candidates.push(p);
 for(const bot of room.players.values()){
   const s=bot.state;
   if(s.controllerType!=='BOT' || !bot.gameplayEnabled || s.lifeState!=='active' || s.health<=0)continue;
   if(lootEligible(room,bot)&&s.inventory){
     const target=selectBotStrategy(bot,candidates).target,distance=target?Math.hypot(room.players.get(target)!.state.x-s.x,room.players.get(target)!.state.y-s.y):600;
     if(!s.isReloading){const active=activeWeapon(s);let slot=s.inventory.activeSlot,score=active&&(active.magazine>0||s.inventory.reserve[WEAPONS[active.class].ammoType]>0)?weaponValue(active,distance):-1;s.inventory.slots.forEach((w,i)=>{if(!w)return;const usable=w.magazine>0||s.inventory!.reserve[WEAPONS[w.class].ammoType]>0,value=usable?weaponValue(w,distance):-1;if(value>score){score=value;slot=i;}});switchSlot(bot,slot);
       const item=nearestWeapon(room,bot);if(item&&s.inventory.slots.includes(null))pickupWeapon(room,bot,item.id);else if(item){let worst=0;s.inventory.slots.forEach((w,i)=>{if(weaponValue(w,distance)<weaponValue(s.inventory!.slots[worst],distance))worst=i;});if(weaponValue(item.weapon,distance)>weaponValue(s.inventory.slots[worst],distance)+1){switchSlot(bot,worst);swapWeapon(room,bot);}}
     }
   }
   const input=botHands(room,bot,selectSurvivalStrategy(room,bot,selectBotStrategy(bot,candidates)),tick);
   if(acceptMovementInput(bot,{...input,sequence:bot.lastReceivedSequence+1,lifeGeneration:s.lifeGeneration,teleportSequence:s.teleportSequence},now)){
     bot.botInputTick=tick;bot.botInputLife=s.lifeGeneration;bot.botInputTeleport=s.teleportSequence;
   }
 }
}
// Actions follow everyone's movement, so nose geometry uses the current tick.
// Result evaluation remains after the entire damage batch (including melee).
export function advanceBotActions(room:GameRoom,tick:number) {
 if(room.match.state!=='active')return;
 for(const bot of room.players.values()){
   const s=bot.state,d=s.bot;
   if(s.controllerType!=='BOT' || !d || !bot.gameplayEnabled || s.lifeState!=='active' || s.health<=0 || bot.botInputTick!==tick || bot.botInputLife!==s.lifeGeneration || bot.botInputTeleport!==s.teleportSequence)continue;
   // Respawn/teleport-only ticks must not reuse an old life's attack intention.
   if(d.reload)reload(room,bot,{sequence:bot.lastReloadSequence+1,roomCode:room.code,reloadSession:s.reloadSession,lifeGeneration:s.lifeGeneration,teleportSequence:s.teleportSequence});
   if(d.tractor)activateTractor(room,bot,{sequence:(bot.lastTractorSequence??0)+1,round:room.match.round,reloadSession:s.reloadSession,lifeGeneration:s.lifeGeneration,teleportSequence:s.teleportSequence});
   if(s.galaxyType==='titan')triggerIntent(room,bot,{sequence:(bot.lastTriggerSequence??0)+1,held:d.fire,roomCode:room.code,round:room.match.round,reloadSession:s.reloadSession,lifeGeneration:s.lifeGeneration,teleportSequence:s.teleportSequence});
   const pickup=nearestWeapon(room,bot);if(pickup&&!s.goldGunId&&s.inventory?.slots.includes(null))pickupWeapon(room,bot,pickup.id);
   if(d.fire || d.melee)fire(room,bot,{sequence:bot.lastFireSequence+1,aim:s.rotation,lifeGeneration:s.lifeGeneration,teleportSequence:s.teleportSequence},tick);
 }
}

function weaponValue(w:import('../shared/weapons').WeaponInstance|null,distance:number){if(!w)return -1;const role=w.class==='shotgun'?(distance<250?8:-4):w.class==='smg'?(distance<500?5:-3):w.class==='missile'?(distance>350?5:0):w.class==='zapper'?3:2;return RARITIES.indexOf(w.rarity)*3+role;}

// Private, seeded perception state; no accuracy bonuses or synthetic hit decisions.
function updateBotAim(room:GameRoom,bot:RoomPlayer,target:RoomPlayer){
 const s=bot.state;
 if(!bot.botAim||bot.botAim.life!==s.lifeGeneration||bot.botAim.teleport!==s.teleportSequence){let seed=2166136261;for(const c of s.name)seed=Math.imul(seed^c.charCodeAt(0),16777619);bot.botAim={target:null,readyAt:0,seed:seed>>>0,error:0,lead:1,nextCorrection:0,life:s.lifeGeneration,teleport:s.teleportSequence};}
 const a=bot.botAim,random=()=>{a.seed=(Math.imul(a.seed,1664525)+1013904223)>>>0;return a.seed/2**32;};
 if(a.target!==target.state.id){a.readyAt=room.simulationTimeMs+(a.target?300+random()*300:250+random()*200);a.target=target.state.id;a.nextCorrection=0;}
 if(room.simulationTimeMs>=a.nextCorrection){const distance=Math.hypot(target.state.x-s.x,target.state.y-s.y),speed=Math.hypot(target.state.vx,target.state.vy);a.error=(random()*2-1)*(.06+distance*.00009+speed*.00016);a.lead=.7+random()*.6;a.nextCorrection=room.simulationTimeMs+160+random()*180;}
 return a;
}
