import Phaser from 'phaser';
import type { BlackHoleState } from '../../shared/black-hole';
import { seededRandom, type VisualQuality } from './config';
import { lensRegion,advancedEnabled } from './intensity';
import { optionalShader } from './shader-support';
import { LENS_FRAGMENT, DISK_FRAGMENT } from './shaders';
import { visibleCircle } from './lighting';
// Baked rotating filaments, not an emitter or a fresh Canvas upload each frame.
function bakeDisk(ctx:CanvasRenderingContext2D){
 const rng=seededRandom(311),c=256;
 for(let j=0;j<1300;j++){
  const r=105+rng()*133,a=rng()*Math.PI*2,length=.015+rng()*.17;
  const heat=(1-(r-105)/133)*(.45+.55*Math.max(0,Math.cos(a-.5)));
  ctx.strokeStyle=heat>.55?'rgba(255,240,199,.9)':heat>.25?'rgba(247,185,90,.65)':'rgba(161,75,26,.24)';ctx.lineWidth=.5+rng()*1.5;
  ctx.beginPath();ctx.arc(c,c,r,a,a+length);ctx.stroke();
 }
}
export class HorizonVisual {
 readonly lens:Phaser.GameObjects.Shader|null;
 readonly animatedDisk:Phaser.GameObjects.Shader|null;
 readonly disk:Phaser.GameObjects.Image;
 readonly core:Phaser.GameObjects.Graphics;
 readonly infall:Phaser.GameObjects.Graphics;
 private lastCore='';
 constructor(private scene:Phaser.Scene,private suffix='actual'){
  const key=`horizon-disk-${suffix}`,t=scene.textures.createCanvas(key,512,512)!;bakeDisk(t.context);t.refresh();
  this.disk=scene.add.image(0,0,key).setDepth(-7);
  this.animatedDisk=optionalShader(scene,`horizon-accretion-${suffix}`,DISK_FRAGMENT,0,0,512,512,{intensity:{type:'1f',value:0}},[key])?.setDepth(-7)??null;
  this.core=scene.add.graphics().setDepth(-8);this.infall=scene.add.graphics().setDepth(-6);
  this.lens=optionalShader(scene,`horizon-lens-${suffix}`,LENS_FRAGMENT,0,0,512,512,{
   regionOrigin:{type:'2fv',value:[0,0]},hole:{type:'2fv',value:[0,0]},scroll:{type:'2fv',value:[0,0]},viewport:{type:'2fv',value:[1100,600]},zoom:{type:'1f',value:1},radius:{type:'1f',value:90},intensity:{type:'1f',value:0},parallax:{type:'1f',value:1}
  },['space-void','space-stars','space-haze'])?.setDepth(-27)??null;
 }
 update(camera:Phaser.Cameras.Scene2D.Camera,now:number,hole:BlackHoleState|null,intensity:number,quality:VisualQuality,parallax=true){
  const visible=!!hole&&visibleCircle(camera.worldView,hole,hole.eventHorizonRadius*3.6);
  this.disk.setVisible(visible);this.core.setVisible(visible);this.infall.setVisible(visible);this.lens?.setVisible(false);this.animatedDisk?.setVisible(false);
  if(!visible||!hole)return;
  const r=hole.eventHorizonRadius,region=lensRegion(camera.worldView,hole,r);
  if(this.lens&&advancedEnabled(true,true,quality)&&region){
   this.lens.setVisible(true).setPosition(region.x,region.y).setSize(region.width,region.height).updateDisplayOrigin();
   for(const [name,value] of Object.entries({regionOrigin:[region.x-region.width/2,region.y-region.height/2],hole:[hole.x,hole.y],scroll:[camera.scrollX,camera.scrollY],viewport:[this.scene.scale.width,this.scene.scale.height],zoom:camera.zoom,radius:r,intensity,parallax:parallax?1:0}))this.lens.setUniform(`${name}.value`,value);
  }
  const key=`${hole.x}:${hole.y}:${r}:${Math.round(intensity*12)}`;
  if(key!==this.lastCore){this.lastCore=key;const g=this.core;g.clear();
   // Lensed far-side arc frames the darkest center; near-side disk crosses it.
   for(let i=5;i>0;i--)g.lineStyle(i*5,0xc8873e,.025+intensity*.012).strokeCircle(hole.x,hole.y,r*1.1);
   g.fillStyle(0x000001).fillCircle(hole.x,hole.y,r);
   g.lineStyle(2,0xffe3a2,.23).beginPath().arc(hole.x,hole.y,r*1.13,Math.PI,Math.PI*2).strokePath();
   g.lineStyle(4,0xb56b2c,.2).beginPath().arc(hole.x,hole.y,r*1.17,Math.PI,Math.PI*2).strokePath();
  }
  this.disk.setPosition(hole.x,hole.y).setDisplaySize(r*5,r*1.38).setRotation(-.17).setAlpha(.74+intensity*.20);
  if(this.animatedDisk&&advancedEnabled(true,true,quality)){
   this.disk.setVisible(false);this.animatedDisk.setVisible(true).setPosition(hole.x,hole.y).setSize(r*5,r*5).updateDisplayOrigin().setRotation(-.17).setUniform('intensity.value',intensity);
  }
  // A fixed bounded set of matter paths, no particle emitter or timer.
  const g=this.infall;g.clear();const count=quality==='low'?5:14;
  for(let i=0;i<count;i++){
   const t=((now*.000035*(1+intensity)+i/count)%1),a=i*2.399+now*.00010*(1+intensity)+t*4;
   const distance=r*(1.2+(1-t)*1.65),x=hole.x+Math.cos(a)*distance,y=hole.y+Math.sin(a)*distance*.53;
   g.fillStyle(i%3?0xc28b50:0xffd898,.15+(1-t)*.25).fillCircle(x,y,quality==='low'?1:1.3);
  }
 }
 destroy(){this.animatedDisk?.destroy();this.lens?.destroy();this.disk.destroy();this.core.destroy();this.infall.destroy();this.scene.textures.remove(`horizon-disk-${this.suffix}`);}
}
