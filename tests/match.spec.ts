import { test, expect, type Page } from '@playwright/test';
import { createGameServer } from '../server/game';
import { RoomStore } from '../server/rooms';
import { applyDamage } from '../server/combat';
import { fire } from '../server/projectiles';
import type { FlightConnection } from '../src/network';
type DebugWindow=Window & {__HORIZON_FLIGHT__:FlightConnection;__HORIZON_GAME__:{scene:{scenes:{ships:Map<string,unknown>}[]}}};
for(const lag of [false,true])test(`authoritative repeatable rounds, spectator, freeze, draw and disconnect (${lag?'150ms+jitter':'normal'})`,async({page,context})=>{
 test.setTimeout(90000);
 const store=new RoomStore(), server=createGameServer(['http://127.0.0.1:5175'],store,{autoTick:false}), errors:string[]=[];
 await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));const address=server.http.address();if(!address||typeof address==='string')throw Error('Missing address');
 const peer=await context.newPage(),late=await context.newPage();let tick=0,clients=[page];
 const state=(p:Page)=>p.evaluate(()=>{const c=(window as unknown as DebugWindow).__HORIZON_FLIGHT__;return c.latest;});
 const frame=async()=>{await Promise.all(clients.map(p=>p.evaluate(()=>new Promise<void>(resolve=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.emit('latencyProbe',resolve)))));server.step();tick++;await Promise.all(clients.map(p=>expect.poll(async()=>(await state(p))?.tick).toBe(tick)));};
 const advance=async(n:number)=>{for(let i=0;i<n;i++){server.step();tick++;await new Promise<void>(resolve=>setImmediate(resolve));}};
 const configure=async(p:Page,name:string)=>{p.on('pageerror',e=>errors.push(e.message));await p.goto('/');await p.locator('#server-url').fill(`http://127.0.0.1:${address.port}`);await p.locator('#display-name').fill(name);};
 try{
  await configure(page,'Alpha');await page.locator('#create').click();await expect(page.locator('canvas')).toBeVisible();await frame();
  expect((await state(page))!.match.state).toBe('waiting');await expect(page.locator('#match-overlay')).toBeHidden();
  const code=(await page.locator('#room-code-display').textContent())!;
  await configure(peer,'Beta');await peer.locator('#room-code').fill(code);await peer.locator('#join').click();await expect(peer.locator('canvas')).toBeVisible();clients.push(peer);await frame();
  const room=store.rooms.get(code)!,[a,b]=[...room.players.values()];expect(room.match.state).toBe('waiting');expect(room.match.roster).toEqual([]);
  await expect(peer.locator('#lobby-status')).toHaveText('WAITING FOR HOST');await expect(page.locator('#start-match')).toBeEnabled();
  const denied=await peer.evaluate(()=>new Promise<{ok:boolean}>(resolve=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.emit('startMatch',{round:0},resolve)));expect(denied.ok).toBe(false);
  await page.locator('#start-match').click();await expect.poll(()=>room.match.state).toBe('active');await frame();expect(room.match.roster).toEqual([a.state.id,b.state.id]);
  if(lag)for(const p of clients){await p.bringToFront();await p.keyboard.press('F3');await p.locator('#fake-lag').check();await p.keyboard.press('F3');}
  await configure(late,'Gamma');await late.locator('#room-code').fill(code);await late.locator('#join').click();await expect(late.locator('canvas')).toBeVisible();clients.push(late);await frame();const c=[...room.players.values()].find(p=>p!==a&&p!==b)!;
  await expect(late.locator('#match-status')).toHaveText('SPECTATING · JOINS NEXT ROUND');
  expect(c.state.status).toBe('OUT');await expect.poll(()=>late.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_GAME__.scene.scenes[0].ships.size)).toBe(2);
  const spectatorShot=await late.evaluate(()=>{const n=(window as unknown as DebugWindow).__HORIZON_FLIGHT__,s=n.latest!.players.find(p=>p.id===n.socket.id)!;return new Promise<{ok:boolean}>(resolve=>n.socket.emit('fire',{sequence:90,aim:0,lifeGeneration:s.lifeGeneration,teleportSequence:s.teleportSequence},resolve));});expect(spectatorShot.ok).toBe(false);
  const position={x:c.state.x,y:c.state.y};await late.keyboard.down('d');await late.keyboard.down('Space');await late.waitForTimeout(lag?400:80);await frame();expect({x:c.state.x,y:c.state.y}).toEqual(position);expect(room.projectiles.size).toBe(0);await late.keyboard.up('d');await late.keyboard.up('Space');
  applyDamage(b,150,{type:'PLAYER',playerId:a.state.id});await frame();const result=structuredClone(room.match.result);
  await expect(page.locator('#match-result')).toHaveText('VICTORY');for(const p of [peer,late])await expect(p.locator('#match-result')).toHaveText('Alpha WINS');
  expect(b.respawnAtMs).toBe(null);expect(applyDamage(a,150,{type:'PLAYER',playerId:b.state.id})).toBe(null);
  await page.keyboard.down('Space');await peer.keyboard.down('Space');await page.waitForTimeout(lag?400:80);await frame();expect(room.projectiles.size).toBe(0);expect(a.state.health).toBe(100);expect(room.match.result).toEqual(result);await page.keyboard.up('Space');await peer.keyboard.up('Space');
  await advance(178);await frame();expect(room.match.state).toBe('waiting');expect(room.match.round).toBe(1);expect(room.match.roster).toEqual([]);
  for(const p of clients){await expect(p.locator('#match-overlay')).toBeHidden();await expect(p.locator('#hud-ammo')).toHaveText('AMMO 12 / 12');await expect(p.locator('#hud-alien')).toBeHidden();expect(await p.locator('#alien-message').isHidden()).toBe(true);}
  for(const p of room.players.values()){expect(p.state.status).toBe('ALIVE');expect(p.state.health).toBe(100);expect(p.state.shield).toBe(50);expect(p.humanEliminated).toBe(false);expect(p.state.spawnInvulnerabilityRemainingMs).toBe(0);expect(p.state.lastMeleeDamage).toBe(0);}
  await page.locator('#start-match').click();await expect.poll(()=>room.match.state).toBe('active');await frame();expect(room.match.round).toBe(2);expect(room.match.roster).toHaveLength(3);
  // Opposite winner in round two; all deaths belong to this simulation batch.
  applyDamage(a,150,{type:'PLAYER',playerId:b.state.id});applyDamage(c,150,{type:'PLAYER',playerId:b.state.id});await frame();
  await expect(peer.locator('#match-result')).toHaveText('VICTORY');await expect(page.locator('#match-result')).toHaveText('Beta WINS');
  await advance(179);await frame();expect(room.match.state).toBe('waiting');await page.locator('#start-match').click();await expect.poll(()=>room.match.state).toBe('active');await frame();expect(room.match.round).toBe(3);
  // Real accepted reciprocal projectiles, not a client winner or draw command.
  Object.assign(a.state,{x:200,y:1800,health:25,shield:0});Object.assign(b.state,{x:270,y:1800,health:25,shield:0});
  applyDamage(c,150,{type:'ENVIRONMENT',cause:'HAZARD'});
  for(const [p,aim] of [[a,0],[b,Math.PI]] as const)expect(fire(room,p,{sequence:500,aim,lifeGeneration:p.state.lifeGeneration,teleportSequence:p.state.teleportSequence},tick).ok).toBe(true);
  await frame();expect(room.match.result).toEqual({kind:'draw'});for(const p of clients)await expect(p.locator('#match-result')).toHaveText('DRAW');
  await advance(179);await frame();expect(room.match.state).toBe('waiting');await page.locator('#start-match').click();await expect.poll(()=>room.match.state).toBe('active');await frame();expect(room.match.round).toBe(4);
  await late.evaluate(()=>new Promise<void>(resolve=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.emit('leaveRoom',resolve)));clients=[page,peer];
  expect(room.match.state).toBe('active');
  await peer.evaluate(()=>new Promise<void>(resolve=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.emit('leaveRoom',resolve)));clients=[page];await frame();
  await expect(page.locator('#match-result')).toHaveText('VICTORY');const locked=structuredClone(room.match.result);
  // Late ended join gets the existing locked result; winner departure never rewrites it.
  await late.close();const watcher=await context.newPage();await configure(watcher,'Watcher');await watcher.locator('#room-code').fill(code);await watcher.locator('#join').click();await expect(watcher.locator('canvas')).toBeVisible();clients.push(watcher);await frame();
  await expect(watcher.locator('#match-result')).toHaveText('Alpha WINS');
  await page.evaluate(()=>new Promise<void>(resolve=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.emit('leaveRoom',resolve)));clients=[watcher];expect(room.match.result).toEqual(locked);
  await advance(177);await frame();expect(room.match.state).toBe('waiting');expect(room.match.result).toBe(null);await expect(watcher.locator('#match-overlay')).toBeHidden();await expect(watcher.locator('#match-status')).toHaveText('Waiting for host start');
  expect(errors).toEqual([]);await watcher.close();
 }finally{await Promise.all([page,peer,late].map(p=>p.close()));await server.close();}
});
