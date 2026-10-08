import {seededRandom} from './config';
// One field spans more than the entire 12k world's star/haze parallax travel.
// The seams are periodic, but normal travel cannot reveal repeated clusters.
export const SKY_SPAN=2048;
export interface Star {x:number;y:number;size:number;alpha:number;color:number}
export const STAR_COLORS=[0xb9c6d4,0xaebfd5,0xd0ccc2,0xbfb5a1] as const;
export function skyDensity(x:number,y:number){
 const a=x/SKY_SPAN*Math.PI*2,b=y/SKY_SPAN*Math.PI*2;
 return Math.max(.06,.40+.27*Math.sin(a+.6*Math.sin(b))+.19*Math.cos(b*2-a));
}
export function generateStars(seed=3251):Star[]{
 const random=seededRandom(seed),stars:Star[]=[];
 for(let i=0;i<27000;i++){
  const x=random()*SKY_SPAN,y=random()*SKY_SPAN;if(random()>skyDensity(x,y))continue;
  const rank=random(),alpha=.045+rank**5*.43,size=.55+rank**3*.7;
  stars.push({x,y,size,alpha,color:Math.floor(random()*STAR_COLORS.length)});
 }
 // Four localized, irregular stellar concentrations, separated by dark gaps.
 for(const [cx,cy]of [[430,260],[1400,800],[650,1500],[1780,1700]])for(let i=0;i<650;i++){
  const x=(cx+(random()+random()+random()-1.5)*115+SKY_SPAN)%SKY_SPAN,y=(cy+(random()+random()+random()-1.5)*75+SKY_SPAN)%SKY_SPAN;
  stars.push({x,y,size:.45+random()*.55,alpha:.04+random()**4*.30,color:Math.floor(random()*4)});
 }
 // Twelve sparse bright anchors; six receive slow twinkling on a second depth.
 for(let i=0;i<12;i++)stars.push({x:random()*SKY_SPAN,y:random()*SKY_SPAN,size:1.45,alpha:.65,color:i%4});
 return stars;
}
// Periodic warped multiscale fields, baked once. No runtime animated noise.
export function nebulaColor(u:number,v:number):readonly number[]{
 const a=u*Math.PI*2,b=v*Math.PI*2;
 const warp=Math.sin(a*2+b)*.75+Math.cos(b*3-a)*.45;
 const field=Math.sin(a+warp)+.5*Math.cos(b*2-a)+.3*Math.sin(a*3+b*3)+.2*Math.cos(a*5-b*4);
 const gas=Math.max(0,Math.min(1,(field-.30)*1.25));
 const filament=.58+.18*Math.sin(a*11+b*7+warp*4)+.12*Math.cos(a*7-b*13+Math.sin(b*5)*3)+.10*Math.sin(a*23+b*17+Math.sin(a*9-b*11)*3);
 const blue=.5+.5*Math.sin(b-a),pink=.5+.5*Math.cos(a+b*2);
 const cyan=Math.max(0,Math.sin(a*3-b*2+warp)-.55)*gas;
 return [4+gas*(85+pink*100-blue*45)*filament+cyan*15,7+gas*(18+blue*55)*filament+cyan*130,14+gas*(150+blue*70)*filament+cyan*80];
}
export function parallaxOffset(scroll:number,factor:number,span=SKY_SPAN){return ((scroll*factor)%span+span)%span;}
