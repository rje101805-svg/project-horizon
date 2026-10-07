import Phaser from 'phaser';
import { horizonDirection,shadeNormal,visibleCircle, type Point } from './lighting';
import { PARALLAX } from './config';
import { PLANET_FRAGMENT } from './shaders';
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
export class CelestialWorld {
  readonly planet={x:650,y:1500,radius:380};
  readonly fallback:Phaser.GameObjects.Image;
  readonly shader:Phaser.GameObjects.Shader|null;
  readonly distant:Phaser.GameObjects.Image[]=[];
  enabled=true;
  quality:'standard'|'low'='standard';
  private intensityKey='';private lastBake=-Infinity;
  constructor(private scene:Phaser.Scene){
   const texture=scene.textures.createCanvas('ice-prototype',384,384)!;bakeSphere(texture.context,384);texture.refresh();
   this.fallback=scene.add.image(this.planet.x,this.planet.y,'ice-prototype').setDisplaySize(817,817).setDepth(-12);
   this.shader=optionalShader(scene,'ice-sphere',PLANET_FRAGMENT,this.planet.x,this.planet.y,817,817,{intensity:{type:'1f',value:0},warmDirection:{type:'3fv',value:[1,0,.48]}})?.setDepth(-12)??null;
   for(const [i,size] of [512,128].entries()){
     const key=`distant-body-${i}`,tex=scene.textures.createCanvas(key,size,size)!;bakeSphere(tex.context,size,[1,0,.48],0,true);tex.refresh();
     this.distant.push(scene.add.image(0,0,key).setScrollFactor(0).setDepth(-25).setAlpha(i?.36:.45));
   }
  }
  update(camera:Phaser.Cameras.Scene2D.Camera,now:number,horizon:Point,intensity=0){
    const visible=this.enabled&&visibleCircle(camera.worldView,this.planet,this.planet.radius*1.08),live=!!this.shader&&this.quality==='standard';
    this.fallback.setVisible(visible&&!live).setPosition(this.planet.x,this.planet.y);
    const warm=horizonDirection(this.planet,horizon);
    if(this.shader){this.shader.setVisible(visible&&live).setPosition(this.planet.x,this.planet.y);if(visible&&live){this.shader.setUniform('intensity.value',intensity);this.shader.setUniform('warmDirection.value',warm);}}
    // Only rebake on a visible, changed light direction/intensity, at most 4Hz.
    const key=`${Math.round(intensity*10)}:${Math.round(warm[0]*8)}:${Math.round(warm[1]*8)}`;
    if(visible&&!live&&key!==this.intensityKey&&now-this.lastBake>=250){this.lastBake=now;this.intensityKey=key;const tex=this.scene.textures.get('ice-prototype') as Phaser.Textures.CanvasTexture;bakeSphere(tex.context,384,warm,intensity);tex.refresh();}
    const z=camera.zoom,w=this.scene.scale.width,h=this.scene.scale.height,px=camera.scrollX*PARALLAX.bodies,py=camera.scrollY*PARALLAX.bodies;
    this.distant[0].setDisplaySize(1320/z,1320/z).setPosition(w*.5+(w*.9-px-w*.5)/z,h*.5+(160-py*.4-h*.5)/z);
    this.distant[1].setDisplaySize(150/z,150/z).setPosition(w*.5+(260-px*.6-w*.5)/z,h*.5+(90-py*.5-h*.5)/z);
  }
  destroy(){this.shader?.destroy();this.fallback.destroy();for(const d of this.distant)d.destroy();for(const key of ['ice-prototype','distant-body-0','distant-body-1'])this.scene.textures.remove(key);}
}
