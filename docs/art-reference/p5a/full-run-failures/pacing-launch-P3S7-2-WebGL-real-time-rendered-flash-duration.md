# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pacing-launch.spec.ts >> P3S7.2 WebGL: real-time rendered flash duration
- Location: tests/pacing-launch.spec.ts:39:42

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 300
Received:    353.8999999910593
```

# Test source

```ts
  1  | import {test,expect,chromium} from '@playwright/test';import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
  2  | import {RoomStore} from '../server/rooms';import {createGameServer} from '../server/game';import {TICK_MS} from '../shared/flight';import {LAUNCH_ORIGIN,LAUNCH_D_MIN} from '../shared/launch';import {WORLD} from '../shared/world';
  3  | for(const renderer of ['Canvas','WebGL'])test(`P3S7.2 ${renderer}: visible launch frames, 250ms flash, warning and replay in WAIT/FILL`,async({page:base})=>{
  4  |  test.setTimeout(90000);const browser=renderer==='WebGL'?await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']}):null,page=browser?await browser.newPage({viewport:{width:1366,height:768}}):base;
  5  |  const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store,{autoTick:false});await new Promise<void>(r=>server.http.listen(0,'127.0.0.1',r));const addr=server.http.address();if(!addr||typeof addr==='string')throw Error('port');let tick=0;
  6  |  const frame=async()=>{await expect.poll(()=>page.evaluate(()=>!!(window as any).__HORIZON_FLIGHT__?.socket.connected)).toBe(true);await page.evaluate(()=>new Promise<void>((resolve,reject)=>(window as any).__HORIZON_FLIGHT__.socket.timeout(5000).emit('latencyProbe',(e:any)=>e?reject(e):resolve())));server.step();tick++;await expect.poll(()=>page.evaluate(()=>(window as any).__HORIZON_FLIGHT__.latest?.tick)).toBe(tick);await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));};
  7  |  const until=async(time:number)=>{while(tick*TICK_MS+TICK_MS<time-1e-6){server.step();tick++;await new Promise<void>(r=>setImmediate(r));}await frame();};
  8  |  const view=()=>page.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0],c=s.cameras.main,f=document.querySelector('#cinematic-flash') as HTMLElement;return {x:s.rocket.x,y:s.rocket.y,cx:c.worldView.centerX,cy:c.worldView.centerY,halfW:c.worldView.width/2,halfH:c.worldView.height/2,flash:!f.hidden,opacity:+f.style.opacity,trail:s.cinematics.trails.commandBuffer.length};});
  9  |  const capture=async(name:string)=>{await page.screenshot({path:`docs/art-reference/p3s7_2/${renderer.toLowerCase()}-${name}.png`});};mkdirSync('docs/art-reference/p3s7_2',{recursive:true});
  10 |  try{
  11 |   for(const mode of ['wait','fill'] as const){await page.goto('/?devrooms=1');await page.locator('#server-url').fill(`http://127.0.0.1:${addr.port}`);await page.locator(`[data-hotspot=${mode}]`).click();await page.locator('[data-hotspot=play]').click();await expect(page.locator('#start-match')).toBeVisible();
  12 |    // The lobby control appears before cold GPU assets/connection finish. Wait
  13 |    // for scene readiness separately; keep frame and cinematic assertions intact.
  14 |    await expect.poll(()=>page.evaluate(()=>!!(window as any).__HORIZON_GAME__?.scene.scenes[0]?.ready&&!!(window as any).__HORIZON_FLIGHT__?.socket.connected),{timeout:15000}).toBe(true);await frame();const room=[...store.rooms.values()][0],host=[...room.players.values()][0];
  15 |    await page.keyboard.press('F3');await page.locator('#visual-quality').selectOption(mode==='wait'?'standard':'low');await page.keyboard.press('F3');
  16 |    await page.evaluate(()=>{const f=document.querySelector('#cinematic-flash') as HTMLElement;let start=0,visible=false;(window as any).__FLASH_DURATIONS__=[];new MutationObserver(()=>{const next=!f.hidden;if(next&&!visible)start=performance.now();if(!next&&visible)(window as any).__FLASH_DURATIONS__.push(performance.now()-start);visible=next;}).observe(f,{attributes:true});});
  17 |    await page.locator('#start-match').click();await frame();const start=room.match.phaseStartedAtMs;
  18 |    await until(start+3900);expect(room.match.state).toBe('collapse');await capture(`${mode}-collapse`);
  19 |    await until(start+4800);expect(room.match.state).toBe('launch');await expect(page.locator('#cinematic-flash')).toBeVisible();await capture(`${mode}-flash`);
  20 |    await until(start+5000);await expect.poll(()=>view().then(v=>v.opacity)).toBeLessThan(1);
  21 |    await until(start+5067);await expect(page.locator('#cinematic-flash')).toBeHidden();
  22 |    const durations=await page.evaluate(()=>(window as any).__FLASH_DURATIONS__);expect(durations).toHaveLength(1);writeFileSync(`docs/art-reference/p3s7_2/${renderer.toLowerCase()}-${mode}-flash-timing.json`,JSON.stringify({renderer,mode,totalVisibleMs:durations[0],configuredMs:250},null,2)+'\n');
  23 |    for(const [time,name]of [[6500,'departing'],[7700,'mid-travel'],[9100,'arrival']]as const){await until(start+time);const v=await view();expect(v.flash).toBe(false);expect(Math.abs(v.x-v.cx)).toBeLessThan(v.halfW);expect(Math.abs(v.y-v.cy)).toBeLessThan(v.halfH);expect(Math.hypot(v.x-LAUNCH_ORIGIN.x,v.y-LAUNCH_ORIGIN.y)).toBeGreaterThan(time===6500?150:time===7700?2500:5000);expect(host.gameplayEnabled).toBe(false);await capture(`${mode}-${name}`);}
  24 |    await until(start+9200);expect(room.match.state).toBe('active');expect(host.gameplayEnabled).toBe(true);const landing=room.match.launchDestinations[host.state.id];expect(Math.hypot(host.state.x-landing.x,host.state.y-landing.y)).toBeLessThan(1);expect(host.state.launchProtectionRemainingMs).toBeGreaterThan(0);expect(room.loot?.pickups.size).toBe(140);
  25 |    const arrivals=[...room.players.values()].map(p=>({id:p.state.id,x:p.state.x,y:p.state.y}));let pairs=0;for(let i=0;i<arrivals.length;i++)for(let j=i+1;j<arrivals.length;j++){expect(Math.hypot(arrivals[i].x-arrivals[j].x,arrivals[i].y-arrivals[j].y)).toBeGreaterThanOrEqual(LAUNCH_D_MIN);pairs++;}expect(pairs).toBe(mode==='fill'?28:0);
  26 |    await capture(`${mode}-landed`);
  27 |    const initialLoot=room.loot!.pickups.size;const clock=setInterval(()=>{server.step();tick++;},TICK_MS);
  28 |    let frameTimes:number[];try{frameTimes=await page.evaluate(()=>new Promise<number[]>(resolve=>{const samples:number[]=[];let previous:number|undefined;const sample=(now:number)=>{if(previous!==undefined)samples.push(now-previous);previous=now;if(samples.length===60)resolve(samples);else requestAnimationFrame(sample);};requestAnimationFrame(sample);}));}finally{clearInterval(clock);}
  29 |    writeFileSync(`docs/art-reference/p3s7_2/${renderer.toLowerCase()}-${mode}-performance.json`,JSON.stringify({renderer,quality:mode==='wait'?'standard':'low',initialLoot,finalLoot:room.loot!.pickups.size,rafIntervalsMs:frameTimes,serverRunningDuringMeasurement:true,softwareEnvironment:true},null,2)+'\n');
  30 |    await frame();await page.keyboard.down('KeyW');await page.keyboard.down('Shift');await expect.poll(async()=>{await frame();return host.pendingInputs.some(i=>i.message.up&&i.message.boost)||host.input.up&&host.input.boost;}).toBe(true);const beforeMove=host.state.y;await until(room.simulationTimeMs+400);expect(host.state.y).toBeLessThan(beforeMove);await page.keyboard.up('KeyW');await page.keyboard.up('Shift');
  31 |    const nearby=[...room.loot!.pickups.values()].find(p=>p.kind==='weapon'&&Math.hypot(p.x-host.state.x,p.y-host.state.y)<350)!;expect(nearby).toBeTruthy();Object.assign(host.state,{x:nearby.x,y:nearby.y,vx:0,vy:0});host.state.teleportSequence++;await frame();await expect(page.locator('#swap-prompt')).toBeVisible();await page.keyboard.press('KeyF');await frame();expect(host.state.inventory!.slots.filter(Boolean)).toHaveLength(2);expect(room.loot!.pickups.has(nearby.id)).toBe(false);await capture(`${mode}-loot-picked-up`);
  32 |    room.horizon!.startedAtMs=room.simulationTimeMs-255000+TICK_MS;for(const p of room.players.values())Object.assign(p.state,{x:WORLD-100,y:WORLD-100});room.horizon!.corner=0;await frame();await expect(page.locator('#horizon-timer')).toHaveText('FINAL COLLAPSE IN 15');await expect(page.locator('#horizon-timer')).toHaveClass(/final-collapse-warning/);const warningBox=await page.locator('#horizon-timer').boundingBox(),feedBox=await page.locator('#objective-feed').boundingBox();expect(warningBox).not.toBeNull();expect(feedBox).not.toBeNull();expect(warningBox!.y+warningBox!.height).toBeLessThan(feedBox!.y);await capture(`${mode}-final-warning`);
  33 |    room.horizon!.startedAtMs=room.simulationTimeMs-270000+TICK_MS;await frame();await expect(page.locator('#horizon-timer')).toHaveText('FINAL COLLAPSE · 0:30');await capture(`${mode}-final-collapse`);
  34 |    room.horizon!.startedAtMs=room.simulationTimeMs-300000+TICK_MS;await frame();expect(room.match.state).toBe('ended');await expect(page.locator('#cinematic-status')).toBeHidden();expect(await page.locator('#death-overlay').innerText()).not.toMatch(/collapse/i);
  35 |    await page.locator('#play-again').click();await frame();expect(room.match.state).toBe('waiting');await page.locator('#start-match').click();await frame();const again=room.match.phaseStartedAtMs;await until(again+7700);expect(room.match.state).toBe('launch');expect((await view()).flash).toBe(false);expect(Math.hypot((await view()).x-LAUNCH_ORIGIN.x,(await view()).y-LAUNCH_ORIGIN.y)).toBeGreaterThan(900);await page.locator('#leave').click();await expect.poll(()=>store.rooms.size).toBe(0);
  36 |   }
  37 |  }finally{await browser?.close();await server.close();}
  38 | });
  39 | for(const renderer of ['Canvas','WebGL'])test(`P3S7.2 ${renderer}: real-time rendered flash duration`,async({page:base})=>{
  40 |  const browser=renderer==='WebGL'?await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']}):null,page=browser?await browser.newPage():base;
  41 |  const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store);await new Promise<void>(r=>server.http.listen(0,'127.0.0.1',r));const addr=server.http.address();if(!addr||typeof addr==='string')throw Error('port');
  42 |  try{await page.goto('/?devrooms=1');await page.locator('#server-url').fill(`http://127.0.0.1:${addr.port}`);await page.locator('[data-hotspot=wait]').click();await page.locator('[data-hotspot=play]').click();await expect(page.locator('canvas')).toBeVisible({timeout:15000});await expect.poll(()=>page.evaluate(()=>!!(window as any).__HORIZON_GAME__?.scene.scenes[0]?.ready&&!!(window as any).__HORIZON_FLIGHT__?.latest),{timeout:15000}).toBe(true);
> 43 |   await page.evaluate(()=>{const f=document.querySelector('#cinematic-flash') as HTMLElement;let start=0,peakEnd=0;const samples:number[][]=[];const sample=()=>{const opacity=f.hidden?0:+getComputedStyle(f).opacity,now=performance.now();if(opacity>0&&!start)start=now;if(start){samples.push([now-start,opacity]);if(opacity<.99&&!peakEnd)peakEnd=now;if(!opacity){(window as any).__REAL_FLASH__={totalVisibleMs:now-start,peakMs:peakEnd-start,samples};return;}}requestAnimationFrame(sample);};requestAnimationFrame(sample);});await page.locator('#start-match').click();await expect.poll(()=>page.evaluate(()=>(window as any).__REAL_FLASH__),{timeout:12000}).toBeTruthy();const timing=await page.evaluate(()=>(window as any).__REAL_FLASH__);writeFileSync(`docs/art-reference/p3s7_2/${renderer.toLowerCase()}-realtime-flash.json`,JSON.stringify(timing,null,2)+'\n');expect(timing.totalVisibleMs).toBeGreaterThanOrEqual(150);expect(timing.totalVisibleMs).toBeLessThanOrEqual(300);await expect(page.locator('#cinematic-flash')).toBeHidden();
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      ^ Error: expect(received).toBeLessThanOrEqual(expected)
  44 |  }finally{await browser?.close();await server.close();}
  45 | });
  46 |
```
