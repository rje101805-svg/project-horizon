import {seededRandom} from './config';
export const GALAXY_SPAN=4096;
export const GALAXIES=[
 {kind:'spiral',x:350,y:185,radius:92,angle:-.45},
 {kind:'band',x:1080,y:510,radius:115,angle:.3},
 {kind:'elliptical',x:1670,y:300,radius:62,angle:-.8},
 {kind:'spiral',x:750,y:950,radius:140,angle:1.1},
 {kind:'band',x:2310,y:820,radius:150,angle:-.2},
] as const;
export function galaxyPoints(index:number){
 const random=seededRandom(32610+index),g=GALAXIES[index];
 return Array.from({length:900},(_,i)=>{
  const r=Math.sqrt(random()),arm=i%3,theta=arm*Math.PI*2/3+r*9+(random()-.5)*.55;
  let x:number,y:number;
  if(g.kind==='spiral'){x=Math.cos(theta)*r*g.radius;y=Math.sin(theta)*r*g.radius*.5;}
  else {x=(random()+random()-1)*g.radius;y=(random()+random()-1)*g.radius*(g.kind==='band'?.08:.38);}
  return {x:g.x+x*Math.cos(g.angle)-y*Math.sin(g.angle),y:g.y+x*Math.sin(g.angle)+y*Math.cos(g.angle),alpha:.08+random()*.32,size:.4+random()*.8};
 });
}
export function paintGalaxies(ctx:CanvasRenderingContext2D,size:number){
 const scale=size/GALAXY_SPAN;ctx.save();ctx.scale(scale,scale);
 for(const [i,g] of GALAXIES.entries()){
  ctx.save();ctx.translate(g.x,g.y);ctx.rotate(g.angle);ctx.scale(1,g.kind==='band'?.16:.5);
  const glow=ctx.createRadialGradient(0,0,0,0,0,g.radius);glow.addColorStop(0,'rgba(178,171,230,.45)');glow.addColorStop(.15,'rgba(94,126,226,.15)');glow.addColorStop(1,'rgba(70,100,200,0)');ctx.fillStyle=glow;ctx.fillRect(-g.radius,-g.radius,g.radius*2,g.radius*2);ctx.restore();
  for(const p of galaxyPoints(i)){ctx.fillStyle=`rgba(160,188,255,${p.alpha})`;ctx.fillRect(p.x,p.y,p.size,p.size);}
 }ctx.restore();
}
