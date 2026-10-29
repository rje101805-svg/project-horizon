import {PLANET_REGIONS} from './planets';
import {CAPTURE_RADIUS_FACTOR} from './objectives';
import {WORLD} from './world';
// Same bounded world and movement as competitive play, with no hazard geometry.
export const PRACTICE_HOLE={x:-WORLD,y:-WORLD,eventHorizonRadius:0,influenceRadius:0};
export const PRACTICE_DEPOTS=PLANET_REGIONS.map(p=>({planetId:p.id,x:p.x+p.radius*CAPTURE_RADIUS_FACTOR+440,y:p.y}));
export const PRACTICE_SPAWN={x:PRACTICE_DEPOTS[0].x+360,y:PRACTICE_DEPOTS[0].y+350};
export const PRACTICE_RESTOCK_MS=5000;
