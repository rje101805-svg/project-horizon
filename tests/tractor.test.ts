import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomStore } from '../server/rooms';
import { startMatch, evaluateResult, advanceMatch } from '../server/match';
import { activateTractor, advanceTractors } from '../server/tractor';
import { applyDamage, startReload } from '../server/combat';
import { fire } from '../server/projectiles';
import { simulatePlayer } from '../server/simulation';
import { idleInput, TICK_MS } from '../shared/flight';
import { TRACTOR_RANGE, TRACTOR_PULL_STRENGTH, TRACTOR_COOLDOWN_MS, TRACTOR_MAX_DURATION_MS, TRACTOR_KILL_LOCK_MS, inTractorCone } from '../shared/tractor';
import { stepMovement } from '../shared/movement';
import { LocalPredictor } from '../src/prediction';
function fixture(count=3,start=true){
 const store=new RoomStore();store.create('a','A',0);const room=store.roomFor('a')!;
 for(let i=1;i<count;i++)store.join(String.fromCharCode(97+i),room.code,'Pilot',0);
 const [a,b,c]=[...room.players.values()];for(const [i,p] of [...room.players.values()].entries())Object.assign(p.state,{x:200+i*100,y:1800,rotation:0});
 if(start)assert.equal(startMatch(room,'a',{round:0}).ok,true);
 const request=(p=a,sequence=(p.lastTractorSequence??0)+1)=>({sequence,round:room.match.round,lifeGeneration:p.state.lifeGeneration,teleportSequence:p.state.teleportSequence,reloadSession:p.state.reloadSession});
 const activate=()=>activateTractor(room,a,request());
 const tick=(time:number)=>{room.simulationTimeMs=time;advanceTractors(room,time);for(const p of room.players.values())simulatePlayer(p,room,time,time);advanceTractors(room,time,true);evaluateResult(room,time);};
 return {store,room,a,b,c,request,activate,tick};
}
test('tractor ACTIVE human acquisition selects nearest in-cone human with full resources, one victim only',()=>{
 const f=fixture();assert.equal(f.activate().ok,true);assert.equal(f.a.state.tractor.targetId,'b');assert.equal(f.b.state.tractor.attackerId,'a');assert.equal(f.c.state.tractor.attackerId,null);assert.equal(f.b.state.shield,50);assert.equal(f.a.state.tractor.cooldownRemainingMs,15000);
 assert.equal(f.activate().ok,false);
});
test('tractor rejects waiting/ended, aliens, spectators, stale/malformed/forged packets and invalid geometry without cooldown',()=>{
 for(const mode of ['waiting','ended','alien','dead','zero health','spectator','outside range','outside cone','forged','stale round','stale life','stale teleport','stale session'] as const){
  const f=fixture(2,mode!=='waiting');let r:unknown=f.request();
  if(mode==='ended')f.room.match.state='ended';if(mode==='alien')f.a.state.status='ALIEN';if(mode==='dead')f.a.state.lifeState='dead';if(mode==='zero health')f.a.state.health=0;if(mode==='spectator')f.room.match.roster=['b'];
  if(mode==='outside range')f.b.state.x=f.a.state.x+TRACTOR_RANGE+1;if(mode==='outside cone')f.b.state.y+=200;
  if(mode==='forged')r={...f.request(),targetId:'b'};if(mode==='stale round')r={...f.request(),round:0};if(mode==='stale life')r={...f.request(),lifeGeneration:99};if(mode==='stale teleport')r={...f.request(),teleportSequence:99};if(mode==='stale session')r={...f.request(),reloadSession:'forged'};
  assert.equal(activateTractor(f.room,f.a,r).ok,false,mode);assert.equal(f.a.state.tractor.cooldownRemainingMs,0);assert.equal(f.room.tractorBeams?.size??0,0);
 }
 const f=fixture(2);for(const raw of [null,[],{}, {sequence:NaN}, {...f.request(),sequence:0}])assert.equal(activateTractor(f.room,f.a,raw).ok,false);
 assert.equal(activateTractor(undefined,f.a,f.request()).ok,false);assert.equal(activateTractor(f.room,undefined,f.request()).ok,false);
});
test('aliens and late spectators cannot be acquired or activate even when nearer than valid humans',()=>{
 const f=fixture();f.c.state.status='ALIEN';f.c.humanEliminated=true;f.c.state.x=240;
 f.store.join('d',f.room.code,'Spectator',0);const d=f.room.players.get('d')!;Object.assign(d.state,{x:230,y:1800});
 assert.equal(activateTractor(f.room,d,f.request(d)).ok,false);assert.equal(activateTractor(f.room,f.c,f.request(f.c)).ok,false);
 assert.equal(f.activate().ok,true);assert.equal(f.a.state.tractor.targetId,'b');
});
test('cone follows ship orientation; LOS hook can block acquisition or end a valid beam without refund',()=>{
 const f=fixture(2);f.a.state.rotation=Math.PI;assert.equal(f.activate().ok,false);f.a.state.rotation=0;
 f.room.tractorLOS=()=>false;assert.equal(f.activate().ok,false);assert.equal(f.a.state.tractor.cooldownRemainingMs,0);
 f.room.tractorLOS=()=>true;assert.equal(f.activate().ok,true);f.room.tractorLOS=()=>false;advanceTractors(f.room,100);
 assert.equal(f.a.state.tractor.targetId,null);assert.equal(f.b.state.tractor.attackerId,null);assert.equal(f.a.state.tractor.cooldownRemainingMs,14900);
 assert.equal(inTractorCone({...f.a.state,rotation:Math.PI/2},{x:200,y:1900}),true);
});
for(const escape of ['turn','cone','range','round','teleport','life'] as const)test(`tractor ends on ${escape} without reacquiring or refunding cooldown`,()=>{
 const f=fixture();assert.equal(f.activate().ok,true);
 if(escape==='turn')f.a.state.rotation=Math.PI;if(escape==='cone')f.b.state.y+=150;if(escape==='range')f.b.state.x+=TRACTOR_RANGE;if(escape==='round')f.room.match.round++;if(escape==='teleport')f.b.state.teleportSequence++;if(escape==='life')f.a.state.lifeGeneration++;
 advanceTractors(f.room,100);assert.equal(f.a.state.tractor.targetId,null);assert.equal(f.b.state.tractor.attackerId,null);assert.equal(f.c.state.tractor.attackerId,null);assert.equal(f.a.state.tractor.cooldownRemainingMs,14900);assert.equal(f.activate().ok,false);
});
test('nonlethal attacker/victim/third-party damage does not break beam; lethal damage immediately clears both references',()=>{
 for(const victim of ['a','b'] as const){const f=fixture();assert.equal(f.activate().ok,true);applyDamage(f.a,10,{type:'PLAYER',playerId:'b'});applyDamage(f.a,50,{type:'PLAYER',playerId:'c'});applyDamage(f.b,10,{type:'PLAYER',playerId:'a'});
 assert.equal(f.a.state.shield,0);assert.equal(f.a.state.health,90);assert.equal(f.a.state.tractor.targetId,'b');
 applyDamage(f[victim],1000,{type:'ENVIRONMENT',cause:'HAZARD'});assert.equal(f.a.state.tractor.targetId,null);assert.equal(f.b.state.tractor.attackerId,null);assert.equal(f.room.tractorBeams!.size,0);assert.equal(f.a.state.tractor.cooldownRemainingMs,TRACTOR_COOLDOWN_MS);}
});
test('beaming attacker cannot shoot and loses no ammo; victim remains allowed to fire/reload',()=>{
 const f=fixture();assert.equal(f.activate().ok,true);const shot=(p=f.a)=>({sequence:1,aim:0,lifeGeneration:p.state.lifeGeneration,teleportSequence:p.state.teleportSequence});
 assert.equal(fire(f.room,f.a,shot(),0).ok,false);assert.equal(f.a.state.ammo,12);assert.equal(fire(f.room,f.b,shot(f.b),0).ok,true);assert.equal(startReload(f.b),true);
});
test('shared pull is smooth, normal rearward/lateral escape overpowers it, and attacker retains full normal thrust',()=>{
 for(const direction of ['idle','rearward','lateral'] as const){const f=fixture(2);assert.equal(f.activate().ok,true);const x=f.b.state.x;
 for(let i=0;i<30;i++)stepMovement(f.b.state,{...idleInput(),right:direction==='rearward',down:direction==='lateral'},f.room.blackHole);
 if(direction==='idle')assert.ok(f.b.state.x<x);if(direction==='rearward')assert.ok(f.b.state.x>x);if(direction==='lateral')assert.ok(f.b.state.y>1900);
 }
 const f=fixture(2);assert.equal(f.activate().ok,true);for(let i=0;i<60;i++)stepMovement(f.a.state,{...idleInput(),right:true},f.room.blackHole);
 assert.ok(Math.abs(f.a.state.vx-290)<1);assert.ok(f.a.state.x>200);
});
test('replicated tractor force predicts fixed ticks and acknowledgement/replay without server-only corrections',()=>{
 const f=fixture();f.activate();const predictor=new LocalPredictor();predictor.reconcile(f.b.state,f.room.blackHole);
 const authority=structuredClone(f.b.state),input={...idleInput(),right:true};
 const one=predictor.tick(input)!;stepMovement(authority,one,f.room.blackHole);authority.lastProcessedInput=one.sequence;
 const two=predictor.tick(input)!;const expected=structuredClone(authority);stepMovement(expected,two,f.room.blackHole);
 predictor.reconcile(authority,f.room.blackHole);assert.equal(predictor.state!.x,expected.x);assert.equal(predictor.state!.vx,expected.vx);assert.equal(predictor.pending.length,1);assert.ok(predictor.correction<1e-9);
});
test('five-second maximum expires victim alive, cooldown lasts fifteen seconds and never auto-reacquires',()=>{
 const f=fixture();f.activate();advanceTractors(f.room,TRACTOR_MAX_DURATION_MS-1);assert.equal(f.a.state.tractor.remainingMs,1);
 advanceTractors(f.room,TRACTOR_MAX_DURATION_MS);assert.equal(f.a.state.tractor.targetId,null);assert.equal(f.b.state.health,100);assert.equal(f.b.state.status,'ALIVE');assert.equal(f.a.state.tractor.cooldownRemainingMs,10000);
 f.room.simulationTimeMs=14999;assert.equal(f.activate().ok,false);advanceTractors(f.room,15000);f.room.simulationTimeMs=15000;assert.equal(f.a.state.tractor.targetId,null);assert.equal(f.activate().ok,true);
});
test('idle victim earns continuous-lock finisher ignoring full shield/health/protection and triggers normal winner/reset',()=>{
 const f=fixture(2);f.b.invulnerableUntilMs=100000;assert.equal(f.activate().ok,true);
 let time=0;while(f.room.match.state==='active' && time<5000){time+=TICK_MS;f.tick(time);}
 assert.equal(f.b.state.status,'ALIEN');assert.equal(f.b.state.deathSource?.type,'TRACTOR');assert.equal(f.b.state.health,0);assert.equal(f.room.match.result?.kind,'winner');assert.equal(f.a.state.tractor.targetId,null);assert.equal(f.b.state.tractor.attackerId,null);assert.ok(f.a.state.tractor.cooldownRemainingMs>0);
 advanceMatch(f.room,time+6000);assert.equal(f.room.match.state,'waiting');for(const p of [f.a,f.b]){assert.equal(p.state.status,'ALIVE');assert.equal(p.state.tractor.cooldownRemainingMs,0);assert.equal(p.state.tractor.attackerId,null);}
 assert.equal(startMatch(f.room,'a',{round:1}).ok,true);Object.assign(f.a.state,{x:200,y:1800});Object.assign(f.b.state,{x:300,y:1800});assert.equal(f.activate().ok,true);for(let i=1;i<=91;i++)f.tick(time+6000+i*TICK_MS);assert.equal(f.b.state.deathSource?.type,'TRACTOR');
});
for(const id of ['a','b'])test(`disconnect ${id} immediately clears tractor and preserves lifecycle`,()=>{const f=fixture();f.activate();f.store.leave(id);assert.equal(f.room.tractorBeams!.size,0);for(const p of f.room.players.values()){assert.equal(p.state.tractor.targetId,null);assert.equal(p.state.tractor.attackerId,null);}});
test('match end cancels unrelated active beam, retains cooldown until reset',()=>{const f=fixture();f.activate();applyDamage(f.c,150,{type:'ENVIRONMENT',cause:'HAZARD'});applyDamage(f.b,150,{type:'ENVIRONMENT',cause:'HAZARD'});evaluateResult(f.room,100);assert.equal(f.room.match.state,'ended');assert.equal(f.room.tractorBeams!.size,0);assert.equal(f.a.state.tractor.cooldownRemainingMs,15000);});

test('continuous-lock finisher in a three-human round retains ordinary alien respawn and committed cooldown',()=>{
 const f=fixture();f.activate();let time=0;while(f.b.state.status==='ALIVE' && time<5000){time+=TICK_MS;f.tick(time);}
 assert.equal(f.b.state.deathSource?.type,'TRACTOR');assert.equal(f.room.match.state,'active');assert.equal(f.b.state.status,'ALIEN');
 const deadline=f.b.respawnAtMs!;f.tick(deadline);assert.equal(f.b.state.lifeState,'active');assert.equal(f.b.state.health,40);assert.equal(f.b.state.shield,0);assert.equal(f.b.state.ammo,0);assert.equal(f.b.state.tractor.attackerId,null);assert.equal(f.b.state.tractor.targetId,null);
 assert.ok(f.a.state.tractor.cooldownRemainingMs>0);assert.equal(activateTractor(f.room,f.b,f.request(f.b)).ok,false);
});
test('alien melee damage cannot release a tractored victim unless attacker is eliminated',()=>{
 const f=fixture();f.c.state.status='ALIEN';f.c.humanEliminated=true;f.c.state.x=220;f.c.state.health=40;f.c.state.shield=0;assert.equal(f.activate().ok,true);
 const intent={sequence:1,aim:0,lifeGeneration:f.c.state.lifeGeneration,teleportSequence:f.c.state.teleportSequence};
 assert.equal(fire(f.room,f.c,intent,0).ok,true);assert.equal(f.a.state.shield,45);assert.equal(f.a.state.tractor.targetId,'b');
});

for(const distance of [0,1,27,150])test(`continuous lock never kills at distance ${distance} before three seconds, then ignores full resources`,()=>{
 const f=fixture(2);f.b.state.x=f.a.state.x+distance;f.b.invulnerableUntilMs=99999;assert.equal(f.activate().ok,true);
 for(const ms of [0,100,1000,2900,2999]){advanceTractors(f.room,ms,true);assert.equal(f.b.state.status,'ALIVE');assert.equal(f.b.state.health,100);assert.equal(f.b.state.shield,50);assert.equal(f.b.state.tractor.incomingLockElapsedMs,ms);}
 advanceTractors(f.room,TRACTOR_KILL_LOCK_MS,true);evaluateResult(f.room,TRACTOR_KILL_LOCK_MS);assert.equal(f.b.state.deathSource?.type,'TRACTOR');assert.equal(f.b.state.status,'ALIEN');assert.equal(f.room.match.result?.kind,'winner');assert.equal(f.a.state.tractor.lockElapsedMs,0);assert.equal(f.b.state.tractor.incomingLockElapsedMs,0);
});
for(const reason of ['turn','range','cone','LOS'] as const)test(`breaking a 2.9-second lock by ${reason} discards all progress on later activation`,()=>{
 const f=fixture(2);f.activate();advanceTractors(f.room,2900,true);assert.equal(f.a.state.tractor.lockElapsedMs,2900);
 if(reason==='turn')f.a.state.rotation=Math.PI;if(reason==='range')f.b.state.x=500;if(reason==='cone')f.b.state.y=2000;if(reason==='LOS')f.room.tractorLOS=()=>false;
 advanceTractors(f.room,2950,true);assert.equal(f.b.state.status,'ALIVE');assert.equal(f.a.state.tractor.targetId,null);assert.equal(f.a.state.tractor.lockElapsedMs,0);assert.equal(f.b.state.tractor.incomingLockElapsedMs,0);assert.equal(f.a.state.tractor.cooldownRemainingMs,12050);
 Object.assign(f.a.state,{rotation:0});Object.assign(f.b.state,{x:300,y:1800});f.room.tractorLOS=()=>true;
 f.room.simulationTimeMs=15000;assert.equal(f.activate().ok,true);assert.equal(f.a.state.tractor.lockElapsedMs,0);assert.equal(f.b.state.tractor.incomingLockElapsedMs,0);
 advanceTractors(f.room,15001,true);assert.equal(f.b.state.status,'ALIVE');assert.equal(f.a.state.tractor.lockElapsedMs,1);
 advanceTractors(f.room,17999,true);assert.equal(f.b.state.status,'ALIVE');advanceTractors(f.room,18000,true);assert.equal(f.b.state.status,'ALIEN');
});
test('shared movement uses exactly 200 units/s² and preserves substantial normal escape thrust',()=>{
 const f=fixture(2);f.activate();assert.equal(TRACTOR_PULL_STRENGTH,200);
 stepMovement(f.b.state,idleInput(),f.room.blackHole);assert.equal(f.b.state.vx,-200*TICK_MS/1000);
 for(let i=0;i<90;i++)stepMovement(f.b.state,{...idleInput(),right:true},f.room.blackHole);
 assert.ok(f.b.state.vx>250 && f.b.state.vx<290);
});

test('incoming and outgoing lock progress remain independent when the victim also maintains a beam',()=>{
 const f=fixture();f.activate();advanceTractors(f.room,1000,true);f.room.simulationTimeMs=1000;assert.equal(activateTractor(f.room,f.b,f.request(f.b)).ok,true);
 advanceTractors(f.room,2000,true);assert.equal(f.b.state.tractor.incomingLockElapsedMs,2000);assert.equal(f.b.state.tractor.lockElapsedMs,1000);
 f.a.state.rotation=Math.PI;advanceTractors(f.room,2100,true);assert.equal(f.b.state.tractor.incomingLockElapsedMs,0);assert.equal(f.b.state.tractor.lockElapsedMs,1100);assert.equal(f.b.state.tractor.targetId,'c');assert.equal(f.b.state.status,'ALIVE');
});
