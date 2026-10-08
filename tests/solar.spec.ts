import {test,expect,chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
test('four cached biome materials render and clean up in WebGL and Canvas',async({page})=>{
 // Two renderer runs, four captures each, 150 rendered frames and repeated bakes
 // exceed two minutes on software GPUs. Keep all assertions and sample counts.
 test.setTimeout(180000);
 const browser=await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 const gpu=await browser.newPage();
 try{for(const [p,webgl]of [[page,false],[gpu,true]] as const){
 const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:5175');await p.locator('#server-url').fill('http://127.0.0.1:3002');const started=Date.now();await p.locator('#create').click();await expect(p.locator('canvas')).toBeVisible({timeout:15000});console.log('P3S2.6 cold scene readiness ms',webgl?'SwiftShader':'Canvas',Date.now()-started);
 await expect.poll(()=>p.evaluate(()=>(window as any).__HORIZON_GAME__.scene.scenes[0].celestial?.bodies.length)).toBe(4);
 if(webgl)await expect.poll(()=>p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return s.celestial.bodies.every((b:any)=>b.shader?.uniforms.atmospherePulse.value>=.97&&b.shader.uniforms.atmospherePulse.value<=1);})).toBe(true);
 await p.keyboard.press('F3');await p.locator('#visual-planet').click();
 for(const biome of ['ice','volcanic','terrestrial','moon']){
 await p.locator('#visual-biome').selectOption(biome);
 await expect.poll(()=>p.evaluate(b=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0],body=s.celestial.bodies.find((x:any)=>x.biome===b);return webglState(body);function webglState(body:any){return {visible:body.shader?.visible||body.fallback.visible,compiled:!!body.shader};}},biome)).toEqual({visible:true,compiled:webgl});
 if(webgl)await p.locator('canvas').screenshot({path:`/tmp/p3s26-${biome}.png`});
 console.log('P3S2.6 material verified',webgl?'SwiftShader':'Canvas',biome,Date.now()-started);
 }
 // Observe actual renderer intervals under eight-participant combat; no artificial FPS assertion.
 await p.locator('#visual-biome').selectOption('terrestrial');await p.locator('#fill-game').click();await expect.poll(()=>p.evaluate(()=>(window as any).__HORIZON_FLIGHT__.latest?.players.length)).toBe(8);await p.locator('#start-match').click();await expect.poll(()=>p.evaluate(()=>(window as any).__HORIZON_FLIGHT__.latest?.match.state)).toBe('active');
 const measured=await p.evaluate(()=>new Promise<{frames:number;meanMs:number;p95Ms:number;activeFrames:number}>(resolve=>{const game=(window as any).__HORIZON_GAME__,s=game.scene.scenes[0],samples:number[]=[];let previous=performance.now(),warmup=30,activeFrames=0;const frame=()=>{const now=performance.now(),dt=now-previous;previous=now;if(warmup-->0)return;samples.push(dt);if(s.connection.latest?.match.state==='active')activeFrames++;if(samples.length===120){game.events.off('postrender',frame);const sorted=[...samples].sort((a,b)=>a-b);resolve({frames:samples.length,meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,p95Ms:sorted[Math.floor(samples.length*.95)],activeFrames});}};game.events.on('postrender',frame);}));
 console.log('P3S2.6 software renderer observation',JSON.stringify({renderer:webgl?'SwiftShader Standard':'Canvas Low',...measured}));
 const keys=await p.evaluate(()=>Object.keys((window as any).__HORIZON_GAME__.textures.list).filter(k=>/^(surface-|planet-)/.test(k)).sort());expect(keys).toHaveLength(12);
 await p.locator('#visual-quality').selectOption('low');await expect.poll(()=>p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return s.celestial.bodies.every((b:any)=>!b.shader?.visible);})).toBe(true);
 await p.getByRole('button',{name:'Back to home'}).click();await expect.poll(()=>p.evaluate(()=>Object.keys((window as any).__HORIZON_GAME__?.textures?.list??{}).filter(k=>/^(surface-|planet-)/.test(k)))).toEqual([]);
 await p.locator('#create').click();await expect(p.locator('canvas')).toBeVisible({timeout:15000});await expect.poll(()=>p.evaluate(()=>Object.keys((window as any).__HORIZON_GAME__.textures.list).filter(k=>/^(surface-|planet-)/.test(k)).sort())).toEqual(keys);expect(errors).toEqual([]);
 console.log('P3S2.6 renderer cleanup/recreation verified',webgl?'SwiftShader':'Canvas',Date.now()-started);
 await p.close(); // Do not render the completed Canvas scene alongside SwiftShader.
 }}finally{await browser.close();}
});
