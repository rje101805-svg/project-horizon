import {test,expect} from '@playwright/test';
import {RoomStore} from '../server/rooms';
import {createGameServer} from '../server/game';
import {VIEW_POINTS} from '../src/visual/solar-layout';
import {WORLD} from '../shared/flight';
test('large authoritative coordinates replicate to two clients; DEV camera inspection cannot move players',async({page,context})=>{
 test.setTimeout(60000);const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store,{autoTick:false});await new Promise<void>(r=>server.http.listen(0,'127.0.0.1',r));const address=server.http.address();if(!address||typeof address==='string')throw Error('port');const second=await context.newPage();let tick=0;
 const frame=async()=>{server.step();tick++;for(const p of [page,second])await expect.poll(()=>p.evaluate(()=>(window as any).__HORIZON_FLIGHT__?.latest?.tick)).toBe(tick);};
 try{
 for(const p of [page,second]){await p.goto('/');await p.locator('#server-url').fill(`http://127.0.0.1:${address.port}`);}
 await page.locator('#create').click();await expect(page.locator('canvas')).toBeVisible();const room=[...store.rooms.values()][0];await second.locator('#room-code').fill(room.code);await second.locator('#join').click();await expect(second.locator('canvas')).toBeVisible();
 const [a,b]=[...room.players.values()];Object.assign(a.state,{x:10500,y:10500});Object.assign(b.state,{x:10700,y:10500});a.state.teleportSequence++;b.state.teleportSequence++;await frame();
 for(const p of [page,second])await expect.poll(()=>p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return [...s.ships.values()].every((ship:any)=>ship.body.x>10000)&&s.ships.size===2;})).toBe(true);
 const before=[a,b].map(p=>({x:p.state.x,y:p.state.y,g:p.state.teleportSequence}));
 await page.keyboard.press('F3');await expect(page.locator('#visual-view')).toBeVisible();
 for(const index of [0,1,2,3,4,5,6,7,8]){
 await page.locator('#visual-view').selectOption(String(index));await expect.poll(()=>page.evaluate(point=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0],v=s.cameras.main.worldView;return Math.hypot(v.centerX-point.x,v.centerY-point.y);},VIEW_POINTS[index])).toBeLessThan(2);await expect.poll(()=>page.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0],v=s.cameras.main.worldView;return v.left>=0&&v.top>=0&&v.right<=12000.01&&v.bottom<=12000.01;})).toBe(true);await frame();expect([a,b].map(p=>({x:p.state.x,y:p.state.y,g:p.state.teleportSequence}))).toEqual(before);
 }
 await page.locator('#visual-view').selectOption('-1');await expect.poll(()=>page.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return s.cameras.main.worldView.contains(s.rocket.x,s.rocket.y);})).toBe(true);
 expect(WORLD).toBe(12000);
 }finally{await second.close();await page.close();await server.close();}
});
