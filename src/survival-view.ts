import {fighterStats} from '../shared/fighters';
import Phaser from 'phaser';
import type {Snapshot} from '../shared/protocol';
import {SURVIVAL,type ShieldWall} from '../shared/survival';
// One bounded graphics object, sampled by the existing scene update only.
export class SurvivalView {
 readonly graphics:Phaser.GameObjects.Graphics;
 private snapshot?:Snapshot;private previous=new Map<string,ShieldWall>();private fading:{wall:ShieldWall;at:number}[]=[];
 private root=document.createElement('section');private counts=document.createElement('div');private ring=document.createElement('div');private message=document.createElement('div');
 constructor(scene:Phaser.Scene){this.graphics=scene.add.graphics().setDepth(4.2).setName('shield-walls');this.root.id='survival-hud';this.root.hidden=true;this.ring.hidden=true;this.root.setAttribute('aria-label','Survival utilities');this.counts.id='survival-counts';this.ring.id='healing-progress';this.ring.setAttribute('role','progressbar');this.ring.setAttribute('aria-valuemin','0');this.ring.setAttribute('aria-valuemax','100');this.message.id='survival-feedback';this.message.setAttribute('role','status');this.root.append(this.counts,this.ring,this.message);document.getElementById('mission')!.append(this.root);}
 accept(snapshot:Snapshot,selfId:string){const same=this.snapshot?.roomCode===snapshot.roomCode&&this.snapshot.match.round===snapshot.match.round;if(!same){this.previous.clear();this.fading=[];}const current=new Map((snapshot.walls??[]).map(w=>[w.id,w]));if(same)for(const [id,wall]of this.previous)if(!current.has(id))this.fading.push({wall,at:snapshot.timeMs});this.previous=current;this.fading=this.fading.slice(-24);this.snapshot=snapshot;
 const p=snapshot.players.find(p=>p.id===selfId),u=p?.inventory?.survival;this.root.hidden=snapshot.match.state!=='active'||p?.status!=='ALIVE'||p.lifeState!=='active';
 this.counts.textContent=`MATERIALS ${u?.materials??0} / 300  ·  [Q] WALL −${fighterStats(p).wallCost}\n[4] SHIELD CELL ×${u?.cells??0}  ·  [5] REPAIR KIT ×${u?.kits??0}`;
 const use=u?.use;this.ring.hidden=!use;if(use){const t=Math.max(0,Math.min(1,(snapshot.timeMs-use.startedAtMs)/(use.endsAtMs-use.startedAtMs)));this.ring.style.setProperty('--progress',`${t*360}deg`);this.ring.setAttribute('aria-valuenow',String(Math.round(t*100)));this.ring.textContent=`${use.kind==='cell'?'SHIELD':'REPAIR'} ${Math.max(0,(use.endsAtMs-snapshot.timeMs)/1000).toFixed(1)}s`;}
 this.message.textContent=u&&snapshot.timeMs<=u.noticeUntilMs?u.notice:'';
 }
 render(camera:Phaser.Cameras.Scene2D.Camera){const g=this.graphics.clear(),snapshot=this.snapshot;if(!snapshot)return;const time=snapshot.timeMs,view=camera.worldView;
 const draw=(w:ShieldWall,alpha:number)=>{if(w.x<view.x-50||w.y<view.y-50||w.x>view.right+50||w.y>view.bottom+50)return;const c=Math.cos(w.angle),s=Math.sin(w.angle),half=SURVIVAL.wallWidth/2,age=time-w.createdAtMs,scale=Math.min(1,.3+age/160),color=w.hp>35?0xe5c68b:0xe59369,hit=time-w.hitAtMs<120;g.save().translateCanvas(w.x,w.y).rotateCanvas(w.angle);g.fillStyle(color,(hit?.45:.13)*alpha).fillRect(-4,-half*scale,8,half*2*scale);g.lineStyle(hit?3:1.8,color,alpha).strokeRect(-4,-half*scale,8,half*2*scale);g.lineStyle(1,0xffe8bb,.5*alpha).lineBetween(0,-half*scale,0,half*scale);if(w.hp<75)for(let i=0;i<Math.ceil((75-w.hp)/20);i++)g.lineBetween(-4,-half+15+i*18,4,-half+22+i*18);g.restore();};
 for(const wall of snapshot.walls??[])draw(wall,1);this.fading=this.fading.filter(f=>time-f.at<250);for(const f of this.fading)draw(f.wall,Math.max(0,1-(time-f.at)/250));
 }
 destroy(){this.graphics.destroy();this.root.remove();this.previous.clear();this.fading=[];}
}
