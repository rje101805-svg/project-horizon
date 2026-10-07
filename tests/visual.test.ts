import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraTarget,easeZoom,seededRandom,PARALLAX } from '../src/visual/config';
test('cinematic camera never reveals more than accepted FOV, converges without overshoot and bounds stalls',()=>{
 for(const combat of [false,true])for(const speed of [0,290,440,10000]){const target=cameraTarget(speed,combat);assert.ok(target>=1&&target<=1.014);let z=1;for(let i=0;i<100;i++){const next=easeZoom(z,target,16);assert.ok(next>=z&&next<=target);z=next;}}
 assert.equal(easeZoom(1,0,1000),1);assert.equal(easeZoom(1,2,1000),easeZoom(1,2,100));assert.equal(easeZoom(1,1.014,-5),1);
});
test('seeded visual distribution is reproducible and parallax depth factors remain distinct',()=>{
 const a=seededRandom(),b=seededRandom();for(let i=0;i<100;i++)assert.equal(a(),b());assert.ok(PARALLAX.stars<PARALLAX.haze&&PARALLAX.haze<PARALLAX.bodies&&PARALLAX.dust>1);
});
import { horizonDirection,shadeNormal,visibleCircle } from '../src/visual/lighting';
test('celestial light is directional, bounded, cool at baseline and warm facing Horizon',()=>{
 const direction=horizonDirection({x:0,y:0},{x:100,y:0});assert.ok(direction[0]>0);assert.ok(Math.abs(Math.hypot(...direction)-1)<1e-9);
 const lit=shadeNormal([1,0,0],direction,1),dark=shadeNormal([-1,0,0],direction,1);assert.ok(lit[0]>dark[0]);assert.ok(lit[0]>lit[2]);
 const cool=shadeNormal([-.65,-.42,.63],direction,0);assert.ok(cool[2]>cool[0]);for(const c of [...lit,...dark,...cool])assert.ok(c>=0&&c<=.55);
 assert.deepEqual(shadeNormal([1,0,0],direction,99),lit);
});
test('celestial culling preserves partially visible limbs and removes wholly offscreen bodies',()=>{
 const view={left:0,right:100,top:0,bottom:100};assert.equal(visibleCircle(view,{x:130,y:50},31),true);assert.equal(visibleCircle(view,{x:130,y:50},29),false);
});

import { blendIntensity,lensRegion,advancedEnabled } from '../src/visual/intensity';
test('visual intensity eases independently, clamps inputs and never advances gameplay time',()=>{
 let value=0;for(let n=0;n<100;n++){const next=blendIntensity(value,1,16);assert.ok(next>=value&&next<=1);value=next;}
 assert.ok(value>.96);assert.equal(blendIntensity(.3,1,0),.3);assert.ok(blendIntensity(0,99,100000)<=blendIntensity(0,1,100)+1e-9);assert.equal(blendIntensity(NaN,NaN,16),0);
});
test('lensing region is bounded by the viewport at enormous apparent scales',()=>{
 const view={left:0,right:1100,top:0,bottom:600};assert.deepEqual(lensRegion(view,{x:500,y:300},100000),{x:550,y:300,width:1100,height:600});assert.equal(lensRegion(view,{x:2000,y:1500},90),null);
 assert.equal(advancedEnabled(false,true,'standard'),false);assert.equal(advancedEnabled(true,false,'standard'),false);assert.equal(advancedEnabled(true,true,'low'),false);assert.equal(advancedEnabled(true,true,'standard'),true);
});
