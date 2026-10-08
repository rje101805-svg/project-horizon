import {test} from 'node:test';import assert from 'node:assert/strict';
import {PLANET_REGIONS,LANDMARKS,mapPoint} from '../src/visual/solar-layout';import {WORLD} from '../shared/flight';
test('deterministic four biome regions fit separate corners with open corridors',()=>{
 assert.equal(PLANET_REGIONS.length,4);assert.equal(new Set(PLANET_REGIONS.map(p=>p.biome)).size,4);assert.equal(new Set(PLANET_REGIONS.map(p=>`${p.x>WORLD/2}:${p.y>WORLD/2}`)).size,4);
 for(const p of PLANET_REGIONS){assert.ok(p.x-p.radius>0&&p.y-p.radius>0&&p.x+p.radius<WORLD&&p.y+p.radius<WORLD);assert.ok(Math.hypot(p.x-WORLD/2,p.y-WORLD/2)>p.radius+1000);}
 for(const [i,a]of PLANET_REGIONS.entries())for(const b of PLANET_REGIONS.slice(i+1))assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>a.radius+b.radius+1000);
 assert.ok(PLANET_REGIONS.find(p=>p.biome==='moon')!.radius<Math.min(...PLANET_REGIONS.filter(p=>p.biome!=='moon').map(p=>p.radius)));
 for(const x of [0,WORLD])for(const y of [0,WORLD])assert.ok(LANDMARKS.some(p=>Math.hypot(p.x-x,p.y-y)<1500));
 for(const p of LANDMARKS)assert.ok(p.x>0&&p.y>0&&p.x<WORLD&&p.y<WORLD);
});
test('minimap mapping is accurate at center, each boundary and planetary landmarks',()=>{
 assert.deepEqual(mapPoint(0,0,WORLD),{x:0,y:0});assert.deepEqual(mapPoint(WORLD,WORLD,WORLD),{x:150,y:150});assert.deepEqual(mapPoint(WORLD/2,WORLD/2,WORLD),{x:75,y:75});assert.deepEqual(mapPoint(-1,WORLD+1,WORLD),{x:0,y:150});for(const p of PLANET_REGIONS)assert.equal(mapPoint(p.x,p.y,WORLD).x,p.x/WORLD*150);
});
