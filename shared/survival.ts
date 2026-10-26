import {WORLD,BASE_WORLD,LOOT_SCALE} from './world';
import {MAX_ROOM_PLAYERS} from './rooms';
import {BASIC_BLASTER} from './projectiles';
export type Consumable='cell'|'repair';
export interface HealingUse {kind:Consumable;startedAtMs:number;endsAtMs:number;life:number;teleport:number}
export interface SurvivalInventory {materials:number;cells:number;kits:number;use:HealingUse|null;notice:string;noticeUntilMs:number}
export const initialSurvival=():SurvivalInventory=>({materials:0,cells:0,kits:0,use:null,notice:'',noticeUntilMs:0});
// Two whole stacks fund two 20-material walls per pilot at the original map
// area. Scale that base density with actual area; guarantee two finds on each
// landing route instead of oversupplying a full minute of uninterrupted flight.
export const SURVIVAL=Object.freeze({materialValue:25,materialCap:300,materialCount:Math.ceil(MAX_ROOM_PLAYERS*Math.ceil(2*20/25)*(WORLD/BASE_WORLD)**2),healingCount:Math.round(35*LOOT_SCALE/2),cellCap:3,kitCap:2,cellMs:2000,repairMs:3000,cellRestore:50,repairRestore:40,wallCost:20,wallHp:75,wallMs:15000,wallCap:3,wallCooldownMs:500,wallWidth:BASIC_BLASTER.shipRadius*3,wallThickness:8,wallAhead:BASIC_BLASTER.shipRadius*3});
// angle is the aim-facing surface normal; the long edge is perpendicular.
export interface ShieldWall {id:string;ownerId:string;x:number;y:number;angle:number;hp:number;createdAtMs:number;expiresAtMs:number;hitAtMs:number}
export interface SurvivalRequest {sequence:number;roomCode:string;round:number;reloadSession:string;lifeGeneration:number;teleportSequence:number;action:'wall'|Consumable;aim?:number}
export interface SurvivalResult {ok:boolean;reason:string}
export function parseSurvival(raw:unknown):SurvivalRequest|null {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;const r=raw as SurvivalRequest;
 if(Object.keys(r).some(k=>!['sequence','roomCode','round','reloadSession','lifeGeneration','teleportSequence','action','aim'].includes(k))||!Number.isSafeInteger(r.sequence)||r.sequence<=0||![r.round,r.lifeGeneration,r.teleportSequence].every(v=>Number.isSafeInteger(v)&&v>=0)||typeof r.roomCode!=='string'||typeof r.reloadSession!=='string'||!['wall','cell','repair'].includes(r.action)||r.action==='wall'&&(!Number.isFinite(r.aim)||Math.abs(r.aim!)>Math.PI*4)||r.action!=='wall'&&r.aim!==undefined)return null;return r;
}
// Sweep a projectile circle through an oriented thin wall using slab clipping.
export function wallEntry(a:{x:number;y:number},b:{x:number;y:number},wall:ShieldWall,radius=0):number|null {
 const c=Math.cos(wall.angle),s=Math.sin(wall.angle),local=(p:{x:number;y:number})=>({x:(p.x-wall.x)*c+(p.y-wall.y)*s,y:-(p.x-wall.x)*s+(p.y-wall.y)*c}),p=local(a),q=local(b);let lo=0,hi=1;
 for(const [start,delta,extent]of [[p.x,q.x-p.x,SURVIVAL.wallThickness/2+radius],[p.y,q.y-p.y,SURVIVAL.wallWidth/2+radius]]){if(Math.abs(delta)<1e-12){if(Math.abs(start)>extent)return null;}else{const t1=(-extent-start)/delta,t2=(extent-start)/delta;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(lo>hi)return null;}}return lo;
}

export function wallDistance(point:{x:number;y:number},wall:ShieldWall){const c=Math.cos(wall.angle),s=Math.sin(wall.angle),dx=point.x-wall.x,dy=point.y-wall.y;return Math.hypot(Math.max(0,Math.abs(dx*c+dy*s)-SURVIVAL.wallThickness/2),Math.max(0,Math.abs(-dx*s+dy*c)-SURVIVAL.wallWidth/2));}
