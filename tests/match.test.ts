import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomStore, survivingHumans } from '../server/rooms';
import { advanceMatch, evaluateResult, matchSnapshot, startMatch } from '../server/match';
import { applyDamage, startReload } from '../server/combat';
import { fire, advanceProjectiles } from '../server/projectiles';
import { simulatePlayer } from '../server/simulation';
import { acceptMovementInput } from '../server/inputs';
import { runCombatDebug } from '../server/combat-debug';
import { idleInput } from '../shared/flight';
import { MATCH_RESET_DELAY_MS } from '../shared/match';
const source={type:'ENVIRONMENT',cause:'HAZARD'} as const;
function fixture(count=2) {
 const store=new RoomStore(()=> 'ABCD');store.create('a','<A>',0);const room=store.roomFor('a')!;
 for(let i=1;i<count;i++)store.join(String.fromCharCode(97+i),room.code,String.fromCharCode(65+i),0);
 const a=room.players.get('a')!,b=room.players.get('b')!;
 const kill=(id:string)=>applyDamage(room.players.get(id)!,150,source,100);
 const shot=(id:string,sequence=1)=>{const s=room.players.get(id)!.state;return {sequence,aim:0,lifeGeneration:s.lifeGeneration,teleportSequence:s.teleportSequence};};
 return {store,room,a,b,kill,shot};
}
test('waiting never awards solo/empty victory or draw; two eligible humans start a locked roster',()=>{
 const {store,room}=fixture(1);advanceMatch(room,0);evaluateResult(room,1);
 assert.equal(room.match.state,'waiting');assert.equal(room.match.result,null);assert.deepEqual(room.match.roster,[]);
 assert.equal(startMatch(room,'a',{round:0}).ok,false);
 store.join('b',room.code,'B',0);advanceMatch(room,2);assert.equal(room.match.state,'waiting');assert.equal(startMatch(room,'b',{round:0}).ok,false);assert.equal(startMatch(room,'a',{round:0,hostId:'a'}).ok,false);assert.ok(startMatch(room,'a',{round:0}).ok);assert.equal(room.match.state,'active');assert.deepEqual(room.match.roster,['a','b']);assert.equal(room.match.round,1);
 store.join('c',room.code,'C',0);assert.equal(survivingHumans(room),2);assert.deepEqual(room.match.roster,['a','b']);
 const empty=fixture(1);empty.store.leave('a');evaluateResult(empty.room,2);assert.equal(empty.room.match.result,null);
});
test('last human wins with copied identity/name; ended freezes damage, gun, melee, reload, movement and respawn',()=>{
 const {room,a,b,kill,shot}=fixture();advanceMatch(room,0);assert.ok(startMatch(room,'a',{round:0}).ok);a.state.ammo=11;startReload(a);fire(room,b,shot('b'),0);
 kill('b');evaluateResult(room,100);assert.deepEqual(room.match.result,{kind:'winner',winnerId:'a',winnerName:'<A>'});
 assert.equal(b.state.status,'ALIEN');assert.equal(b.respawnAtMs,null);assert.equal(room.projectiles.size,0);
 const frozen=structuredClone([...room.players.values()].map(p=>p.state));const locked=structuredClone(room.match.result);
 assert.equal(applyDamage(a,1000,source),null);assert.equal(fire(room,a,shot('a'),3).ok,false);assert.equal(fire(room,b,shot('b',2),3).ok,false);assert.equal(startReload(a),false);
 assert.equal(acceptMovementInput(a,{...idleInput(),right:true,sequence:1,lifeGeneration:0,teleportSequence:0},1),false);
 assert.equal(runCombatDebug(a,{action:'damage',lifeGeneration:0,teleportSequence:0},true).ok,false);
 simulatePlayer(b,room,4000,4000);advanceProjectiles(room);evaluateResult(room,4000);
 assert.deepEqual([...room.players.values()].map(p=>p.state),frozen);assert.deepEqual(room.match.result,locked);
 a.state.name='changed';assert.equal(room.match.result?.kind==='winner'&&room.match.result.winnerName,'<A>');
 const copy=matchSnapshot(room);copy.roster.length=0;assert.equal(room.match.roster.length,2);
});
test('same tick reciprocal projectiles yield a draw after all damage resolves; draw is immutable',()=>{
 const {room,a,b,shot,store}=fixture();advanceMatch(room,0);assert.ok(startMatch(room,'a',{round:0}).ok);
 Object.assign(a.state,{x:200,y:1800,health:25,shield:0});Object.assign(b.state,{x:270,y:1800,health:25,shield:0});
 assert.equal(fire(room,a,shot('a'),0).ok,true);assert.equal(fire(room,b,{...shot('b'),aim:Math.PI},0).ok,true);
 advanceProjectiles(room);assert.equal(survivingHumans(room),0);evaluateResult(room,100);assert.deepEqual(room.match.result,{kind:'draw'});
 store.leave('b');evaluateResult(room,101);assert.deepEqual(room.match.result,{kind:'draw'});
 advanceMatch(room,6099);assert.equal(room.match.state,'ended');advanceMatch(room,6100);assert.equal(room.match.state,'waiting');assert.equal(a.state.status,'ALIVE');assert.equal(room.match.result,null);
});
test('human disconnect awards victory; winner disconnect cannot replace locked result',()=>{
 const {store,room}=fixture();advanceMatch(room,100);assert.ok(startMatch(room,'a',{round:0}).ok);store.leave('b');assert.deepEqual(room.match.result,{kind:'winner',winnerId:'a',winnerName:'<A>'});
 store.join('c',room.code,'C',0);store.leave('a');assert.deepEqual(room.match.result,{kind:'winner',winnerId:'a',winnerName:'<A>'});
 advanceMatch(room,6100);assert.equal(room.match.state,'waiting');assert.equal(room.players.get('c')!.state.status,'ALIVE');
 store.join('d',room.code,'D',0);advanceMatch(room,6101);assert.equal(room.match.state,'waiting');assert.equal(room.match.hostId,'c');assert.ok(startMatch(room,'c',{round:room.match.round}).ok);assert.deepEqual(room.match.roster,['c','d']);assert.equal(room.match.result,null);
});
test('alien disconnect during active round does not alter eligible humans or end the round',()=>{
 const {store,room,kill}=fixture(3);advanceMatch(room,0);assert.ok(startMatch(room,'a',{round:0}).ok);kill('c');evaluateResult(room,100);assert.equal(room.match.state,'active');
 store.leave('c');assert.equal(room.match.state,'active');assert.equal(survivingHumans(room),2);assert.equal(room.match.result,null);
});
test('late join cannot move, shoot, damage, be hit or obstruct bullets; becomes human at next reset',()=>{
 const {store,room,a,b,shot,kill}=fixture();advanceMatch(room,0);assert.ok(startMatch(room,'a',{round:0}).ok);store.join('c',room.code,'C',0);const c=room.players.get('c')!;
 Object.assign(a.state,{x:200,y:1800});Object.assign(b.state,{x:300,y:1800});Object.assign(c.state,{x:270,y:1800});
 assert.equal(c.state.status,'OUT');assert.equal(c.gameplayEnabled,false);assert.equal(fire(room,c,shot('c'),0).ok,false);assert.equal(applyDamage(c,150,source),null);
 assert.equal(acceptMovementInput(c,{...idleInput(),right:true,sequence:1,lifeGeneration:0,teleportSequence:0},1),false);
 assert.equal(fire(room,a,shot('a'),0).ok,true);advanceProjectiles(room);advanceProjectiles(room);assert.equal(c.state.shield,50);assert.equal(b.state.shield,25);
 kill('b');evaluateResult(room,100);advanceMatch(room,6100);assert.equal(room.match.state,'waiting');assert.deepEqual(room.match.roster,[]);assert.ok(startMatch(room,'a',{round:1}).ok);assert.deepEqual(room.match.roster,['a','b','c']);assert.equal(c.state.status,'ALIVE');assert.equal(c.gameplayEnabled,true);
});
test('six-second reset clears alien/combat/feedback state, restores resources and markers; consecutive winners differ',()=>{
 const {room,a,b,kill,shot}=fixture();advanceMatch(room,0);assert.ok(startMatch(room,'a',{round:0}).ok);kill('b');evaluateResult(room,100);
 b.state.lastMeleeDamage=5;b.invulnerableUntilMs=99999;b.state.spawnInvulnerabilityRemainingMs=2000;
 const oldShot=shot('a'),oldSession=a.state.reloadSession,oldSequence=a.lastFireSequence;
 advanceMatch(room,6099);assert.equal(room.match.state,'ended');assert.equal(room.match.resetRemainingMs,1);
 assert.equal(advanceMatch(room,6100),true);assert.equal(room.match.round,1);assert.equal(room.match.state,'waiting');assert.equal(room.match.result,null);
 for(const p of [a,b]){assert.equal(p.simulationTimeMs,6100);assert.equal(p.humanEliminated,false);assert.equal(p.state.status,'ALIVE');assert.equal(p.state.lifeState,'active');assert.equal(p.state.health,100);assert.equal(p.state.shield,50);assert.equal(p.state.ammo,12);assert.equal(p.state.isReloading,false);assert.equal(p.state.lastMeleeDamage,0);assert.equal(p.state.spawnInvulnerabilityRemainingMs,0);assert.equal(p.invulnerableUntilMs,0);assert.equal(p.respawnAtMs,null);assert.deepEqual(p.pendingInputs,[]);assert.equal(p.state.lastDamageSource,null);}
 assert.equal(a.state.reloadSession,oldSession);assert.equal(a.lastFireSequence,oldSequence);
 assert.equal(fire(room,a,oldShot,4).ok,false);assert.equal(room.projectiles.size,0);
 assert.equal(startMatch(room,'a',{round:0}).ok,false);assert.ok(startMatch(room,'a',{round:1}).ok);assert.equal(room.match.round,2);
 applyDamage(a,150,source);assert.equal(a.respawnAtMs,9100);evaluateResult(room,6200);assert.deepEqual(room.match.result,{kind:'winner',winnerId:'b',winnerName:'B'});
 assert.equal(MATCH_RESET_DELAY_MS,6000);
});

test('host assignment is deterministic, server-owned, and does not grant eligibility or bypass state/start validation',()=>{
 const {store,room,kill}=fixture(3);assert.equal(room.match.hostId,'a');
 for(const raw of [null,{},[],{round:-1},{round:NaN},{round:1},{round:0,playerId:'a'}])assert.equal(startMatch(room,'a',raw).ok,false);
 assert.equal(startMatch(room,'unknown',{round:0}).ok,false);assert.equal(startMatch(undefined,'a',{round:0}).ok,false);
 assert.equal(startMatch(room,'b',{round:0}).ok,false);store.leave('a');assert.equal(room.match.hostId,'b');
 assert.ok(startMatch(room,'b',{round:0}).ok);assert.equal(startMatch(room,'b',{round:1}).ok,false);kill('b');evaluateResult(room,100);
 assert.deepEqual(room.match.result,{kind:'winner',winnerId:'c',winnerName:'C'});assert.equal(startMatch(room,'b',{round:1}).ok,false);
 store.leave('b');assert.equal(room.match.hostId,'c');assert.equal(room.match.result?.kind==='winner'&&room.match.result.winnerId,'c');
});
