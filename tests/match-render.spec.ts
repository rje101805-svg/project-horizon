import { test, expect, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import { createGameServer } from '../server/game';
import { RoomStore } from '../server/rooms';
import { applyDamage } from '../server/combat';
import { ALIEN_OPACITY } from '../shared/alien';
import type { FlightConnection } from '../src/network';
type Ship = {body:Phaser.GameObjects.Container; hull:Phaser.GameObjects.Graphics; sprite:Phaser.GameObjects.Image; label:Phaser.GameObjects.Text; alien:boolean};
type DebugWindow = Window & {__HORIZON_FLIGHT__:FlightConnection;__HORIZON_GAME__:{scene:{scenes:{ships:Map<string,Ship>}[]}}};
const ships=(page:Page)=>page.evaluate(()=>[...(window as unknown as DebugWindow).__HORIZON_GAME__.scene.scenes[0].ships].map(([id,s])=>({id,alien:s.alien,alpha:s.body.alpha,hullAlpha:s.hull.alpha,spriteVisible:s.sprite.visible,texture:s.sprite.texture.key,label:s.label.text,commands:[...s.hull.commandBuffer]})).sort((a,b)=>a.id.localeCompare(b.id)));
for(const lag of [false,true])test(`round reset redraws former aliens as humans locally and remotely (${lag?'150ms+jitter':'normal'})`,async({page,context})=>{
 test.setTimeout(60000);
 const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store,{autoTick:false});
 await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));const address=server.http.address();if(!address||typeof address==='string')throw Error('Missing server');
 const peer=await context.newPage(),pages=[page,peer],errors:string[]=[];let tick=0;
 const frame=async()=>{await Promise.all(pages.map(p=>p.evaluate(()=>new Promise<void>(resolve=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.emit('latencyProbe',resolve)))));server.step();tick++;await Promise.all(pages.map(p=>expect.poll(()=>p.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.tick)).toBe(tick)));};
 try{
  for(const [p,name] of [[page,'Alpha'],[peer,'Beta']] as const){p.on('pageerror',e=>errors.push(e.message));await p.goto('/');await p.locator('#server-url').fill(`http://127.0.0.1:${address.port}`);await p.locator('#display-name').fill(name);}
  await page.locator('#create').click();await expect(page.locator('canvas')).toBeVisible();const code=(await page.locator('#room-code-display').textContent())!;
  await peer.locator('#room-code').fill(code);await peer.locator('#join').click();await expect(peer.locator('canvas')).toBeVisible();await frame();
  const room=store.rooms.get(code)!,[a,b]=[...room.players.values()];expect(room.match.state).toBe('waiting');await page.locator('#start-match').click();await expect.poll(()=>room.match.state).toBe('active');await frame();
  await Promise.all(pages.map(p=>expect.poll(()=>ships(p)).toHaveLength(2)));
  const originals=await ships(page),humanCommands=new Map(originals.map(s=>[s.id,s.commands]));
  if(lag)for(const p of pages){await p.bringToFront();await p.keyboard.press('F3');await p.locator('#fake-lag').check();await p.keyboard.press('F3');}
  for(const [winner,loser,loserPage] of [[a,b,peer],[b,a,page]] as const){
   // Central server damage supplies the same elimination path as accepted gun hits.
   expect(applyDamage(loser,150,{type:'PLAYER',playerId:winner.state.id})?.depleted).toBe(true);await frame();
   expect(room.match.result).toEqual({kind:'winner',winnerId:winner.state.id,winnerName:winner.state.name});
   for(const p of pages)await expect.poll(async()=>{const s=(await ships(p)).find(s=>s.id===loser.state.id)!;return {alien:s.alien,alpha:s.alpha,tag:s.label.includes('ALIEN'),ghost:s.commands.toString()!==humanCommands.get(s.id)!.toString(),spriteVisible:s.spriteVisible};}).toEqual({alien:true,alpha:ALIEN_OPACITY,tag:true,ghost:true,spriteVisible:false});
   const round=room.match.round;
   for(let i=0;i<179;i++){server.step();tick++;await new Promise<void>(resolve=>setImmediate(resolve));}
   await frame();expect(room.match.round).toBe(round);expect(room.match.state).toBe('waiting');
   for(const p of pages){
    await expect.poll(async()=>(await ships(p)).map(s=>({id:s.id,alien:s.alien,alpha:s.alpha,hullAlpha:s.hullAlpha,tag:s.label.includes('ALIEN'),spriteVisible:s.spriteVisible,texture:s.texture,humanHull:JSON.stringify(s.commands)===JSON.stringify(humanCommands.get(s.id))}))).toEqual(originals.map(s=>({id:s.id,alien:false,alpha:1,hullAlpha:1,tag:false,spriteVisible:true,texture:s.texture,humanHull:true})));
    expect(await p.locator('#alien-message').isHidden()).toBe(true);await expect(p.locator('#hud-alien')).toBeHidden();await expect(p.locator('#hud-ammo')).toHaveText('AMMO 12 / 12');await expect(p.locator('#hud-health-value')).toHaveText('100 / 100');await expect(p.locator('#hud-shield')).toHaveText('SHIELD 50 / 50');
   }
   for(const player of [a,b]){expect(player.state.status).toBe('ALIVE');expect(player.state.health).toBe(100);expect(player.state.shield).toBe(50);expect(player.state.ammo).toBe(12);}
   await page.locator('#start-match').click();await expect.poll(()=>room.match.state).toBe('active');await frame();expect(room.match.round).toBe(round+1);
   // Send through the real client fire-intent/prediction/network pipeline once.
   const sequence=loser.lastFireSequence+1;
   await loserPage.evaluate(()=>{const c=(window as unknown as DebugWindow).__HORIZON_FLIGHT__,f=c as unknown as {attemptFire(now:number):void};c.setFireIntent(true,Math.PI/2);f.attemptFire(performance.now());c.setFireIntent(false,0);});
   await expect.poll(()=>loser.lastFireSequence).toBe(sequence);expect(loser.state.ammo).toBe(11);expect([...room.projectiles.values()].some(p=>p.ownerId===loser.state.id&&p.shotSequence===sequence)).toBe(true);await frame();
  }
  expect(errors).toEqual([]);
 }finally{await peer.close();await page.close();await server.close();}
});
