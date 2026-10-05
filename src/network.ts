import { io, type Socket } from 'socket.io-client';
import { idleInput, TICK_MS, type PlayerInput } from '../shared/flight';
import type { ClientEvents, PlayerState, ServerEvents } from '../shared/protocol';

export class FlightConnection {
  readonly socket: Socket<ServerEvents, ClientEvents>;
  private timer: ReturnType<typeof setInterval>;
  private input = idleInput();
  private tick = -1;
  private lastSnapshot = 0;
  constructor(url: string, onState: (state: PlayerState, tick: number) => void, onStatus: (status: string) => void) {
    this.socket = io(url, { autoConnect: false });
    this.socket.on('connect', () => { this.tick = -1; this.input = idleInput(); this.lastSnapshot = Date.now(); onStatus('Connected · awaiting server snapshot'); });
    this.socket.on('snapshot', snapshot => {
      if (snapshot.tick <= this.tick) return;
      const player = snapshot.players.find(p => p.id === this.socket.id);
      if (!player) return;
      this.tick = snapshot.tick; this.lastSnapshot = Date.now();
      onState(player, snapshot.tick); onStatus('Connected · server-authoritative flight · 30 Hz');
    });
    this.socket.on('disconnect', () => { this.input = idleInput(); onStatus('Disconnected · flight frozen · reconnecting…'); });
    this.socket.on('connect_error', () => onStatus('Cannot reach flight server. Start it or check the server URL.'));
    this.timer = setInterval(() => {
      if (this.socket.connected) {
        this.socket.volatile.emit('input', this.input);
        if (Date.now() - this.lastSnapshot > 1000) onStatus('Server snapshots stopped · flight frozen');
      }
    }, TICK_MS);
    this.socket.connect();
  }
  setInput(input: PlayerInput) { this.input = input; }
  release() { this.input = { ...idleInput(), aim: this.input.aim }; if (this.socket.connected) this.socket.volatile.emit('input', this.input); }
  reset() { this.release(); if (this.socket.connected) this.socket.emit('resetFlight'); }
  close() { clearInterval(this.timer); this.socket.removeAllListeners(); this.socket.disconnect(); }
}
