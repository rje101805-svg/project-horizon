import { ALIEN_MELEE_COOLDOWN_MS } from '../shared/alien';
import { ProjectilePrediction } from './projectile-prediction';
import { BASIC_BLASTER, type FireRequest, type FireResult } from '../shared/projectiles';
import { io, type Socket } from 'socket.io-client';
import { idleInput, TICK_MS, type PlayerInput } from '../shared/flight';
import type { ClientEvents, RoomInfo, RoomResult, ServerEvents, Snapshot } from '../shared/protocol';
import { LocalPredictor } from './prediction';
import { DebugLag } from './debug-lag';
import { parseProjectileHit, type ProjectileHit } from '../shared/hit-feedback';
export interface ConnectionCallbacks {
  snapshot: (snapshot: Snapshot) => void;
  room: (room: RoomInfo) => void;
  status: (message: string) => void;
  roomLost: (message: string) => void;
  snapshotReceived?: () => void; // valid raw arrival, before DEV visual delay
  ping?: (milliseconds: number | null) => void;
  hit?: (hit: ProjectileHit) => void;
}
export class FlightConnection {
  starting = false;
  private firing = false;
  private fireAim = 0;
  private nextFireAt = 0;
  private shotSequence = 0;
  private reloadSequence = 0;
  readonly projectilePrediction = new ProjectilePrediction();
  readonly prediction = new LocalPredictor();
  private previousTime = performance.now();
  private accumulator = 0;
  private pendingRelease = false;
  readonly socket: Socket<ServerEvents, ClientEvents>;
  room: RoomInfo | null = null;
  latest: Snapshot | null = null;
  private timer: ReturnType<typeof setInterval>;
  private input = idleInput();
  private tick = -1;
  private receivedTick = -1;
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
    this.socket.on('projectileHit', raw => {
      const epoch = this.epoch, hit = parseProjectileHit(raw);
      if (!hit) return;
      const accept = () => {
        const owner = this.latest?.players.find(p => p.id === this.socket.id);
        if (epoch !== this.epoch || !this.socket.connected || hit.roomCode !== this.room?.code || !this.room.playerIds.includes(hit.targetId) || !owner ||
          hit.ownerId !== owner.id || hit.ownerSession !== owner.reloadSession || owner.lifeState !== 'active' ||
          hit.lifeGeneration !== owner.lifeGeneration || hit.teleportSequence !== owner.teleportSequence) return;
        if (this.canPlay()) callbacks.hit?.(hit);
      };
      if (this.lag) this.lag.schedule('snapshot', accept); else accept();
    });
    this.socket.on('snapshot', snapshot => {
      // Observe existing packets only. No extra traffic, and not a count of
      // delayed render callbacks or snapshots from another membership/room.
      if (this.socket.connected && snapshot.roomCode === this.room?.code && snapshot.tick > this.receivedTick && snapshot.players.some(p => p.id === this.socket.id)) {
        this.receivedTick = snapshot.tick; callbacks.snapshotReceived?.();
      }
      const epoch = this.epoch;
      const accept = () => {
        if (epoch !== this.epoch || !this.socket.connected || snapshot.roomCode !== this.room?.code || snapshot.tick <= this.tick) return;
        if (!snapshot.players.some(p => p.id === this.socket.id)) return;
        // Reliable departures may precede an older delayed snapshot. Do not resurrect ships.
        const ids = new Set(this.room.playerIds);
        snapshot = { ...snapshot, players: snapshot.players.filter(p => ids.has(p.id)) };
        const matchChanged = this.latest && (snapshot.match.round !== this.latest.match.round || snapshot.match.state !== this.latest.match.state);
        if (matchChanged) { this.starting = false; this.epoch++; this.lag?.clear(); this.input = idleInput(); this.firing = false; this.nextFireAt = 0; this.pendingRelease = false; this.accumulator = 0; this.prediction.clear(); this.projectilePrediction.clear(); }
        const previous = this.latest?.players.find(p => p.id === this.socket.id);
        const local = snapshot.players.find(p => p.id === this.socket.id)!;
        if (!previous || local.lifeState !== previous.lifeState || local.lifeGeneration !== previous.lifeGeneration || local.teleportSequence !== previous.teleportSequence) {
          this.lag?.clear(); this.input = idleInput();
        }
        const teleport = this.prediction.reconcile(local, snapshot.blackHole);
        if (teleport) this.accumulator = 0;
        this.projectilePrediction.reconcile(snapshot, this.socket.id!, performance.now());
        this.tick = snapshot.tick; this.lastSnapshot = Date.now(); this.latest = snapshot;
        callbacks.snapshot(snapshot); callbacks.status('Connected · server-authoritative flight · 30 Hz');
      };
      if (this.lag) this.lag.schedule('snapshot', accept); else accept();
    });
    this.socket.on('disconnect', () => { this.invalidate(); this.input = idleInput(); callbacks.ping?.(null); callbacks.status('Disconnected · flight frozen · reconnecting…'); });
    this.socket.on('connect_error', () => callbacks.status('Cannot reach flight server yet · server may be waking up · retrying automatically…'));
    this.timer = setInterval(() => {
      if (this.socket.connected && Date.now() - this.lastProbe >= 3000) this.measurePing();
      const now = performance.now(), elapsed = now - this.previousTime;
      this.previousTime = now;
      if (!this.socket.connected || !this.room || !this.latest || Date.now() - this.lastSnapshot > 1000 || elapsed > 250) {
        this.accumulator = 0;
        if (this.socket.connected && this.room && this.latest && Date.now() - this.lastSnapshot > 1000) callbacks.status('Server snapshots stopped · flight frozen');
        return;
      }
      if (!this.canPlay()) { this.accumulator = 0; return; }
      this.attemptFire(now);
      this.accumulator += Math.max(0, elapsed);
      while (this.accumulator >= TICK_MS) {
        this.accumulator -= TICK_MS;
        const release = this.pendingRelease;
        const input = this.prediction.tick(release ? { ...idleInput(), aim: this.input.aim } : this.input, release), epoch = this.epoch;
        if (!input) continue;
        this.pendingRelease = false;
        const send = () => { if (epoch === this.epoch && this.socket.connected && this.room) this.socket.emit('input', input); };
        if (this.lag && !release) this.lag.schedule('input', send); else send();
      }
    }, 5);
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
  private invalidate() { this.starting = false; this.projectilePrediction.clear(); this.firing = false; this.epoch++; this.receivedTick = -1; this.lag?.clear(); this.latest = null; this.prediction.clear(); this.accumulator = 0; this.previousTime = performance.now(); }
  private tractorSequence=0;
  tractor() {
    const match=this.latest?.match,local=this.latest?.players.find(p=>p.id===this.socket.id);
    if(!this.socket.connected || match?.state!=='active' || !local || local.status!=='ALIVE' || local.lifeState!=='active' || local.tractor.targetId || local.tractor.cooldownRemainingMs>0)return;
    const request={sequence:++this.tractorSequence,round:match.round,lifeGeneration:local.lifeGeneration,teleportSequence:local.teleportSequence,reloadSession:local.reloadSession},epoch=this.epoch;
    const send=()=>{if(epoch!==this.epoch || !this.socket.connected)return;this.socket.timeout(3000).emit('tractor',request,(error,result)=>{const accept=()=>{if(epoch===this.epoch)this.callbacks.status(error?'Tractor request timed out':result.message);};if(this.lag)this.lag.schedule('snapshot',accept);else accept();});};
    if(this.lag)this.lag.schedule('input',send);else send();
  }
  startMatch() {
    const match = this.latest?.match;
    if (this.starting || !this.socket.connected || !match || match.state !== 'waiting' || this.room?.match.hostId !== this.socket.id) return;
    this.starting = true;
    const epoch=this.epoch, request={round:match.round};
    const send=()=>{if(epoch!==this.epoch || !this.socket.connected || !this.room)return;
      this.socket.timeout(3000).emit('startMatch',request,(error,result)=>{
        const accept=()=>{if(epoch!==this.epoch)return;this.starting=false;this.callbacks.status(error?'Start request timed out':result.message);};
        if(this.lag)this.lag.schedule('snapshot',accept);else accept();
      });
    };
    if(this.lag)this.lag.schedule('input',send);else send();
  }
  canPlay() { return !!this.latest && this.latest.match.state !== 'ended' && (this.latest.match.state === 'waiting' || this.latest.match.roster.includes(this.socket.id ?? '')); }
  setInput(input: PlayerInput) { this.input = this.canPlay() && this.latest?.players.find(p => p.id === this.socket.id)?.lifeState === 'active' ? input : idleInput(); }
  setFakeLag(enabled: boolean, delayMs = 150, jitterMs = 30) { this.lag?.setEnabled(enabled, delayMs, jitterMs); this.release(); }
  scheduleDevelopmentAction(action: () => void) {
    if (!import.meta.env.DEV) return;
    const epoch = this.epoch;
    const guarded = () => { if (epoch === this.epoch && this.socket.connected && this.room) action(); };
    if (this.lag) this.lag.schedule('input', guarded); else guarded();
  }
  setFireIntent(held: boolean, aim: number) { this.firing = held; this.fireAim = aim; }
  private attemptFire(now: number) {
    const local = this.latest?.players.find(p => p.id === this.socket.id);
    if (!this.canPlay() || !this.firing || now < this.nextFireAt || !local || local.lifeState !== 'active' || local.status === 'OUT' || local.tractor.targetId || local.health <= 0 || local.status === 'ALIVE' && (local.ammo <= 0 || local.isReloading)) return;
    this.nextFireAt = now + (local.status === 'ALIEN' ? ALIEN_MELEE_COOLDOWN_MS : BASIC_BLASTER.fireIntervalMs);
    const request: FireRequest = { sequence: ++this.shotSequence, aim: this.fireAim, lifeGeneration: local.lifeGeneration, teleportSequence: local.teleportSequence };
    if (local.status === 'ALIVE') this.projectilePrediction.add(request, this.renderedLocal(0) ?? local, now);
    const epoch = this.epoch;
    const send = () => {
      if (epoch !== this.epoch || !this.socket.connected || !this.room) return;
      this.socket.timeout(3000).emit('fire', request, (error, result: FireResult) => {
        const accept = () => {
          if (epoch !== this.epoch || error || !result) return;
          this.projectilePrediction.result(result, this.latest);
          if (!result.ok && result.reason === 'Cooldown') this.nextFireAt = Math.min(this.nextFireAt, performance.now() + TICK_MS);
        };
        if (this.lag) this.lag.schedule('snapshot', accept); else accept();
      });
    };
    if (this.lag) this.lag.schedule('input', send); else send();
  }
  renderedLocal(elapsedMs: number) { return this.prediction.render(this.accumulator / TICK_MS, elapsedMs); }
  release() {
    this.starting = false;
    this.projectilePrediction.cancelPending(); this.firing = false;
    this.lag?.clear(); this.input = { ...idleInput(), aim: this.input.aim };
    this.pendingRelease = true;
  }
  reload() {
    const local = this.latest?.players.find(p => p.id === this.socket.id), room = this.room;
    if (!this.canPlay() || !this.socket.connected || !room || !local || local.lifeState !== 'active' || local.status !== 'ALIVE') return;
    const request = { sequence: ++this.reloadSequence, lifeGeneration: local.lifeGeneration,
      teleportSequence: local.teleportSequence, roomCode: room.code, reloadSession: local.reloadSession }, epoch = this.epoch;
    const send = () => {
      if (epoch === this.epoch && this.socket.connected && this.room?.code === request.roomCode)
        this.socket.emit('reload', request, () => {});
    };
    if (this.lag) this.lag.schedule('input', send); else send();
  }
  reset() { if (!import.meta.env.DEV) return; this.release(); if (this.socket.connected && this.room) this.socket.emit('resetFlight', this.latest?.players.find(p => p.id === this.socket.id)?.lifeGeneration ?? -1); }
  close() {
    if (this.closed) return;
    this.closed = true; this.cancelWait?.(); this.invalidate(); this.room = null; clearInterval(this.timer);
    if (this.socket.connected) this.socket.emit('leaveRoom', () => {});
    this.socket.removeAllListeners(); this.socket.disconnect();
  }
}
