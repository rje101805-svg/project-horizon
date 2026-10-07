import { initialBotState, type BotStrategy } from '../shared/bots';
import { idleInput, TICK_SECONDS, type PlayerInput } from '../shared/flight';
import { ALIEN_MELEE_RANGE } from '../shared/alien';
import { inTractorCone } from '../shared/tractor';
import { acceptMovementInput } from './inputs';
import { fire } from './projectiles';
import { reload } from './reload';
import { activateTractor } from './tractor';
import type { GameRoom, RoomPlayer } from './rooms';

const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const eligible=(room:GameRoom,p:RoomPlayer)=>room.match.roster.includes(p.state.id) && p.gameplayEnabled && p.state.status==='ALIVE' && p.state.lifeState==='active' && p.state.health>0;

// Replace this writer in a future phase; reactive safety and hands stay intact.
export function selectBotStrategy(bot:RoomPlayer,candidates:RoomPlayer[]):BotStrategy {
 let target:RoomPlayer|undefined,distance=Infinity;
 for(const p of candidates){if(p===bot)continue;const d=Math.hypot(p.state.x-bot.state.x,p.state.y-bot.state.y);if(d<distance){distance=d;target=p;}}
 return {mode:target?'HUNT':'IDLE',target:target?.state.id??null};
}

// Normal keyboard-style controls, bounded turning, and imperfect heading aim.
// No position/velocity writes or special bot movement statistics.
export function botHands(room:GameRoom,bot:RoomPlayer,strategy:BotStrategy,tick:number):PlayerInput {
 const s=bot.state,d=s.bot??=initialBotState(),target=strategy.target?room.players.get(strategy.target):undefined;
 Object.assign(d,strategy,{override:null,thrust:false,boost:false,fire:false,reload:false,tractor:false,melee:false,distance:0});
 const input={...idleInput(),aim:s.rotation};
 let dx=0,dy=0,heading=s.rotation;
 if(target && eligible(room,target)){
   dx=target.state.x-s.x;dy=target.state.y-s.y;d.distance=Math.hypot(dx,dy);
   heading=Math.atan2(dy,dx);
   const alien=s.status==='ALIEN';
   if(!alien && d.distance<100){
     // Exact overlap has no away vector; back out through normal controls.
     if(d.distance===0){dx=-Math.cos(s.rotation);dy=-Math.sin(s.rotation);}else{dx=-dx;dy=-dy;}
   } // Reposition, retaining independent weapon heading.
   else if(!alien && d.distance<320){const side=s.color%2?1:-1;const x=dx;dx=-dy*side;dy=x*side;}
   input.boost=d.distance>650;
   const error=Math.abs(angleDelta(heading,s.rotation));
   d.melee=alien && d.distance<=ALIEN_MELEE_RANGE;
   d.fire=!alien && d.distance<650 && error<.20 && !s.tractor.targetId && !s.isReloading;
   d.reload=!alien && s.ammo===0 && !s.isReloading;
   d.tractor=!alien && !s.tractor.targetId && !s.tractor.cooldownRemainingMs && error<.25 && inTractorCone(s,target.state);
 }
 if(s.status==='ALIVE' && s.tractor.attackerId){
   const attacker=room.players.get(s.tractor.attackerId);
   if(attacker){
     d.override='TRACTOR_ESCAPE';
     const ax=s.x-attacker.state.x,ay=s.y-attacker.state.y,length=Math.hypot(ax,ay)||1;
     const side=((ax*-Math.sin(attacker.state.rotation)+ay*Math.cos(attacker.state.rotation))>=0)?1:-1;
     dx=ax/length-Math.sin(attacker.state.rotation)*side*1.5;
     dy=ay/length+Math.cos(attacker.state.rotation)*side*1.5;
     heading=Math.atan2(dy,dx);input.boost=true;d.fire=d.tractor=d.melee=false;
   }
 }
 if(dx || dy){const move=Math.atan2(dy,dx),x=Math.cos(move),y=Math.sin(move);input.right=x>.38;input.left=x<-.38;input.down=y>.38;input.up=y<-.38;}
 // 180 degrees/sec; deterministic small heading error, never exact target aim.
 const desired=heading+(d.override?0:Math.sin(tick*.08+s.color)*.065);
 input.aim=s.rotation+Math.max(-Math.PI*TICK_SECONDS,Math.min(Math.PI*TICK_SECONDS,angleDelta(desired,s.rotation)));
 d.desiredHeading=desired;d.thrust=input.up||input.down||input.left||input.right;d.boost=input.boost;
 return input;
}

// Called once by the existing authoritative tick. No timers or fake clients.
export function advanceBots(room:GameRoom,now:number,tick:number) {
 if(room.match.state!=='active')return;
 const candidates:RoomPlayer[]=[];
 for(const p of room.players.values())if(eligible(room,p))candidates.push(p);
 for(const bot of room.players.values()){
   const s=bot.state;
   if(s.controllerType!=='BOT' || !bot.gameplayEnabled || s.lifeState!=='active' || s.health<=0)continue;
   const input=botHands(room,bot,selectBotStrategy(bot,candidates),tick);
   if(acceptMovementInput(bot,{...input,sequence:bot.lastReceivedSequence+1,lifeGeneration:s.lifeGeneration,teleportSequence:s.teleportSequence},now)){
     bot.botInputTick=tick;bot.botInputLife=s.lifeGeneration;bot.botInputTeleport=s.teleportSequence;
   }
 }
}
// Actions follow everyone's movement, so nose geometry uses the current tick.
// Result evaluation remains after the entire damage batch (including melee).
export function advanceBotActions(room:GameRoom,tick:number) {
 if(room.match.state!=='active')return;
 for(const bot of room.players.values()){
   const s=bot.state,d=s.bot;
   if(s.controllerType!=='BOT' || !d || !bot.gameplayEnabled || s.lifeState!=='active' || s.health<=0 || bot.botInputTick!==tick || bot.botInputLife!==s.lifeGeneration || bot.botInputTeleport!==s.teleportSequence)continue;
   // Respawn/teleport-only ticks must not reuse an old life's attack intention.
   if(d.reload)reload(room,bot,{sequence:bot.lastReloadSequence+1,roomCode:room.code,reloadSession:s.reloadSession,lifeGeneration:s.lifeGeneration,teleportSequence:s.teleportSequence});
   if(d.tractor)activateTractor(room,bot,{sequence:(bot.lastTractorSequence??0)+1,round:room.match.round,reloadSession:s.reloadSession,lifeGeneration:s.lifeGeneration,teleportSequence:s.teleportSequence});
   if(d.fire || d.melee)fire(room,bot,{sequence:bot.lastFireSequence+1,aim:s.rotation,lifeGeneration:s.lifeGeneration,teleportSequence:s.teleportSequence},tick);
 }
}
