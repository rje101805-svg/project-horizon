import {GUARDIAN_PROFILES} from '../shared/guardians';
import type Phaser from 'phaser';
import {GALAXY_WEAPONS,type GalaxyType,type WeaponClass} from '../shared/weapons';
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
export function drawWeaponProjectile(g:Phaser.GameObjects.Graphics,p:{x:number;y:number;guardianPlanetId?:string;weapon?:WeaponClass|'gold';galaxyType?:GalaxyType;heading?:number}){
 if(p.guardianPlanetId){const profile=GUARDIAN_PROFILES[p.guardianPlanetId],color=profile?.color??0xff7777,ux=Math.cos(p.heading??0),uy=Math.sin(p.heading??0);g.fillStyle(0x030912).fillCircle(p.x,p.y,6).lineStyle(1,0xff665f,.8).strokeCircle(p.x,p.y,6);g.lineStyle(2,color,.9).lineBetween(p.x-ux*12,p.y-uy*12,p.x,p.y);if(profile?.style==='ice')g.fillStyle(color).fillTriangle(p.x+ux*5,p.y+uy*5,p.x-uy*4,p.y+ux*4,p.x+uy*4,p.y-ux*4);else if(profile?.style==='terrestrial'){g.fillStyle(color).fillCircle(p.x-uy*3,p.y+ux*3,2).fillCircle(p.x+uy*3,p.y-ux*3,2);}else g.fillStyle(color).fillCircle(p.x,p.y,profile?.style==='volcanic'?4:2.5);return;}
 const kind=p.weapon??'blaster',color=kind==='gold'?GALAXY_WEAPONS[p.galaxyType??'cryo'].color:kind==='shotgun'?0xfc79ed:kind==='smg'?0x79e4ff:kind==='zapper'?0x8da0ff:kind==='missile'?0xff9867:0xffe08a;
 const ux=Math.cos(p.heading??0),uy=Math.sin(p.heading??0);
 if(p.galaxyType==='cryo'){g.lineStyle(4,0x030912).lineBetween(p.x-ux*13,p.y-uy*13,p.x+ux*4,p.y+uy*4);g.lineStyle(2,color).lineBetween(p.x-ux*13,p.y-uy*13,p.x+ux*4,p.y+uy*4);}
 else if(p.galaxyType==='inferno'){g.lineStyle(6,0xff472a,.4).lineBetween(p.x-ux*17,p.y-uy*17,p.x,p.y);g.fillStyle(color).fillCircle(p.x,p.y,5);}
 else if(p.galaxyType==='lunar'){g.lineStyle(2,color,.6).lineBetween(p.x-ux*12,p.y-uy*12,p.x-ux*25,p.y-uy*25);g.fillStyle(0x030912).fillCircle(p.x,p.y,8);g.fillStyle(color).fillTriangle(p.x+ux*8,p.y+uy*8,p.x-ux*7-uy*4,p.y-uy*7+ux*4,p.x-ux*7+uy*4,p.y-uy*7-ux*4);}
 else if(kind==='missile'){g.fillStyle(0xffbb65,.6).fillTriangle(p.x-9,p.y-3,p.x-17,p.y,p.x-9,p.y+3);g.fillStyle(0x030912).fillCircle(p.x,p.y,7);g.fillStyle(color).fillEllipse(p.x,p.y,13,7);}
 else if(kind==='zapper'){g.lineStyle(2,0x030912).lineBetween(p.x-9,p.y,p.x+8,p.y);g.lineStyle(2,color).beginPath().moveTo(p.x-7,p.y).lineTo(p.x-2,p.y-4).lineTo(p.x+2,p.y+3).lineTo(p.x+7,p.y).strokePath();}
 else{const radius=kind==='smg'?2:3;g.fillStyle(0x030912).fillCircle(p.x,p.y,radius+1);g.fillStyle(color).fillCircle(p.x,p.y,radius);}
}
