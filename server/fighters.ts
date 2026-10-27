import {FIGHTER_IDS,FIGHTERS,isFighter,fighterStats,type FighterId} from '../shared/fighters';
import type {GameRoom,RoomPlayer} from './rooms';
export function applyFighterCaps(p:RoomPlayer,fill=false){if(p.state.status!=='ALIVE')return;const max=fighterStats(p.state).maxShield;p.state.maxShield=max;p.state.shield=fill?max:Math.min(max,p.state.shield);}
// Existing humans hold reservations. A joining human can displace a bot, never
// another human. Bot identities are reassigned atomically before publication.
export function assignFighter(room:GameRoom,p:RoomPlayer,preferred:FighterId){
 const occupied=new Set([...room.players.values()].filter(q=>q!==p&&q.state.controllerType==='HUMAN').map(q=>q.state.fighterId));
 const assigned=!occupied.has(preferred)?preferred:FIGHTER_IDS.find(id=>!occupied.has(id))!;
 p.state.fighterId=assigned;p.state.fighterNotice=assigned===preferred?'':`${preferred.toUpperCase()} TAKEN — FLYING AS ${assigned.toUpperCase()}`;applyFighterCaps(p,true);
 const used=new Set([...room.players.values()].filter(q=>q.state.controllerType==='HUMAN').map(q=>q.state.fighterId));
 for(const bot of room.players.values())if(bot.state.controllerType==='BOT'){
  const id=bot.state.fighterId&&!used.has(bot.state.fighterId)?bot.state.fighterId:FIGHTER_IDS.find(id=>!used.has(id))!;used.add(id);bot.state.fighterId=id;bot.state.name=id.toUpperCase();applyFighterCaps(bot,true);
 }
 // Waiting-room AI has no outstanding ACTIVE requests; discard stale identity
 // state if a tooling fixture previously initialized it.
 room.pilots=undefined;
}
export function changeFighter(room:GameRoom|undefined,p:RoomPlayer|undefined,raw:unknown){
 if(!room||!p||room.players.get(p.state.id)!==p||p.state.controllerType!=='HUMAN'||room.match.state!=='waiting')return {ok:false,message:'Pilot changes require the lobby'};
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['fighterId','round'].includes(k))||!isFighter((raw as any).fighterId)||(raw as any).round!==room.match.round)return {ok:false,message:'Invalid pilot request'};
 assignFighter(room,p,(raw as any).fighterId);return {ok:true,message:p.state.fighterNotice||`FLYING AS ${p.state.fighterId!.toUpperCase()}`};
}
