import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { createGameServer } from '../server/game';
import { idleInput, parseInput, spawnFlight, stepFlight, EDGE_MARGIN, WORLD, TICK_SECONDS } from '../shared/flight';
import type { ClientEvents, ServerEvents, Snapshot } from '../shared/protocol';

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
  const firstPromise = nextSnapshot(socket); socket.connect();
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
