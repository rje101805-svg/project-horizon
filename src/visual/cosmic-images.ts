import Phaser from 'phaser';

import {COSMIC_IMAGES,maskCosmicPixels} from './cosmos';

export function preloadCosmicImages(scene:Phaser.Scene){
  for(const [i,p] of COSMIC_IMAGES.entries())scene.load.image(`cosmic-source-${i}`,`${import.meta.env.BASE_URL}assets/cosmic/${encodeURIComponent(p.file)}`);
}

export class CosmicImages {
  readonly images:Phaser.GameObjects.Image[]=[];
  private keys:string[]=[];
  constructor(private scene:Phaser.Scene){
    for(const [i,p] of COSMIC_IMAGES.entries()){
      const sourceKey=`cosmic-source-${i}`,source=scene.textures.get(sourceKey).getSourceImage() as HTMLImageElement;
      const key=`space-cosmic-${i}`,texture=scene.textures.createCanvas(key,source.width,source.height)!;
      texture.context.drawImage(source,0,0);const pixels=texture.context.getImageData(0,0,source.width,source.height);
      maskCosmicPixels(pixels.data);texture.context.putImageData(pixels,0,0);texture.refresh();texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.keys.push(key);scene.textures.remove(sourceKey);
      this.images.push(scene.add.image(0,0,key).setScrollFactor(0).setDepth(-29.2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(p.alpha).setRotation(p.angle));
    }
  }
  update(camera:Phaser.Cameras.Scene2D.Camera,parallax:boolean){
    const w=this.scene.scale.width,h=this.scene.scale.height,z=camera.zoom;
    // Keep formations small even on narrow viewports; source pixels are never magnified.
    const fit=Math.min(1,Math.sqrt(w*h/(1100*600)));
    for(const [i,image] of this.images.entries()){
      const p=COSMIC_IMAGES[i],x=p.x-(parallax?camera.scrollX*p.parallax:0),y=p.y-(parallax?camera.scrollY*p.parallax:0);
      const width=p.width*fit,height=width*2/3;
      image.setDisplaySize(width/z,height/z).setPosition(w*.5+(x-w*.5)/z,h*.5+(y-h*.5)/z);
      // Low retains the same landmarks and image detail; only ambient animation,
      // star density and auxiliary layering are reduced elsewhere.
      const radius=Math.hypot(width,height)*.5;
      image.setVisible(x+radius>0&&x-radius<w&&y+radius>0&&y-radius<h);
    }
  }
  destroy(){for(const image of this.images)image.destroy();for(const key of this.keys)this.scene.textures.remove(key);}
}
