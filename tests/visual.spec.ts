import { test, expect, chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
test('WebGL sphere initializes and Canvas fallback remains visible without gameplay errors', async ({ page }) => {
 test.setTimeout(60000);
 const browser=await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 const gpu=await browser.newPage();
 try{for(const [p,webgl] of [[page,false],[gpu,true]] as const){
  const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:5175');await p.locator('#server-url').fill('http://127.0.0.1:3002');await p.getByRole('button',{name:'Create room',exact:true}).click();await expect(p.locator('canvas')).toBeVisible();
  await expect.poll(()=>p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return !!s.celestial?.fallback;})).toBe(true);
  expect(await p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return !!s.celestial.shader;})).toBe(webgl);
  await p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];s.celestial.planet.x=s.rocket.x+220;s.celestial.planet.y=s.rocket.y;});
  await expect.poll(()=>p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return s.celestial.shader?.visible??s.celestial.fallback.visible;})).toBe(true);
  await p.keyboard.press('F3');await expect(p.locator('#visual-controls')).toBeVisible();
  await p.locator('#visual-horizon').click();
  await expect.poll(()=>p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return !!s.previewHorizon?.core.visible;})).toBe(true);
  expect(await p.evaluate(()=>!!(window as any).__HORIZON_GAME__.scene.scenes[0].previewHorizon.lens)).toBe(webgl);
  await p.locator('#visual-intensity').fill('1');
  await expect.poll(()=>p.evaluate(()=>(window as any).__HORIZON_GAME__.scene.scenes[0].visualIntensity.current),{timeout:15000}).toBeGreaterThan(.95);
  if(webgl)await p.locator('canvas').screenshot({path:'/tmp/p3s1-horizon.png'});
  await p.locator('#visual-quality').selectOption('low');
  await expect.poll(()=>p.evaluate(()=>{const s=(window as any).__HORIZON_GAME__.scene.scenes[0];return !s.previewHorizon.lens?.visible&&s.previewHorizon.disk.visible;})).toBe(true);
  await p.locator('#visual-planet').click();
  await expect.poll(()=>p.evaluate(()=>(window as any).__HORIZON_GAME__.scene.scenes[0].celestial.fallback.visible)).toBe(true);
  expect(errors).toEqual([]);
  await p.getByRole('button',{name:'Back to home'}).click();
 }}finally{await browser.close();}
});
