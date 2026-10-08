import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SHIP_HITBOX_RADIUS} from '../shared/ship-geometry';
import {BASIC_BLASTER,circleEntry} from '../shared/projectiles';
import {RoomStore} from '../server/rooms';
import {fire,advanceProjectiles} from '../server/projectiles';
import {MAX_SHIELD} from '../shared/combat';
import {SHIP_COLORS} from '../shared/rooms';

test('each authoritative appearance slot uses the same swept projectile body radius',()=>{
 assert.equal(BASIC_BLASTER.shipRadius,SHIP_HITBOX_RADIUS);
 for(const [index,color] of SHIP_COLORS.entries()){
  for(const outside of [false,true]){
   const store=new RoomStore();store.create('a','Shooter',0);const room=store.roomFor('a')!;store.join('b',room.code,'Target',0);
   const a=room.players.get('a')!,b=room.players.get('b')!;
   const separation=SHIP_HITBOX_RADIUS+BASIC_BLASTER.projectileRadius+(outside ? .1 : -.1);
   Object.assign(a.state,{x:1000,y:1800+separation,vx:0,vy:0});Object.assign(b.state,{x:1040,y:1800,color,vx:0,vy:0});
   assert.ok(fire(room,a,{sequence:1,aim:0,lifeGeneration:0,teleportSequence:0},0).ok);
   advanceProjectiles(room);
   assert.equal(b.state.shield,outside?MAX_SHIELD:MAX_SHIELD-BASIC_BLASTER.damage,`slot ${index}, outside ${outside}`);
   assert.equal(room.projectiles.size,outside?1:0);
  }
 }
});
test('combined body/projectile geometry includes tangent and rejects an exterior graze',()=>{
 const r=SHIP_HITBOX_RADIUS+BASIC_BLASTER.projectileRadius;
 assert.equal(circleEntry({x:-100,y:r},{x:100,y:r},{x:0,y:0},r),.5);
 assert.equal(circleEntry({x:-100,y:r+.01},{x:100,y:r+.01},{x:0,y:0},r),null);
});
