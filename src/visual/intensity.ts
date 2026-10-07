import { clamp01, type VisualQuality } from './config';
export class VisualIntensity {
 target=0;current=0;quality:VisualQuality='standard';camera=true;parallax=true;
 update(elapsedMs:number){this.current=blendIntensity(this.current,this.target,elapsedMs);return this.current;}
}
export function blendIntensity(current:number,target:number,elapsedMs:number){return clamp01(current)+(clamp01(target)-clamp01(current))*(1-Math.exp(-Math.max(0,Math.min(100,elapsedMs))/450));}
// Localized quad covers only the viewport intersection, even for future huge bodies.
export function lensRegion(view:{left:number;right:number;top:number;bottom:number},p:{x:number;y:number},r:number){
 const left=Math.max(view.left,p.x-r*3.6),right=Math.min(view.right,p.x+r*3.6),top=Math.max(view.top,p.y-r*3.6),bottom=Math.min(view.bottom,p.y+r*3.6);
 return right>left&&bottom>top?{x:(left+right)/2,y:(top+bottom)/2,width:right-left,height:bottom-top}:null;
}
export function advancedEnabled(webgl:boolean,compiled:boolean,quality:VisualQuality){return webgl&&compiled&&quality==='standard';}
