import {seededRandom} from './config';
export function rockOutline(seed:number):readonly {x:number;y:number}[]{
 const random=seededRandom(seed),count=7+Math.floor(random()*4);
 return Array.from({length:count},(_,i)=>{const a=i/count*Math.PI*2,r=.64+random()*.31;return {x:Math.cos(a)*r,y:Math.sin(a)*r*(.65+random()*.25)};});
}
export function bakeRock(ctx:CanvasRenderingContext2D,size:number,seed:number){
 const points=rockOutline(seed),random=seededRandom(seed+1),center={x:-.08,y:.04};
 ctx.clearRect(0,0,size,size);ctx.save();ctx.translate(size/2,size/2);ctx.scale(size*.48,size*.48);
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],mx=(a.x+b.x)*.5,my=(a.y+b.y)*.5;
  const light=Math.max(0,-mx*.65-my*.42),value=Math.round(33+light*36+random()*8);
  ctx.fillStyle=`rgb(${value},${value+3},${value+7})`;ctx.beginPath();ctx.moveTo(center.x,center.y);ctx.lineTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.closePath();ctx.fill();
 }
 ctx.strokeStyle='rgba(120,128,139,.12)';ctx.lineWidth=.025;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();ctx.restore();
}
