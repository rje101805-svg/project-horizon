import {test,expect,chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
test('four cached biome materials render and clean up in WebGL and Canvas',async({page})=>{
 test.setTimeout(90000);
 const browser=await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const gpu=await browser.newPage();
 try{for(const [p,webgl]of [[page,false],[gpu,true]] as const){
 const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:5175');await p.locator('#server-url').fill('http://127.0.0.1:3002');await p.locator('#create').click();await expect(p.locator('canvas')).toBeVisible();
 await expect.poll(()=>p.evaluate(()=>(window as any).__HORIZON_GAME__.scene.scenes[0].celestial?.bodies.length)).toBe(4);
 await p.keyboard.press('F3');await p.locator('#visual-planet').click();
 for(const biome of ['ice','volcanic','terrestrial','moon']){
 await p.evaluate(b=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];s.celestial.studyBiome=b;for(const body of s.celestial.bodies){body.planet.x=s.rocket.x+240;body.planet.y=s.rocket.y+35;}},biome);
 await expect.poll(()=>p.evaluate(b=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0],body=s.celestial.bodies.find((x:any)=>x.biome===b);return webglState(body);function webglState(body:any){return {visible:body.shader?.visible||body.fallback.visible,compiled:!!body.shader};}},biome)).toEqual({visible:true,compiled:webgl});
 if(webgl)await p.locator('canvas').screenshot({path:`/tmp/p3s2-${biome}.png`});
 }
 const keys=await p.evaluate(()=>Object.keys((window as any).__HORIZON_GAME__.textures.list).filter(k=>/^(surface-|planet-)/.test(k)).sort());expect(keys).toHaveLength(12);
 await p.locator('#visual-quality').selectOption('low');await expect.poll(()=>p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return s.celestial.bodies.every((b:any)=>!b.shader?.visible);})).toBe(true);
 await p.getByRole('button',{name:'Back to home'}).click();await expect.poll(()=>p.evaluate(()=>Object.keys((window as any).__HORIZON_GAME__?.textures?.list??{}).filter(k=>/^(surface-|planet-)/.test(k)))).toEqual([]);
 await p.locator('#create').click();await expect(p.locator('canvas')).toBeVisible();await expect.poll(()=>p.evaluate(()=>Object.keys((window as any).__HORIZON_GAME__.textures.list).filter(k=>/^(surface-|planet-)/.test(k)).sort())).toEqual(keys);expect(errors).toEqual([]);
 }}finally{await browser.close();}
});
