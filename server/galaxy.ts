import {GALAXY_CONFIG} from '../shared/weapons';
import {TICK_MS} from '../shared/flight';
import {applyDamage} from './combat';
import type {GameRoom,RoomPlayer} from './rooms';
import type {TriggerRequest} from '../shared/protocol';
export function triggerIntent(room:GameRoom|undefined,p:RoomPlayer|undefined,raw:unknown){
 if(!room||!p||!raw||typeof raw!=='object'||Array.isArray(raw))return false;
 const r=raw as TriggerRequest;
 if(Object.keys(r).some(k=>!['sequence','held','roomCode','round','reloadSession','lifeGeneration','teleportSequence'].includes(k))||!Number.isSafeInteger(r.sequence)||r.sequence<=0||typeof r.held!=='boolean'||r.sequence<=(p.lastTriggerSequence??0))return false;
 p.lastTriggerSequence=r.sequence;
 if(room.players.get(p.state.id)!==p||r.roomCode!==room.code||r.round!==room.match.round||r.reloadSession!==p.state.reloadSession||r.lifeGeneration!==p.state.lifeGeneration||r.teleportSequence!==p.state.teleportSequence||!p.gameplayEnabled||room.match.state!=='active'||p.state.status!=='ALIVE'||p.state.lifeState!=='active'||p.state.galaxyType!=='titan'||!p.state.goldGunId)return false;
 p.titanTriggerUntilMs=r.held?room.simulationTimeMs+300:0;return true;
}
export function advanceGalaxyTick(room:GameRoom,p:RoomPlayer){
 const s=p.state;if(!p.gameplayEnabled||s.lifeState!=='active'||s.status==='OUT'||s.health<=0)return;
 if((s.burnRemainingMs??0)>0){const elapsed=Math.min(TICK_MS,s.burnRemainingMs!);s.burnRemainingMs=Math.max(0,s.burnRemainingMs!-TICK_MS);if(s.burnRemainingMs<1e-7)s.burnRemainingMs=0;
  if(p.burnOwnerId){const owner=room.players.get(p.burnOwnerId),damage=applyDamage(p,GALAXY_CONFIG.burnDps*elapsed/1000,{type:'PLAYER',playerId:p.burnOwnerId},p.simulationTimeMs);if(owner&&damage&&damage.shieldAbsorbed+damage.healthDamage>0)owner.lastCombatMs=p.simulationTimeMs;}if(!s.burnRemainingMs)p.burnOwnerId=undefined;
 }
 if(s.galaxyType!=='titan'||!s.goldGunId){s.titanSpin=s.titanSustainMs=0;return;}
 const held=(p.titanTriggerUntilMs??0)>room.simulationTimeMs&&(s.stunRemainingMs??0)<=0&&!s.tractor.targetId;
 s.titanSpin=Math.max(0,Math.min(1,(s.titanSpin??0)+(held?TICK_MS/GALAXY_CONFIG.spinUpMs:-TICK_MS/GALAXY_CONFIG.spinDownMs)));
 s.titanSustainMs=held?Math.min(GALAXY_CONFIG.spreadRampMs,(s.titanSustainMs??0)+TICK_MS):Math.max(0,(s.titanSustainMs??0)-TICK_MS*4);
}
