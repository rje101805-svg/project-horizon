import {WORLD,EDGE_MARGIN} from './flight';
import {WEAPONS} from './weapons';
import {PLANET_REGIONS} from './planets';
import {CAPTURE_RADIUS_FACTOR} from './objectives';
export const DEFAULT_CAMERA_WIDTH=1100;
export const ORIGINAL_EJECTION_RADIUS=360;
export const EJECTION_MS=2000,LAUNCH_ORBIT_MS=1400;
export const LAUNCH_ORIGIN={x:(0+WORLD)/2,y:(0+WORLD)/2};
export const LONGEST_REGULAR_RANGE=Math.max(...Object.values(WEAPONS).map(w=>w.range));
export const LAUNCH_D_MIN=Math.max(1.5*LONGEST_REGULAR_RANGE,1.2*DEFAULT_CAMERA_WIDTH);
export const LAUNCH_RADIUS_A=2.5*ORIGINAL_EJECTION_RADIUS;
export const LAUNCH_RADIUS_B=LAUNCH_D_MIN/(2*Math.sin(Math.PI/8));
export const LAUNCH_RADIUS=Math.max(LAUNCH_RADIUS_A,LAUNCH_RADIUS_B);
export function launchLanding(angle:number){return {x:LAUNCH_ORIGIN.x+Math.cos(angle)*LAUNCH_RADIUS,y:LAUNCH_ORIGIN.y+Math.sin(angle)*LAUNCH_RADIUS};}
export function validLanding(p:{x:number;y:number}){return p.x>=EDGE_MARGIN&&p.x<=WORLD-EDGE_MARGIN&&p.y>=EDGE_MARGIN&&p.y<=WORLD-EDGE_MARGIN&&PLANET_REGIONS.every(v=>Math.hypot(p.x-v.x,p.y-v.y)>v.radius*CAPTURE_RADIUS_FACTOR+300);}
