import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { RoomStore } from '../server/rooms';
import { createGameServer } from '../server/game';
import type { ClientEvents, ServerEvents, RoomResult, Snapshot } from '../shared/protocol';
import type { ReloadRequest, ReloadResult } from '../shared/combat';

for (const mode of ['default', 'debug', 'production'] as const) test(`reload is normal gameplay; reset/debug stay gated (${mode})`, async () => {
  const store = new RoomStore(), env = process.env.NODE_ENV;
  if (mode === 'production') process.env.NODE_ENV = 'production';
  const server = createGameServer([], store, { autoTick: false, combatDebug: mode !== 'default' });
  if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env;
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const address = server.http.address(); assert.ok(address && typeof address !== 'string');
  const sockets: Socket<ServerEvents, ClientEvents>[] = [];
  const connect = async () => {
    const s: Socket<ServerEvents, ClientEvents> = io(`http://127.0.0.1:${address.port}`, { autoConnect: false }); sockets.push(s);
    const connected = new Promise<void>((resolve, reject) => { s.once('connect', resolve); s.once('connect_error', reject); });
    s.connect(); await connected; return s;
  };
  try {
    const a = await connect(), b = await connect(), unjoined = await connect();
    const result = await new Promise<RoomResult>(resolve => a.emit('createRoom', { name: 'A' }, resolve)); assert.ok(result.ok);
    await new Promise<RoomResult>(resolve => b.emit('joinRoom', { code: result.room.code, name: 'B' }, resolve));
    const room = store.roomFor(a.id!)!, p = room.players.get(a.id!)!, peer = room.players.get(b.id!)!;
    p.state.ammo = 4;
    const request: ReloadRequest = { sequence: 1, lifeGeneration: 0, teleportSequence: 0, roomCode: room.code, reloadSession: p.state.reloadSession };
    const send = (s: Socket<ServerEvents, ClientEvents>, raw: unknown) => new Promise<ReloadResult>(resolve => s.emit('reload', raw as ReloadRequest, resolve));
    assert.equal((await send(unjoined, request)).ok, false);
    for (const bad of [null, {}, { ...request, ammo: 12 }, { ...request, reloadDuration: 0 },
      { ...request, completionTime: 0 }, { ...request, targetId: b.id }, { ...request, sequence: 2, lifeGeneration: 1 },
      { ...request, sequence: 3, teleportSequence: 1 }]) assert.equal((await send(a, bad)).ok, false);
    assert.equal(p.state.ammo, 4); assert.equal(p.combatTimers.reload, 0);
    assert.equal((await send(a, { ...request, sequence: 4 })).ok, true);
    assert.equal(p.combatTimers.reload, 45); assert.equal(peer.state.isReloading, false);
    assert.equal((await send(a, { ...request, sequence: 5 })).ok, false); assert.equal(p.combatTimers.reload, 45);
    const snapshot = new Promise<Snapshot>(resolve => b.once('snapshot', resolve)); server.step();
    const shown = (await snapshot).players.find(s => s.id === a.id)!;
    assert.equal(shown.ammo, 4); assert.equal(shown.maxAmmo, 12); assert.equal(shown.isReloading, true);
    assert.equal(shown.reloadRemainingMs, p.state.reloadRemainingMs);
    for (let i = 0; i < 43; i++) server.step(); assert.equal(p.state.ammo, 4);
    server.step(); assert.equal(p.state.ammo, 12); assert.equal(p.state.isReloading, false);
    Object.assign(p.state, { x: 200, y: 1800 });
    a.emit('resetFlight', 1); // Wrong generation must fail even when enabled.
    await new Promise<void>(resolve => a.emit('latencyProbe', resolve)); assert.equal(p.reset, false);
    a.emit('resetFlight', 0);
    await new Promise<void>(resolve => a.emit('latencyProbe', resolve)); assert.equal(p.reset, mode === 'debug');
    server.step(); assert.equal(p.state.x, mode === 'debug' ? 1370 : 200);
    assert.equal(p.state.ammo, 12); assert.equal(p.state.health, 100); assert.equal(p.state.shield, 50);
    await new Promise<void>(resolve => a.emit('leaveRoom', resolve));
    await new Promise<RoomResult>(resolve => a.emit('joinRoom', { code: room.code, name: 'A' }, resolve));
    const rejoined = store.roomFor(a.id!)!.players.get(a.id!)!; rejoined.state.ammo = 3;
    assert.notEqual(rejoined.state.reloadSession, request.reloadSession);
    assert.equal((await send(a, { ...request, sequence: 6 })).ok, false);
    assert.equal(rejoined.state.isReloading, false); assert.equal(rejoined.state.ammo, 3);
  } finally { sockets.forEach(s => s.disconnect()); await server.close(); }
});
