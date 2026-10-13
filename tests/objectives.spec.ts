import {startActiveFixture,replayFixture} from './active-fixture';
import {test,expect} from '@playwright/test';
import {RoomStore,type RoomPlayer} from '../server/rooms';
import {createGameServer} from '../server/game';
import {applyDamage} from '../server/combat';
import {objectiveState} from '../server/objectives';
import {PLANET_REGIONS} from '../shared/planets';
import {TICK_MS} from '../shared/flight';
import {GOLD_COLOR} from '../src/objective-visuals';
test('three clients capture, contest, steal, fire, drop and recover Gold with authoritative UI in both qualities',async({page,context})=>{
 // Three cold planet/ship scenes and several hundred controlled server ticks.
 test.setTimeout(90000);
 const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store,{autoTick:false});await new Promise<void>(r=>server.http.listen(0,'127.0.0.1',r));const address=server.http.address();if(!address||typeof address==='string')throw Error('port');
 const peer=await context.newPage(),third=await context.newPage(),pages=[page,peer,third],errors:string[]=[];let tick=0;
 const frame=async(n=1)=>{for(let i=0;i<n-1;i++){server.step();tick++;await new Promise<void>(r=>setImmediate(r));}await page.evaluate(()=>new Promise<void>(r=>(window as any).__HORIZON_FLIGHT__.socket.emit('latencyProbe',r)));server.step();tick++;for(const p of pages)await expect.poll(()=>p.evaluate(()=>(window as any).__HORIZON_FLIGHT__.latest?.tick)).toBe(tick);};
 const teleport=(p:RoomPlayer,x:number,y:number)=>{Object.assign(p.state,{x,y,vx:0,vy:0});p.state.teleportSequence++;};
 try{
  for(const [i,p]of pages.entries()){p.on('pageerror',e=>errors.push(e.message));await p.goto('/?devrooms=1');await p.locator('#display-name').fill(['Redline','Blue','Third'][i]);await p.locator('#server-url').fill(`http://127.0.0.1:${address.port}`);}
  await page.locator('#create').click();await expect(page.locator('canvas')).toBeVisible();const code=(await page.locator('#room-code-display').textContent())!;
  for(const p of [peer,third]){await p.locator('#room-code').fill(code);await p.locator('#join').click();await expect(p.locator('canvas')).toBeVisible();}await frame();
  startActiveFixture(store.rooms.get(code)!,store.rooms.get(code)!.match.hostId!,{round:store.rooms.get(code)!.match.round});
  const room=store.rooms.get(code)!,[a,b,c]=[...room.players.values()],planet=PLANET_REGIONS[0],record=objectiveState(room).planets[0];teleport(a,planet.x,planet.y);teleport(b,400,1800);teleport(c,700,1800);
  await frame(150);await expect(page.locator('#capture-hud')).toBeVisible();await expect(page.locator('#capture-description')).toContainText('5.0 / 10 seconds');for(const p of pages)await expect(p.locator('#objective-feed')).toContainText('REDLINE IS CAPTURING BOREALIS');
  teleport(a,planet.x+record.planet.captureRadius+100,planet.y);await frame(30);await expect(page.locator('#capture-description')).toContainText('PROGRESS DECAYING');expect(record.ticks.get(a.state.id)).toBe(90);
  teleport(a,planet.x,planet.y);await frame();expect(record.ticks.get(a.state.id)).toBe(91);teleport(b,planet.x+100,planet.y);await frame(30);await expect(page.locator('#capture-description')).toContainText('CONTESTED — CAPTURE PAUSED');expect(record.ticks.get(a.state.id)).toBe(91);
  applyDamage(a,25,{type:'PLAYER',playerId:b.state.id},room.simulationTimeMs);teleport(b,400,1800);await frame(209);const gun=[...objectiveState(room).pickups.values()][0];expect(gun).toBeTruthy();expect(a.state.goldGunId).toBeNull();expect(Math.hypot(gun.x-a.state.x,gun.y-a.state.y)).toBeGreaterThan(45);
  for(const p of pages)await expect(p.locator('#objective-feed')).toContainText('REDLINE CAPTURED BOREALIS');await expect(page.locator('#capture-description')).toContainText('CAPTURE COMPLETE');
  await expect.poll(()=>page.evaluate(color=>(window as any).__HORIZON_GAME__.scene.scenes[0].objectives.rings.commandBuffer.includes(color),GOLD_COLOR)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return s.children.list.filter((o:any)=>o.name?.startsWith('objective-arrow-')&&o.visible).map((o:any)=>o.text);})).toContain('CRYO STREAM');
  await page.evaluate(point=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];s.inspectionPoint={x:point.x-200,y:point.y};},gun);
  await expect.poll(()=>page.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return s.children.list.filter((o:any)=>o.name?.startsWith('objective-arrow-')&&o.visible&&o.text==='CRYO STREAM').length;})).toBe(0);
  await page.locator('canvas').screenshot({path:'test-results/p3s3-materialization.png'});
  await page.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];s.inspectionPoint=null;s.cameras.main.centerOn(s.rocket.x,s.rocket.y);});
  teleport(b,gun.x,gun.y);await frame();await peer.keyboard.press('KeyF');await expect.poll(()=>b.state.goldGunId).toBe(gun.id);await frame();expect(b.state.goldGunId).toBe(gun.id);expect(objectiveState(room).pickups.size).toBe(0);for(const p of pages)await expect(p.locator('#objective-feed')).toContainText('BLUE CLAIMED CRYO STREAM');await expect(peer.locator('#hud-ammo')).toHaveText('CRYO STREAM · ∞ AMMO');
  b.state.ammo=0;teleport(b,6000,6000);await frame();await peer.keyboard.press('r');expect(b.state.isReloading).toBe(false);await peer.keyboard.down('Space');await expect.poll(()=>[...room.projectiles.values()].filter(p=>p.ownerId===b.state.id&&p.weapon==='gold').length).toBeGreaterThan(0);await peer.keyboard.up('Space');await frame();expect(b.state.ammo).toBe(0);expect(b.state.isReloading).toBe(false);expect([...room.projectiles.values()].filter(p=>p.weapon==='gold').every(p=>p.damage===13)).toBe(true);
  teleport(a,PLANET_REGIONS[1].x,PLANET_REGIONS[1].y);await frame();
  const labels=()=>peer.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return s.children.list.filter((o:any)=>o.name?.startsWith('objective-arrow-')&&o.visible).map((o:any)=>o.text);});await expect.poll(labels).toContain('CAPTURE Cinder');
  await peer.keyboard.press('F3');for(const quality of ['standard','low']){await peer.locator('#visual-quality').selectOption(quality);await expect.poll(()=>peer.evaluate(color=>(window as any).__HORIZON_GAME__.scene.scenes[0].objectives.gold.commandBuffer.includes(color),GOLD_COLOR)).toBe(true);await peer.locator('canvas').screenshot({path:`test-results/p3s3-gold-${quality}.png`});}
  applyDamage(b,999,{type:'PLAYER',playerId:a.state.id},room.simulationTimeMs);await frame();expect(b.state.goldGunId).toBeNull();expect(b.state.status).toBe('ALIEN');expect([...objectiveState(room).pickups.values()][0].source).toBe('drop');for(const p of pages)await expect(p.locator('#objective-feed')).toContainText('CRYO STREAM HAS DROPPED');
  await expect.poll(()=>page.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return s.children.list.filter((o:any)=>o.name?.startsWith('objective-arrow-')&&o.visible).map((o:any)=>o.text);})).toContain('DROPPED CRYO STREAM');
  teleport(c,6000,6000);await frame();await third.keyboard.press('KeyF');await expect.poll(()=>c.state.goldGunId).toBe(gun.id);await frame();expect(c.state.goldGunId).toBe(gun.id);expect(objectiveState(room).pickups.size).toBe(0);await expect(third.locator('#hud-ammo')).toHaveText('CRYO STREAM · ∞ AMMO');
  applyDamage(a,999,{type:'PLAYER',playerId:c.state.id},room.simulationTimeMs);await frame();expect(room.match.state).toBe('ended');await frame(180);expect(room.match.state).toBe('ended');await page.locator('#play-again').click();await frame();expect(room.match.state).toBe('waiting');expect(objectiveState(room).pickups.size).toBe(0);expect(objectiveState(room).planets.every(r=>r.completed.size===0)).toBe(true);for(const p of pages){await expect(p.locator('#objective-feed')).toBeHidden();await expect(p.locator('#capture-hud')).toBeHidden();await expect(p.locator('#hud-ammo')).toHaveText('AMMO 30 / 30');}
  for(const p of pages)await p.getByRole('button',{name:'Back to home'}).click();await page.locator('#create').click();await expect(page.locator('canvas')).toBeVisible();expect(await page.evaluate(()=>(window as any).__HORIZON_GAME__.scene.scenes[0].children.list.filter((o:any)=>o.name?.startsWith('objective-arrow-')).length)).toBe(8);
  expect(errors).toEqual([]);expect(TICK_MS).toBeGreaterThan(0);
 }finally{for(const p of pages)await p.close();await server.close();}
});

import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
import {startMatch} from '../server/match';
import {roomChannel} from '../server/rooms';
test('WebGL shows premium ownership, rings and arrows in Standard and Low without GPU errors',async()=>{
 const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store,{autoTick:false});await new Promise<void>(r=>server.http.listen(0,'127.0.0.1',r));const address=server.http.address();if(!address||typeof address==='string')throw Error('port');
 const browser=await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage(),errors:string[]=[];let tick=0;
 const frame=async(n=1)=>{for(let i=0;i<n-1;i++){server.step();tick++;await new Promise<void>(r=>setImmediate(r));}await page.evaluate(()=>new Promise<void>(r=>(window as any).__HORIZON_FLIGHT__.socket.emit('latencyProbe',r)));server.step();tick++;await expect.poll(()=>page.evaluate(()=>(window as any).__HORIZON_FLIGHT__.latest?.tick)).toBe(tick);};
 try{
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const link=document.createElement('link');link.rel='icon';link.href='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E';document.head.append(link);},{once:true}));
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('http://127.0.0.1:5175/?devrooms=1');await page.locator('#server-url').fill(`http://127.0.0.1:${address.port}`);await page.locator('#create').click();await expect(page.locator('canvas')).toBeVisible({timeout:15000});const room=[...store.rooms.values()][0],hero=[...room.players.values()][0];store.join('other',room.code,'Other',0);store.join('third',room.code,'Third',0);startActiveFixture(room,hero.state.id,{round:0});server.io.to(roomChannel(room.code)).emit('roomState',store.info(room));
  const planet=PLANET_REGIONS[0];Object.assign(hero.state,{x:planet.x,y:planet.y});hero.state.teleportSequence++;await frame(300);const gun=[...objectiveState(room).pickups.values()][0];expect(gun).toBeTruthy();Object.assign(hero.state,{x:gun.x,y:gun.y});hero.state.teleportSequence++;await frame();await page.keyboard.press('KeyF');await expect.poll(()=>hero.state.goldGunId).toBe(gun.id);await frame();await expect(page.locator('#hud-ammo')).toHaveText('CRYO STREAM · ∞ AMMO');
  const other=room.players.get('other')!;Object.assign(other.state,{x:PLANET_REGIONS[1].x,y:PLANET_REGIONS[1].y});other.state.teleportSequence++;await frame();await page.keyboard.press('F3');
  for(const quality of ['standard','low']){await page.locator('#visual-quality').selectOption(quality);await expect.poll(()=>page.evaluate(color=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return s.objectives.gold.commandBuffer.includes(color)&&s.children.list.some((o:any)=>o.name?.startsWith('objective-arrow-')&&o.visible);},GOLD_COLOR)).toBe(true);await page.locator('canvas').screenshot({path:`test-results/p3s3-webgl-${quality}.png`});}
  expect(await page.evaluate(()=>(window as any).__HORIZON_GAME__.renderer.gl.getError())).toBe(0);expect(errors).toEqual([]);
 }finally{await page.close();await browser.close();await server.close();}
});
