import {test,expect} from '@playwright/test';
import {RoomStore} from '../server/rooms';import {createGameServer} from '../server/game';
import {HORIZON_CORNERS,MAP_DIAGONAL} from '../shared/horizon';
import type {FlightConnection} from '../src/network';
type DebugWindow=Window&{__HORIZON_FLIGHT__:FlightConnection};
test('two browsers see growing Horizon gravity/death and reconnect recovers safely',async({page,context})=>{
 test.setTimeout(45000);const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store);await new Promise<void>(r=>server.http.listen(0,'127.0.0.1',r));const addr=server.http.address();if(!addr||typeof addr==='string')throw Error('port');const peer=await context.newPage(),errors:string[]=[];
 try{
  for(const p of [page,peer]){p.on('pageerror',e=>errors.push(e.message));await p.goto('/?devrooms=1');await p.locator('#server-url').fill(`http://127.0.0.1:${addr.port}`);}
  await page.locator('#display-name').fill('Falling');await page.locator('#create').click();await expect(page.locator('#black-hole-status')).toHaveText('Safe space');const code=(await page.locator('#room-code-display').textContent())!;await peer.locator('#room-code').fill(code);await peer.locator('#join').click();await expect(peer.locator('#black-hole-status')).toHaveText('Safe space');await peer.locator('#ready-match').click();await expect(page.locator('#start-match')).toBeEnabled();await page.locator('#start-match').click();await expect.poll(()=>store.rooms.get(code)?.match.state,{timeout:10000}).toBe('active');
  const room=store.rooms.get(code)!,pilot=[...room.players.values()].find(p=>p.state.name==='Falling')!;
  // Accelerate only the test-owned room clock to a real Stage 1 boundary
  // 400 units from this ship. Player positions/inputs are never injected.
  const distances=HORIZON_CORNERS.map(c=>Math.hypot(pilot.state.x-c.x,pilot.state.y-c.y)),corner=distances.indexOf(Math.min(...distances)),elapsed=60000+(distances[corner]-400-.1*MAP_DIAGONAL)/(.3*MAP_DIAGONAL)*50000;
  room.horizon!.corner=corner;room.horizon!.startedAtMs=room.simulationTimeMs-elapsed;
  await expect(page.locator('#black-hole-status')).toContainText('gravitational pull');const hole=HORIZON_CORNERS[corner];let sawDanger=false;
  await expect.poll(async()=>{const local=await page.evaluate(()=>{const c=(window as unknown as DebugWindow).__HORIZON_FLIGHT__;return c.latest?.players.find(p=>p.id===c.socket.id);});if(!local)return 'waiting';sawDanger ||=local.region==='danger';for(const [key,on]of [['w',local.y>hole.y],['s',local.y<hole.y],['a',local.x>hole.x],['d',local.x<hole.x]]as const){if(on)await page.keyboard.down(key);else await page.keyboard.up(key);}return local.lifeState;},{timeout:15000,intervals:[50]}).toBe('dead');
  for(const key of ['w','s','a','d'])await page.keyboard.up(key);expect(sawDanger).toBe(true);await expect(page.locator('#black-hole-status')).toContainText('Lost to the black hole');await expect(page.locator('#restart')).toBeDisabled();await expect.poll(()=>peer.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.players.find(p=>p.name==='Falling')?.lifeState)).toBe('dead');const frozen=await page.locator('#position').textContent();await page.keyboard.press('r');await page.keyboard.down('d');await page.waitForTimeout(250);await page.keyboard.up('d');expect(await page.locator('#position').textContent()).toBe(frozen);
  const oldId=await page.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.id);await page.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.disconnect());await expect(page.locator('#status')).toContainText('Disconnected');await peer.locator('#play-again').click();await page.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.connect());await expect(page.locator('#black-hole-status')).toHaveText('Safe space');await expect(page.locator('#restart')).toBeEnabled({timeout:10000});expect(await page.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.id)).not.toBe(oldId);expect(errors).toEqual([]);
 }finally{await peer.close();await server.close();}
});
