import type { Biome } from './planet-material';
export interface PlanetRegion {biome:Biome;name:string;x:number;y:number;radius:number;color:number}
// Presentation geography only. Never imported into server physics/collision.
export const PLANET_REGIONS:readonly PlanetRegion[]=[
 {biome:'ice',name:'Borealis',x:2400,y:2900,radius:1100,color:0x91d4e4},
 {biome:'volcanic',name:'Cinder',x:9000,y:2400,radius:980,color:0xc66830},
 {biome:'terrestrial',name:'Pelagia',x:8400,y:8900,radius:1300,color:0x4eae9a},
 {biome:'moon',name:'Ashen',x:2200,y:9200,radius:720,color:0xb0a899},
];
export const LANDMARKS=[{name:'Northern fragments',x:5700,y:1800},{name:'Eastern fragments',x:10300,y:5800},{name:'Western fragments',x:1500,y:6100}] as const;
export const VIEW_POINTS=[...PLANET_REGIONS.map(p=>({name:p.name,x:p.x,y:p.y})),{name:'Central corridor',x:6000,y:6000},{name:'Northwest corner',x:650,y:650},{name:'Northeast corner',x:11350,y:650},{name:'Southwest corner',x:650,y:11350},{name:'Southeast corner',x:11350,y:11350}] as const;
export function mapPoint(x:number,y:number,world:number,size=150){return {x:Math.max(0,Math.min(size,x/world*size)),y:Math.max(0,Math.min(size,y/world*size))};}
