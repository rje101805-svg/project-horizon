import { ProjectileView } from './projectile-view';
import { BASIC_BLASTER } from '../shared/projectiles';
import { GameplayHud } from './hud';
import { MAX_HEALTH } from '../shared/lifecycle';
import type { BlackHoleState } from '../shared/black-hole';
import Phaser from 'phaser';
import './style.css';
import { WORLD, spawnFlight } from '../shared/flight';
import { FlightConnection } from './network';
import { RemoteInterpolator } from './interpolation';
import { roomFromSearch, roomLink } from './room-links';
import { defaultServerUrl, isLoopback, validateServerUrl } from './config';
import { normalizeRoomCode } from '../shared/rooms';
import type { PlayerState, RoomInfo, Snapshot } from '../shared/protocol';
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const hud = new GameplayHud(document);
const planets = [{ x: 650, y: 700, r: 90, color: 0x6095d6, name: 'AZURE' }, { x: 1750, y: 650, r: 115, color: 0xc88066, name: 'EMBER' }, { x: 700, y: 1750, r: 105, color: 0x7caf9a, name: 'VERDANT' }, { x: 1800, y: 1750, r: 85, color: 0x9b8dd0, name: 'ECHO' }];
let game: Phaser.Game | undefined;
let connection: FlightConnection | undefined;
let busy = false;
let attemptId = 0;
type Ship = { body: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text };
class Horizon extends Phaser.Scene {
  private projectileView = new ProjectileView();
  private projectileGraphics!: Phaser.GameObjects.Graphics;
  private fireAim = 0;
  private rocket!: Phaser.GameObjects.Container;
  private holeVisual!: Phaser.GameObjects.Graphics;
  private holeKey = '';
  private map!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private connection!: FlightConnection;
  private aim = 0;
  private ready = false;
  private lastLocalLife: string | null = null;
  private lastLocalGeneration = -1;
  private lastTeleport = -1;
  private lastRender = performance.now();
  private lastDebug = 0;
  private ships = new Map<string, Ship>();
  private interpolator = new RemoteInterpolator();
  constructor() { super('Horizon'); }
  create() {
    const stars = this.add.graphics();
    const random = new Phaser.Math.RandomDataGenerator(['horizon']);
    for (let i = 0; i < 650; i++) stars.fillStyle(0x9fb6dd, random.frac() * .6 + .15).fillCircle(random.between(0, WORLD), random.between(0, WORLD), random.frac() * 1.5 + .5);
    stars.lineStyle(1, 0x1a2a43, .45);
    for (let n = 0; n <= WORLD; n += 200) { stars.lineBetween(n, 0, n, WORLD); stars.lineBetween(0, n, WORLD, n); }
    stars.lineStyle(5, 0x405977).strokeRect(0, 0, WORLD, WORLD);
    for (const p of planets) {
      const g = this.add.graphics();
      g.lineStyle(1, p.color, .2).strokeCircle(p.x, p.y, p.r + 22);
      g.fillStyle(p.color, .15).fillCircle(p.x, p.y, p.r + 9);
      g.fillStyle(p.color).fillCircle(p.x, p.y, p.r);
      g.fillStyle(0x080e1e, .25).fillCircle(p.x + p.r * .35, p.y - p.r * .15, p.r * .8);
      this.add.text(p.x, p.y + p.r + 35, p.name, { fontSize: '12px', color: '#9aacc9', letterSpacing: 3 }).setOrigin(.5);
    }
    this.projectileGraphics = this.add.graphics().setDepth(6);
    this.holeVisual = this.add.graphics().setDepth(2);
    if (connection?.room) this.drawBlackHole(connection.room.blackHole);
    const spawn = spawnFlight();
    this.rocket = this.add.container(spawn.x, spawn.y).setDepth(4);
    this.cameras.main.setBounds(0, 0, WORLD, WORLD).startFollow(this.rocket, true, .12, .12);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,R,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE']);
    this.map = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.connection = connection!;
    // Handle the key transition itself: a short tap can begin and end between
    // rendered frames, so frame polling may miss it. Key repeat does not reset.
    this.keys.R.on('down', () => this.resetFlight());
    const release = () => { this.input.keyboard!.resetKeys(); this.connection.release(); };
    const visibility = () => { if (document.hidden) release(); };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', visibility);
    const cleanup = () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', visibility);
      this.ready = false;
      this.interpolator.clear(); this.projectileView.clear();
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      pointer.updateWorldPoint(this.cameras.main);
      this.fireAim = this.aim = Math.atan2(pointer.worldY - this.rocket.y, pointer.worldX - this.rocket.x);
    });
    this.ready = true;
    if (this.connection.latest) this.acceptSnapshot(this.connection.latest);
    this.drawMap();
    if (import.meta.env.DEV) Object.assign(window, { __HORIZON_FLIGHT__: this.connection });
  }
  private addShip(player: PlayerState): Ship {
    const hull = this.add.graphics();
    hull.fillStyle(player.color).fillTriangle(22, 0, -13, -12, -8, 0).fillTriangle(22, 0, -8, 0, -13, 12);
    hull.fillStyle(0xffffff).fillCircle(2, 0, 4);
    const local = player.id === this.connection.socket.id;
    const body = local ? this.rocket : this.add.container(player.x, player.y).setDepth(4);
    body.add(hull);
    const label = this.add.text(player.x, player.y + 27, player.name + (local ? ' (you)' : ''), {
      fontSize: '13px', color: '#ffffff', backgroundColor: '#0e1729', padding: { x: 4, y: 2 },
    }).setOrigin(.5, 0).setDepth(5);
    const ship = { body, label }; this.ships.set(player.id, ship); return ship;
  }
  private placeShip(player: PlayerState) {
    const ship = this.ships.get(player.id) ?? this.addShip(player);
    ship.body.setPosition(player.x, player.y).setRotation(player.rotation);
    ship.body.setAlpha(player.lifeState === 'dead' ? .25 : 1);
    ship.label.setPosition(player.x, player.y + 27).setText(player.name + (player.id === this.connection.socket.id ? ' (you)' : '') + (player.lifeState === 'dead' ? ' · DEAD' : ''));

  }
  acceptSnapshot(snapshot: Snapshot) {
    if (!this.ready) return;
    const local = snapshot.players.find(p => p.id === this.connection.socket.id);
    if (!local) return;
    // Lifecycle/HUD stay authoritative; only local movement is predicted.
    this.removeShips(snapshot.players.map(p => p.id));
    this.drawBlackHole(snapshot.blackHole);
    this.placeShip(this.connection.renderedLocal(0) ?? local);
    hud.health(local);
    hud.combat(local);
    if (this.lastLocalGeneration >= 0 && (local.lifeGeneration !== this.lastLocalGeneration || local.teleportSequence !== this.lastTeleport)) this.cameras.main.centerOn(local.x, local.y);
    this.lastLocalGeneration = local.lifeGeneration; this.lastTeleport = local.teleportSequence;
    const lifeKey = `${local.id}:${local.lifeGeneration}:${local.lifeState}:${local.teleportSequence}`;
    if (lifeKey !== this.lastLocalLife) {
      this.input.keyboard!.resetKeys(); this.aim = 0; this.connection.release();
      this.lastLocalLife = lifeKey;
    }
    const dead = local.lifeState === 'dead';
    el('death-overlay').hidden = !dead;
    el('death-countdown').textContent = local.respawnRemainingMs > 0 ? `Respawning in ${(local.respawnRemainingMs / 1000).toFixed(1)}s` : 'Waiting for a safe respawn…';
    el('death-health').textContent = `Health ${local.health} / ${MAX_HEALTH} · Black hole`;
    el('life-status').textContent = `${dead ? 'Dead' : 'Alive'} · health ${local.health} / ${MAX_HEALTH}`;
    el('black-hole-status').textContent = dead ? 'Lost to the black hole · automatic respawn pending' : local.region === 'danger' ? 'DANGER · gravitational pull' : 'Safe space';
    el<HTMLButtonElement>('restart').disabled = local.lifeState === 'dead';
    el('position').textContent = `X ${local.x.toFixed(1)} · Y ${local.y.toFixed(1)}`;
    el('velocity').textContent = `Speed ${Math.hypot(local.vx, local.vy).toFixed(1)}`;
    el('tick').textContent = `Server tick ${snapshot.tick}`;
    this.interpolator.push(snapshot, performance.now());
    this.projectileView.push(snapshot, performance.now());
    el('debug-projectiles').textContent = `Authoritative projectiles: ${snapshot.projectiles.length} · predicted: 0`;
  }
  private drawBlackHole(hole: BlackHoleState) {
    const key = JSON.stringify(hole);
    if (key === this.holeKey) return;
    this.holeKey = key;
    const g = this.holeVisual;
    g.clear().fillStyle(0x8149c9, .07).fillCircle(hole.x, hole.y, hole.influenceRadius);
    g.lineStyle(2, 0xbb80ff, .45).strokeCircle(hole.x, hole.y, hole.influenceRadius);
    for (let i = 5; i > 0; i--) g.lineStyle(i * 3, 0x9b65ff, .07).strokeCircle(hole.x, hole.y, hole.eventHorizonRadius + 12);
    g.lineStyle(5, 0xffca85, .9).strokeEllipse(hole.x, hole.y, hole.eventHorizonRadius * 2.8, hole.eventHorizonRadius * 1.1);
    g.fillStyle(0x010208).fillCircle(hole.x, hole.y, hole.eventHorizonRadius);
    g.lineStyle(2, 0xd6abff).strokeCircle(hole.x, hole.y, hole.eventHorizonRadius);
  }
  removeShips(ids: string[]) {
    if (!this.ready) return;
    this.interpolator.removeMissing(ids); this.projectileView.removeOwners(ids);
    for (const [id, ship] of this.ships) if (!ids.includes(id)) {
      // Keep the camera-follow container on reconnect, but clear its old hull.
      if (ship.body === this.rocket) ship.body.removeAll(true); else ship.body.destroy();
      ship.label.destroy(); this.ships.delete(id);
    }
  }
  freezeRemoteShips() { this.interpolator.clear(); this.projectileView.clear(); }
  resetFlight() { this.aim = 0; this.connection.reset(); }
  update() {
    hud.frame();
    const now = performance.now(), elapsed = now - this.lastRender; this.lastRender = now;
    const local = this.connection.renderedLocal(elapsed);
    if (local && this.connection.socket.connected && this.connection.latest) this.placeShip(local);
    if (now - this.lastDebug >= 250) {
      this.lastDebug = now;
      const p = this.connection.prediction;
      el('debug-prediction').textContent = `Input ${p.sequence} · ack ${p.acknowledged} · pending ${p.pending.length}${p.overflow ? ' · paused (queue full)' : ''}`;
      el('debug-correction').textContent = `Correction ${p.correction.toFixed(2)} · remote delay 100 ms`;
    }
    for (const player of this.interpolator.sample(performance.now(), this.connection.socket.id ?? '')) this.placeShip(player);
    this.projectileGraphics.clear().fillStyle(0xffe08a);
    for (const p of this.projectileView.sample(now)) this.projectileGraphics.fillCircle(p.x, p.y, BASIC_BLASTER.projectileRadius);
    this.drawMap();
    this.connection.setFireIntent(this.keys.SPACE.isDown || this.input.activePointer.isDown && this.input.activePointer.leftButtonDown(), this.fireAim);
    const right = this.keys.D.isDown || this.keys.RIGHT.isDown;
    const left = this.keys.A.isDown || this.keys.LEFT.isDown;
    const up = this.keys.W.isDown || this.keys.UP.isDown;
    const down = this.keys.S.isDown || this.keys.DOWN.isDown;
    const dx = Number(right) - Number(left), dy = Number(down) - Number(up);
    // Preserve movement-facing flight; moving the mouse also sets aim when idle.
    if (dx || dy) this.aim = Math.atan2(dy, dx);
    this.connection.setInput({ up, down, left, right, boost: this.keys.SHIFT.isDown, aim: this.aim });
  }
  private drawMap() {
    const x = this.scale.width - 164, y = 14, size = 150, s = size / WORLD;
    this.map.clear().fillStyle(0x0e1729, .95).fillRoundedRect(x - 5, y - 5, size + 10, size + 10, 8);
    this.map.lineStyle(1, 0x384c68).strokeRect(x, y, size, size);
    for (const p of planets) this.map.fillStyle(p.color).fillCircle(x + p.x * s, y + p.y * s, p.r * s);
    const hole = this.connection.latest?.blackHole ?? this.connection.room?.blackHole;
    if (hole) {
      this.map.lineStyle(1, 0xbb80ff, .7).strokeCircle(x + hole.x * s, y + hole.y * s, hole.influenceRadius * s);
      this.map.fillStyle(0xd6abff).fillCircle(x + hole.x * s, y + hole.y * s, hole.eventHorizonRadius * s);
    }
    for (const [id, ship] of this.ships) {
      const color = this.connection.latest?.players.find(p => p.id === id)?.color ?? 0xffffff;
      this.map.fillStyle(color).fillCircle(x + ship.body.x * s, y + ship.body.y * s, id === this.connection.socket.id ? 3 : 2);
    }
  }
}
function launch() {
  hud.begin();
  el('death-overlay').hidden = true;
  el('life-status').textContent = 'Awaiting life state';
  el<HTMLButtonElement>('restart').disabled = false;
  el('black-hole-status').textContent = 'Awaiting authoritative region';
  el('position').textContent = 'Awaiting position';
  el('velocity').textContent = 'Speed —';
  el('tick').textContent = 'Server tick —';
  el('status').textContent = 'Connecting to flight server…';
  el('home').hidden = true; el('mission').hidden = false;
  if (game) { game.destroy(true); game = undefined; }
  game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: 1100, height: 600, backgroundColor: '#080e1e', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: Horizon });
  if (import.meta.env.DEV) Object.assign(window, { __HORIZON_GAME__: game });
}
function scene() { return game?.scene.scenes[0] as Horizon | undefined; }
function updateRoom(room: RoomInfo) {
  el('room-code-display').textContent = room.code;
  hud.setRoom(room.playerIds.length, connection?.socket.connected ?? false);
  el('player-count').textContent = `${room.playerIds.length} / ${room.maxPlayers} players`;
  scene()?.removeShips(room.playerIds);
}
function goHome(message = '') {
  attemptId++; busy = false;
  el<HTMLButtonElement>('create').disabled = false; el<HTMLButtonElement>('join').disabled = false;
  el('cancel-connect').hidden = true;
  connection?.close(); connection = undefined;
  hud.setRoom(0, false);
  game?.destroy(true); game = undefined;
  el('mission').hidden = true; el('home').hidden = false;
  el('home-status').textContent = message;
}
async function enterRoom(mode: 'create' | 'join') {
  if (busy) return;
  const field = el<HTMLInputElement>('server-url');
  try {
    field.value = validateServerUrl(field.value, isLoopback(location.hostname));
    if (location.protocol === 'https:' && new URL(field.value).protocol !== 'https:') throw new Error('HTTPS clients require an HTTPS server.');
  } catch (error) { field.setCustomValidity(error instanceof Error ? error.message : 'Enter a valid server URL.'); field.reportValidity(); return; }
  const code = normalizeRoomCode(el<HTMLInputElement>('room-code').value);
  if (mode === 'join' && !code) { el('home-status').textContent = 'Enter a valid 4-character room code.'; return; }
  const attempt = ++attemptId;
  el('cancel-connect').hidden = false;
  busy = true; el<HTMLButtonElement>('create').disabled = true; el<HTMLButtonElement>('join').disabled = true;
  el('home-status').textContent = 'Connecting…';
  hud.setPing(null);
  connection?.close();
  const current = new FlightConnection(field.value, {
    snapshot: snapshot => { if (connection === current) scene()?.acceptSnapshot(snapshot); },
    room: room => { if (connection === current) updateRoom(room); },
    snapshotReceived: () => { if (connection === current) hud.snapshotReceived(); },
    ping: milliseconds => { if (connection === current) hud.setPing(milliseconds); },
    status: message => {
      if (connection !== current) return;
      el(el('home').hidden ? 'status' : 'home-status').textContent = message;
      if (message.startsWith('Disconnected')) { hud.setRoom(0, false); scene()?.freezeRemoteShips(); }
    },
    roomLost: message => { if (connection === current) goHome(`Room ended or unavailable. ${message} Create or join a room again.`); },
  });
  connection = current;
  try {
    const result = await current.enter(mode, el<HTMLInputElement>('display-name').value, code ?? '');
    if (attempt !== attemptId) return;
    if (result.ok) {
      launch(); updateRoom(result.room);
      const checkbox = el<HTMLInputElement>('fake-lag'); current.setFakeLag(import.meta.env.DEV && checkbox.checked, 150, el<HTMLInputElement>('fake-jitter').checked ? 30 : 0);
    } else { goHome(result.error); }
  } finally {
    if (attempt === attemptId) { busy = false; el('cancel-connect').hidden = true; el<HTMLButtonElement>('create').disabled = false; el<HTMLButtonElement>('join').disabled = false; }
  }
}
el('create').onclick = () => { void enterRoom('create'); };
el('join').onclick = () => { void enterRoom('join'); };
el<HTMLInputElement>('server-url').oninput = () => el<HTMLInputElement>('server-url').setCustomValidity('');
el<HTMLInputElement>('server-url').value = defaultServerUrl(import.meta.env.DEV, location.hostname, import.meta.env.VITE_SERVER_URL);
el('build-stamp').textContent = `Build: ${__HORIZON_BUILD__.buildId}`;
el('cancel-connect').onclick = () => goHome('Connection cancelled.');
const linkedRoom = roomFromSearch(location.search);
if (linkedRoom) { el<HTMLInputElement>('room-code').value = linkedRoom; el('home-status').textContent = `Room ${linkedRoom} ready to join. Confirm your name, then click Join room.`; }
el<HTMLInputElement>('room-code').oninput = () => { const input = el<HTMLInputElement>('room-code'); input.value = input.value.toUpperCase(); };
el('restart').onclick = () => scene()?.resetFlight();
el('leave').onclick = () => goHome();
async function copy(value: string) {
  try { await navigator.clipboard.writeText(value); el('share-status').textContent = 'Copied'; }
  catch { el('share-status').textContent = `Copy manually: ${value}`; }
}
el('copy-code').onclick = () => { if (connection?.room) void copy(connection.room.code); };
el('copy-link').onclick = () => { if (connection?.room) void copy(roomLink(location.href, connection.room.code)); };
if (import.meta.env.DEV) {
  void import('./combat-debug').then(({ installCombatDebug }) => installCombatDebug(() => connection));
  el('debug-network').hidden = false;
  const updateLag = () => connection?.setFakeLag(el<HTMLInputElement>('fake-lag').checked, 150, el<HTMLInputElement>('fake-jitter').checked ? 30 : 0);
  el<HTMLInputElement>('fake-lag').onchange = updateLag;
  el<HTMLInputElement>('fake-jitter').onchange = updateLag;
}

window.addEventListener('keydown', event => {
  if (event.code !== 'F3' || el('mission').hidden) return;
  event.preventDefault();
  if (!event.repeat) hud.toggle();
});
