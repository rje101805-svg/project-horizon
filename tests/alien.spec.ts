import { test, expect, type Page } from '@playwright/test';
import { createGameServer } from '../server/game';
import { RoomStore } from '../server/rooms';
import { retireInputs } from '../server/inputs';
import { applyDamage } from '../server/combat';
import { TICK_MS, EDGE_MARGIN, WORLD } from '../shared/flight';
import type { FlightConnection } from '../src/network';
import type Phaser from 'phaser';
import type { ShipCombatHud } from '../src/ship-combat-hud';
type DebugWindow=Window & {__HORIZON_FLIGHT__:FlightConnection;__HORIZON_GAME__:{scene:{scenes:(Phaser.Scene & {ships:Map<string,{body:Phaser.GameObjects.Container;label:Phaser.GameObjects.Text;alien:boolean}>;localHud:ShipCombatHud;fireAim:number})[]}}};
const local=(page:Page)=>page.evaluate(()=>{const c=(window as unknown as DebugWindow).__HORIZON_FLIGHT__;return c.latest?.players.find(p=>p.id===c.socket.id);});
for(const lag of [false,true])test(`human elimination, permanent alien respawn/HUD/melee in three clients (${lag?'150ms+jitter':'normal'})`,async({page,context})=>{
 test.setTimeout(90000);
 const errors:string[]=[],store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store,{autoTick:false});
 await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));const address=server.http.address();if(!address||typeof address==='string')throw Error('No address');
 const peer=await context.newPage(),observer=await context.newPage(),pages=[page,peer,observer];let tick=0;
 const frame=async()=>{
  await Promise.all(pages.map(p=>p.evaluate(()=>new Promise<void>(resolve=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.emit('latencyProbe',resolve)))));
  server.step();tick++;
  await Promise.all(pages.map(p=>expect.poll(()=>p.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.tick)).toBe(tick)));
 };
 const advance=async(n:number)=>{for(let i=0;i<n;i++){server.step();tick++;await new Promise<void>(resolve=>setImmediate(resolve));}};
 try{
  for(const p of pages){p.on('pageerror',e=>errors.push(e.message));await p.goto('/');await p.locator('#server-url').fill(`http://127.0.0.1:${address.port}`);}
  await page.locator('#create').click();await expect(page.locator('canvas')).toBeVisible();const code=(await page.locator('#room-code-display').textContent())!;
  for(const p of [peer,observer]){await p.locator('#room-code').fill(code);await p.locator('#join').click();await expect(p.locator('canvas')).toBeVisible();}
  const aid=await page.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.id!);
  const bid=await peer.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.id!);
  const room=store.roomFor(aid)!,a=room.players.get(aid)!,b=room.players.get(bid)!,c=[...room.players.values()].find(p=>p!==a&&p!==b)!;
  Object.assign(a.state,{x:200,y:1800});Object.assign(b.state,{x:270,y:1800});Object.assign(c.state,{x:600,y:1800});b.state.ammo=11;await frame();
  if(lag)for(const p of pages){await p.bringToFront();await p.keyboard.press('F3');await p.locator('#fake-lag').check();await p.keyboard.press('F3');}
  await peer.bringToFront();await peer.keyboard.press('r');await expect.poll(()=>b.state.isReloading).toBe(true);await frame();
  for(let seq=1;seq<=6;seq++){
   await page.bringToFront();await page.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_GAME__.scene.scenes[0].fireAim=0);
   await page.keyboard.down('Space');await page.waitForTimeout(60);await page.keyboard.up('Space');await expect.poll(()=>a.lastFireSequence).toBe(seq);await frame();
   if(seq===1){expect(b.state.shield).toBe(25);expect(b.state.health).toBe(100);}
   if(seq===2){expect(b.state.shield).toBe(0);expect(b.state.health).toBe(100);}
   if(seq<6){await advance(5);await frame();await page.waitForTimeout(220);}
  }
  expect(b.state.status).toBe('ALIEN');expect(b.state.lifeState).toBe('dead');expect(b.state.isReloading).toBe(false);expect(b.combatTimers.reload).toBe(0);
  expect(room.players.size).toBe(3);expect(a.state.lifeState).toBe('active');
  for(const p of pages)await expect(p.locator('#humans-remaining')).toHaveText('Humans alive: 2');
  await expect(peer.locator('#alien-message')).toBeVisible();await expect(peer.locator('#death-overlay')).toBeVisible();await expect(peer.locator('#hud-ammo')).toBeHidden();
  const oldMarkers={lifeGeneration:0,teleportSequence:0};
  const deadShot=await peer.evaluate(markers=>new Promise<{ok:boolean}>(resolve=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.emit('fire',{sequence:100,aim:0,...markers},resolve)),oldMarkers);
  expect(deadShot.ok).toBe(false);expect(room.projectiles.size).toBe(0);
  await advance(89);expect(b.state.lifeState).toBe('dead');await frame();
  expect(b.state.lifeState).toBe('active');expect(b.state.status).toBe('ALIEN');expect(b.state.health).toBe(40);expect(b.state.shield).toBe(0);
  expect(b.state.spawnInvulnerabilityRemainingMs).toBe(2000);expect([b.state.x,b.state.y].some(n=>n===EDGE_MARGIN||n===WORLD-EDGE_MARGIN)).toBe(true);
  for(const p of pages){
   await expect.poll(()=>p.evaluate(id=>{const w=window as unknown as DebugWindow,s=w.__HORIZON_GAME__.scene.scenes[0].ships.get(id);return {alpha:s?.body.alpha,alien:s?.alien,tag:s?.label.text.includes('ALIEN')};},bid)).toEqual({alpha:.5,alien:true,tag:true});
  }
  await expect.poll(()=>peer.evaluate(()=>{const w=window as unknown as DebugWindow,s=w.__HORIZON_GAME__.scene.scenes[0],label=s.ships.get(w.__HORIZON_FLIGHT__.socket.id!)!.label,bounds=label.getBounds(),v=s.cameras.main.worldView;return bounds.left>=v.left && bounds.right<=v.right && bounds.top>=v.top && bounds.bottom<=v.bottom;})).toBe(true);
  await expect(peer.locator('#hud-alien')).toHaveText('ALIEN · HP 40 / 40');await expect(peer.locator('#hud-ammo')).toBeHidden();await expect(peer.locator('#hud-reload')).toHaveText('');
  await expect.poll(()=>peer.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_GAME__.scene.scenes[0].localHud.presentation?.alien)).toBe(true);
  // Normal flight using the same predicted input, choosing inward at a random edge.
  await peer.bringToFront();const x=b.state.x,key=x<WORLD/2?'d':'a';await peer.keyboard.down(key);await peer.waitForTimeout(lag?250:80);
  await expect.poll(async()=>{await frame();return Math.abs(b.state.x-x);},{intervals:[20],timeout:10000}).toBeGreaterThan(0);await peer.keyboard.up(key);
  // Server fixture positions isolate deterministic melee range/protection checks.
  Object.assign(b.state,{x:220,y:1800,vx:0,vy:0});b.state.teleportSequence++;retireInputs(b);Object.assign(a.state,{x:270,y:1800,vx:0,vy:0});await frame();
  // Earlier deliberately forged sequence was retired; next legitimate sequence is advanced only in this test fixture.
  await peer.evaluate(()=>{Object.assign((window as unknown as DebugWindow).__HORIZON_FLIGHT__,{shotSequence:100});});
  // Exercise the existing fire-intent pipeline twice at the same client time,
  // avoiding a wall-time hold that could legitimately eliminate the target.
  await peer.evaluate(()=>{const c=(window as unknown as DebugWindow).__HORIZON_FLIGHT__,fire=c as unknown as {attemptFire(now:number):void},now=performance.now();c.setFireIntent(true,0);fire.attemptFire(now);fire.attemptFire(now);c.setFireIntent(false,0);});
  await expect.poll(()=>b.lastFireSequence).toBe(102);expect(b.state.lastMeleeDamage).toBe(5);
  expect(b.state.spawnInvulnerabilityRemainingMs).toBe(0);expect(a.state.shield).toBe(40);expect(room.projectiles.size).toBe(0);await frame();
  expect(await peer.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.projectilePrediction.count(performance.now()))).toBe(0);
  await peer.keyboard.press('F3');await expect(peer.locator('#debug-weapon')).toContainText('damage 5 · last applied 5');await expect(peer.locator('#debug-cooldown')).toHaveText('Alien melee · no cooldown');await peer.keyboard.press('F3');
  expect(applyDamage(b,25,{type:'PLAYER',playerId:aid},tick*TICK_MS)!.healthDamage).toBe(25);await frame();await expect(peer.locator('#hud-alien')).toHaveText('ALIEN · HP 15 / 40');
  applyDamage(b,25,{type:'PLAYER',playerId:aid},tick*TICK_MS);await frame();expect(b.state.status).toBe('ALIEN');await advance(88);await frame();
  expect(b.state.lifeGeneration).toBe(2);expect(b.state.health).toBe(40);expect(b.state.spawnInvulnerabilityRemainingMs).toBeGreaterThanOrEqual(1900);
  await expect(peer.locator('#hud-alien')).toHaveText('ALIEN · HP 40 / 40');await expect(peer.locator('#hud-ammo')).toBeHidden();
  // Final elimination now ends the P2S7 round while retaining P2S6 alien status.
  applyDamage(c,150,{type:'PLAYER',playerId:aid},tick*TICK_MS);await frame();
  for(const p of pages)await expect(p.locator('#humans-remaining')).toHaveText('Humans alive: 1');
  expect(room.match.state).toBe('ended');expect(room.match.result).toEqual({kind:'winner',winnerId:aid,winnerName:a.state.name});
  await expect(page.locator('#match-result')).toHaveText('VICTORY');
  expect(a.state.status).toBe('ALIVE');expect(room.players.size).toBe(3);await expect(page.locator('canvas')).toBeVisible();
  await expect(peer.locator('#match-overlay')).toBeVisible();
  await expect(peer.locator('#alien-message')).toBeHidden({timeout:7000});
  await peer.screenshot({path:`test-results/p2s6-alien-${lag?'lag':'normal'}.png`,fullPage:true});expect(errors).toEqual([]);
 }finally{for(const p of pages)await p.close();await server.close();}
});
