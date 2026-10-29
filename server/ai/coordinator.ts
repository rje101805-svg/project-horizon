import type {GameRoom,RoomPlayer,RoomStore} from '../rooms';
import type {IntelPacket,RadioPacket,PilotDecision} from '../../shared/pilots';
import {aiConfig,OpenAIStrategy,type AIConfig,type StrategicProvider} from './openai';
import {buildContext,livingBot,personality,validateDecision} from './context';
import {fallback,setIntent} from './strategy';
import {radio,radioEvents} from './radio';
import type {PilotRuntime,PilotState} from './types';
interface Pending {room:GameRoom;runtime:PilotRuntime;bot:RoomPlayer;state:PilotState;sequence:number;version:number;life:number;teleport:number;controller:AbortController;started:number}
export class PilotCoordinator {
 private stores=new Set<RoomStore>();private pending=new Set<Pending>();private hour:number[]=[];private cursor=0;private generation=0;private warnedMissing=false;private exhausted=false;private lastPublish=new WeakMap<GameRoom,number>();private lastRadio=new WeakMap<GameRoom,string>();
 constructor(readonly config:AIConfig=aiConfig(),private provider:StrategicProvider=new OpenAIStrategy(config),private clock=()=>performance.now(),private log:(message:string)=>void=console.info){}
 register(store:RoomStore){this.stores.add(store);if(this.config.enabled&&!this.provider.available&&!this.warnedMissing){this.warnedMissing=true;this.log('[AI] FALLBACK: missing OpenAI key; gameplay and solo Intel remain enabled');}}
 detach(store:RoomStore){this.stores.delete(store);for(const job of this.pending)if([...store.rooms.values()].includes(job.room))job.controller.abort();}
 authorized(room:GameRoom){const humans=[...room.players.values()].filter(p=>p.state.controllerType==='HUMAN').length;return room.match.mode!=='practice'&&(humans===1||humans>=2&&this.config.intelMultiplayer);}
 private prune(){const now=this.clock();while(this.hour.length&&now-this.hour[0]>=3600000)this.hour.shift();if(this.hour.length<this.config.hourCap)this.exhausted=false;}
 private create(room:GameRoom):PilotRuntime{return room.pilots={round:room.match.round,generation:++this.generation,startedAtMs:room.match.phaseStartedAtMs,calls:0,tokens:0,responseCount:0,accepted:0,applied:0,invalid:0,timeouts:0,rateLimits:0,stale:0,fallbacks:0,latencyTotal:0,completedRequests:0,cadences:[],bucket:1,refillAtMs:room.simulationTimeMs,states:new Map(),radio:[],radioSequence:0,radioAtMs:-1e9,radioRevision:0,status:this.status()};}
 private status(){return !this.config.enabled?'DISABLED':!this.provider.available?'API UNAVAILABLE':this.hour.length>=this.config.hourCap?'HOURLY LIMIT REACHED':this.config.matchCap===0||this.config.concurrency===0?'BUDGET DISABLED':'ENABLED';}
 private sync(room:GameRoom){
  if(room.match.mode==='practice'||room.match.state!=='active'){for(const job of this.pending)if(job.room===room)job.controller.abort();if(room.pilots){for(const state of room.pilots.states.values()){state.intent=null;state.pending=false;}room.pilots.states.clear();if(room.pilots.round!==room.match.round||room.match.state==='waiting')room.pilots=undefined;}return;}
  const runtime=room.pilots?.round===room.match.round?room.pilots:this.create(room),now=room.simulationTimeMs;
  runtime.bucket=Math.min(3,runtime.bucket+Math.max(0,now-runtime.refillAtMs)*this.config.matchCap/300000);runtime.refillAtMs=now;const available=this.status();if(available!=='ENABLED'||runtime.status==='HOURLY LIMIT REACHED'&&available==='ENABLED')runtime.status=available;if(runtime.calls>=this.config.matchCap)this.forceFallback(room,'MATCH LIMIT REACHED');
  const bots=[...room.players.values()].filter(p=>livingBot(room,p));let index=0;
  for(const p of bots){let state=runtime.states.get(p.state.id);if(!state){state={personality:personality(p),intent:null,nextAtMs:now+500+index*2100,sequence:0,version:0,pending:false,emergency:false,effective:{action:'REPOSITION',target:'Tactical positioning',source:'FALLBACK',expiresAtMs:now},history:[],lastRadioAtMs:-1e9,lastRadio:'',lastGalaxy:p.state.goldGunId??null,lastKills:p.state.kills,lastHp:p.state.health+p.state.shield};runtime.states.set(p.state.id,state);setIntent(runtime,state,fallback(room,p,state),'FALLBACK',now);}index++;radioEvents(room,p,runtime,state);if(state.effective.source==='FALLBACK'&&(!this.config.enabled||!this.provider.available||runtime.status!=='ENABLED'||state.sequence>0&&!state.pending))radio(room,p,runtime,state,state.effective.action);}
  for(const [id,state]of runtime.states)if(!bots.some(p=>p.state.id===id)){state.version++;runtime.states.delete(id);for(const job of this.pending)if(job.state===state)job.controller.abort();}
 }
 tick(){
  this.prune();const rooms=[...this.stores].flatMap(store=>[...store.rooms.values()]);for(const room of rooms)this.sync(room);for(const job of this.pending)if(!rooms.includes(job.room)||!this.valid(job))job.controller.abort();
  if(!this.config.enabled||!this.provider.available||this.config.concurrency===0||this.config.matchCap===0)return;
  if(this.hour.length>=this.config.hourCap){if(!this.exhausted){this.exhausted=true;this.log('[AI] HOURLY LIMIT REACHED; deterministic fallback continues');}for(const room of rooms)this.forceFallback(room,'HOURLY LIMIT REACHED');return;}
  let idle=0;while(this.pending.size<this.config.concurrency&&rooms.length&&idle<rooms.length){const room=rooms[this.cursor++%rooms.length],runtime=room.pilots;
   if(room.match.state!=='active'||!runtime||runtime.calls>=this.config.matchCap||runtime.bucket<1){idle++;continue;}
   const due=[...runtime.states].filter(([,s])=>!s.pending&&!s.emergency&&s.nextAtMs<=room.simulationTimeMs).sort((a,b)=>a[1].nextAtMs-b[1].nextAtMs||a[0].localeCompare(b[0]))[0];if(!due){idle++;continue;}
   if(this.hour.length>=this.config.hourCap)break;const bot=room.players.get(due[0]);if(!bot||!livingBot(room,bot)){idle++;continue;}
   this.dispatch(room,runtime,bot,due[1]);idle=0;
  }
 }
 private forceFallback(room:GameRoom,status:string){const runtime=room.pilots;if(!runtime)return;runtime.status=status;for(const [id,state]of runtime.states){const p=room.players.get(id);if(p&&state.intent?.source==='AI')setIntent(runtime,state,fallback(room,p,state),'FALLBACK',room.simulationTimeMs);}}
 private valid(job:Pending){return job.room.match.state==='active'&&job.room.pilots===job.runtime&&job.runtime.round===job.room.match.round&&job.runtime.states.get(job.bot.state.id)===job.state&&livingBot(job.room,job.bot)&&job.state.sequence===job.sequence&&job.state.version===job.version&&job.bot.state.lifeGeneration===job.life&&job.bot.state.teleportSequence===job.teleport;}
 private dispatch(room:GameRoom,runtime:PilotRuntime,bot:RoomPlayer,state:PilotState){
  const {context,targets}=buildContext(room,bot,state.intent?.decision);if(!targets.length){state.nextAtMs=room.simulationTimeMs+15000;return;}
  const now=room.simulationTimeMs,previous=state.lastRequestAtMs;state.nextAtMs=now+12000+((state.sequence*7919+bot.state.color)%6001);state.pending=true;
  const job:Pending={room,runtime,bot,state,sequence:++state.sequence,version:state.version,life:bot.state.lifeGeneration,teleport:bot.state.teleportSequence,controller:new AbortController(),started:this.clock()};this.pending.add(job);runtime.calls++;runtime.bucket--;this.hour.push(this.clock());
  if(previous!==undefined&&state.sequence>1){runtime.cadences.push(now-previous);runtime.cadences=runtime.cadences.slice(-120);}state.lastRequestAtMs=now;
  // A real timer bounds the network only; simulation never awaits this promise.
  let timeout:ReturnType<typeof setTimeout>;const deadline=new Promise<never>((_,reject)=>{timeout=setTimeout(()=>{reject(Object.assign(new Error('Timeout'),{name:'TimeoutError'}));job.controller.abort();},this.config.timeoutMs);});
  const aborted=new Promise<never>((_,reject)=>job.controller.signal.addEventListener('abort',()=>reject(Object.assign(new Error('Aborted'),{name:'AbortError'})),{once:true}));
  void Promise.race([Promise.resolve().then(()=>{if(!this.valid(job)||job.controller.signal.aborted)throw Object.assign(new Error('Aborted'),{name:'AbortError'});return this.provider.decide(context,job.controller.signal);}),deadline,aborted]).then(result=>{
   runtime.responseCount++;runtime.tokens+=Math.max(0,Math.min(100000,result.tokens||0));if(!this.valid(job)){runtime.stale++;return;}const value=validateDecision(result.value,targets,room,bot);if(!value){runtime.invalid++;this.reject(job,'INVALID RESPONSE');return;}
   if(runtime.calls>=this.config.matchCap||this.hour.length>=this.config.hourCap){this.forceFallback(room,runtime.calls>=this.config.matchCap?'MATCH LIMIT REACHED':'HOURLY LIMIT REACHED');return;}
   runtime.accepted++;const source=result.provenance==='OPENAI'&&this.provider instanceof OpenAIStrategy?'AI':'FALLBACK';setIntent(runtime,state,value,source,room.simulationTimeMs,job.sequence);state.effective={action:value.action,target:targets.find(t=>t.id===value.targetId)?.label??'Safe sector',source,expiresAtMs:state.intent!.expiresAtMs};runtime.status=source==='AI'?'ENABLED':'MOCK — FALLBACK LABEL';radio(room,bot,runtime,state,value.action,source==='AI'?value.radio??undefined:undefined,source);
   this.log(`[AI] response ${JSON.stringify({room:room.code,round:runtime.round,pilot:bot.state.name,result:source==='AI'?'accepted':'mock-validated',latencyMs:this.clock()-job.started})}`);
  }).catch(error=>{const type=error?.status===429?'RATE LIMITED':error?.name==='TimeoutError'||error?.name==='APIConnectionTimeoutError'||job.controller.signal.aborted&&this.clock()-job.started>=this.config.timeoutMs?'TIMEOUT':error?.name==='AbortError'?'STALE RESPONSE':'API UNAVAILABLE';if(type==='TIMEOUT')runtime.timeouts++;if(type==='RATE LIMITED')runtime.rateLimits++;if(!this.valid(job)){runtime.stale++;return;}this.reject(job,type);}).finally(()=>{clearTimeout(timeout!);runtime.latencyTotal+=Math.max(0,this.clock()-job.started);runtime.completedRequests++;state.pending=false;this.pending.delete(job);});
 }
 private reject(job:Pending,status:string){job.runtime.status=status;setIntent(job.runtime,job.state,fallback(job.room,job.bot,job.state),'FALLBACK',job.room.simulationTimeMs);this.log(`[AI] ${status}; deterministic fallback`);}
 intel(room:GameRoom):IntelPacket {
  this.prune();if(!this.authorized(room))return {roomCode:room.code,round:room.match.round,allowed:false};const r=room.pilots?.round===room.match.round?room.pilots:undefined;
  return {roomCode:room.code,round:room.match.round,allowed:true,rows:[...room.players.values()].filter(p=>p.state.controllerType==='BOT'&&p.state.status==='ALIVE'&&p.state.lifeState==='active'&&p.state.health>0).map(p=>{const state=r?.states.get(p.state.id),e=state?.effective;return {id:p.state.id,name:p.state.name,color:p.state.color,personality:state?.personality??personality(p),intent:room.match.state==='active'?e?.action??'REPOSITION':'WAITING',target:room.match.state==='active'?e?.target??'Tactical positioning':'Waiting for ACTIVE',source:e?.source??'FALLBACK',remainingMs:Math.max(0,(e?.expiresAtMs??0)-room.simulationTimeMs)};}),enabled:this.config.enabled,status:r?.status??this.status(),calls:r?.calls??0,limit:this.config.matchCap,averageLatencyMs:r?.completedRequests?Math.round(r.latencyTotal/r.completedRequests):0,hourlyCalls:this.hour.length,hourlyLimit:this.config.hourCap,accepted:r?.accepted??0,applied:r?.applied??0,fallbacks:r?.fallbacks??0,tokens:r?.tokens??0,cadenceMs:r?.cadences.length?Math.round(r.cadences.reduce((a,b)=>a+b,0)/r.cadences.length):null};
 }
 radioPacket(room:GameRoom):RadioPacket{return {roomCode:room.code,round:room.match.round,messages:(room.pilots?.radio??[]).filter(m=>room.simulationTimeMs-m.timeMs<=15000)};}
 shouldPublish(room:GameRoom){const last=this.lastPublish.get(room)??-Infinity;if(room.simulationTimeMs-last<200)return false;this.lastPublish.set(room,room.simulationTimeMs);return true;}
 shouldPublishRadio(room:GameRoom){const revision=`${room.match.round}:${room.pilots?.radioRevision??0}`,old=this.lastRadio.get(room);if(old===revision)return false;this.lastRadio.set(room,revision);return true;}
 get activeRequests(){return this.pending.size;}
 get hourlyCalls(){this.prune();return this.hour.length;}
}
let processService:PilotCoordinator|undefined;
export const processPilots=()=>processService??=new PilotCoordinator();
