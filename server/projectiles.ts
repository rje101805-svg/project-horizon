import { BASIC_BLASTER, parseFire, circleEntry, type FireResult, type ProjectileState } from '../shared/projectiles';
import { TICK_MS, TICK_SECONDS, WORLD } from '../shared/flight';
import { applyDamage, consumeAmmo, startFireCooldown, canFireFromCooldown } from './combat';
import type { GameRoom, RoomPlayer } from './rooms';
export interface ServerProjectile extends ProjectileState { remainingTicks: number }
export function fire(room: GameRoom | undefined, player: RoomPlayer | undefined, raw: unknown, tick: number): FireResult {
  const request = parseFire(raw);
  const reject = (reason: string): FireResult => ({ ok: false, sequence: request?.sequence ?? 0, reason });
  if (!request || !room || !player) return reject('Invalid fire request or membership');
  if (request.sequence <= player.lastFireSequence) return reject('Duplicate or stale shot');
  player.lastFireSequence = request.sequence; // Rejections cannot be replayed later.
  const s = player.state;
  if (request.lifeGeneration !== s.lifeGeneration || request.teleportSequence !== s.teleportSequence ||
    s.lifeState !== 'active' || s.status !== 'ALIVE' || s.health <= 0) return reject('Inactive or stale player');
  if (s.isReloading || s.ammo <= 0) return reject('No ammo or reloading');
  if (!canFireFromCooldown(player)) return reject('Cooldown');
  if ([...room.projectiles.values()].filter(p => p.ownerId === s.id).length >= BASIC_BLASTER.maxActive) return reject('Projectile cap');
  const dx = Math.cos(request.aim), dy = Math.sin(request.aim);
  const x = s.x + dx * BASIC_BLASTER.muzzleOffset, y = s.y + dy * BASIC_BLASTER.muzzleOffset;
  if (x < 0 || x > WORLD || y < 0 || y > WORLD) return reject('Muzzle outside world');
  if (!consumeAmmo(player)) return reject('No ammo');
  startFireCooldown(player);
  const id = `${room.code}:${++room.projectileSequence}`;
  room.projectiles.set(id, { id, ownerId: s.id, shotSequence: request.sequence, lifeGeneration: s.lifeGeneration,
    teleportSequence: s.teleportSequence, x, y, vx: s.vx + dx * BASIC_BLASTER.muzzleSpeed,
    vy: s.vy + dy * BASIC_BLASTER.muzzleSpeed, damage: BASIC_BLASTER.damage, spawnTick: tick,
    remainingMs: BASIC_BLASTER.lifetimeMs, remainingTicks: Math.ceil(BASIC_BLASTER.lifetimeMs / TICK_MS) });
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
export function advanceProjectiles(room: GameRoom) {
  for (const [id, p] of room.projectiles) {
    const owner = room.players.get(p.ownerId)?.state;
    if (!owner || owner.lifeState !== 'active' || owner.lifeGeneration !== p.lifeGeneration || owner.teleportSequence !== p.teleportSequence) { room.projectiles.delete(id); continue; }
    const next = { x: p.x + p.vx * TICK_SECONDS, y: p.y + p.vy * TICK_SECONDS };
    let contact = Math.min(boundaryEntry(p, next), circleEntry(p, next, room.blackHole, room.blackHole.eventHorizonRadius + BASIC_BLASTER.projectileRadius) ?? Infinity);
    let target: RoomPlayer | null = null;
    for (const player of room.players.values()) {
      const s = player.state;
      if (s.id === p.ownerId || s.lifeState !== 'active' || s.status !== 'ALIVE' || s.health <= 0) continue;
      const t = circleEntry(p, next, s, BASIC_BLASTER.shipRadius + BASIC_BLASTER.projectileRadius);
      if (t !== null && t < contact) { contact = t; target = player; }
    }
    if (contact !== Infinity) {
      if (target) applyDamage(target, p.damage, { type: 'PLAYER', playerId: p.ownerId });
      room.projectiles.delete(id); continue;
    }
    Object.assign(p, next); p.remainingTicks--; p.remainingMs = p.remainingTicks * TICK_MS;
    if (p.remainingTicks <= 0) room.projectiles.delete(id);
  }
}
export const projectileSnapshot = (room: GameRoom): ProjectileState[] => [...room.projectiles.values()].map(({ remainingTicks: _ticks, ...state }) => state);
