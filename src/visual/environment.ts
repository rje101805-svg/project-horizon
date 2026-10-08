import {seededRandom} from './config';
// One field spans more than the entire 12k world's star/haze parallax travel.
// The seams are periodic, but normal travel cannot reveal repeated clusters.
export const SKY_SPAN=2048;
export interface Star {x:number;y:number;size:number;alpha:number;color:number}
export const STAR_COLORS=[0xb9c6d4,0xaebfd5,0xd0ccc2,0xbfb5a1] as const;
export function skyDensity(x:number,y:number){
 const a=x/SKY_SPAN*Math.PI*2,b=y/SKY_SPAN*Math.PI*2;
 return .48+.20*Math.sin(a+.6*Math.sin(b))+.13*Math.cos(b*2-a);
}
export function generateStars(seed=3251):Star[]{
 const random=seededRandom(seed),stars:Star[]=[];
 for(let i=0;i<14000;i++){
  const x=random()*SKY_SPAN,y=random()*SKY_SPAN;if(random()>skyDensity(x,y))continue;
  const rank=random(),alpha=.045+rank**5*.43,size=.55+rank**3*.7;
  stars.push({x,y,size,alpha,color:Math.floor(random()*STAR_COLORS.length)});
 }
 // Only five restrained anchor stars, without projectile-like halos or trails.
 for(let i=0;i<5;i++)stars.push({x:random()*SKY_SPAN,y:random()*SKY_SPAN,size:1.45,alpha:.65,color:i%4});
 return stars;
}
// Periodic warped multiscale fields, baked once. No runtime animated noise.
export function nebulaColor(u:number,v:number):readonly number[]{
 const a=u*Math.PI*2,b=v*Math.PI*2;
 const warp=Math.sin(a*2+b)*.65+Math.cos(b*3-a)*.3;
 const gas=Math.max(0,Math.sin(a+warp)+.4*Math.cos(b*2-a)+.22*Math.sin(a*5+b*3)-.35);
 const lane=Math.max(0,1-Math.abs(Math.sin(b*2+warp+a))*4);
 const blue=Math.max(0,Math.sin(b-a));
 return [5+gas*(17-blue*7)-lane*2,9+gas*(7+blue*9)-lane*3,16+gas*(24+blue*4)-lane*4];
}
export function parallaxOffset(scroll:number,factor:number,span=SKY_SPAN){return ((scroll*factor)%span+span)%span;}
