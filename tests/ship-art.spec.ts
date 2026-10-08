import {test,expect} from '@playwright/test';
import {RoomStore} from '../server/rooms';
import {createGameServer} from '../server/game';
import {SHIP_ART} from '../src/visual/ships';
test('eight custom ships retain cross-client assignments, hull pivots and runtime texture cleanup',async({page,context})=>{
const store=new RoomStore(),server=createGameServer(['http://127.0.0.1:5175'],store,{autoTick:false});
await new Promise<void>(r=>server.http.listen(0,'127.0.0.1',r));const address=server.http.address();if(!address||typeof address==='string')throw Error('port');
const peer=await context.newPage();const pages=[page,peer],errors:string[]=[],requests:string[]=[];let tick=0;
const snapshot=()=>page.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return [...s.ships].map(([id,v]:any)=>({id,key:v.art.key,texture:v.sprite.texture.key,visible:v.sprite.visible,origin:[v.sprite.originX,v.sprite.originY],scale:v.sprite.scaleX,rotation:v.sprite.rotation,width:v.sprite.texture.getSourceImage().width,height:v.sprite.texture.getSourceImage().height})).sort((a,b)=>a.id.localeCompare(b.id));});
const frame=async()=>{server.step();tick++;for(const p of pages){if(!await p.evaluate(()=>(window as any).__HORIZON_FLIGHT__?.socket.connected))continue;await p.waitForFunction(t=>(window as any).__HORIZON_FLIGHT__?.latest?.tick===t,tick);}};
try{
 for(const p of pages){p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.url().includes('/assets/ships/'))requests.push(r.url());});await p.goto('/');await p.locator('#server-url').fill(`http://127.0.0.1:${address.port}`);}
 await page.locator('#create').click();await page.locator('canvas').waitFor({state:'visible'});const code=await page.locator('#room-code-display').textContent();await peer.locator('#room-code').fill(code!);await peer.locator('#join').click();await peer.locator('canvas').waitFor({state:'visible'});await frame();
 await page.locator('#fill-game').click();await page.waitForFunction(()=>(window as any).__HORIZON_FLIGHT__.room.participantIds.length===8);await frame();
 const room=store.rooms.get(code!)!,players=[...room.players.values()];const initial=await snapshot();if(new Set(initial.map(p=>p.key)).size!==8)throw Error('Designs not unique');
 const second=await peer.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return [...s.ships].map(([id,v]:any)=>({id,key:v.art.key})).sort((a,b)=>a.id.localeCompare(b.id));});if(JSON.stringify(second)!==JSON.stringify(initial.map(({id,key})=>({id,key}))))throw Error('Client assignments disagree');
 // Test-only snapshot layout shows all supplied hulls at once. No runtime switcher or server source change.
 const center=players[0].state;const positions=[[0,0],[-360,-120],[-140,-120],[100,-120],[340,-120],[-340,120],[-100,120],[180,120]];
 for(const [i,p]of players.entries()){p.state.x=center.x+positions[i][0];p.state.y=center.y+positions[i][1];p.state.teleportSequence++;}await frame();await page.waitForTimeout(500);
 await page.locator('canvas').screenshot({path:'test-results/p3s28-eight-ships.png'});
 // Inspect rotation transforms directly through the existing presentation method.
 const rotations=await page.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0],players=(window as any).__HORIZON_FLIGHT__.latest.players;const observations=[];
 for(const player of players)for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){s.placeShip({...player,rotation:angle});const ship=s.ships.get(player.id),m=ship.sprite.getWorldTransformMatrix(),origin=m.transformPoint(0,0),nose=m.transformPoint(0,-1);observations.push({angle,pivotError:Math.hypot(origin.x-ship.body.x,origin.y-ship.body.y),noseError:Math.hypot(nose.x-origin.x-Math.cos(angle)*ship.sprite.scaleX,nose.y-origin.y-Math.sin(angle)*ship.sprite.scaleY)});}return observations;});
 if(rotations.some(r=>r.pivotError>.001||r.noseError>.001))throw Error('Heading/pivot alignment failed');
 await page.keyboard.press('F3');await page.locator('#visual-quality').selectOption('standard');await page.locator('canvas').screenshot({path:'test-results/p3s28-standard.png'});await page.locator('#visual-quality').selectOption('low');await page.waitForTimeout(100);await page.locator('canvas').screenshot({path:'test-results/p3s28-low.png'});
 await peer.getByRole('button',{name:'Back to home'}).click();await frame();const survivors=await snapshot();for(const s of survivors)if(s.key!==initial.find(p=>p.id===s.id)?.key)throw Error('Departing player reshuffled designs');
 await page.getByRole('button',{name:'Back to home'}).click();await page.waitForFunction(()=>Object.keys((window as any).__HORIZON_GAME__?.textures?.list??{}).filter(k=>k.startsWith('ship-art-')).length===0);
 await page.locator('#create').click();await page.locator('canvas').waitFor({state:'visible'});const reloaded=await page.evaluate(()=>Object.keys((window as any).__HORIZON_GAME__.textures.list).filter(k=>k.startsWith('ship-art-')).length);if(reloaded!==8)throw Error('Texture recreation failed');
 if(errors.length||requests.some(url=>!url.includes('/runtime/')))throw Error('Console/loading regression');
 expect(initial).toHaveLength(8);expect(errors).toEqual([]);expect(requests.length).toBeGreaterThanOrEqual(16);
 for(const participant of initial){const art=SHIP_ART.find(a=>a.key===participant.key)!;expect(participant.width).toBe(art.width);expect(participant.height).toBe(art.height);expect(participant.origin).toEqual([art.originX,art.originY]);expect(participant.rotation).toBe(art.rotationOffset);expect(participant.visible).toBe(true);}

}finally{await peer.close();await page.close();await server.close();}
});
