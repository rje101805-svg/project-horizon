import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RoomStore} from '../server/rooms';
import {startMatch,advanceMatch,evaluateResult} from '../server/match';
import {applyDamage,advanceCombatTick} from '../server/combat';
import {advanceObjectives,objectiveState,objectivesSnapshot,collectGoldGun,eligibleShip} from '../server/objectives';
import {equipGoldGun} from '../server/equipment';
import {PLANET_REGIONS} from '../shared/planets';
import {PLANET_REGIONS as VISUAL_PLANETS} from '../src/visual/solar-layout';
import {CAPTURE_TICKS} from '../shared/objectives';
import {GOLD_GUN} from '../shared/weapons';
import {TICK_MS,WORLD,EDGE_MARGIN} from '../shared/flight';
import {fire,advanceProjectiles} from '../server/projectiles';
import {reload} from '../server/reload';
import {BASIC_BLASTER} from '../shared/projectiles';
import {selectBotStrategy,selectObjectiveStrategy,botHands,advanceBotActions,advanceBots} from '../server/bots';
import {objectiveArrow} from '../src/objective-presentation';
function fixture(bots=false){
 const store=new RoomStore();store.create('a','Redline',0);const room=store.roomFor('a')!;store.join('b',room.code,'Blue',0);store.join('c',room.code,'Third',0);
 if(bots)store.fill(room,'a',{roomCode:room.code,round:0});assert.equal(startMatch(room,'a',{round:0}).ok,true);
 const [a,b,c]=[...room.players.values()];for(const p of room.players.values())Object.assign(p.state,{x:400,y:1800,vx:0,vy:0});
 const record=objectiveState(room).planets[0],planet=record.planet;
 const inside=(p=a)=>Object.assign(p.state,{x:planet.x,y:planet.y});
 const outside=(p=a)=>Object.assign(p.state,{x:planet.x+planet.captureRadius+100,y:planet.y});
 const tick=(n=1)=>{for(let i=0;i<n;i++){room.simulationTimeMs+=TICK_MS;advanceObjectives(room);}};
 const pickup=()=>[...objectiveState(room).pickups.values()][0];
 return {store,room,a,b,c,record,planet,inside,outside,tick,pickup};
}
test('capture uses the one shared map, exact boundary and 300 simulation ticks while flying',()=>{
 assert.equal(PLANET_REGIONS,VISUAL_PLANETS);const f=fixture();f.inside();
 for(let i=0;i<CAPTURE_TICKS-1;i++){f.a.state.x=f.planet.x+Math.cos(i)*f.planet.captureRadius*.6;f.a.state.y=f.planet.y+Math.sin(i)*f.planet.captureRadius*.6;f.tick();}
 assert.equal(f.pickup(),undefined);assert.equal(f.record.ticks.get('a'),299);f.tick();assert.ok(f.pickup());assert.equal(f.record.ticks.get('a'),300);assert.equal(f.record.completed.has('a'),true);assert.equal(f.a.state.goldGunId,null);
 const gun=f.pickup()!;assert.ok(Math.hypot(gun.x-f.planet.x,gun.y-f.planet.y)>f.planet.radius*1.15);assert.ok(Math.hypot(gun.x-f.a.state.x,gun.y-f.a.state.y)>GOLD_GUN.pickupRadius);assert.ok(gun.x>=EDGE_MARGIN&&gun.x<=WORLD-EDGE_MARGIN&&gun.y>=EDGE_MARGIN&&gun.y<=WORLD-EDGE_MARGIN);
 f.tick(100);assert.equal(objectiveState(f.room).pickups.size,1);assert.equal(objectiveState(f.room).announcements.filter(a=>a.kind==='captured').length,1);
});
test('eight seconds minus two outside seconds leaves four seconds and clamps at zero',()=>{
 const f=fixture();f.inside();f.tick(240);f.outside();f.tick(60);assert.equal(f.record.ticks.get('a'),120);f.tick(100);assert.equal(f.record.ticks.get('a'),0);f.inside();f.tick();assert.equal(f.record.ticks.get('a'),1);
});
test('nonlethal damage, reload and firing do not cancel capture',()=>{
 const f=fixture();f.inside();f.tick(150);applyDamage(f.a,25,{type:'PLAYER',playerId:'b'},f.room.simulationTimeMs);assert.equal(f.a.state.shield,25);
 assert.equal(fire(f.room,f.a,{sequence:1,aim:0,lifeGeneration:0,teleportSequence:0},1).ok,true);
 assert.equal(reload(f.room,f.a,{sequence:1,roomCode:f.room.code,reloadSession:f.a.state.reloadSession,lifeGeneration:0,teleportSequence:0}).ok,true);
 f.tick(150);assert.ok(f.pickup());
});
test('independent progress pauses inside contests, outside decay continues, and resumes without transfer',()=>{
 const f=fixture();f.inside();f.tick(120);f.outside();f.inside(f.b);f.tick(30);assert.equal(f.record.ticks.get('a'),60);assert.equal(f.record.ticks.get('b'),30);
 f.inside();f.tick(20);assert.equal(f.planet.status,'CONTESTED');assert.equal(f.record.ticks.get('a'),60);assert.equal(f.record.ticks.get('b'),30);f.outside(f.b);f.tick();assert.equal(f.record.ticks.get('a'),61);assert.equal(f.record.ticks.get('b'),28);
});
test('aliens, dead, queued and unrostered members cannot capture or contest',()=>{
 for(const invalid of ['alien','dead','queued','unrostered'] as const){const f=fixture();f.inside();f.inside(f.b);
 if(invalid==='alien')f.b.state.status='ALIEN';if(invalid==='dead')f.b.state.lifeState='dead';if(invalid==='queued')f.b.state.queuedForNextRound=true;if(invalid==='unrostered')f.room.match.roster=f.room.match.roster.filter(id=>id!=='b');
 f.tick(10);assert.equal(f.record.ticks.get('a'),10);assert.equal(f.record.ticks.get('b'),undefined);assert.equal(eligibleShip(f.room,f.b),false);}
});
test('successful capturers and Gold holders still contest, and unclaimed planetary rewards block capture',()=>{
 const f=fixture();f.inside();f.tick(300);const id=f.pickup()!.id;f.outside();f.inside(f.b);f.tick(100);assert.equal(f.record.ticks.get('b'),undefined);assert.equal(f.planet.status,'GOLD_GUN_AVAILABLE');
 Object.assign(f.c.state,{x:f.pickup()!.x,y:f.pickup()!.y});assert.equal(collectGoldGun(f.room,f.c,id),true);f.outside(f.c);f.tick(60);assert.equal(f.record.ticks.get('b'),60);
 f.inside();f.tick(30);assert.equal(f.planet.status,'CONTESTED');assert.equal(f.record.ticks.get('b'),60);f.outside();f.inside(f.c);f.tick(30);assert.equal(f.planet.status,'CONTESTED');assert.equal(f.record.ticks.get('b'),60);
 f.outside(f.b);f.outside(f.c);f.inside();f.tick(300);assert.equal(f.planet.status,'AVAILABLE');assert.equal(f.pickup(),undefined);assert.equal(f.record.completed.has('a'),true);
});
test('third-party collection is atomic, automatic and cannot award a second gun',()=>{
 const f=fixture();f.inside();f.tick(300);const gun=f.pickup()!;Object.assign(f.b.state,{x:gun.x,y:gun.y});Object.assign(f.c.state,{x:gun.x,y:gun.y});f.tick();
 assert.equal(f.b.state.goldGunId,gun.id);assert.equal(f.c.state.goldGunId,null);assert.equal(f.pickup(),undefined);assert.equal(f.planet.pickupId,null);assert.equal(collectGoldGun(f.room,f.c,gun.id),false);assert.equal(objectiveState(f.room).announcements.filter(a=>a.kind==='claimed').length,1);
 const extra={...gun,id:'extra'};objectiveState(f.room).pickups.set(extra.id,extra);assert.equal(collectGoldGun(f.room,f.b,'extra'),false);assert.equal(objectiveState(f.room).pickups.size,1);
});
test('outside-radius, alien, stale references and forged pickup IDs cannot acquire',()=>{
 const f=fixture();f.inside();f.tick(300);const gun=f.pickup()!;assert.equal(collectGoldGun(f.room,f.b,gun.id),false);assert.equal(collectGoldGun(f.room,f.b,'forged'),false);
 Object.assign(f.b.state,{x:gun.x,y:gun.y,status:'ALIEN'});assert.equal(collectGoldGun(f.room,f.b,gun.id),false);assert.equal(equipGoldGun(f.b,gun.id),false);
 f.b.state.status='ALIVE';f.store.leave('b');assert.equal(collectGoldGun(f.room,f.b,gun.id),false);assert.ok(f.pickup());
});
test('death drops exactly once, clears equipment, preserves history, and dropped pickups do not block recapture',()=>{
 const f=fixture();f.inside();f.tick(300);const gun=f.pickup()!;Object.assign(f.a.state,{x:gun.x,y:gun.y});assert.equal(collectGoldGun(f.room,f.a,gun.id),true);
 applyDamage(f.a,999,{type:'PLAYER',playerId:'b'},f.room.simulationTimeMs);assert.equal(f.a.state.goldGunId,null);assert.equal(f.pickup()!.source,'drop');assert.equal(f.pickup()!.id,gun.id);assert.equal(f.planet.pickupId,null);assert.equal(f.record.completed.has('a'),true);
 applyDamage(f.a,999,{type:'PLAYER',playerId:'b'},f.room.simulationTimeMs);assert.equal(objectiveState(f.room).pickups.size,1);assert.equal(objectiveState(f.room).announcements.filter(a=>a.kind==='dropped').length,1);
 f.inside(f.b);f.tick(300);assert.equal(objectiveState(f.room).pickups.size,2);assert.equal(f.record.completed.has('b'),true);
 Object.assign(f.c.state,{x:gun.x,y:gun.y});assert.equal(collectGoldGun(f.room,f.c,gun.id),true);assert.equal(f.c.state.goldGunId,gun.id);
});
test('disconnect stops progress, drops ownership, and active-round rejoin cannot bypass limits',()=>{
 const f=fixture();f.inside();f.tick(100);f.store.leave('a');f.tick();assert.equal(f.record.ticks.has('a'),false);assert.notEqual(f.planet.status,'CAPTURING');
 assert.equal(f.store.join('new-a',f.room.code,'Redline',0).ok,true);const rejoined=f.room.players.get('new-a')!;f.inside(rejoined);f.tick(300);assert.equal(eligibleShip(f.room,rejoined),false);assert.equal(f.record.completed.has('new-a'),false);
 const g=fixture();g.inside();g.tick(300);const gun=g.pickup()!;Object.assign(g.b.state,{x:gun.x,y:gun.y});collectGoldGun(g.room,g.b,gun.id);g.store.leave('b');assert.equal(g.pickup()!.source,'drop');assert.equal(g.record.completed.has('a'),true);
});
test('completed history survives disconnect and a reconnecting spectator cannot claim the abandoned reward',()=>{
 const f=fixture();f.inside();f.tick(300);const gun=f.pickup()!;f.store.leave('a');assert.equal(f.record.completed.has('a'),true);assert.equal(f.pickup()!.id,gun.id);
 assert.equal(f.store.join('new-a',f.room.code,'Redline',0).ok,true);const returned=f.room.players.get('new-a')!;Object.assign(returned.state,{x:gun.x,y:gun.y});assert.equal(collectGoldGun(f.room,returned,gun.id),false);
 Object.assign(f.b.state,{x:gun.x,y:gun.y});assert.equal(collectGoldGun(f.room,f.b,gun.id),true);f.outside(f.b);f.inside(returned);f.tick(300);assert.equal(f.record.completed.has('new-a'),false);assert.equal(f.pickup(),undefined);
});
test('a Gold holder can earn an unused capture but cannot auto-collect the second reward',()=>{
 const f=fixture();equipGoldGun(f.a,'existing-gold');f.inside();f.tick(300);assert.equal(f.record.completed.has('a'),true);assert.equal(f.a.state.goldGunId,'existing-gold');assert.ok(f.pickup());f.tick();assert.equal(objectiveState(f.room).pickups.size,1);
 f.inside(f.b);f.tick();assert.equal(f.planet.status,'CONTESTED');assert.equal(f.record.ticks.get('b'),undefined);
});
test('multiple planetary completions produce one reward each; reset removes all history and gear',()=>{
 const f=fixture();Object.assign(f.a.state,{x:PLANET_REGIONS[0].x,y:PLANET_REGIONS[0].y});Object.assign(f.b.state,{x:PLANET_REGIONS[1].x,y:PLANET_REGIONS[1].y});f.tick(300);assert.equal(objectiveState(f.room).pickups.size,2);
 const gun=f.pickup()!;Object.assign(f.c.state,{x:gun.x,y:gun.y});collectGoldGun(f.room,f.c,gun.id);applyDamage(f.a,999,{type:'PLAYER',playerId:'c'});applyDamage(f.b,999,{type:'PLAYER',playerId:'c'});evaluateResult(f.room,f.room.simulationTimeMs);assert.equal(f.room.match.state,'ended');assert.equal(advanceMatch(f.room,f.room.simulationTimeMs+6000),true);
 assert.equal(objectiveState(f.room).pickups.size,0);assert.ok(objectiveState(f.room).planets.every(p=>p.completed.size===0&&p.ticks.size===0));assert.ok([...f.room.players.values()].every(p=>!p.state.goldGunId));assert.equal(objectiveState(f.room).announcements.length,0);
});
test('meaningful starts/restarts are announced once rather than on every tick',()=>{
 const f=fixture();f.inside();f.tick(120);assert.equal(objectiveState(f.room).announcements.length,1);assert.equal(objectiveState(f.room).announcements[0].text,'REDLINE IS CAPTURING BOREALIS');f.inside(f.b);f.tick(30);f.outside(f.b);f.tick(30);assert.equal(objectiveState(f.room).announcements.filter(a=>a.kind==='started').length,2);
});
test('Gold uses existing swept damage, five-tick cooldown, no regular ammo and no reload',()=>{
 const f=fixture();assert.equal(equipGoldGun(f.a,'trusted-fixture-gun'),true);f.a.state.ammo=0;Object.assign(f.a.state,{x:1000,y:1800,rotation:0});Object.assign(f.b.state,{x:1040,y:1800});
 const request=(sequence:number)=>({sequence,aim:0,lifeGeneration:0,teleportSequence:0});const result=fire(f.room,f.a,request(1),0);assert.ok(result.ok&&result.kind!=='melee');const bullet=f.room.projectiles.get(result.projectileId)!;
 assert.equal(bullet.damage,GOLD_GUN.damage);assert.equal(bullet.weapon,'gold');assert.equal(bullet.vx,BASIC_BLASTER.muzzleSpeed);assert.equal(f.a.state.ammo,0);assert.equal(f.a.state.isReloading,false);assert.ok(Math.abs(f.a.combatTimers.cooldown-5)<1e-9);advanceProjectiles(f.room);assert.equal(f.b.state.shield,10);
 for(let i=0;i<4;i++)advanceCombatTick(f.a);assert.equal(fire(f.room,f.a,request(2),1).ok,false);advanceCombatTick(f.a);assert.equal(fire(f.room,f.a,request(3),2).ok,true);
 assert.equal(reload(f.room,f.a,{sequence:1,roomCode:f.room.code,reloadSession:f.a.state.reloadSession,lifeGeneration:0,teleportSequence:0}).ok,false);
});
test('normal fire cannot forge Gold stats, and infinite sustained Gold fire respects bounded cap',()=>{
 const f=fixture();const result=fire(f.room,f.a,{sequence:1,aim:0,lifeGeneration:0,teleportSequence:0,weapon:'gold',damage:999},0);assert.ok(result.ok&&result.kind!=='melee');assert.equal(f.room.projectiles.get(result.projectileId)!.damage,40.5);f.room.projectiles.clear();equipGoldGun(f.a,'gold');Object.assign(f.a.state,{x:6000,y:6000});
 let fired=0;for(let i=0;i<120;i++){advanceCombatTick(f.a);if(i%5===0){assert.equal(fire(f.room,f.a,{sequence:i+2,aim:0,lifeGeneration:0,teleportSequence:0},i).ok,true);fired++;}advanceProjectiles(f.room);assert.ok(f.room.projectiles.size<=GOLD_GUN.maxActive);}
 assert.equal(fired,24);assert.equal(f.a.state.ammo,0);assert.equal(f.a.state.isReloading,false);
});
test('bots share capture, contest, collect, firing and drop rules; intent preserves escape priority',()=>{
 const f=fixture(true),bot=[...f.room.players.values()].find(p=>p.state.controllerType==='BOT')!;f.inside(bot);f.tick(300);const gun=f.pickup()!;assert.ok(objectiveState(f.room).announcements.some(a=>a.text===`${bot.state.name.toUpperCase()} CAPTURED BOREALIS`));Object.assign(bot.state,{x:gun.x,y:gun.y});f.tick();assert.equal(bot.state.goldGunId,gun.id);
 Object.assign(bot.state,{x:1000,y:1800,rotation:0});Object.assign(f.a.state,{x:1400,y:1800});bot.state.tractor.cooldownRemainingMs=15000;advanceBots(f.room,0,1);advanceBotActions(f.room,1);assert.ok([...f.room.projectiles.values()].some(p=>p.ownerId===bot.state.id&&p.weapon==='gold'));
 applyDamage(bot,999,{type:'PLAYER',playerId:'a'},f.room.simulationTimeMs);assert.equal(f.pickup()!.source,'drop');assert.equal(bot.state.goldGunId,null);assert.equal(bot.state.status,'ALIEN');
 const g=fixture(true),b=[...g.room.players.values()].find(p=>p.state.controllerType==='BOT')!;Object.assign(b.state,{x:5000,y:5000});g.room.simulationTimeMs=1000;
 const strategy=selectObjectiveStrategy(g.room,b,selectBotStrategy(b,[g.a]));assert.equal(strategy.mode,'CAPTURE');assert.ok(strategy.goal);b.state.tractor.attackerId='a';b.state.tractor.anchorX=g.a.state.x;b.state.tractor.anchorY=g.a.state.y;const input=botHands(g.room,b,strategy,1);assert.equal(b.state.bot!.override,'TRACTOR_ESCAPE');assert.equal(input.boost,true);
 b.state.status='ALIEN';assert.equal(selectObjectiveStrategy(g.room,b,{mode:'HUNT',target:'a'}).mode,'HUNT');
});
test('objective snapshots are isolated copies and arrows follow camera/zoom direction',()=>{
 const f=fixture();f.inside();f.tick();const snapshot=objectivesSnapshot(f.room);snapshot.planets[0].occupants.length=0;snapshot.planets[0].progress[0].progressMs=9999;snapshot.announcements.length=0;assert.equal(f.planet.occupants.length,1);assert.equal(f.record.ticks.get('a'),1);assert.equal(objectiveState(f.room).announcements.length,1);
 const a=objectiveArrow({x:9000,y:1000},{centerX:1000,centerY:1000},1,1100,600);assert.equal(a.angle,0);assert.equal(a.x,1064);assert.equal(a.y,300);
 const b=objectiveArrow({x:1000,y:0},{centerX:1000,centerY:1000},2,1100,600);assert.equal(b.angle,-Math.PI/2);assert.equal(b.y,36);assert.equal(b.x,550);
});
