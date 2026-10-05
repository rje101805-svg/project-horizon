import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { createGameServer } from '../server/game';
import { idleInput, parseInput, spawnFlight, stepFlight, EDGE_MARGIN, WORLD, TICK_SECONDS } from '../shared/flight';
import type { ClientEvents, ServerEvents, Snapshot, RoomResult } from '../shared/protocol';

function nextSnapshot(socket: Socket<ServerEvents, ClientEvents>, condition: (s: Snapshot) => boolean = () => true): Promise<Snapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('snapshot', listener); reject(new Error('Snapshot timeout')); }, 4000);
    const listener = (snapshot: Snapshot) => { if (condition(snapshot)) { clearTimeout(timer); socket.off('snapshot', listener); resolve(snapshot); } };
    socket.on('snapshot', listener);
  });
}
test('fixed-step physics preserves speed, normalized diagonals, inertia, bounds and input validation', () => {
  const straight = spawnFlight(), diagonal = spawnFlight();
  for (let i = 0; i < 30; i++) {
    stepFlight(straight, { ...idleInput(), right: true });
    stepFlight(diagonal, { ...idleInput(), right: true, down: true });
  }
  assert.ok(straight.vx > 289 && straight.vx <= 290);
  assert.ok(Math.abs(Math.hypot(diagonal.vx, diagonal.vy) - straight.vx) < 1e-8);
  const boosted = spawnFlight();
  for (let i = 0; i < 30; i++) stepFlight(boosted, { ...idleInput(), right: true, boost: true });
  assert.ok(boosted.vx > 439 && boosted.vx <= 440);
  const before = boosted.vx; stepFlight(boosted, idleInput()); assert.ok(boosted.vx > 0 && boosted.vx < before);
  for (let i = 0; i < 1000; i++) stepFlight(boosted, { ...idleInput(), right: true });
  assert.equal(boosted.x, WORLD - EDGE_MARGIN);
  assert.equal(TICK_SECONDS, 1 / 30);
  assert.equal(parseInput({ ...idleInput(), aim: Infinity }), null);
  assert.equal(parseInput({ ...idleInput(), right: 1 }), null);
  assert.equal(parseInput(null), null);
});
test('real Socket.io server owns movement, ignores forged state, ticks at 30Hz and cleans up', async () => {
  const server = createGameServer([]);
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const address = server.http.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const socket: Socket<ServerEvents, ClientEvents> = io(url, { autoConnect: false });
  socket.connect();
  await new Promise<void>(resolve => socket.once('connect', () => resolve()));
  await new Promise<RoomResult>(resolve => socket.emit('createRoom', { name: 'Pilot' }, resolve));
  const firstPromise = nextSnapshot(socket);
  try {
    const first = await firstPromise;
    assert.equal(first.players[0].x, 1370);
    // Type assertion only bypasses compile-time checking; the server must reject
    // the forged runtime fields as an authority boundary.
    socket.emit('input', { ...idleInput(), x: 99999, vx: 99999, speed: 99999 } as ReturnType<typeof idleInput>);
    const unchanged = await nextSnapshot(socket, s => s.tick > first.tick + 2);
    assert.equal(unchanged.players[0].x, 1370);
    const heartbeat = setInterval(() => socket.emit('input', { ...idleInput(), right: true }), 30);
    try {
      const moving = await nextSnapshot(socket, s => s.players[0].x > 1420);
      assert.ok(moving.players[0].vx <= 290);
      const start = performance.now();
      const later = await nextSnapshot(socket, () => performance.now() - start >= 1000);
      assert.ok(later.tick - moving.tick >= 28 && later.tick - moving.tick <= 33);
    } finally { clearInterval(heartbeat); }
    // Without fresh inputs, the held movement must expire and coast to rest.
    const expired = await nextSnapshot(socket, s => Math.abs(s.players[0].vx) < 1);
    assert.ok(expired.players[0].x < WORLD - EDGE_MARGIN);
    socket.emit('resetFlight');
    const reset = await nextSnapshot(socket, s => s.players[0].x === 1370);
    assert.equal(reset.players[0].vx, 0);
    socket.disconnect();
    await new Promise(r => setTimeout(r, 100));
    const health = await fetch(`${url}/health`).then(r => r.json()) as { players: number };
    assert.equal(health.players, 0);
  } finally { socket.disconnect(); await server.close(); }
});

async function setup() {
  const server = createGameServer([]); const sockets: Socket<ServerEvents, ClientEvents>[] = [];
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const address = server.http.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const connect = async () => {
    const socket: Socket<ServerEvents, ClientEvents> = io(url, { autoConnect: false }); sockets.push(socket);
    const connected = new Promise<void>(resolve => socket.once('connect', () => resolve())); socket.connect(); await connected; return socket;
  };
  const create = (socket: Socket<ServerEvents, ClientEvents>, name = 'Pilot') => new Promise<RoomResult>(resolve => socket.emit('createRoom', { name }, resolve));
  const join = (socket: Socket<ServerEvents, ClientEvents>, code: string, name = 'Pilot') => new Promise<RoomResult>(resolve => socket.emit('joinRoom', { code, name }, resolve));
  const health = async () => await fetch(`${url}/health`).then(r => r.json()) as { rooms: number; players: number };
  return { server, connect, create, join, health, close: async () => { sockets.forEach(s => s.disconnect()); await server.close(); } };
}
test('unjoined sockets receive no gameplay; room-scoped snapshots isolate two independent rooms', async () => {
  const t = await setup();
  try {
    const a = await t.connect(), b = await t.connect(), c = await t.connect(), observer = await t.connect();
    const ra = await t.create(a, 'A'), rc = await t.create(c, 'C'); assert.ok(ra.ok && rc.ok);
    assert.ok((await t.join(b, ra.room.code.toLowerCase(), 'B')).ok);
    let observerSnapshots = 0; observer.on('snapshot', () => observerSnapshots++);
    const [sa, sb, sc] = await Promise.all([nextSnapshot(a), nextSnapshot(b), nextSnapshot(c)]);
    assert.equal(sa.roomCode, ra.room.code); assert.deepEqual(sa.players.map(p => p.id), [a.id, b.id]);
    assert.deepEqual(sb.players.map(p => p.id), [a.id, b.id]); assert.deepEqual(sc.players.map(p => p.id), [c.id]);
    assert.notEqual(a.id, b.id); assert.notEqual(sa.players[0].color, sa.players[1].color);
    assert.notDeepEqual([sa.players[0].x, sa.players[0].y], [sa.players[1].x, sa.players[1].y]);
    await new Promise(r => setTimeout(r, 120)); assert.equal(observerSnapshots, 0);
  } finally { await t.close(); }
});
test('two players move independently; forged identity, position, velocity and room cannot control others', async () => {
  const t = await setup();
  try {
    const a = await t.connect(), b = await t.connect(); const room = await t.create(a); assert.ok(room.ok);
    await t.join(b, room.room.code); const first = await nextSnapshot(a); const originalB = first.players.find(p => p.id === b.id)!;
    const heartbeat = setInterval(() => a.emit('input', { ...idleInput(), right: true, id: b.id, roomCode: 'FAKE', x: 99999, y: 99999, vx: 99999, vy: 99999, speed: 99999 } as ReturnType<typeof idleInput>), 30);
    try {
      const later = await nextSnapshot(a, s => s.players.find(p => p.id === a.id)!.x > first.players[0].x + 40);
      const stateA = later.players.find(p => p.id === a.id)!, stateB = later.players.find(p => p.id === b.id)!;
      assert.ok(stateA.vx > 0 && stateA.vx <= 290); assert.equal(stateB.x, originalB.x); assert.equal(stateB.y, originalB.y); assert.equal(stateB.vx, 0);
    } finally { clearInterval(heartbeat); }
  } finally { await t.close(); }
});
test('socket joins reject nonexistent/invalid/full rooms without corrupting membership', async () => {
  const t = await setup();
  try {
    const host = await t.connect(); const room = await t.create(host); assert.ok(room.ok);
    for (let i = 1; i < 8; i++) { const socket = await t.connect(); assert.ok((await t.join(socket, room.room.code)).ok); }
    const ninth = await t.connect(); const full = await t.join(ninth, room.room.code); assert.ok(!full.ok); assert.match(full.error, /full/);
    const missing = await t.join(ninth, room.room.code === 'ZZZZ' ? 'YYYY' : 'ZZZZ'); assert.ok(!missing.ok); assert.match(missing.error, /not found/);
    const malformed = await t.join(ninth, 'BAD'); assert.ok(!malformed.ok); assert.match(malformed.error, /valid/);
    assert.equal((await t.health()).players, 8);
  } finally { await t.close(); }
});
test('intentional leave/disconnect emits membership updates and cleans empty rooms', async () => {
  const t = await setup();
  try {
    const a = await t.connect(), b = await t.connect(); const room = await t.create(a); assert.ok(room.ok); await t.join(b, room.room.code);
    const update = new Promise<void>(resolve => a.once('roomState', info => { assert.deepEqual(info.playerIds, [a.id]); resolve(); }));
    await new Promise<void>(resolve => b.emit('leaveRoom', resolve)); await update;
    assert.equal((await nextSnapshot(a)).players.length, 1);
    // An intentionally left socket remains connected but receives no future room snapshots.
    let received = 0; b.on('snapshot', () => received++); await new Promise(r => setTimeout(r, 120)); assert.equal(received, 0);
    a.disconnect(); await new Promise(r => setTimeout(r, 100)); const health = await t.health(); assert.equal(health.players, 0); assert.equal(health.rooms, 0);
  } finally { await t.close(); }
});
