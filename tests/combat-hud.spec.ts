import { test, expect, type Page } from '@playwright/test';
import { createGameServer } from '../server/game';
import { RoomStore } from '../server/rooms';
import type { FlightConnection } from '../src/network';
import type { ShipCombatHud } from '../src/ship-combat-hud';
import type { DamageNumbers } from '../src/damage-numbers';
import type { HitFeedback } from '../src/hit-feedback';
import type Phaser from 'phaser';
type Scene = Phaser.Scene & { rocket: Phaser.GameObjects.Container; localHud: ShipCombatHud; hitFeedback: HitFeedback;
  damageNumbers: DamageNumbers; fireAim: number; ships: Map<string, {body:Phaser.GameObjects.Container}> };
type DebugWindow = Window & { __HORIZON_FLIGHT__: FlightConnection; __HORIZON_GAME__: {scene:{scenes:Scene[]}} };
const visual = (page:Page) => page.evaluate(() => {
  const w = window as unknown as DebugWindow, s = w.__HORIZON_GAME__.scene.scenes[0], h = s.localHud;
  return { bars:s.children.list.filter(o=>o.name==='local-combat-bars').length, visible:h.graphics.visible,
    x:h.graphics.x,y:h.graphics.y,shipX:s.rocket.x,shipY:s.rocket.y,rotation:h.graphics.rotation,presentation:h.presentation,
    remoteBars:[...s.ships].filter(([id])=>id!==w.__HORIZON_FLIGHT__.socket.id).flatMap(([,ship])=>ship.body.list).filter(o=>o.name==='local-combat-bars').length,
    feedback:s.hitFeedback.sample(performance.now()).map(v=>({slot:v.slot,id:v.hit.projectileId})),
    numbers:[...s.damageNumbers.objects.values()].flat().map(t=>({text:t.text,color:t.style.color,x:t.x,y:t.y,name:t.name})) };
});
for (const lag of [false,true]) test(`local HUD and shooter-only split/rapid hit feedback with debug off (${lag?'150ms ±30ms':'no fake latency'})`,async({page,context})=>{
  test.setTimeout(60000);
  const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store,{autoTick:false,combatDebug:true});
  await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));const address=server.http.address();if(!address||typeof address==='string')throw Error('Missing server');
  const peer=await context.newPage(),spectator=await context.newPage(),pages=[page,peer,spectator];let tick=0;
  const frame=async()=>{
    await Promise.all(pages.map(p=>p.evaluate(()=>new Promise<void>(resolve=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.emit('latencyProbe',resolve)))));
    server.step();tick++;
    await Promise.all(pages.map(p=>expect.poll(()=>p.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.tick)).toBe(tick)));
  };
  const advance=async(n:number)=>{for(let i=0;i<n;i++){server.step();tick++;await new Promise<void>(resolve=>setImmediate(resolve));}};
  try{
    const url=`http://127.0.0.1:${address.port}`;
    for(const p of pages){await p.goto('/');await p.locator('#server-url').fill(url);}
    await page.locator('#create').click();await expect(page.locator('canvas')).toBeVisible();const code=(await page.locator('#room-code-display').textContent())!;
    for(const p of [peer,spectator]){await p.locator('#room-code').fill(code);await p.locator('#join').click();await expect(p.locator('canvas')).toBeVisible();}
    const id=await page.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.id!);
    const targetId=await peer.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.id!);
    const room=store.roomFor(id)!,a=room.players.get(id)!,b=room.players.get(targetId)!;
    Object.assign(a.state,{x:200,y:1800});Object.assign(b.state,{x:270,y:1800});
    Object.assign([...room.players.values()].find(p=>p!==a&&p!==b)!.state,{x:500,y:200});await frame();await page.locator('#start-match').click();await expect.poll(()=>room.match.state).toBe('active');await frame();
    await page.bringToFront();
    if(lag){await page.keyboard.press('F3');await page.locator('#fake-lag').check();await page.keyboard.press('F3');}
    await expect(page.locator('#debug-overlay')).toBeHidden();await expect(page.locator('#debug-network')).toBeVisible();
    await expect(page.locator('#hud-weapon')).toHaveCount(0);await expect(page.locator('#hud-ammo')).toHaveText('AMMO 12 / 12');
    await expect.poll(()=>visual(page).then(v=>v.visible)).toBe(true);
    for(const p of pages){const v=await visual(p);expect(v.bars).toBe(1);expect(v.remoteBars).toBe(0);expect(v.presentation!.shield).toBe(1);expect(v.presentation!.health).toBe(1);}
    const ammoBox=(await page.locator('#ammo-hud').boundingBox())!,canvasBox=(await page.locator('canvas').boundingBox())!;
    expect(ammoBox.width).toBeLessThan(190);expect(ammoBox.y).toBeGreaterThan(canvasBox.y+100);
    expect(ammoBox.x).toBeGreaterThan(canvasBox.x+canvasBox.width/2);
    const tap=async(expectedSequence:number)=>{
      await page.evaluate(()=>{(window as unknown as DebugWindow).__HORIZON_GAME__.scene.scenes[0].fireAim=0;});
      await page.keyboard.down('Space');await page.waitForTimeout(60);await page.keyboard.up('Space');await expect.poll(()=>a.lastFireSequence).toBe(expectedSequence);
      await frame();await expect.poll(()=>visual(page).then(v=>v.numbers.length)).toBeGreaterThan(0);
    };
    await tap(1);
    expect(b.state.shield).toBe(25);expect(b.state.health).toBe(100);
    let v=await visual(page);expect(v.numbers).toHaveLength(1);expect(v.numbers[0].text).toBe('25');expect(v.numbers[0].color).toBe('#65d9ff');
    for(const p of [peer,spectator])expect((await visual(p)).numbers).toHaveLength(0);
    await expect.poll(()=>visual(peer).then(v=>v.presentation!.shield)).toBe(.5);
    await advance(5);await frame(); // Restore cooldown; keep each hit independent.
    b.state.shield=10;await page.waitForTimeout(220);await tap(2);
    expect(b.state.shield).toBe(0);expect(b.state.health).toBe(85);
    v=await visual(page);expect(v.numbers.some(t=>t.text==='10'&&t.color==='#65d9ff')).toBe(true);
    expect(v.numbers.some(t=>t.text==='15'&&t.color==='#ffffff')).toBe(true);
    const split=v.numbers.filter(t=>t.text==='10'||t.text==='15');expect(new Set(split.map(t=>t.x)).size).toBe(2);
    await expect.poll(()=>visual(peer).then(v=>v.presentation!.shield)).toBe(0);await expect.poll(()=>visual(peer).then(v=>v.visible)).toBe(true);
    await advance(5);await frame();await page.waitForTimeout(220);await tap(3);
    expect(b.state.health).toBe(60);v=await visual(page);expect(v.numbers.some(t=>t.text==='25'&&t.color==='#ffffff')).toBe(true);
    expect(new Set(v.feedback.map(h=>h.id)).size).toBe(v.feedback.length);
    expect(new Set(v.feedback.map(h=>h.slot)).size).toBe(v.feedback.length); // No merged hits or same row.
    for(const p of [peer,spectator])expect((await visual(p)).numbers).toHaveLength(0);
    await expect.poll(()=>visual(page).then(v=>v.numbers.length),{timeout:2000}).toBe(0);
    // Snapshot-only low-health/low-ammo presentation; no gameplay mutation by HUD.
    a.state.shield=0;a.state.health=25;a.state.ammo=3;await frame();
    await expect(page.locator('#ammo-hud')).toHaveClass(/low-ammo/);v=await visual(page);
    expect(v.presentation!.lowHealth).toBe(true);expect(v.presentation!.shield).toBe(0);expect(v.visible).toBe(true);
    await page.keyboard.press('r');await expect.poll(()=>a.state.isReloading).toBe(true);await frame();
    v=await visual(page);expect(v.presentation!.reloading).toBe(true);await expect(page.locator('#ammo-hud')).toHaveAttribute('data-state','reloading');
    await advance(a.combatTimers.reload-1);expect(a.state.ammo).toBe(3);await frame();expect(a.state.ammo).toBe(12);
    await expect.poll(()=>visual(page).then(v=>v.presentation!.reloading)).toBe(false);await expect(page.locator('#ammo-hud')).not.toHaveClass(/low-ammo/);
    // Bars follow the locally rendered ship, not a delayed/rotating enemy container.
    await page.keyboard.down('d');await page.waitForTimeout(lag?250:80);
    const start=a.state.x;await expect.poll(async()=>{await frame();return a.state.x;},{timeout:10000,intervals:[20]}).toBeGreaterThan(start);await page.keyboard.up('d');
    v=await visual(page);expect(v.x+36).toBeCloseTo(v.shipX,3);expect(v.y+55).toBeCloseTo(v.shipY,3);expect(v.rotation).toBe(0);
    await page.screenshot({path:`test-results/p2s5-hud-${lag?'lag':'normal'}.png`,fullPage:true});
    await page.keyboard.press('F3');await expect(page.locator('#debug-overlay')).toBeVisible();
    for(const width of [1280,680,375]){
      await page.setViewportSize({width,height:960});
      const ammo=(await page.locator('#ammo-hud').boundingBox())!,debug=(await page.locator('#debug-overlay').boundingBox())!,game=(await page.locator('#game').boundingBox())!;
      expect(ammo.width).toBeLessThan(190);expect(ammo.y+ammo.height).toBeLessThanOrEqual(game.y+game.height);
      expect(debug.y).toBeGreaterThanOrEqual(game.y+game.height);expect(debug.y).toBeGreaterThan(ammo.y+ammo.height);
    }
    await page.locator('#leave').click();await expect(page.locator('#home')).toBeVisible();
  }finally{await peer.close();await spectator.close();await page.close();await server.close();}
});
