import {test,expect} from '@playwright/test';
import {createGameServer} from '../server/game';
import {RoomStore} from '../server/rooms';
import {refillAmmo} from '../server/combat';
import type {FlightConnection} from '../src/network';
import type {FireResult} from '../shared/projectiles';
type Trace={requests:{sequence:number;at:number}[];adds:number[];results:FireResult[];
 frames:{shots:{sequence:number;x:number;y:number}[];pending:number}[]};
type DebugWindow=Window & {__HORIZON_FLIGHT__:FlightConnection;__handoffTrace:Trace};
for(const lag of [false,true])test(`ten Space taps and held fire preserve one continuous visual per shot (${lag?'150ms + jitter':'no fake latency'})`,async({page})=>{
 const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store);
 await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));const address=server.http.address();if(!address || typeof address==='string')throw new Error('Missing server');
 try{
  await page.goto('/');await page.locator('#server-url').fill(`http://127.0.0.1:${address.port}`);await page.locator('#create').click();await expect(page.locator('canvas')).toBeVisible();
  const id=await page.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.socket.id);
  const room=store.roomFor(id!)!,p=room.players.get(id!)!;
  Object.assign(p.state,{x:200,y:1800});p.state.teleportSequence++;
  await expect.poll(()=>page.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.players[0].teleportSequence)).toBe(1);
  if(lag){await page.keyboard.press('F3');await page.locator('#fake-lag').check();await page.keyboard.press('F3');}
  await page.evaluate(()=>{
   const w=window as unknown as DebugWindow,c=w.__HORIZON_FLIGHT__,prediction=c.projectilePrediction;
   const trace:Trace=w.__handoffTrace={requests:[],adds:[],results:[],frames:[]};
   c.socket.onAnyOutgoing((event,...args)=>{if(event==='fire')trace.requests.push({sequence:args[0].sequence,at:performance.now()});});
   const add=prediction.add.bind(prediction);prediction.add=(r,p,now)=>{const ok=add(r,p,now);if(ok)trace.adds.push(r.sequence);return ok;};
   const result=prediction.result.bind(prediction);prediction.result=(r,s)=>{trace.results.push(r);result(r,s);};
   const render=prediction.render.bind(prediction);prediction.render=(a,now)=>{
    const visuals=render(a,now);trace.frames.push({pending:prediction.count(now),shots:visuals.map(v=>({
     sequence:v.id.startsWith('predicted:')?Number(v.id.split(':').at(-1)):a.find(p=>p.id===v.id)!.shotSequence,x:v.x,y:v.y
    }))});return visuals;
   };
  });
  for(let n=0;n<10;n++){
   await page.keyboard.down('Space');await page.waitForTimeout(60);await page.keyboard.up('Space');
   await page.waitForTimeout(lag?440:300);
  }
  await expect.poll(()=>room.projectileSequence).toBe(10);
  await expect.poll(()=>page.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.projectilePrediction.count(performance.now()))).toBe(0);
  const taps=await page.evaluate(()=>(window as unknown as DebugWindow).__handoffTrace);
  expect(taps.requests).toHaveLength(10);expect(taps.adds).toEqual([1,2,3,4,5,6,7,8,9,10]);
  expect(taps.results.filter(r=>r.ok)).toHaveLength(10);expect(taps.results.filter(r=>!r.ok)).toHaveLength(0);expect(p.state.ammo).toBe(2);
  const assertFrames=(trace:Trace,continuous:boolean)=>{
   const last=new Map<number,number>();let reversals=0;
   for(const frame of trace.frames){
    expect(new Set(frame.shots.map(s=>s.sequence)).size).toBe(frame.shots.length);
    for(const s of frame.shots){if(continuous && last.has(s.sequence) && s.x<last.get(s.sequence)!-.01)reversals++;last.set(s.sequence,s.x);}
   }
   expect(reversals).toBe(0);
  };
  assertFrames(taps,true);
  refillAmmo(p);await expect.poll(()=>page.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.latest?.players[0].ammo)).toBe(12);
  if(lag)await page.keyboard.down('d'); // Representative moving fire with latency/jitter.
  await page.keyboard.down('Space');await page.waitForTimeout(1200);await page.keyboard.up('Space');if(lag)await page.keyboard.up('d');
  await page.waitForTimeout(lag?400:100);
  const all=await page.evaluate(()=>(window as unknown as DebugWindow).__handoffTrace),accepted=all.results.filter((r):r is Extract<FireResult,{ok:true}>=>r.ok);
  const held=accepted.filter(r=>r.sequence>10);expect(held.length).toBeGreaterThanOrEqual(lag?3:4);expect(held.length).toBeLessThanOrEqual(7);
  for(let i=1;i<held.length;i++)expect(held[i].spawnTick-held[i-1].spawnTick).toBeGreaterThanOrEqual(6);
  expect(p.state.ammo).toBe(12-held.length);expect(new Set(all.requests.map(r=>r.sequence)).size).toBe(all.requests.length);
  assertFrames(all,true);expect(await page.evaluate(()=>(window as unknown as DebugWindow).__HORIZON_FLIGHT__.projectilePrediction.count(performance.now()))).toBe(0);
  expect(p.state.health).toBe(100);expect(p.state.shield).toBe(50);
  // All misses and temporary visuals disappear; no indefinite accumulation.
  await expect.poll(()=>room.projectiles.size,{timeout:4000}).toBe(0);
 }finally{await page.close();await server.close();}
});
