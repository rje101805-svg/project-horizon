import { io, type Socket } from 'socket.io-client';
import { idleInput, TICK_MS, type PlayerInput } from '../shared/flight';
import type { ClientEvents, RoomInfo, RoomResult, ServerEvents, Snapshot } from '../shared/protocol';
import { DebugLag } from './debug-lag';
export interface ConnectionCallbacks {
  snapshot: (snapshot: Snapshot) => void;
  room: (room: RoomInfo) => void;
  status: (message: string) => void;
  roomLost: (message: string) => void;
  ping?: (milliseconds: number | null) => void;
}
export class FlightConnection {
  readonly socket: Socket<ServerEvents, ClientEvents>;
  room: RoomInfo | null = null;
  latest: Snapshot | null = null;
  private timer: ReturnType<typeof setInterval>;
  private input = idleInput();
  private tick = -1;
  private lastSnapshot = 0;
  private epoch = 0;
  private name = 'Pilot';
  private closed = false;
  private cancelWait: (() => void) | null = null;
  private lastProbe = 0;
  private probing = false;
  private readonly lag = import.meta.env.DEV ? new DebugLag() : null;
  constructor(url: string, private callbacks: ConnectionCallbacks) {
    this.socket = io(url, { autoConnect: false, reconnectionDelay: 2000, reconnectionDelayMax: 5000, timeout: 10000 });
    this.socket.on('connect', () => {
      this.invalidate(); this.tick = -1; this.input = idleInput(); this.lastSnapshot = Date.now();
      callbacks.status('Connected · awaiting room');
      this.lastProbe = 0;
      if (this.room) {
        const code = this.room.code;
        void this.request('join', this.name, code).then(result => {
          if (this.closed || !this.socket.connected) return;
          if (!result.ok) { this.room = null; callbacks.roomLost(result.error); }
        });
      }
    });
    this.socket.on('roomState', room => {
      if (!this.room || room.code !== this.room.code) return;
      // Membership/removal is reliable and intentionally bypasses fake lag.
      this.room = room; callbacks.room(room);
    });
    this.socket.on('snapshot', snapshot => {
      const epoch = this.epoch;
      const accept = () => {
        if (epoch !== this.epoch || !this.socket.connected || snapshot.roomCode !== this.room?.code || snapshot.tick <= this.tick) return;
        if (!snapshot.players.some(p => p.id === this.socket.id)) return;
        // Reliable departures may precede an older delayed snapshot. Do not resurrect ships.
        const ids = new Set(this.room.playerIds);
        snapshot = { ...snapshot, players: snapshot.players.filter(p => ids.has(p.id)) };
        this.tick = snapshot.tick; this.lastSnapshot = Date.now(); this.latest = snapshot;
        callbacks.snapshot(snapshot); callbacks.status('Connected · server-authoritative flight · 30 Hz');
      };
      if (this.lag) this.lag.schedule('snapshot', accept); else accept();
    });
    this.socket.on('disconnect', () => { this.invalidate(); this.input = idleInput(); callbacks.ping?.(null); callbacks.status('Disconnected · flight frozen · reconnecting…'); });
    this.socket.on('connect_error', () => callbacks.status('Cannot reach flight server yet · server may be waking up · retrying automatically…'));
    this.timer = setInterval(() => {
      if (this.socket.connected && Date.now() - this.lastProbe >= 3000) this.measurePing();
      if (this.socket.connected && this.room) {
        const input = { ...this.input }, epoch = this.epoch;
        const send = () => { if (epoch === this.epoch && this.socket.connected && this.room) this.socket.volatile.emit('input', input); };
        if (this.lag) this.lag.schedule('input', send); else send();
        if (Date.now() - this.lastSnapshot > 1000) callbacks.status('Server snapshots stopped · flight frozen');
      }
    }, TICK_MS);
  }
  async enter(mode: 'create' | 'join', name: string, code = ''): Promise<RoomResult> {
    this.name = name;
    if (!this.socket.connected) {
      this.callbacks.status('Connecting to server…');
      const connected = await new Promise<boolean>(resolve => {
        const finish = (success: boolean) => {
          clearTimeout(timer); clearTimeout(waking); this.socket.off('connect', onConnect);
          this.cancelWait = null; resolve(success);
        };
        const onConnect = () => finish(true);
        const waking = setTimeout(() => this.callbacks.status('Server may be waking up · retrying automatically…'), 8000);
        const timer = setTimeout(() => finish(false), 120000);
        this.cancelWait = () => finish(false);
        this.socket.once('connect', onConnect); this.socket.connect();
      });
      if (!connected || this.closed) return { ok: false, error: 'Cannot reach flight server after waiting. Check the URL and /health, then try again.' };
    }
    return this.request(mode, name, code);
  }
  private request(mode: 'create' | 'join', name: string, code: string): Promise<RoomResult> {
    return new Promise(resolve => {
      const epoch = this.epoch;
      const reply = (error: Error | null, result: RoomResult) => {
        if (error || epoch !== this.epoch || this.closed) { resolve({ ok: false, error: 'Room request timed out or disconnected. Please try again.' }); return; }
        if (result.ok) {
          this.invalidate(); this.tick = -1; this.room = result.room;
          this.callbacks.room(result.room);
        }
        resolve(result);
      };
      if (mode === 'create') this.socket.timeout(4000).emit('createRoom', { name }, reply);
      else this.socket.timeout(4000).emit('joinRoom', { name, code }, reply);
    });
  }
  private measurePing() {
    if (this.probing || !this.socket.connected || this.closed) return;
    this.probing = true; this.lastProbe = Date.now();
    const started = performance.now(), id = this.socket.id;
    // Actual Socket.io acknowledgment RTT. Never routed through DebugLag.
    this.socket.timeout(5000).emit('latencyProbe', error => {
      this.probing = false;
      if (!this.closed && this.socket.connected && this.socket.id === id) this.callbacks.ping?.(error ? null : Math.round(performance.now() - started));
    });
  }
  private invalidate() { this.epoch++; this.lag?.clear(); this.latest = null; }
  setInput(input: PlayerInput) { this.input = input; }
  setFakeLag(enabled: boolean) { this.lag?.setEnabled(enabled); this.release(); }
  release() { this.lag?.clear(); this.input = { ...idleInput(), aim: this.input.aim }; if (this.socket.connected && this.room) this.socket.volatile.emit('input', this.input); }
  reset() { this.release(); if (this.socket.connected && this.room) this.socket.emit('resetFlight'); }
  close() {
    if (this.closed) return;
    this.closed = true; this.cancelWait?.(); this.invalidate(); this.room = null; clearInterval(this.timer);
    if (this.socket.connected) this.socket.emit('leaveRoom', () => {});
    this.socket.removeAllListeners(); this.socket.disconnect();
  }
}
