import { test, expect, type Page } from '@playwright/test';
import { createGameServer } from '../server/game';
import { RoomStore } from '../server/rooms';
import { applyDamage } from '../server/combat';
import type { FlightConnection } from '../src/network';
type DebugWindow=Window & {__HORIZON_FLIGHT__:FlightConnection;__HORIZON_GAME__:{scene:{scenes:{spectatedId:string|null;rocket:{x:number;y:number};ships:Map<string,{body:{x:number;y:number}}> ;cameras:{main:{worldView:{contains(x:number,y:number):boolean}}}}[]}}};
test('late spectator follows rendered roster players, replaces unavailable target, then becomes a waiting human',async({page,context})=>{
 test.setTimeout(60000);const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store,{autoTick:false});
 await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));const address=server.http.address();if(!address||typeof address==='string')throw Error('No server');
 const peer=await context.newPage(),keeper=await context.newPage(),spectator=await context.newPage();let pages=[page,peer,keeper],tick=0;
 const frame=async()=>{await Promise.all(pages.map(p=>p.evaluate(()=>new Promise<void>(resolve=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.emit('latencyProbe',resolve)))));server.step();tick++;await Promise.all(pages.map(p=>expect.poll(()=>p.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.tick)).toBe(tick)));};
 const configure=async(p:Page)=>{await p.goto('/');await p.locator('#server-url').fill(`http://127.0.0.1:${address.port}`);};
 const camera=(p:Page)=>p.evaluate(()=>{const s=(window as unknown as DebugWindow).__HORIZON_GAME__.scene.scenes[0],body=s.spectatedId&&s.ships.get(s.spectatedId)?.body;return {id:s.spectatedId,following:!!body&&s.rocket.x===body.x&&s.rocket.y===body.y,visible:!!body&&s.cameras.main.worldView.contains(body.x,body.y)};});
 try{
  for(const p of [...pages,spectator])await configure(p);
  await page.locator('#create').click();await expect(page.locator('canvas')).toBeVisible();const code=(await page.locator('#room-code-display').textContent())!;
  for(const p of [peer,keeper]){await p.locator('#room-code').fill(code);await p.locator('#join').click();await expect(p.locator('canvas')).toBeVisible();}
  await frame();const room=store.rooms.get(code)!,[a,b,d]=[...room.players.values()];expect(room.match.state).toBe('waiting');await page.locator('#start-match').click();await expect.poll(()=>room.match.state).toBe('active');await frame();
  await spectator.locator('#room-code').fill(code);await spectator.locator('#join').click();await expect(spectator.locator('canvas')).toBeVisible();pages.push(spectator);await frame();const c=[...room.players.values()].find(p=>p!==a&&p!==b&&p!==d)!;
  await expect(spectator.locator('#match-status')).toHaveText('SPECTATING · JOINS NEXT ROUND');expect(room.match.roster).not.toContain(c.state.id);expect(c.gameplayEnabled).toBe(false);
  Object.assign(a.state,{x:500,y:1800,vx:0,vy:0});a.state.teleportSequence++;await frame();
  await expect.poll(()=>camera(spectator)).toEqual({id:a.state.id,following:true,visible:true});
  applyDamage(a,150,{type:'ENVIRONMENT',cause:'HAZARD'});await frame();expect(room.match.state).toBe('active');
  await expect.poll(()=>camera(spectator)).toEqual({id:b.state.id,following:true,visible:true});
  await page.evaluate(()=>new Promise<void>(resolve=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.emit('leaveRoom',resolve)));pages=[peer,keeper,spectator];expect(room.match.hostId).toBe(b.state.id);await frame();
  applyDamage(d,150,{type:'PLAYER',playerId:b.state.id});await frame();expect(room.match.state).toBe('ended');await expect(spectator.locator('#match-overlay')).toBeVisible();await expect.poll(()=>camera(spectator).then(v=>v.id)).toBe(null);
  for(let i=0;i<179;i++){server.step();tick++;await new Promise<void>(resolve=>setImmediate(resolve));}await frame();expect(room.match.state).toBe('waiting');expect(c.state.status).toBe('ALIVE');await expect(spectator.locator('#lobby-status')).toHaveText('WAITING FOR HOST');await expect(peer.locator('#start-match')).toBeEnabled();
  await expect.poll(()=>spectator.evaluate(()=>{const w=window as unknown as DebugWindow,s=w.__HORIZON_GAME__.scene.scenes[0];return {id:s.spectatedId,own:s.ships.has(w.__HORIZON_FLIGHT__.socket.id!)};})).toEqual({id:null,own:true});
  await peer.locator('#start-match').click();await expect.poll(()=>room.match.state).toBe('active');await frame();expect(room.match.roster).toContain(c.state.id);
  await expect(page.locator('footer')).toContainText('Phase 2 · Step 7: match lifecycle');await expect(spectator.locator('#debug-network')).toBeVisible();await expect(spectator.locator('#debug-overlay')).toBeHidden();await expect(spectator.locator('#fake-network-status')).toHaveText('Fake network OFF');await spectator.locator('#fake-lag').check();await expect(spectator.locator('#fake-network-status')).toContainText('ON · 150ms each way ±30ms jitter');await spectator.locator('#fake-lag').uncheck();await expect(spectator.locator('#fake-network-status')).toHaveText('Fake network OFF');
 }finally{await Promise.all([page,peer,keeper,spectator].map(p=>p.close()));await server.close();}
});
