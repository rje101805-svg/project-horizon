import {COSMIC_CLUSTERS} from './cosmos';
import {bakeRock} from './debris';
import {DISTANT_BODIES,bakeDistant} from './distant';
import Phaser from 'phaser';
import {PLANET_REGIONS,LANDMARKS} from './solar-layout';
import {seededRandom} from './config';
import { advancedEnabled } from './intensity';
import { horizonDirection,shadeNormal,visibleCircle, type Point } from './lighting';
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
 readonly cosmicClusters:Phaser.GameObjects.Container[]=[];
 private visualOrigin=performance.now();
 readonly decorations:Phaser.GameObjects.Container[]=[];study=false;
 enabled=true;quality:'standard'|'low'='standard';studyBiome:Biome='ice';
 private clouds:SurfaceMap;
 constructor(private scene:Phaser.Scene){
  const read=(key:string):SurfaceMap=>{const source=scene.textures.get(key).getSourceImage() as HTMLImageElement,c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d')!;ctx.drawImage(source,0,0);return {width:c.width,height:c.height,data:ctx.getImageData(0,0,c.width,c.height).data};};
  this.clouds=read('surface-clouds');
  for(const [i,biome]of BIOMES.entries()){
   const planet={...PLANET_REGIONS[i]},key=i===0?'ice-prototype':`planet-${biome}-bake`,map=read(`surface-${biome}`),detail=read(`surface-${biome}-detail`);
   const texture=scene.textures.createCanvas(key,768,768)!;bakeMaterial(texture.context,768,biome,map,this.clouds,[1,0,.48],0,detail);texture.refresh();
   const fallback=scene.add.image(planet.x,planet.y,key).setDisplaySize(planet.radius*2.15,planet.radius*2.15).setDepth(-12);
   const shader=optionalShader(scene,`sphere-${biome}`,MATERIAL_FRAGMENT,planet.x,planet.y,planet.radius*2.15,planet.radius*2.15,{atmospherePulse:{type:'1f',value:1},intensity:{type:'1f',value:0},warmDirection:{type:'3fv',value:[1,0,.48]},biome:{type:'1f',value:i}},[`surface-${biome}`,'surface-clouds',`surface-${biome}-detail`])?.setDepth(-12)??null;
   this.bodies.push({planet,biome,fallback,shader,key,map,detail,lightKey:'0',lastBake:-Infinity});
  }
  const rocks=scene.textures.createCanvas('debris-atlas',256,128)!;
  const rockCanvas=document.createElement('canvas');rockCanvas.width=rockCanvas.height=64;const rockContext=rockCanvas.getContext('2d')!;
  for(let i=0;i<8;i++){bakeRock(rockContext,64,32530+i);const x=(i%4)*64,y=Math.floor(i/4)*64;rocks.context.drawImage(rockCanvas,x,y);rocks.add(String(i),0,x,y,64,64);}rocks.refresh();
  const random=seededRandom(3203);
  for(const p of LANDMARKS){const group=scene.add.container(p.x,p.y).setDepth(-11);
   for(let i=0;i<p.count;i++){const x=(random()-.5)*280,y=(random()-.5)*180,r=12+random()*22;
    group.add(scene.add.image(x,y,'debris-atlas',String(Math.floor(random()*8))).setDisplaySize(r,r*(.65+random()*.4)).setRotation(random()*Math.PI*2).setAlpha(.72));
   }for(const child of group.list){const rock=child as Phaser.GameObjects.Image;rock.setData('baseRotation',rock.rotation);}this.decorations.push(group);
  }
  for(const cluster of COSMIC_CLUSTERS){const group=scene.add.container(0,0).setScrollFactor(0).setDepth(-19);
   for(let i=0;i<cluster.count;i++){const size=i>=8?4+random()*4:15+random()*27,angle=random()*Math.PI*2;
    const rock=scene.add.image((random()-.5)*280,(random()-.5)*150,'debris-atlas',String(Math.floor(random()*8))).setDisplaySize(size,size*(.6+random()*.4)).setRotation(angle).setScrollFactor(0).setAlpha(i>=8?.45:.85).setTint(cluster.tint);
    rock.setData('baseY',rock.y).setData('baseRotation',angle);group.add(rock);
   }this.cosmicClusters.push(group);
  }
  // Two shared atlases, eleven images; no per-frame sphere generation.
  const atlas=scene.textures.createCanvas('distant-body-0',1024,1024)!;
  const scratch=document.createElement('canvas');scratch.width=scratch.height=256;const ctx=scratch.getContext('2d')!;
  const ring=scene.textures.createCanvas('distant-body-1',512,512)!;let ringRow=0;
  for(const [i,p]of DISTANT_BODIES.entries()){
   if(p.kind.startsWith('ringed')){
    const rc=ring.context,y=ringRow*256;rc.save();rc.translate(256,y+128);rc.rotate(-.25);
    rc.strokeStyle=p.kind==='ringedblue'?'rgba(105,147,164,.5)':'rgba(151,133,154,.5)';rc.lineWidth=14;rc.beginPath();rc.ellipse(0,0,215,38,0,0,Math.PI*2);rc.stroke();rc.restore();
    bakeDistant(ctx,256,p.kind);rc.drawImage(scratch,176,y+48,160,160);ring.add(String(i),0,0,y,512,256);ringRow++;
   }else{bakeDistant(ctx,256,p.kind);const x=(i%4)*256,y=Math.floor(i/4)*256;atlas.context.drawImage(scratch,x,y);atlas.add(String(i),0,x,y,256,256);}
   this.distant.push(scene.add.image(0,0,p.kind.startsWith('ringed')?'distant-body-1':'distant-body-0',String(i)).setScrollFactor(0).setDepth(-25).setAlpha(p.alpha));
  }atlas.refresh();ring.refresh();


 }
 update(camera:Phaser.Cameras.Scene2D.Camera,now:number,horizon:Point,intensity=0){
  const pulse=.985+.015*Math.sin(now*.00012);
  for(const body of this.bodies){
   const p=body.planet,visible=this.enabled&&(!this.study||body.biome===this.studyBiome)&&visibleCircle(camera.worldView,p,p.radius*1.075),live=advancedEnabled(this.scene.game.renderer.type===Phaser.WEBGL,!!body.shader,this.quality);
   body.fallback.setVisible(visible&&!live).setPosition(p.x,p.y).setDisplaySize(p.radius*2.15,p.radius*2.15);
   const warm=horizonDirection(p,horizon);
   if(body.shader){const size=p.radius*2.15;if(body.shader.width!==size){body.shader.setSize(size,size);body.shader.updateDisplayOrigin();}body.shader.setVisible(visible&&live).setPosition(p.x,p.y);if(visible&&live){body.shader.setUniform('atmospherePulse.value',pulse);body.shader.setUniform('intensity.value',intensity);body.shader.setUniform('warmDirection.value',warm);}}
   const level=Math.round(intensity*10),key=level===0?'0':`${level}:${Math.round(warm[0]*8)}:${Math.round(warm[1]*8)}`;
   if(visible&&!live&&body.lightKey!==key&&now-body.lastBake>=250){body.lastBake=now;body.lightKey=key;const tex=this.scene.textures.get(body.key) as Phaser.Textures.CanvasTexture;bakeMaterial(tex.context,768,body.biome,body.map,this.clouds,warm,intensity,body.detail);tex.refresh();}
  }
  const elapsed=Math.max(0,now-this.visualOrigin),animated=this.quality==='standard';
  for(let i=0;i<this.decorations.length;i++){const group=this.decorations[i];group.setVisible(!this.study&&visibleCircle(camera.worldView,LANDMARKS[i],200));if(group.visible&&animated)for(let j=0;j<group.length;j++){const rock=group.list[j] as Phaser.GameObjects.Image;rock.rotation=Number(rock.getData('baseRotation'))+elapsed*.000012*(j%2?1:-1);}}

  const z=camera.zoom,w=this.scene.scale.width,h=this.scene.scale.height;
  for(const [i,d]of this.distant.entries()){
   const p=DISTANT_BODIES[i],x=p.x-camera.scrollX*p.parallax,y=p.y-camera.scrollY*p.parallax;
   const height=p.kind.startsWith('ringed')?p.size*.5:p.size;
   d.setDisplaySize(p.size/z,height/z).setPosition(w*.5+(x-w*.5)/z,h*.5+(y-h*.5)/z);
   if(p.kind.startsWith('ringed'))d.setRotation(animated?.018*Math.sin(elapsed*.000045+i):0);
   d.setVisible((animated||i<5)&&x+p.size/2>0&&x-p.size/2<w&&y+height/2>0&&y-height/2<h);
  }
  for(const [i,group]of this.cosmicClusters.entries()){
   const p=COSMIC_CLUSTERS[i],x=p.x-camera.scrollX*p.parallax,y=p.y-camera.scrollY*p.parallax;
   group.setScale(1/z).setPosition(w*.5+(x-w*.5)/z,h*.5+(y-h*.5)/z).setVisible((animated||i%2===0)&&x+180>0&&x-180<w&&y+110>0&&y-110<h);
   if(group.visible&&animated)for(let j=0;j<group.length;j++){const rock=group.list[j] as Phaser.GameObjects.Image;rock.rotation=Number(rock.getData('baseRotation'))+elapsed*.000012*(j%2?1:-1);if(j>=8)rock.y=Number(rock.getData('baseY'))+Math.sin(elapsed*.00016+j)*3;}

  }


 }
 destroy(){for(const g of this.cosmicClusters)g.destroy();this.scene.textures.remove('debris-atlas');for(const g of this.decorations)g.destroy();for(const b of this.bodies){b.shader?.destroy();b.fallback.destroy();this.scene.textures.remove(b.key);}for(const d of this.distant)d.destroy();for(const key of ['distant-body-0','distant-body-1'])this.scene.textures.remove(key);for(const b of [...BIOMES,'clouds',...BIOMES.map(b=>`${b}-detail`)])this.scene.textures.remove(`surface-${b}`);}
}
