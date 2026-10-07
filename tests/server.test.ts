import { RoomStore } from '../server/rooms';
import { createBlackHole, classifyRegion } from '../shared/black-hole';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { createGameServer } from '../server/game';
import { idleInput, parseInput, spawnFlight, stepFlight, EDGE_MARGIN, WORLD, TICK_SECONDS } from '../shared/flight';
import type { ClientEvents, ServerEvents, Snapshot, RoomResult, InputMessage } from '../shared/protocol';

let inputSequence = 0;
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
  const server = createGameServer([], undefined, { combatDebug: true });
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
    socket.emit('input', { ...idleInput(), sequence: ++inputSequence, teleportSequence: 0, lifeGeneration: 0, x: 99999, vx: 99999, speed: 99999 } as InputMessage);
    const unchanged = await nextSnapshot(socket, s => s.tick > first.tick + 2);
    assert.equal(unchanged.players[0].x, 1370);
    const heartbeat = setInterval(() => socket.emit('input', { ...idleInput(), sequence: ++inputSequence, teleportSequence: 0, lifeGeneration: 0, right: true }), 30);
    try {
      const moving = await nextSnapshot(socket, s => s.players[0].x > 1420);
      assert.ok(moving.players[0].vx <= 290);
      assert.ok(moving.players[0].lastProcessedInput > 0);
      const start = performance.now();
      const later = await nextSnapshot(socket, () => performance.now() - start >= 1000);
      assert.ok(later.players[0].lastProcessedInput > moving.players[0].lastProcessedInput);
      assert.ok(later.tick - moving.tick >= 28 && later.tick - moving.tick <= 33);
    } finally { clearInterval(heartbeat); }
    // Without fresh inputs, the held movement must expire and coast to rest.
    const expired = await nextSnapshot(socket, s => Math.abs(s.players[0].vx) < 1);
    assert.ok(expired.players[0].x < WORLD - EDGE_MARGIN);
    socket.emit('resetFlight', 0);
    const reset = await nextSnapshot(socket, s => s.players[0].x === 1370);
    assert.equal(reset.players[0].vx, 0);
    socket.disconnect();
    await new Promise(r => setTimeout(r, 100));
    const health = await fetch(`${url}/health`).then(r => r.json()) as { players: number };
    assert.equal(health.players, 0);
  } finally { socket.disconnect(); await server.close(); }
});

async function setup(store?: RoomStore) {
  const server = createGameServer([], store); const sockets: Socket<ServerEvents, ClientEvents>[] = [];
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
    const heartbeat = setInterval(() => a.emit('input', { ...idleInput(), sequence: ++inputSequence, teleportSequence: 0, lifeGeneration: 0, right: true, id: b.id, roomCode: 'FAKE', x: 99999, y: 99999, vx: 99999, vy: 99999, speed: 99999 } as InputMessage), 30);
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

test('real RTT probe acknowledges immediately and health remains lightweight and uncached', async () => {
  const t = await setup();
  try {
    const socket = await t.connect(); const started = performance.now();
    await new Promise<void>((resolve, reject) => socket.timeout(1000).emit('latencyProbe', error => error ? reject(error) : resolve()));
    assert.ok(performance.now() - started < 1000);
    const address = t.server.http.address(); assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json(); assert.equal(data.ok, true); assert.equal(data.tickRate, 30); assert.equal(data.rooms, 0);
  } finally { await t.close(); }
});
test('origin policy admits Pages-style HTTPS origin and rejects unrelated WebSocket origins', async () => {
  const server = createGameServer(['https://example.github.io']);
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const address = server.http.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const allowed = io(url, { transports: ['websocket'], extraHeaders: { Origin: 'https://example.github.io' }, autoConnect: false });
  const denied = io(url, { transports: ['websocket'], extraHeaders: { Origin: 'https://unrelated.example' }, autoConnect: false, reconnection: false });
  try {
    const connected = new Promise<void>((resolve, reject) => { allowed.once('connect', () => resolve()); allowed.once('connect_error', reject); }); allowed.connect(); await connected;
    const rejected = new Promise<void>(resolve => denied.once('connect_error', () => resolve())); denied.connect(); await rejected; assert.equal(denied.connected, false);
  } finally { allowed.disconnect(); denied.disconnect(); await server.close(); }
});

test('room snapshots agree on black hole/death; late join and reconnect get complete state and safe new identity', async () => {
  const store = new RoomStore(() => 'ABCD'); const t = await setup(store);
  try {
    const a = await t.connect(), b = await t.connect(); const result = await t.create(a); assert.ok(result.ok);
    assert.deepEqual(result.room.blackHole, createBlackHole());
    await t.join(b, result.room.code);
    const keeper=await t.connect();await t.join(keeper,result.room.code);
    assert.equal((await new Promise<{ok:boolean}>(resolve=>a.emit('startMatch',{round:0},resolve))).ok,true);
    await nextSnapshot(a, s=>s.match.state==='active' && s.match.roster.length===3);
    const room = store.rooms.get(result.room.code)!;
    // A server-side fixture, never a network position command. Customize state
    // to prove late joins receive current room state rather than client defaults.
    room.blackHole.eventHorizonRadius = 95;
    const player = room.players.get(a.id!)!;
    Object.assign(player.state, { x: room.blackHole.x - 200, y: room.blackHole.y, vx: 20000 });
    const [sa, sb] = await Promise.all([
      nextSnapshot(a, s => s.players.find(p => p.id === a.id)?.lifeState === 'dead'),
      nextSnapshot(b, s => s.players.find(p => p.id === a.id)?.lifeState === 'dead'),
    ]);
    assert.equal(sa.tick, sb.tick); assert.deepEqual(sa.blackHole, sb.blackHole); assert.deepEqual(sa.players, sb.players);
    const frozen = sa.players.find(p => p.id === a.id)!;
    a.emit('resetFlight', 0); a.emit('input', { ...idleInput(), sequence: ++inputSequence, teleportSequence: 0, lifeGeneration: 0, right: true });
    const stillDead = (await nextSnapshot(a, s => s.tick > sa.tick + 2)).players.find(p => p.id === a.id)!;
    // Countdown now advances while the dead ship's physics stays frozen.
    assert.equal(stillDead.x, frozen.x); assert.equal(stillDead.y, frozen.y);
    assert.equal(stillDead.vx, 0); assert.equal(stillDead.lifeState, 'dead');
    assert.equal(stillDead.deathSequence, frozen.deathSequence);
    assert.ok(stillDead.respawnRemainingMs < frozen.respawnRemainingMs);
    const late = await t.connect(); const joined = await t.join(late, room.code); assert.ok(joined.ok);
    assert.deepEqual(joined.room.blackHole, room.blackHole);
    const lateState = await nextSnapshot(late);
    assert.deepEqual(lateState.blackHole, room.blackHole);
    assert.equal(lateState.players.find(p => p.id === a.id)?.lifeState, 'dead');
    const oldId = a.id!; a.disconnect();
    await new Promise(r => setTimeout(r, 60));
    const newIdentity = await t.connect(); const rejoined = await t.join(newIdentity, room.code); assert.ok(rejoined.ok);
    assert.notEqual(rejoined.selfId, oldId);
    const recovered = await nextSnapshot(newIdentity);
    assert.equal(recovered.players.some(p => p.id === oldId), false);
    const newPlayer = recovered.players.find(p => p.id === newIdentity.id)!;
    assert.equal(newPlayer.lifeState, 'active'); assert.equal(classifyRegion(newPlayer, recovered.blackHole), 'safe');
  } finally { await t.close(); }
});
