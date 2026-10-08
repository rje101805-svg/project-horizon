import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SHIP_ART,shipArtForColor} from '../src/visual/ships';
import {SHIP_COLORS} from '../shared/rooms';

test('replicated room-color slots bind eight unique designs independent of client ordering',()=>{
 assert.equal(SHIP_ART.length,8);
 const bindings=new Map(SHIP_COLORS.map(color=>[color,shipArtForColor(color)]));
 assert.equal(new Set([...bindings.values()].map(art=>art.key)).size,8);
 for(const color of [...SHIP_COLORS].reverse())assert.equal(shipArtForColor(color),bindings.get(color));
 // A departure and later new occupant cannot shift the surviving color slots.
 for(const color of SHIP_COLORS.slice(1))assert.equal(shipArtForColor(color),bindings.get(color));
 assert.equal(shipArtForColor(-1),SHIP_ART[0]);
});
test('runtime PNG headers and editable hull-centered geometry match the loaded roster',()=>{
 for(const art of SHIP_ART){
  const png=readFileSync(new URL(`../public/assets/ships/runtime/${art.sourceFilename}`,import.meta.url));
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(png.readUInt32BE(16),art.width);assert.equal(png.readUInt32BE(20),art.height);
  assert.ok(art.width>0&&art.height>0&&Math.max(art.width,art.height)===256);
  assert.equal(png[25],6); // RGBA, not an opaque RGB export.
  assert.ok(art.originX>.4&&art.originX<.6&&art.originY>=.4&&art.originY<=.5);
  assert.ok(art.visualScale>0&&art.noseOffset>14&&art.noseOffset<=30);
  assert.equal(art.rotationOffset,Math.PI/2);
  // Upward image-space nose becomes rightward at gameplay heading zero.
  assert.ok(Math.abs(Math.sin(art.rotationOffset)-1)<1e-10);
 }
});
