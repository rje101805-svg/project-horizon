import Phaser from 'phaser';
import { PARALLAX, seededRandom } from './config';
// Four cached tile layers. No per-star objects, randomization, or particle emitters at runtime.
export class DeepSpace {
  readonly layers:Phaser.GameObjects.TileSprite[]=[];
  private keys:string[]=[];
  private canvasGeometry:Phaser.GameObjects.Graphics[]=[];
  private starPoints:{x:number;y:number;size:number;alpha:number}[]=[];
  private dustPoints:{x:number;y:number;size:number;alpha:number}[]=[];
  constructor(private scene:Phaser.Scene) {
    const rng=seededRandom();
    this.make('void',1024,.0,ctx=>{
      ctx.fillStyle='#030710';ctx.fillRect(0,0,1024,1024);
      const g=ctx.createRadialGradient(750,300,10,650,400,800);g.addColorStop(0,'#091420');g.addColorStop(1,'#030710');ctx.fillStyle=g;ctx.fillRect(0,0,1024,1024);
    },-30);
    this.make('stars',1024,PARALLAX.stars,ctx=>{
      for(let i=0;i<1700;i++){
        const x=rng()*1024,y=rng()*1024,density=.22+.5*Math.pow(Math.sin(x*.003+y*.002),2);
        if(rng()>density)continue;
        const alpha=.08+Math.pow(rng(),3)*.55,size=.35+rng()*.7;
        this.starPoints.push({x,y,size,alpha});ctx.fillStyle=`rgba(169,188,207,${alpha})`;ctx.fillRect(x,y,size,size);
      }
    },-29);
    this.make('haze',1024,PARALLAX.haze,ctx=>{
      for(let i=0;i<20;i++){
        const x=180+rng()*650,y=150+rng()*650,r=120+rng()*300;
        const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,i%3?'rgba(30,56,73,.085)':'rgba(64,45,66,.055)');g.addColorStop(1,'rgba(3,7,16,0)');ctx.fillStyle=g;ctx.fillRect(0,0,1024,1024);
      }
    },-28);
    this.make('dust',1024,PARALLAX.dust,ctx=>{for(let i=0;i<34;i++){const alpha=.035+rng()*.055,x=rng()*1024,y=rng()*1024;this.dustPoints.push({x,y,size:1.3,alpha});ctx.fillStyle=`rgba(160,185,191,${alpha})`;ctx.fillRect(x,y,1.3,.6);}},8);
    // Phaser Canvas copies transparent TileSprite canvases into the main canvas.
    // Profiling showed these sparse star/dust copies dominate draw time. Cache
    // equivalent point data once instead; no per-frame generation or full-screen sparse copies.
    if(scene.game.renderer.type===Phaser.CANVAS){
      for(const [points,depth,factor,color]of [[this.starPoints,-29,PARALLAX.stars,0xa9bccf],[this.dustPoints,8,PARALLAX.dust,0xa0b9bf]] as const){
        const g=scene.add.graphics().setScrollFactor(0).setDepth(depth).setData('parallax',factor);
        // Cache brightness buckets; stream only visible cached points. Avoid
        // drawing six repeated grids of mostly clipped Graphics commands.
        const buckets=Array.from({length:16},(_,bin)=>points.filter(p=>Math.floor(p.alpha*16)===bin));
        Object.assign(g,{renderCanvas:(renderer:Phaser.Renderer.Canvas.CanvasRenderer,src:Phaser.GameObjects.Graphics,camera:Phaser.Cameras.Scene2D.Camera)=>{
          camera.addToRenderList(src);const ctx=renderer.currentContext,w=scene.scale.width,h=scene.scale.height;
          const shiftX=g.getData('shiftX') as number||0,shiftY=g.getData('shiftY') as number||0;
          ctx.save();ctx.setTransform(1,0,0,1,camera.x,camera.y);ctx.fillStyle=depth===8?'#a0b9bf':'#a9bccf';
          for(let bin=0;bin<16;bin++){
            ctx.globalAlpha=(bin+.5)/16*src.alpha*camera.alpha;
            const bucket=buckets[bin],step=g.getData('detail')?1:2;
            for(let i=0;i<bucket.length;i+=step){const p=bucket[i];
              const x=(p.x-shiftX+1024)%1024,y=(p.y-shiftY+1024)%1024;
              if(y<h){ctx.fillRect(x,y,p.size,depth===8?.6:p.size);if(x+1024<w)ctx.fillRect(x+1024,y,p.size,depth===8?.6:p.size);}
            }
          }
          ctx.restore();
        }});
        this.canvasGeometry.push(g);
      }
    }
  }
  private make(name:string,size:number,factor:number,paint:(ctx:CanvasRenderingContext2D)=>void,depth:number){
    const key=`space-${name}`;this.keys.push(key);const tex=this.scene.textures.createCanvas(key,size,size)!;paint(tex.context);tex.refresh();
    const layer=this.scene.add.tileSprite(0,0,this.scene.scale.width,this.scene.scale.height,key).setOrigin(0).setScrollFactor(0).setDepth(depth);
    layer.setData('parallax',factor);this.layers.push(layer);
  }
  update(camera:Phaser.Cameras.Scene2D.Camera,enabled=true,dust=true){
    const z=camera.zoom,w=this.scene.scale.width,h=this.scene.scale.height;
    for(const layer of this.layers){
      layer.setScale(1/z).setPosition(w*.5*(1-1/z),h*.5*(1-1/z));
      const factor=enabled ? layer.getData('parallax') as number : 0;
      layer.tilePositionX=camera.scrollX*factor;layer.tilePositionY=camera.scrollY*factor;
      if(layer.depth===8||layer.depth===-28)layer.setVisible(dust);
      if(this.canvasGeometry.length&&(layer.depth===-29||layer.depth===8))layer.setVisible(false);
    }
    for(const g of this.canvasGeometry){
      const factor=enabled?g.getData('parallax') as number:0;
      const x=((camera.scrollX*factor)%1024+1024)%1024,y=((camera.scrollY*factor)%1024+1024)%1024;
      g.setData('shiftX',x).setData('shiftY',y).setData('detail',dust);
      if(g.depth===8)g.setVisible(dust);
    }
  }
  destroy(){for(const g of this.canvasGeometry)g.destroy();for(const l of this.layers)l.destroy();for(const k of this.keys)this.scene.textures.remove(k);}
}
