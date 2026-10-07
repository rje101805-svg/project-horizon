import { ALIEN_HEALTH } from '../shared/alien';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from '../server/game';
import { RoomStore } from '../server/rooms';
import { MAX_HEALTH, RESPAWN_DELAY_MS } from '../shared/lifecycle';
import { idleInput, TICK_MS } from '../shared/flight';
import { classifyRegion } from '../shared/black-hole';
import type { ServerEvents, ClientEvents, RoomResult, Snapshot, InputMessage } from '../shared/protocol';
let inputSequence = 0;
type Client = Socket<ServerEvents, ClientEvents>;
async function setup() {
  const store = new RoomStore(); const server = createGameServer([], store, { autoTick: false });
  const sockets: Client[] = [];
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const address = server.http.address(); assert.ok(address && typeof address !== 'string');
  const connect = async () => {
    const socket: Client = io(`http://127.0.0.1:${address.port}`, { autoConnect: false, transports: ['websocket'] });
    sockets.push(socket); const ready = new Promise<void>(resolve => socket.once('connect', resolve)); socket.connect(); await ready; return socket;
  };
  const flush = async (clients: Client[]) => {
    await Promise.all(clients.map(socket => new Promise<void>((resolve, reject) => socket.timeout(1000).emit('latencyProbe', error => error ? reject(error) : resolve()))));
  };
  const frame = async (clients: Client[]) => {
    await flush(clients); // transport flush, not a simulation time advance
    const pending = clients.map(socket => new Promise<Snapshot>((resolve, reject) => {
      const timer = setTimeout(() => { socket.off('snapshot', receive); reject(new Error('Snapshot timeout')); }, 1000);
      const receive = (snapshot: Snapshot) => { clearTimeout(timer); socket.off('snapshot', receive); resolve(snapshot); };
      socket.on('snapshot', receive);
    }));
    server.step(); return Promise.all(pending);
  };
  const advance = async (ticks: number) => {
    for (let i = 0; i < ticks; i++) { server.step(); await new Promise<void>(resolve => setImmediate(resolve)); }
  };
  const create = (socket: Client) => new Promise<RoomResult>(resolve => socket.emit('createRoom', { name: 'A' }, resolve));
  const join = (socket: Client, code: string, name = 'B') => new Promise<RoomResult>(resolve => socket.emit('joinRoom', { code, name }, resolve));
  return { store, server, connect, frame, flush, advance, create, join,
    close: async () => { sockets.forEach(s => s.disconnect()); await server.close(); } };
}
test('real sockets receive same-identity death/respawn and late-join health; client health/lifecycle claims are ignored', async () => {
  const t = await setup();
  try {
    const a = await t.connect(), b = await t.connect(); const result = await t.create(a); assert.ok(result.ok);
    await t.join(b, result.room.code); const id = a.id!;
    const room = t.store.roomFor(id)!, player = room.players.get(id)!;
    a.emit('input', { ...idleInput(), sequence: ++inputSequence, teleportSequence: 0, lifeGeneration: 0, health: 0, lifeState: 'dead', respawnRemainingMs: 0 } as InputMessage);
    const [initial] = await t.frame([a, b]); assert.equal(initial.players.find(p => p.id === id)!.health, MAX_HEALTH);
    // Server fixture drives swept contact. The network accepts no position command.
    Object.assign(player.state, { x: room.blackHole.x - 200, y: room.blackHole.y, vx: 20000 });
    const [deathA, deathB] = await t.frame([a, b]); assert.deepEqual(deathA.players, deathB.players);
    assert.equal(player.state.health, 0); assert.equal(player.state.lifeState, 'dead'); assert.equal(player.state.deathSequence, 1);
    const deathAt = deathA.timeMs; const location = { x: player.state.x, y: player.state.y };
    a.emit('input', { ...idleInput(), sequence: ++inputSequence, teleportSequence: 0, lifeGeneration: 0, right: true, health: MAX_HEALTH, lifeState: 'active' } as InputMessage);
    a.emit('resetFlight', 0);
    const [stillDead] = await t.frame([a, b]); assert.equal(stillDead.players.find(p => p.id === id)!.health, 0);
    assert.deepEqual({ x: player.state.x, y: player.state.y }, location);
    const late = await t.connect(); assert.ok((await t.join(late, room.code, 'Late')).ok);
    const [lateSnapshot] = await t.frame([late]); const seen = lateSnapshot.players.find(p => p.id === id)!;
    assert.equal(seen.lifeState, 'dead'); assert.equal(seen.health, 0); assert.ok(seen.respawnRemainingMs > 0);
    // Advance simulation ticks without real multi-second sleeps.
    await t.advance(Math.floor((RESPAWN_DELAY_MS - 3 * TICK_MS) / TICK_MS));
    assert.equal(player.state.lifeState, 'dead');
    const [respawnA, respawnB] = await t.frame([a, b, late]);
    assert.ok(respawnA.timeMs >= deathAt + RESPAWN_DELAY_MS);
    assert.deepEqual(respawnA.players, respawnB.players);
    assert.equal(player.state.id, id); assert.equal(a.connected, true);
    assert.equal(player.state.lifeState, 'active'); assert.equal(player.state.health, ALIEN_HEALTH); assert.equal(player.state.status, 'ALIEN');
    assert.equal(player.state.lifeGeneration, 1); assert.equal(classifyRegion(player.state, room.blackHole), 'safe');
    assert.equal(player.state.vx, 0); assert.equal(player.state.vy, 0);
    const spawnX = player.state.x;
    // Inputs/reset sent in the previous life must not affect the new life.
    a.emit('input', { ...idleInput(), sequence: ++inputSequence, teleportSequence: 0, lifeGeneration: 0, right: true }); a.emit('resetFlight', 0);
    await t.frame([a]); assert.equal(player.state.x, spawnX); assert.equal(player.state.vx, 0);
    const right = spawnX < 2000;
    a.emit('input', { ...idleInput(), sequence: ++inputSequence, teleportSequence: 2, lifeGeneration: 1, right, left:!right }); await t.frame([a]);
    assert.ok(right ? player.state.x > spawnX : player.state.x < spawnX); assert.ok(right ? player.state.vx > 0 : player.state.vx < 0);
    const newLate = await t.connect(); await t.join(newLate, room.code, 'After respawn');
    const [aliveSnapshot] = await t.frame([newLate]);
    assert.equal(aliveSnapshot.players.find(p => p.id === id)!.health, ALIEN_HEALTH);
    assert.equal(aliveSnapshot.players.find(p => p.id === id)!.lifeGeneration, 1);
  } finally { await t.close(); }
});
test('disconnect while dead removes pending respawn and no ghost appears after controlled deadline', async () => {
  const t = await setup();
  try {
    const a = await t.connect(), b = await t.connect(); const result = await t.create(a); assert.ok(result.ok);
    await t.join(b, result.room.code); const id = a.id!, room = t.store.roomFor(id)!;
    Object.assign(room.players.get(id)!.state, { x: room.blackHole.x, y: room.blackHole.y });
    await t.frame([a, b]); assert.equal(room.players.get(id)!.state.lifeState, 'dead');
    const removed = new Promise<void>(resolve => t.server.io.sockets.sockets.get(id)!.once('disconnect', () => resolve()));
    a.disconnect(); await removed;
    assert.equal(room.players.has(id), false); assert.equal(t.store.roomFor(id), undefined);
    await t.advance(Math.ceil(RESPAWN_DELAY_MS / TICK_MS) + 30);
    const [snapshot] = await t.frame([b]); assert.deepEqual(snapshot.players.map(p => p.id), [b.id]);
    assert.equal(room.players.size, 1);
    await new Promise<void>(resolve => b.emit('leaveRoom', resolve)); assert.equal(t.store.rooms.size, 0);
    await t.advance(120); assert.equal(t.store.rooms.size, 0);
  } finally { await t.close(); }
});
