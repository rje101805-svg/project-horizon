import {mkdirSync,writeFileSync} from 'node:fs';
import {RoomStore} from '../server/rooms';import {startMatch,advanceMatch} from '../server/match';
import {advanceSurvival,utility,collectUtility} from '../server/survival';import {acceptMovementInput} from '../server/inputs';import {simulatePlayer} from '../server/simulation';
import {WORLD,NORMAL_SPEED,TICK_MS,idleInput} from '../shared/flight';import {SURVIVAL} from '../shared/survival';import {lootState} from '../server/inventory';
const store=new RoomStore();store.play('host','Host','fill',0);const room=store.roomFor('host')!;
if(!startMatch(room,'host',{round:0}).ok)throw Error('start');advanceMatch(room,3000);advanceMatch(room,4800);advanceMatch(room,9200);
const begin=performance.now();advanceSurvival(room);const spawnCpuMs=performance.now()-begin,initialPickups=lootState(room).pickups.size;
const routes=[];let now=room.simulationTimeMs;
for(const p of room.players.values()){
 const start=now,position={x:p.state.x,y:p.state.y};let ticks=0;
 while(utility(p)!.materials<40&&ticks<1800){now+=TICK_MS;room.simulationTimeMs=now;const dx=WORLD/2-p.state.x,dy=WORLD/2-p.state.y,heading=Math.atan2(dy,dx),input={...idleInput(),right:Math.cos(heading)>.38,left:Math.cos(heading)<-.38,down:Math.sin(heading)>.38,up:Math.sin(heading)<-.38,aim:heading};
  acceptMovementInput(p,{...input,sequence:p.lastReceivedSequence+1,lifeGeneration:p.state.lifeGeneration,teleportSequence:p.state.teleportSequence},now);simulatePlayer(p,room,now,now);advanceSurvival(room);ticks++;
 }
 const elapsedMs=now-start;if(utility(p)!.materials<40||elapsedMs>60000)throw Error(`Unfunded landing ${p.state.id}`);
 routes.push({name:p.state.name,landing:position,ordinarySpeed:NORMAL_SPEED,elapsedMs,materials:utility(p)!.materials,wallsAffordable:Math.floor(utility(p)!.materials/20),travelDistance:Math.hypot(p.state.x-position.x,p.state.y-position.y)});
}
const report={world:WORLD,materialCount:SURVIVAL.materialCount,healingCount:SURVIVAL.healingCount,initialPickups,materialPolicy:'Reject whole pickup unless its complete value fits; preserve remainder death stacks.',spawnCpuMs,routes,hardwareGpuVerified:false};
mkdirSync('docs/art-reference/p3s5',{recursive:true});writeFileSync('docs/art-reference/p3s5/economy-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
