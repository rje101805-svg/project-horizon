import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from '../server/game';
import { RoomStore } from '../server/rooms';
import type { ClientEvents, ServerEvents, RoomResult, Snapshot } from '../shared/protocol';
import type { FireResult } from '../shared/projectiles';
test('real sockets reject hit/state claims, enforce fire spam, replicate room projectiles and debug refill', async () => {
  const store=new RoomStore(),server=createGameServer([],store,{autoTick:false,combatDebug:true});
  await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));
  const address=server.http.address(); assert.ok(address && typeof address!=='string');
  const sockets:Socket<ServerEvents,ClientEvents>[]=[];
  const connect=async()=>{
    const s:Socket<ServerEvents,ClientEvents>=io(`http://127.0.0.1:${address.port}`,{autoConnect:false});sockets.push(s);
    const ready=new Promise<void>((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});s.connect();await ready;return s;
  };
  const shot=(s:Socket<ServerEvents,ClientEvents>,sequence:number)=>new Promise<FireResult>(resolve=>s.emit('fire',{
    sequence,aim:0,lifeGeneration:0,teleportSequence:0,health:9999,damage:9999,targetId:'forged',vx:99999
  } as Parameters<ClientEvents['fire']>[0],resolve));
  try {
    const a=await connect(),b=await connect(),isolated=await connect(),unjoined=await connect();
    assert.equal((await shot(unjoined,1)).ok,false);
    const r=await new Promise<RoomResult>(resolve=>a.emit('createRoom',{name:'A'},resolve));assert.ok(r.ok);
    await new Promise<RoomResult>(resolve=>b.emit('joinRoom',{name:'B',code:r.room.code},resolve));
    await new Promise<RoomResult>(resolve=>isolated.emit('createRoom',{name:'I'},resolve));
    const room=store.roomFor(a.id!)!,pa=room.players.get(a.id!)!,pb=room.players.get(b.id!)!;
    Object.assign(pb.state,{x:1600,y:pa.state.y});
    assert.equal((await shot(a,1)).ok,true);
    for(let seq=2;seq<=100;seq++) assert.equal((await shot(a,seq)).ok,false);
    assert.equal(room.projectiles.size,1);assert.equal(pa.state.ammo,11);assert.equal(pb.state.shield,50);
    const snapshots=[a,b,isolated].map(s=>new Promise<Snapshot>(resolve=>s.once('snapshot',resolve)));server.step();
    const [sa,sb,si]=await Promise.all(snapshots);assert.deepEqual(sa.projectiles,sb.projectiles);
    assert.equal(sa.projectiles[0].ownerId,a.id);assert.equal(sa.projectiles[0].damage,25);assert.deepEqual(si.projectiles,[]);
    assert.equal((await shot(a,1)).ok,false); // Same accepted sequence cannot replay after cooldown.
    for(let n=0;n<6;n++) {server.step();await new Promise<void>(resolve=>setImmediate(resolve));}
    assert.equal((await shot(a,101)).ok,true);
    for(let n=0;n<20;n++){server.step();await new Promise<void>(resolve=>setImmediate(resolve));}
    assert.equal(pb.state.shield,0);assert.equal(pb.state.health,100);assert.equal(room.projectiles.size,0);
    // No handler accepts fabricated client hits.
    (a as unknown as {emit:(name:string,data:unknown)=>void}).emit('hit',{targetId:b.id,damage:99999});
    await new Promise<void>(resolve=>a.emit('latencyProbe',resolve));assert.equal(pb.state.health,100);
    const result=await new Promise<{ok:boolean}>(resolve=>a.emit('combatDebug',{action:'refill',lifeGeneration:0,teleportSequence:0},resolve));
    assert.equal(result.ok,true);assert.equal(pa.state.ammo,12);
  } finally {sockets.forEach(s=>s.disconnect());await server.close();}
});
