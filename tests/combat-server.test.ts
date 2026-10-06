import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from '../server/game';
import { RoomStore } from '../server/rooms';
import type { ClientEvents, ServerEvents, RoomResult, Snapshot } from '../shared/protocol';
import type { CombatDebugAction, CombatDebugResult } from '../shared/combat';

for (const mode of ['default', 'enabled', 'production'] as const) {
  test(`real socket combat debug: ${mode} authorization, self scope and snapshot authority`, async () => {
    const store = new RoomStore();
    const oldEnv = process.env.NODE_ENV;
    if (mode === 'production') process.env.NODE_ENV = 'production';
    const server = createGameServer([], store, { autoTick: false, combatDebug: mode === 'default' ? undefined : true });
    if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
    await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
    const address = server.http.address(); assert.ok(address && typeof address !== 'string');
    const sockets: Socket<ServerEvents, ClientEvents>[] = [];
    const connect = async () => {
      const s: Socket<ServerEvents, ClientEvents> = io(`http://127.0.0.1:${address.port}`, { autoConnect: false }); sockets.push(s);
      const ready = new Promise<void>((resolve, reject) => { s.once('connect', resolve); s.once('connect_error', reject); }); s.connect(); await ready; return s;
    };
    try {
      const a = await connect(), b = await connect();
      const room = await new Promise<RoomResult>(resolve => a.emit('createRoom', { name: 'A' }, resolve)); assert.ok(room.ok);
      assert.ok((await new Promise<RoomResult>(resolve => b.emit('joinRoom', { name: 'B', code: room.room.code }, resolve))).ok);
      const p = store.roomFor(a.id!)!.players.get(a.id!)!, peer = store.roomFor(b.id!)!.players.get(b.id!)!;
      const initial = structuredClone(p.state), peerInitial = structuredClone(peer.state);
      const request = (action: CombatDebugAction, markers = { lifeGeneration: 0, teleportSequence: 0 }) =>
        new Promise<CombatDebugResult>(resolve => a.emit('combatDebug', { action, ...markers, targetId: b.id, health: 9999 } as Parameters<ClientEvents['combatDebug']>[0], resolve));
      if (mode !== 'enabled') {
        for (const action of ['damage', 'ammo', 'reload', 'shield', 'cooldown', 'refill'] as const) {
          assert.deepEqual(await request(action), { ok: false, message: 'Combat debug disabled by server' });
        }
        assert.deepEqual(p.state, initial); assert.deepEqual(peer.state, peerInitial);
      } else {
        assert.equal((await request('damage')).ok, true); assert.equal(p.state.shield, 15); assert.equal(p.state.health, 100);
        assert.equal((await request('ammo')).ok, true); assert.equal(p.state.ammo, 11);
        assert.equal((await request('reload')).ok, true); assert.equal(p.combatTimers.reload, 45);
        server.step(); assert.equal(p.combatTimers.reload, 44);
        assert.equal((await request('reload')).ok, false); assert.equal(p.combatTimers.reload, 44);
        assert.equal((await request('shield')).ok, true); assert.equal(p.state.shieldUp, true);
        assert.equal((await request('cooldown')).ok, true);
        assert.equal((await request('damage', { lifeGeneration: 1, teleportSequence: 0 })).ok, false);
        assert.deepEqual(peer.state, peerInitial); // Forged target is ignored: only own server socket ID is used.
        const snapshot = new Promise<Snapshot>(resolve => b.once('snapshot', resolve)); server.step();
        const state = (await snapshot).players.find(s => s.id === a.id)!;
        assert.equal(state.shield, 15); assert.equal(state.ammo, 11); assert.equal(state.isReloading, true);
        assert.equal(state.shieldUp, true); assert.equal(state.controllerType, 'HUMAN'); assert.equal(state.status, 'ALIVE');
        assert.equal(state.reloadRemainingMs, p.state.reloadRemainingMs);
        for (let i = 0; i < 43; i++) server.step();
        assert.equal(p.state.ammo, 12); assert.equal(p.state.isReloading, false); assert.equal(p.state.reloadProgress, 1);
        assert.equal(p.state.fireCooldownRemainingMs, 0);
        for (let i = 0; i < 4; i++) await request('damage');
        assert.equal(p.state.health, 0); assert.equal(p.state.status, 'ALIVE'); assert.equal(p.state.lifeState, 'active');
        assert.equal(p.state.kills, 0); assert.equal(p.state.deathSequence, 0);
      }
    } finally { sockets.forEach(s => s.disconnect()); await server.close(); }
  });
}
