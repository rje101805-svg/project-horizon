import {BASIC_BLASTER} from './projectiles';
import {FIRE_COOLDOWN,type CombatState} from './combat';
export const GOLD_GUN = Object.freeze({damageMultiplier:2,fireIntervalMs:FIRE_COOLDOWN/1.5,pickupRadius:45,maxHeld:1,maxActive:Math.ceil(BASIC_BLASTER.maxActive*1.5)});
export const hasGoldGun=(state:Pick<CombatState,'status'|'goldGunId'>)=>state.status==='ALIVE'&&!!state.goldGunId;
