import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateStars,SKY_SPAN,skyDensity,nebulaColor,parallaxOffset} from '../src/visual/environment';
test('cached astronomical distribution is deterministic, bounded and dominated by faint stars',()=>{
 const stars=generateStars();assert.deepEqual(stars,generateStars());assert.ok(stars.length>6000&&stars.length<8000);
 assert.equal(stars.filter(s=>s.alpha>.5).length,5);assert.ok(stars.filter(s=>s.alpha<.15).length>stars.length*.65);
 for(const s of stars)assert.ok(s.x>=0&&s.x<SKY_SPAN&&s.y>=0&&s.y<SKY_SPAN&&s.color<4&&s.size<1.5);
 assert.ok(Math.abs(skyDensity(0,0)-skyDensity(1024,1024))>.2);
});
test('parallax fields wrap continuously and cached nebulae retain vivid color, dark gaps and seam continuity',()=>{
 assert.equal(parallaxOffset(12000,.035),420);assert.equal(parallaxOffset(-100,.1),SKY_SPAN-10);
 for(let i=0;i<20;i++){const u=i/20;for(let c=0;c<3;c++){assert.ok(Math.abs(nebulaColor(0,u)[c]-nebulaColor(1,u)[c])<1e-8);}}
 for(let y=0;y<20;y++)for(let x=0;x<20;x++)for(const c of nebulaColor(x/20,y/20))assert.ok(c>=0&&c<256);
 const samples=Array.from({length:2500},(_,i)=>Math.max(...nebulaColor(i%50/50,Math.floor(i/50)/50)));assert.ok(samples.filter(c=>c>45).length>samples.length*.25);assert.ok(samples.filter(c=>c<25).length>samples.length*.55);
});
import {DISTANT_BODIES,distantSurface,bakeDistant} from '../src/visual/distant';
test('distant scenery is a restrained, varied client-only set with directional sphere shading',()=>{
 assert.equal(DISTANT_BODIES.length,5);assert.equal(new Set(DISTANT_BODIES.map(b=>b.kind)).size,5);
 assert.ok(DISTANT_BODIES.every(b=>b.parallax<.2&&b.alpha<=.5&&b.size<=180));
 assert.notDeepEqual(distantSurface('gas',.1,.2,.97),distantSurface('ice',.1,.2,.97));
 let output=new Uint8ClampedArray();const ctx={createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:(i:any)=>output=i.data};bakeDistant(ctx as unknown as CanvasRenderingContext2D,64,'rock');
 const pixel=(x:number,y:number)=>output[(y*64+x)*4];assert.ok(pixel(20,20)>pixel(44,44));assert.equal(output[3],0);
});
import {rockOutline} from '../src/visual/debris';
test('rock atlases have bounded irregular silhouettes with deterministic shape variation',()=>{
 assert.deepEqual(rockOutline(32530),rockOutline(32530));assert.notDeepEqual(rockOutline(32530),rockOutline(32531));
 for(let i=0;i<8;i++){const rock=rockOutline(32530+i);assert.ok(rock.length>=7&&rock.length<=10);assert.ok(rock.every(p=>Math.hypot(p.x,p.y)<1));assert.ok(new Set(rock.map(p=>Math.hypot(p.x,p.y).toFixed(3))).size>4);}
});

import {GALAXIES,galaxyPoints} from '../src/visual/cosmos';
test('distant galaxies have varied bounded deterministic structures',()=>{
 assert.equal(GALAXIES.length,5);assert.equal(new Set(GALAXIES.map(g=>g.kind)).size,3);
 for(let i=0;i<5;i++){const points=galaxyPoints(i);assert.equal(points.length,900);assert.deepEqual(points,galaxyPoints(i));assert.ok(points.every(p=>Number.isFinite(p.x+p.y)&&p.alpha<=.4));}
});
