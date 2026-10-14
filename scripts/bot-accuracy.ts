import {RoomStore} from '../server/rooms';
import {startActiveFixture} from '../tests/active-fixture';
import {botHands} from '../server/bots';
import {fire,advanceProjectiles} from '../server/projectiles';
import {advanceCombatTick} from '../server/combat';
import {WEAPONS,type WeaponClass} from '../shared/weapons';
import {TICK_MS} from '../shared/flight';
// Controlled perception/projectile benchmark. Movement navigation is isolated;
// target follows continuous triangular strafes, while actual weapon collision,
// cooldown, finite magazines and reload ticks use production functions.
export function measureAccuracy(weapon:WeaponClass,speed:number,seed:number,shotsWanted=400){
 const store=new RoomStore();store.play('human','Target','fill',0);const room=store.roomFor('human')!;startActiveFixture(room,'human',{round:0});const bot=[...room.players.values()].find(p=>p.state.controllerType==='BOT')!,target=room.players.get('human')!;
 for(const p of [...room.players.values()])if(p!==bot&&p!==target)room.players.delete(p.state.id);
 Object.assign(bot.state,{x:6000,y:6000,rotation:0});Object.assign(target.state,{x:6500,y:6000});bot.botAim={target:null,readyAt:0,seed,error:0,lead:1,nextCorrection:0,life:bot.state.lifeGeneration,teleport:bot.state.teleportSequence};
 const w=bot.state.inventory!.slots[0]!;Object.assign(w,{class:weapon,magazine:WEAPONS[weapon].magazine,capacity:WEAPONS[weapon].magazine});bot.state.ammo=w.magazine;bot.state.maxAmmo=w.capacity;bot.state.inventory!.reserve[WEAPONS[weapon].ammoType]=1e6;
 let shots=0,hits=0,lastShotTick=0;
 for(let tick=1;tick<200000;tick++){
  room.simulationTimeMs=tick*TICK_MS;bot.simulationTimeMs=target.simulationTimeMs=room.simulationTimeMs;
  const phase=(room.simulationTimeMs/1000*speed+500)%2000,offset=phase<1000?phase-500:1500-phase;
  Object.assign(target.state,{x:6500,y:6000+offset,vx:0,vy:speed*(phase<1000?1:-1),health:100,shield:100,stunRemainingMs:0,stunImmunityRemainingMs:0});
  advanceCombatTick(bot);const hands=botHands(room,bot,{mode:'HUNT',target:'human'},tick);bot.state.rotation=hands.aim;
  if(shots<shotsWanted&&bot.state.bot!.fire){const result=fire(room,bot,{sequence:bot.lastFireSequence+1,aim:bot.state.rotation,lifeGeneration:bot.state.lifeGeneration,teleportSequence:bot.state.teleportSequence},tick);if(result.ok){shots++;lastShotTick=tick;}}
  advanceProjectiles(room,hit=>{if(hit.targetId==='human')hits++;},tick);
  if(shots>=shotsWanted&&tick>lastShotTick+110)break;
 }
 return {weapon,distance:500,targetSpeed:speed,seed,shots,hits,hitPercent:+(100*hits/shots).toFixed(2)};
}
if(process.argv[1]?.endsWith('bot-accuracy.ts'))for(const weapon of ['blaster','smg','zapper'] as const)for(const speed of [0,290,440]){const results=[17,29,41,53].map(seed=>measureAccuracy(weapon,speed,seed));const shots=results.reduce((n,r)=>n+r.shots,0),hits=results.reduce((n,r)=>n+r.hits,0);console.log(JSON.stringify({weapon,distance:500,targetSpeed:speed,shots,hits,hitPercent:+(100*hits/shots).toFixed(2),runs:results}));}
