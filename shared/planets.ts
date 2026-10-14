import {WORLD_SCALE} from './world';
export type Biome = 'ice'|'volcanic'|'terrestrial'|'moon';
export interface PlanetRegion {id:string;biome:Biome;name:string;x:number;y:number;radius:number;color:number}
// One map definition shared by presentation and authoritative objectives. No planet collision.
export const PLANET_REGIONS:readonly PlanetRegion[]=([
 {id:'borealis',biome:'ice',name:'Borealis',x:2400,y:2900,radius:825,color:0x91d4e4},
 {id:'cinder',biome:'volcanic',name:'Cinder',x:9000,y:2400,radius:735,color:0xc66830},
 {id:'pelagia',biome:'terrestrial',name:'Pelagia',x:8400,y:8900,radius:975,color:0x4eae9a},
 {id:'ashen',biome:'moon',name:'Ashen',x:2200,y:9200,radius:470,color:0xb0a899},
] as const).map(p=>({...p,x:p.x*WORLD_SCALE,y:p.y*WORLD_SCALE}));
