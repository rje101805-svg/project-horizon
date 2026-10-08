import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateStars,SKY_SPAN,skyDensity,parallaxOffset} from '../src/visual/environment';
test('cached astronomical distribution is deterministic, bounded and dominated by faint stars',()=>{
 const stars=generateStars();assert.deepEqual(stars,generateStars());assert.ok(stars.length>12000&&stars.length<17000);
 assert.ok(stars.filter(s=>s.alpha>.5).length>100);assert.ok(stars.filter(s=>s.alpha<.24).length>stars.length*.65);
 for(const s of stars)assert.ok(s.x>=0&&s.x<SKY_SPAN&&s.y>=0&&s.y<SKY_SPAN&&s.color<4&&s.size<1.5);
 assert.ok(Math.abs(skyDensity(0,0)-skyDensity(1024,1024))>.2);
});
test('distant parallax fields wrap continuously through negative and positive travel',()=>{
 assert.equal(parallaxOffset(12000,.035),420);assert.equal(parallaxOffset(-100,.1),SKY_SPAN-10);
 assert.equal(parallaxOffset(SKY_SPAN/.035,.035),0);
});
import {DISTANT_BODIES,distantSurface,bakeDistant} from '../src/visual/distant';
test('distant scenery is a restrained, varied client-only set with directional sphere shading',()=>{
 assert.equal(DISTANT_BODIES.length,11);assert.equal(new Set(DISTANT_BODIES.map(b=>b.kind)).size,11);
 assert.ok(DISTANT_BODIES.every(b=>b.parallax<.2&&b.alpha<=.9&&b.size<=210));
 assert.notDeepEqual(distantSurface('gas',.1,.2,.97),distantSurface('ice',.1,.2,.97));
 let output=new Uint8ClampedArray();const ctx={createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:(i:any)=>output=i.data};bakeDistant(ctx as unknown as CanvasRenderingContext2D,64,'rock');
 const pixel=(x:number,y:number)=>output[(y*64+x)*4];assert.ok(pixel(20,20)>pixel(44,44));assert.equal(output[3],0);
});
import {rockOutline} from '../src/visual/debris';
test('rock atlases have bounded irregular silhouettes with deterministic shape variation',()=>{
 assert.deepEqual(rockOutline(32530),rockOutline(32530));assert.notDeepEqual(rockOutline(32530),rockOutline(32531));
 for(let i=0;i<8;i++){const rock=rockOutline(32530+i);assert.ok(rock.length>=7&&rock.length<=10);assert.ok(rock.every(p=>Math.hypot(p.x,p.y)<1));assert.ok(new Set(rock.map(p=>Math.hypot(p.x,p.y).toFixed(3))).size>4);}
});

import {COSMIC_IMAGES,maskCosmicPixels} from '../src/visual/cosmos';
test('production galaxies are unique, small, separated and keep source radiance without black rectangles',()=>{
 assert.equal(COSMIC_IMAGES.length,8);assert.equal(new Set(COSMIC_IMAGES.map(p=>p.file)).size,8);
 assert.equal(COSMIC_IMAGES.filter(p=>p.kind==='nebula').length,4);
 assert.ok(COSMIC_IMAGES.filter(p=>p.kind==='galaxy').every(p=>p.width<=290&&p.parallax<=.07&&p.alpha<.8));
 assert.ok(COSMIC_IMAGES.filter(p=>p.kind==='nebula').every(p=>p.width<=500&&p.parallax<=.10));
 const pixels=new Uint8ClampedArray([1,2,1,255,100,50,20,255,255,200,150,255]);maskCosmicPixels(pixels);
 assert.deepEqual([...pixels.slice(0,4)],[0,0,0,0]);
 for(const [i,original]of [[4,[100,50,20]],[8,[255,200,150]]] as const)
  for(let c=0;c<3;c++)assert.ok(Math.abs(pixels[i+c]*pixels[i+3]/255-(original[c]-5))<1.5);
});

import {sampleMeteor,type MeteorFrame} from '../src/visual/stellar-motion';
test('rare shooting stars have a bounded short life, directional trail, fade and no spawned entities',()=>{
 const out:MeteorFrame={x:0,y:0,tailX:0,tailY:0,alpha:0,color:0};
 assert.equal(sampleMeteor(4999,1100,600,out),false);assert.equal(sampleMeteor(5250,1100,600,out),true);assert.ok(out.alpha>0&&out.alpha<=.52);assert.ok(Math.hypot(out.x-out.tailX,out.y-out.tailY)<=35);
 assert.equal(sampleMeteor(5550,1100,600,out),false);assert.equal(sampleMeteor(22999,1100,600,out),false);assert.equal(sampleMeteor(23250,550,300,out),true);assert.ok(out.x>=0&&out.x<=550&&out.y>=0&&out.y<=300);assert.equal(sampleMeteor(NaN,1100,600,out),false);
});

import {COSMIC_CLUSTERS} from '../src/visual/cosmos';
test('four new asteroid groups remain small, localized and on decorative depths',()=>{
 assert.equal(COSMIC_CLUSTERS.length,4);assert.equal(COSMIC_CLUSTERS.reduce((n,g)=>n+g.count,0),44);assert.ok(COSMIC_CLUSTERS.every(g=>g.parallax>0&&g.parallax<.3));
});
