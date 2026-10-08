// Original production PNGs, sampled at full source resolution. No tiling or regeneration.
export const COSMIC_IMAGES = [
  {file:'Edge-On Galaxy in Deep Space.png',kind:'galaxy',x:260,y:170,width:290,angle:-.12,alpha:.72,parallax:.028},
  {file:'Majestic Colorful Spiral Galaxy.png',kind:'galaxy',x:1170,y:420,width:235,angle:.45,alpha:.62,parallax:.042},
  {file:'Majestic Golden Spiral Galaxy.png',kind:'galaxy',x:690,y:950,width:285,angle:-.3,alpha:.78,parallax:.052},
  {file:'Tilted Golden Spiral Galaxy.png',kind:'galaxy',x:1520,y:1100,width:245,angle:.2,alpha:.65,parallax:.07},
] as const;

// Remove the near-black pedestal, then unpremultiply before Phaser premultiplies
// on upload. Additive blending reconstructs the original radiance on black and
// leaves the starfield intact through dark dust lanes and transparent image edges.
export function maskCosmicPixels(data:Uint8ClampedArray){
  for(let i=0;i<data.length;i+=4){
    const peak=Math.max(data[i],data[i+1],data[i+2]),alpha=Math.max(0,peak-5)/250;
    if(alpha===0){data[i]=data[i+1]=data[i+2]=data[i+3]=0;continue;}
    for(let c=0;c<3;c++)data[i+c]=Math.max(0,data[i+c]-5)/alpha;
    data[i+3]=alpha*255;
  }
}

// Four localized background asteroid groups. No gameplay coordinates/minimap entries.
export const COSMIC_CLUSTERS=[
 {x:250,y:360,count:11,parallax:.18,tint:0xb7a8ce},
 {x:1130,y:820,count:11,parallax:.15,tint:0x9fc2cd},
 {x:2240,y:450,count:11,parallax:.20,tint:0x9b9cae},
 {x:3380,y:1280,count:11,parallax:.24,tint:0xb6a8a0},
] as const;
