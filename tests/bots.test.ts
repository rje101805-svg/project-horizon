import {fighterStats} from '../shared/fighters';
import {utility} from '../server/survival';
import {beginHorizon} from '../server/horizon';
import {settleBotPerception} from './active-fixture';
import {startActiveFixture as startMatch,replayFixture} from './active-fixture';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { RoomStore, activeParticipants } from '../server/rooms';
import { evaluateResult, advanceMatch, roundHumans } from '../server/match';
import { advanceBots, advanceBotActions, botHands, selectBotStrategy } from '../server/bots';
import { activateTractor, advanceTractors } from '../server/tractor';
import { applyDamage } from '../server/combat';
import { simulatePlayer } from '../server/simulation';
import { advanceProjectiles, fire } from '../server/projectiles';
import { createGameServer } from '../server/game';
import { idleInput, TICK_MS } from '../shared/flight';
import { stepMovement } from '../shared/movement';

function fixture(humans=1){const store=new RoomStore();store.create('a','A',0,humans===1?'fill':'wait');const room=store.roomFor('a')!;for(let i=1;i<humans;i++)store.join(`h${i}`,room.code,`Human ${i}`,0);const fill=()=>store.fill(room,'a',{roomCode:room.code,round:room.match.round});return {store,room,fill};}
function fighting(){const f=fixture();f.fill();startMatch(f.room,'a',{round:0});const [a,b,c]=[...f.room.players.values()];for(const [i,p] of [...f.room.players.values()].entries())Object.assign(p.state,{x:200+i*100,y:1800,rotation:0});return {...f,a,b,c};}
const tractorRequest=(f:ReturnType<typeof fighting>,p=f.a)=>({sequence:(p.lastTractorSequence??0)+1,round:f.room.match.round,reloadSession:p.state.reloadSession,lifeGeneration:p.state.lifeGeneration,teleportSequence:p.state.teleportSequence});
for(const humans of [1,3,7,8])test(`${humans===1?'FILL':'WAIT'} ${humans} humans respects fixed mode and socket-free bots`,()=>{
 const f=fixture(humans);assert.equal(f.fill().ok,humans===1);const bots=[...f.room.players.values()].filter(p=>p.state.controllerType==='BOT');assert.equal(bots.length,humans===1?7:0);assert.equal(f.room.players.size,humans===1?8:humans);
 const ids=bots.map(p=>p.state.id);assert.equal(new Set(ids).size,ids.length);for(const b of bots){assert.ok(b.state.bot);assert.equal(f.store.roomFor(b.state.id),undefined);assert.equal(b.gameplayEnabled,true);assert.equal(b.combatEnabled,false);}
 for(let i=0;i<10;i++)assert.equal(f.fill().ok,humans===1);assert.deepEqual([...f.room.players.values()].filter(p=>p.state.bot).map(p=>p.state.id),ids);
 startMatch(f.room,'a',{round:0});assert.equal(f.room.match.roster.length,humans===1?8:humans);assert.equal(roundHumans(f.room).length,humans===1?8:humans);
});
test('fill rejects forgery, stale tokens, non-host, WAIT, active and ended',()=>{
 const f=fixture();for(const raw of [null,[],{}, {roomCode:f.room.code,round:1},{roomCode:f.room.code,round:0,target:'bot'}])assert.equal(f.store.fill(f.room,'a',raw).ok,false);
 assert.equal(f.store.fill(f.room,'stranger',{roomCode:f.room.code,round:0}).ok,false);assert.equal(f.fill().ok,true);startMatch(f.room,'a',{round:0});assert.equal(f.fill().ok,false);f.room.match.state='ended';assert.equal(f.fill().ok,false);assert.equal(fixture(2).fill().ok,false);
});
test('FILL code join replaces exactly one lobby bot and preserves capacity',()=>{
 const f=fixture();f.fill();const bot=[...f.room.players.values()].at(-1)!;const ids=[...f.room.players.keys()];assert.equal(f.store.join('b',f.room.code,'B',0).ok,true);assert.deepEqual([...f.room.players.keys()],ids.filter(id=>id!==bot.state.id).concat('b'));assert.equal(f.room.players.has(bot.state.id),false);assert.equal(f.room.players.size,8);
});
test('late humans cannot affect FILL roster; explicit replay preserves every bot ID and resets controller state',()=>{
 const f=fighting(),original=[...f.room.match.roster];for(const id of ['q1','q2','q3'])assert.equal(f.store.join(id,f.room.code,id,0).ok,false);
 assert.deepEqual(f.room.match.roster,original);assert.equal(activeParticipants(f.room).length,8);const winner=f.b;for(const p of activeParticipants(f.room))if(p!==winner)applyDamage(p,999,{type:'PLAYER',playerId:winner.state.id});evaluateResult(f.room,0);
 assert.deepEqual(f.room.match.result,{kind:'winner',winnerId:winner.state.id,winnerName:winner.state.name});assert.equal(replayFixture(f.room,6000),true);assert.deepEqual([...f.room.players.keys()],original);assert.equal([...f.room.players.values()].filter(p=>p.state.bot).length,7);
 for(const p of f.room.players.values()){assert.equal(p.state.status,'ALIVE');assert.equal(p.state.health,100);assert.equal(p.state.shield,fighterStats(p.state).maxShield);assert.equal(p.state.ammo,30);if(p.state.bot){assert.equal(p.state.bot.target,null);assert.equal(p.state.bot.override,null);assert.equal(p.state.bot.mode,'IDLE');}}
 startMatch(f.room,'a',{round:1});assert.equal(roundHumans(f.room).length,8);
});
test('FILL rejects queued humans; final human disconnect destroys every bot and its controller state',()=>{
 const f=fighting();for(let i=0;i<7;i++)assert.equal(f.store.join(`q${i}`,f.room.code,'Q',0).ok,false);const refs=[...f.room.players.values()].filter(p=>p.state.bot);f.store.leave('a');assert.equal(f.store.rooms.size,0);assert.equal(f.room.players.size,0);for(const b of refs){assert.equal(b.state.bot,undefined);assert.equal(b.gameplayEnabled,false);}
});
test('target selection excludes self/alien/spectator and hands turn, move, aim imperfectly and reacquire',()=>{
 const f=fighting();f.c.state.status='ALIEN';f.room.players.get([...f.room.players.keys()][3])!.state.status='OUT';
 const candidates=roundHumans(f.room);const strategy=selectBotStrategy(f.b,candidates);assert.equal(strategy.target,'a');const input=botHands(f.room,f.b,strategy,1);assert.ok(input.up||input.down||input.left||input.right);assert.ok(Math.abs(input.aim)<=Math.PI/30+.001);assert.notEqual(input.aim,Math.PI);
 applyDamage(f.a,999,{type:'ENVIRONMENT',cause:'HAZARD'});assert.notEqual(selectBotStrategy(f.b,roundHumans(f.room)).target,'a');
});
test('bot fires normal projectiles, shield-first damage, cooldown/ammo and normal reload',()=>{
 const f=fighting();Object.assign(f.b.state,{x:200,y:1800});Object.assign(f.a.state,{x:500,y:1800});f.b.state.tractor.cooldownRemainingMs=15000;
 for(const p of f.room.players.values())if(p!==f.a&&p!==f.b)Object.assign(p.state,{x:1000,y:200});
 settleBotPerception(f.room);advanceBots(f.room,0,1);advanceBotActions(f.room,1);assert.equal(f.b.state.ammo,29);assert.ok([...f.room.projectiles.values()].some(p=>p.ownerId===f.b.state.id));
 for(let i=0;i<12;i++)advanceProjectiles(f.room,undefined,i);assert.equal(f.a.state.shield,59.5);assert.equal(f.a.state.health,100);
 advanceBotActions(f.room,1);assert.equal(f.b.state.ammo,29);f.b.state.ammo=0;advanceBots(f.room,0,2);advanceBotActions(f.room,2);assert.equal(f.b.state.isReloading,true);
 for(let i=0;i<69;i++)simulatePlayer(f.b,f.room,0,i*TICK_MS);assert.equal(f.b.state.ammo,30);assert.equal(f.b.state.isReloading,false);
});
for(const attackerBot of [false,true])test(`tractor escape overrides chase and breaks normally (${attackerBot?'bot':'human'} attacker)`,()=>{
 const f=fighting(),attacker=attackerBot?f.c:f.a;Object.assign(attacker.state,{x:200,y:1800,rotation:0});Object.assign(f.b.state,{x:350,y:1800});if(attackerBot)f.a.state.x=1000;
 assert.equal(activateTractor(f.room,attacker,tractorRequest(f,attacker)).ok,true);const oldTarget=f.b.state.bot!.target;
 const input=botHands(f.room,f.b,{mode:'HUNT',target:attacker.state.id},1);assert.equal(f.b.state.bot!.override,'TRACTOR_ESCAPE');assert.equal(input.boost,true);assert.equal(input.down,true);assert.equal(input.right,true);assert.equal(f.b.state.bot!.tractor,false);
 let elapsed=0;while(f.b.state.tractor.attackerId && elapsed<2900){elapsed+=TICK_MS;const input=botHands(f.room,f.b,{mode:'HUNT',target:attacker.state.id},elapsed/TICK_MS);stepMovement(f.b.state,input,f.room.blackHole);advanceTractors(f.room,elapsed,true);}
 assert.equal(f.b.state.status,'ALIVE');assert.equal(f.b.state.tractor.attackerId,null);assert.ok(elapsed<3000);assert.ok(attacker.state.tractor.cooldownRemainingMs>0);
 botHands(f.room,f.b,{mode:'HUNT',target:attacker.state.id},100);assert.equal(f.b.state.bot!.override,null);assert.equal(f.b.state.bot!.mode,'HUNT');assert.equal(oldTarget,null);
});
test('bot tractor attack uses existing validated beam and successfully tracked bot can still die at 3s',()=>{
 const f=fighting();Object.assign(f.b.state,{x:200,y:1800});Object.assign(f.a.state,{x:350,y:1800});settleBotPerception(f.room);advanceBots(f.room,0,1);advanceBotActions(f.room,1);assert.equal(f.b.state.tractor.targetId,'a');assert.equal(f.b.state.ammo,30);
 advanceTractors(f.room,2999,true);assert.equal(f.a.state.status,'ALIVE');advanceTractors(f.room,3000,true);assert.equal(f.a.state.status,'ALIEN');
 const g=fighting();g.a.state.x=1000;Object.assign(g.b.state,{x:350,y:1800});Object.assign(g.c.state,{x:200,y:1800,rotation:0});activateTractor(g.room,g.c,tractorRequest(g,g.c));
 // Keep the victim maneuvering; the attacker tracks its actual bearing.
 for(let i=1;i<=90;i++){const time=i*TICK_MS;const input=botHands(g.room,g.b,{mode:'HUNT',target:g.c.state.id},i);const tracking={...input,aim:Math.atan2(g.b.state.y-g.c.state.y,g.b.state.x-g.c.state.x)};stepMovement(g.b.state,input,g.room.blackHole);stepMovement(g.c.state,tracking,g.room.blackHole);advanceTractors(g.room,time,true);}
 assert.equal(g.b.state.status,'ALIEN');assert.equal(g.b.state.deathSource?.type,'TRACTOR');
});
test('alien bot uses full respawn, human-only melee, no bullets/tractor, and resumes after death',()=>{
 const f=fighting();applyDamage(f.b,999,{type:'PLAYER',playerId:'a'},0);assert.equal(f.b.state.status,'ALIEN');assert.equal(roundHumans(f.room).length,7);simulatePlayer(f.b,f.room,3000,3000);assert.equal(f.b.state.health,40);assert.equal(f.b.state.shield,0);assert.equal(f.b.state.ammo,0);
 Object.assign(f.b.state,{x:230,y:1800});f.a.state.x=200;const count=f.room.projectiles.size;advanceBots(f.room,3000,90);advanceBotActions(f.room,90);assert.equal(f.b.state.bot!.target,'a');assert.equal(f.b.state.bot!.melee,true);assert.equal(f.a.state.shield,95);assert.equal([...f.room.projectiles.values()].filter(p=>p.ownerId===f.b.state.id).length,0);assert.equal(f.b.state.tractor.targetId,null);assert.equal(f.b.invulnerableUntilMs,0);
 assert.equal(activateTractor(f.room,f.b,tractorRequest(f,f.b)).ok,false);applyDamage(f.b,40,{type:'PLAYER',playerId:'a'},3000);simulatePlayer(f.b,f.room,6000,6000);assert.equal(f.b.state.status,'ALIEN');advanceBots(f.room,6000,180);assert.equal(f.b.state.bot!.mode,'HUNT');
});
for(const boost of [false,true])test(`tractor attacker has identical normal thrust/steering/boost ${boost}`,()=>{
 const f=fighting();activateTractor(f.room,f.a,tractorRequest(f));const beam=structuredClone(f.a.state),normal=structuredClone(f.a.state);normal.tractor.targetId=null;
 for(let i=0;i<30;i++){const input={...idleInput(),right:true,up:true,boost,aim:i*.01};stepMovement(beam,input,f.room.blackHole);stepMovement(normal,input,f.room.blackHole);assert.deepEqual({x:beam.x,y:beam.y,vx:beam.vx,vy:beam.vy,rotation:beam.rotation},{x:normal.x,y:normal.y,vx:normal.vx,vy:normal.vy,rotation:normal.rotation});}
 assert.equal(fire(f.room,f.a,{sequence:1,aim:0,lifeGeneration:f.a.state.lifeGeneration,teleportSequence:f.a.state.teleportSequence},0).ok,false);
});
test('eight-participant production loop is bounded over multiple rounds with no socket bots',async()=>{
 const f=fixture();f.fill();const ids=[...f.room.players.keys()],server=createGameServer([],f.store,{autoTick:false});const begin=performance.now();let rounds=0;
 try{for(let i=0;i<18200;i++){if(f.room.match.state==='ended')replayFixture(f.room,f.room.simulationTimeMs);if(f.room.match.state==='waiting'){startMatch(f.room,'a',{round:f.room.match.round});beginHorizon(f.room,()=>0);rounds++;}server.step();assert.ok((f.room.walls?.size??0)<=24);assert.ok(activeParticipants(f.room).length<=8);for(const p of f.room.players.values()){assert.ok(Number.isFinite(p.state.x)&&Number.isFinite(p.state.y));assert.ok(p.state.ammo>=0);const u=utility(p);if(u){assert.ok(u.materials>=0&&u.materials<=300);assert.ok(u.cells>=0&&u.cells<=3);assert.ok(u.kits>=0&&u.kits<=2);}assert.ok(p.pendingInputs.length<=8);}}
 assert.ok(rounds>=2);assert.deepEqual([...f.room.players.keys()],ids);assert.equal(server.io.sockets.sockets.size,0);console.log(`8-participant 18200-tick run: ${(performance.now()-begin).toFixed(1)}ms, ${rounds} rounds`);
 }finally{await server.close();}
});

test('alien respawn cannot replay prior-life bot attacks or cancel fresh spawn protection',()=>{
 const f=fighting();Object.assign(f.b.state,{x:200,y:1800,rotation:0});f.a.state.x=500;settleBotPerception(f.room);advanceBots(f.room,0,1);assert.equal(f.b.state.bot!.fire,true);applyDamage(f.b,999,{type:'PLAYER',playerId:'a'},0);simulatePlayer(f.b,f.room,3000,3000);
 assert.equal(f.b.state.status,'ALIEN');assert.equal(f.b.invulnerableUntilMs,5000);advanceBotActions(f.room,90);assert.equal(f.b.invulnerableUntilMs,5000);assert.equal(f.b.state.spawnInvulnerabilityRemainingMs,2000);
 advanceBots(f.room,3000,91);advanceBotActions(f.room,91);assert.equal(f.b.invulnerableUntilMs,5000);
 Object.assign(f.b.state,{x:f.a.state.x+30,y:f.a.state.y});advanceBots(f.room,3000,92);advanceBotActions(f.room,92);assert.equal(f.b.invulnerableUntilMs,0);assert.equal(f.b.state.lastMeleeDamage,5);
});

test('exactly overlapping human-form bot repositions through normal flight rather than remaining motionless',()=>{
 const f=fighting();Object.assign(f.b.state,{x:f.a.state.x,y:f.a.state.y,rotation:0});
 const input=botHands(f.room,f.b,{mode:'HUNT',target:'a'},1);assert.equal(input.left,true);assert.equal(input.boost,false);assert.equal(f.b.state.bot!.thrust,true);
 const x=f.b.state.x;stepMovement(f.b.state,input,f.room.blackHole);assert.ok(f.b.state.x<x);assert.equal(f.a.state.status,'ALIVE');
});
