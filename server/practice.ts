import {PRACTICE_HOLE,PRACTICE_SPAWN,PRACTICE_DEPOTS,PRACTICE_RESTOCK_MS} from '../shared/practice';
import {WEAPON_CLASSES,WEAPONS,AMMO_PACKS} from '../shared/weapons';
import type {LootPickup} from '../shared/loot';
import {resetLoot,lootState,addPickup,freshWeapon} from './inventory';
import {resetObjectives} from './objectives';
import {resetSurvival} from './survival';
import type {GameRoom} from './rooms';
export interface PracticeState {nextRestockMs:number;pads:Map<string,string>}
export function beginPractice(room:GameRoom){
 room.match.state='active';room.match.round=1;room.match.roster=[...room.players.keys()];room.match.phaseStartedAtMs=room.simulationTimeMs;
 room.blackHole={...PRACTICE_HOLE};resetSurvival(room);resetObjectives(room);resetLoot(room);lootState(room).nextReplenishMs=Infinity;
 // Practice supplies use the ordinary collection/consumption APIs; no free
 // reload, infinite reserve or changed weapon instance/stat values.
 room.survivalRound=room.match.round;room.nextSurvivalSpawnMs=Infinity;
 room.practice={nextRestockMs:room.simulationTimeMs,pads:new Map()};
 for(const p of room.players.values()){Object.assign(p.state,PRACTICE_SPAWN,{vx:0,vy:0,rotation:0});p.state.teleportSequence++;p.combatEnabled=p.gameplayEnabled=true;p.simulationTimeMs=room.simulationTimeMs;}
 advancePractice(room);
}
export function advancePractice(room:GameRoom){const state=room.practice;if(room.match.mode!=='practice'||!state||room.simulationTimeMs<state.nextRestockMs)return;state.nextRestockMs=room.simulationTimeMs+PRACTICE_RESTOCK_MS;
 const items=lootState(room).pickups;
 for(const [depotIndex,d]of PRACTICE_DEPOTS.entries()){
  for(let i=0;i<13;i++){const key=`${depotIndex}:${i}`;if(items.has(state.pads.get(key)??''))continue;const point={x:d.x+(i%5)*210,y:d.y+Math.floor(i/5)*210},base={...point,source:'world' as const,spawnTimeMs:room.simulationTimeMs};
   const item=i<5?addPickup(room,{...base,kind:'weapon',weapon:freshWeapon(WEAPON_CLASSES[i])} as Omit<LootPickup,'id'>):i<10?addPickup(room,{...base,kind:'ammo',ammoType:WEAPONS[WEAPON_CLASSES[i-5]].ammoType,quantity:AMMO_PACKS[WEAPONS[WEAPON_CLASSES[i-5]].ammoType]} as Omit<LootPickup,'id'>):addPickup(room,{...base,kind:i===10?'material':i===11?'cell':'repair',quantity:i===10?25:1} as Omit<LootPickup,'id'>);state.pads.set(key,item.id);
  }
 }
}
