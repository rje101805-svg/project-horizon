import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateStars,SKY_SPAN,skyDensity,nebulaColor,parallaxOffset} from '../src/visual/environment';
test('cached astronomical distribution is deterministic, bounded and dominated by faint stars',()=>{
 const stars=generateStars();assert.deepEqual(stars,generateStars());assert.ok(stars.length>6000&&stars.length<8000);
 assert.equal(stars.filter(s=>s.alpha>.5).length,5);assert.ok(stars.filter(s=>s.alpha<.15).length>stars.length*.65);
 for(const s of stars)assert.ok(s.x>=0&&s.x<SKY_SPAN&&s.y>=0&&s.y<SKY_SPAN&&s.color<4&&s.size<1.5);
 assert.ok(Math.abs(skyDensity(0,0)-skyDensity(1024,1024))>.2);
});
test('parallax fields wrap continuously and cached nebulae stay dark with seam continuity',()=>{
 assert.equal(parallaxOffset(12000,.035),420);assert.equal(parallaxOffset(-100,.1),SKY_SPAN-10);
 for(let i=0;i<20;i++){const u=i/20;for(let c=0;c<3;c++){assert.ok(Math.abs(nebulaColor(0,u)[c]-nebulaColor(1,u)[c])<1e-8);}}
 for(let y=0;y<20;y++)for(let x=0;x<20;x++)for(const c of nebulaColor(x/20,y/20))assert.ok(c>=0&&c<65);
});
