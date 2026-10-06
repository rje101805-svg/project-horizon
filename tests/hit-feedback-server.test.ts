import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from '../server/game';
import { RoomStore } from '../server/rooms';
import { fire, advanceProjectiles } from '../server/projectiles';
import { advanceCombatTick } from '../server/combat';
import type { ClientEvents, ServerEvents, RoomResult, Snapshot } from '../shared/protocol';
import type { ProjectileHit } from '../shared/hit-feedback';
const shot = (sequence: number, aim = 0) => ({ sequence, aim, lifeGeneration: 0, teleportSequence: 0 });
function fixture() {
  const store = new RoomStore(); store.create('a', 'A', 0); const room = store.roomFor('a')!;
  store.join('b', room.code, 'B', 0);
  const a = room.players.get('a')!, b = room.players.get('b')!;
  Object.assign(a.state, { x: 200, y: 1800 }); Object.assign(b.state, { x: 270, y: 1800 });
  return { store, room, a, b };
}
test('hit receipt reports actual shield, health, split and clamped damage once, at swept contact', () => {
  for (const [shield, health, expectedShield, expectedHealth] of [[50,100,25,0],[0,100,0,25],[10,100,10,15],[0,7,0,7]]) {
    const { room, a, b } = fixture(); b.state.shield = shield; b.state.health = health;
    const receipts: ProjectileHit[] = []; assert.equal(fire(room, a, shot(1), 1).ok, true);
    advanceProjectiles(room, h => receipts.push(h), 2); advanceProjectiles(room, h => receipts.push(h), 3);
    assert.equal(receipts.length, 1); const h = receipts[0];
    assert.equal(h.shieldDamage, expectedShield); assert.equal(h.healthDamage, expectedHealth);
    assert.equal(h.x, 249); assert.equal(h.y, 1800); assert.equal(h.hitTick, 2);
    assert.equal(h.ownerSession, a.state.reloadSession); assert.equal(h.targetSession, b.state.reloadSession);
    assert.equal(h.ownerId, 'a'); assert.equal(h.targetId, 'b'); assert.equal(h.shotSequence, 1);
    assert.equal(b.state.shield, shield - expectedShield); assert.equal(b.state.health, health - expectedHealth);
    assert.equal(room.projectiles.size, 0); assert.equal('health' in h, false); assert.equal('shield' in h, false);
  }
});
test('misses, invalid fire, owner immunity, zero HP and non-damage targets produce no hit receipt', () => {
  const { room, a, b } = fixture(), receipts: ProjectileHit[] = [];
  assert.equal(fire(room, a, { ...shot(1), aim: NaN }, 0).ok, false);
  b.state.health = 0; assert.equal(fire(room, a, shot(1), 0).ok, true);
  for (let i = 0; i < 60; i++) advanceProjectiles(room, h => receipts.push(h));
  assert.equal(b.state.shield, 50); assert.equal(receipts.length, 0);
  for (let i = 0; i < 6; i++) advanceCombatTick(a);
  b.state.health = 100; b.state.status = 'OUT'; fire(room, a, shot(2), 0);
  for (let i = 0; i < 60; i++) advanceProjectiles(room, h => receipts.push(h));
  assert.equal(receipts.length, 0); assert.equal(b.state.health, 100);
  for (let i = 0; i < 6; i++) advanceCombatTick(a);
  b.state.status = 'ALIVE'; fire(room, a, shot(3, Math.PI / 2), 0);
  for (let i = 0; i < 60; i++) advanceProjectiles(room, h => receipts.push(h));
  assert.equal(receipts.length, 0); assert.equal(a.state.health, 100);
  for (let i = 0; i < 6; i++) advanceCombatTick(a);
  a.state.vx = -1600; fire(room, a, shot(4), 0); // Travels back across its owner.
  advanceProjectiles(room, h => receipts.push(h)); assert.equal(a.state.shield, 50); assert.equal(receipts.length, 0);
});
test('owner lifecycle changes, teleport and disconnect cancel bullets before damage or feedback', () => {
  for (const change of ['life', 'teleport', 'dead', 'leave']) {
    const { store, room, a, b } = fixture(); fire(room, a, shot(1), 0);
    if (change === 'life') a.state.lifeGeneration++;
    if (change === 'teleport') a.state.teleportSequence++;
    if (change === 'dead') a.state.lifeState = 'dead';
    if (change === 'leave') store.leave('a');
    let count = 0; advanceProjectiles(room, () => count++);
    assert.equal(count, 0); assert.equal(b.state.shield, 50); assert.equal(room.projectiles.size, 0);
  }
});
test('real socket routes each receipt only to shooter; target, spectator and other room never receive it', async () => {
  const store = new RoomStore(), server = createGameServer([], store, { autoTick: false });
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const address = server.http.address(); assert.ok(address && typeof address !== 'string');
  const sockets: Socket<ServerEvents, ClientEvents>[] = [];
  const connect = async () => {
    const s: Socket<ServerEvents, ClientEvents> = io(`http://127.0.0.1:${address.port}`, { autoConnect: false }); sockets.push(s);
    const ready = new Promise<void>((resolve, reject) => { s.once('connect', resolve); s.once('connect_error', reject); }); s.connect(); await ready; return s;
  };
  try {
    const [a, b, spectator, isolated] = await Promise.all([connect(), connect(), connect(), connect()]);
    const result = await new Promise<RoomResult>(resolve => a.emit('createRoom', { name: 'A' }, resolve)); assert.ok(result.ok);
    for (const s of [b, spectator]) await new Promise<RoomResult>(resolve => s.emit('joinRoom', { name: 'Peer', code: result.room.code }, resolve));
    await new Promise<RoomResult>(resolve => isolated.emit('createRoom', { name: 'Other' }, resolve));
    const room = store.roomFor(a.id!)!, pa = room.players.get(a.id!)!, pb = room.players.get(b.id!)!;
    Object.assign(pa.state, { x: 200, y: 1800 }); Object.assign(pb.state, { x: 270, y: 1800 });
    Object.assign(room.players.get(spectator.id!)!.state, { x: 500, y: 200 });
    const received = new Map(sockets.map(s => [s, [] as ProjectileHit[]]));
    for (const s of sockets) s.on('projectileHit', h => received.get(s)!.push(h));
    const send = (sequence: number, aim = 0) => new Promise<{ok:boolean}>(resolve => a.emit('fire', shot(sequence, aim), resolve));
    for (const [sequence, shield, health, expectedShield, expectedHealth] of [[1,50,100,25,0],[2,0,100,0,25],[3,10,100,10,15]]) {
      pb.state.shield = shield; pb.state.health = health;
      assert.equal((await send(sequence)).ok, true);
      const frame = new Promise<Snapshot>((resolve, reject) => {
        const timeout = setTimeout(() => reject(Error('Hit receipt suppressed owner snapshot')), 1000);
        a.once('snapshot', s => { clearTimeout(timeout); resolve(s); });
      });
      server.step(); assert.equal((await frame).tick, (sequence - 1) * 7 + 1);
      await new Promise<void>(resolve => a.emit('latencyProbe', resolve));
      const hits = received.get(a)!; assert.equal(hits.length, sequence);
      assert.equal(hits.at(-1)!.shieldDamage, expectedShield); assert.equal(hits.at(-1)!.healthDamage, expectedHealth);
      for (const s of [b, spectator, isolated]) assert.deepEqual(received.get(s), []);
      for (let i = 0; i < 6; i++) server.step();
    }
    assert.equal((await send(4, Math.PI / 2)).ok, true); assert.equal((await send(5)).ok, false);
    for (let i = 0; i < 60; i++) server.step();
    // A client cannot invent a server receipt or invoke another damage path.
    (a as unknown as { emit: (event: string, data: unknown) => void }).emit('projectileHit', { targetId: b.id, healthDamage: 99999 });
    await new Promise<void>(resolve => a.emit('latencyProbe', resolve));
    assert.equal(received.get(a)!.length, 3); assert.equal(pb.state.health, 85);
    for (const s of [b, spectator, isolated]) { await new Promise<void>(resolve => s.emit('latencyProbe', resolve)); assert.deepEqual(received.get(s), []); }
  } finally { sockets.forEach(s => s.disconnect()); await server.close(); }
});
