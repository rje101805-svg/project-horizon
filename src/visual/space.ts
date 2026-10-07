import Phaser from 'phaser';
import { PARALLAX, seededRandom } from './config';
// Three cached tile layers. No per-star objects, randomization, or particle emitters at runtime.
export class DeepSpace {
  readonly layers:Phaser.GameObjects.TileSprite[]=[];
  private keys:string[]=[];
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
        ctx.fillStyle=`rgba(169,188,207,${alpha})`;ctx.fillRect(x,y,size,size);
      }
    },-29);
    this.make('haze',1024,PARALLAX.haze,ctx=>{
      for(let i=0;i<20;i++){
        const x=180+rng()*650,y=150+rng()*650,r=120+rng()*300;
        const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,i%3?'rgba(30,56,73,.085)':'rgba(64,45,66,.055)');g.addColorStop(1,'rgba(3,7,16,0)');ctx.fillStyle=g;ctx.fillRect(0,0,1024,1024);
      }
    },-28);
    this.make('dust',1024,PARALLAX.dust,ctx=>{for(let i=0;i<34;i++){ctx.fillStyle=`rgba(160,185,191,${.035+rng()*.055})`;ctx.fillRect(rng()*1024,rng()*1024,1.3,.6);}},8);
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
      if(layer.depth===8)layer.setVisible(dust);
    }
  }
  destroy(){for(const l of this.layers)l.destroy();for(const k of this.keys)this.scene.textures.remove(k);}
}
