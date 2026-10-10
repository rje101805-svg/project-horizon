import type Phaser from 'phaser';
import type {Biome} from './planet-material';
// Source disc bounds measured at alpha >=240. Normalize the main disc, not
// the square PNG or its atmospheric fringe; retain proportional scaling.
export const PLANET_IMAGES:Record<Biome,{filename:string;key:string;centerX:number;centerY:number;discRadius:number;size:number}>={
 ice:{filename:'borealis.png',key:'custom-primary-ice',centerX:623,centerY:616,discRadius:545,size:1254},
 volcanic:{filename:'cinder.png',key:'custom-primary-volcanic',centerX:622.5,centerY:609,discRadius:558.5,size:1254},
 terrestrial:{filename:'terrestrial.png',key:'custom-primary-terrestrial',centerX:622.5,centerY:614,discRadius:573.5,size:1254},
 moon:{filename:'ashen.png',key:'custom-primary-moon',centerX:621.5,centerY:613.5,discRadius:567.5,size:1254},
};
export function preloadPlanetImages(scene:Phaser.Scene){
 for(const image of Object.values(PLANET_IMAGES))scene.load.image(image.key,`${import.meta.env.BASE_URL}assets/planets/${image.filename}`);
}
