import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BIOMES,atmosphere,sampleSurface,bakeMaterial} from '../src/visual/planet-material';
test('all geological identities have distinct atmosphere and longitude wraps',()=>{
 assert.deepEqual(BIOMES,['ice','volcanic','terrestrial','moon']);assert.deepEqual(atmosphere('moon'),[0,0,0]);assert.notDeepEqual(atmosphere('ice'),atmosphere('volcanic'));
 const map={width:3,height:1,data:new Uint8ClampedArray([10,20,30,255,40,50,60,255,10,20,30,255])};assert.deepEqual(sampleSurface(map,0,.5),sampleSurface(map,1,.5));assert.deepEqual(sampleSurface(map,-.5,.5),sampleSurface(map,.5,.5));
});
test('CPU material fallback preserves volcanic emission in shadow and moon has no atmospheric halo',()=>{
 const map={width:2,height:2,data:new Uint8ClampedArray(16).fill(255)},clouds={...map,data:new Uint8ClampedArray(16)};
 const bake=(biome:typeof BIOMES[number])=>{let output:any;const ctx={createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:(i:any)=>output=i.data};bakeMaterial(ctx as unknown as CanvasRenderingContext2D,64,biome,map,clouds,[1,0,0],0);return output as Uint8ClampedArray;};
 const lava=bake('volcanic'),moon=bake('moon');const shadow=(48*64+48)*4;assert.ok(lava[shadow]>moon[shadow]);assert.ok([...moon].every(Number.isFinite));
 // Top pixel lies in atmospheric shell, outside solid sphere.
 assert.equal(moon[(1*64+32)*4+3],0);assert.ok(bake('ice')[(1*64+32)*4+3]>0);
});
