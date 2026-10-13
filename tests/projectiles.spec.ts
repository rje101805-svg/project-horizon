import {startActiveFixture,replayFixture} from './active-fixture';
import { test, expect } from '@playwright/test';
import { createGameServer } from '../server/game';
import { RoomStore } from '../server/rooms';
import type { FlightConnection } from '../src/network';
type DebugWindow=Window & {__HORIZON_FLIGHT__:FlightConnection};
test('two browsers hold fire through authoritative cooldown, receive bullets/damage, auto-reload and gated DEV refill', async({page,context})=>{
  const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store,{autoTick:false,combatDebug:true});
  await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));
  const address=server.http.address();if(!address || typeof address==='string')throw new Error('Missing server');
  const peer=await context.newPage(),keeper=await context.newPage();let tick=0;
  const frame=async(n=1)=>{
    await page.evaluate(()=>new Promise<void>((resolve,reject)=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.timeout(1000).emit('latencyProbe',e=>e?reject(e):resolve())));
    for(let i=0;i<n-1;i++){server.step();tick++;await new Promise<void>(resolve=>setImmediate(resolve));}
    server.step();tick++;
    await expect.poll(()=>page.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.tick)).toBe(tick);
  };
  try{
    for(const p of [page,peer,keeper]){await p.goto('/?devrooms=1');await p.locator('#server-url').fill(`http://127.0.0.1:${address.port}`);}
    await page.locator('#create').click();await expect(page.locator('canvas')).toBeVisible();
    const code=(await page.locator('#room-code-display').textContent())!;
    await peer.locator('#room-code').fill(code);await peer.locator('#join').click();await expect(peer.locator('canvas')).toBeVisible();
    // Keep a second surviving human so target elimination does not end this
    // active-round magazine/reload regression test.
    await keeper.locator('#room-code').fill(code);await keeper.locator('#join').click();await expect(keeper.locator('canvas')).toBeVisible();
    const id=await page.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.id);
    const room=store.rooms.get(code)!,a=room.players.get(id!)!,b=[...room.players.values()].find(p=>p!==a)!;
    startActiveFixture(room,room.match.hostId!,{round:room.match.round});
    Object.assign([...room.players.values()].find(p=>p!==a && p!==b)!.state,{x:200,y:1800,vx:0,vy:0});
    Object.assign(a.state,{x:1370,y:1200,vx:0,vy:0});Object.assign(b.state,{x:1600,y:1200,vx:0,vy:0});for(const p of room.players.values())p.state.teleportSequence++;await frame();await page.bringToFront();await page.keyboard.press('F3');
    // Aim through the actual canvas pointer pipeline after the active teleport.
    const target=await page.evaluate(id=>{const w=window as unknown as DebugWindow,c=w.__HORIZON_FLIGHT__,s=(w as unknown as {__HORIZON_GAME__:{scene:{scenes:{cameras:{main:{scrollX:number;scrollY:number;zoom:number}}}[]};canvas:HTMLCanvasElement;scale:{width:number;height:number}}}).__HORIZON_GAME__,camera=s.scene.scenes[0].cameras.main,rect=s.canvas.getBoundingClientRect(),p=c.latest!.players.find(p=>p.id===id)!;return {x:rect.left+(p.x-camera.scrollX)*camera.zoom*rect.width/s.scale.width,y:rect.top+(p.y-camera.scrollY)*camera.zoom*rect.height/s.scale.height};},b.state.id);await page.mouse.move(target.x,target.y);
    await page.keyboard.down('Space');await expect.poll(()=>a.state.ammo).toBe(29);await frame();
    await expect.poll(()=>peer.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.projectiles.length)).toBe(1);
    await frame(12);
    await expect.poll(()=>b.state.shield).toBe(100-40.5);
    // Batch controlled ticks, then wait for the final snapshot. Do not pay a
    // browser-poll round trip per tick of the new 30-round / 69-tick loadout.
    await expect.poll(async()=>{await frame(6);return a.state.ammo;},{timeout:15000,intervals:[20]}).toBe(0);
    await page.keyboard.up('Space');await frame();const consumed=a.lastFireSequence;
    await page.keyboard.down('Space');await frame(12);await page.keyboard.up('Space');
    await expect.poll(()=>page.evaluate(()=>(window as unknown as {__HORIZON_FLIGHT__:{firing:boolean}}).__HORIZON_FLIGHT__.firing)).toBe(false);
    expect(a.state.ammo).toBe(0);expect(a.lastFireSequence).toBe(consumed);
    await expect(page.locator('#debug-weapon')).toContainText('ammo 0 / 30');
    expect(a.state.isReloading).toBe(true);
    await frame(69);
    expect(a.state.isReloading).toBe(false);
    await page.locator('[data-combat-action="refill"]').click();await expect(page.locator('#combat-debug-result')).toHaveText('Combat debug: refill');await frame();
    await expect(page.locator('#hud-ammo')).toHaveText('AMMO 30 / 30');
    expect(b.state.status).toBe('ALIEN');expect(b.state.kills).toBe(0);
    await expect.poll(()=>peer.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.players.find(p=>p.id!==(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.id)?.ammo)).toBe(30);
    await expect.poll(()=>peer.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.players.find(p=>p.id===(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.id)?.health)).toBe(b.state.health);
  }finally{await keeper.close();await peer.close();await page.close();await server.close();}
});
