import {sampleMeteor,type MeteorFrame} from './stellar-motion';
import {paintGalaxies,GALAXY_SPAN} from './cosmos';
import {generateStars,STAR_COLORS,SKY_SPAN,nebulaColor,parallaxOffset} from './environment';
import Phaser from 'phaser';
import { PARALLAX, seededRandom } from './config';
// Five cached tile layers. No per-star objects, randomization, or particle emitters at runtime.
export class DeepSpace {
  readonly layers:Phaser.GameObjects.TileSprite[]=[];
  private keys:string[]=[];
  private canvasGeometry:Phaser.GameObjects.Graphics[]=[];
  private starPoints:{x:number;y:number;size:number;alpha:number;color?:number}[]=[];
  private dustPoints:{x:number;y:number;size:number;alpha:number;color?:number}[]=[];
  private ambient!:Phaser.GameObjects.Graphics;
  private animationOrigin=performance.now();
  private twinkles:{x:number;y:number}[]=[];
  private meteor:MeteorFrame={x:0,y:0,tailX:0,tailY:0,alpha:0,color:0};
  get starCount(){return this.starPoints.length;}
  constructor(private scene:Phaser.Scene) {
    const rng=seededRandom();
    this.make('void',1024,0,ctx=>{ctx.fillStyle='#040810';ctx.fillRect(0,0,1024,1024);},-30);
    this.make('stars',SKY_SPAN,PARALLAX.stars,ctx=>{
      this.starPoints=generateStars();
      for(const p of this.starPoints){ctx.globalAlpha=p.alpha;ctx.fillStyle=`#${STAR_COLORS[p.color??0].toString(16)}`;ctx.fillRect(Math.round(p.x),Math.round(p.y),p.size,p.size);}ctx.globalAlpha=1;
    },-29);
    this.make('stars-low',SKY_SPAN,PARALLAX.stars,ctx=>{
      for(let i=0;i<this.starPoints.length;i+=4){const p=this.starPoints[i];ctx.globalAlpha=p.alpha;ctx.fillStyle=`#${STAR_COLORS[p.color??0].toString(16)}`;ctx.fillRect(Math.round(p.x),Math.round(p.y),p.size,p.size);}ctx.globalAlpha=1;
    },-29);
    // A small opaque bake replaces both navy uniformity and expensive transparent
    // fog copies. Low hides it; the logical period matches the stars for lens sampling.
    this.make('haze',1024,PARALLAX.haze,ctx=>{
      const image=ctx.createImageData(1024,1024);
      for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){const rgb=nebulaColor(x/1024,y/1024+.3),o=(y*1024+x)*4;for(let c=0;c<3;c++)image.data[o+c]=rgb[c];image.data[o+3]=255;}ctx.putImageData(image,0,0);
          const dustRandom=seededRandom(32611);
      for(let i=0;i<7500;i++){const x=dustRandom()*1024,y=dustRandom()*1024,rgb=nebulaColor(x/1024,y/1024+.3);if(Math.max(...rgb)<65)continue;ctx.globalAlpha=.12+dustRandom()*.35;ctx.fillStyle=i%3?'#ec86ee':'#53dce9';ctx.fillRect(x,y,.35+dustRandom()*.55,.35+dustRandom()*.55);}ctx.globalAlpha=1;
    },-29.5,2);
    this.make('galaxies',1024,.012,ctx=>paintGalaxies(ctx,1024),-29.25,GALAXY_SPAN/1024);
    this.twinkles=this.starPoints.slice(-6);
    this.ambient=scene.add.graphics().setScrollFactor(0).setDepth(-26);
    this.make('dust',1024,PARALLAX.dust,ctx=>{for(let i=0;i<34;i++){const alpha=.035+rng()*.055,x=rng()*1024,y=rng()*1024;this.dustPoints.push({x,y,size:1.3,alpha});ctx.fillStyle=`rgba(160,185,191,${alpha})`;ctx.fillRect(x,y,1.3,.6);}},8);
    // Phaser Canvas copies transparent TileSprite canvases into the main canvas.
    // Profiling showed these sparse star/dust copies dominate draw time. Cache
    // equivalent point data once instead; no per-frame generation or full-screen sparse copies.
    if(scene.game.renderer.type===Phaser.CANVAS){
      for(const [points,depth,factor,color]of [[this.starPoints,-29,PARALLAX.stars,0xa9bccf],[this.dustPoints,8,PARALLAX.dust,0xa0b9bf]] as const){
        const g=scene.add.graphics().setScrollFactor(0).setDepth(depth).setData('parallax',factor);
        // Cache brightness buckets; stream only visible cached points. Avoid
        // drawing six repeated grids of mostly clipped Graphics commands.
        const buckets=Array.from({length:64},(_,bin)=>points.filter(p=>Math.floor(p.alpha*16)*4+(p.color??0)===bin));
        const span=depth===8?1024:SKY_SPAN;
        Object.assign(g,{renderCanvas:(renderer:Phaser.Renderer.Canvas.CanvasRenderer,src:Phaser.GameObjects.Graphics,camera:Phaser.Cameras.Scene2D.Camera)=>{
          camera.addToRenderList(src);const ctx=renderer.currentContext,w=scene.scale.width,h=scene.scale.height;
          const shiftX=g.getData('shiftX') as number||0,shiftY=g.getData('shiftY') as number||0;
          ctx.save();ctx.setTransform(1,0,0,1,camera.x,camera.y);ctx.fillStyle=depth===8?'#a0b9bf':'#a9bccf';
          for(let bin=0;bin<64;bin++){
            ctx.globalAlpha=(Math.floor(bin/4)+.5)/16*src.alpha*camera.alpha;
            ctx.fillStyle=depth===8?'#a0b9bf':`#${STAR_COLORS[bin%4].toString(16)}`;
            const bucket=buckets[bin],step=g.getData('detail')?1:4;
            for(let i=0;i<bucket.length;i+=step){const p=bucket[i];
              const x=(p.x-shiftX+span)%span,y=(p.y-shiftY+span)%span;
              for(let sy=y;sy<h;sy+=span)for(let sx=x;sx<w;sx+=span)ctx.fillRect(Math.round(sx),Math.round(sy),p.size,depth===8?.6:p.size);
            }
          }
          ctx.restore();
        }});
        this.canvasGeometry.push(g);
      }
    }
  }
  private make(name:string,size:number,factor:number,paint:(ctx:CanvasRenderingContext2D)=>void,depth:number,tileScale=1){
    const key=`space-${name}`;this.keys.push(key);const tex=this.scene.textures.createCanvas(key,size,size)!;paint(tex.context);tex.refresh();
    const layer=this.scene.add.tileSprite(0,0,this.scene.scale.width,this.scene.scale.height,key).setOrigin(0).setScrollFactor(0).setDepth(depth);
    layer.tileScaleX=layer.tileScaleY=tileScale;layer.setData('tileScale',tileScale);layer.setData('parallax',factor);this.layers.push(layer);
  }
  update(camera:Phaser.Cameras.Scene2D.Camera,enabled=true,dust=true,now=performance.now()){
    const z=camera.zoom,w=this.scene.scale.width,h=this.scene.scale.height;
    for(const layer of this.layers){
      layer.setScale(1/z).setPosition(w*.5*(1-1/z),h*.5*(1-1/z));
      const factor=enabled ? layer.getData('parallax') as number : 0;
      const scale=layer.getData('tileScale') as number;layer.tilePositionX=camera.scrollX*factor/scale;layer.tilePositionY=camera.scrollY*factor/scale;
      if(layer.depth===-29)layer.setVisible(layer.texture.key==='space-stars'?dust:!dust);
      if(layer.depth===8||(layer.depth===-29.5||layer.depth===-29.25))layer.setVisible(dust);
      if(this.canvasGeometry.length&&(layer.depth===-29||layer.depth===8))layer.setVisible(false);
    }
    for(const g of this.canvasGeometry){
      const factor=enabled?g.getData('parallax') as number:0;
      const span=g.depth===8?1024:SKY_SPAN,x=parallaxOffset(camera.scrollX,factor,span),y=parallaxOffset(camera.scrollY,factor,span);
      g.setData('shiftX',x).setData('shiftY',y).setData('detail',dust);
      if(g.depth===8)g.setVisible(dust);
    }
    this.ambient.clear().setVisible(dust);
    if(dust){
      const elapsed=Math.max(0,now-this.animationOrigin),factor=enabled?.065:0;
      for(let i=0;i<this.twinkles.length;i++){
        const p=this.twinkles[i],x=(p.x-parallaxOffset(camera.scrollX,factor)+SKY_SPAN)%SKY_SPAN,y=(p.y-parallaxOffset(camera.scrollY,factor)+SKY_SPAN)%SKY_SPAN;
        if(x>w||y>h)continue;const alpha=.12+.10*Math.sin(elapsed*.0007+i*2.3);
        this.ambient.fillStyle(0xc7c4ed,alpha*.4).fillCircle(x,y,2.5).fillStyle(0xdbdef4,alpha).fillCircle(x,y,.8);
      }
      if(sampleMeteor(elapsed,w,h,this.meteor)){const m=this.meteor;this.ambient.lineStyle(1,m.color,m.alpha*.22).lineBetween(m.tailX,m.tailY,m.x,m.y).lineStyle(.6,m.color,m.alpha).lineBetween(m.tailX+(m.x-m.tailX)*.65,m.tailY+(m.y-m.tailY)*.65,m.x,m.y);}
    }

  }
  destroy(){this.ambient.destroy();for(const g of this.canvasGeometry)g.destroy();for(const l of this.layers)l.destroy();for(const k of this.keys)this.scene.textures.remove(k);}
}
