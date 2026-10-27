import {damageGuardian,type GuardianUnit} from './guardians';
import {GUARDIAN_CONFIG,GUARDIAN_PROFILES} from '../shared/guardians';
import {recordShot} from './battle';
import {wallEntry,wallDistance,type ShieldWall} from '../shared/survival';
import {cancelHealing,walls,damageWall,wallBlocked} from './survival';
import {hasGoldGun,GALAXY_WEAPONS,GALAXY_CONFIG,activeWeapon,WEAPONS,weaponDamage,MISSILE_EXPLOSION_RADIUS} from '../shared/weapons';
import { melee } from './melee';
import { BASIC_BLASTER, parseFire, circleEntry, type FireResult, type ProjectileState } from '../shared/projectiles';
import { TICK_MS, TICK_SECONDS, WORLD } from '../shared/flight';
import { applyDamage, applyStun, consumeAmmo, startFireCooldown, canFireFromCooldown, startReload } from './combat';
import type { GameRoom, RoomPlayer } from './rooms';
import type { ProjectileHit } from '../shared/hit-feedback';
export interface ServerProjectile extends ProjectileState {weaponName?:string;rarity?:string; remainingTicks: number }
export function fire(room: GameRoom | undefined, player: RoomPlayer | undefined, raw: unknown, tick: number): FireResult {
  const request = parseFire(raw);
  const reject = (reason: string): FireResult => ({ ok: false, sequence: request?.sequence ?? 0, reason });
  if (!request || !room || !player || room.players.get(player.state.id) !== player) return reject('Invalid fire request or membership');
  if (request.sequence <= player.lastFireSequence) return reject('Duplicate or stale shot');
  player.lastFireSequence = request.sequence; // Rejections cannot be replayed later.
  const s = player.state;
  if (!player.gameplayEnabled || room.match.state !== 'active' || request.lifeGeneration !== s.lifeGeneration || request.teleportSequence !== s.teleportSequence ||
    s.lifeState !== 'active' || s.status === 'OUT' || s.health <= 0) return reject('Inactive or stale player');
  if (s.tractor.targetId) return reject('Tractor active');
  if((s.stunRemainingMs??0)>0)return reject('Stunned');
  if (s.status === 'ALIEN') return melee(room, player, request.sequence);
  const gold=hasGoldGun(s),galaxy=gold?GALAXY_WEAPONS[s.galaxyType??'cryo']:null,weapon=activeWeapon(s);if(!gold&&!weapon)return reject('No owned weapon');const definition=WEAPONS[weapon?.class??'blaster'];
  if(gold&&s.galaxyType==='titan'&&(player.titanTriggerUntilMs??0)<=room.simulationTimeMs)return reject('Titan trigger released');
  if (!gold&&s.isReloading) return reject('No ammo or reloading');
  if (!gold&&s.ammo === 0) { startReload(player); return reject('No ammo or reloading'); }
  if (!gold&&s.ammo < 0) return reject('No ammo or reloading');
  if (!canFireFromCooldown(player)) return reject('Cooldown');
  if ([...room.projectiles.values()].filter(p => p.ownerId === s.id).length+ (gold?1:definition.pellets) > (gold?GALAXY_CONFIG.projectileCap:weapon!.class==='blaster'?BASIC_BLASTER.maxActive:weapon!.class==='shotgun'?20:weapon!.class==='smg'?16:8)) return reject('Projectile cap');
  const dx = Math.cos(request.aim), dy = Math.sin(request.aim);
  const x = s.x + dx * BASIC_BLASTER.muzzleOffset, y = s.y + dy * BASIC_BLASTER.muzzleOffset;
  if (x < 0 || x > WORLD || y < 0 || y > WORLD) return reject('Muzzle outside world');
  if (!gold&&!consumeAmmo(player)) return reject('No ammo');
  player.lastCombatMs=room.simulationTimeMs;cancelHealing(player,room.simulationTimeMs);startFireCooldown(player);
  player.launchProtectionUntilMs=0;s.launchProtectionRemainingMs=0;s.spawnInvulnerabilityRemainingMs=Math.max(0,player.invulnerableUntilMs-room.simulationTimeMs);

  recordShot(room,player,request.sequence);
  let id='';
  for(let pellet=0;pellet<(gold?1:definition.pellets);pellet++){
    const spread=gold?s.galaxyType==='titan'?(GALAXY_CONFIG.spreadMin+(GALAXY_CONFIG.spreadMax-GALAXY_CONFIG.spreadMin)*Math.min(1,(s.titanSustainMs??0)/GALAXY_CONFIG.spreadRampMs))*Math.sin(request.sequence*2.399963):0:definition.pellets>1?(pellet-2)*definition.spread/4:definition.spread*Math.sin(request.sequence*2.399963);
    const angle=request.aim+spread,px=Math.cos(angle),py=Math.sin(angle),speed=gold?galaxy!.speed:definition.speed,lifetime=gold?galaxy!.lifetimeMs:definition.lifetimeMs;
    const bulletId=`${room.code}:${++room.projectileSequence}`;if(!id)id=bulletId;
    room.projectiles.set(bulletId,{id:bulletId,ownerId:s.id,shotSequence:request.sequence,lifeGeneration:s.lifeGeneration,teleportSequence:s.teleportSequence,x:s.x+px*BASIC_BLASTER.muzzleOffset,y:s.y+py*BASIC_BLASTER.muzzleOffset,vx:s.vx+px*speed,vy:s.vy+py*speed,weaponName:gold?galaxy!.name:definition.name,rarity:gold?'GALAXY':weapon!.rarity,damage:gold?galaxy!.damage:weaponDamage(weapon!)/definition.pellets,spawnTick:tick,
      ...(gold?{weapon:'gold' as const,galaxyType:s.galaxyType??'cryo',heading:Math.atan2(s.vy+py*speed,s.vx+px*speed),maxRange:galaxy!.range}:weapon!.class!=='blaster'?{weapon:weapon!.class,pellet}:{}),radius:s.galaxyType==='lunar'||weapon?.class==='missile'&&!gold?6:3,traveled:0,remainingMs:lifetime,remainingTicks:Math.ceil(lifetime/TICK_MS)});
  }
  if (!gold&&s.ammo === 0) startReload(player); // The accepted final round has already spawned.
  return { ok: true, sequence: request.sequence, projectileId: id, spawnTick: tick };
}
function boundaryEntry(a: ProjectileState, b: {x:number;y:number}) {
  let t = Infinity;
  if (b.x < 0) t = Math.min(t, -a.x / (b.x - a.x));
  if (b.x > WORLD) t = Math.min(t, (WORLD - a.x) / (b.x - a.x));
  if (b.y < 0) t = Math.min(t, -a.y / (b.y - a.y));
  if (b.y > WORLD) t = Math.min(t, (WORLD - a.y) / (b.y - a.y));
  return t;
}
export function advanceProjectiles(room: GameRoom, onHit?: (hit: ProjectileHit) => void, tick = 0) {
  if (room.match.state !== 'active') { room.projectiles.clear(); return; }
  for (const [id, p] of room.projectiles) {
    const owner = room.players.get(p.ownerId)?.state;
    const guardian=p.guardianPlanetId?room.guardians?.units.get(p.ownerId):undefined;
    if(p.guardianPlanetId){if(!guardian||guardian.health<=0||guardian.generation!==p.lifeGeneration){room.projectiles.delete(id);continue;}}
    else if (!owner || owner.lifeGeneration !== p.lifeGeneration || !(owner.teleportSequence === p.teleportSequence && owner.lifeState === 'active' || owner.status === 'ALIEN' && owner.lifeState === 'dead' && owner.teleportSequence === p.teleportSequence + 1)) { room.projectiles.delete(id); continue; }
    if(p.galaxyType==='lunar')guideMissile(room,p);
    const distanceThisTick=Math.hypot(p.vx,p.vy)*TICK_SECONDS;
    const fraction=p.maxRange!==undefined&&distanceThisTick>0?Math.min(1,Math.max(0,p.maxRange-(p.traveled??0))/distanceThisTick):1;
    const next = { x: p.x + p.vx * TICK_SECONDS*fraction, y: p.y + p.vy * TICK_SECONDS*fraction };
    let contact = Math.min(boundaryEntry(p, next), circleEntry(p, next, room.blackHole, room.blackHole.eventHorizonRadius + (p.radius??BASIC_BLASTER.projectileRadius)) ?? Infinity);
    let target: RoomPlayer | null = null;let wallTarget:ShieldWall|null=null;let guardianTarget:GuardianUnit|null=null;
    for(const wall of walls(room).values()){if(wall.hp<=0||wall.expiresAtMs<=room.simulationTimeMs)continue;const t=wallEntry(p,next,wall,p.radius??BASIC_BLASTER.projectileRadius);if(t!==null&&t<contact){contact=t;wallTarget=wall;}}
    for (const player of room.players.values()) {
      const s = player.state;
      if (p.guardianPlanetId&&s.status!=='ALIVE')continue;
      if (!player.gameplayEnabled || s.id === p.ownerId || s.lifeState !== 'active' || s.status === 'OUT' || s.health <= 0) continue;
      const t = circleEntry(p, next, s, BASIC_BLASTER.shipRadius + (p.radius??BASIC_BLASTER.projectileRadius));
      if (t !== null && t < contact) { contact = t; target = player;wallTarget=null; }
    }
    if(!p.guardianPlanetId)for(const g of room.guardians?.units.values()??[]){const t=circleEntry(p,next,g,GUARDIAN_CONFIG.radius+(p.radius??BASIC_BLASTER.projectileRadius));if(g.health>0&&t!==null&&t<contact){contact=t;guardianTarget=g;target=null;wallTarget=null;}}
    if (contact !== Infinity) {
      const point={x:p.x+(next.x-p.x)*contact,y:p.y+(next.y-p.y)*contact};
      const distance=(p.traveled??0)+Math.hypot(point.x-p.x,point.y-p.y),falloff=p.weapon==='shotgun'?Math.max(.2,Math.min(1,1-(distance-100)/400)):1;
      if(wallTarget)damageWall(room,wallTarget,p.damage*falloff);
      if(guardianTarget)damageGuardian(room,guardianTarget,p.damage*falloff,p.ownerId,p);
      if(target)damageTarget(room,p,target,p.damage*falloff,point,tick,onHit);
      if(p.weapon==='missile'||p.galaxyType==='lunar')explode(room,p,point,target,tick,onHit,wallTarget?.id,guardianTarget?.id);
      room.projectiles.delete(id); continue;
    }
    p.traveled=(p.traveled??0)+Math.hypot(next.x-p.x,next.y-p.y);Object.assign(p, next); p.remainingTicks--; p.remainingMs = p.remainingTicks * TICK_MS;
    if (p.remainingTicks <= 0||(p.maxRange!==undefined&&(p.traveled??0)>=p.maxRange-1e-7)){if(p.weapon==='missile'||p.galaxyType==='lunar')explode(room,p,p,null,tick,onHit);room.projectiles.delete(id);}
  }
}
export const projectileSnapshot = (room: GameRoom): ProjectileState[] => [...room.projectiles.values()].map(({ remainingTicks: _ticks, ...state }) => state);

function effect(room:GameRoom,kind:'explosion'|'shock'|'frost'|'burn',point:{x:number;y:number},radius:number,color?:number){
 const effects=room.combatEffects??=[];effects.push({id:(room.effectSequence=(room.effectSequence??0)+1),kind,...point,radius,...(color===undefined?{}:{color}),timeMs:room.simulationTimeMs});if(effects.length>24)effects.shift();
}
function damageTarget(room:GameRoom,p:ServerProjectile,target:RoomPlayer,amount:number,point:{x:number;y:number},tick:number,onHit?: (hit:ProjectileHit)=>void){
 const source:import('../shared/combat').DamageSource=p.guardianPlanetId?{type:'GUARDIAN',planetId:p.guardianPlanetId,guardianId:p.ownerId}:{type:'PLAYER',playerId:p.ownerId,...(p.weaponName?{weaponName:p.weaponName,rarity:p.rarity}:{})};
 const damage=applyDamage(target,amount,source,target.simulationTimeMs);if(!damage)return;
 if(target.state.lifeState==='active'&&p.guardianPlanetId==='borealis'){target.state.guardianSlowRemainingMs=GUARDIAN_CONFIG.slowMs;effect(room,'frost',point,20,GUARDIAN_PROFILES.borealis.color);}
 if(target.state.lifeState==='active'&&p.galaxyType==='cryo'){target.state.slowRemainingMs=GALAXY_CONFIG.slowMs;effect(room,'frost',point,25);}
 if(target.state.lifeState==='active'&&p.galaxyType==='inferno'){target.state.burnRemainingMs=GALAXY_CONFIG.burnMs;target.burnOwnerId=p.ownerId;effect(room,'burn',point,25);}
 if(p.weapon==='zapper'){applyStun(target);effect(room,'shock',point,35);}
 const ownerPlayer=room.players.get(p.ownerId),owner=ownerPlayer?.state;if(!owner||damage.shieldAbsorbed+damage.healthDamage<=0)return;ownerPlayer!.lastCombatMs=room.simulationTimeMs;
 onHit?.({projectileId:p.id,shotSequence:p.shotSequence,hitTick:tick,roomCode:room.code,ownerId:p.ownerId,ownerSession:owner.reloadSession,lifeGeneration:p.lifeGeneration,teleportSequence:p.teleportSequence,targetId:target.state.id,targetSession:target.state.reloadSession,targetLifeGeneration:target.state.lifeGeneration,targetTeleportSequence:target.state.teleportSequence,...point,shieldDamage:damage.shieldAbsorbed,healthDamage:damage.healthDamage});
}
function explode(room:GameRoom,p:ServerProjectile,point:{x:number;y:number},direct:RoomPlayer|null,tick:number,onHit?:(hit:ProjectileHit)=>void,directWallId?:string,directGuardianId?:string){
 effect(room,'explosion',point,MISSILE_EXPLOSION_RADIUS,p.galaxyType==='lunar'?GALAXY_WEAPONS.lunar.color:undefined);
 for(const wall of [...walls(room).values()]){if(wall.id===directWallId)continue;const d=wallDistance(point,wall);if(d<MISSILE_EXPLOSION_RADIUS&&!wallBlocked(room,point,wall,wall.id))damageWall(room,wall,p.damage*.5*(1-d/MISSILE_EXPLOSION_RADIUS));}
 if(!p.guardianPlanetId)for(const g of [...room.guardians?.units.values()??[]]){if(g.id===directGuardianId)continue;const d=Math.hypot(g.x-point.x,g.y-point.y);if(d<MISSILE_EXPLOSION_RADIUS&&!wallBlocked(room,point,g))damageGuardian(room,g,p.damage*.5*(1-d/MISSILE_EXPLOSION_RADIUS),p.ownerId,p);}
 for(const target of room.players.values()){
  const s=target.state;if(target===direct||s.id===p.ownerId||!target.gameplayEnabled||s.lifeState!=='active'||s.status==='OUT'||s.health<=0)continue;
  const distance=Math.hypot(s.x-point.x,s.y-point.y);if(distance>=MISSILE_EXPLOSION_RADIUS||wallBlocked(room,point,s))continue;
  damageTarget(room,p,target,p.damage*.5*(1-distance/MISSILE_EXPLOSION_RADIUS),point,tick,onHit);
 }
}

function guideMissile(room:GameRoom,p:ServerProjectile){
 const heading=p.heading??Math.atan2(p.vy,p.vx),delta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
 const candidates:{id:string;x:number;y:number}[]=[];
 for(const q of room.players.values())if(q.state.id!==p.ownerId&&q.gameplayEnabled&&q.state.lifeState==='active'&&q.state.status!=='OUT'&&q.state.health>0)candidates.push(q.state);
 for(const g of room.guardians?.units.values()??[])if(g.health>0)candidates.push(g);
 let target=candidates.find(t=>t.id===p.targetId&&Math.hypot(t.x-p.x,t.y-p.y)<=GALAXY_CONFIG.homingAcquireRange);
 if(!target){target=candidates.filter(t=>Math.hypot(t.x-p.x,t.y-p.y)<=GALAXY_CONFIG.homingAcquireRange&&Math.abs(delta(Math.atan2(t.y-p.y,t.x-p.x),heading))<=GALAXY_CONFIG.homingCone/2).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)||a.id.localeCompare(b.id))[0];p.targetId=target?.id;}
 if(!target)return;const turn=delta(Math.atan2(target.y-p.y,target.x-p.x),heading),limit=GALAXY_CONFIG.homingTurnRate*TICK_SECONDS;p.heading=heading+Math.max(-limit,Math.min(limit,turn));
 const speed=Math.hypot(p.vx,p.vy);p.vx=Math.cos(p.heading)*speed;p.vy=Math.sin(p.heading)*speed;
}
