import {PLANET_REGIONS} from '../../shared/planets';
export {PLANET_REGIONS,type PlanetRegion} from '../../shared/planets';
export const LANDMARKS=[{name:'Northern fragments',x:5700,y:1800,count:9},{name:'Eastern fragments',x:10300,y:5800,count:9},{name:'Western fragments',x:1500,y:6100,count:9},
 {name:'Northwest approach',x:800,y:1000,count:5},{name:'Northeast approach',x:11100,y:850,count:5},{name:'Southwest approach',x:900,y:11000,count:5},{name:'Southeast approach',x:11000,y:11100,count:5}] as const;
export const VIEW_POINTS=[...PLANET_REGIONS.map(p=>({name:p.name,x:p.x,y:p.y})),{name:'Central corridor',x:6000,y:6000},{name:'Northwest corner',x:650,y:650},{name:'Northeast corner',x:11350,y:650},{name:'Southwest corner',x:650,y:11350},{name:'Southeast corner',x:11350,y:11350}] as const;
export function mapPoint(x:number,y:number,world:number,size=150){return {x:Math.max(0,Math.min(size,x/world*size)),y:Math.max(0,Math.min(size,y/world*size))};}

// Camera-only inspection anchors. No new geometry, entities or minimap markers.
export const ENVIRONMENT_VIEWS=[
 {name:'Dense starfield / distant bodies',x:650,y:650},
 {name:'Sparse starfield',x:11000,y:11000},
 {name:'Nebula / dark dust lanes',x:650,y:4500},
 {name:'Western debris cluster',x:1500,y:6100},
 {name:'Northern debris corridor',x:5700,y:1800},
] as const;
