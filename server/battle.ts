import type {GameRoom,RoomPlayer} from './rooms';
import type {DamageSource} from '../shared/combat';
import {causeLabel,FIRE_PING_MS,FIRE_RADAR_RANGE,type Standing,type BattleSnapshot,type RadarPing} from '../shared/battle';
export interface BattleRuntime {round:number;rows:Map<string,Standing>;shots:Map<string,RadarPing&{viewerId:string}>}
export function beginBattle(room:GameRoom){room.battle={round:room.match.round,shots:new Map(),rows:new Map(room.match.roster.flatMap(id=>{const p=room.players.get(id);return p?[[id,{id,name:p.state.name,color:p.state.color,status:'ALIVE',kills:0,damage:0,survivedMs:0,captures:0,walls:0,placement:null,eliminatedAtMs:null,deathSequence:0,cause:null}] as [string,Standing]]:[];}))};for(const p of room.players.values())p.state.kills=0;}
function runtime(room:GameRoom){if(!room.battle||room.battle.round!==room.match.round)beginBattle(room);return room.battle!;}
export function battleMetric(room:GameRoom,id:string,kind:'damage'|'captures'|'walls',value=1){if(room.match.state!=='active')return;const r=runtime(room).rows.get(id);if(r)r[kind]+=Math.max(0,value);}
export function battleDeath(room:GameRoom,p:RoomPlayer,source:DamageSource,timeMs:number){
 if(room.match.state!=='active')return;const r=runtime(room),row=r.rows.get(p.state.id);if(!row||row.eliminatedAtMs!==null)return;
 row.eliminatedAtMs=timeMs;row.deathSequence=p.state.deathSequence;row.status='ALIEN';row.cause=causeLabel(source,id=>r.rows.get(id)?.name??'Unknown pilot');row.survivedMs=Math.max(0,timeMs-room.match.phaseStartedAtMs);
 if('playerId'in source&&source.playerId!==p.state.id){const killer=r.rows.get(source.playerId);if(killer){killer.kills++;const player=room.players.get(killer.id);if(player)player.state.kills=killer.kills;}}
 const killer='playerId'in source?r.rows.get(source.playerId)?.name??'Unknown pilot':'';
 const weapon=source.type==='TRACTOR'?' · Tractor lock':source.type==='PLAYER'&&source.weaponName?` · ${source.rarity?source.rarity+' ':''}${source.weaponName}`:'';
 const text=source.type==='ENVIRONMENT'?source.cause==='BLACK_HOLE'?`${p.state.name} consumed by the Horizon`:`${p.state.name} lost to a hazard`:`${killer} → ${p.state.name}${weapon}`;
 const id=`${room.match.round}:${p.state.id}:elimination`;if(!(room.killFeed??[]).some(e=>e.id===id))room.killFeed=[...(room.killFeed??[]),{id,timeMs,text}].slice(-5);
}
export function updateBattle(room:GameRoom){if(room.match.state!=='active'&&room.match.state!=='ended')return;const r=runtime(room),end=room.match.endedAtMs??room.simulationTimeMs;
 for(const row of r.rows.values()){const p=room.players.get(row.id);row.status=p?.state.status??'OUT';row.kills=p?.state.kills??row.kills;if(row.eliminatedAtMs===null){if(!p||p.state.status==='OUT'){row.eliminatedAtMs=room.simulationTimeMs;row.cause='Disconnected';row.status='OUT';row.survivedMs=Math.max(0,room.simulationTimeMs-room.match.phaseStartedAtMs);}else row.survivedMs=Math.max(0,end-room.match.phaseStartedAtMs);}}
 // Equal simulation timestamps share competition rank; socket/iteration order never breaks ties.
 for(const row of r.rows.values())if(row.eliminatedAtMs!==null)row.placement=1+[...r.rows.values()].filter(q=>q.eliminatedAtMs===null||q.eliminatedAtMs!>row.eliminatedAtMs!).length;
 if(room.match.state==='ended'){const winner=room.match.result?.kind==='winner'?room.match.result.winnerId:null;for(const row of r.rows.values()){if(row.id===winner)row.placement=1;else if(winner&&row.placement===1)row.placement=2;else row.placement??=1;}}
}
export function battleSnapshot(room:GameRoom):BattleSnapshot|undefined {if(!room.battle||room.battle.round!==room.match.round)return;updateBattle(room);const rows=[...room.battle.rows.values()];return {round:room.match.round,total:rows.length,remaining:rows.filter(r=>r.eliminatedAtMs===null&&r.status==='ALIVE'&&room.players.get(r.id)?.state.lifeState==='active'&&(room.players.get(r.id)?.state.health??0)>0).length,standings:rows.map(r=>({...r})).sort((a,b)=>(a.placement??0)-(b.placement??0)||b.kills-a.kills||a.name.localeCompare(b.name))};}
// Retain each listener's last heard shot independently: an unheard later shot
// must not erase or reveal information about an earlier audible ping. Max 8*7.
export function recordShot(room:GameRoom,p:RoomPlayer,sequence:number){if(room.match.state!=='active'||p.state.status!=='ALIVE')return;const r=runtime(room),s=p.state;for(const q of room.players.values())if(q!==p&&q.state.controllerType==='HUMAN'&&q.state.status!=='OUT'&&Math.hypot(q.state.x-s.x,q.state.y-s.y)<=FIRE_RADAR_RANGE)r.shots.set(`${s.id}|${q.state.id}`,{id:`${room.match.round}:${s.id}:${sequence}`,pilotId:s.id,x:s.x,y:s.y,timeMs:room.simulationTimeMs,viewerId:q.state.id});}
export function radarPings(room:GameRoom,viewer:string):RadarPing[]{const r=room.battle;if(!r)return [];const result:RadarPing[]=[];for(const [id,p]of r.shots){const actor=room.players.get(p.pilotId);if(room.simulationTimeMs-p.timeMs>=FIRE_PING_MS||actor?.state.status!=='ALIVE'||actor.state.lifeState!=='active'){r.shots.delete(id);continue;}if(p.viewerId===viewer){const {viewerId:_private,...safe}=p;result.push(safe);}}return result;}
