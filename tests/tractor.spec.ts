import { TRACTOR_RANGE, TRACTOR_KILL_LOCK_MS } from '../shared/tractor';
import { test,expect,type Page } from '@playwright/test';
import { createGameServer } from '../server/game';
import { RoomStore } from '../server/rooms';
import { applyDamage } from '../server/combat';
import { retireInputs } from '../server/inputs';
import type { FlightConnection } from '../src/network';
import type Phaser from 'phaser';
type DebugWindow=Window&{__HORIZON_FLIGHT__:FlightConnection;__HORIZON_GAME__:{scene:{scenes:(Phaser.Scene&{tractorGraphics:Phaser.GameObjects.Graphics;ships:Map<string,{body:Phaser.GameObjects.Container}>})[]}}};
for(const lag of [false,true])test(`E tractor replicates cone/lock, predicts drag and escape, then earns a three-second lock finisher through winner/reset (${lag?'150ms+jitter':'normal'})`,async({page,context})=>{
 test.setTimeout(90000);const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store,{autoTick:false});
 await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));const address=server.http.address();if(!address||typeof address==='string')throw Error('No address');
 const peer=await context.newPage(),third=await context.newPage(),spectator=await context.newPage(),pages=[page,peer,third,spectator];let clients=pages.slice(0,3),tick=0;const errors:string[]=[];
 const frame=async()=>{await Promise.all(clients.map(p=>p.evaluate(()=>new Promise<void>(resolve=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.emit('latencyProbe',resolve)))));server.step();tick++;await Promise.all(clients.map(p=>expect.poll(()=>p.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.tick)).toBe(tick)));};
 const advance=async(n:number)=>{for(let i=0;i<n;i++){server.step();tick++;await new Promise<void>(resolve=>setImmediate(resolve));}};
 try{
  for(const p of pages){p.on('pageerror',e=>errors.push(e.message));await p.goto('/');await p.locator('#server-url').fill(`http://127.0.0.1:${address.port}`);}
  await page.locator('#create').click();await expect(page.locator('canvas')).toBeVisible();const code=(await page.locator('#room-code-display').textContent())!;
  for(const p of clients.slice(1)){await p.locator('#room-code').fill(code);await p.locator('#join').click();await expect(p.locator('canvas')).toBeVisible();}
  await frame();const room=store.rooms.get(code)!,[a,b,c]=[...room.players.values()];
  await page.bringToFront();await page.keyboard.press('e');expect(room.tractorBeams?.size??0).toBe(0);
  await page.locator('#start-match').click();await expect.poll(()=>room.match.state).toBe('active');
  Object.assign(a.state,{x:200,y:1800,rotation:0,vx:0,vy:0});Object.assign(b.state,{x:350,y:1800,rotation:Math.PI,vx:0,vy:0});Object.assign(c.state,{x:600,y:1800,vx:0,vy:0});for(const p of [a,b,c])p.state.teleportSequence++;await frame();
  await spectator.locator('#room-code').fill(code);await spectator.locator('#join').click();await expect(spectator.locator('canvas')).toBeVisible();clients=pages;await frame();
  if(lag)for(const p of pages)await p.locator('#fake-lag').check();
  await expect(page.locator('#hud-tractor')).toHaveText('TRACTOR READY · E');await expect(spectator.locator('#hud-tractor')).toHaveText('');
  await page.bringToFront();await page.keyboard.press('e');await expect.poll(()=>a.state.tractor.targetId).toBe(b.state.id);await frame();
  await expect(page.locator('#hud-tractor')).toContainText('TRACTOR ACTIVE');await expect(peer.locator('#tractor-lock')).toBeVisible();
  for(const p of pages)await expect.poll(()=>p.evaluate(()=>{const s=(window as unknown as DebugWindow).__HORIZON_GAME__.scene.scenes[0];return s.tractorGraphics.commandBuffer.length;})).toBeGreaterThan(0);
  await expect.poll(()=>peer.evaluate(()=>{const w=window as unknown as DebugWindow;return !!w.__HORIZON_FLIGHT__.prediction.state?.tractor.attackerId&&w.__HORIZON_GAME__.scene.scenes[0].cameras.main.shakeEffect.isRunning;})).toBe(true);
  const startX=b.state.x;await advance(9);await frame();expect(b.state.x).toBeLessThan(startX);
  // Deliberate thrust predicts escape before acknowledgements; server remains authoritative.
  await peer.bringToFront();const predictedStart=await peer.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.prediction.state!.x);await peer.keyboard.down('d');
  await expect.poll(()=>peer.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.prediction.state!.x)).toBeGreaterThan(predictedStart);await peer.waitForTimeout(lag?250:70);
  for(let i=0;i<90 && a.state.tractor.targetId;i++)await frame();expect(b.state.x-a.state.x).toBeGreaterThan(TRACTOR_RANGE);await peer.keyboard.up('d');await frame();
  await expect.poll(()=>a.state.tractor.targetId).toBe(null);expect(b.state.status).toBe('ALIVE');await expect(peer.locator('#tractor-lock')).toBeHidden();await expect(page.locator('#hud-tractor')).toContainText('TRACTOR ');
  // Advance the same server clock through committed cooldown, then reacquire.
  await advance(450);await frame();for(const p of [a,b,c]){retireInputs(p);p.input={up:false,down:false,left:false,right:false,boost:false,aim:0};p.lastInput=-Infinity;}
  Object.assign(a.state,{x:200,y:1800,rotation:0,vx:0,vy:0});Object.assign(b.state,{x:350,y:1800,vx:0,vy:0});for(const p of [a,b])p.state.teleportSequence++;await frame();
  await page.bringToFront();await page.keyboard.press('e');await expect.poll(()=>a.state.tractor.targetId).toBe(b.state.id);applyDamage(a,35,{type:'PLAYER',playerId:c.state.id});await frame();expect(a.state.shield).toBe(15);expect(a.state.tractor.targetId).toBe(b.state.id);
  const ammo=a.state.ammo;const rejected=await page.evaluate(()=>{const n=(window as unknown as DebugWindow).__HORIZON_FLIGHT__,p=n.latest!.players.find(p=>p.id===n.socket.id)!;return new Promise<{ok:boolean}>(resolve=>n.socket.emit('fire',{sequence:999,aim:0,lifeGeneration:p.lifeGeneration,teleportSequence:p.teleportSequence},resolve));});expect(rejected.ok).toBe(false);expect(a.state.ammo).toBe(ammo);
  applyDamage(c,150,{type:'ENVIRONMENT',cause:'HAZARD'});await frame();
  const lockStarted=room.tractorBeams!.get(a.state.id)!.startedAtMs;
  while((tick+1)*1000/30-lockStarted<2900){server.step();tick++;await new Promise<void>(resolve=>setImmediate(resolve));}await frame();
  expect(b.state.status).toBe('ALIVE');expect(b.state.health).toBe(100);expect(b.state.shield).toBe(50);await expect(peer.locator('#tractor-lock')).toContainText('/ 3.0s');await expect(page.locator('#hud-tractor')).toContainText('/ 3.0s');
  for(let i=0;i<10 && room.match.state==='active';i++){server.step();tick++;await new Promise<void>(resolve=>setImmediate(resolve));}expect(room.simulationTimeMs-lockStarted).toBeGreaterThanOrEqual(TRACTOR_KILL_LOCK_MS);await Promise.all(pages.map(p=>expect.poll(()=>p.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.match.state)).toBe('ended')));await frame();
  expect(b.state.deathSource?.type).toBe('TRACTOR');expect(room.match.result?.kind).toBe('winner');expect(a.state.tractor.targetId).toBe(null);for(const p of pages)await expect(p.locator('#tractor-lock')).toBeHidden();await expect(page.locator('#match-result')).toHaveText('VICTORY');
  await advance(180);await Promise.all(pages.map(p=>expect.poll(()=>p.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.match.state)).toBe('waiting')));await frame();expect(room.match.state).toBe('waiting');for(const p of room.players.values()){expect(p.state.status).toBe('ALIVE');expect(p.state.tractor.targetId).toBe(null);expect(p.state.tractor.attackerId).toBe(null);expect(p.state.tractor.cooldownRemainingMs).toBe(0);}
  for(const p of pages){await expect(p.locator('#hud-tractor')).toHaveText('');await expect(p.locator('#tractor-lock')).toBeHidden();}
  await page.locator('#start-match').click();await expect.poll(()=>room.match.state).toBe('active');await frame();await expect(spectator.locator('#hud-tractor')).toHaveText('TRACTOR READY · E');expect(errors).toEqual([]);
 }finally{await Promise.all(pages.map(p=>p.close()));await server.close();}
});
