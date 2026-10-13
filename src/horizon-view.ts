import type Phaser from 'phaser';
import type {Snapshot} from '../shared/protocol';
import {HORIZON_CORNERS,HORIZON_CONFIG} from '../shared/horizon';
export class GrowingHorizonView{
 readonly graphics:Phaser.GameObjects.Graphics;
 private timer=document.getElementById('horizon-timer')!;
 private warning=document.getElementById('horizon-warning')!;
 constructor(scene:Phaser.Scene){this.graphics=scene.add.graphics().setDepth(1).setName('growing-horizon');}
 render(snapshot:Snapshot|null,camera:Phaser.Cameras.Scene2D.Camera,selfId:string,low:boolean){
  const g=this.graphics.clear(),h=snapshot?.horizon,active=snapshot?.match.state==='active';this.timer.hidden=!active||!h;this.warning.hidden=true;document.body.classList.remove('horizon-band','horizon-inside');if(!h||(!active&&snapshot?.match.state!=='ended'))return;
  const seconds=Math.max(0,Math.floor(h.eventInMs/1000)),clock=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  this.timer.textContent=h.phase==='calm'?`HORIZON IN ${clock}`:h.phase==='hold'?`HORIZON EXPANDS IN ${clock}`:h.elapsedMs<HORIZON_CONFIG.calmMs+HORIZON_CONFIG.spawnNoticeMs?'THE HORIZON IS APPROACHING.':'THE HORIZON IS EXPANDING.';
  if(!h.radius)return;
  const corner=HORIZON_CORNERS[h.corner],r=h.radius;
  g.fillStyle(0x000001,1).fillCircle(corner.x,corner.y,r);
  for(let i=low?2:5;i>0;i--)g.lineStyle(i*8,0xde8743,.035).strokeCircle(corner.x,corner.y,r+i*5);
  g.lineStyle(3,0xffd2a0,.65).strokeCircle(corner.x,corner.y,r);
  // Fixed arcs hug the growing boundary. Low omits them; no giant shader target.
  if(!low)for(let i=0;i<12;i++){const angle=i*Math.PI/6+snapshot!.timeMs*.00006;g.lineStyle(2,0xb77548,.2).beginPath().arc(corner.x,corner.y,r+18,angle,angle+.12).strokePath();}
  const local=snapshot!.players.find(p=>p.id===selfId);if(!local)return;
  const distance=Math.hypot(local.x-corner.x,local.y-corner.y),inside=distance<=r,band=distance<=r+HORIZON_CONFIG.gravityBand;
  if(local.status==='ALIVE'){document.body.classList.toggle('horizon-band',band);document.body.classList.toggle('horizon-inside',inside);}
  const directions=['→','↘','↓','↙','←','↖','↑','↗'],away=Math.atan2(local.y-corner.y,local.x-corner.x),index=(Math.round(away/(Math.PI/4))+8)%8;
  const view=camera.worldView,min=Math.hypot(view.centerX-corner.x,view.centerY-corner.y)-Math.hypot(view.width,view.height)/2,max=min+Math.hypot(view.width,view.height);
  this.warning.hidden=false;this.warning.textContent=local.deathSource?.type==='ENVIRONMENT'&&local.deathSource.cause==='BLACK_HOLE'?'YOU HAVE BEEN CONSUMED.':`${r<min||r>max?`HORIZON ${directions[(index+4)%8]} · `:''}SAFE ${directions[index]}${local.status==='ALIVE'&&band?inside?' · HORIZON DAMAGE':' · GRAVITY PULL':''}`;
 }
 destroy(){this.graphics.destroy();this.timer.hidden=this.warning.hidden=true;document.body.classList.remove('horizon-band','horizon-inside');}
}
