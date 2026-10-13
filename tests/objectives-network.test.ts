import {test} from 'node:test';
import assert from 'node:assert/strict';
import {io,type Socket} from 'socket.io-client';
import type {ClientEvents,ServerEvents,RoomResult,Snapshot} from '../shared/protocol';
import {ActiveFixtureStore as RoomStore} from './active-fixture';
import {createGameServer} from '../server/game';
import {equipGoldGun} from '../server/equipment';
import {applyDamage} from '../server/combat';
import {objectiveState} from '../server/objectives';
test('real sockets receive the same objectives and cannot spoof position, capture, pickup or Gold fire stats',{timeout:10000},async()=>{
 const store=new RoomStore(),server=createGameServer([],store,{autoTick:false});await new Promise<void>(r=>server.http.listen(0,'127.0.0.1',r));const address=server.http.address();if(!address||typeof address==='string')throw Error('port');
 const clients:Socket<ServerEvents,ClientEvents>[]=[];
 try{
  for(let i=0;i<3;i++){const c=io(`http://127.0.0.1:${address.port}`,{transports:['websocket'],forceNew:true});clients.push(c);await new Promise<void>((resolve,reject)=>{c.once('connect',()=>resolve());c.once('connect_error',reject);});}
  const result=await new Promise<RoomResult>(r=>clients[0].emit('createRoom',{name:'A'},r));assert.ok(result.ok);const code=result.room.code;
  for(const c of clients.slice(1)){const joined=await new Promise<RoomResult>(r=>c.emit('joinRoom',{code,name:'Other'},r));assert.ok(joined.ok);}
  const room=store.rooms.get(code)!,a=room.players.get(clients[0].id!)!,b=room.players.get(clients[1].id!)!;
  const fired=await new Promise<any>(r=>clients[0].emit('fire',{sequence:1,aim:0,lifeGeneration:0,teleportSequence:0,weapon:'gold',damage:999,ownerId:b.state.id} as any,r));assert.ok(fired.ok);assert.equal(room.projectiles.get(fired.projectileId)!.damage,40.5);assert.equal(room.projectiles.get(fired.projectileId)!.ownerId,a.state.id);
  equipGoldGun(b,'trusted-gold');Object.assign(b.state,{x:9000,y:2400});applyDamage(b,999,{type:'PLAYER',playerId:a.state.id});assert.equal(objectiveState(room).pickups.size,1);
  clients[0].emit('input',{sequence:1,lifeGeneration:0,teleportSequence:0,up:false,down:false,left:false,right:false,boost:false,aim:0,x:9000,y:2400,goldGunId:'trusted-gold',captureProgress:10000} as any);
  (clients[0] as any).emit('collectGoldGun',{id:'trusted-gold'});(clients[0] as any).emit('captureComplete',{planetId:'cinder'});
  await new Promise<void>(r=>clients[0].emit('latencyProbe',r));
  const snapshot=async()=>{const promises=clients.map(c=>new Promise<Snapshot>(r=>c.once('snapshot',r)));server.step();return Promise.all(promises);};
  const states=await snapshot();assert.equal(a.state.goldGunId,null);assert.equal(a.state.x,1370);assert.equal(objectiveState(room).pickups.size,1);assert.ok(objectiveState(room).planets.every(p=>p.completed.size===0));
  assert.deepEqual(states[0].objectives,states[1].objectives);assert.deepEqual(states[1].objectives,states[2].objectives);
  Object.assign(a.state,{x:9000,y:2400});a.state.teleportSequence++;await snapshot();assert.equal(a.state.goldGunId,null);const claim=await new Promise<any>(r=>clients[0].emit('inventory',{action:'pickup',pickupId:'trusted-gold',sequence:1,roomCode:code,round:room.match.round,reloadSession:a.state.reloadSession,lifeGeneration:a.state.lifeGeneration,teleportSequence:a.state.teleportSequence,revision:a.state.inventory!.revision},r));assert.equal(claim.ok,true);await snapshot();assert.equal(a.state.goldGunId,'trusted-gold');assert.equal(objectiveState(room).pickups.size,0);
 }finally{for(const c of clients)c.close();await server.close();}
});
