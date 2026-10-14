import {WORLD} from './flight';
import {WEAPONS} from './weapons';
import {PLANET_REGIONS} from './planets';
import {CAPTURE_RADIUS_FACTOR} from './objectives';
import {LANDING_MARGIN,REQUIRED_LANDING_SEPARATION} from './world';
export {DEFAULT_CAMERA_WIDTH,REGULAR_EFFECTIVE_REACH} from './world';
export const EJECTION_MS=3000,LAUNCH_ORBIT_MS=1400;
export const LAUNCH_ORIGIN={x:WORLD/2,y:WORLD/2};
export const LONGEST_REGULAR_RANGE=Math.max(...Object.values(WEAPONS).map(w=>w.range));
export const LAUNCH_D_MIN=REQUIRED_LANDING_SEPARATION;
// Eight-point square packing: four corners plus an inner diamond. Compare
// perimeter/3-3-2 grids (.5 side) with this configuration (.517638 side).
const low=LANDING_MARGIN,high=WORLD-low,center=WORLD/2,a=low+(1-Math.sqrt(3)/2)*(high-low);
export const LANDING_ZONES=Object.freeze([{x:low,y:low},{x:center,y:a},{x:high,y:low},{x:WORLD-a,y:center},{x:high,y:high},{x:center,y:WORLD-a},{x:low,y:high},{x:a,y:center}].map(p=>Object.freeze(p)));
export function validLanding(p:{x:number;y:number}){return p.x>=low-1e-6&&p.x<=high+1e-6&&p.y>=low-1e-6&&p.y<=high+1e-6&&PLANET_REGIONS.every(v=>Math.hypot(p.x-v.x,p.y-v.y)>v.radius*CAPTURE_RADIUS_FACTOR+300);}
export function selectLandingZones(count:number){
 if(!Number.isInteger(count)||count<1||count>8||LANDING_ZONES.some(p=>!validLanding(p)))throw Error('Invalid landing geometry');
 let best:number[]=[];let score=-1;
 const visit=(indices:number[],start:number)=>{if(indices.length===count){let min=Infinity;for(let i=0;i<count;i++)for(let j=i+1;j<count;j++)min=Math.min(min,Math.hypot(LANDING_ZONES[indices[i]].x-LANDING_ZONES[indices[j]].x,LANDING_ZONES[indices[i]].y-LANDING_ZONES[indices[j]].y));if(min>score){score=min;best=[...indices];}return;}for(let i=start;i<8;i++)visit([...indices,i],i+1);};visit([],0);
 if(score<LAUNCH_D_MIN-1e-6)throw Error('Landing separation cannot satisfy required minimum');
 return best.map(i=>({...LANDING_ZONES[i]}));
}

// One trajectory shared by authoritative ticks and launch-only render sampling.
export function launchPose(destination:{x:number;y:number},angle:number,elapsedMs:number){
 const elapsed=Math.max(0,elapsedMs);
 if(elapsed<LAUNCH_ORBIT_MS){const t=elapsed/LAUNCH_ORBIT_MS,a=angle+t*Math.PI*2,r=150+Math.sin(t*Math.PI)*35;return {x:LAUNCH_ORIGIN.x+Math.cos(a)*r,y:LAUNCH_ORIGIN.y+Math.sin(a)*r,rotation:a+Math.PI/2};}
 const t=Math.min(1,(elapsed-LAUNCH_ORBIT_MS)/EJECTION_MS),ease=t*t*(3-2*t),x=LAUNCH_ORIGIN.x+Math.cos(angle)*150,y=LAUNCH_ORIGIN.y+Math.sin(angle)*150;
 return {x:x+(destination.x-x)*ease,y:y+(destination.y-y)*ease,rotation:angle};
}
