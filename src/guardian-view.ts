import type Phaser from 'phaser';
import type {Snapshot} from '../shared/protocol';
import {GUARDIAN_PROFILES} from '../shared/guardians';
export class GuardianView {
 private graphics:Phaser.GameObjects.Graphics;private warning=document.createElement('aside');visibleCount=0;
 constructor(scene:Phaser.Scene){this.graphics=scene.add.graphics().setDepth(1);this.warning.id='guardian-warning';this.warning.hidden=true;this.warning.setAttribute('role','status');document.querySelector('.game-viewport')!.append(this.warning);}
 render(snapshot:Snapshot|null,camera:Phaser.Cameras.Scene2D.Camera,selfId:string){const g=this.graphics;g.clear();this.visibleCount=0;this.warning.hidden=true;if(!snapshot?.guardians)return;const view=camera.worldView;
  for(const u of snapshot.guardians.units){if(u.x<view.left-35||u.x>view.right+35||u.y<view.top-35||u.y>view.bottom+35)continue;this.visibleCount++;const p=GUARDIAN_PROFILES[u.planetId],c=Math.cos(u.rotation),s=Math.sin(u.rotation),point=(x:number,y:number)=>({x:u.x+x*c-y*s,y:u.y+x*s+y*c});g.fillStyle(0x050c17,.95).lineStyle(1.6,p.color,.95);
   if(p.style==='ice'){const points=Array.from({length:6},(_,i)=>point(Math.cos(i*Math.PI/3)*12,Math.sin(i*Math.PI/3)*12));g.fillPoints(points,true).strokePoints(points,true);g.lineStyle(1,0xffffff,.8).lineBetween(u.x-5,u.y,u.x+5,u.y).lineBetween(u.x,u.y-5,u.x,u.y+5);}
   else if(p.style==='volcanic'){const points=[point(17,0),point(-11,-10),point(-5,0),point(-11,10)];g.fillPoints(points,true).strokePoints(points,true);const nose=point(6,0);g.fillStyle(p.color).fillCircle(nose.x,nose.y,3);}
   else if(p.style==='terrestrial'){for(const side of [-1,1]){const points=[point(12,side*7),point(0,side*7-5),point(-11,side*7),point(0,side*7+5)];g.fillPoints(points,true).strokePoints(points,true);}}
   else{const points=[point(12,0),point(-9,-13),point(-3,0),point(-9,13)];g.fillPoints(points,true).strokePoints(points,true);const middle=point(4,0);g.fillStyle(0xffffff,.8).fillCircle(middle.x,middle.y,2);}
   g.fillStyle(0x03060b,.9).fillRect(u.x-16,u.y-23,32,5).fillStyle(p.color).fillRect(u.x-15,u.y-22,30*Math.max(0,u.health/u.maxHealth),3);
   if(u.telegraph){const nose=point(45,0);g.lineStyle(1.5,p.color,.9).strokeCircle(u.x,u.y,19).lineBetween(u.x,u.y,nose.x,nose.y);}
  }
  const self=snapshot.players.find(p=>p.id===selfId);if(!self||self.status!=='ALIVE'||snapshot.match.state!=='active')return;const defended=(snapshot.objectives?.planets??[]).find(p=>p.status!=='CONSUMED'&&Math.hypot(self.x-p.x,self.y-p.y)<=p.captureRadius*GUARDIAN_PROFILES[p.id].engageFactor&&(snapshot.guardians!.gangs.find(g=>g.planetId===p.id)?.remaining??0)>0);
  if(defended){const count=snapshot.guardians.gangs.find(g=>g.planetId===defended.id)!.remaining;this.warning.textContent=`${GUARDIAN_PROFILES[defended.id].name.toUpperCase()} · ${count} DEFENDERS`;this.warning.hidden=false;}
 }
 destroy(){this.graphics.destroy();this.warning.remove();}
}
