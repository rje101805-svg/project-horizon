// Bounded rendering-only events. Reuse caller storage, no timer/emitter or gameplay clock.
export const METEORS=[
 {x:.13,y:.28,dx:125,dy:44,color:0xb4b9ff},
 {x:.72,y:.16,dx:-110,dy:64,color:0x9fdae9},
 {x:.26,y:.64,dx:140,dy:-48,color:0xddb6e8},
 {x:.85,y:.60,dx:-120,dy:-55,color:0xbacbf4},
 {x:.44,y:.14,dx:95,dy:72,color:0xcac1ef},
 {x:.65,y:.73,dx:-135,dy:-36,color:0xc2d8e5},
] as const;
export interface MeteorFrame {x:number;y:number;tailX:number;tailY:number;alpha:number;color:number}
export function sampleMeteor(elapsed:number,width:number,height:number,out:MeteorFrame){
 if(!Number.isFinite(elapsed)||elapsed<0)return false;
 const cycle=Math.floor(elapsed/18000),phase=elapsed-cycle*18000-5000;if(phase<0||phase>=550)return false;
 const m=METEORS[cycle%METEORS.length],t=phase/550,tail=Math.min(.22,t);
 out.x=m.x*width+m.dx*t;out.y=m.y*height+m.dy*t;
 out.tailX=out.x-m.dx*tail;out.tailY=out.y-m.dy*tail;
 out.alpha=Math.sin(t*Math.PI)*.52;out.color=m.color;return true;
}
