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
