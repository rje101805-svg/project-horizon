import { initialMatchState } from '../shared/match';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomStore } from '../server/rooms';
import { fire, advanceProjectiles, projectileSnapshot } from '../server/projectiles';
import { BASIC_BLASTER, parseFire, circleEntry } from '../shared/projectiles';
import { advanceCombatTick, consumeAmmo, startReload, refillAmmo } from '../server/combat';
import { TICK_SECONDS, TICK_MS, WORLD } from '../shared/flight';
import { ProjectileView } from '../src/projectile-view';
const request = (sequence = 1, aim = 0) => ({ sequence, aim, lifeGeneration: 0, teleportSequence: 0 });
function fixture() {
  const store = new RoomStore(); store.create('a', 'A', 0);
  const room = store.roomFor('a')!, p = room.players.get('a')!;
  return { store, room, p };
}
const ready = (p: ReturnType<typeof fixture>['p']) => { for (let i = 0; i < 6; i++) advanceCombatTick(p); };
test('valid shot uses authoritative muzzle/velocity and consumes ammo/cooldown, ignoring forged fields', () => {
  const { room, p } = fixture(); Object.assign(p.state, { vx: 123, vy: -50 });
  const r = fire(room, p, { ...request(), x: 0, vx: 99999, damage: 99999, ownerId: 'victim' }, 7); assert.ok(r.ok && r.kind !== 'melee');
  const bullet = room.projectiles.get(r.projectileId)!;
  assert.equal(bullet.x, p.state.x + BASIC_BLASTER.muzzleOffset); assert.equal(bullet.vx, 123 + BASIC_BLASTER.muzzleSpeed);
  assert.equal(bullet.vy, -50); assert.equal(bullet.ownerId, 'a'); assert.equal(bullet.damage, BASIC_BLASTER.damage);
  assert.equal(p.state.ammo, 11); assert.equal(p.combatTimers.cooldown, 6); assert.equal(bullet.spawnTick, 7);
  advanceProjectiles(room); assert.equal(bullet.x, p.state.x + BASIC_BLASTER.muzzleOffset + bullet.vx * TICK_SECONDS);
  assert.equal(bullet.remainingMs, 59 * TICK_MS); assert.equal(bullet.vy, -50); // No gravitational acceleration.
});
test('malformed aims/sequences, unknown membership, stale lives and duplicates cannot mutate combat', () => {
  const {room,p} = fixture();
  for (const raw of [null, {}, request(0), request(-1), request(1, NaN), request(1, Infinity), request(1, 100), request(Number.MAX_SAFE_INTEGER + 1), {...request(),lifeGeneration:-1}]) {
    assert.equal(parseFire(raw), null); assert.equal(fire(room,p,raw,0).ok,false);
  }
  assert.equal(fire(undefined,undefined,request(),0).ok,false);
  assert.equal(fire(room,p,{...request(),lifeGeneration:1},0).ok,false);
  assert.equal(p.state.ammo,12); assert.equal(fire(room,p,request(2),0).ok,true); ready(p);
  assert.equal(fire(room,p,request(2),0).ok,false); assert.equal(fire(room,p,request(1),0).ok,false);
  assert.equal(room.projectiles.size,1); assert.equal(p.state.ammo,11);
});
test('hold/spam enforces six fixed ticks between successful shots independent of arrival count', () => {
  const {room,p} = fixture(); let seq=0, accepted=0;
  for (let tick=0; tick<30; tick++) {
    for (let i=0;i<100;i++) if(fire(room,p,request(++seq),tick).ok) accepted++;
    advanceCombatTick(p);
  }
  assert.equal(accepted,5); assert.equal(p.state.ammo,7); assert.equal(room.projectiles.size,5);
});
test('zero ammo/reload/dead/zero-health/noncontestant rejects', () => {
  const {room,p} = fixture(); consumeAmmo(p,12); assert.equal(fire(room,p,request(),0).ok,false);
  assert.equal(p.state.isReloading,true); for(let i=0;i<45;i++)advanceCombatTick(p);
  assert.equal(refillAmmo(p),true); consumeAmmo(p); startReload(p); assert.equal(fire(room,p,request(2),0).ok,false);
  assert.equal(refillAmmo(p),false); for(let i=0;i<45;i++)advanceCombatTick(p);
  let sequence=2;
  for(const changes of [{lifeState:'dead'},{lifeState:'active',health:0},{status:'OUT'}]) {
    Object.assign(p.state,changes); assert.equal(fire(room,p,request(++sequence),0).ok,false);
  }
  Object.assign(p.state,{status:'ALIVE',lifeState:'active',health:100});
  assert.equal(fire(room,p,request(p.lastFireSequence+1),0).ok,true);
  refillAmmo(p); assert.equal(fire(room,p,request(p.lastFireSequence+1),0).ok,false); // Refill cannot reset cooldown.
});
test('server swept hits are single-use, shield-first with typed PLAYER source, and eliminate at zero', () => {
  const {room,p,store} = fixture(); store.join('b',room.code,'B',0); const b=room.players.get('b')!;
  Object.assign(b.state,{x:p.state.x+70,y:p.state.y});
  for(let seq=1;seq<=6;seq++) { assert.equal(fire(room,p,request(seq),0).ok,true); advanceProjectiles(room); assert.equal(room.projectiles.size,0); ready(p); }
  assert.equal(b.state.shield,0); assert.equal(b.state.health,0); assert.equal(b.state.status,'ALIEN');
  assert.equal(b.state.lifeState,'dead'); assert.equal(b.state.kills,0);
  assert.deepEqual(b.state.lastDamageSource,{type:'PLAYER',playerId:'a'});
  const before=b.state.health; advanceProjectiles(room); assert.equal(b.state.health,before);
  assert.equal(p.state.health,100); assert.equal(p.state.shield,50);
});
test('swept collision prevents tunneling and chooses nearest target before further ships', () => {
  const {room,p,store}=fixture(); store.join('b',room.code,'B',0); store.join('c',room.code,'C',0);
  const b=room.players.get('b')!,c=room.players.get('c')!;
  Object.assign(b.state,{x:1500,y:1200}); Object.assign(c.state,{x:1600,y:1200}); p.state.vx=10000;
  fire(room,p,request(),0); advanceProjectiles(room);
  assert.equal(b.state.shield,25); assert.equal(c.state.shield,50);
  assert.equal(circleEntry({x:0,y:1},{x:2,y:1},{x:1,y:0},1),.5);
  assert.equal(circleEntry({x:0,y:0},{x:0,y:0},{x:0,y:0},1),0);
});
test('misses expire exactly at configured lifetime, bounds and existing horizon remove shots', () => {
  const {room,p}=fixture(); Object.assign(p.state,{x:200,y:1800}); fire(room,p,request(),0);
  for(let n=0;n<59;n++) advanceProjectiles(room); assert.equal(room.projectiles.size,1);
  advanceProjectiles(room); assert.equal(room.projectiles.size,0);
  ready(p); Object.assign(p.state,{x:WORLD-50}); fire(room,p,request(2),60); advanceProjectiles(room); assert.equal(room.projectiles.size,0);
  ready(p); Object.assign(p.state,{x:1000,y:room.blackHole.y}); fire(room,p,request(3),61);
  for(let n=0;n<10;n++) advanceProjectiles(room); assert.equal(room.projectiles.size,0);
});
test('active cap is per owner; cleanup removes old-life and disconnected-owner projectiles', () => {
  const {room,p,store}=fixture();
  for(let n=1;n<=BASIC_BLASTER.maxActive;n++) { assert.equal(fire(room,p,request(n),0).ok,true); ready(p); }
  for(let i=0;i<39;i++)advanceCombatTick(p); // Last round now starts the 45-tick reload.
  assert.equal(refillAmmo(p),true); const denied=fire(room,p,request(13),0); assert.ok(!denied.ok); assert.equal(denied.reason,'Projectile cap');
  assert.equal(p.state.ammo,12); p.state.teleportSequence++; advanceProjectiles(room); assert.equal(room.projectiles.size,0);
  assert.equal(fire(room,p,{...request(14),teleportSequence:1},0).ok,true); store.leave('a'); assert.equal(room.projectiles.size,0);
});
test('authoritative snapshot interpolation is bounded, removes hits immediately and never mutates authority', () => {
  const {room,p}=fixture(); fire(room,p,request(),0); const view=new ProjectileView();
  const frame=(tick:number,timeMs:number)=>({tick,timeMs,roomCode:room.code,blackHole:room.blackHole,players:[p.state],match: initialMatchState(), survivingHumans: 1, projectiles:projectileSnapshot(room)});
  const first=frame(1,0); view.push(first,0); advanceProjectiles(room); const second=frame(2,100); view.push(second,100);
  const midpoint=view.sample(150)[0]; assert.equal(midpoint.x,(first.projectiles[0].x+second.projectiles[0].x)/2);
  assert.equal(first.projectiles[0].x,p.state.x+BASIC_BLASTER.muzzleOffset);
  assert.equal(view.sample(10000)[0].x,second.projectiles[0].x);
  room.projectiles.clear(); view.push(frame(3,200),200); assert.deepEqual(view.sample(210),[]);
  view.clear(); assert.deepEqual(view.sample(220),[]);
});
