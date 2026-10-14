import {CinematicFlash} from './cinematic-flash';
import {GrowingHorizonView} from './horizon-view';
import {DEFAULT_CAMERA_WIDTH} from '../shared/launch';
import {CinematicVisuals} from './cinematic-visuals';
import {playCinematicCue,stopCinematicAmbience} from './cinematic-audio';
import {installMenu} from './menu';
import {LOBBY_HOLE,LOBBY_RADIUS} from '../shared/match';
import {preloadWeaponAssets} from './weapon-assets';
import {inventoryInteracting} from './inventory-ui';
import {LootVisuals} from './loot-visuals';
import {drawWeaponProjectile} from './weapon-visuals';
import {ObjectiveVisuals,GOLD_COLOR} from './objective-visuals';
import {preloadPlanetImages} from './visual/planet-images';
import {SHIP_HITBOX_RADIUS} from '../shared/ship-geometry';
import {SHIP_ART,shipArtForColor,type ShipArt} from './visual/ships';
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
type Ship = { protection:Phaser.GameObjects.Graphics; body: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text; hull: Phaser.GameObjects.Graphics; sprite: Phaser.GameObjects.Image; art: ShipArt; alien: boolean };
class Horizon extends Phaser.Scene {
  private growingHorizon!:GrowingHorizonView;
  private cinematics!:CinematicVisuals;
  private audioPhase='';
  private lastCinematicQuality='';
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
  private objectives!:ObjectiveVisuals;private loot!:LootVisuals;
  private localHud!: ShipCombatHud;
  private projectileView = new ProjectileView();
  private tractorGraphics!: Phaser.GameObjects.Graphics;
  private hitboxGraphics?: Phaser.GameObjects.Graphics;
  private lastTractorShake=0;
  private projectileGraphics!: Phaser.GameObjects.Graphics;
  private fireAim = 0;
  private rocket!: Phaser.GameObjects.Container;
  private holeVisual!: Phaser.GameObjects.Graphics;
  private holeKey = '';
  private map!: Phaser.GameObjects.Graphics;
  private mapClip!:Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private connection!: FlightConnection;
  private aim = 0;
  private ready = false;
  get loaded(){return this.ready;}
  private spectatedId: string | null = null;
  private lastLocalLife: string | null = null;
  private lastLocalGeneration = -1;
  private lastTeleport = -1;
  private lastRender = performance.now();
  private lastDebug = 0;
  private ships = new Map<string, Ship>();
  private cinematicFlash = new CinematicFlash();
  private interpolator = new RemoteInterpolator();
  constructor() { super('Horizon'); }
  preload() { preloadWeaponAssets(this);preloadPlanetImages(this); for(const art of SHIP_ART)this.load.image(art.textureKey,`${import.meta.env.BASE_URL}assets/ships/runtime/${art.sourceFilename}`); preloadCosmicImages(this); this.game.canvas.style.visibility='hidden'; for(const biome of ['ice','volcanic','terrestrial','moon','clouds','ice-detail','volcanic-detail','terrestrial-detail','moon-detail'])this.load.image(`surface-${biome}`,`${import.meta.env.BASE_URL}planets/${biome}.png`); }
  create() {
    const webgl=this.game.renderer.type===Phaser.WEBGL;
    this.visualIntensity.quality=defaultVisualQuality(webgl);
    this.visualIntensity.camera=webgl;
    this.deepSpace = new DeepSpace(this);
    const border=this.add.graphics().setDepth(-10);border.lineStyle(2,0x465769,.3).strokeRect(0,0,WORLD,WORLD);
    this.celestial = new CelestialWorld(this);
    this.objectives=new ObjectiveVisuals(this);this.loot=new LootVisuals(this,(action,slot,toSlot)=>this.connection.inventory(action,slot,undefined,toSlot),()=>{this.input.keyboard?.resetKeys();this.connection.release();});
    this.localHud = new ShipCombatHud(this); this.damageNumbers = new DamageNumbers(this);
    this.tractorGraphics = this.add.graphics().setDepth(3);
    this.projectileGraphics = this.add.graphics().setDepth(6);
    if(import.meta.env.DEV)this.hitboxGraphics=this.add.graphics().setDepth(7).setVisible(false);
    this.horizonVisual=new HorizonVisual(this);this.cinematics=new CinematicVisuals(this);this.growingHorizon=new GrowingHorizonView(this);
    this.holeVisual = this.add.graphics().setDepth(2);
    if (connection?.room) this.drawBlackHole(LOBBY_HOLE);
    const spawn = spawnFlight();
    this.rocket = this.add.container(spawn.x, spawn.y).setDepth(4);
    this.cameras.main.setBounds(0, 0, WORLD, WORLD).startFollow(this.rocket, true, .12, .12);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,R,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE']);
    this.map = this.add.graphics().setScrollFactor(0).setDepth(10);this.mapClip=this.make.graphics({x:0,y:0});this.mapClip.setScrollFactor(0);this.map.setMask(this.mapClip.createGeometryMask());
    this.connection = connection!;
    // Handle the key transition itself: a short tap can begin and end between
    // rendered frames, so frame polling may miss it. Key repeat never reloads.
    const reload = (event: KeyboardEvent) => {
      const target = event.target as HTMLInputElement;
      const typing = inventoryInteracting() || target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT' && target.type !== 'checkbox';
      if (event.code === 'KeyE' && !event.repeat && !typing) this.connection.tractor();
      if(!event.repeat&&!typing&&['Digit1','Digit2','Digit3'].includes(event.code))this.connection.inventory('switch',Number(event.code.slice(-1))-1);
      if(event.code==='Space'&&!event.repeat&&!typing)this.connection.triggerFire(this.fireAim);
      if(event.code==='KeyF'&&!event.repeat&&!typing)this.connection.inventory('pickup',undefined,this.loot.highlightedId);
      if(event.code==='KeyG'&&!event.repeat&&!typing)this.connection.inventory('drop');
      if (event.code === 'KeyR' && !event.repeat && !typing) this.connection.reload();
    };
    window.addEventListener('keydown', reload);
    const pointerTrigger=(pointer:Phaser.Input.Pointer)=>{if(pointer.downElement===this.game.canvas&&pointer.leftButtonDown()&&!inventoryInteracting())this.connection.triggerFire(this.fireAim);};this.input.on('pointerdown',pointerTrigger);
    const wheel=(event:WheelEvent)=>{if(event.target===this.game.canvas){event.preventDefault();this.connection.cycleWeapon(event.deltaY);}};this.game.canvas.addEventListener('wheel',wheel,{passive:false});
    const release = () => { this.input.keyboard!.resetKeys(); this.connection.release(); };
    const visibility = () => { if (document.hidden) release(); };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', visibility);
    const rendered=()=>hud.renderFrame();this.game.events.on('postrender',rendered);
    const cleanup = () => {
      if (!this.ready) return;
      window.removeEventListener('keydown', reload);this.input.off('pointerdown',pointerTrigger);this.game.canvas.removeEventListener('wheel',wheel);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', visibility);
      this.game.events.off('postrender',rendered);
      this.ready = false;this.visualDebugCleanup?.();this.previewHorizon?.destroy();
      this.loot.destroy();this.objectives.destroy();this.deepSpace.destroy();this.celestial.destroy();this.horizonVisual.destroy();this.cinematics.destroy();this.growingHorizon.destroy();this.mapClip.destroy();if(game===this.game&&connection===this.connection)stopCinematicAmbience();
      for(const art of SHIP_ART)this.textures.remove(art.textureKey);
      this.interpolator.clear(); this.projectileView.clear(); this.hitFeedback.clear(); this.damageNumbers.clear(); this.localHud.clear();
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if(pointer.event?.target!==this.game.canvas)return;
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
      // Round ghost silhouette and lavender tint, distinct from custom human hulls.
      hull.lineStyle(4,0x02050d,1).strokeCircle(0,-2,15).strokeTriangle(-14,0,-24,13,12,11);
      hull.fillStyle(ALIEN_COLOR).fillCircle(0,-2,15).fillTriangle(-14,0,-24,13,12,11);
      hull.lineStyle(1.5,0xe8eaff,.9).strokeCircle(0,-2,15).strokeTriangle(-14,0,-24,13,12,11);
      hull.fillStyle(0x080e1e).fillCircle(5,-6,3).fillCircle(5,3,3);
    }
  }
  private addShip(player: PlayerState): Ship {
    const hull = this.add.graphics();
    this.drawHull(hull, player.color, false);
    const local = player.id === this.connection.socket.id;
    const body = local ? this.rocket : this.add.container(player.x, player.y).setDepth(4);
    const art=shipArtForColor(player.color);
    const sprite=this.add.image(0,0,art.textureKey).setOrigin(art.originX,art.originY).setScale(art.visualScale).setRotation(art.rotationOffset).setName('custom-ship');
    const protection=this.add.graphics().lineStyle(2,0x9deaff,.8).strokeCircle(0,0,45).setVisible(false);
    hull.setVisible(false);body.add([sprite,hull,protection]);
    const label = this.add.text(player.x, player.y + 44, player.name + (local ? ' (you)' : ''), {
      fontSize: '13px', color: '#ffffff', backgroundColor: '#0e1729', padding: { x: 4, y: 2 },
    }).setOrigin(.5, 0).setDepth(5);
    const ship = { protection,body, label, hull, sprite, art, alien:false }; this.ships.set(player.id, ship); return ship;
  }
  private placeShip(player: PlayerState) {
    if (player.status === 'OUT') return;
    const ship = this.ships.get(player.id) ?? this.addShip(player);
    ship.body.setPosition(player.x, player.y).setRotation(player.rotation);
    const art=shipArtForColor(player.color);
    if(ship.art!==art){ship.art=art;ship.sprite.setTexture(art.textureKey).setOrigin(art.originX,art.originY).setScale(art.visualScale).setRotation(art.rotationOffset);}
    const alien = player.status === 'ALIEN';
    if (ship.alien !== alien) {
      ship.alien = alien;
      this.drawHull(ship.hull, player.color, alien);
      ship.sprite.setVisible(!alien);ship.hull.setVisible(alien);
    }
    ship.protection.setVisible((player.launchProtectionRemainingMs??0)>0).setAlpha(this.visualIntensity.quality==='low'?.7:.65+.3*Math.sin(performance.now()*.018));
    ship.body.setAlpha(alien ? ALIEN_OPACITY : player.lifeState === 'dead' ? .25 : 1);
    ship.label.setPosition(player.x, player.y + (alien?27:this.connection.latest?.match.state==='waiting'?34:44)).setText(player.name + (player.controllerType==='BOT' ? ' [BOT]' : '') + (player.id === this.connection.socket.id ? ' (you)' : '') + (this.connection.latest?.match.hostId===player.id?' · HOST':'') + (this.connection.latest?.match.state==='waiting'&&this.connection.latest.match.readyIds.includes(player.id)?' · READY':'') + (alien ? ' · ALIEN' : '') + (player.lifeState === 'dead' ? ' · DEAD' : ''));
    // Edge-spawned ghosts keep their tag readable without moving the ship/camera.
    const view = this.cameras.main.worldView;
    if (alien && view.contains(player.x, player.y)) ship.label.setPosition(
      Phaser.Math.Clamp(player.x, view.left + ship.label.width / 2 + 4, view.right - ship.label.width / 2 - 4),
      Phaser.Math.Clamp(player.y + 27, view.top + 4, view.bottom - ship.label.height - 4));

  }
  acceptSnapshot(snapshot: Snapshot) {
    if (!this.ready) return;
    this.objectives.accept(snapshot,this.connection.socket.id??'');this.loot.accept(snapshot,this.connection.socket.id??'');
    const local = snapshot.players.find(p => p.id === this.connection.socket.id);
    if (!local) return;
    // Lifecycle/HUD stay authoritative; only local movement is predicted.
    this.removeShips(snapshot.players.filter(p => p.status !== 'OUT').map(p => p.id));
    this.drawBlackHole(snapshot.match.state==='waiting'||snapshot.match.state==='countdown'||snapshot.match.state==='collapse'?LOBBY_HOLE:snapshot.blackHole);
    if (local.status !== 'OUT') this.placeShip(this.connection.renderedLocal(0) ?? local);
    this.localHud.accept(local, performance.now());
    this.hitFeedback.reconcile(snapshot, local.id);
    hud.health(local);
    hud.combat(local); hud.humans(snapshot.survivingHumans);
    const feed=(snapshot.killFeed??[]).map(entry=>entry.text).join('\n');el('kill-feed').hidden=!feed;if(el('kill-feed').textContent!==feed)el('kill-feed').textContent=feed;
    const match = snapshot.match, spectator = local.status === 'OUT';
    el('match-status').textContent = match.state === 'waiting' ? 'Waiting for host start' : spectator ? 'SPECTATING · JOINS NEXT ROUND' : `Round ${match.round} · ${match.state}${(local.launchProtectionRemainingMs??0)>0?' · SPAWN PROTECTED':''}`;
    if(this.audioPhase!==match.state){this.audioPhase=match.state;stopCinematicAmbience();if(match.state==='waiting')playCinematicCue('lobby');else if(match.state==='collapse')playCinematicCue('collapse');else if(match.state==='launch')playCinematicCue('launch');else if(match.state==='active')playCinematicCue('eject');}
    document.body.dataset.phase=match.state;
    updateLobby();
    el('match-overlay').hidden = match.state !== 'ended';
    el('match-result').textContent = match.result?.kind === 'draw' ? 'DRAW' : match.result?.kind === 'winner' ? match.result.winnerId === local.id ? 'VICTORY' : `${match.result.winnerName} WINS` : '';
    el('match-reset').textContent = 'Play again returns everyone to the lobby. A new START is required.';
    if (match.state === 'ended' || spectator) { this.hitFeedback.clear(); this.damageNumbers.clear(); this.localHud.clear(); }
    // Ejection eases from the hole to the pilot; respawns and other teleports
    // retain their authoritative camera snap.
    const ejection=match.state==='active'&&this.lastLocalLife?.split(':')[1]==='launch';
    if (!ejection && this.lastLocalGeneration >= 0 && (local.lifeGeneration !== this.lastLocalGeneration || local.teleportSequence !== this.lastTeleport)) this.cameras.main.centerOn(local.x, local.y);
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
    if(hole.horizon){this.holeVisual.clear();return;}
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
      const angle=body.rotation,half=TRACTOR_CONE_ANGLE/2,appearance=this.ships.get(player.id),nose=appearance&&!appearance.alien?appearance.art.noseOffset:18;
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
    if(import.meta.env.DEV&&this.hitboxGraphics){
      const visible=!el('debug-overlay').hidden;
      this.hitboxGraphics.clear().setVisible(visible);
      if(visible){
        // Latest authoritative centers, not interpolated/predicted hull positions.
        // Ordinary world-space Graphics inherit the camera's zoom and scroll.
        this.hitboxGraphics.lineStyle(1,0x9defff,.7);
        for(const player of this.connection.latest?.players??[]){
          if(player.status!=='OUT'&&player.lifeState==='active'&&player.health>0)
            this.hitboxGraphics.strokeCircle(player.x,player.y,SHIP_HITBOX_RADIUS);
        }
      }
    }
    this.drawTractors(now);
    this.projectileGraphics.clear().fillStyle(0xffe08a);
    for (const p of this.connection.projectilePrediction.render(this.projectileView.sample(now,this.connection.socket.id??''),now))drawWeaponProjectile(this.projectileGraphics,p);
    this.localHud.render(this.rocket.x, this.rocket.y-(local?.status==='ALIEN'?0:17), now);
    this.damageNumbers.render(this.hitFeedback.sample(now));
    const camera=this.cameras.main;
    const combat=!!local?.tractor.attackerId || !!local?.tractor.targetId || this.connection.latest?.projectiles.some(p=>Math.hypot(p.x-this.rocket.x,p.y-this.rocket.y)<400) || false;
    const baseZoom=this.visualIntensity.camera?cameraTarget(local?Math.hypot(local.vx,local.vy):0,combat):1;
    const cinematicPhase=this.connection.latest?.match.state;
    const cinematicZoom=this.visualIntensity.quality==='standard'&&(cinematicPhase==='collapse'||cinematicPhase==='launch')||camera.zoom>1.016;
    camera.setZoom(cinematicZoom?this.cinematics.zoom(camera,baseZoom,this.connection.latest,this.visualIntensity.quality,elapsed):easeZoom(camera.zoom,baseZoom,elapsed));
    if(this.lastCinematicQuality!==this.visualIntensity.quality){this.lastCinematicQuality=this.visualIntensity.quality;document.body.dataset.quality=this.visualIntensity.quality;try{localStorage.setItem('horizon-menu-quality',this.visualIntensity.quality);}catch{/* optional menu preference */}}
    const match=this.connection.latest?.match??this.connection.room?.match,phase=match?.state,lobby=phase==='waiting'||phase==='countdown'||phase==='collapse';
    const intensity=this.visualIntensity.update(elapsed),hole=lobby?LOBBY_HOLE:this.connection.latest?.blackHole??this.connection.room?.blackHole??null;
    this.celestial.enabled=!lobby;
    const cinematic=phase==='countdown'||phase==='collapse'||phase==='launch';
    el('cinematic-status').hidden=!cinematic;el('cinematic-status').textContent=phase==='countdown'?String(Math.max(1,Math.ceil((match?.phaseRemainingMs??0)/1000))):phase==='collapse'?'':phase==='launch'?'LAUNCH':'';
    const flash=el('cinematic-flash'),flashOpacity=this.cinematicFlash.opacity(match,this.connection.latest?.timeMs??0,now);flash.hidden=flashOpacity<=0;flash.style.opacity=String(flashOpacity);
    // The opaque peak covers the canvas completely; avoid submitting its
    // expensive WebGL pass until the fade reveals it again.
    camera.setVisible(flashOpacity<1);
    const lobbyPan=Math.min(260,Math.max(80,this.scale.width/2-302/(this.scale.displaySize.width/this.scale.width)-SHIP_HITBOX_RADIUS-12));
    if(lobby){camera.stopFollow();camera.centerOn(LOBBY_HOLE.x+Math.sign((local?.x??LOBBY_HOLE.x)-LOBBY_HOLE.x)*Math.max(0,Math.abs((local?.x??LOBBY_HOLE.x)-LOBBY_HOLE.x)-lobbyPan),LOBBY_HOLE.y+Math.sign((local?.y??LOBBY_HOLE.y)-LOBBY_HOLE.y)*Math.max(0,Math.abs((local?.y??LOBBY_HOLE.y)-LOBBY_HOLE.y)-210));this.holeVisual.clear().lineStyle(2,0x6cb8dc,.18).strokeCircle(LOBBY_HOLE.x,LOBBY_HOLE.y,LOBBY_RADIUS);}
    else if(cinematic){camera.stopFollow();if(local)camera.centerOn(local.x,local.y);}
    else if(!this.inspectionPoint)camera.startFollow(this.rocket,true,.12,.12);
    this.deepSpace.update(camera,this.visualIntensity.parallax,this.visualIntensity.quality==='standard',now);
    if(lobby&&!(import.meta.env.DEV&&(this.inspectionPoint||this.composition!=='auto')))for(const image of this.deepSpace.cosmic.images)image.setVisible(false);
    this.celestial.quality=this.visualIntensity.quality;
    let light=hole??{x:1200,y:450};
    if(import.meta.env.DEV){
      if(this.inspectionPoint)camera.centerOn(this.inspectionPoint.x,this.inspectionPoint.y);
      const c=this.composition,study=c==='horizon'||c==='combat';
      this.celestial.enabled=(!lobby||!!this.inspectionPoint||c!=='auto')&&c!=='open'&&c!=='horizon';
      this.celestial.distant[0].setVisible(c!=='horizon');
      this.celestial.study=c!=='auto';
      for(const [i,body]of this.celestial.bodies.entries()){const p=PLANET_REGIONS[i];body.planet.x=c==='auto'?p.x:this.rocket.x+(c==='dark'?-240:240);body.planet.y=c==='auto'?p.y:this.rocket.y+35;body.planet.radius=c==='auto'?p.radius:380;}
      const preview=study?{x:this.rocket.x+285,y:this.rocket.y-40,eventHorizonRadius:105,influenceRadius:500}:null;
      if(preview)light=preview;
      this.previewHorizon?.update(camera,now,preview,intensity,this.visualIntensity.quality,this.visualIntensity.parallax);
    }
    this.celestial.consumptionClock=this.connection.latest?.timeMs??0;this.celestial.consumed=new Map((this.connection.latest?.objectives?.planets??[]).filter(p=>p.status==='CONSUMED').map(p=>[p.id,this.connection.latest?.objectives?.announcements.find(e=>e.kind==='consumed'&&e.planetId===p.id)?.timeMs??-Infinity]));
    this.celestial.update(camera,now,light,intensity);
    const collapseProgress=phase==='collapse'?1-(match?.phaseRemainingMs??1800)/1800:0;
    this.horizonVisual.update(camera,now+collapseProgress*collapseProgress*12000,(hole as BlackHoleState|null)?.horizon?null:hole,Math.max(intensity,collapseProgress),this.visualIntensity.quality,this.visualIntensity.parallax);
    this.cinematics.update(this.connection.latest,this.visualIntensity.quality,camera,now);this.growingHorizon.render(this.connection.latest,camera,this.connection.socket.id??'',this.visualIntensity.quality==='low');
    this.map.setVisible(phase==='active'||phase==='ended');
    this.map.setScale(1/camera.zoom).setPosition(this.scale.width*.5*(1-1/camera.zoom),this.scale.height*.5*(1-1/camera.zoom));
    this.drawMap();
    this.objectives.render(camera,now,this.connection.socket.id??'',this.ships);this.loot.render(camera,this.connection.socket.id??'');
    if(inventoryInteracting()||import.meta.env.DEV&&this.inspectionPoint){this.connection.setFireIntent(false,this.fireAim);this.connection.setInput({up:false,down:false,left:false,right:false,boost:false,aim:this.aim});return;}
    this.connection.setFireIntent(this.keys.SPACE.isDown || this.input.activePointer.downElement===this.game.canvas && this.input.activePointer.isDown && this.input.activePointer.leftButtonDown(), this.fireAim);
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
    this.mapClip.clear().fillStyle(0xffffff).fillRect(x-5,y-5,size+10,size+10).setScale(this.map.scaleX).setPosition(this.map.x,this.map.y);
    this.map.clear().fillStyle(0x0e1729, .95).fillRoundedRect(x - 5, y - 5, size + 10, size + 10, 8);
    this.map.lineStyle(1, 0x384c68).strokeRect(x, y, size, size);
    for(const p of PLANET_REGIONS){if(this.connection.latest?.objectives?.planets.find(v=>v.id===p.id)?.status==='CONSUMED')continue;const m=mapPoint(p.x,p.y,WORLD,size);this.map.fillStyle(p.color,.75).fillCircle(x+m.x,y+m.y,p.radius*s);}
    for(const p of LANDMARKS){const m=mapPoint(p.x,p.y,WORLD,size);this.map.fillStyle(0x84939f,.6).fillRect(x+m.x-1,y+m.y-1,2,2);}
    const view=this.cameras.main.worldView;this.map.lineStyle(1,0xbacdde,.5).strokeRect(x+view.left*s,y+view.top*s,view.width*s,view.height*s);
    const hole = this.connection.latest?.blackHole ?? this.connection.room?.blackHole;
    if (hole) {
      const h=this.connection.latest?.horizon;if(h?.radius)this.map.lineStyle(1,0xffb677,.6).strokeCircle(x+hole.x*s,y+hole.y*s,h.nextRadius*s);
      this.map.lineStyle(1, 0xbb80ff, .7).strokeCircle(x + hole.x * s, y + hole.y * s, hole.influenceRadius * s);
      this.map.fillStyle(0xd6abff).fillCircle(x + hole.x * s, y + hole.y * s, hole.eventHorizonRadius * s);
    }
    for(const loot of this.connection.latest?.loot?.pickups??[]){this.map.fillStyle(loot.kind==='weapon'?0xd9d9ff:0x91d8ba,.8).fillCircle(x+loot.x*s,y+loot.y*s,loot.kind==='weapon'?1.4:.8);}
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
  document.body.classList.add('in-mission');(document.activeElement as HTMLElement)?.blur();
  el('home').hidden = true; el('mission').hidden = false;
  if (game) { game.destroy(true); game = undefined; }
  el('game').style.visibility='hidden';
  game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: DEFAULT_CAMERA_WIDTH, height: 600, backgroundColor: '#080e1e', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: Horizon });
  if (import.meta.env.DEV) Object.assign(window, { __HORIZON_GAME__: game });
}
function scene() { return game?.scene.scenes[0] as Horizon | undefined; }
function updateLobby() {
  const c=connection,snapshotMatch=c?.latest?.match,match=snapshotMatch?.state==='waiting'&&c?.room?.match.state==='waiting'&&snapshotMatch.round===c.room.match.round?c.room.match:snapshotMatch??c?.room?.match,button=el<HTMLButtonElement>('start-match');
  const waiting=match?.state==='waiting',host=match?.hostId===c?.socket.id;
  el('fill-game').hidden=true;
  const humans=c?.latest?.players.filter(p=>p.controllerType==='HUMAN')??[];
  const eligible=humans.length>=1&&humans.every(p=>p.id===match?.hostId||match?.readyIds.includes(p.id));
  button.hidden=!waiting||!host;button.disabled=!!c?.starting||!eligible||!scene()?.loaded;
  const ready=el<HTMLButtonElement>('ready-match');ready.hidden=!waiting||host;ready.disabled=!scene()?.loaded;ready.setAttribute('aria-pressed',String(match?.readyIds.includes(c?.socket.id??'')));ready.textContent=match?.readyIds.includes(c?.socket.id??'')?'NOT READY':'READY';
  el('lobby-status').textContent=waiting?`${match?.mode==='fill'?'PRIVATE FILL':'PUBLIC WAIT'} · ${humans.length} humans · ${c?.latest?.players.filter(p=>p.controllerType==='BOT').length??0} bots · ${!scene()?.loaded?'Loading ship and map assets':host?eligible?humans.length===1&&match?.mode==='wait'?'START solo or wait for players':'Ready to START':'Waiting for guests READY':'READY when you are prepared'}`:'';
  el('lobby-roster').textContent=waiting?(c?.latest?.players.map(p=>`${p.name}${p.id===match?.hostId?' [HOST]':p.controllerType==='BOT'?' [BOT · READY]':match?.readyIds.includes(p.id)?' [READY]':' [NOT READY]'}`).join(' · ')??''):'';

}
function updateRoom(room: RoomInfo) {
  updateLobby();
  el('room-code-display').textContent = room.code;
  hud.setRoom(room.playerIds.length, connection?.socket.connected ?? false);
  el('player-count').textContent = `${room.participantIds?.length ?? room.playerIds.length} / ${room.maxPlayers} players${room.queuedIds?.length ? ` · ${room.queuedIds.length} queued` : ''}`;
  scene()?.removeShips(room.playerIds);
}
function goHome(message = '') {
  stopCinematicAmbience();
  attemptId++; busy = false;
  el<HTMLButtonElement>('create').disabled = false; el<HTMLButtonElement>('join').disabled = false;
  el('cancel-connect').hidden = true;
  connection?.close(); connection = undefined;
  hud.setRoom(0, false);
  game?.destroy(true); game = undefined;
  document.body.classList.remove('in-mission');
  el('mission').hidden = true; el('home').hidden = false;
  el('home-status').textContent = message;playCinematicCue('menu');
}
async function enterRoom(mode: 'create' | 'join' | 'fill' | 'wait') {
  if (busy) return;
  const field = el<HTMLInputElement>('server-url');
  try {
    field.value = validateServerUrl(field.value, isLoopback(location.hostname));
    if (location.protocol === 'https:' && new URL(field.value).protocol !== 'https:') throw new Error('HTTPS clients require an HTTPS server.');
  } catch (error) { field.setCustomValidity(error instanceof Error ? error.message : 'Enter a valid server URL.'); field.reportValidity(); return; }
  const code = normalizeRoomCode(el<HTMLInputElement>('room-code').value);
  if (mode === 'join' && !code) { el('home-status').textContent = 'Enter a valid 5-character room code.'; return; }
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
el('ready-match').onclick=()=>connection?.ready();
el('play-again').onclick=()=>connection?.playAgain();
el('result-menu').onclick=()=>goHome();
installMenu(mode=>{void enterRoom(mode);},async code=>{el<HTMLInputElement>('room-code').value=code;await enterRoom('join');return el('home').hidden?'':el('home-status').textContent??'Unable to join';});
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
