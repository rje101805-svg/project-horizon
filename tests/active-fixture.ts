import {createBlackHole} from '../shared/black-hole';
import {RoomStore,chooseSpawn,type GameRoom} from '../server/rooms';
import type {RoomResult} from '../shared/protocol';
// Focused weapon/physics tests initialize ACTIVE directly. Matchmaking and
// transitions are exercised separately through production RoomStore/socket APIs.
// This fixture never runs in production and provides no public phase bypass.
export class ActiveFixtureStore extends RoomStore{
 override create(id:string,name:unknown,now:number):RoomResult{const r=super.create(id,name,now);if(r.ok)this.activate(this.roomFor(id)!);return r;}
 override join(id:string,code:unknown,name:unknown,now:number):RoomResult{
  const room=typeof code==='string'?this.rooms.get(code.trim().toUpperCase()):undefined;if(!room)return super.join(id,code,name,now);
  const previous=room.match.state;room.match.state='waiting';const r=super.join(id,code,name,now);room.match.state=previous;if(r.ok)this.activate(room);return r;
 }
 override fill(room:GameRoom|undefined,id:string,raw:unknown){if(!room)return super.fill(room,id,raw);const state=room.match.state,mode=room.match.mode;room.match.state='waiting';room.match.mode='fill';const r=super.fill(room,id,raw);room.match.state=state;room.match.mode=mode;if(r.ok)this.activate(room);return r;}
 private activate(room:GameRoom){room.match.state='active';room.match.phaseStartedAtMs=room.simulationTimeMs-2000;room.match.roster=[...room.players.keys()];const placed:{x:number;y:number}[]=[];for(const p of room.players.values()){if(p.combatEnabled!==true){const spawn=chooseSpawn([...room.players.values()].filter(other=>other!==p&&other.combatEnabled===true).map(other=>({x:other.state.x,y:other.state.y})).concat(placed),room.blackHole)!;Object.assign(p.state,spawn);}placed.push(p.state);p.gameplayEnabled=true;p.combatEnabled=true;}}
}
import {startMatch,advanceMatch,playAgain} from '../server/match';
// Establish a round through the real lifecycle, then return its clocks/markers
// to the unit test's chosen origin. Physics/weapon tests own their own clock.
export function startActiveFixture(room:GameRoom|undefined,id:string,raw:unknown){
 if(!room)return startMatch(room,id,raw);
 const time=room.simulationTimeMs,states=new Map([...room.players.values()].map(p=>[p.state.id,{x:p.state.x,y:p.state.y,vx:p.state.vx,vy:p.state.vy,rotation:p.state.rotation,lifeGeneration:p.state.lifeGeneration,teleportSequence:p.state.teleportSequence}]));
 room.match.state='waiting';room.match.mode=[...room.players.values()].filter(p=>p.state.controllerType==='HUMAN').length===1?'fill':'wait';room.match.readyIds=[...room.players.keys()].filter(k=>k!==room.match.hostId);
 const result=startMatch(room,id,raw);if(!result.ok)return result;
 advanceMatch(room,time+3000);advanceMatch(room,time+4800);advanceMatch(room,time+9200);
 room.horizon=undefined;room.horizonConsumed=undefined;room.blackHole=createBlackHole();room.simulationTimeMs=time;room.match.phaseStartedAtMs=time-5000;for(const p of room.players.values()){Object.assign(p.state,states.get(p.state.id),{spawnInvulnerabilityRemainingMs:0,launchProtectionRemainingMs:0});p.launchProtectionUntilMs=0;p.simulationTimeMs=time;}
 return result;
}
export function replayFixture(room:GameRoom,timeMs:number){advanceMatch(room,timeMs);return playAgain(room,room.match.hostId!,{round:room.match.round}).ok;}
// Single-client render tests still need at least two surviving BR contenders.
export class CombatBrowserStore extends ActiveFixtureStore{
 override create(id:string,name:unknown,now:number){const r=super.create(id,name,now);if(r.ok){const room=this.roomFor(id)!;for(let i=0;i<2;i++){const peer=`fixture:${room.code}:${i}`;this.join(peer,room.code,peer,now);Object.assign(room.players.get(peer)!.state,{x:8000+i*500,y:8000});}r.room=this.info(room);}return r;}
}
import {advanceBots} from '../server/bots';
// Legacy damage/inventory tests start with perception already settled. New
// perception regressions exercise first-acquisition and switches separately.
export function settleBotPerception(room:GameRoom){const time=room.simulationTimeMs;room.simulationTimeMs=time-600;advanceBots(room,time-600,-1);room.simulationTimeMs=time;}
