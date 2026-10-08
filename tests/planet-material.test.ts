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
import {reliefNormal} from '../src/visual/planet-material';
test('crater relief normals follow the sphere basis and both directional lights',()=>{
 const n=[.6,0,.8];assert.deepEqual(reliefNormal(...n as [number,number,number],[0,0,1]),n);
 const bent=reliefNormal(0,0,1,[-.6,0,.8]);assert.deepEqual(bent,[-.6,0,.8]);assert.ok(Math.abs(Math.hypot(...reliefNormal(.3,.4,Math.sqrt(.75),[.2,-.3,.93]))-1)<1e-9);
 const map={width:2,height:2,data:new Uint8ClampedArray(16).fill(150)},clouds={...map,data:new Uint8ClampedArray(16)};
 const detail=(left:boolean)=>({...map,data:new Uint8ClampedArray(Array.from({length:4},()=>[left?51:204,128,230,255]).flat())});
 const bake=(left:boolean,warm:readonly number[],intensity:number)=>{let output=new Uint8ClampedArray();const ctx={createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:(i:any)=>output=i.data};bakeMaterial(ctx as unknown as CanvasRenderingContext2D,32,'moon',map,clouds,warm,intensity,detail(left));return output[(16*32+16)*4];};
 assert.ok(bake(true,[1,0,0],0)>bake(false,[1,0,0],0));
 assert.ok(bake(false,[1,0,0],1)>bake(true,[1,0,0],1));
 assert.ok(bake(true,[-1,0,0],1)>bake(false,[-1,0,0],1));
});

import {sampleSurfaceLinear} from '../src/visual/planet-material';
test('CPU source sampling interpolates before sphere magnification and reuses output storage',()=>{
 const map={width:3,height:2,data:new Uint8ClampedArray([0,0,0,255,100,100,100,255,0,0,0,255,100,100,100,255,200,200,200,255,100,100,100,255])},out=[0,0,0,0];
 sampleSurfaceLinear(map,.25,.5,out);assert.ok(Math.abs(out[0]-100/255)<1e-9);assert.equal(out[3],1);
 const wrap=[0,0,0,0];sampleSurfaceLinear(map,1.25,.5,wrap);assert.deepEqual(out,wrap);
});
