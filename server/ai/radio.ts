import type {GameRoom,RoomPlayer} from '../rooms';
import type {DecisionSource} from '../../shared/pilots';
import type {PilotRuntime,PilotState} from './types';
export function radio(room:GameRoom,p:RoomPlayer,runtime:PilotRuntime,state:PilotState,event:string,provided?:string,source:DecisionSource='FALLBACK'){
 const now=room.simulationTimeMs;if(now-state.lastRadioAtMs<25000||now-runtime.radioAtMs<4000)return;
 const styles={Aggressor:'Try keeping up.',Strategist:'Calculated and committed.',Scavenger:'Opportunity looks good.',Survivor:'Staying in this fight.',Wildcard:'Let’s make this interesting.'};
 const contexts:Record<string,string>={CAPTURE:`Moving on ${state.effective.target}.`,HUNT:'Contact acquired. Moving to engage.',FLEE:'Breaking contact for safer space.',LOOT:'Supplies ahead. Taking the detour.',REPOSITION:'Changing position.',galaxy:'Galaxy Gun secured.',damage:'Heavy hits. Staying sharp.',kill:'One fewer contender.',collapse:'The Horizon is forcing us inward.',lost:'Objective gone. Recalculating.',combat:'Under fire. Adjusting course.'};
 const text=provided??`${contexts[event]??contexts.REPOSITION} ${styles[state.personality]}`;
 if(!text||text.length>100||text===state.lastRadio||/[\x00-\x1f<>`]|https?:|www\.|bearer|sk[-_]|api.?key|\d/i.test(text))return;
 runtime.radio.push({id:`${room.code}:${runtime.round}:radio:${++runtime.radioSequence}`,pilotId:p.state.id,name:p.state.name,color:p.state.color,text,source,timeMs:now});runtime.radio=runtime.radio.slice(-6);runtime.radioRevision++;runtime.radioAtMs=state.lastRadioAtMs=now;state.lastRadio=text;
}
export function radioEvents(room:GameRoom,p:RoomPlayer,runtime:PilotRuntime,state:PilotState){
 const s=p.state,hp=s.health+s.shield;let event:string|null=null;
 if(s.goldGunId&&s.goldGunId!==state.lastGalaxy)event='galaxy';else if(s.kills>state.lastKills)event='kill';else if(state.lastHp-hp>=35)event='damage';else if(room.horizon&&room.horizon.elapsedMs>=255000)event='collapse';else if(room.simulationTimeMs-(p.lastAttackedMs??-Infinity)<1000&&hp<140)event='combat';
 if(event)radio(room,p,runtime,state,event);state.lastGalaxy=s.goldGunId??null;state.lastKills=s.kills;state.lastHp=hp;
}
