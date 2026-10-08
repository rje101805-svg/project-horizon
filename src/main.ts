import {preloadCosmicImages} from './visual/cosmic-images';
import {PLANET_REGIONS,LANDMARKS,mapPoint} from './visual/solar-layout';
import { HorizonVisual } from './visual/horizon';
import type { Composition } from './visual/debug';
import { VisualIntensity } from './visual/intensity';
import { CelestialWorld } from './visual/celestial';
import { DeepSpace } from './visual/space';
import { cameraTarget, easeZoom, defaultVisualQuality } from './visual/config';
import { TRACTOR_RANGE, TRACTOR_CONE_ANGLE, TRACTOR_KILL_LOCK_MS, TRACTOR_PULL_STRENGTH, TRACTOR_MAX_DURATION_MS, inTractorCone } from '../shared/tractor';
import { ALIEN_COLOR, ALIEN_OPACITY } from '../shared/alien';
import { ShipCombatHud } from './ship-combat-hud';
import { HitFeedback } from './hit-feedback';
import { DamageNumbers } from './damage-numbers';
import type { ProjectileHit } from '../shared/hit-feedback';
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
let game: Phaser.Game | undefined;
let connection: FlightConnection | undefined;
let busy = false;
let attemptId = 0;
type Ship = { body: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text; hull: Phaser.GameObjects.Graphics; alien: boolean };
class Horizon extends Phaser.Scene {
  private composition:Composition='auto';
  private inspectionPoint:{x:number;y:number}|null=null;
  private visualDebugCleanup?:()=>void;
  private previewHorizon?:HorizonVisual;
  private visualIntensity=new VisualIntensity();
  private horizonVisual!:HorizonVisual;
  private celestial!: CelestialWorld;
  private deepSpace!: DeepSpace;
  private hitFeedback = new HitFeedback();
  private damageNumbers!: DamageNumbers;
  private localHud!: ShipCombatHud;
  private projectileView = new ProjectileView();
  private tractorGraphics!: Phaser.GameObjects.Graphics;
  private lastTractorShake=0;
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
  private spectatedId: string | null = null;
  private lastLocalLife: string | null = null;
  private lastLocalGeneration = -1;
  private lastTeleport = -1;
  private lastRender = performance.now();
  private lastDebug = 0;
  private ships = new Map<string, Ship>();
  private interpolator = new RemoteInterpolator();
  constructor() { super('Horizon'); }
  preload() { preloadCosmicImages(this); this.game.canvas.style.visibility='hidden'; for(const biome of ['ice','volcanic','terrestrial','moon','clouds','ice-detail','volcanic-detail','terrestrial-detail','moon-detail'])this.load.image(`surface-${biome}`,`${import.meta.env.BASE_URL}planets/${biome}.png`); }
  create() {
    const webgl=this.game.renderer.type===Phaser.WEBGL;
    this.visualIntensity.quality=defaultVisualQuality(webgl);
    this.visualIntensity.camera=webgl;
    this.deepSpace = new DeepSpace(this);
    const border=this.add.graphics().setDepth(-10);border.lineStyle(2,0x465769,.3).strokeRect(0,0,WORLD,WORLD);
    this.celestial = new CelestialWorld(this);
    this.localHud = new ShipCombatHud(this); this.damageNumbers = new DamageNumbers(this);
    this.tractorGraphics = this.add.graphics().setDepth(3);
    this.projectileGraphics = this.add.graphics().setDepth(6);
    this.horizonVisual=new HorizonVisual(this);
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
    // rendered frames, so frame polling may miss it. Key repeat never reloads.
    const reload = (event: KeyboardEvent) => {
      const target = event.target as HTMLInputElement;
      const typing = target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT' && target.type !== 'checkbox';
      if (event.code === 'KeyE' && !event.repeat && !typing) this.connection.tractor();
      if (event.code === 'KeyR' && !event.repeat && !typing) this.connection.reload();
    };
    window.addEventListener('keydown', reload);
    const release = () => { this.input.keyboard!.resetKeys(); this.connection.release(); };
    const visibility = () => { if (document.hidden) release(); };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', visibility);
    const rendered=()=>hud.renderFrame();this.game.events.on('postrender',rendered);
    const cleanup = () => {
      if (!this.ready) return;
      window.removeEventListener('keydown', reload);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', visibility);
      this.game.events.off('postrender',rendered);
      this.ready = false;this.visualDebugCleanup?.();this.previewHorizon?.destroy();
      this.deepSpace.destroy();this.celestial.destroy();this.horizonVisual.destroy();
      this.interpolator.clear(); this.projectileView.clear(); this.hitFeedback.clear(); this.damageNumbers.clear(); this.localHud.clear();
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      pointer.updateWorldPoint(this.cameras.main);
      this.fireAim = this.aim = Math.atan2(pointer.worldY - this.rocket.y, pointer.worldX - this.rocket.x);
    });
    this.ready = true;this.game.canvas.style.visibility='visible';el('game').style.visibility='visible';
    if(import.meta.env.DEV)void import('./visual/debug').then(({installVisualDebug})=>{
      if(this.ready)this.visualDebugCleanup=installVisualDebug(this.visualIntensity,(name,biome)=>{this.composition=name;if(biome)this.celestial.studyBiome=biome;if((name==='horizon'||name==='combat')&&!this.previewHorizon)this.previewHorizon=new HorizonVisual(this,'study');},point=>{this.inspectionPoint=point;this.connection.release();if(point)this.cameras.main.stopFollow().centerOn(point.x,point.y);else this.cameras.main.startFollow(this.rocket,true,.12,.12).centerOn(this.rocket.x,this.rocket.y);});
    });
    if (this.connection.latest) this.acceptSnapshot(this.connection.latest);
    this.drawMap();
    if (import.meta.env.DEV) Object.assign(window, { __HORIZON_FLIGHT__: this.connection });
  }
  private drawHull(hull: Phaser.GameObjects.Graphics, color: number, alien: boolean) {
    hull.clear();
    if (alien) {
      // Round ghost silhouette and lavender tint, distinct from human triangles.
      hull.lineStyle(4,0x02050d,1).strokeCircle(0,-2,15).strokeTriangle(-14,0,-24,13,12,11);
      hull.fillStyle(ALIEN_COLOR).fillCircle(0,-2,15).fillTriangle(-14,0,-24,13,12,11);
      hull.lineStyle(1.5,0xe8eaff,.9).strokeCircle(0,-2,15).strokeTriangle(-14,0,-24,13,12,11);
      hull.fillStyle(0x080e1e).fillCircle(5,-6,3).fillCircle(5,3,3);
    } else {
      hull.lineStyle(3,0x02050d).strokeTriangle(22,0,-13,-12,-8,0).strokeTriangle(22,0,-8,0,-13,12);
      hull.fillStyle(color).fillTriangle(22, 0, -13, -12, -8, 0).fillTriangle(22, 0, -8, 0, -13, 12);
      hull.fillStyle(0xffffff).fillCircle(2, 0, 4);
    }
  }
  private addShip(player: PlayerState): Ship {
    const hull = this.add.graphics();
    this.drawHull(hull, player.color, false);
    const local = player.id === this.connection.socket.id;
    const body = local ? this.rocket : this.add.container(player.x, player.y).setDepth(4);
    body.add(hull);
    const label = this.add.text(player.x, player.y + 27, player.name + (local ? ' (you)' : ''), {
      fontSize: '13px', color: '#ffffff', backgroundColor: '#0e1729', padding: { x: 4, y: 2 },
    }).setOrigin(.5, 0).setDepth(5);
    const ship = { body, label, hull, alien:false }; this.ships.set(player.id, ship); return ship;
  }
  private placeShip(player: PlayerState) {
    if (player.status === 'OUT') return;
    const ship = this.ships.get(player.id) ?? this.addShip(player);
    ship.body.setPosition(player.x, player.y).setRotation(player.rotation);
    const alien = player.status === 'ALIEN';
    if (ship.alien !== alien) {
      ship.alien = alien;
      this.drawHull(ship.hull, player.color, alien);
    }
    ship.body.setAlpha(alien ? ALIEN_OPACITY : player.lifeState === 'dead' ? .25 : 1);
    ship.label.setPosition(player.x, player.y + 27).setText(player.name + (player.controllerType==='BOT' ? ' [BOT]' : '') + (player.id === this.connection.socket.id ? ' (you)' : '') + (alien ? ' · ALIEN' : '') + (player.lifeState === 'dead' ? ' · DEAD' : ''));
    // Edge-spawned ghosts keep their tag readable without moving the ship/camera.
    const view = this.cameras.main.worldView;
    if (alien && view.contains(player.x, player.y)) ship.label.setPosition(
      Phaser.Math.Clamp(player.x, view.left + ship.label.width / 2 + 4, view.right - ship.label.width / 2 - 4),
      Phaser.Math.Clamp(player.y + 27, view.top + 4, view.bottom - ship.label.height - 4));

  }
  acceptSnapshot(snapshot: Snapshot) {
    if (!this.ready) return;
    const local = snapshot.players.find(p => p.id === this.connection.socket.id);
    if (!local) return;
    // Lifecycle/HUD stay authoritative; only local movement is predicted.
    this.removeShips(snapshot.players.filter(p => p.status !== 'OUT').map(p => p.id));
    this.drawBlackHole(snapshot.blackHole);
    if (local.status !== 'OUT') this.placeShip(this.connection.renderedLocal(0) ?? local);
    this.localHud.accept(local, performance.now());
    this.hitFeedback.reconcile(snapshot, local.id);
    hud.health(local);
    hud.combat(local); hud.humans(snapshot.survivingHumans);
    const match = snapshot.match, spectator = local.status === 'OUT';
    el('match-status').textContent = match.state === 'waiting' ? 'Waiting for host start' : spectator ? 'SPECTATING · JOINS NEXT ROUND' : `Round ${match.round} · ${match.state}`;
    updateLobby();
    el('match-overlay').hidden = match.state !== 'ended';
    el('match-result').textContent = match.result?.kind === 'draw' ? 'DRAW' : match.result?.kind === 'winner' ? match.result.winnerId === local.id ? 'VICTORY' : `${match.result.winnerName} WINS` : '';
    el('match-reset').textContent = `Return to lobby in ${(match.resetRemainingMs / 1000).toFixed(1)}s`;
    if (match.state === 'ended' || spectator) { this.hitFeedback.clear(); this.damageNumbers.clear(); this.localHud.clear(); }
    if (this.lastLocalGeneration >= 0 && (local.lifeGeneration !== this.lastLocalGeneration || local.teleportSequence !== this.lastTeleport)) this.cameras.main.centerOn(local.x, local.y);
    this.lastLocalGeneration = local.lifeGeneration; this.lastTeleport = local.teleportSequence;
    const lifeKey = `${match.round}:${match.state}:${local.id}:${local.lifeGeneration}:${local.lifeState}:${local.teleportSequence}`;
    if (lifeKey !== this.lastLocalLife) {
      this.input.keyboard!.resetKeys(); this.aim = 0; this.connection.release();
      this.hitFeedback.clear(); this.damageNumbers.clear();
      this.lastLocalLife = lifeKey;
    }
    const dead = local.lifeState === 'dead';
    el('death-overlay').hidden = !dead || match.state === 'ended' || spectator;
    el('death-countdown').textContent = local.respawnRemainingMs > 0 ? `Respawning in ${(local.respawnRemainingMs / 1000).toFixed(1)}s` : 'Waiting for a safe respawn…';
    el('death-title').textContent = 'Eliminated · alien respawn pending';
    el('death-health').textContent = `ALIEN · Health ${local.health} / ${local.maxHealth} · ${local.deathSource?.type === 'TRACTOR' ? 'Tractor lock finisher' : local.deathSource?.type === 'PLAYER' ? 'Player attack' : local.deathSource?.cause ?? 'Damage'}`;
    el('life-status').textContent = `${dead ? 'Dead' : 'Alive'} · health ${local.health} / ${local.maxHealth}`;
    el('black-hole-status').textContent = dead ? local.deathSource?.type === 'ENVIRONMENT' && local.deathSource.cause === 'BLACK_HOLE' ? 'Lost to the black hole · alien respawn pending' : 'Eliminated · alien respawn pending' : local.region === 'danger' ? 'DANGER · gravitational pull' : 'Safe space';
    el<HTMLButtonElement>('restart').disabled = local.lifeState === 'dead' || !this.connection.canPlay();
    el('position').textContent = `X ${local.x.toFixed(1)} · Y ${local.y.toFixed(1)}`;
    el('velocity').textContent = `Speed ${Math.hypot(local.vx, local.vy).toFixed(1)}`;
    el('tick').textContent = `Server tick ${snapshot.tick}`;
    this.interpolator.push(snapshot, performance.now());
    this.projectileView.push(snapshot, performance.now());
    el('debug-projectiles').textContent = `Authoritative projectiles: ${snapshot.projectiles.length} · predicted: ${this.connection.projectilePrediction.count(performance.now())}`;
  }
  private drawBlackHole(hole: BlackHoleState) {
    const key=JSON.stringify(hole);if(key===this.holeKey)return;this.holeKey=key;
    // Existing influence boundary remains a subdued gameplay landmark.
    this.holeVisual.clear().lineStyle(1,0x947557,.18).strokeCircle(hole.x,hole.y,hole.influenceRadius);
  }
  removeShips(ids: string[]) {
    if (!this.ready) return;
    this.hitFeedback.removeMissing(ids);
    this.interpolator.removeMissing(ids); this.projectileView.removeOwners(ids);
    for (const [id, ship] of this.ships) if (!ids.includes(id)) {
      // Keep the camera-follow container on reconnect, but clear its old hull.
      if (ship.body === this.rocket) ship.body.removeAll(true); else ship.body.destroy();
      ship.label.destroy(); this.ships.delete(id);
    }
  }
  freezeRemoteShips() { this.interpolator.clear(); this.projectileView.clear(); this.hitFeedback.clear(); this.damageNumbers.clear(); this.localHud.clear(); }
  acceptHit(hit: ProjectileHit) { if (this.ready) this.hitFeedback.add(hit, this.connection.latest, this.connection.socket.id ?? '', performance.now()); }
  resetFlight() { this.aim = 0; this.connection.reset(); }
  private lastBotDebug=0;
  private updateSpectatorCamera() {
    const latest=this.connection.latest, ids=this.connection.room?.playerIds ?? [];
    if(import.meta.env.DEV && !el('debug-overlay').hidden && performance.now()-this.lastBotDebug>=250){
    this.lastBotDebug=performance.now();
    const botText=latest?.players.filter(p=>p.bot).map(p=>`${p.name} [BOT] ${p.id} · ${p.status} · ${p.bot!.mode} → ${p.bot!.target ?? '—'} · ${p.bot!.override ?? 'normal'} · heading ${p.bot!.desiredHeading.toFixed(2)} distance ${p.bot!.distance.toFixed(0)} · thrust ${p.bot!.thrust} boost ${p.bot!.boost} fire ${p.bot!.fire} reload ${p.bot!.reload} tractor ${p.bot!.tractor} melee ${p.bot!.melee} · ammo ${p.ammo} · lock ${p.tractor.lockElapsedMs}`).join('\n') ?? '';
    if(el('debug-bots').textContent!==botText)el('debug-bots').textContent=botText;
    }
    const local=latest?.players.find(p=>p.id===this.connection.socket.id);
    if (local?.status!=='OUT' || latest?.match.state!=='active') { this.spectatedId=null; return; }
    const valid=latest.players.filter(p=>latest.match.roster.includes(p.id) && ids.includes(p.id) && p.lifeState==='active' && p.health>0 && p.status!=='OUT');
    const target=valid.find(p=>p.id===this.spectatedId) ?? valid.find(p=>p.status==='ALIVE') ?? valid[0];
    this.spectatedId=target?.id ?? null;
    const body=target && this.ships.get(target.id)?.body;
    // The existing camera follows this persistent empty spectator anchor, using
    // rendered participant positions. No new camera/input/network loop.
    if(body)this.rocket.setPosition(body.x,body.y);
  }
  private drawTractors(now:number) {
    this.tractorGraphics.clear();
    const snapshot=this.connection.socket.connected ? this.connection.latest : null;
    const local=snapshot?.players.find(p=>p.id===this.connection.socket.id);
    const active=snapshot?.match.state==='active',usable=active && local?.status==='ALIVE' && local.lifeState==='active';
    const t=local?.tractor;
    const label=usable && t ? t.targetId ? `TRACTOR ACTIVE ${(t.lockElapsedMs/1000).toFixed(1)} / ${(TRACTOR_KILL_LOCK_MS/1000).toFixed(1)}s` : t.cooldownRemainingMs>0 ? `TRACTOR ${(t.cooldownRemainingMs/1000).toFixed(1)}s` : 'TRACTOR READY · E' : '';
    if(el('hud-tractor').textContent!==label)el('hud-tractor').textContent=label;
    const locked=!!active && !!t?.attackerId && local?.lifeState==='active';
    const showTractor=!!usable || locked;if(el('tractor-hud').hidden===showTractor)el('tractor-hud').hidden=!showTractor;
    const lockLabel=locked && t ? `TRACTOR LOCK ${(t.incomingLockElapsedMs/1000).toFixed(1)} / ${(TRACTOR_KILL_LOCK_MS/1000).toFixed(1)}s` : '';if(el('tractor-lock').textContent!==lockLabel)el('tractor-lock').textContent=lockLabel;
    if(el('tractor-lock').hidden===locked)el('tractor-lock').hidden=!locked;
    if(locked && now-this.lastTractorShake>=180){this.cameras.main.shake(160,.0015);this.lastTractorShake=now;}
    if(!locked && this.cameras.main.shakeEffect.isRunning)this.cameras.main.shakeEffect.reset();
    if(!active){if(el('debug-tractor').textContent!=='Tractor unavailable')el('debug-tractor').textContent='Tractor unavailable';return;}
    for(const player of snapshot.players){
      if(!player.tractor.targetId)continue;
      const body=this.ships.get(player.id)?.body;if(!body)continue;
      const angle=body.rotation,half=TRACTOR_CONE_ANGLE/2,nose=18;
      const x=body.x+Math.cos(angle)*nose,y=body.y+Math.sin(angle)*nose;
      this.tractorGraphics.fillStyle(0x70ffdc,.18).lineStyle(1,0x9cffe9,.65).beginPath().moveTo(x,y);
      for(let i=0;i<=8;i++){const a=angle-half+TRACTOR_CONE_ANGLE*i/8;this.tractorGraphics.lineTo(body.x+Math.cos(a)*TRACTOR_RANGE,body.y+Math.sin(a)*TRACTOR_RANGE);}
      this.tractorGraphics.closePath().fillPath().lineStyle(3,0x031015,.85).strokePath().lineStyle(1,0x9cffe9,.9).strokePath();
    }
    if(now-this.lastDebug<20 && local){const attacker=local.tractor.attackerId ? snapshot.players.find(p=>p.id===local.tractor.attackerId) : local,target=attacker?.tractor.targetId ? snapshot.players.find(p=>p.id===attacker.tractor.targetId) : null;
      el('debug-tractor').textContent=`Tractor ${label || 'unavailable'} · attacker ${attacker?.tractor.targetId?attacker.id:'—'} · target ${target?.id??'—'} · range ${TRACTOR_RANGE} · cone ${attacker&&target?inTractorCone(attacker,target):'—'} · LOS ${target?'clear (server validated)':'—'} · pull ${TRACTOR_PULL_STRENGTH} · elapsed ${attacker?.tractor.targetId?((TRACTOR_MAX_DURATION_MS-attacker.tractor.remainingMs)/1000).toFixed(2):'—'}/5s · lock ${attacker?.tractor.lockElapsedMs??0}/${TRACTOR_KILL_LOCK_MS}ms · predicted pull ${!!this.connection.prediction.state?.tractor.attackerId}`;
    }
  }
  update() {
    hud.frame();
    const now = performance.now(), elapsed = now - this.lastRender; this.lastRender = now;
    const local = this.connection.renderedLocal(elapsed);
    if (local && this.connection.socket.connected && this.connection.latest) this.placeShip(local);
    if (now - this.lastDebug >= 250) {
      this.lastDebug = now;
      const p = this.connection.prediction;
      if(import.meta.env.DEV&&!el('debug-overlay').hidden){
        const output=document.getElementById('visual-rendering');if(output){
          const visible=this.celestial.bodies.filter(b=>b.fallback.visible||b.shader?.visible).length;
          const rocks=this.celestial.decorations.filter(g=>g.visible).reduce((sum,g)=>sum+g.length,0);
          const text=`Renderer: ${this.game.renderer.type===Phaser.WEBGL?'WebGL':'Canvas'} · ${this.visualIntensity.quality} · planets ${visible}/4 · debris ${rocks}/47 · distant ${this.celestial.distant.filter(d=>d.visible).length}/${this.celestial.distant.length} · asteroid groups ${this.celestial.cosmicClusters.filter(g=>g.visible).length}/4 · galaxies 5 · cached stars ${this.deepSpace.starCount}`;
          if(output.textContent!==text)output.textContent=text;
        }
      }
      el('debug-prediction').textContent = `Input ${p.sequence} · ack ${p.acknowledged} · pending ${p.pending.length}${p.overflow ? ' · paused (queue full)' : ''}`;
      el('debug-projectiles').textContent = `Authoritative projectiles: ${this.connection.latest?.projectiles.length ?? 0} · predicted: ${this.connection.projectilePrediction.count(now)}`;
      el('debug-correction').textContent = `Correction ${p.correction.toFixed(2)} · remote delay 100 ms`;
    }
    for (const player of this.interpolator.sample(performance.now(), this.connection.socket.id ?? '')) this.placeShip(player);
    this.updateSpectatorCamera();
    this.drawTractors(now);
    this.projectileGraphics.clear().fillStyle(0xffe08a);
    for (const p of this.connection.projectilePrediction.render(this.projectileView.sample(now, this.connection.socket.id ?? ''), now)) {this.projectileGraphics.fillStyle(0x030912).fillCircle(p.x,p.y,BASIC_BLASTER.projectileRadius+1);this.projectileGraphics.fillStyle(0xffe08a).fillCircle(p.x,p.y,BASIC_BLASTER.projectileRadius);}
    this.localHud.render(this.rocket.x, this.rocket.y, now);
    this.damageNumbers.render(this.hitFeedback.sample(now));
    const camera=this.cameras.main;
    const combat=!!local?.tractor.attackerId || !!local?.tractor.targetId || this.connection.latest?.projectiles.some(p=>Math.hypot(p.x-this.rocket.x,p.y-this.rocket.y)<400) || false;
    camera.setZoom(easeZoom(camera.zoom,this.visualIntensity.camera?cameraTarget(local ? Math.hypot(local.vx,local.vy) : 0,combat):1,elapsed));
    const intensity=this.visualIntensity.update(elapsed),hole=this.connection.latest?.blackHole??this.connection.room?.blackHole??null;
    this.deepSpace.update(camera,this.visualIntensity.parallax,this.visualIntensity.quality==='standard',now);
    this.celestial.quality=this.visualIntensity.quality;
    let light=hole??{x:1200,y:450};
    if(import.meta.env.DEV){
      if(this.inspectionPoint)camera.centerOn(this.inspectionPoint.x,this.inspectionPoint.y);
      const c=this.composition,study=c==='horizon'||c==='combat';
      this.celestial.enabled=c!=='open'&&c!=='horizon';
      this.celestial.distant[0].setVisible(c!=='horizon');
      this.celestial.study=c!=='auto';
      for(const [i,body]of this.celestial.bodies.entries()){const p=PLANET_REGIONS[i];body.planet.x=c==='auto'?p.x:this.rocket.x+(c==='dark'?-240:240);body.planet.y=c==='auto'?p.y:this.rocket.y+35;body.planet.radius=c==='auto'?p.radius:380;}
      const preview=study?{x:this.rocket.x+285,y:this.rocket.y-40,eventHorizonRadius:105,influenceRadius:500}:null;
      if(preview)light=preview;
      this.previewHorizon?.update(camera,now,preview,intensity,this.visualIntensity.quality,this.visualIntensity.parallax);
    }
    this.celestial.update(camera,now,light,intensity);
    this.horizonVisual.update(camera,now,hole,intensity,this.visualIntensity.quality,this.visualIntensity.parallax);
    this.map.setScale(1/camera.zoom).setPosition(this.scale.width*.5*(1-1/camera.zoom),this.scale.height*.5*(1-1/camera.zoom));
    this.drawMap();
    if(import.meta.env.DEV&&this.inspectionPoint){this.connection.setFireIntent(false,this.fireAim);this.connection.setInput({up:false,down:false,left:false,right:false,boost:false,aim:this.aim});return;}
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
    for(const p of PLANET_REGIONS){const m=mapPoint(p.x,p.y,WORLD,size);this.map.fillStyle(p.color,.75).fillCircle(x+m.x,y+m.y,p.radius*s);}
    for(const p of LANDMARKS){const m=mapPoint(p.x,p.y,WORLD,size);this.map.fillStyle(0x84939f,.6).fillRect(x+m.x-1,y+m.y-1,2,2);}
    const view=this.cameras.main.worldView;this.map.lineStyle(1,0xbacdde,.5).strokeRect(x+view.left*s,y+view.top*s,view.width*s,view.height*s);
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
  el('death-overlay').hidden = true; el('match-overlay').hidden = true;
  el('life-status').textContent = 'Awaiting life state';
  el<HTMLButtonElement>('restart').disabled = false;
  el('black-hole-status').textContent = 'Awaiting authoritative region';
  el('position').textContent = 'Awaiting position';
  el('velocity').textContent = 'Speed —';
  el('tick').textContent = 'Server tick —';
  el('status').textContent = 'Connecting to flight server…';
  el('home').hidden = true; el('mission').hidden = false;
  if (game) { game.destroy(true); game = undefined; }
  el('game').style.visibility='hidden';
  game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: 1100, height: 600, backgroundColor: '#080e1e', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: Horizon });
  if (import.meta.env.DEV) Object.assign(window, { __HORIZON_GAME__: game });
}
function scene() { return game?.scene.scenes[0] as Horizon | undefined; }
function updateLobby() {
  const c=connection,match=c?.latest?.match,button=el<HTMLButtonElement>('start-match');
  const waiting=match?.state==='waiting',host=c?.room?.match.hostId===c?.socket.id;
  const fill=el<HTMLButtonElement>('fill-game');fill.hidden=!waiting || !host;fill.disabled=(c?.room?.participantIds?.length ?? c?.room?.playerIds.length ?? 0)>=8;
  button.hidden=!waiting || !host;button.disabled=!!c?.starting || (c?.latest?.survivingHumans ?? 0)<2;
  el('lobby-status').textContent=waiting ? host ? button.disabled ? 'Waiting for at least 2 humans' : 'Ready to start' : 'WAITING FOR HOST' : '';
}
function updateRoom(room: RoomInfo) {
  updateLobby();
  el('room-code-display').textContent = room.code;
  hud.setRoom(room.playerIds.length, connection?.socket.connected ?? false);
  el('player-count').textContent = `${room.participantIds?.length ?? room.playerIds.length} / ${room.maxPlayers} players${room.queuedIds?.length ? ` · ${room.queuedIds.length} queued` : ''}`;
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
    hit: hit => { if (connection === current) scene()?.acceptHit(hit); },
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
el('fill-game').onclick=()=>connection?.fillGame();
el('start-match').onclick=()=>{connection?.startMatch();updateLobby();};
el('create').onclick = () => { void enterRoom('create'); };
el('join').onclick = () => { void enterRoom('join'); };
el<HTMLInputElement>('server-url').oninput = () => el<HTMLInputElement>('server-url').setCustomValidity('');
el<HTMLInputElement>('server-url').value = defaultServerUrl(import.meta.env.DEV, location.hostname, import.meta.env.VITE_SERVER_URL);
el('build-stamp').textContent = `Build: ${__HORIZON_BUILD__.buildId}`;
el('cancel-connect').onclick = () => goHome('Connection cancelled.');
const linkedRoom = roomFromSearch(location.search);
if (linkedRoom) { el<HTMLInputElement>('room-code').value = linkedRoom; el('home-status').textContent = `Room ${linkedRoom} ready to join. Confirm your name, then click Join room.`; }
el<HTMLInputElement>('room-code').oninput = () => { const input = el<HTMLInputElement>('room-code'); input.value = input.value.toUpperCase(); };
el('leave').onclick = () => goHome();
async function copy(value: string) {
  try { await navigator.clipboard.writeText(value); el('share-status').textContent = 'Copied'; }
  catch { el('share-status').textContent = `Copy manually: ${value}`; }
}
el('copy-code').onclick = () => { if (connection?.room) void copy(connection.room.code); };
el('copy-link').onclick = () => { if (connection?.room) void copy(roomLink(location.href, connection.room.code)); };
if (import.meta.env.DEV) {
  void import('./combat-debug').then(({ installCombatDebug }) => installCombatDebug(() => connection, () => scene()?.resetFlight()));
  el('debug-network').hidden = false;
  const updateLag = () => {
    const enabled=el<HTMLInputElement>('fake-lag').checked,jitter=el<HTMLInputElement>('fake-jitter').checked;
    connection?.setFakeLag(enabled,150,jitter?30:0);
    el('fake-network-status').textContent=enabled ? `Fake network ON · 150ms each way${jitter?' ±30ms jitter':''}` : 'Fake network OFF';
  };
  el<HTMLInputElement>('fake-lag').onchange = updateLag;
  el<HTMLInputElement>('fake-jitter').onchange = updateLag;
}

window.addEventListener('keydown', event => {
  if (event.code !== 'F3' || el('mission').hidden) return;
  event.preventDefault();
  if (!event.repeat) hud.toggle();
});
