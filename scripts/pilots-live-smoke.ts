// Explicit opt-in live API check. Never imported by production or automated tests.
import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {RoomStore} from '../server/rooms';
import {PilotCoordinator} from '../server/ai/coordinator';
import {aiConfig} from '../server/ai/openai';
import {startMatch,advanceMatch} from '../server/match';
import {advanceBots,advanceBotActions} from '../server/bots';
import {resolveTarget} from '../server/ai/context';
import {simulatePlayer} from '../server/simulation';
import {TICK_MS} from '../shared/flight';
if(existsSync('.env'))loadEnvFile('.env');
const config=aiConfig();
if(!config.key){console.info('LIVE UNVERIFIED: no OPENAI_API_KEY configured. No requests made.');process.exitCode=2;}
else{
 // Permit at most two attempts; the normal cap fallback discards the last
 // budget-exhausting response. A first successful request can be applied.
 const ai=new PilotCoordinator({...config,enabled:true,matchCap:2,hourCap:2,concurrency:1});
 const store=new RoomStore();store.play('local-smoke-human','Local pilot','fill',0);const room=store.roomFor('local-smoke-human')!;
 startMatch(room,'local-smoke-human',{round:room.match.round});const origin=room.simulationTimeMs;advanceMatch(room,origin+3000);advanceMatch(room,origin+4800);advanceMatch(room,origin+9200);ai.register(store);
 const started=performance.now();let tick=0,success=false,observed:{id:string;target:string;distance:number}|undefined;
 try{
  while(performance.now()-started<25000){room.simulationTimeMs=origin+9200+(++tick)*TICK_MS;advanceBots(room,performance.now(),tick);for(const p of room.players.values())simulatePlayer(p,room,performance.now(),room.simulationTimeMs);advanceBotActions(room,tick);ai.tick();await new Promise(r=>setTimeout(r,TICK_MS));
   const intel=ai.intel(room);if(intel.allowed&&intel.rows.some(row=>row.source==='AI')&&(room.pilots?.applied??0)>0){const row=intel.rows.find(row=>row.source==='AI')!,p=room.players.get(row.id)!,targetId=room.pilots!.states.get(row.id)!.intent!.decision.targetId!,target=resolveTarget(room,p,targetId);if(target&&(!observed||observed.id!==row.id||observed.target!==targetId))observed={id:row.id,target:targetId,distance:target.distance};if(target&&observed&&target.distance<observed.distance-5){console.info('LIVE VERIFIED',JSON.stringify({model:config.model,pilot:row.name,intent:row.intent,target:row.target,source:row.source,calls:intel.calls,accepted:intel.accepted,applied:intel.applied,averageLatencyMs:intel.averageLatencyMs,tokens:intel.tokens,radio:room.pilots!.radio.map(m=>({name:m.name,source:m.source,text:m.text}))}));success=true;break;}}
  }
  if(!success){const p=ai.intel(room);console.info('LIVE NOT VERIFIED',JSON.stringify(p.allowed?{calls:p.calls,status:p.status,accepted:p.accepted,applied:p.applied}:{}));process.exitCode=1;}
 }finally{ai.detach(store);}
}
