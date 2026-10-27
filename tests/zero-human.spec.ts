import {fighterStats} from '../shared/fighters';
import {startActiveFixture} from './active-fixture';
import { test, expect, type Page } from '@playwright/test';
import { createGameServer } from '../server/game';
import { RoomStore } from '../server/rooms';
import { applyDamage } from '../server/combat';
import { fire } from '../server/projectiles';
import type { FlightConnection } from '../src/network';
type DebugWindow = Window & {__HORIZON_FLIGHT__:FlightConnection};
for (const lag of [false,true]) test(`three-human roster draws on zero humans and excludes spectator across resets (${lag?'150ms+jitter':'normal'})`, async ({page,context}) => {
 test.setTimeout(60000);
 const store = new RoomStore(), server = createGameServer(['http://127.0.0.1:5175'],store,{autoTick:false});
 await new Promise<void>(resolve => server.http.listen(0,'127.0.0.1',resolve)); const address = server.http.address(); if (!address || typeof address === 'string') throw Error('No address');
 const pages:Page[] = [page,await context.newPage(),await context.newPage(),await context.newPage()], errors:string[]=[]; let tick=0, clients=pages.slice(0,3);
 const frame=async()=>{await Promise.all(clients.map(p=>p.evaluate(()=>new Promise<void>(resolve=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.emit('latencyProbe',resolve)))));server.step();tick++;await Promise.all(clients.map(p=>expect.poll(()=>p.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.tick)).toBe(tick)));};
 const advance=async(n:number)=>{for(let i=0;i<n;i++){server.step();tick++;await new Promise<void>(resolve=>setImmediate(resolve));}};
 try {
  for(const [i,p] of pages.entries()){p.on('pageerror',e=>errors.push(e.message));await p.goto('/?devrooms=1');await p.locator('#server-url').fill(`http://127.0.0.1:${address.port}`);await p.locator('#display-name').fill(`Pilot ${i+1}`);}
  await page.locator('#create').click(); await expect(page.locator('canvas')).toBeVisible();const code=(await page.locator('#room-code-display').textContent())!;
  for(const p of pages.slice(1,3)){await p.locator('#room-code').fill(code);await p.locator('#join').click();await expect(p.locator('canvas')).toBeVisible();}
  await frame();const room=store.rooms.get(code)!,[a,b,c]=[...room.players.values()];startActiveFixture(room,room.match.hostId!,{round:room.match.round});await frame();
  const spectatorPage=pages[3];await spectatorPage.locator('#room-code').fill(code);await spectatorPage.locator('#join').click();await expect(spectatorPage.locator('#home-status')).toContainText('Match in progress');await expect(spectatorPage.locator('canvas')).toHaveCount(0);expect(room.match.roster).toEqual([a.state.id,b.state.id,c.state.id]);
  if(lag)for(const p of clients)await p.locator('#fake-lag').check();
  applyDamage(c,200,{type:'ENVIRONMENT',cause:'HAZARD'});await frame();expect(room.match.state).toBe('active');for(const p of clients)await expect(p.locator('#humans-remaining')).toHaveText('Humans alive: 2');
  Object.assign(a.state,{x:200,y:1800,health:25,shield:0});Object.assign(b.state,{x:270,y:1800,health:25,shield:0});
  for(const [player,aim] of [[a,0],[b,Math.PI]] as const)expect(fire(room,player,{sequence:1,aim,lifeGeneration:player.state.lifeGeneration,teleportSequence:player.state.teleportSequence},tick).ok).toBe(true);
  await frame();expect(room.match.state).toBe('ended');expect(room.match.result).toEqual({kind:'draw'});
  for(const p of clients){await expect(p.locator('#match-result')).toHaveText('DRAW');await expect(p.locator('#match-overlay')).toBeVisible();await expect(p.locator('#humans-remaining')).toHaveText('Humans alive: 0');}
  for(const player of room.players.values())expect(player.gameplayEnabled).toBe(false);expect(room.projectiles.size).toBe(0);
  await advance(179);expect(room.match.state).toBe('ended');await page.locator('#play-again').click();await frame();expect(room.match.state).toBe('waiting');expect(room.match.round).toBe(1);
  for(const p of clients){await expect(p.locator('#match-overlay')).toBeHidden();await expect(p.locator('#hud-ammo')).toHaveText('AMMO 30 / 30');await expect(p.locator('#hud-alien')).toBeHidden();await expect(p.locator('#alien-message')).toBeHidden();}
  for(const player of room.players.values()){expect(player.state.status).toBe('ALIVE');expect(player.state.health).toBe(100);expect(player.state.shield).toBe(fighterStats(player.state).maxShield);expect(player.humanEliminated).toBe(false);}
  await spectatorPage.locator('#room-code').fill(code);await spectatorPage.locator('#join').click();await expect(spectatorPage.locator('canvas')).toBeVisible();clients=pages;await frame();expect(room.match.state).toBe('waiting');await expect(page.locator('#start-match')).toBeDisabled();
  startActiveFixture(room,room.match.hostId!,{round:room.match.round});await frame();expect(room.match.roster).toEqual([...room.players.keys()]);
  // Former spectator is now a participant; a second all-human batch must draw too.
  for(const player of room.players.values())Object.assign(player.state,{x:room.blackHole.x,y:room.blackHole.y,vx:0,vy:0});await frame();
  expect(room.match.round).toBe(2);expect(room.match.result).toEqual({kind:'draw'});for(const p of clients)await expect(p.locator('#match-result')).toHaveText('DRAW');expect(errors).toEqual([]);
 }finally{await Promise.all(pages.map(p=>p.close()));await server.close();}
});
