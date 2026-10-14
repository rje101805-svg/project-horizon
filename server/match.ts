import {LAUNCH_ORIGIN,LAUNCH_ORBIT_MS,EJECTION_MS,launchLanding,validLanding} from '../shared/launch';
import {createBlackHole} from '../shared/black-hole';
import {beginHorizon} from './horizon';
import {placeLandingLoot} from './inventory';
import {randomInt} from 'node:crypto';
import {COUNTDOWN_MS,COLLAPSE_MS,LAUNCH_MS,LAUNCH_PROTECTION_MS,LOBBY_HOLE} from '../shared/match';
import {MAX_HEALTH,MAX_SHIELD} from '../shared/combat';
import {initializeInventory,resetLoot} from './inventory';
import {resetObjectives,pauseObjectives} from './objectives';
import { SHIP_COLORS } from '../shared/rooms';
import { initialBotState } from '../shared/bots';
import { clearAllTractors } from './tractor';
import { type MatchState, type StartMatchResult } from '../shared/match';
import { initialLifeState } from '../shared/lifecycle';
import { idleInput } from '../shared/flight';
import { retireInputs } from './inputs';
import { chooseLobbySpawn, activeParticipants, removeBot, type GameRoom, type RoomPlayer } from './rooms';

export function matchSnapshot(room: GameRoom): MatchState {
  return {...room.match, roster:[...room.match.roster],readyIds:[...room.match.readyIds],launchAngles:{...room.match.launchAngles}, result:room.match.result ? {...room.match.result} : null};
}
export function roundHumans(room: GameRoom): RoomPlayer[] {
  const ids = room.match.state === 'waiting' ? [...room.players.keys()] : room.match.roster;
  return ids.flatMap(id => {const p=room.players.get(id);return p && !p.state.queuedForNextRound && p.state.status==='ALIVE' && p.state.lifeState==='active' && p.state.health>0 ? [p] : [];});
}
function freeze(player: RoomPlayer) {
  player.gameplayEnabled = false; retireInputs(player); player.input = idleInput(); player.lastInput = -Infinity;
  player.reset = false; player.state.vx = player.state.vy = 0;
  player.respawnAtMs = null; player.state.respawnRemainingMs = 0;
}
export function evaluateResult(room: GameRoom, timeMs: number) {
  if (room.match.state !== 'active') return;
  // The locked launch roster distinguishes solo sessions from multiplayer
  // rounds reduced to one survivor by elimination or disconnection.
  if (room.match.mode === 'wait' && room.match.roster.length === 1) return;
  const humans = roundHumans(room);
  if (humans.length > 1) return;
  finishMatch(room,humans.length ? {kind:'winner', winnerId:humans[0].state.id, winnerName:humans[0].state.name} : {kind:'draw'},timeMs);
}
export function finishMatch(room:GameRoom,result:import('../shared/match').MatchResult,timeMs:number){
 clearAllTractors(room);room.match.state='ended';room.match.endedAtMs=timeMs;room.match.resetRemainingMs=0;room.match.result=result;room.projectiles.clear();pauseObjectives(room);
 for(const p of room.players.values()){if(p.state.status==='ALIEN'&&p.state.lifeState==='active'){p.state.health=p.state.shield=0;p.state.lifeState='dead';p.state.teleportSequence++;}freeze(p);}
}
// Reset is a room transaction: validate every spawn before changing any player.
export function resetRound(room: GameRoom): boolean {
  const spawns: NonNullable<ReturnType<typeof chooseLobbySpawn>>[] = [];
  const queued=[...room.players.values()].filter(p=>p.state.queuedForNextRound);
  const bots=activeParticipants(room).filter(p=>p.state.controllerType==='BOT').reverse();
  const remove=bots.slice(0,Math.max(0,activeParticipants(room).length+queued.length-8));
  const next=[...room.players.values()].filter(p=>!remove.includes(p));
  if(next.length>8)return false;
  for (const _player of next) {
    const spawn = chooseLobbySpawn(spawns); if (!spawn) return false; spawns.push(spawn);
  }
  room.horizon=undefined;room.horizonConsumed=[];room.blackHole=createBlackHole();
  resetObjectives(room);room.combatEffects=[];room.killFeed=[];
  for(const p of remove)removeBot(room,p.state.id);
  resetLoot(room); // Removed bots may drop equipment; clear those old-round drops too.
  clearAllTractors(room,true);
  const usedColors=new Set(next.filter(p=>!p.state.queuedForNextRound).map(p=>p.state.color));
  for(const p of next)if(p.state.queuedForNextRound){p.state.color=SHIP_COLORS.find(c=>!usedColors.has(c))!;usedColors.add(p.state.color);}
  let i=0;
  for (const player of room.players.values()) {
    const s=player.state, lifeGeneration=s.lifeGeneration+1, teleportSequence=s.teleportSequence+1, deathSequence=s.deathSequence, reloadSession=s.reloadSession, controllerType=s.controllerType;
    retireInputs(player);
    Object.assign(s, initialLifeState(), spawns[i++], {controllerType,lifeGeneration,teleportSequence,deathSequence,reloadSession,region:'safe'});
    player.simulationTimeMs=room.simulationTimeMs;
    s.queuedForNextRound=false;
    if(s.controllerType==='BOT'){s.bot=initialBotState();player.botInputTick=player.botInputLife=player.botInputTeleport=undefined;}
    initializeInventory(player);player.botLootEnded=false;player.botLootTarget=undefined;player.botLootBlocked=undefined;player.lastAttackedMs=undefined;player.burnOwnerId=undefined;player.titanTriggerUntilMs=0;player.recentPickups?.clear();player.nextSwapMs=0;player.lastFireInputMs=undefined;
    player.humanEliminated=false; player.gameplayEnabled=true;player.combatEnabled=false; player.invulnerableUntilMs=0;player.launchProtectionUntilMs=0;s.launchProtectionRemainingMs=0;
    const angle=(i-1)*Math.PI*2/8;Object.assign(s,{x:LOBBY_HOLE.x+240*Math.cos(angle),y:LOBBY_HOLE.y+240*Math.sin(angle)});
    player.combatTimers={reload:0,cooldown:0,reloadCompleted:false}; player.respawnAtMs=null;
    player.input=idleInput();player.lastInput=-Infinity;player.reset=false;
    // Keep monotonic command/fire/reload IDs and membership session; new life/teleport
    // markers invalidate all old-round packets, including delayed DEV requests.
  }
  room.projectiles.clear(); room.match.state='waiting';room.match.roster=[];room.match.result=null;
  room.match.endedAtMs=null;room.match.resetRemainingMs=0;room.match.readyIds=[...room.players.values()].filter(p=>p.state.controllerType==='BOT').map(p=>p.state.id);room.match.launchAngles={};room.match.phaseStartedAtMs=room.simulationTimeMs;room.match.phaseRemainingMs=0;room.collapseOrigins=undefined;
  return true;
}
// Called by the existing fixed simulation clock, never a per-room timeout.
export function advanceMatch(room: GameRoom, timeMs: number): boolean {
  room.simulationTimeMs=timeMs;
  const m=room.match;
  if(m.state==='countdown'||m.state==='collapse'||m.state==='launch'){
    const duration=m.state==='countdown'?COUNTDOWN_MS:m.state==='collapse'?COLLAPSE_MS:LAUNCH_MS;
    m.phaseRemainingMs=Math.max(0,duration-(timeMs-m.phaseStartedAtMs));
    if(m.phaseRemainingMs<1e-7){
      m.phaseStartedAtMs=timeMs;
      if(m.state==='countdown'){
        m.state='collapse';m.phaseRemainingMs=COLLAPSE_MS;
        room.collapseOrigins=new Map([...room.players.values()].map(p=>[p.state.id,{radius:Math.hypot(p.state.x-LOBBY_HOLE.x,p.state.y-LOBBY_HOLE.y),angle:Math.atan2(p.state.y-LOBBY_HOLE.y,p.state.x-LOBBY_HOLE.x)}]));
      }else if(m.state==='collapse'){
        m.state='launch';m.phaseRemainingMs=LAUNCH_MS;room.blackHole={...LAUNCH_ORIGIN,eventHorizonRadius:90,influenceRadius:0};
        if(Object.keys(m.launchAngles).length!==room.players.size)assignLaunchAngles(room,[...room.players.values()]);resetObjectives(room);resetLoot(room,true);placeLandingLoot(room);room.projectiles.clear();room.combatEffects=[];room.killFeed=[];
        for(const p of room.players.values()){p.state.lifeGeneration++;p.state.teleportSequence++;}
      }else{
        m.state='active';m.phaseRemainingMs=0;
        for(const p of room.players.values()){
          const angle=m.launchAngles[p.state.id];if(angle===undefined)continue;
          Object.assign(p.state,{...launchLanding(angle),vx:0,vy:0,rotation:angle,spawnInvulnerabilityRemainingMs:LAUNCH_PROTECTION_MS,launchProtectionRemainingMs:LAUNCH_PROTECTION_MS});
          p.state.teleportSequence++;p.gameplayEnabled=true;p.combatEnabled=true;p.launchProtectionUntilMs=timeMs+LAUNCH_PROTECTION_MS;p.simulationTimeMs=timeMs;
          retireInputs(p);p.input=idleInput();p.lastInput=-Infinity;
        }
        room.collapseOrigins=undefined;beginHorizon(room);return true;
      }
    }
    for(const p of room.players.values()){
      const angle=m.launchAngles[p.state.id];if(angle===undefined)continue;
      if(m.state==='collapse'){
        const origin=room.collapseOrigins?.get(p.state.id);if(!origin)continue;
        const t=Math.min(1,(timeMs-m.phaseStartedAtMs)/COLLAPSE_MS),a=origin.angle+t*t*Math.PI*4,r=origin.radius*(1-t)**2;
        Object.assign(p.state,{x:LOBBY_HOLE.x+Math.cos(a)*r,y:LOBBY_HOLE.y+Math.sin(a)*r,rotation:a+Math.PI/2});
      }else if(m.state==='launch'){
        const elapsed=timeMs-m.phaseStartedAtMs;
        if(elapsed<LAUNCH_ORBIT_MS){const t=elapsed/LAUNCH_ORBIT_MS,a=angle+t*Math.PI*2,r=150+Math.sin(t*Math.PI)*35;Object.assign(p.state,{x:LAUNCH_ORIGIN.x+Math.cos(a)*r,y:LAUNCH_ORIGIN.y+Math.sin(a)*r,rotation:a+Math.PI/2});}
        else{const t=Math.min(1,(elapsed-LAUNCH_ORBIT_MS)/EJECTION_MS),ease=t*t*(3-2*t),landing=launchLanding(angle);Object.assign(p.state,{x:LAUNCH_ORIGIN.x+Math.cos(angle)*150+(landing.x-LAUNCH_ORIGIN.x-Math.cos(angle)*150)*ease,y:LAUNCH_ORIGIN.y+Math.sin(angle)*150+(landing.y-LAUNCH_ORIGIN.y-Math.sin(angle)*150)*ease,rotation:angle});}

      }
    }
  }
  return false;
}
export function setReady(room:GameRoom|undefined,sender:string,raw:unknown):StartMatchResult{
  if(!room||room.match.state!=='waiting'||sender===room.match.hostId||room.players.get(sender)?.state.controllerType!=='HUMAN')return {ok:false,message:'Only human guests may toggle READY in the lobby'};
  const r=raw as {round?:unknown;ready?:unknown};if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!['round','ready'].includes(k))||r.round!==room.match.round||typeof r.ready!=='boolean')return {ok:false,message:'Stale or invalid READY'};
  room.match.readyIds=room.match.readyIds.filter(id=>id!==sender);if(r.ready)room.match.readyIds.push(sender);return {ok:true,message:r.ready?'Ready':'Not ready'};
}
export function playAgain(room:GameRoom|undefined,sender:string,raw:unknown):StartMatchResult{
  const r=raw as {round?:unknown};
  if(!room||!room.players.has(sender)||room.match.state!=='ended'||!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>k!=='round')||r.round!==room.match.round)return {ok:false,message:'Stale or invalid replay'};
  return resetRound(room)?{ok:true,message:'Returned to lobby'}:{ok:false,message:'No safe reset available'};
}

function assignLaunchAngles(room:GameRoom,players:RoomPlayer[]){
 const shuffled=[...players];for(let i=shuffled.length-1;i>0;i--){const j=randomInt(i+1);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}let offset=randomInt(1000000)/1000000*Math.PI*2;for(let n=0;n<64;n++){const candidate=offset+n*Math.PI*2/64;if(shuffled.every((_,i)=>validLanding(launchLanding(candidate+i*Math.PI*2/shuffled.length)))){offset=candidate;break;}}room.match.launchAngles=Object.fromEntries(shuffled.map((p,i)=>[p.state.id,offset+i*Math.PI*2/shuffled.length]));
}
export function startMatch(room: GameRoom | undefined, senderId: string, raw: unknown): StartMatchResult {
  const reject = (message: string): StartMatchResult => ({ok:false,message});
  if (!room || !room.players.has(senderId) || room.match.hostId !== senderId) return reject('Only the room host can start');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k=>k!=='round') ||
      !Number.isSafeInteger((raw as {round?:unknown}).round) || (raw as {round:number}).round !== room.match.round) return reject('Invalid or stale start request');
  if (room.match.state!=='waiting') return reject('Match is not waiting');
  const humans=roundHumans(room);
  if (room.match.mode==='wait' && (humans.filter(p=>p.state.controllerType==='HUMAN').length<1 || humans.some(p=>p.state.id!==senderId&&!room.match.readyIds.includes(p.state.id))))return reject('WAIT requires a human host and all guests READY');
  if(humans.some(p=>p.state.controllerType==='HUMAN'&&p.state.id!==senderId&&!room.match.readyIds.includes(p.state.id)))return reject('All human guests must be READY');
  if(room.match.mode==='fill' && humans.length!==8)return reject('FILL requires eight participants');
  room.match.state='countdown';room.match.phaseStartedAtMs=room.simulationTimeMs;room.match.phaseRemainingMs=COUNTDOWN_MS;room.match.round++;room.match.roster=humans.map(p=>p.state.id);resetObjectives(room);resetLoot(room);room.combatEffects=[];room.killFeed=[];clearAllTractors(room,true);room.projectiles.clear();
  assignLaunchAngles(room,humans);room.match.readyIds=humans.map(p=>p.state.id);
  for(const p of humans){Object.assign(p.state,{health:MAX_HEALTH,maxHealth:MAX_HEALTH,shield:MAX_SHIELD,maxShield:MAX_SHIELD,slowRemainingMs:0,burnRemainingMs:0,stunRemainingMs:0,stunImmunityRemainingMs:0,titanSpin:0,titanSustainMs:0,launchProtectionRemainingMs:0,spawnInvulnerabilityRemainingMs:0});p.botLootEnded=false;p.botLootTarget=undefined;p.botLootBlocked=undefined;p.lastAttackedMs=undefined;p.burnOwnerId=undefined;p.titanTriggerUntilMs=0;p.nextSwapMs=0;p.recentPickups?.clear();initializeInventory(p);p.combatTimers={reload:0,cooldown:0,reloadCompleted:false};p.state.isReloading=false;p.state.reloadRemainingMs=p.state.reloadProgress=p.state.fireCooldownRemainingMs=0;p.state.fireCooldownProgress=1;p.reloadWeaponId=undefined;p.combatEnabled=false;p.launchProtectionUntilMs=0;freeze(p);}
  for (const player of room.players.values()) if (!room.match.roster.includes(player.state.id)) {
    player.state.status='OUT'; freeze(player);
  }
  return {ok:true,message:'Countdown started'};
}
// Keep the current connected human host; otherwise choose the earliest
// connected human, including an eliminated pilot. Hosting never grants victory.
export function assignHost(room: GameRoom) {
  if (room.match.hostId && room.players.get(room.match.hostId)?.state.controllerType==='HUMAN') return;
  room.match.hostId = [...room.players.values()].find(p=>p.state.controllerType==='HUMAN')?.state.id ?? null;
}
