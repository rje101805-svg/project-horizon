import Phaser from 'phaser';
import {PLANET_REGIONS,LANDMARKS} from './solar-layout';
import {seededRandom} from './config';
import { advancedEnabled } from './intensity';
import { horizonDirection,shadeNormal,visibleCircle, type Point } from './lighting';
import { PARALLAX } from './config';
import { BIOMES, bakeMaterial, MATERIAL_FRAGMENT, type Biome, type SurfaceMap } from './planet-material';
import { optionalShader } from './shader-support';
// CPU bake is deliberately shared by distant decoration and the Canvas fallback.
export function bakeSphere(ctx:CanvasRenderingContext2D,size:number,warm:readonly number[]=[1,0,.48],intensity=0,distant=false){
 const image=ctx.createImageData(size,size),data=image.data;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const nx=(x/size*2-1)*1.075,ny=(y/size*2-1)*1.075,r=Math.hypot(nx,ny);if(r>1.075)continue;
  const z=Math.sqrt(Math.max(0,1-r*r)),u=Math.atan2(nx,Math.max(.001,z)),v=Math.asin(Math.max(-1,Math.min(1,ny)));
  const texture=.85+.16*Math.sin(u*23+Math.sin(v*13)*2)+.10*Math.sin(u*49-v*35)+.06*Math.sin(v*95+u*70);
  const crack=Math.abs(Math.sin(u*31+v*21+Math.sin(v*17)*2));
  const rgb=shadeNormal([nx,ny,z],warm,intensity,texture*(crack<.04?.65:1));const rim=(1-z)**3*.06;
  const o=(y*size+x)*4;
  if(r>1){data[o]=50;data[o+1]=86;data[o+2]=110;data[o+3]=Math.max(0,1-(r-1)/.075)**2*32;}
  else{const fade=distant?.56:1;data[o]=(rgb[0]+rim*.15)*255*fade;data[o+1]=(rgb[1]+rim*.45)*255*fade;data[o+2]=(rgb[2]+rim*.7)*255*fade;data[o+3]=255;}
 }
 ctx.putImageData(image,0,0);
}
interface Body {
 planet:{x:number;y:number;radius:number};biome:Biome;fallback:Phaser.GameObjects.Image;shader:Phaser.GameObjects.Shader|null;key:string;lightKey:string;lastBake:number;map:SurfaceMap;detail:SurfaceMap;
}
export class CelestialWorld {
 readonly bodies:Body[]=[];
 get planet(){return this.bodies[0].planet;}get fallback(){return this.bodies[0].fallback;}get shader(){return this.bodies[0].shader;}
 readonly distant:Phaser.GameObjects.Image[]=[];
 readonly decorations:Phaser.GameObjects.Graphics[]=[];study=false;
 enabled=true;quality:'standard'|'low'='standard';studyBiome:Biome='ice';
 private clouds:SurfaceMap;
 constructor(private scene:Phaser.Scene){
  const read=(key:string):SurfaceMap=>{const source=scene.textures.get(key).getSourceImage() as HTMLImageElement,c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d')!;ctx.drawImage(source,0,0);return {width:c.width,height:c.height,data:ctx.getImageData(0,0,c.width,c.height).data};};
  this.clouds=read('surface-clouds');
  for(const [i,biome]of BIOMES.entries()){
   const planet={...PLANET_REGIONS[i]},key=i===0?'ice-prototype':`planet-${biome}-bake`,map=read(`surface-${biome}`),detail=read(`surface-${biome}-detail`);
   const texture=scene.textures.createCanvas(key,384,384)!;bakeMaterial(texture.context,384,biome,map,this.clouds,[1,0,.48],0,detail);texture.refresh();
   const fallback=scene.add.image(planet.x,planet.y,key).setDisplaySize(planet.radius*2.15,planet.radius*2.15).setDepth(-12);
   const shader=optionalShader(scene,`sphere-${biome}`,MATERIAL_FRAGMENT,planet.x,planet.y,planet.radius*2.15,planet.radius*2.15,{intensity:{type:'1f',value:0},warmDirection:{type:'3fv',value:[1,0,.48]},biome:{type:'1f',value:i}},[`surface-${biome}`,'surface-clouds',`surface-${biome}-detail`])?.setDepth(-12)??null;
   this.bodies.push({planet,biome,fallback,shader,key,map,detail,lightKey:'0',lastBake:-Infinity});
  }
  const random=seededRandom(3203);for(const p of LANDMARKS){const g=scene.add.graphics().setPosition(p.x,p.y).setDepth(-11);for(let i=0;i<p.count;i++){const x=(random()-.5)*280,y=(random()-.5)*180,r=6+random()*12;g.fillStyle(0x48505c,.6).fillEllipse(x,y,r*2,r*1.4);g.lineStyle(1,0x87929d,.5).strokeEllipse(x,y,r*2,r*1.4);}this.decorations.push(g);}
  for(const [i,size]of [512,128].entries()){const key=`distant-body-${i}`,tex=scene.textures.createCanvas(key,size,size)!;bakeSphere(tex.context,size,[1,0,.48],0,true);tex.refresh();this.distant.push(scene.add.image(0,0,key).setScrollFactor(0).setDepth(-25).setAlpha(i?.28:.30));}
 }
 update(camera:Phaser.Cameras.Scene2D.Camera,now:number,horizon:Point,intensity=0){
  for(const body of this.bodies){
   const p=body.planet,visible=this.enabled&&(!this.study||body.biome===this.studyBiome)&&visibleCircle(camera.worldView,p,p.radius*1.075),live=advancedEnabled(this.scene.game.renderer.type===Phaser.WEBGL,!!body.shader,this.quality);
   body.fallback.setVisible(visible&&!live).setPosition(p.x,p.y).setDisplaySize(p.radius*2.15,p.radius*2.15);
   const warm=horizonDirection(p,horizon);
   if(body.shader){const size=p.radius*2.15;if(body.shader.width!==size){body.shader.setSize(size,size);body.shader.updateDisplayOrigin();}body.shader.setVisible(visible&&live).setPosition(p.x,p.y);if(visible&&live){body.shader.setUniform('intensity.value',intensity);body.shader.setUniform('warmDirection.value',warm);}}
   const level=Math.round(intensity*10),key=level===0?'0':`${level}:${Math.round(warm[0]*8)}:${Math.round(warm[1]*8)}`;
   if(visible&&!live&&body.lightKey!==key&&now-body.lastBake>=250){body.lastBake=now;body.lightKey=key;const tex=this.scene.textures.get(body.key) as Phaser.Textures.CanvasTexture;bakeMaterial(tex.context,384,body.biome,body.map,this.clouds,warm,intensity,body.detail);tex.refresh();}
  }
  for(let i=0;i<this.decorations.length;i++)this.decorations[i].setVisible(!this.study&&visibleCircle(camera.worldView,LANDMARKS[i],200));
  const z=camera.zoom,w=this.scene.scale.width,h=this.scene.scale.height,px=camera.scrollX*PARALLAX.bodies,py=camera.scrollY*PARALLAX.bodies;
  this.distant[0].setDisplaySize(1320/z,1320/z).setPosition(w*.5+(w*.9-px-w*.5)/z,h*.5+(160-py*.4-h*.5)/z);
  this.distant[1].setDisplaySize(150/z,150/z).setPosition(w*.5+(260-px*.6-w*.5)/z,h*.5+(90-py*.5-h*.5)/z);
 }
 destroy(){for(const g of this.decorations)g.destroy();for(const b of this.bodies){b.shader?.destroy();b.fallback.destroy();this.scene.textures.remove(b.key);}for(const d of this.distant)d.destroy();for(const key of ['distant-body-0','distant-body-1'])this.scene.textures.remove(key);for(const b of [...BIOMES,'clouds',...BIOMES.map(b=>`${b}-detail`)])this.scene.textures.remove(`surface-${b}`);}
}
