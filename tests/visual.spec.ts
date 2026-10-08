import { test, expect, chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
test('WebGL sphere initializes and Canvas fallback remains visible without gameplay errors', async ({ page }) => {
 test.setTimeout(90000);
 const browser=await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 const gpu=await browser.newPage();
 try{for(const [p,webgl] of [[page,false],[gpu,true]] as const){
  const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:5175');await p.locator('#server-url').fill('http://127.0.0.1:3002');const started=Date.now();await p.getByRole('button',{name:'Create room',exact:true}).click();
  // Software-GPU cold bakes can exceed five seconds; match the solar fixture's
  // bounded readiness budget without changing any rendering assertions.
  await expect(p.locator('canvas')).toBeVisible({timeout:15000});console.log('P3S2.6 visual cold readiness ms',webgl?'SwiftShader':'Canvas',Date.now()-started);
  await expect.poll(()=>p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return !!s.celestial?.fallback;})).toBe(true);
  expect(await p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return !!s.celestial.shader;})).toBe(webgl);
  if(!webgl){
   expect(await p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return {quality:s.visualIntensity.quality,camera:s.visualIntensity.camera};})).toEqual({quality:'low',camera:false});
   // Exercise sparse-copy protection even when the full Canvas tier is requested.
   await p.keyboard.press('F3');await expect(p.locator('#visual-controls')).toBeVisible();await p.locator('#visual-quality').selectOption('standard');await p.keyboard.press('F3');
   const result=await p.evaluate(()=>new Promise<{copies:number;geometry:number;specks:number;bakes:number}>(resolve=>{
    const game=(window as any).__HORIZON_GAME__,scene=game.scene.scenes[0];
    const texture=game.textures.get('ice-prototype'),refresh=texture.refresh;let bakes=0;
    texture.refresh=function(){bakes++;return refresh.call(this);};
    const sparse=new Set(scene.deepSpace.layers.filter((l:any)=>l.depth===-29||l.depth===8).map((l:any)=>l.canvas));
    const proto=CanvasRenderingContext2D.prototype,draw=proto.drawImage,fill=proto.fillRect;let copies=0,frames=0,specks=0;
    proto.drawImage=function(this:CanvasRenderingContext2D,image:CanvasImageSource,...coords:number[]){if(sparse.has(image))copies++;Reflect.apply(draw,this,[image,...coords]);};
    proto.fillRect=function(...args:Parameters<typeof fill>){if(['#b9c6d4','#aebfd5','#d0ccc2','#bfb5a1'].includes(this.fillStyle as string))specks++;return fill.apply(this,args);};
    const done=()=>{if(++frames===6){game.events.off('postrender',done);proto.drawImage=draw;proto.fillRect=fill;texture.refresh=refresh;resolve({copies,geometry:scene.deepSpace.canvasGeometry.length,specks,bakes});}};
    game.events.on('postrender',done);
   }));
   expect(result.copies).toBe(0);expect(result.geometry).toBe(2);expect(result.specks).toBeGreaterThan(0);expect(result.bakes).toBe(0);
  }
  await p.keyboard.press('F3');await expect(p.locator('#visual-controls')).toBeVisible();await p.locator('#visual-planet').click();
  await expect.poll(()=>p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return s.celestial.shader?.visible??s.celestial.fallback.visible;})).toBe(true);
  if(webgl)await p.locator('canvas').screenshot({path:'/tmp/p3s1-planet.png'});
  await p.locator('#visual-horizon').click();
  await expect.poll(()=>p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return !!s.previewHorizon?.core.visible;})).toBe(true);
  expect(await p.evaluate(()=>!!(window as any).__HORIZON_GAME__.scene.scenes[0].previewHorizon.lens)).toBe(webgl);
  await p.locator('#visual-intensity').fill('1');
  await expect.poll(()=>p.evaluate(()=>(window as any).__HORIZON_GAME__.scene.scenes[0].visualIntensity.current),{timeout:15000}).toBeGreaterThan(.95);
  if(webgl){
   expect(await p.evaluate(()=>{const lens=(window as any).__HORIZON_GAME__.scene.scenes[0].previewHorizon.lens;return lens.displayOriginX===lens.width/2&&lens.displayOriginY===lens.height/2;})).toBe(true);
   await p.locator('canvas').screenshot({path:'/tmp/p3s1-horizon.png'});
   expect(await p.evaluate(async()=>{
    const path='/src/visual/shader-support.ts';const {optionalShader}=await import(/* @vite-ignore */path);
    const game=(window as any).__HORIZON_GAME__,scene=game.scene.scenes[0],count=scene.children.length;
    const failed=optionalShader(scene,'deliberately-invalid','this is not GLSL',0,0,32,32,{});
    return failed===null&&count===scene.children.length&&game.renderer.gl.getError()===0;
   })).toBe(true);
  }
  await p.locator('#visual-quality').selectOption('low');
  await expect.poll(()=>p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return !s.previewHorizon.lens?.visible&&s.previewHorizon.disk.visible;})).toBe(true);
  await p.locator('#visual-planet').click();
  await expect.poll(()=>p.evaluate(()=>(window as any).__HORIZON_GAME__.scene.scenes[0].celestial.fallback.visible)).toBe(true);
  if(webgl){await p.locator('#visual-quality').selectOption('standard');await p.locator('#visual-intensity').fill('0');await p.locator('#visual-open').click();await p.locator('canvas').screenshot({path:'/tmp/p3s1-space.png'});}
  if(webgl){
   await p.locator('#visual-combat').click();await p.locator('#fill-game').click();
   await expect.poll(()=>p.evaluate(()=>(window as any).__HORIZON_FLIGHT__.latest?.players.length)).toBe(8);
   await p.locator('#start-match').click();await expect.poll(()=>p.evaluate(()=>(window as any).__HORIZON_FLIGHT__.latest?.match.state)).toBe('active');
   await expect.poll(()=>p.evaluate(()=>(window as any).__HORIZON_GAME__.scene.scenes[0].ships.size)).toBe(8);
   await p.locator('canvas').screenshot({path:'/tmp/p3s1-combat.png'});
  }
  const resources=await p.evaluate(()=>{const g=(window as any).__HORIZON_GAME__;return Object.keys(g.textures.list).filter(k=>/^(space-|ice-|distant-|horizon-)/.test(k)).length;});
  expect(resources).toBe(10);
  expect(errors).toEqual([]);
  await p.getByRole('button',{name:'Back to home'}).click();await expect(p.locator('#visual-controls')).toHaveCount(0);
  await p.getByRole('button',{name:'Create room',exact:true}).click();await expect(p.locator('canvas')).toBeVisible({timeout:15000});
  await expect.poll(()=>p.evaluate(()=>{const g=(window as any).__HORIZON_GAME__;return Object.keys(g.textures.list).filter(k=>/^(space-|ice-|distant-|horizon-)/.test(k)).length;})).toBe(9);
  await expect(p.locator('#visual-controls')).toHaveCount(1);
  await p.getByRole('button',{name:'Back to home'}).click();
 }}finally{await browser.close();}
});

import { createGameServer } from '../server/game';
import { RoomStore } from '../server/rooms';
import { applyDamage } from '../server/combat';
import { activateTractor,clearAllTractors } from '../server/tractor';
import { fire } from '../server/projectiles';
import { ALIEN_OPACITY } from '../shared/alien';
test('eight-participant visual studies retain authoritative combat, alien identity and bounded scene resources',async({page})=>{
 const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store,{autoTick:false});await new Promise<void>(r=>server.http.listen(0,'127.0.0.1',r));
 const address=server.http.address();if(!address||typeof address==='string')throw Error('Missing port');let tick=0;const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const frame=async()=>{await page.evaluate(()=>new Promise<void>(r=>(window as any).__HORIZON_FLIGHT__.socket.emit('latencyProbe',r)));server.step();tick++;await expect.poll(()=>page.evaluate(()=>(window as any).__HORIZON_FLIGHT__.latest?.tick)).toBe(tick);};
 try{
  await page.goto('/');await page.locator('#server-url').fill(`http://127.0.0.1:${address.port}`);await page.locator('#create').click();await expect(page.locator('canvas')).toBeVisible();await expect.poll(()=>page.evaluate(()=>!!(window as any).__HORIZON_FLIGHT__)).toBe(true);await frame();
  await page.locator('#fill-game').click();await expect.poll(()=>[...store.rooms.values()][0].players.size).toBe(8);await frame();await page.locator('#start-match').click();await expect.poll(()=>[...store.rooms.values()][0].match.state).toBe('active');
  const room=[...store.rooms.values()][0],players=[...room.players.values()],a=players[0],b=players[1],ghost=players[7];
  applyDamage(ghost,999,{type:'PLAYER',playerId:a.state.id},room.simulationTimeMs);ghost.respawnAtMs=room.simulationTimeMs;await frame();expect(ghost.state.status).toBe('ALIEN');expect(ghost.state.lifeState).toBe('active');
  for(const [i,p]of players.entries()){Object.assign(p.state,{x:1370+(i===0?0:100+(i%3)*110),y:1200+(i<2?0:(i%3-1)*105),vx:0,vy:0,rotation:0});p.state.teleportSequence++;}
  await frame();clearAllTractors(room,true);expect(activateTractor(room,a,{sequence:1,reloadSession:a.state.reloadSession,round:room.match.round,lifeGeneration:a.state.lifeGeneration,teleportSequence:a.state.teleportSequence}).ok).toBe(true);
  const shooter=players[3];shooter.combatTimers.cooldown=0;
  expect(fire(room,shooter,{sequence:1000,aim:-Math.PI/2,lifeGeneration:shooter.state.lifeGeneration,teleportSequence:shooter.state.teleportSequence},tick).ok).toBe(true);await frame();
  await page.keyboard.press('F3');await expect(page.locator('#visual-controls')).toBeVisible();
  const before=players.map(p=>structuredClone(p.state)),children=await page.evaluate(()=>(window as any).__HORIZON_GAME__.scene.scenes[0].children.length);
  for(const mode of ['open','planet','dark','horizon','combat']){
   await page.locator(`#visual-${mode}`).click();
   await expect.poll(()=>page.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return s.ships.size;})).toBe(8);
   const state=await page.evaluate(id=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0],ship=s.ships.get(id),v=s.cameras.main.worldView;return {alien:ship.alien,alpha:ship.body.alpha,label:ship.label.text,visible:[...s.ships.values()].filter((x:any)=>v.contains(x.body.x,x.body.y)).length,tractor:s.tractorGraphics.commandBuffer.length,bullets:s.projectileGraphics.commandBuffer.length};},ghost.state.id);
   expect(state.alien).toBe(true);expect(state.alpha).toBe(ALIEN_OPACITY);expect(state.label).toContain('ALIEN');expect(state.visible).toBe(8);expect(state.tractor).toBeGreaterThan(0);expect(state.bullets).toBeGreaterThan(0);
  }
  // Controls modify presentation only, without a server step or accepted action.
  expect(players.map(p=>p.state)).toEqual(before);expect(room.match.roster).toHaveLength(8);expect(room.match.state).toBe('active');
  const after=await page.evaluate(()=>(window as any).__HORIZON_GAME__.scene.scenes[0].children.length);expect(after-children).toBeLessThanOrEqual(4);
  for(let i=0;i<10;i++){await page.locator('#visual-open').click();await page.locator('#visual-combat').click();}
  expect(await page.evaluate(()=>(window as any).__HORIZON_GAME__.scene.scenes[0].children.length)).toBe(after);
  expect(errors).toEqual([]);
 }finally{await page.close();await server.close();}
});
