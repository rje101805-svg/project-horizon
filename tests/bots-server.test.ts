import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from '../server/game';
import { RoomStore } from '../server/rooms';
import { TICK_MS } from '../shared/flight';
import { applyDamage } from '../server/combat';
import type { ClientEvents, ServerEvents, RoomResult, Snapshot } from '../shared/protocol';
import type { StartMatchResult } from '../shared/match';

for(const transport of ['polling','websocket'])test(`real ${transport} fill ownership, queued admission, reliable replacement and resumed reset snapshots`,async()=>{
 const store=new RoomStore(),server=createGameServer([],store,{autoTick:false});await new Promise<void>(r=>server.http.listen(0,'127.0.0.1',r));const addr=server.http.address();assert.ok(addr&&typeof addr!=='string');
 const sockets:Socket<ServerEvents,ClientEvents>[]=[];
 const connect=async()=>{const socket:Socket<ServerEvents,ClientEvents>=io(`http://127.0.0.1:${addr.port}`,{autoConnect:false,transports:[transport]});sockets.push(socket);await new Promise<void>(r=>{socket.once('connect',r);socket.connect();});return socket;};
 const next=(socket:Socket<ServerEvents,ClientEvents>,condition:(s:Snapshot)=>boolean)=>new Promise<Snapshot>((resolve,reject)=>{const timer=setTimeout(()=>{socket.off('snapshot',listen);reject(Error('Required snapshot dropped'));},4000);const listen=(s:Snapshot)=>{if(condition(s)){clearTimeout(timer);socket.off('snapshot',listen);resolve(s);}};socket.on('snapshot',listen);});
 try{
  const host=await connect(),created=await new Promise<RoomResult>(r=>host.emit('createRoom',{name:'Host'},r));assert.ok(created.ok);const room=store.roomFor(host.id!)!;
  const result=await new Promise<StartMatchResult>(r=>host.emit('fillGame',{roomCode:room.code,round:0},r));assert.equal(result.ok,true);assert.equal(room.players.size,8);assert.equal(server.io.sockets.sockets.size,1);
  assert.equal((await new Promise<StartMatchResult>(r=>host.emit('startMatch',{round:0},r))).ok,true);
  const peer=await connect();assert.ok((await new Promise<RoomResult>(r=>peer.emit('joinRoom',{name:'Queued',code:room.code},r))).ok);
  assert.equal((await new Promise<StartMatchResult>(r=>peer.emit('fillGame',{roomCode:room.code,round:room.match.round},r))).ok,false);assert.equal(room.match.roster.length,8);
  const winner=[...room.players.values()].find(p=>p.state.controllerType==='BOT')!;for(const p of room.players.values())if(p!==winner && !p.state.queuedForNextRound)applyDamage(p,999,{type:'PLAYER',playerId:winner.state.id});
  const deliver=async(promises:Promise<unknown>[])=>{
    let received=false;const completed=Promise.all(promises).then(()=>{received=true;});
    // Polling may legitimately drop volatile packets between HTTP polls. Exercise
    // subsequent normal ticks rather than claiming every packet must arrive.
    for(let i=0;i<100 && !received;i++){server.step();await new Promise<void>(r=>setTimeout(r,5));}
    await completed;
  };
  await deliver(sockets.map(s=>next(s,x=>x.match.state==='ended')));
  while(room.simulationTimeMs+TICK_MS<room.match.endedAtMs!+6000){server.step();await new Promise<void>(r=>setImmediate(r));}
  // Flush earlier packets so this isolated reset tick must deliver its snapshot.
  await Promise.all(sockets.map(s=>new Promise<void>(r=>s.emit('latencyProbe',r))));
  const order:string[]=[];host.on('snapshot',s=>{if(s.match.state==='waiting')order.push('snapshot');});
  const metadata=new Promise<void>(r=>host.once('roomState',info=>{assert.equal(info.participantIds?.length,8);assert.equal(info.queuedIds?.length,0);order.push('roomState');r();}));
  const reset=sockets.map(s=>next(s,x=>x.match.state==='waiting'));await deliver([...reset,metadata]);if(transport==='websocket')assert.deepEqual(order.slice(0,2),['snapshot','roomState']);else assert.ok(order.includes('roomState')&&order.includes('snapshot'));assert.equal(room.players.size,8);assert.ok(room.players.has(peer.id!));assert.equal([...room.players.values()].filter(p=>p.state.controllerType==='BOT').length,6);
 }finally{for(const s of sockets)s.disconnect();await server.close();}
});
