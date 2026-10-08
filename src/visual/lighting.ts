import { clamp01 } from './config';
export type Point={x:number;y:number};
export const COOL_KEY=[-.65,-.42,.63] as const;
export function horizonDirection(body:Point,horizon:Point):[number,number,number] {
  const x=horizon.x-body.x,y=horizon.y-body.y,length=Math.hypot(x,y);
  if(length<.001)return [0,0,1];
  const z=.48,n=Math.sqrt(1+z*z);return [x/length/n,y/length/n,z/n];
}
export function shadeNormal(normal:readonly number[],warmDirection:readonly number[],intensity:number,surface=1):[number,number,number] {
  const i=clamp01(intensity),cool=Math.max(0,normal[0]*COOL_KEY[0]+normal[1]*COOL_KEY[1]+normal[2]*COOL_KEY[2])*(1-.7*i);
  const warm=Math.max(0,normal[0]*warmDirection[0]+normal[1]*warmDirection[1]+normal[2]*warmDirection[2])*i;
  return [Math.min(.55,(.024+cool*.29+warm*.44)*surface),Math.min(.55,(.035+cool*.38+warm*.30)*surface),Math.min(.55,(.05+cool*.44+warm*.16)*surface)];
}
export function visibleCircle(view:{left:number;right:number;top:number;bottom:number},p:Point,radius:number){return p.x+radius>=view.left&&p.x-radius<=view.right&&p.y+radius>=view.top&&p.y-radius<=view.bottom;}
