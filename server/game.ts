import {advanceGuardians,guardianSnapshot} from './guardians';
import {battleSnapshot,radarPings} from './battle';
import {processPilots,type PilotCoordinator} from './ai/coordinator';
import {advanceSurvival,completeHealing,survivalCommand,walls} from './survival';
import {updateHorizon,advanceHorizon} from './horizon';
import {LOBBY_HOLE} from '../shared/match';
import {triggerIntent} from './galaxy';
import {inventoryCommand,advanceLoot,lootSnapshot} from './inventory';
import {advanceObjectives,objectivesSnapshot} from './objectives';
import { advanceBots, advanceBotActions } from './bots';
import { activateTractor, advanceTractors } from './tractor';
import { advanceMatch, evaluateResult, matchSnapshot, startMatch, setReady, playAgain } from './match';
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

export function createGameServer(allowedOrigins: string[], store = new RoomStore(), options: { autoTick?: boolean; combatDebug?: boolean;ai?:PilotCoordinator } = {}) {
  const ai=options.ai??processPilots();ai.register(store);
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
    socket.on('survival',(request,reply)=>{if(typeof reply!=='function')return;const room=store.roomFor(socket.id);reply(survivalCommand(room,room?.players.get(socket.id),request));});
    socket.on('trigger',request=>{const room=store.roomFor(socket.id);triggerIntent(room,room?.players.get(socket.id),request);});
    socket.on('inventory',(request,reply)=>{if(typeof reply!=='function')return;const room=store.roomFor(socket.id);reply(inventoryCommand(room,room?.players.get(socket.id),request));});
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
    const notify = (code: string) => { const room = store.rooms.get(code); if (room){io.to(roomChannel(code)).emit('aiIntel',ai.intel(room));io.to(roomChannel(code)).emit('aiRadio',ai.radioPacket(room));io.to(roomChannel(code)).emit('roomState', store.info(room));} };
    socket.on('play',(request,reply)=>{
      if(typeof reply!=='function')return;const result=store.play(socket.id,request?.name,request?.mode,performance.now());
      if(result.ok){const room=store.roomFor(socket.id)!;room.simulationTimeMs=tick*TICK_MS;void socket.join(roomChannel(room.code));notify(room.code);}reply(result);
    });
    socket.on('ready',(request,reply)=>{if(typeof reply!=='function')return;const room=store.roomFor(socket.id),result=setReady(room,socket.id,request);if(result.ok&&room)notify(room.code);reply(result);});
    socket.on('playAgain',(request,reply)=>{if(typeof reply!=='function')return;const room=store.roomFor(socket.id),result=playAgain(room,socket.id,request);if(result.ok&&room){if(room.match.mode==='fill'&&room.match.hostId){const filled=store.fill(room,room.match.hostId,{roomCode:room.code,round:room.match.round});if(!filled.ok){notify(room.code);reply(filled);return;}}notify(room.code);}reply(result);});
    socket.on('fillGame',(request,reply)=>{
      if(typeof reply!=='function')return;const room=store.roomFor(socket.id),result=store.fill(room,socket.id,request);
      if(result.ok && room)notify(room.code);reply(result);
    });
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
      const admitting=room.match.state==='ended' && [...room.players.values()].some(p=>p.state.queuedForNextRound);
      const reset = advanceMatch(room, tick * TICK_MS);updateHorizon(room);
      advanceTractors(room,tick*TICK_MS);
      if(!reset && room.match.state==='waiting'){
        let i=0;for(const p of room.players.values()){if(p.state.controllerType!=='BOT')continue;const a=tick*.012+i++*Math.PI*2/7;const tx=LOBBY_HOLE.x+Math.cos(a)*240,ty=LOBBY_HOLE.y+Math.sin(a)*240,dx=tx-p.state.x,dy=ty-p.state.y;p.input={up:dy<-8,down:dy>8,left:dx<-8,right:dx>8,boost:false,aim:Math.atan2(dy,dx)};p.lastInput=now;}
      }
      advanceGuardians(room,tick);if(!reset){advanceSurvival(room);advanceBots(room,now,tick);}
      for (const player of room.players.values()) {
        if (!reset) simulatePlayer(player, room, now, tick * TICK_MS);
      }
      if(!reset)advanceBotActions(room,tick);
      const hits: ProjectileHit[] = []; // Bounded by this room's live projectile cap.
      if (!reset) advanceProjectiles(room, hit => hits.push(hit), tick);
      advanceTractors(room,tick*TICK_MS,true);
      if(!reset){advanceObjectives(room);advanceLoot(room);}
      room.combatEffects=room.combatEffects?.filter(e=>room.simulationTimeMs-e.timeMs<400);
      room.killFeed=room.killFeed?.filter(entry=>room.simulationTimeMs-entry.timeMs<6000);
      completeHealing(room);advanceHorizon(room);evaluateResult(room, tick * TICK_MS);
      // No global gameplay broadcast: a socket receives only its joined room.
      const snapshot:import('../shared/protocol').Snapshot={guardians:guardianSnapshot(room),battle:battleSnapshot(room),
        walls:[...walls(room).values()].map(w=>({...w})),horizon:room.horizon,killFeed:room.killFeed??[],effects:room.combatEffects??[],loot:lootSnapshot(room),objectives:objectivesSnapshot(room), match: matchSnapshot(room), survivingHumans: survivingHumans(room), projectiles: projectileSnapshot(room), tick, timeMs: tick * TICK_MS, roomCode: room.code, blackHole: { ...room.blackHole },
        players: [...room.players.values()].map(p => {const {bot:_privateTactics,...state}=p.state;return state;}),
      };
      for(const recipient of room.players.values())if(recipient.state.controllerType==='HUMAN')io.to(recipient.state.id).volatile.emit('snapshot',{...snapshot,radarPings:radarPings(room,recipient.state.id)});
      // Replacement membership is reliable, but follows the volatile snapshot
      // so its outgoing buffer cannot suppress this tick's reset snapshot.
      if(reset && admitting)io.to(roomChannel(room.code)).emit('roomState',store.info(room));
      // Preserve volatile snapshot delivery: reliable receipts come afterward.
      // Direct socket delivery only; targets and room spectators get no receipt.
      for (const hit of hits) io.to(hit.ownerId).emit('projectileHit', hit);
    }
    ai.tick();for(const room of store.rooms.values())if(ai.shouldPublish(room)){io.to(roomChannel(room.code)).emit('aiIntel',ai.intel(room));if(ai.shouldPublishRadio(room))io.to(roomChannel(room.code)).emit('aiRadio',ai.radioPacket(room));}
  }
  // Monotonic accumulator avoids the 33ms interval rounding into 30.3 ticks/s.
  // Each simulation step is exactly 1/30s, regardless of browser/server frames.
  let previous = performance.now(), accumulator = 0;
  const timer = options.autoTick === false ? null : setInterval(() => {
    const now = performance.now();
    accumulator += Math.min(now - previous, TICK_MS * 5); previous = now;
    while (accumulator >= TICK_MS) { simulate(now); accumulator -= TICK_MS; }
  }, 5);
  return { http, io, step: () => simulate(performance.now()), close: async () => { ai.detach(store);if (timer) clearInterval(timer); await new Promise<void>(resolve => io.close(() => resolve())); } };
}
