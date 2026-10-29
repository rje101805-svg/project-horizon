import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RoomStore} from '../server/rooms';
import {startActiveFixture} from './active-fixture';
import {beginHorizon,updateHorizon,advanceHorizon,lockFinalCollapse} from '../server/horizon';
import {evaluateResult,playAgain} from '../server/match';
import {applyDamage} from '../server/combat';
import {battleSnapshot} from '../server/battle';
import {WORLD} from '../shared/world';
function fixture(){
 const store=new RoomStore();store.play('a','HORIZON','wait',0);const room=store.roomFor('a')!;
 store.join('b',room.code,'Beta',0);store.join('c',room.code,'Gamma',0);
 assert.ok(startActiveFixture(room,'a',{round:0}).ok);beginHorizon(room,()=>0);
 const players=[...room.players.values()];for(const p of players){p.launchProtectionUntilMs=0;p.invulnerableUntilMs=0;Object.assign(p.state,{x:WORLD-20,y:WORLD-20,health:100,shield:100});}
 const at=(elapsed:number)=>{room.simulationTimeMs=room.horizon!.startedAtMs+elapsed;updateHorizon(room);lockFinalCollapse(room);};
 return {store,room,players,at,a:players[0],b:players[1],c:players[2]};
}
test('ordinary last-survivor victory remains immediate, named HORIZON is a pilot winner, and replay clears results',()=>{
 const f=fixture();for(const p of [f.b,f.c])applyDamage(p,999,{type:'ENVIRONMENT',cause:'HAZARD'},f.room.simulationTimeMs);
 evaluateResult(f.room,f.room.simulationTimeMs);assert.deepEqual(f.room.match.result,{kind:'winner',winnerId:'a',winnerName:'HORIZON'});
 assert.equal(battleSnapshot(f.room)!.standings.find(p=>p.id==='a')!.status,'WINNER');assert.equal(battleSnapshot(f.room)!.remaining,1);
 assert.ok(playAgain(f.room,'a',{round:f.room.match.round}).ok);assert.equal(f.room.match.result,null);assert.equal(f.room.battle,undefined);assert.equal(f.room.finalCollapseEligible,undefined);
});
test('final collapse keeps last eligible pilot active until consumed, excludes old aliens, and orders staggered consumption',()=>{
 const f=fixture();applyDamage(f.c,999,{type:'ENVIRONMENT',cause:'HAZARD'},f.room.simulationTimeMs);
 f.at(270000);assert.deepEqual(f.room.finalCollapseEligible,['a','b']);Object.assign(f.a.state,{x:0,y:0});
 advanceHorizon(f.room);evaluateResult(f.room,f.room.simulationTimeMs);assert.equal(f.room.match.state,'active');assert.equal(f.room.match.result,null);
 // An old alien's later body/HP cannot affect eligibility or durability ranking.
 Object.assign(f.c.state,{lifeState:'active',health:1000,x:0,y:0});f.at(270034);Object.assign(f.b.state,{x:0,y:0,health:1,shield:0});advanceHorizon(f.room);
 assert.deepEqual(f.room.match.result,{kind:'winner',winnerId:'b',winnerName:'Beta',reason:'final-collapse'});
 const rows=battleSnapshot(f.room)!.standings;assert.equal(rows.find(p=>p.id==='b')!.status,'WINNER');assert.equal(rows.find(p=>p.id==='b')!.placement,1);assert.equal(rows.find(p=>p.id==='a')!.placement,2);assert.equal(rows.find(p=>p.id==='c')!.placement,3);
 assert.equal(f.b.state.status,'ALIEN');assert.equal(f.b.respawnAtMs,null);assert.ok(f.players.every(p=>!p.gameplayEnabled&&p.state.respawnRemainingMs===0));
 assert.ok(playAgain(f.room,'a',{round:f.room.match.round}).ok);assert.equal(f.room.finalCollapseEligible,undefined);assert.deepEqual(f.room.horizonConsumed,[]);
});
for(const reverse of [false,true])test(`same-tick consumption ranks exact HP, independent of iteration order (${reverse})`,()=>{
 const f=fixture();if(reverse)f.room.players=new Map([...f.room.players].reverse());f.at(300000);
 Object.assign(f.a.state,{health:90,shield:90});Object.assign(f.b.state,{health:100,shield:20});Object.assign(f.c.state,{health:1,shield:0});advanceHorizon(f.room);
 assert.deepEqual(f.room.match.result,{kind:'winner',winnerId:'a',winnerName:'HORIZON',reason:'final-collapse'});
 const rows=battleSnapshot(f.room)!.standings;assert.deepEqual(['a','b','c'].map(id=>rows.find(p=>p.id===id)!.placement),[1,2,3]);assert.equal(rows.find(p=>p.id==='a')!.status,'WINNER');
 // Repeated snapshots must preserve final competitive status.
 assert.equal(battleSnapshot(f.room)!.standings.find(p=>p.id==='a')!.status,'WINNER');
});
test('exact tick and combined HP tie shares first place with explicit DRAW status, not ID/name tiebreak',()=>{
 const f=fixture();f.at(300000);Object.assign(f.a.state,{health:80,shield:100});Object.assign(f.b.state,{health:100,shield:80});f.c.state.shield=0;advanceHorizon(f.room);
 assert.deepEqual(f.room.match.result,{kind:'draw',reason:'final-collapse',winnerIds:['a','b']});
 const rows=battleSnapshot(f.room)!.standings;assert.deepEqual(['a','b','c'].map(id=>rows.find(p=>p.id===id)!.placement),[1,1,3]);assert.ok(rows.filter(p=>p.id!=='c').every(p=>p.status==='DRAW'));
});
test('environment outcome only when final collapse starts with no eligible competitors',()=>{
 const f=fixture();for(const p of f.players)applyDamage(p,999,{type:'ENVIRONMENT',cause:'HAZARD'},f.room.simulationTimeMs);
 f.at(270000);advanceHorizon(f.room);assert.deepEqual(f.room.match.result,{kind:'environment'});assert.ok(battleSnapshot(f.room)!.standings.every(p=>p.status!=='WINNER'));
});
test('combat elimination after final-collapse eligibility locks cannot award an earlier consumed alien',()=>{
 const f=fixture();f.at(270000);Object.assign(f.a.state,{x:0,y:0});advanceHorizon(f.room);
 for(const p of [f.b,f.c])applyDamage(p,999,{type:'ENVIRONMENT',cause:'HAZARD'},f.room.simulationTimeMs+34);
 f.at(270034);advanceHorizon(f.room);evaluateResult(f.room,f.room.simulationTimeMs);assert.deepEqual(f.room.match.result,{kind:'draw'});
});

 test('final standings freeze through later departures and alien-state changes',()=>{
  const f=fixture();for(const p of [f.b,f.c])applyDamage(p,999,{type:'ENVIRONMENT',cause:'HAZARD'},f.room.simulationTimeMs);
  evaluateResult(f.room,f.room.simulationTimeMs);const original=battleSnapshot(f.room)!.standings;
  f.room.simulationTimeMs+=5000;f.store.leave('a');f.c.state.kills=99;
  assert.deepEqual(battleSnapshot(f.room)!.standings,original);
 });
