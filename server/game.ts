import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { Server } from 'socket.io';
import { idleInput, INPUT_TIMEOUT_MS, parseInput, spawnFlight, stepFlight, TICK_MS, TICK_RATE } from '../shared/flight';
import type { PlayerInput } from '../shared/flight';
import type { ClientEvents, PlayerState, ServerEvents } from '../shared/protocol';

export function createGameServer(allowedOrigins: string[]) {
  const http = createServer((req, res) => {
    if (req.url === '/health') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, tickRate: TICK_RATE, tick, players: players.size })); }
    else res.writeHead(404).end();
  });
  const io = new Server<ClientEvents, ServerEvents>(http, {
    cors: { origin: allowedOrigins },
    // CORS alone does not restrict WebSocket upgrades.
    allowRequest: (req, callback) => callback(null, !req.headers.origin || allowedOrigins.includes(req.headers.origin)),
    maxHttpBufferSize: 4096,
  });
  const players = new Map<string, { state: PlayerState; input: PlayerInput; lastInput: number; reset: boolean }>();
  let tick = 0;
  io.on('connection', socket => {
    const player = { state: { id: socket.id, ...spawnFlight() }, input: idleInput(), lastInput: performance.now(), reset: false };
    players.set(socket.id, player);
    socket.on('input', raw => {
      const input = parseInput(raw);
      if (input) { player.input = input; player.lastInput = performance.now(); }
    });
    // Coalesce resets/inputs; messages never advance the simulation.
    socket.on('resetFlight', () => { player.reset = true; });
    socket.on('disconnect', () => { players.delete(socket.id); });
  });
  function simulate(now: number) {
    for (const player of players.values()) {
      if (player.reset) {
        Object.assign(player.state, spawnFlight()); player.input = idleInput(); player.reset = false;
      }
      if (now - player.lastInput > INPUT_TIMEOUT_MS) player.input = { ...idleInput(), aim: player.state.rotation };
      stepFlight(player.state, player.input);
    }
    tick++;
    io.volatile.emit('snapshot', { tick, players: [...players.values()].map(p => ({ ...p.state })) });
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
