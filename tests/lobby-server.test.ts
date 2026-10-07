import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from '../server/game';
import { RoomStore } from '../server/rooms';
import { applyDamage } from '../server/combat';
import type { ClientEvents, ServerEvents, RoomResult } from '../shared/protocol';
import type { StartMatchResult } from '../shared/match';
// StartMatchResult is a shared intent acknowledgement, no client identity claim.
test('real sockets cannot spoof host/start; host migration and stale-start rejection survive reset',async()=>{
 const store=new RoomStore(),server=createGameServer([],store,{autoTick:false});
 await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));const address=server.http.address();assert.ok(address&&typeof address!=='string');
 const sockets:Socket<ServerEvents,ClientEvents>[]=[];
 const connect=async()=>{const s:Socket<ServerEvents,ClientEvents>=io(`http://127.0.0.1:${address.port}`,{autoConnect:false});sockets.push(s);const ready=new Promise<void>(resolve=>s.once('connect',resolve));s.connect();await ready;return s;};
 const start=(s:Socket<ServerEvents,ClientEvents>,round:number)=>new Promise<StartMatchResult>(resolve=>s.emit('startMatch',{round},resolve));
 try{
  const [a,b,c,unjoined]=await Promise.all([connect(),connect(),connect(),connect()]);
  const created=await new Promise<RoomResult>(resolve=>a.emit('createRoom',{name:'A'},resolve));assert.ok(created.ok);const room=store.rooms.get(created.room.code)!;
  assert.equal(created.room.match.hostId,a.id);assert.equal((await start(a,0)).ok,false);assert.equal((await start(unjoined,0)).ok,false);
  assert.ok((await new Promise<RoomResult>(resolve=>b.emit('joinRoom',{code:room.code,name:'B'},resolve))).ok);
  server.step();assert.equal(room.match.state,'waiting');assert.equal((await start(b,0)).ok,false);
  const forged=await new Promise<StartMatchResult>(resolve=>(b as unknown as {emit:(event:string,raw:unknown,reply:(r:StartMatchResult)=>void)=>void}).emit('startMatch',{round:0,hostId:a.id,playerId:a.id,roomCode:room.code},resolve));assert.equal(forged.ok,false);
  const nextHost=new Promise<void>(resolve=>b.once('roomState',info=>{assert.equal(info.match.hostId,b.id);resolve();}));
  await new Promise<void>(resolve=>a.emit('leaveRoom',resolve));await nextHost;assert.equal((await start(b,0)).ok,false);
  assert.ok((await new Promise<RoomResult>(resolve=>c.emit('joinRoom',{code:room.code,name:'C'},resolve))).ok);
  assert.equal((await start(b,0)).ok,true);assert.deepEqual(room.match.roster,[b.id,c.id]);assert.equal(room.match.round,1);
  assert.equal((await start(b,0)).ok,false);assert.equal((await start(b,1)).ok,false);
  applyDamage(room.players.get(c.id!)!,150,{type:'PLAYER',playerId:b.id!});server.step();assert.equal(room.match.state,'ended');assert.equal((await start(b,1)).ok,false);
  for(let i=0;i<181;i++)server.step();assert.equal(room.match.state,'waiting');assert.equal(room.match.round,1);assert.deepEqual(room.match.roster,[]);
  assert.equal((await start(b,0)).ok,false);assert.equal((await start(c,1)).ok,false);assert.equal((await start(b,1)).ok,true);assert.equal(room.match.round,2);
 }finally{for(const s of sockets)s.disconnect();await server.close();}
});
