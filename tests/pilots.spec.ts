import {test,expect,chromium} from '@playwright/test';
import {existsSync,mkdirSync} from 'node:fs';
import {RoomStore} from '../server/rooms';
import {createGameServer} from '../server/game';
import {PilotCoordinator} from '../server/ai/coordinator';
import {aiConfig} from '../server/ai/openai';
import {startActiveFixture} from './active-fixture';
import {utility} from '../server/survival';
for(const [renderer,flag] of [['Canvas',undefined],['Canvas','false'],['WebGL','true']] as const)test(`${renderer}: F4 solo Intel, multiplayer ${flag??'absent'}, immediate revocation/restoration and uninterrupted controls`,async({page:base,context:baseContext})=>{
 test.setTimeout(90000);
 const gpu=renderer==='WebGL'?await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']}):null;
 const context=gpu?await gpu.newContext():baseContext,page=gpu?await context.newPage():base,peer=await context.newPage();
 const ai=new PilotCoordinator(aiConfig(flag===undefined?{}:{HORIZON_AI_INTEL_ENABLED:flag}),{available:false,async decide(){throw Error('no network in browser fixture');}},()=>performance.now(),()=>{});
 const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store,{autoTick:false,combatDebug:true,ai});await new Promise<void>(r=>server.http.listen(0,'127.0.0.1',r));const addr=server.http.address();if(!addr||typeof addr==='string')throw Error('address');let tick=0;const errors:string[]=[];for(const p of [page,peer])p.on('pageerror',e=>errors.push(e.message));
 const ready=async(p:typeof page)=>{await expect.poll(()=>p.evaluate(()=>!!(window as any).__HORIZON_GAME__?.scene.scenes[0]?.ready&&!!(window as any).__HORIZON_FLIGHT__?.room)).toBe(true);};
 const frame=async()=>{await page.evaluate(()=>new Promise<void>((resolve,reject)=>(window as any).__HORIZON_FLIGHT__.socket.timeout(5000).emit('latencyProbe',(e:any)=>e?reject(e):resolve())));server.step();tick++;await expect.poll(()=>page.evaluate(()=>(window as any).__HORIZON_FLIGHT__.latest?.tick)).toBe(tick);};
 try{
  for(const p of [page,peer]){await p.goto('/?devrooms=1');await p.locator('#server-url').fill(`http://127.0.0.1:${addr.port}`);}
  await page.locator('[data-hotspot=fill]').click();await page.locator('[data-hotspot=play]').click();await ready(page);const room=[...store.rooms.values()][0],human=room.players.get(room.match.hostId!)!;expect(room.players.size).toBe(8);await frame();
  await expect(page.locator('#ai-intel')).toBeHidden();await page.locator('#fake-lag').focus();await page.keyboard.press('F4');await expect(page.locator('#ai-intel')).toBeVisible();await expect(page.locator('#ai-intel tr[data-pilot]')).toHaveCount(7);await expect(page.locator('#ai-intel')).toContainText('NOVA');await expect(page.locator('#ai-intel')).toContainText('Strategist');expect(await page.evaluate(()=>document.activeElement?.id)).toBe('fake-lag');await page.evaluate(()=>(document.activeElement as HTMLElement)?.blur());
  await page.evaluate(()=>{const f=(window as any).__HORIZON_FLIGHT__;(window as any).__intelPackets=[];f.socket.on('aiIntel',(p:any)=>(window as any).__intelPackets.push(p));});
  await page.evaluate(()=>{document.getElementById('debug-bots')!.textContent='cached strategic metadata';});
  // Join in the real lobby. No server.step: reliable membership must revoke now.
  await peer.locator('#room-code').fill(room.code);await peer.locator('#join').click();await ready(peer);
  await expect.poll(()=>page.evaluate(()=>(window as any).__HORIZON_FLIGHT__.intel?.allowed)).toBe(flag==='true');
  if(flag!=='true'){
   await expect(page.locator('#ai-intel')).toContainText('INTEL DISABLED IN MULTIPLAYER');await expect(page.locator('#ai-intel tr[data-pilot]')).toHaveCount(0);await expect(page.locator('#debug-bots')).not.toContainText('cached strategic metadata');
   const packets=await page.evaluate(()=>(window as any).__intelPackets);expect(packets.length).toBeGreaterThan(0);for(const p of packets)expect(Object.keys(p).sort()).toEqual(['allowed','roomCode','round']);
   await page.evaluate(()=>{(window as any).__HORIZON_FLIGHT__.socket.emit('aiIntel',{allowed:true});});await frame();expect((await page.evaluate(()=>(window as any).__HORIZON_FLIGHT__.intel)).allowed).toBe(false);
  }else{await expect(page.locator('#ai-intel tr[data-pilot]')).toHaveCount(6);}
  await peer.locator('#leave').click();await expect.poll(()=>page.evaluate(()=>(window as any).__HORIZON_FLIGHT__.intel?.allowed)).toBe(true);await expect(page.locator('#ai-intel tr[data-pilot]')).toHaveCount(7);
  expect(startActiveFixture(room,human.state.id,{round:room.match.round}).ok).toBe(true);Object.assign(human.state,{x:6000,y:6000,vx:0,vy:0,rotation:0,health:40,shield:20});human.state.teleportSequence++;Object.assign(utility(human)!,{materials:40,cells:1,kits:1});for(let i=0;i<8;i++)await frame();
  await expect(page.locator('#ai-intel')).toContainText('FALLBACK');await expect(page.locator('#ai-intel-metrics')).toContainText('0/120 CALLS');await expect(page.locator('#pilot-radio')).toContainText('FALLBACK');
  const snapshot=await page.evaluate(()=>(window as any).__HORIZON_FLIGHT__.latest);expect(snapshot.players.every((p:any)=>p.bot===undefined)).toBe(true);
  await page.bringToFront();await page.keyboard.press('F3');await page.locator('#visual-quality').selectOption(renderer==='Canvas'?'low':'standard');await page.keyboard.press('F3');await page.mouse.move(1000,300);const teleport=human.state.teleportSequence;await page.keyboard.down('KeyW');await page.keyboard.down('Shift');await page.keyboard.press('F4');await page.keyboard.press('F4');await expect.poll(async()=>{await frame();return human.input.up&&human.input.boost;}).toBe(true);const y=human.state.y;for(let i=0;i<15;i++)server.step();tick+=15;await frame();expect(human.state.y).toBeLessThan(y);expect(human.state.teleportSequence).toBe(teleport);expect(Number.isFinite(human.input.aim)).toBe(true);expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe('INPUT');
  await page.keyboard.up('KeyW');await page.keyboard.up('Shift');await page.keyboard.press('KeyQ');await frame();expect(utility(human)!.materials).toBe(20);await page.keyboard.press('Digit4');await frame();expect(utility(human)!.use?.kind).toBe('cell');for(let i=0;i<61;i++)server.step();tick+=61;await frame();expect(utility(human)!.use).toBeNull();expect(human.state.shield).toBe(70);await page.keyboard.press('Digit5');await frame();expect(utility(human)!.use?.kind).toBe('repair');
  mkdirSync('docs/art-reference/phase4',{recursive:true});await page.screenshot({path:`docs/art-reference/phase4/${renderer.toLowerCase()}-${flag??'absent'}-intel-fallback.png`});
  await page.keyboard.press('F4');await expect(page.locator('#ai-intel')).toBeHidden();await page.locator('#leave').click();await expect(page.locator('#ai-intel')).toHaveCount(0);expect(errors).toEqual([]);
 }finally{await peer.close();await gpu?.close();await server.close();}
});
