import {startActiveFixture,replayFixture} from './active-fixture';
import {test,expect} from '@playwright/test';
import {RoomStore,roomChannel} from '../server/rooms';
import {createGameServer} from '../server/game';
import {lootState,freshWeapon} from '../server/inventory';
for(const focusedSlot of [false,true])test(`weapon pickup preserves flying and further inventory actions (${focusedSlot?'after slot click':'keyboard only'})`,async({page})=>{
 const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store);
 await new Promise<void>(r=>server.http.listen(0,'127.0.0.1',r));const addr=server.http.address();if(!addr||typeof addr==='string')throw Error('port');const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('/?devrooms=1');await page.locator('#server-url').fill(`http://127.0.0.1:${addr.port}`);await page.locator('#create').click();await expect(page.locator('canvas')).toBeVisible();const room=[...store.rooms.values()][0],a=[...room.players.values()][0];store.join('b',room.code,'B',0);store.join('c',room.code,'C',0);server.io.to(roomChannel(room.code)).emit('roomState',store.info(room));startActiveFixture(room,room.match.hostId!,{round:room.match.round});
  lootState(room).pickups.clear();Object.assign(a.state,{x:4000,y:8000,vx:0,vy:0});a.state.teleportSequence++;await expect.poll(()=>page.evaluate(()=>(window as any).__HORIZON_FLIGHT__.latest.players.find((p:any)=>p.id===(window as any).__HORIZON_FLIGHT__.socket.id).teleportSequence)).toBe(a.state.teleportSequence);
  await expect(page.locator('body')).toHaveAttribute('data-phase','active');await expect.poll(()=>page.evaluate(()=>!!(window as any).__HORIZON_GAME__.scene.scenes[0].ready)).toBe(true);
  const inventory=a.state.inventory!,markers={life:a.state.lifeGeneration,teleport:a.state.teleportSequence};
  const add=(kind:'smg'|'shotgun')=>{const weapon=freshWeapon(kind),pickup={id:weapon.id,kind:'weapon' as const,weapon,x:a.state.x,y:a.state.y-40,spawnTimeMs:0,source:'world' as const};lootState(room).pickups.set(pickup.id,pickup);return weapon;};
  const moving=async()=>{await expect.poll(()=>a.input.up).toBe(true);const before=a.state.y,rendered=await page.evaluate(()=>(window as any).__HORIZON_GAME__.scene.scenes[0].rocket.y);await expect.poll(()=>a.state.y).toBeLessThan(before-15);await expect.poll(()=>page.evaluate(()=>(window as any).__HORIZON_GAME__.scene.scenes[0].rocket.y)).toBeLessThan(rendered-15);};
  await page.keyboard.down('KeyW');await moving();const smg=add('smg');await expect(page.locator('#swap-prompt')).toContainText('ION SMG');await page.keyboard.press('KeyF');await expect.poll(()=>inventory.slots[1]?.id).toBe(smg.id);await moving();
  await page.keyboard.press('Digit2');await expect.poll(()=>inventory.activeSlot).toBe(1);await moving();
  if(focusedSlot){await page.locator('.weapon-slot[data-slot="0"]').click();await expect.poll(()=>inventory.activeSlot).toBe(0);await expect(page.locator('.weapon-slot[data-slot="0"]')).toBeFocused();await page.keyboard.up('KeyW');await page.keyboard.down('KeyW');await page.waitForTimeout(350);await moving();}
  await expect.poll(()=>room.simulationTimeMs>=a.nextSwapMs!).toBe(true);const shotgun=add('shotgun');await expect(page.locator('#swap-prompt')).toContainText('NOVA SHOTGUN');await page.keyboard.press('KeyF');await expect.poll(()=>inventory.slots[2]?.id).toBe(shotgun.id);await moving();
  await page.keyboard.up('KeyW');await page.keyboard.down('KeyD');const x=a.state.x;await expect.poll(()=>a.state.x).toBeGreaterThan(x+15);await page.keyboard.up('KeyD');
  expect(a.gameplayEnabled).toBe(true);expect(a.state.status).toBe('ALIVE');expect(a.state.lifeState).toBe('active');expect({life:a.state.lifeGeneration,teleport:a.state.teleportSequence}).toEqual(markers);expect(a.state.lastProcessedInput).toBeGreaterThan(0);expect(errors).toEqual([]);
 }finally{await page.keyboard.up('KeyW');await page.keyboard.up('KeyD');if(await page.locator('#leave').isVisible())await page.locator('#leave').click({timeout:2000});await server.close();}
});
