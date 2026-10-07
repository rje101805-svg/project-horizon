import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALIEN_HEALTH, ALIEN_MELEE_DAMAGE, ALIEN_MELEE_RANGE, ALIEN_SPAWN_PROTECTION_MS, ALIEN_MELEE_COOLDOWN_MS } from '../shared/alien';
import { BASIC_BLASTER } from '../shared/projectiles';
import { TICK_MS, EDGE_MARGIN, WORLD, idleInput } from '../shared/flight';
import { RESPAWN_DELAY_MS } from '../shared/lifecycle';
import { RoomStore, chooseAlienSpawn, survivingHumans } from '../server/rooms';
import { applyDamage, startReload, resetCombatState, setStatus, advanceCombatTick, refillAmmo } from '../server/combat';
import { fire, advanceProjectiles } from '../server/projectiles';
import { simulatePlayer } from '../server/simulation';
import { reload } from '../server/reload';
import { acceptMovementInput } from '../server/inputs';
import { classifyRegion, SPAWN_CLEARANCE } from '../shared/black-hole';
const source = {type:'PLAYER' as const,playerId:'a'};
function fixture() {
  const store = new RoomStore(); store.create('a','A',0); const room = store.roomFor('a')!;
  for (const id of ['b','c']) store.join(id,room.code,id,0);
  const [a,b,c] = [...room.players.values()];
  Object.assign(a.state,{x:200,y:1800}); Object.assign(b.state,{x:260,y:1800}); Object.assign(c.state,{x:500,y:1800});
  const intent = (p:typeof a,sequence:number, aim=0) => ({sequence,aim,lifeGeneration:p.state.lifeGeneration,teleportSequence:p.state.teleportSequence});
  const kill = (p:typeof a,time=1000) => applyDamage(p,150,source,time);
  const respawn = (p:typeof a,time=4000) => simulatePlayer(p,room,time,time);
  return {store,room,a,b,c,intent,kill,respawn};
}
test('lethal shield-first damage eliminates once, retires input/reload and keeps membership with fewer humans', () => {
  const {room,b,kill,intent} = fixture(); b.state.ammo=3; startReload(b);
  acceptMovementInput(b,{...idleInput(),right:true,sequence:1,lifeGeneration:0,teleportSequence:0},1000);
  assert.equal(survivingHumans(room),3);
  assert.deepEqual(kill(b),{shieldAbsorbed:50,healthDamage:100,depleted:true});
  assert.equal(room.players.get('b'),b); assert.equal(room.players.size,3); assert.equal(survivingHumans(room),2);
  assert.equal(b.state.status,'ALIEN'); assert.equal(b.state.lifeState,'dead'); assert.equal(b.state.deathSequence,1);
  assert.equal(b.state.teleportSequence,1); assert.equal(b.pendingInputs.length,0); assert.equal(b.state.lastProcessedInput,1);
  assert.equal(b.combatTimers.reload,0); assert.equal(b.state.isReloading,false); assert.equal(b.state.reloadRemainingMs,0);
  assert.equal(b.state.ammo,0); assert.equal(b.state.shield,0); assert.equal(b.respawnAtMs,1000+RESPAWN_DELAY_MS);
  assert.equal(applyDamage(b,999,source,1100),null); assert.equal(b.state.deathSequence,1);
  assert.equal(fire(room,b,intent(b,1),1).ok,false); assert.equal(survivingHumans(room),2);
});
test('controlled 3s respawn uses safe map edge, 40 HP/no resources, permanent eligibility and repeat alien deaths', () => {
  const {room,b,kill,respawn} = fixture(); kill(b);
  respawn(b,3999); assert.equal(b.state.lifeState,'dead'); assert.equal(b.state.respawnRemainingMs,1);
  respawn(b); assert.equal(b.state.lifeState,'active'); assert.equal(b.state.status,'ALIEN'); assert.equal(b.state.health,40);
  assert.equal(b.state.maxHealth,40); assert.equal(b.state.maxShield,0); assert.equal(b.state.maxAmmo,0);
  assert.equal(b.state.lifeGeneration,1); assert.equal(b.state.teleportSequence,2); assert.equal(b.state.spawnInvulnerabilityRemainingMs,2000);
  assert.ok([b.state.x,b.state.y].some(n=>n===EDGE_MARGIN || n===WORLD-EDGE_MARGIN));
  assert.equal(classifyRegion(b.state,room.blackHole),'safe'); assert.equal(survivingHumans(room),2);
  assert.equal(setStatus(b,'ALIVE'),false); setStatus(b,'OUT'); assert.equal(setStatus(b,'ALIVE'),false);
  resetCombatState(b); assert.equal(b.state.status,'ALIEN'); assert.equal(b.state.health,ALIEN_HEALTH);
  assert.equal(refillAmmo(b),false);
  assert.equal(reload(room,b,{sequence:1,lifeGeneration:1,teleportSequence:2,roomCode:room.code,reloadSession:b.state.reloadSession}).ok,false);
  kill(b,6000); respawn(b,9000); assert.equal(b.state.lifeGeneration,2); assert.equal(b.state.health,40); assert.equal(b.state.status,'ALIEN');
  assert.equal(b.state.spawnInvulnerabilityRemainingMs,ALIEN_SPAWN_PROTECTION_MS); assert.equal(survivingHumans(room),2);
});
test('spawn protection is server-timed, blocks human bullets and ends before any accepted melee attempt', () => {
  const {room,a,b,c,kill,respawn,intent} = fixture(); kill(b); respawn(b);
  Object.assign(a.state,{x:200,y:1800}); Object.assign(b.state,{x:270,y:1800});
  assert.equal(fire(room,a,intent(a,1),1).ok,true); advanceProjectiles(room);
  assert.equal(room.projectiles.size,0); assert.equal(b.state.health,40);
  respawn(b,5999); assert.equal(b.state.spawnInvulnerabilityRemainingMs,1);
  assert.equal(applyDamage(b,25,source,5999),null);
  assert.equal(applyDamage(b,150,{type:'ENVIRONMENT',cause:'BLACK_HOLE'},5999),null);
  respawn(b,6000); assert.equal(b.state.spawnInvulnerabilityRemainingMs,0);
  assert.equal(applyDamage(b,25,source,6000)!.healthDamage,25);
  kill(b,7000); respawn(b,10000); Object.assign(b.state,{x:200,y:1800}); Object.assign(a.state,{x:255,y:1800});
  const attack=fire(room,b,intent(b,1),300); assert.ok(attack.ok && attack.kind==='melee'); assert.equal(attack.damageApplied,5);
  assert.equal(b.state.spawnInvulnerabilityRemainingMs,0); assert.equal(b.invulnerableUntilMs,0);
  assert.equal(applyDamage(b,25,source,10000)!.healthDamage,25);
  kill(c,10000); respawn(c,13000); Object.assign(c.state,{x:1000,y:1800});
  const miss=fire(room,c,intent(c,1),390); assert.ok(miss.ok && miss.kind==='melee'); assert.equal(miss.damageApplied,0); assert.equal(c.invulnerableUntilMs,0);
});
test('same fire input does nearest-human melee only, fixed damage/range/cooldown, never gun/ammo or alien damage', () => {
  const {room,a,b,c,kill,respawn,intent} = fixture(); kill(b); respawn(b); kill(c); respawn(c);
  Object.assign(b.state,{x:200,y:1800}); Object.assign(a.state,{x:200+ALIEN_MELEE_RANGE,y:1800}); Object.assign(c.state,{x:205,y:1800});
  assert.equal(ALIEN_MELEE_DAMAGE,BASIC_BLASTER.damage*.2);
  const attack=fire(room,b,intent(b,1),120); assert.ok(attack.ok && attack.kind==='melee'); assert.equal(attack.damageApplied,5);
  assert.equal(a.state.shield,45); assert.equal(c.state.health,40); assert.equal(room.projectiles.size,0); assert.equal(b.state.ammo,0);
  const ticks=Math.ceil(ALIEN_MELEE_COOLDOWN_MS/TICK_MS); assert.equal(ticks,23);
  for(let n=1;n<ticks;n++){ advanceCombatTick(b); assert.equal(fire(room,b,intent(b,n+1),120).ok,false); }
  advanceCombatTick(b); a.state.x+=.01;
  const miss=fire(room,b,intent(b,100),120); assert.ok(miss.ok && miss.kind==='melee'); assert.equal(miss.damageApplied,0); assert.equal(a.state.shield,45);
  assert.equal(fire(room,b,intent(b,100),120).ok,false);
  const before=structuredClone(b.state); assert.equal(fire(room,b,{...intent(b,101),teleportSequence:0},120).ok,false); assert.deepEqual(b.state,before);
  for(let n=0;n<ticks;n++)advanceCombatTick(b); a.state.x=250; a.state.shield=0; a.state.health=3;
  const lethal=fire(room,b,intent(b,102),120); assert.ok(lethal.ok && lethal.kind==='melee'); assert.equal(lethal.damageApplied,3);
  assert.equal(a.state.status,'ALIEN'); assert.equal(survivingHumans(room),0); assert.equal(room.players.size,3);
});
test('already-fired human projectile survives elimination, resolves normally and still expires or cancels on departure/reset', () => {
  const {store,room,a,b,kill,intent} = fixture(); Object.assign(b.state,{x:400,y:1800});
  assert.equal(fire(room,a,intent(a,1),0).ok,true); kill(a,0);
  const hits:unknown[]=[]; for(let n=0;n<10;n++)advanceProjectiles(room,h=>hits.push(h));
  assert.equal(b.state.shield,25); assert.equal(hits.length,1); assert.equal(room.projectiles.size,0); assert.equal(a.state.status,'ALIEN');
  const fresh=fixture(); assert.equal(fire(fresh.room,fresh.a,fresh.intent(fresh.a,1),0).ok,true);
  fresh.kill(fresh.a,0); fresh.store.leave('a'); advanceProjectiles(fresh.room); assert.equal(fresh.room.projectiles.size,0);
  const reset=fixture(); fire(reset.room,reset.a,reset.intent(reset.a,1),0); reset.a.state.teleportSequence++; advanceProjectiles(reset.room); assert.equal(reset.room.projectiles.size,0);
  store.leave('a'); simulatePlayer(a,room,5000,5000); assert.equal(a.state.lifeState,'dead');
});
test('edge spawn validates bounds, separation and current horizon; no candidate defers respawn safely', () => {
  const {room,b,kill,respawn}=fixture();
  for(let n=0;n<40;n++) {
    const spawn=chooseAlienSpawn([room.players.get('a')!.state],room.blackHole)!;
    assert.ok(spawn); assert.ok(spawn.x>=EDGE_MARGIN && spawn.x<=WORLD-EDGE_MARGIN && spawn.y>=EDGE_MARGIN && spawn.y<=WORLD-EDGE_MARGIN);
    assert.ok(spawn.x===EDGE_MARGIN || spawn.x===WORLD-EDGE_MARGIN || spawn.y===EDGE_MARGIN || spawn.y===WORLD-EDGE_MARGIN);
    assert.ok(Math.hypot(spawn.x-room.blackHole.x,spawn.y-room.blackHole.y)>room.blackHole.influenceRadius+SPAWN_CLEARANCE);
  }
  kill(b); room.blackHole.influenceRadius=10000; respawn(b); assert.equal(b.state.lifeState,'dead'); assert.equal(b.state.lifeGeneration,0);
  room.blackHole.influenceRadius=500; respawn(b,4001); assert.equal(b.state.lifeState,'active'); assert.equal(b.state.status,'ALIEN');
});
test('human projectiles kill an unprotected alien, report lethal clamped damage and retain eligibility across respawn', () => {
  const {room,a,b,kill,respawn,intent}=fixture();kill(b);respawn(b);respawn(b,6000);
  Object.assign(b.state,{x:270,y:1800});
  const hits:{healthDamage:number;shieldDamage:number;targetTeleportSequence:number}[]=[];
  assert.equal(fire(room,a,intent(a,1),180).ok,true);advanceProjectiles(room,h=>hits.push(h));assert.equal(b.state.health,15);
  for(let n=0;n<6;n++)advanceCombatTick(a);
  assert.equal(fire(room,a,intent(a,2),186).ok,true);advanceProjectiles(room,h=>hits.push(h));
  assert.deepEqual(hits.map(h=>[h.shieldDamage,h.healthDamage]),[[0,25],[0,15]]);
  assert.equal(hits[1].targetTeleportSequence,b.state.teleportSequence);assert.equal(b.state.lifeState,'dead');assert.equal(b.state.status,'ALIEN');
  respawn(b,9000);assert.equal(b.state.health,40);assert.equal(b.state.status,'ALIEN');assert.equal(survivingHumans(room),2);
});
