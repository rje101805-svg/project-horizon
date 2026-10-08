import {test,expect} from '@playwright/test';
import {RoomStore} from '../server/rooms';
import {createGameServer} from '../server/game';
import {applyDamage} from '../server/combat';
import {activateTractor,clearAllTractors} from '../server/tractor';
import {fire} from '../server/projectiles';
import {PLANET_REGIONS,ENVIRONMENT_VIEWS} from '../src/visual/solar-layout';
import {ALIEN_OPACITY} from '../shared/alien';
test('F3 environment inspection, eight-player readability and scene cleanup preserve authority',async({page})=>{
 test.setTimeout(90000);const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store,{autoTick:false});await new Promise<void>(r=>server.http.listen(0,'127.0.0.1',r));const address=server.http.address();if(!address||typeof address==='string')throw Error('port');let tick=0,sequence=2000;const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const frame=async()=>{await page.evaluate(()=>new Promise<void>(resolve=>(window as any).__HORIZON_FLIGHT__.socket.emit('latencyProbe',resolve)));server.step();await expect.poll(()=>page.evaluate(()=>(window as any).__HORIZON_FLIGHT__?.latest?.tick)).toBe(++tick);};
 try{
  await page.goto('/');await page.locator('#server-url').fill(`http://127.0.0.1:${address.port}`);await page.locator('#create').click();await expect(page.locator('canvas')).toBeVisible();await frame();
  await expect(page.locator('#debug-fps')).toBeHidden();await page.keyboard.press('F3');await expect(page.locator('#debug-fps')).toHaveText(/FPS: \d+ \(3s avg\)/);await expect(page.locator('#visual-rendering')).toContainText('Canvas · low');
  await page.locator('#visual-quality').selectOption('standard');await expect(page.locator('#visual-rendering')).toContainText('Canvas · standard');
  const motion=await page.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0],sky=s.deepSpace;
   sky.update(s.cameras.main,true,true,sky.animationOrigin+5250);const active=sky.ambient.commandBuffer.length;
   sky.update(s.cameras.main,true,false,sky.animationOrigin+5250);return {active,lowVisible:sky.ambient.visible,lowCommands:sky.ambient.commandBuffer.length,lowDetail:sky.canvasGeometry[0].getData('detail')};
  });expect(motion.active).toBeGreaterThan(0);expect(motion.active).toBeLessThan(250);expect(motion.lowVisible).toBe(false);expect(motion.lowCommands).toBe(0);expect(motion.lowDetail).toBe(false);
  const baseline=await page.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return {children:s.children.length,stars:s.deepSpace.starCount,rocks:s.celestial.decorations.reduce((n:number,g:any)=>n+g.length,0),bodies:s.celestial.distant.length,keys:Object.keys(s.textures.list).filter(k=>/^(space-|surface-|planet-|ice-|distant-|debris-)/.test(k)).sort()};});
  expect(baseline.stars).toBeGreaterThan(6000);expect(baseline.rocks).toBe(47);expect(baseline.bodies).toBe(11);
  const room=[...store.rooms.values()][0],initial=structuredClone([...room.players.values()][0].state);
  for(const index of [9,10,11,12,13]){
   await page.locator('#visual-view').selectOption(String(index));await expect.poll(()=>page.evaluate(p=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0],v=s.cameras.main.worldView;return Math.hypot(v.centerX-p.x,v.centerY-p.y);},ENVIRONMENT_VIEWS[index-9])).toBeLessThan(2);
   if(index===9)await page.locator('canvas').screenshot({path:'/tmp/p3s25-distant.png'});
   if(index===11)await page.locator('canvas').screenshot({path:'/tmp/p3s25-nebula.png'});
   if(index===12){await expect.poll(()=>page.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return s.celestial.decorations.some((g:any)=>g.visible);})).toBe(true);await page.locator('canvas').screenshot({path:'/tmp/p3s25-debris.png'});}
  }
  expect([...room.players.values()][0].state).toEqual(initial);await page.locator('#visual-view').selectOption('-1');await page.locator('#visual-open').click();await page.locator('canvas').screenshot({path:'/tmp/p3s25-open.png'});await page.locator('#visual-auto').click();
  await page.locator('#fill-game').click();await expect.poll(()=>room.players.size).toBe(8);await frame();await page.locator('#start-match').click();await expect.poll(()=>room.match.state).toBe('active');
  const players=[...room.players.values()],a=players[0],ghost=players[7];applyDamage(ghost,999,{type:'PLAYER',playerId:a.state.id},room.simulationTimeMs);ghost.respawnAtMs=room.simulationTimeMs;await frame();
  // Test-only authoritative fixtures place combat over real full-size planet limbs.
  // Runtime inspection only changes camera position, never player/server state.
  const positions=[[0,0],[180,0],[340,-150],[-70,-140],[110,155],[320,145],[-100,155],[360,0]] as const;
  for(const region of PLANET_REGIONS){
   clearAllTractors(room,true);const cx=region.x-region.radius+300,cy=region.y;
   for(const [i,p]of players.entries()){Object.assign(p.state,{x:cx+positions[i][0],y:cy+positions[i][1],vx:0,vy:0,rotation:0});p.state.teleportSequence++;}
   expect(activateTractor(room,a,{sequence:++sequence,reloadSession:a.state.reloadSession,round:room.match.round,lifeGeneration:a.state.lifeGeneration,teleportSequence:a.state.teleportSequence}).ok).toBe(true);
   const shooter=players[3];shooter.combatTimers.cooldown=0;expect(fire(room,shooter,{sequence:++sequence,aim:-Math.PI/2,lifeGeneration:shooter.state.lifeGeneration,teleportSequence:shooter.state.teleportSequence},tick).ok).toBe(true);await frame();
   await expect.poll(()=>page.evaluate(id=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0],g=s.ships.get(id);return {alien:g?.alien,alpha:g?.body.alpha,label:g?.label.text};},ghost.state.id)).toMatchObject({alien:true,alpha:ALIEN_OPACITY,label:expect.stringContaining('ALIEN')});
   await expect.poll(()=>page.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return s.celestial.bodies.filter((b:any)=>b.fallback.visible).length;})).toBe(1);
   const state=await page.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return {visible:[...s.ships.values()].filter((ship:any)=>s.cameras.main.worldView.contains(ship.body.x,ship.body.y)).length,ships:s.ships.size,tractor:s.tractorGraphics.commandBuffer.length,bullets:s.projectileGraphics.commandBuffer.length};});expect(state.ships).toBe(8);expect(state.visible).toBe(8);expect(state.tractor).toBeGreaterThan(0);expect(state.bullets).toBeGreaterThan(0);
   await page.locator('canvas').screenshot({path:`/tmp/p3s25-encounter-${region.biome}.png`});
  }
  for(let i=0;i<3;i++){
   await page.getByRole('button',{name:'Back to home'}).click();await expect(page.locator('#visual-controls')).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>Object.keys((window as any).__HORIZON_GAME__?.textures?.list??{}).filter(k=>/^(space-|surface-|planet-|ice-|distant-|debris-)/.test(k)))).toEqual([]);
   await page.locator('#create').click();await expect(page.locator('canvas')).toBeVisible();await frame();await expect.poll(()=>page.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return {children:s.children.length,keys:Object.keys(s.textures.list).filter(k=>/^(space-|surface-|planet-|ice-|distant-|debris-)/.test(k)).sort()};})).toEqual({children:baseline.children,keys:baseline.keys});
  }
  expect(errors).toEqual([]);
 }finally{await page.close();await server.close();}
});
