import {test,expect,chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
for(const webgl of [false,true])test(`unavailable custom planets retain procedural ${webgl?'WebGL':'Canvas'} fallback`,async({page})=>{
 const browser=webgl?await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']}):null;
 const p=browser?await browser.newPage():page,errors:string[]=[];
 try{
  p.on('pageerror',e=>errors.push(e.message));await p.route('**/assets/planets/*.png',route=>route.abort());
  await p.goto('http://127.0.0.1:5175');await p.locator('#server-url').fill('http://127.0.0.1:3002');await p.locator('#create').click();await expect(p.locator('canvas')).toBeVisible({timeout:15000});
  expect(await p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return s.celestial.bodies.map((b:any)=>({custom:b.custom,compiled:!!b.shader,texture:b.fallback.texture.key}));})).toEqual(['ice-prototype','planet-volcanic-bake','planet-terrestrial-bake','planet-moon-bake'].map(texture=>({custom:false,compiled:webgl,texture})));
  await p.keyboard.press('F3');await p.locator('#visual-planet').click();
  await expect.poll(()=>p.evaluate(()=>{const b=(window as any).__HORIZON_GAME__.scene.scenes[0].celestial.bodies[0];return {image:b.fallback.visible,shader:!!b.shader?.visible};})).toEqual({image:!webgl,shader:webgl});
  await p.locator('#visual-quality').selectOption('low');await expect.poll(()=>p.evaluate(()=>{const b=(window as any).__HORIZON_GAME__.scene.scenes[0].celestial.bodies[0];return {image:b.fallback.visible,shader:!!b.shader?.visible};})).toEqual({image:true,shader:false});expect(errors).toEqual([]);
 }finally{await p.close();await browser?.close();}
});
