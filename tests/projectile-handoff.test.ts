import { initialMatchState } from '../shared/match';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ProjectileView,LOCAL_PROJECTILE_EXTRAPOLATION_MS} from '../src/projectile-view';
import {ProjectilePrediction} from '../src/projectile-prediction';
import {RoomStore} from '../server/rooms';
import {fire,projectileSnapshot} from '../server/projectiles';
import type {Snapshot} from '../shared/protocol';
function fixture(){
 const store=new RoomStore();store.create('a','A',0);const room=store.roomFor('a')!,p=room.players.get('a')!;
 const request={sequence:1,aim:0,lifeGeneration:0,teleportSequence:0};fire(room,p,request,0);
 const bullet=projectileSnapshot(room)[0];
 const frame=(tick:number,x:number):Snapshot=>({tick,timeMs:tick*1000/30,roomCode:room.code,blackHole:room.blackHole,players:[p.state],match: initialMatchState(), survivingHumans: 1, projectiles:[{...bullet,x}]});
 return {p,request,bullet,frame};
}
test('local confirmations bypass remote delay and new-shot bracket transition cannot rewind them',()=>{
 const {bullet,frame}=fixture(),view=new ProjectileView();
 const empty=frame(0,0);empty.projectiles=[];view.push(empty,0);
 let previous=-Infinity;
 for(let tick=1;tick<=8;tick++){
  const now=tick*1000/30;view.push(frame(tick,bullet.x+tick*800/30),now);
  for(let offset=0;offset<33;offset+=8){
   const local=view.sample(now+offset,'a')[0];assert.ok(local.x>=previous);previous=local.x;
  }
 }
 const newest=frame(8,bullet.x+8*800/30).projectiles[0];
 const frozen=view.sample(10000,'a')[0];assert.equal(frozen.x,newest.x+800*LOCAL_PROJECTILE_EXTRAPOLATION_MS/1000);
 const remote=new ProjectileView();remote.push({...frame(1,0),timeMs:0},0);remote.push({...frame(2,80),timeMs:100},100);
 assert.equal(remote.sample(150,'other')[0].x,40); // Remote interpolation is preserved.
});
test('prediction handoff preserves exact current position, one identity and bounded forward correction',()=>{
 const {p,request,bullet,frame}=fixture(),prediction=new ProjectilePrediction();prediction.add(request,p.state,0);
 const before=prediction.render([],200)[0];const snapshot=frame(1,bullet.x+800/30);const saved=structuredClone(snapshot);
 prediction.reconcile(snapshot,'a',200);const after=prediction.render(snapshot.projectiles,200);
 assert.equal(after.length,1);assert.equal(after[0].id,bullet.id);assert.equal(after[0].x,before.x);assert.equal(prediction.count(200),0);
 prediction.cancelPending();assert.equal(prediction.render(snapshot.projectiles,200)[0].x,before.x);
 let last=after[0].x;
 for(let tick=2;tick<20;tick++){
  const now=200+(tick-1)*1000/30,s=frame(tick,bullet.x+tick*800/30);
  const previous=prediction.render(snapshot.projectiles,now)[0].x;
  prediction.reconcile(s,'a',now);assert.equal(prediction.render(s.projectiles,now)[0].x,previous);
  for(let dt=0;dt<33;dt+=8){const x=prediction.render(s.projectiles,now+dt)[0].x;assert.ok(x>=last-1e-8);last=x;}
 }
 assert.deepEqual(snapshot,saved);assert.equal(p.state.health,100);assert.equal(p.state.shield,50);
});
test('ten independent single shots hand over once and unrelated lifecycle/owner identities cannot consume them',()=>{
 const {p,request,bullet,frame}=fixture(),prediction=new ProjectilePrediction();
 for(let seq=1;seq<=10;seq++){
  const now=seq*300;prediction.add({...request,sequence:seq},p.state,now);
  const unrelated=frame(seq,bullet.x);unrelated.projectiles=[{...bullet,id:'remote',ownerId:'other',shotSequence:seq}];
  prediction.reconcile(unrelated,'a',now+10);assert.equal(prediction.count(now+10),1);
  const wrongLife=frame(seq,bullet.x);wrongLife.projectiles=[{...bullet,id:'old-life',shotSequence:seq,lifeGeneration:1}];
  prediction.reconcile(wrongLife,'a',now+15);assert.equal(prediction.count(now+15),1);
  const confirmed=frame(seq,bullet.x);confirmed.projectiles=[{...bullet,id:`confirmed-${seq}`,shotSequence:seq}];
  const x=prediction.render([],now+20)[0].x;prediction.reconcile(confirmed,'a',now+20);
  const visuals=prediction.render(confirmed.projectiles,now+20);assert.equal(visuals.length,1);assert.equal(visuals[0].x,x);assert.equal(prediction.count(now+20),0);
  const gone={...confirmed,tick:seq+1,match: initialMatchState(), survivingHumans: 1, projectiles:[]};prediction.reconcile(gone,'a',now+25);assert.deepEqual(prediction.render([],now+25),[]);
 }
});
