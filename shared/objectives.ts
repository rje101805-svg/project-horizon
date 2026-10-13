import {TICK_MS} from './flight';
export const CAPTURE_DURATION_MS=10000;
export const CAPTURE_TICKS=Math.ceil(CAPTURE_DURATION_MS/TICK_MS);
export const CAPTURE_RADIUS_FACTOR=1.25;
export const CAPTURE_DECAY_RATE=2;
export const MAX_ANNOUNCEMENTS=8;
export const GOLD_SPAWN_CLEARANCE=80;
export type PlanetStatus='AVAILABLE'|'CAPTURING'|'CONTESTED'|'GOLD_GUN_AVAILABLE'|'CONSUMED';
export interface CaptureProgress {participantId:string;progressMs:number;completed:boolean;inside:boolean}
export interface PlanetObjective {id:string;name:string;x:number;y:number;radius:number;captureRadius:number;status:PlanetStatus;capturingId:string|null;occupants:string[];pickupId:string|null;progress:CaptureProgress[]}
export interface GoldPickup {galaxyType?:import('./weapons').GalaxyType; blockedId?:string;blockedUntilMs?:number;id:string;x:number;y:number;source:'planet'|'drop';planetId:string|null;spawnTimeMs:number}
export interface ObjectiveAnnouncement {id:number;round:number;timeMs:number;kind:'started'|'captured'|'claimed'|'dropped'|'consumed';text:string;planetId?:string;participantId?:string}
export interface ObjectiveSnapshot {round:number;planets:PlanetObjective[];pickups:GoldPickup[];announcements:ObjectiveAnnouncement[]}
