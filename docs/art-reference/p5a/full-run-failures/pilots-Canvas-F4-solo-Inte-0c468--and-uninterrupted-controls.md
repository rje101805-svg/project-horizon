# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pilots.spec.ts >> Canvas: F4 solo Intel, multiplayer false, immediate revocation/restoration and uninterrupted controls
- Location: tests/pilots.spec.ts:9:98

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#ai-intel')
Expected substring: "Nova"
Received string:    "F4 · AI INTELPILOTPERSONALITYINTENT → TARGETSOURCELEFTNOVAStrategistWAITING → Waiting for ACTIVEFALLBACK0sHORIZONWildcardWAITING → Waiting for ACTIVEFALLBACK0sSHADOWSurvivorWAITING → Waiting for ACTIVEFALLBACK0sDREADNOUGHTStrategistWAITING → Waiting for ACTIVEFALLBACK0sZENITHStrategistWAITING → Waiting for ACTIVEFALLBACK0sVULCANScavengerWAITING → Waiting for ACTIVEFALLBACK0sECLIPSEAggressorWAITING → Waiting for ACTIVEFALLBACK0sAI ENABLED · API UNAVAILABLE · 0/120 CALLS · AVG 0ms · HOUR 0/600"
Timeout: 5000ms

Call log:
  - Expect "toContainText" locator('#ai-intel') with timeout 5000ms
  - waiting for locator('#ai-intel')
    14 × locator resolved to <aside id="ai-intel" aria-label="AI Intel">…</aside>
       - unexpected value "F4 · AI INTELPILOTPERSONALITYINTENT → TARGETSOURCELEFTNOVAStrategistWAITING → Waiting for ACTIVEFALLBACK0sHORIZONWildcardWAITING → Waiting for ACTIVEFALLBACK0sSHADOWSurvivorWAITING → Waiting for ACTIVEFALLBACK0sDREADNOUGHTStrategistWAITING → Waiting for ACTIVEFALLBACK0sZENITHStrategistWAITING → Waiting for ACTIVEFALLBACK0sVULCANScavengerWAITING → Waiting for ACTIVEFALLBACK0sECLIPSEAggressorWAITING → Waiting for ACTIVEFALLBACK0sAI ENABLED · API UNAVAILABLE · 0/120 CALLS · AVG 0ms · HOUR 0/600"

```

```yaml
- complementary "AI Intel":
  - strong: F4 · AI INTEL
  - table:
    - row "PILOT PERSONALITY INTENT → TARGET SOURCE LEFT":
      - columnheader "PILOT"
      - columnheader "PERSONALITY"
      - columnheader "INTENT → TARGET"
      - columnheader "SOURCE"
      - columnheader "LEFT"
    - row "NOVA Strategist WAITING → Waiting for ACTIVE FALLBACK 0s":
      - cell "NOVA"
      - cell "Strategist"
      - cell "WAITING → Waiting for ACTIVE"
      - cell "FALLBACK"
      - cell "0s"
    - row "HORIZON Wildcard WAITING → Waiting for ACTIVE FALLBACK 0s":
      - cell "HORIZON"
      - cell "Wildcard"
      - cell "WAITING → Waiting for ACTIVE"
      - cell "FALLBACK"
      - cell "0s"
    - row "SHADOW Survivor WAITING → Waiting for ACTIVE FALLBACK 0s":
      - cell "SHADOW"
      - cell "Survivor"
      - cell "WAITING → Waiting for ACTIVE"
      - cell "FALLBACK"
      - cell "0s"
    - row "DREADNOUGHT Strategist WAITING → Waiting for ACTIVE FALLBACK 0s":
      - cell "DREADNOUGHT"
      - cell "Strategist"
      - cell "WAITING → Waiting for ACTIVE"
      - cell "FALLBACK"
      - cell "0s"
    - row "ZENITH Strategist WAITING → Waiting for ACTIVE FALLBACK 0s":
      - cell "ZENITH"
      - cell "Strategist"
      - cell "WAITING → Waiting for ACTIVE"
      - cell "FALLBACK"
      - cell "0s"
    - row "VULCAN Scavenger WAITING → Waiting for ACTIVE FALLBACK 0s":
      - cell "VULCAN"
      - cell "Scavenger"
      - cell "WAITING → Waiting for ACTIVE"
      - cell "FALLBACK"
      - cell "0s"
    - row "ECLIPSE Aggressor WAITING → Waiting for ACTIVE FALLBACK 0s":
      - cell "ECLIPSE"
      - cell "Aggressor"
      - cell "WAITING → Waiting for ACTIVE"
      - cell "FALLBACK"
      - cell "0s"
  - paragraph: AI ENABLED · API UNAVAILABLE · 0/120 CALLS · AVG 0ms · HOUR 0/600
```

# Test source

```ts
  1  | import {test,expect,chromium} from '@playwright/test';
  2  | import {existsSync,mkdirSync} from 'node:fs';
  3  | import {RoomStore} from '../server/rooms';
  4  | import {createGameServer} from '../server/game';
  5  | import {PilotCoordinator} from '../server/ai/coordinator';
  6  | import {aiConfig} from '../server/ai/openai';
  7  | import {startActiveFixture} from './active-fixture';
  8  | import {utility} from '../server/survival';
  9  | for(const [renderer,flag] of [['Canvas',undefined],['Canvas','false'],['WebGL','true']] as const)test(`${renderer}: F4 solo Intel, multiplayer ${flag??'absent'}, immediate revocation/restoration and uninterrupted controls`,async({page:base,context:baseContext})=>{
  10 |  test.setTimeout(90000);
  11 |  const gpu=renderer==='WebGL'?await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']}):null;
  12 |  const context=gpu?await gpu.newContext():baseContext,page=gpu?await context.newPage():base,peer=await context.newPage();
  13 |  const ai=new PilotCoordinator(aiConfig(flag===undefined?{}:{HORIZON_AI_INTEL_ENABLED:flag}),{available:false,async decide(){throw Error('no network in browser fixture');}},()=>performance.now(),()=>{});
  14 |  const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store,{autoTick:false,combatDebug:true,ai});await new Promise<void>(r=>server.http.listen(0,'127.0.0.1',r));const addr=server.http.address();if(!addr||typeof addr==='string')throw Error('address');let tick=0;const errors:string[]=[];for(const p of [page,peer])p.on('pageerror',e=>errors.push(e.message));
  15 |  const ready=async(p:typeof page)=>{await expect.poll(()=>p.evaluate(()=>!!(window as any).__HORIZON_GAME__?.scene.scenes[0]?.ready&&!!(window as any).__HORIZON_FLIGHT__?.room)).toBe(true);};
  16 |  const frame=async()=>{await page.evaluate(()=>new Promise<void>((resolve,reject)=>(window as any).__HORIZON_FLIGHT__.socket.timeout(5000).emit('latencyProbe',(e:any)=>e?reject(e):resolve())));server.step();tick++;await expect.poll(()=>page.evaluate(()=>(window as any).__HORIZON_FLIGHT__.latest?.tick)).toBe(tick);};
  17 |  try{
  18 |   for(const p of [page,peer]){await p.goto('/?devrooms=1');await p.locator('#server-url').fill(`http://127.0.0.1:${addr.port}`);}
  19 |   await page.locator('[data-hotspot=fill]').click();await page.locator('[data-hotspot=play]').click();await ready(page);const room=[...store.rooms.values()][0],human=room.players.get(room.match.hostId!)!;expect(room.players.size).toBe(8);await frame();
> 20 |   await expect(page.locator('#ai-intel')).toBeHidden();await page.locator('#fake-lag').focus();await page.keyboard.press('F4');await expect(page.locator('#ai-intel')).toBeVisible();await expect(page.locator('#ai-intel tr[data-pilot]')).toHaveCount(7);await expect(page.locator('#ai-intel')).toContainText('Nova');await expect(page.locator('#ai-intel')).toContainText('Strategist');expect(await page.evaluate(()=>document.activeElement?.id)).toBe('fake-lag');await page.evaluate(()=>(document.activeElement as HTMLElement)?.blur());
     |                                                                                                                                                                                                                                                                                                    ^ Error: expect(locator).toContainText(expected) failed
  21 |   await page.evaluate(()=>{const f=(window as any).__HORIZON_FLIGHT__;(window as any).__intelPackets=[];f.socket.on('aiIntel',(p:any)=>(window as any).__intelPackets.push(p));});
  22 |   await page.evaluate(()=>{document.getElementById('debug-bots')!.textContent='cached strategic metadata';});
  23 |   // Join in the real lobby. No server.step: reliable membership must revoke now.
  24 |   await peer.locator('#room-code').fill(room.code);await peer.locator('#join').click();await ready(peer);
  25 |   await expect.poll(()=>page.evaluate(()=>(window as any).__HORIZON_FLIGHT__.intel?.allowed)).toBe(flag==='true');
  26 |   if(flag!=='true'){
  27 |    await expect(page.locator('#ai-intel')).toContainText('INTEL DISABLED IN MULTIPLAYER');await expect(page.locator('#ai-intel tr[data-pilot]')).toHaveCount(0);await expect(page.locator('#debug-bots')).not.toContainText('cached strategic metadata');
  28 |    const packets=await page.evaluate(()=>(window as any).__intelPackets);expect(packets.length).toBeGreaterThan(0);for(const p of packets)expect(Object.keys(p).sort()).toEqual(['allowed','roomCode','round']);
  29 |    await page.evaluate(()=>{(window as any).__HORIZON_FLIGHT__.socket.emit('aiIntel',{allowed:true});});await frame();expect((await page.evaluate(()=>(window as any).__HORIZON_FLIGHT__.intel)).allowed).toBe(false);
  30 |   }else{await expect(page.locator('#ai-intel tr[data-pilot]')).toHaveCount(6);}
  31 |   await peer.locator('#leave').click();await expect.poll(()=>page.evaluate(()=>(window as any).__HORIZON_FLIGHT__.intel?.allowed)).toBe(true);await expect(page.locator('#ai-intel tr[data-pilot]')).toHaveCount(7);
  32 |   expect(startActiveFixture(room,human.state.id,{round:room.match.round}).ok).toBe(true);Object.assign(human.state,{x:6000,y:6000,vx:0,vy:0,rotation:0,health:40,shield:20});human.state.teleportSequence++;Object.assign(utility(human)!,{materials:40,cells:1,kits:1});for(let i=0;i<8;i++)await frame();
  33 |   await expect(page.locator('#ai-intel')).toContainText('FALLBACK');await expect(page.locator('#ai-intel-metrics')).toContainText('0/120 CALLS');await expect(page.locator('#pilot-radio')).toContainText('FALLBACK');
  34 |   const snapshot=await page.evaluate(()=>(window as any).__HORIZON_FLIGHT__.latest);expect(snapshot.players.every((p:any)=>p.bot===undefined)).toBe(true);
  35 |   await page.bringToFront();await page.keyboard.press('F3');await page.locator('#visual-quality').selectOption(renderer==='Canvas'?'low':'standard');await page.keyboard.press('F3');await page.mouse.move(1000,300);const teleport=human.state.teleportSequence;await page.keyboard.down('KeyW');await page.keyboard.down('Shift');await page.keyboard.press('F4');await page.keyboard.press('F4');await expect.poll(async()=>{await frame();return human.input.up&&human.input.boost;}).toBe(true);const y=human.state.y;for(let i=0;i<15;i++)server.step();tick+=15;await frame();expect(human.state.y).toBeLessThan(y);expect(human.state.teleportSequence).toBe(teleport);expect(Number.isFinite(human.input.aim)).toBe(true);expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe('INPUT');
  36 |   await page.keyboard.up('KeyW');await page.keyboard.up('Shift');await page.keyboard.press('KeyQ');await frame();expect(utility(human)!.materials).toBe(20);await page.keyboard.press('Digit4');await frame();expect(utility(human)!.use?.kind).toBe('cell');for(let i=0;i<61;i++)server.step();tick+=61;await frame();expect(utility(human)!.use).toBeNull();expect(human.state.shield).toBe(70);await page.keyboard.press('Digit5');await frame();expect(utility(human)!.use?.kind).toBe('repair');
  37 |   mkdirSync('docs/art-reference/phase4',{recursive:true});await page.screenshot({path:`docs/art-reference/phase4/${renderer.toLowerCase()}-${flag??'absent'}-intel-fallback.png`});
  38 |   await page.keyboard.press('F4');await expect(page.locator('#ai-intel')).toBeHidden();await page.locator('#leave').click();await expect(page.locator('#ai-intel')).toHaveCount(0);expect(errors).toEqual([]);
  39 |  }finally{await peer.close();await gpu?.close();await server.close();}
  40 | });
  41 |
```
