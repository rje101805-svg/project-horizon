import { test, expect, chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
test('WebGL sphere initializes and Canvas fallback remains visible without gameplay errors', async ({ page }) => {
 const browser=await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const gpu=await browser.newPage();
 try{for(const [p,webgl] of [[page,false],[gpu,true]] as const){
  const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:5175');await p.locator('#server-url').fill('http://127.0.0.1:3002');await p.getByRole('button',{name:'Create room',exact:true}).click();await expect(p.locator('canvas')).toBeVisible();
  await expect.poll(()=>p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return !!s.celestial?.fallback;})).toBe(true);
  expect(await p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return !!s.celestial.shader;})).toBe(webgl);
  await p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];s.celestial.planet.x=s.rocket.x+220;s.celestial.planet.y=s.rocket.y;});
  await expect.poll(()=>p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return s.celestial.shader?.visible??s.celestial.fallback.visible;})).toBe(true);
  if(webgl)await p.locator('canvas').screenshot({path:'/tmp/p3s1-planet.png'});
  expect(errors).toEqual([]);
  await p.getByRole('button',{name:'Back to home'}).click();
 }}finally{await browser.close();}
});
