import {WEAPONS,MISSILE_EXPLOSION_RADIUS} from './weapons';
import {BASIC_BLASTER} from './projectiles';
export const BASE_WORLD=12000,DEFAULT_CAMERA_WIDTH=1100,OPENING_BOOST_SPEED=440;
// Opening reach includes inherited boost, full projectile lifetime, muzzle,
// direct-hit body radius and missile splash. Weapon statistics stay unchanged.
export const REGULAR_EFFECTIVE_REACH=Math.max(...Object.entries(WEAPONS).map(([kind,w])=>BASIC_BLASTER.muzzleOffset+(w.speed+OPENING_BOOST_SPEED)*w.lifetimeMs/1000+Math.max(BASIC_BLASTER.shipRadius+(kind==='missile'?6:3),kind==='missile'?MISSILE_EXPLOSION_RADIUS:0)));
export const REQUIRED_LANDING_SEPARATION=Math.max(3*REGULAR_EFFECTIVE_REACH,2*DEFAULT_CAMERA_WIDTH);
export const PACKING_SEPARATION=Math.sqrt(2-Math.sqrt(3));
// Corner distance must exceed the initial .05 diagonal plus the 550-unit
// gravity band. One extra unit prevents floating-point boundary attraction.
const extraMargin=DEFAULT_CAMERA_WIDTH/2/Math.SQRT2+1;
export const WORLD=Math.max(BASE_WORLD,Math.ceil((REQUIRED_LANDING_SEPARATION/PACKING_SEPARATION+2*extraMargin)/.9));
if(WORLD>BASE_WORLD*2)throw Error('Landing separation exceeds authorized 2x map enlargement');
export const WORLD_SCALE=WORLD/BASE_WORLD,LANDING_MARGIN=Math.max(DEFAULT_CAMERA_WIDTH/2,.05*WORLD+extraMargin);
export const LOOT_SCALE=Math.min(2,WORLD_SCALE*WORLD_SCALE);
