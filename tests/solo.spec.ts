import {COUNTDOWN_MS,COLLAPSE_MS,LAUNCH_MS} from '../shared/match';
import {LOOT_CONFIG} from '../shared/loot';import {SURVIVAL} from '../shared/survival';
import {existsSync} from 'node:fs';
import {test,expect,chromium} from '@playwright/test';
import {RoomStore} from '../server/rooms';
import {createGameServer} from '../server/game';
for(const renderer of ['Canvas','WebGL'])test(`${renderer}: default PLAY launches one ship, remains playable, leaves and starts fresh`,async({page:defaultPage})=>{
 // Two real 9.2s launches plus two cold/recreated scenes exceeded the old
 // 30s whole-test budget (measured 30.1s). Keep each movement assertion at 5s.
 test.setTimeout(2*(COUNTDOWN_MS+COLLAPSE_MS+LAUNCH_MS+10000));
 const gpu=renderer==='WebGL'?await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']}):null;const page=gpu?await gpu.newPage():defaultPage;
 const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store);
 await new Promise<void>(r=>server.http.listen(0,'127.0.0.1',r));const addr=server.http.address();if(!addr||typeof addr==='string')throw Error('port');
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('/?devrooms=1');await page.locator('#server-url').fill(`http://127.0.0.1:${addr.port}`);
  await expect(page.locator('[data-hotspot=wait]')).toHaveAttribute('aria-pressed','true');
  for(let attempt=0;attempt<2;attempt++){
   await page.locator('[data-hotspot=play]').click();await expect(page.locator('#start-match')).toBeVisible();await expect(page.locator('#start-match')).toBeEnabled();
   const room=[...store.rooms.values()][0];expect(room.players.size).toBe(1);expect(room.match.mode).toBe('wait');
   await page.locator('#start-match').click();await expect(page.locator('#cinematic-status')).toHaveText('3');
   await expect.poll(()=>room.match.state,{timeout:15000}).toBe('active');expect(room.match.roster).toHaveLength(1);expect(Object.keys(room.match.launchAngles)).toHaveLength(1);await expect(page.locator('body')).toHaveAttribute('data-phase','active');
   await expect.poll(()=>page.evaluate(()=>(window as any).__HORIZON_GAME__.scene.scenes[0].ships.size)).toBe(1);
   const player=[...room.players.values()][0];await page.bringToFront();await page.keyboard.down('KeyS');await expect.poll(()=>Math.hypot(player.state.vx,player.state.vy)).toBeGreaterThan(50);await page.keyboard.up('KeyS');
   await expect(page.locator('#match-overlay')).toBeHidden();expect(room.match.result).toBeNull();expect(player.gameplayEnabled).toBe(true);expect(player.combatEnabled).toBe(true);expect(room.loot?.pickups.size).toBe(LOOT_CONFIG.weaponCount+LOOT_CONFIG.ammoCount+SURVIVAL.materialCount+SURVIVAL.healingCount);
   await page.locator('#leave').click();await expect(page.locator('#menu-art')).toBeVisible();await expect.poll(()=>store.rooms.size).toBe(0);
  }
  expect(errors).toEqual([]);
 }finally{await gpu?.close();await server.close();}
});
