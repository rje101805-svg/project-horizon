import {fighterStats} from './fighters';
import {GUARDIAN_PROFILES} from './guardians';
import type {DamageSource,PlayerStatus} from './combat';
import type {Snapshot} from './protocol';
import {DEFAULT_CAMERA_WIDTH} from './world';
export interface Standing {fighterId?:import('./fighters').FighterId;id:string;name:string;color:number;status:PlayerStatus|'WINNER'|'DRAW';kills:number;damage:number;survivedMs:number;captures:number;walls:number;placement:number|null;eliminatedAtMs:number|null;deathSequence:number;cause:string|null}
export interface BattleSnapshot {round:number;total:number;remaining:number;standings:Standing[]}
export interface RadarPing {id:string;pilotId:string;x:number;y:number;timeMs:number}
export const RADAR_RANGE=DEFAULT_CAMERA_WIDTH*1.5,FIRE_RADAR_RANGE=DEFAULT_CAMERA_WIDTH*2.5,FIRE_PING_MS=2000;
export function radarContacts(snapshot:Snapshot,selfId:string){const self=snapshot.players.find(p=>p.id===selfId),living=snapshot.players.filter(p=>p.id!==selfId&&p.status==='ALIVE'&&p.lifeState==='active'&&p.health>0&&snapshot.match.roster.includes(p.id));return {ships:self?living.filter(p=>Math.hypot(p.x-self.x,p.y-self.y)<=RADAR_RANGE*fighterStats(self).radar*fighterStats(p).signature):[],pings:(snapshot.radarPings??[]).filter(p=>snapshot.timeMs>=p.timeMs&&snapshot.timeMs-p.timeMs<FIRE_PING_MS&&living.some(q=>q.id===p.pilotId))};}
export function causeLabel(source:DamageSource,lookup:(id:string)=>string){return source.type==='GUARDIAN'?GUARDIAN_PROFILES[source.planetId]?.name??'Planet Guardians':source.type==='ENVIRONMENT'?source.cause==='BLACK_HOLE'?'the Horizon':'a hazard':`${lookup(source.playerId)}${source.type==='TRACTOR'?' · Tractor lock':source.weaponName?` · ${source.rarity?source.rarity+' ':''}${source.weaponName}`:''}`;}
