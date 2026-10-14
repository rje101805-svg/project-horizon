import {startActiveFixture as startMatch,replayFixture} from './active-fixture';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORLD, EDGE_MARGIN, idleInput, stepFlight } from '../shared/flight';
import {ActiveFixtureStore as RoomStore} from './active-fixture';

import { advanceBots } from '../server/bots';
import { fire, advanceProjectiles } from '../server/projectiles';
test('expanded bounds support all corners without changing flight speed',()=>{
 assert.equal(WORLD,18692);const bounds:number[]=[EDGE_MARGIN,WORLD-EDGE_MARGIN];
 for(const x of bounds)for(const y of bounds){
 const p={x,y,vx:0,vy:0,rotation:0};for(let i=0;i<90;i++)stepFlight(p,{...idleInput(),right:x>WORLD/2,left:x<WORLD/2,down:y>WORLD/2,up:y<WORLD/2});assert.equal(p.x,x);assert.equal(p.y,y);
 }
});
test('eight clustered participants and local-only bot pursuit remain authoritative',()=>{
 const store=new RoomStore();store.create('a','A',0);const room=store.roomFor('a')!;assert.ok(store.fill(room,'a',{roomCode:room.code,round:0}).ok);
 const players=[...room.players.values()];assert.equal(players.length,8);for(const p of players)assert.ok(Math.hypot(p.state.x-1370,p.state.y-1200)<650);
 startMatch(room,'a',{round:0});const bot=players[1];for(const other of players.slice(2))other.gameplayEnabled=false;Object.assign(players[0].state,{x:11000,y:11000});advanceBots(room,0,1);assert.equal(bot.state.bot?.target,null);assert.equal(bot.state.bot?.fire,false);assert.ok(bot.pendingInputs.length);
});
test('projectiles travel beyond old arena and stop at expanded boundary',()=>{
 const store=new RoomStore();store.create('a','A',0);const room=store.roomFor('a')!,p=room.players.get('a')!;
 Object.assign(p.state,{x:11000,y:10000});const result=fire(room,p,{sequence:1,aim:0,lifeGeneration:0,teleportSequence:0},0);assert.ok(result.ok);advanceProjectiles(room);assert.equal(room.projectiles.size,1);
 const bullet=[...room.projectiles.values()][0];bullet.x=WORLD-1;advanceProjectiles(room);assert.equal(room.projectiles.size,0);
});
