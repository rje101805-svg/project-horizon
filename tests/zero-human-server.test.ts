import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from '../server/game';
import { RoomStore, survivingHumans } from '../server/rooms';
import { applyDamage } from '../server/combat';
import { evaluateResult, startMatch } from '../server/match';
import { fire } from '../server/projectiles';
import { TICK_MS } from '../shared/flight';
import type { ClientEvents, ServerEvents, RoomResult, Snapshot } from '../shared/protocol';
import type { StartMatchResult } from '../shared/match';

for (const damage of ['horizon batch', 'staged elimination and reciprocal bullets'] as const) test(`three-roster-human zero-human draw: ${damage}, spectator isolation and consecutive host starts`, async () => {
 const store = new RoomStore(), server = createGameServer([], store, {autoTick:false, combatDebug:true});
 await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
 const address = server.http.address(); assert.ok(address && typeof address !== 'string');
 const sockets: Socket<ServerEvents, ClientEvents>[] = [];
 const connect = async () => {
  const socket: Socket<ServerEvents, ClientEvents> = io(`http://127.0.0.1:${address.port}`, {autoConnect:false});
  sockets.push(socket); const ready = new Promise<void>(resolve => socket.once('connect', resolve)); socket.connect(); await ready; return socket;
 };
 let tick = 0;
 const frame = async () => {
  const snapshots = sockets.map(socket => new Promise<Snapshot>(resolve => socket.once('snapshot', resolve)));
  server.step(); tick++;
  return Promise.all(snapshots);
 };
 const start = (round: number) => new Promise<StartMatchResult>(resolve => sockets[0].emit('startMatch', {round}, resolve));
 try {
  const aSocket = await connect();
  const created = await new Promise<RoomResult>(resolve => aSocket.emit('createRoom', {name:'A'}, resolve)); assert.ok(created.ok);
  for (const name of ['B','C']) {const socket = await connect(); assert.ok((await new Promise<RoomResult>(resolve => socket.emit('joinRoom', {code:created.room.code, name}, resolve))).ok);}
  const room = store.rooms.get(created.room.code)!, initialRoster = [...room.players.keys()];
  assert.equal((await start(0)).ok, true); assert.deepEqual(room.match.roster, initialRoster);
  const spectatorSocket = await connect(); assert.ok((await new Promise<RoomResult>(resolve => spectatorSocket.emit('joinRoom', {code:room.code, name:'Spectator'}, resolve))).ok);
  const spectator = room.players.get(spectatorSocket.id!)!, [a,b,c] = initialRoster.map(id => room.players.get(id)!);
  await frame(); assert.equal(survivingHumans(room), 3);
  const staleSpectatorFire = {sequence:1, aim:0, lifeGeneration:spectator.state.lifeGeneration, teleportSequence:spectator.state.teleportSequence};
  assert.equal((await new Promise<{ok:boolean}>(resolve => spectatorSocket.emit('fire', staleSpectatorFire, resolve))).ok, false);
  assert.equal((await new Promise<{ok:boolean}>(resolve => spectatorSocket.emit('combatDebug', {action:'damage', lifeGeneration:0, teleportSequence:0}, resolve))).ok, false);
  assert.equal(applyDamage(spectator, 1000, {type:'ENVIRONMENT', cause:'HAZARD'}), null);
  if (damage === 'horizon batch') {
   for (const player of [a,b,c]) Object.assign(player.state, {x:room.blackHole.x, y:room.blackHole.y, vx:0, vy:0});
  } else {
   applyDamage(c, 150, {type:'ENVIRONMENT',cause:'HAZARD'}); await frame();
   assert.equal(room.match.state, 'active'); assert.equal(survivingHumans(room), 2);
   Object.assign(a.state, {x:200,y:1800,health:25,shield:0}); Object.assign(b.state, {x:270,y:1800,health:25,shield:0});
   for (const [player,aim] of [[a,0],[b,Math.PI]] as const) assert.equal(fire(room, player, {sequence:1,aim,lifeGeneration:player.state.lifeGeneration,teleportSequence:player.state.teleportSequence},tick).ok,true);
  }
  const ended = await frame();
  assert.equal(survivingHumans(room), 0); assert.equal(room.match.state, 'ended'); assert.deepEqual(room.match.result, {kind:'draw'});
  for (const snapshot of ended) {assert.equal(snapshot.survivingHumans, 0); assert.equal(snapshot.match.state,'ended'); assert.deepEqual(snapshot.match.result,{kind:'draw'}); assert.deepEqual(snapshot.match.roster,initialRoster);}
  for (const player of [a,b,c]) {assert.equal(player.state.status,'ALIEN'); assert.equal(player.gameplayEnabled,false); assert.equal(player.respawnAtMs,null);}
  assert.equal(spectator.state.status,'OUT'); assert.equal(spectator.humanEliminated,false); assert.equal(spectator.state.health,100); assert.equal(room.projectiles.size,0);
  assert.equal(applyDamage(spectator,1000,{type:'ENVIRONMENT',cause:'HAZARD'}),null);
  const endedAt = room.match.endedAtMs!;
  while ((tick+1)*TICK_MS < endedAt+6000) {await frame(); assert.equal(room.match.state,'ended'); assert.deepEqual(room.match.result,{kind:'draw'});}
  await frame(); assert.equal(room.match.state,'waiting'); assert.deepEqual(room.match.roster,[]); assert.equal(room.match.result,null);
  for (const player of room.players.values()) {assert.equal(player.state.status,'ALIVE'); assert.equal(player.state.health,100); assert.equal(player.state.shield,50); assert.equal(player.state.ammo,12); assert.equal(player.humanEliminated,false);}
  await frame(); assert.equal(room.match.state,'waiting'); assert.equal((await start(0)).ok,false); assert.equal((await start(1)).ok,true);
  assert.deepEqual(room.match.roster,[...room.players.keys()]); assert.equal(survivingHumans(room),4);
  assert.equal((await new Promise<{ok:boolean}>(resolve => spectatorSocket.emit('fire',{...staleSpectatorFire,sequence:2},resolve))).ok,false);
  // The former spectator now participates only in the newly host-started roster.
  for (const player of room.players.values()) Object.assign(player.state,{x:room.blackHole.x,y:room.blackHole.y,vx:0,vy:0});
  const next = await frame(); for (const snapshot of next) {assert.equal(snapshot.match.round,2); assert.equal(snapshot.survivingHumans,0); assert.deepEqual(snapshot.match.result,{kind:'draw'});}
 } finally {for (const socket of sockets) socket.disconnect(); await server.close();}
});

test('three staggered eliminations without host start remain waiting sandbox, not an active zero-human round', () => {
 const store = new RoomStore(); const created = store.create('a','A',0); assert.ok(created.ok);
 const room = store.roomFor('a')!; store.join('b',room.code,'B',0); store.join('c',room.code,'C',0);
 for (const player of room.players.values()) {
  applyDamage(player,150,{type:'ENVIRONMENT',cause:'HAZARD'});
  // Invoke the same result evaluator used after every server damage batch.
  evaluateResult(room,100);
  assert.equal(room.match.state,'waiting'); assert.equal(room.match.result,null);
 }
 assert.equal(survivingHumans(room),0); assert.deepEqual(room.match.roster,[]);
 for (const player of room.players.values()) assert.equal(player.state.status,'ALIEN');
 assert.equal(startMatch(room,'a',{round:0}).ok,false);
});

test('three-player active staggered eliminations lock the last-human victory before a third elimination', () => {
 const store = new RoomStore(); store.create('a','A',0); const room = store.roomFor('a')!;
 store.join('b',room.code,'B',0); store.join('c',room.code,'C',0); assert.equal(startMatch(room,'a',{round:0}).ok,true);
 const [a,b,c] = [...room.players.values()];
 applyDamage(c,150,{type:'ENVIRONMENT',cause:'HAZARD'}); evaluateResult(room,100);
 assert.equal(room.match.state,'active'); assert.equal(survivingHumans(room),2);
 applyDamage(b,150,{type:'ENVIRONMENT',cause:'HAZARD'}); evaluateResult(room,200);
 assert.equal(room.match.state,'ended'); assert.equal(survivingHumans(room),1);
 assert.deepEqual(room.match.result,{kind:'winner',winnerId:'a',winnerName:'A'});
 assert.equal(applyDamage(a,150,{type:'ENVIRONMENT',cause:'HAZARD'}),null); evaluateResult(room,300);
 assert.equal(a.state.status,'ALIVE'); assert.deepEqual(room.match.result,{kind:'winner',winnerId:'a',winnerName:'A'});
});
