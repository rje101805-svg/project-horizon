import Phaser from 'phaser';
import type {Snapshot} from '../shared/protocol';
import {LOBBY_HOLE,COLLAPSE_MS,LAUNCH_MS} from '../shared/match';
import {seededRandom,type VisualQuality} from './visual/config';
import {playCinematicCue} from './cinematic-audio';
// Two bounded Graphics objects, owned by the scene's existing update/clock.
// No emitters, extra loops, texture uploads or server/gameplay writes.
export class CinematicVisuals{
 readonly ambience:Phaser.GameObjects.Graphics;
 readonly trails:Phaser.GameObjects.Graphics;
 private lastCountdown=0;
 private lastPhase='';
 private debris:{angle:number;radius:number;size:number;speed:number}[]=[];
 constructor(scene:Phaser.Scene){
  this.ambience=scene.add.graphics().setDepth(-5).setName('cinematic-ambience');
  this.trails=scene.add.graphics().setDepth(3).setName('cinematic-trails');
  const rng=seededRandom(603);this.debris=Array.from({length:24},()=>({angle:rng()*Math.PI*2,radius:180+rng()*330,size:.6+rng()*1.4,speed:.00002+rng()*.000025}));
 }
 zoom(camera:Phaser.Cameras.Scene2D.Camera,base:number,snapshot:Snapshot|null,quality:VisualQuality,elapsed:number){
  const m=snapshot?.match;
  const target=quality==='standard'&&m?.state==='collapse'?1+.22*(1-m.phaseRemainingMs/COLLAPSE_MS):quality==='standard'&&m?.state==='launch'?1.16:base;
  // Zoom remains >=1, so the cinematic never grants additional map visibility.
  return Math.max(1,Math.min(1.25,camera.zoom+(target-camera.zoom)*(1-Math.exp(-5*Math.max(0,Math.min(100,elapsed))/1000))));
 }
 update(snapshot:Snapshot|null,quality:VisualQuality,camera:Phaser.Cameras.Scene2D.Camera,now:number){
  const g=this.ambience.clear(),trail=this.trails.clear(),m=snapshot?.match;
  if(!m||!snapshot){g.setVisible(false);trail.setVisible(false);return;}
  const number=m.state==='countdown'?Math.max(1,Math.ceil(m.phaseRemainingMs/1000)):0;
  if(number&&number!==this.lastCountdown){playCinematicCue('countdown');if(quality==='standard')camera.shake(80,.0007,true);}
  this.lastCountdown=number;
  if(quality==='standard'&&m.state==='collapse'&&this.lastPhase!=='collapse')camera.shake(240,.0013,true);
  this.lastPhase=m.state;
  const age=Math.max(0,snapshot.timeMs-m.phaseStartedAtMs);
  const lobby=m.state==='waiting'||m.state==='countdown'||m.state==='collapse';
  const ejection=m.state==='launch'&&age>=1400||m.state==='active'&&age<900;
  const enabled=quality==='standard'&&(lobby||m.state==='launch'||ejection);
  g.setVisible(enabled);trail.setVisible(enabled&&ejection);if(!enabled)return;
  const hole=lobby?LOBBY_HOLE:snapshot.blackHole;
  if(lobby){
   const pulse=.5+.5*Math.sin(now*.0015);
   g.lineStyle(1,0xb5a4bb,.08+.05*pulse).strokeCircle(hole.x,hole.y,hole.eventHorizonRadius*2.1);
   for(const p of this.debris){const a=p.angle+now*p.speed;g.fillStyle(0x91a5bd,.12).fillCircle(hole.x+Math.cos(a)*p.radius,hole.y+Math.sin(a)*p.radius,p.size);}
   if(m.state==='waiting')for(const p of snapshot.players)if(m.readyIds.includes(p.id))g.lineStyle(1,0x89d6c7,.12+.08*pulse).strokeCircle(p.x,p.y,36);
  }
  if(m.state==='collapse'){
   const t=1-m.phaseRemainingMs/COLLAPSE_MS;
   for(let i=0;i<24;i++){const a=i*Math.PI/12+now*.001,r=220+200*(1-t);g.lineStyle(1,0xf7a76b,.12+t*.3).lineBetween(hole.x+Math.cos(a)*r,hole.y+Math.sin(a)*r,hole.x+Math.cos(a+.16)*r*.35,hole.y+Math.sin(a+.16)*r*.35);}
  }
  if(m.state==='launch'||ejection){
   const fade=m.state==='active'?Math.max(0,1-age/900):1,t=m.state==='active'?age/900:1-m.phaseRemainingMs/LAUNCH_MS;
   g.lineStyle(2,0xffd7b0,.23*fade).strokeCircle(hole.x,hole.y,120+t*190);
   for(let i=0;i<12;i++){const a=i*Math.PI/6+now*.0005;g.fillStyle(0xffd6b0,.28*fade).fillCircle(hole.x+Math.cos(a)*(110+t*180),hole.y+Math.sin(a)*(110+t*180),1.5);}
   if(ejection)for(const p of snapshot.players){const a=m.launchAngles[p.id];if(a===undefined)continue;trail.lineStyle(2,0x94d8ec,.4*fade).lineBetween(p.x,p.y,p.x-Math.cos(a)*110*fade,p.y-Math.sin(a)*110*fade);}
  }
 }
 destroy(){this.ambience.destroy();this.trails.destroy();}
}
