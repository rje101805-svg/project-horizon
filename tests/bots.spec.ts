import { test,expect } from '@playwright/test';
import { createGameServer } from '../server/game';
import { RoomStore } from '../server/rooms';
import { applyDamage } from '../server/combat';
import type { FlightConnection } from '../src/network';
import type Phaser from 'phaser';
type W=Window&{__HORIZON_FLIGHT__:FlightConnection;__HORIZON_GAME__:{scene:{scenes:(Phaser.Scene&{ships:Map<string,{label:Phaser.GameObjects.Text;body:Phaser.GameObjects.Container}>})[]}}};
for(const lag of [false,true])test(`solo fill, bot combat, queued replacement, bot winner and repeated reset (${lag?'150ms+jitter':'normal'})`,async({page,context})=>{
 test.setTimeout(90000);const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store,{autoTick:false});await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));const addr=server.http.address();if(!addr||typeof addr==='string')throw Error('No port');
 const peer=await context.newPage(),errors:string[]=[];let tick=0;
 const frame=async()=>{await Promise.all([page,peer].map(p=>p.evaluate(()=>{const c=(window as unknown as W).__HORIZON_FLIGHT__;return c?.socket.connected ? new Promise<void>(r=>c.socket.emit('latencyProbe',r)) : Promise.resolve();})));server.step();tick++;await expect.poll(()=>page.evaluate(()=>(window as unknown as W).__HORIZON_FLIGHT__.latest?.tick)).toBe(tick);};
 const advance=async(n:number)=>{for(let i=0;i<n;i++){server.step();tick++;await new Promise<void>(resolve=>setImmediate(resolve));}};
 try{
  for(const p of [page,peer]){p.on('pageerror',e=>errors.push(e.message));await p.goto('/');await p.locator('#server-url').fill(`http://127.0.0.1:${addr.port}`);}
  await page.locator('#create').click();await expect(page.locator('canvas')).toBeVisible();await frame();await expect(page.locator('#player-count')).toHaveText('1 / 8 players');await expect(page.locator('#fill-game')).toBeVisible();
  if(lag)await page.locator('#fake-lag').check();await page.locator('#fill-game').click();await expect.poll(()=>[...store.rooms.values()][0].players.size).toBe(8);await frame();await expect(page.locator('#player-count')).toHaveText('8 / 8 players');await expect(page.locator('#fill-game')).toBeDisabled();
  const room=[...store.rooms.values()][0],bots=[...room.players.values()].filter(p=>p.state.controllerType==='BOT'),ids=bots.map(p=>p.state.id),positions=new Map(bots.map(b=>[b.state.id,{x:b.state.x,y:b.state.y}]));
  await expect.poll(()=>page.evaluate(()=>(window as unknown as W).__HORIZON_GAME__.scene.scenes[0].ships.size)).toBe(8);
  await expect.poll(()=>page.evaluate(()=>(window as unknown as W).__HORIZON_GAME__.scene.scenes[0].ships.values().next().value?.label.text)).toBeTruthy();
  await page.locator('#start-match').click();await expect.poll(()=>room.match.state).toBe('active');await frame();expect(room.match.roster).toHaveLength(8);await expect(page.locator('#fill-game')).toBeHidden();
  await advance(90);await frame();expect(bots.some(b=>b.state.x!==positions.get(b.state.id)!.x || b.state.y!==positions.get(b.state.id)!.y)).toBe(true);expect(room.projectileSequence>0 || (room.tractorCooldowns?.size??0)>0).toBe(true);
  await page.keyboard.press('F3');await expect.poll(()=>page.locator('#debug-bots').textContent()).toContain('[BOT]');
  await peer.locator('#room-code').fill(room.code);await peer.locator('#join').click();await expect(peer.locator('canvas')).toBeVisible();if(lag)await peer.locator('#fake-lag').check();await frame();await expect(peer.locator('#match-status')).toHaveText('SPECTATING · JOINS NEXT ROUND');await expect(peer.locator('#fill-game')).toBeHidden();expect(room.match.roster).toHaveLength(8);
  const queued=[...room.players.values()].find(p=>p.state.queuedForNextRound)!;expect(queued.state.status).toBe('OUT');
  const rejected=await peer.evaluate(()=>{const c=(window as unknown as W).__HORIZON_FLIGHT__;return new Promise<{ok:boolean}>(resolve=>c.socket.emit('fillGame',{roomCode:c.room!.code,round:c.latest!.match.round},resolve));});expect(rejected.ok).toBe(false);
  // Deterministically finish through the same central damage/result path.
  const winner=bots.find(b=>b.state.status==='ALIVE')!;expect(winner).toBeTruthy();for(const p of room.players.values())if(p!==winner && !p.state.queuedForNextRound){p.invulnerableUntilMs=0;applyDamage(p,999,{type:'PLAYER',playerId:winner.state.id},room.simulationTimeMs);}
  await frame();await expect(page.locator('#match-result')).toHaveText(`${winner.state.name} WINS`);await expect(peer.locator('#match-result')).toHaveText(`${winner.state.name} WINS`);expect(room.match.result?.kind).toBe('winner');
  await advance(180);await expect.poll(()=>room.match.state).toBe('waiting');await Promise.all([page,peer].map(p=>expect.poll(()=>p.evaluate(()=>(window as unknown as W).__HORIZON_FLIGHT__.latest?.match.state)).toBe('waiting')));await frame();await expect(peer.locator('#match-status')).toHaveText('Waiting for host start');await expect(page.locator('#player-count')).toHaveText('8 / 8 players');
  expect(room.players.size).toBe(8);const remaining=[...room.players.values()].filter(p=>p.state.controllerType==='BOT');expect(remaining).toHaveLength(6);expect(remaining.every(p=>ids.includes(p.state.id))).toBe(true);
  for(const b of remaining){expect(b.state.status).toBe('ALIVE');expect(b.state.health).toBe(100);expect(b.state.shield).toBe(50);expect(b.state.bot!.target).toBe(null);expect(b.state.bot!.override).toBe(null);}
  await expect.poll(()=>page.evaluate(()=>[...(window as unknown as W).__HORIZON_GAME__.scene.scenes[0].ships.values()].every(s=>!s.label.text.includes('ALIEN')&&s.body.alpha===1))).toBe(true);
  await page.locator('#start-match').click();await expect.poll(()=>room.match.state).toBe('active');await frame();expect(room.match.roster).toContain(queued.state.id);expect(room.match.roster).toHaveLength(8);
  // Second round chooses a different winner and retains the same bot identities.
  const human=[...room.players.values()].find(p=>p.state.id===room.match.hostId)!;for(const p of room.players.values())if(p!==human){p.invulnerableUntilMs=0;applyDamage(p,999,{type:'PLAYER',playerId:human.state.id},room.simulationTimeMs);}await frame();await expect(page.locator('#match-result')).toHaveText('VICTORY');await advance(180);await Promise.all([page,peer].map(p=>expect.poll(()=>p.evaluate(()=>(window as unknown as W).__HORIZON_FLIGHT__.latest?.match.state)).toBe('waiting')));await frame();expect(room.match.state).toBe('waiting');expect([...room.players.values()].filter(p=>p.state.controllerType==='BOT').map(p=>p.state.id)).toEqual(remaining.map(p=>p.state.id));expect(errors).toEqual([]);
 }finally{await peer.close();await page.close();await server.close();}
});
