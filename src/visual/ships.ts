import {SHIP_COLORS} from '../../shared/rooms';
// Cosmetic table only. Origins use physical hulls, excluding baked flame tails.
export const SHIP_ART = [
  {key:"redline",sourceFilename:"ship-redline.png",textureKey:"ship-art-redline",originX:0.5,originY:0.42,visualScale:0.1863442,noseOffset:20.0354,width:239,height:256,rotationOffset:Math.PI/2},
  {key:"dreadnought",sourceFilename:"ship-dreadnought.png",textureKey:"ship-art-dreadnought",originX:0.5,originY:0.455,visualScale:0.2234344,noseOffset:26.026,width:172,height:256,rotationOffset:Math.PI/2},
  {key:"rocket",sourceFilename:"ship-rocket.png",textureKey:"ship-art-rocket",originX:0.5,originY:0.4,visualScale:0.239932,noseOffset:24.5686,width:137,height:256,rotationOffset:Math.PI/2},
  {key:"horizon",sourceFilename:"ship-horizon.png",textureKey:"ship-art-horizon",originX:0.5,originY:0.42,visualScale:0.2691458,noseOffset:28.938,width:171,height:256,rotationOffset:Math.PI/2},
  {key:"nova",sourceFilename:"ship-nova.png",textureKey:"ship-art-nova",originX:0.5,originY:0.425,visualScale:0.2233154,noseOffset:24.297,width:160,height:256,rotationOffset:Math.PI/2},
  {key:"zenith",sourceFilename:"ship-zenith.png",textureKey:"ship-art-zenith",originX:0.5,originY:0.5,visualScale:0.2293914,noseOffset:22.1368,width:256,height:193,rotationOffset:Math.PI/2},
  {key:"raider",sourceFilename:"ship-raider-provisional.png",textureKey:"ship-art-raider",originX:0.5,originY:0.42,visualScale:0.2174116,noseOffset:23.3758,width:185,height:256,rotationOffset:Math.PI/2},
  {key:"eclipse",sourceFilename:"ship-eclipse-provisional.png",textureKey:"ship-art-eclipse",originX:0.5,originY:0.41,visualScale:0.2214184,noseOffset:23.24,width:177,height:256,rotationOffset:Math.PI/2},
] as const;
export type ShipArt = typeof SHIP_ART[number];
// Server-reserved room colors are unique, replicated and retained through deaths
// and round resets. No local ordering or new protocol fields are involved.
const ART_BY_COLOR=new Map<number,ShipArt>(SHIP_COLORS.map((color,index)=>[color,SHIP_ART[index]]));
export function shipArtForColor(color:number):ShipArt {
  return ART_BY_COLOR.get(color)??SHIP_ART[0];
}
