import { initialMatchState } from '../shared/match';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ProjectilePrediction,PREDICTED_SHOT_TIMEOUT_MS} from '../src/projectile-prediction';
import {RoomStore} from '../server/rooms';
import {fire,projectileSnapshot} from '../server/projectiles';
import {BASIC_BLASTER} from '../shared/projectiles';
function fixture(){
 const store=new RoomStore();store.create('a','A',0);const room=store.roomFor('a')!,p=room.players.get('a')!;
 const request={sequence:1,aim:0,lifeGeneration:0,teleportSequence:0},prediction=new ProjectilePrediction();
 const snapshot=(tick=1)=>({tick,timeMs:tick*1000/30,roomCode:room.code,blackHole:room.blackHole,players:[p.state],match: initialMatchState(), survivingHumans: 1, projectiles:projectileSnapshot(room)});
 return {store,room,p,request,prediction,snapshot};
}
test('immediate predicted visual inherits velocity but cannot change server health/ammo/cooldown or spawn projectiles',()=>{
 const {room,p,request,prediction}=fixture();p.state.vx=123;p.state.vy=-20;const before=structuredClone(p.state);
 assert.equal(prediction.add(request,p.state,0),true);const start=prediction.render([],0)[0],later=prediction.render([],100)[0];
 assert.equal(start.x,p.state.x+BASIC_BLASTER.muzzleOffset);assert.equal(later.x,start.x+(123+800)*.1);
 assert.equal(later.y,start.y-2);assert.deepEqual(p.state,before);assert.equal(room.projectiles.size,0);assert.equal(p.combatTimers.cooldown,0);
 // Visuals deliberately contain no damage, target, collision or authoritative resource fields.
 assert.deepEqual(Object.keys(later).sort(),['id','x','y']);
});
test('snapshot confirmation matches owner/sequence/lifecycle and never renders duplicate bullets',()=>{
 const {room,p,request,prediction,snapshot}=fixture();prediction.add(request,p.state,0);fire(room,p,request,0);
 const state=snapshot();assert.equal(prediction.render(state.projectiles,100).length,1);
 prediction.reconcile(state,'a',100);assert.equal(prediction.count(100),0);assert.equal(prediction.render(state.projectiles,100).length,1);
 assert.equal(prediction.render(state.projectiles,100)[0].id,state.projectiles[0].id);
});
test('other owners with same sequence cannot confirm a local prediction, and rejection removes only its request',()=>{
 const {p,request,prediction,snapshot}=fixture();prediction.add(request,p.state,0);const state=snapshot();
 state.projectiles.push({id:'other',ownerId:'other',shotSequence:1,lifeGeneration:0,teleportSequence:0,x:0,y:0,vx:1,vy:0,damage:25,spawnTick:0,remainingMs:100});
 prediction.reconcile(state,'a',10);assert.equal(prediction.count(10),1);
 prediction.result({ok:false,sequence:2,reason:'Cooldown'},state);assert.equal(prediction.count(20),1);
 prediction.result({ok:false,sequence:1,reason:'Cooldown'},state);assert.equal(prediction.count(20),0);
});
test('accepted shots absent after spawn clean up even when hit before a snapshot or ack arrives late',()=>{
 const {p,request,prediction,snapshot}=fixture();prediction.add(request,p.state,0);
 prediction.result({ok:true,sequence:1,projectileId:'gone',spawnTick:4},snapshot(3));assert.equal(prediction.count(20),1);
 prediction.reconcile(snapshot(5),'a',30);assert.equal(prediction.count(30),0);
 prediction.add({...request,sequence:2},p.state,40);
 prediction.result({ok:true,sequence:2,projectileId:'gone',spawnTick:4},snapshot(5));assert.equal(prediction.count(40),0);
});
test('unconfirmed predictions have bounded timeout/cap and clear on death/teleport/session changes',()=>{
 const {p,request,prediction,snapshot}=fixture();
 for(let seq=1;seq<=12;seq++)assert.equal(prediction.add({...request,sequence:seq},p.state,0),true);
 assert.equal(prediction.add({...request,sequence:13},p.state,0),false);assert.equal(prediction.count(999),12);
 assert.deepEqual(prediction.render([],PREDICTED_SHOT_TIMEOUT_MS),[]);assert.equal(prediction.count(1000),0);
 prediction.add(request,p.state,1001);p.state.teleportSequence++;prediction.reconcile(snapshot(),'a',1002);assert.equal(prediction.count(1002),0);
 prediction.add({...request,sequence:2,teleportSequence:1},p.state,1003);p.state.lifeState='dead';prediction.reconcile(snapshot(),'a',1004);assert.equal(prediction.count(1004),0);
 p.state.lifeState='active';prediction.add({...request,sequence:3,teleportSequence:1},p.state,1005);prediction.clear();assert.equal(prediction.count(1005),0);
});
