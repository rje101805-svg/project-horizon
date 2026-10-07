import { activateTractor, advanceTractors } from './tractor';
import { advanceMatch, evaluateResult, matchSnapshot, startMatch } from './match';
import { reload } from './reload';
import { fire, advanceProjectiles, projectileSnapshot } from './projectiles';
import { combatDebugEnabled, runCombatDebug } from './combat-debug';
import { acceptMovementInput } from './inputs';
import { simulatePlayer } from './simulation';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { Server } from 'socket.io';
import { TICK_MS, TICK_RATE } from '../shared/flight';
import type { ClientEvents, ServerEvents } from '../shared/protocol';
import type { ProjectileHit } from '../shared/hit-feedback';

import { RoomStore, roomChannel, survivingHumans } from './rooms';

export function createGameServer(allowedOrigins: string[], store = new RoomStore(), options: { autoTick?: boolean; combatDebug?: boolean } = {}) {
  const http = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, tickRate: TICK_RATE, tick, players: [...store.rooms.values()].reduce((sum, room) => sum + room.players.size, 0), rooms: store.rooms.size })); }
    else res.writeHead(404).end();
  });
  const io = new Server<ClientEvents, ServerEvents>(http, {
    cors: { origin: allowedOrigins },
    // CORS alone does not restrict WebSocket upgrades.
    allowRequest: (req, callback) => callback(null, !req.headers.origin || allowedOrigins.includes(req.headers.origin)),
    maxHttpBufferSize: 4096,
  });
  const debugAuthorized = combatDebugEnabled(options.combatDebug);
  let tick = 0;
  io.on('connection', socket => {
    socket.on('tractor',(request,reply)=>{if(typeof reply!=='function')return;const room=store.roomFor(socket.id);reply(activateTractor(room,room?.players.get(socket.id),request));});
    socket.on('fire', (request, reply) => {
      if (typeof reply !== 'function') return;
      const room = store.roomFor(socket.id);
      reply(fire(room, room?.players.get(socket.id), request, tick));
    });
    socket.on('reload', (request, reply) => {
      if (typeof reply !== 'function') return;
      const room = store.roomFor(socket.id);
      reply(reload(room, room?.players.get(socket.id), request));
    });
    socket.on('combatDebug', (request, reply) => {
      if (typeof reply !== 'function') return;
      reply(runCombatDebug(store.roomFor(socket.id)?.players.get(socket.id), request, debugAuthorized));
    });
    socket.on('latencyProbe', reply => { if (typeof reply === 'function') reply(); });
    const notify = (code: string) => { const room = store.rooms.get(code); if (room) io.to(roomChannel(code)).emit('roomState', store.info(room)); };
    socket.on('startMatch', (request, reply) => {
      if (typeof reply !== 'function') return;
      const room = store.roomFor(socket.id), result = startMatch(room, socket.id, request);
      if (result.ok && room) notify(room.code);
      reply(result);
    });
    socket.on('createRoom', (request, reply) => {
      if (typeof reply !== 'function') return;
      const result = store.create(socket.id, request?.name, performance.now());
      if (result.ok) { store.roomFor(socket.id)!.simulationTimeMs = tick * TICK_MS; store.roomFor(socket.id)!.players.get(socket.id)!.simulationTimeMs = tick * TICK_MS; void socket.join(roomChannel(result.room.code)); notify(result.room.code); }
      reply(result);
    });
    socket.on('joinRoom', (request, reply) => {
      if (typeof reply !== 'function') return;
      const result = store.join(socket.id, request?.code, request?.name, performance.now());
      if (result.ok) { store.roomFor(socket.id)!.simulationTimeMs = tick * TICK_MS; store.roomFor(socket.id)!.players.get(socket.id)!.simulationTimeMs = tick * TICK_MS; void socket.join(roomChannel(result.room.code)); notify(result.room.code); }
      reply(result);
    });
    const leave = () => {
      const room = store.leave(socket.id);
      if (room) { void socket.leave(roomChannel(room.code)); notify(room.code); }
    };
    socket.on('leaveRoom', reply => { leave(); if (typeof reply === 'function') reply(); });
    socket.on('input', raw => {
      const player = store.roomFor(socket.id)?.players.get(socket.id);
      if (player) acceptMovementInput(player, raw, performance.now());
    });
    // Preserve Step 2's explicit debug reset; safe positions still server-owned.
    socket.on('resetFlight', generation => { const player = store.roomFor(socket.id)?.players.get(socket.id); if (debugAuthorized && player?.gameplayEnabled && player.state.lifeState === 'active' && generation === player.state.lifeGeneration) player.reset = true; });
    socket.on('disconnect', leave);
  });
  function simulate(now: number) {
    tick++;
    for (const room of store.rooms.values()) {
      const reset = advanceMatch(room, tick * TICK_MS);
      advanceTractors(room,tick*TICK_MS);
      for (const player of room.players.values()) {
        if (!reset) simulatePlayer(player, room, now, tick * TICK_MS);
      }
      const hits: ProjectileHit[] = []; // Bounded by this room's live projectile cap.
      if (!reset) advanceProjectiles(room, hit => hits.push(hit), tick);
      advanceTractors(room,tick*TICK_MS,true);
      evaluateResult(room, tick * TICK_MS);
      // No global gameplay broadcast: a socket receives only its joined room.
      io.to(roomChannel(room.code)).volatile.emit('snapshot', {
        match: matchSnapshot(room), survivingHumans: survivingHumans(room), projectiles: projectileSnapshot(room), tick, timeMs: tick * TICK_MS, roomCode: room.code, blackHole: { ...room.blackHole },
        players: [...room.players.values()].map(p => ({ ...p.state })),
      });
      // Preserve volatile snapshot delivery: reliable receipts come afterward.
      // Direct socket delivery only; targets and room spectators get no receipt.
      for (const hit of hits) io.to(hit.ownerId).emit('projectileHit', hit);
    }
  }
  // Monotonic accumulator avoids the 33ms interval rounding into 30.3 ticks/s.
  // Each simulation step is exactly 1/30s, regardless of browser/server frames.
  let previous = performance.now(), accumulator = 0;
  const timer = options.autoTick === false ? null : setInterval(() => {
    const now = performance.now();
    accumulator += Math.min(now - previous, TICK_MS * 5); previous = now;
    while (accumulator >= TICK_MS) { simulate(now); accumulator -= TICK_MS; }
  }, 5);
  return { http, io, step: () => simulate(performance.now()), close: async () => { if (timer) clearInterval(timer); await new Promise<void>(resolve => io.close(() => resolve())); } };
}
