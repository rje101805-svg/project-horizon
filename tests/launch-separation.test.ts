import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RoomStore} from '../server/rooms';
import {startMatch,advanceMatch,matchSnapshot,resetRound} from '../server/match';
import {applyDamage} from '../server/combat';
import {fire} from '../server/projectiles';
import {botAware,botHands,selectBotStrategy,selectSurvivalStrategy} from '../server/bots';
import {WORLD,WORLD_SCALE,BASE_WORLD,REGULAR_EFFECTIVE_REACH,PACKING_SEPARATION,LANDING_MARGIN,DEFAULT_CAMERA_WIDTH} from '../shared/world';
import {LAUNCH_D_MIN,LAUNCH_ORIGIN,launchPose,selectLandingZones} from '../shared/launch';
import {LOOT_CONFIG} from '../shared/loot';
import {PLANET_REGIONS} from '../shared/planets';
import {MAP_DIAGONAL,HORIZON_CONFIG,HORIZON_CORNERS,horizonAt} from '../shared/horizon';
const launch=()=>{const store=new RoomStore();store.play('host','Host','fill',0);const room=store.roomFor('host')!;assert.ok(startMatch(room,'host',{round:0}).ok);advanceMatch(room,3000);advanceMatch(room,4800);advanceMatch(room,9200);return {store,room,host:room.players.get('host')!,bot:[...room.players.values()].find(p=>p.state.controllerType==='BOT')!};};
test('actual eight-ship arrivals satisfy all 28 distances and have accessible paired starter loot',()=>{
 const {room}=launch(),players=[...room.players.values()];let pairs=0,min=Infinity;
 for(const p of players){assert.deepEqual({x:p.state.x,y:p.state.y},room.match.launchDestinations[p.state.id]);for(const kind of ['weapon','ammo'])assert.ok([...room.loot!.pickups.values()].some(item=>item.kind===kind&&Math.hypot(item.x-p.state.x,item.y-p.state.y)<300));}
 for(let i=0;i<8;i++)for(let j=i+1;j<8;j++){const d=Math.hypot(players[i].state.x-players[j].state.x,players[i].state.y-players[j].state.y);assert.ok(d>=LAUNCH_D_MIN);assert.ok(d>REGULAR_EFFECTIVE_REACH&&d>2*DEFAULT_CAMERA_WIDTH);min=Math.min(min,d);pairs++;}
 assert.equal(pairs,28);assert.ok(Math.abs(min-8304.45884355808)<1e-8);assert.equal(room.loot!.pickups.size,140);const mix={blaster:0,smg:0,shotgun:0,zapper:0,missile:0};for(const item of room.loot!.pickups.values())if(item.kind==='weapon')mix[item.weapon.class]++;assert.deepEqual(mix,{blaster:20,smg:18,shotgun:16,zapper:10,missile:6});
 for(const item of room.loot!.pickups.values()){assert.ok(item.x>=20&&item.y>=20&&item.x<=WORLD-20&&item.y<=WORLD-20);assert.ok(PLANET_REGIONS.every(p=>Math.hypot(item.x-p.x,item.y-p.y)>p.radius));}
 const copy=matchSnapshot(room);copy.launchDestinations.host.x=0;assert.notEqual(room.match.launchDestinations.host.x,0);
});
test('map is minimum integer enlargement for safe square packing; planet sizes and loot mix remain preserved',()=>{
 assert.equal(REGULAR_EFFECTIVE_REACH,2768);assert.equal(WORLD,18692);assert.ok(WORLD<=BASE_WORLD*2);assert.equal(WORLD_SCALE,WORLD/BASE_WORLD);
 const separation=(w:number)=>PACKING_SEPARATION*(.9*w-2*(550/Math.SQRT2+1));assert.ok(separation(WORLD)>=LAUNCH_D_MIN);assert.ok(separation(WORLD-1)<LAUNCH_D_MIN);assert.ok(separation(BASE_WORLD)<LAUNCH_D_MIN);
 assert.deepEqual(PLANET_REGIONS.map(p=>p.radius),[825,735,975,470]);assert.equal(LOOT_CONFIG.weaponCount,70);assert.equal(LOOT_CONFIG.ammoCount,70);
 assert.ok(LANDING_MARGIN>550);assert.equal(MAP_DIAGONAL,Math.hypot(WORLD,WORLD));
 for(const corner of HORIZON_CORNERS){const at60=horizonAt(0,60000,0);for(const point of selectLandingZones(8))assert.ok(Math.hypot(point.x-corner.x,point.y-corner.y)>at60.radius+HORIZON_CONFIG.gravityBand);for(const other of HORIZON_CORNERS)assert.ok(Math.hypot(corner.x-other.x,corner.y-other.y)<horizonAt(0,300000,0).radius);}
});
test('shared launch trajectory accelerates, reaches authoritative destination and remains deterministic',()=>{
 const {room,host}=launch(),landing=room.match.launchDestinations.host,angle=room.match.launchAngles.host;
 const start=launchPose(landing,angle,1400),first=launchPose(landing,angle,1500),middle=launchPose(landing,angle,2900),end=launchPose(landing,angle,4400);
 assert.ok(Math.abs(Math.hypot(start.x-LAUNCH_ORIGIN.x,start.y-LAUNCH_ORIGIN.y)-150)<1e-8);assert.ok(Math.hypot(first.x-start.x,first.y-start.y)<Math.hypot(middle.x-start.x,middle.y-start.y)/10);assert.ok(Math.hypot(end.x-landing.x,end.y-landing.y)<1e-8);
 const destinations=structuredClone(room.match.launchDestinations);assert.ok(resetRound(room));room.match.round=0;assert.ok(startMatch(room,'host',{round:0}).ok);assert.deepEqual(room.match.launchDestinations,destinations);
});
test('landing protection rejects damage and invalid fire, expires at five seconds and accepted fire forfeits it',()=>{
 const {room,host,bot}=launch();assert.equal(host.launchProtectionUntilMs,14200);assert.equal(applyDamage(host,20,{type:'PLAYER',playerId:bot.state.id},14199),null);
 assert.equal(fire(room,host,{sequence:1,aim:0,lifeGeneration:host.state.lifeGeneration-1,teleportSequence:host.state.teleportSequence},0).ok,false);assert.equal(host.launchProtectionUntilMs,14200);
 assert.equal(fire(room,host,{sequence:2,aim:0,lifeGeneration:host.state.lifeGeneration,teleportSequence:host.state.teleportSequence},0).ok,true);assert.equal(host.launchProtectionUntilMs,0);assert.equal(host.state.launchProtectionRemainingMs,0);assert.equal(applyDamage(host,20,{type:'PLAYER',playerId:bot.state.id},9200)?.shieldAbsorbed,20);
 assert.equal(applyDamage(bot,20,{type:'PLAYER',playerId:host.state.id},14199),null);assert.equal(applyDamage(bot,20,{type:'PLAYER',playerId:host.state.id},14200)?.shieldAbsorbed,20);
 assert.ok(resetRound(room));assert.equal(host.launchProtectionUntilMs,0);assert.equal(bot.recentAttackers,undefined);
});
test('bots discard remote acquisition, pursuit and aim; only an actual recent attacker grants five seconds of awareness',()=>{
 const {room,host,bot}=launch();room.simulationTimeMs=15000;bot.simulationTimeMs=15000;
 assert.equal(selectBotStrategy(bot,[host],15000).target,null);assert.equal(botAware(bot,host,15000),false);botHands(room,bot,{mode:'HUNT',target:host.state.id},1);assert.equal(bot.state.bot!.target,null);assert.equal(bot.state.bot!.fire,false);assert.equal(bot.state.bot!.thrust,false);
 const strategy=selectSurvivalStrategy(room,bot,{mode:'HUNT',target:host.state.id});assert.equal(strategy.target,null);assert.notEqual(strategy.goal?.id,host.state.id);
 bot.launchProtectionUntilMs=16000;assert.equal(applyDamage(bot,1,{type:'PLAYER',playerId:host.state.id},15000),null);assert.equal(botAware(bot,host,15000),false);
 bot.launchProtectionUntilMs=0;assert.ok(applyDamage(bot,1,{type:'PLAYER',playerId:host.state.id},15000));assert.equal(botAware(bot,host,20000),true);assert.equal(selectBotStrategy(bot,[host],20000).target,host.state.id);assert.equal(botAware(bot,host,20001),false);assert.equal(selectBotStrategy(bot,[host],20001).target,null);
 const third=[...room.players.values()].find(p=>p!==bot&&p!==host)!;assert.equal(botAware(bot,third,15001),false);
 Object.assign(host.state,{x:bot.state.x+1100,y:bot.state.y});assert.equal(botAware(bot,host,21000),true);host.state.x+=1;assert.equal(botAware(bot,host,21000),false);Object.assign(host.state,{x:bot.state.x+500,y:bot.state.y});botHands(room,bot,{mode:'HUNT',target:host.state.id},4);assert.equal(bot.botAim!.target,host.state.id);host.state.x=bot.state.x+1101;botHands(room,bot,{mode:'HUNT',target:host.state.id},5);assert.equal(bot.botAim!.target,null);assert.equal(bot.state.bot!.target,null);
});
