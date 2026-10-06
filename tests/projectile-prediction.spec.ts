import {test,expect} from '@playwright/test';
import {createGameServer} from '../server/game';
import {RoomStore} from '../server/rooms';
import type {FlightConnection} from '../src/network';
import type {ProjectileView} from '../src/projectile-view';
type DebugWindow=Window & {__HORIZON_FLIGHT__:FlightConnection;__HORIZON_GAME__:{scene:{scenes:{projectileView:ProjectileView}[]}}};
test('local predicted bullet precedes delayed acceptance, replaces without duplicate, and rejected shot disappears',async({page})=>{
 const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store,{autoTick:false});
 await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));const address=server.http.address();if(!address || typeof address==='string')throw new Error('Missing server');
 const pending=()=>page.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.projectilePrediction.count(performance.now()));
 let tick=0;
 const frame=async()=>{
  await page.evaluate(()=>new Promise<void>((resolve,reject)=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.timeout(1000).emit('latencyProbe',e=>e?reject(e):resolve())));
  server.step();tick++;await expect.poll(()=>page.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.tick)).toBe(tick);
 };
 try{
  await page.goto('/');await page.locator('#server-url').fill(`http://127.0.0.1:${address.port}`);await page.locator('#create').click();await expect(page.locator('canvas')).toBeVisible();await frame();
  const id=await page.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.id);
  const room=store.roomFor(id!)!,p=room.players.get(id!)!;
  await page.locator('#fake-jitter').uncheck();await page.locator('#fake-lag').check();await frame();
  await page.keyboard.down('Space');await expect.poll(pending,{intervals:[5,10,20]}).toBe(1);
  // The visual exists before the delayed request reaches the server, and resources are unchanged.
  expect(room.projectiles.size).toBe(0);expect(p.state.ammo).toBe(12);expect(p.state.health).toBe(100);
  await page.keyboard.up('Space');await expect.poll(()=>room.projectiles.size).toBe(1);await frame();await expect.poll(pending).toBe(0);
  const visuals=await page.evaluate(()=>{
   const w=window as unknown as DebugWindow;return w.__HORIZON_FLIGHT__.projectilePrediction.render(w.__HORIZON_GAME__.scene.scenes[0].projectileView.sample(performance.now()),performance.now());
  });expect(visuals).toHaveLength(1);expect(visuals[0].id.startsWith('predicted:')).toBe(false);
  // Trusted server fixture creates a rejection while the client's last snapshot still has ammo.
  p.state.ammo=0;await page.keyboard.down('Space');await expect.poll(pending,{intervals:[5,10,20]}).toBe(1);await page.keyboard.up('Space');
  await expect.poll(()=>p.lastFireSequence).toBe(2);await expect.poll(pending).toBe(0);
  expect(room.projectiles.size).toBe(1);expect(p.state.ammo).toBe(0);expect(p.state.health).toBe(100);
  await page.locator('#leave').click();await expect(page.locator('#home')).toBeVisible();
  expect(await pending()).toBe(0);
 }finally{await page.close();await server.close();}
});
