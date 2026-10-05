import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { Server } from 'socket.io';
import { idleInput, INPUT_TIMEOUT_MS, parseInput, stepFlight, TICK_MS, TICK_RATE } from '../shared/flight';
import type { ClientEvents, ServerEvents } from '../shared/protocol';

import { chooseSpawn, RoomStore, roomChannel } from './rooms';

export function createGameServer(allowedOrigins: string[], store = new RoomStore()) {
  const http = createServer((req, res) => {
    if (req.url === '/health') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, tickRate: TICK_RATE, tick, players: [...store.rooms.values()].reduce((sum, room) => sum + room.players.size, 0), rooms: store.rooms.size })); }
    else res.writeHead(404).end();
  });
  const io = new Server<ClientEvents, ServerEvents>(http, {
    cors: { origin: allowedOrigins },
    // CORS alone does not restrict WebSocket upgrades.
    allowRequest: (req, callback) => callback(null, !req.headers.origin || allowedOrigins.includes(req.headers.origin)),
    maxHttpBufferSize: 4096,
  });
  let tick = 0;
  io.on('connection', socket => {
    const notify = (code: string) => { const room = store.rooms.get(code); if (room) io.to(roomChannel(code)).emit('roomState', store.info(room)); };
    socket.on('createRoom', (request, reply) => {
      if (typeof reply !== 'function') return;
      const result = store.create(socket.id, request?.name, performance.now());
      if (result.ok) { void socket.join(roomChannel(result.room.code)); notify(result.room.code); }
      reply(result);
    });
    socket.on('joinRoom', (request, reply) => {
      if (typeof reply !== 'function') return;
      const result = store.join(socket.id, request?.code, request?.name, performance.now());
      if (result.ok) { void socket.join(roomChannel(result.room.code)); notify(result.room.code); }
      reply(result);
    });
    const leave = () => {
      const room = store.leave(socket.id);
      if (room) { void socket.leave(roomChannel(room.code)); notify(room.code); }
    };
    socket.on('leaveRoom', reply => { leave(); if (typeof reply === 'function') reply(); });
    socket.on('input', raw => {
      const player = store.roomFor(socket.id)?.players.get(socket.id);
      const input = parseInput(raw);
      if (player && input) { player.input = input; player.lastInput = performance.now(); }
    });
    // Preserve Step 2's explicit debug reset; safe positions still server-owned.
    socket.on('resetFlight', () => { const player = store.roomFor(socket.id)?.players.get(socket.id); if (player) player.reset = true; });
    socket.on('disconnect', leave);
  });
  function simulate(now: number) {
    tick++;
    for (const room of store.rooms.values()) {
      for (const player of room.players.values()) {
        if (player.reset) {
          const spawn = chooseSpawn([...room.players.values()].filter(p => p !== player).map(p => p.state));
          if (spawn) Object.assign(player.state, spawn);
          player.input = idleInput(); player.reset = false;
        }
        if (now - player.lastInput > INPUT_TIMEOUT_MS) player.input = { ...idleInput(), aim: player.state.rotation };
        stepFlight(player.state, player.input);
      }
      // No global gameplay broadcast: a socket receives only its joined room.
      io.to(roomChannel(room.code)).volatile.emit('snapshot', {
        tick, timeMs: tick * TICK_MS, roomCode: room.code,
        players: [...room.players.values()].map(p => ({ ...p.state })),
      });
    }
  }
  // Monotonic accumulator avoids the 33ms interval rounding into 30.3 ticks/s.
  // Each simulation step is exactly 1/30s, regardless of browser/server frames.
  let previous = performance.now(), accumulator = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    accumulator += Math.min(now - previous, TICK_MS * 5); previous = now;
    while (accumulator >= TICK_MS) { simulate(now); accumulator -= TICK_MS; }
  }, 5);
  return { http, io, close: async () => { clearInterval(timer); await new Promise<void>(resolve => io.close(() => resolve())); } };
}
