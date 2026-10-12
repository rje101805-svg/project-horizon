import type Phaser from 'phaser';
import type {WeaponClass} from '../shared/weapons';
// Stable procedural asset IDs live in WEAPONS; replace glyphs with PNGs here later.
export function weaponGlyph(g:Phaser.GameObjects.Graphics,kind:WeaponClass|'gold',x:number,y:number,angle:number,color:number,scale=1){
 const c=Math.cos(angle)*scale,s=Math.sin(angle)*scale;
 const line=(ax:number,ay:number,bx:number,by:number,width=3)=>{g.lineStyle(width*scale,color,1).lineBetween(x+ax*c-ay*s,y+ax*s+ay*c,x+bx*c-by*s,y+bx*s+by*c);};
 if(kind==='missile'){line(-14,-6,16,-6,5);line(-14,6,16,6,5);line(-12,-6,-12,6);line(-5,6,-9,14);}
 else if(kind==='shotgun'){line(-13,-4,17,-4,5);line(-13,4,17,4,5);line(-3,4,-8,13);}
 else if(kind==='smg'){line(-8,0,9,0,6);line(1,1,1,11,4);line(-7,0,-11,7);}
 else if(kind==='zapper'){line(-15,0,15,0);for(let i=-6;i<=6;i+=6)line(i,-7,i,7,2);line(-8,1,-12,12);}
 else{line(-14,0,16,0,4);line(-7,0,-11,12,4);line(1,0,5,5,3);}
}
export function drawWeaponProjectile(g:Phaser.GameObjects.Graphics,p:{x:number;y:number;weapon?:WeaponClass|'gold'}){
 const kind=p.weapon??'blaster',color=kind==='gold'?0xffc644:kind==='shotgun'?0xfc79ed:kind==='smg'?0x79e4ff:kind==='zapper'?0x8da0ff:kind==='missile'?0xff9867:0xffe08a;
 if(kind==='missile'){g.fillStyle(0xffbb65,.6).fillTriangle(p.x-9,p.y-3,p.x-17,p.y,p.x-9,p.y+3);g.fillStyle(0x030912).fillCircle(p.x,p.y,7);g.fillStyle(color).fillEllipse(p.x,p.y,13,7);}
 else if(kind==='zapper'){g.lineStyle(2,0x030912).lineBetween(p.x-9,p.y,p.x+8,p.y);g.lineStyle(2,color).beginPath().moveTo(p.x-7,p.y).lineTo(p.x-2,p.y-4).lineTo(p.x+2,p.y+3).lineTo(p.x+7,p.y).strokePath();}
 else{const radius=kind==='smg'?2:3;g.fillStyle(0x030912).fillCircle(p.x,p.y,radius+1);g.fillStyle(color).fillCircle(p.x,p.y,radius);}
}
