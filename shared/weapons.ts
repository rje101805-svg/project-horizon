import type {CombatState} from './combat';
export const WEAPON_CLASSES=['blaster','shotgun','missile','smg','zapper'] as const;
export type WeaponClass=typeof WEAPON_CLASSES[number];
export const RARITIES=['COMMON','RARE','LEGENDARY'] as const;
export type Rarity=typeof RARITIES[number];
export const AMMO_TYPES=['energy','plasma','missiles','light','shock'] as const;
export type AmmoType=typeof AMMO_TYPES[number];
// Accepted P3S4 regular damage remains unchanged when shields increase.
export const REGULAR_DAMAGE_SCALE=1.5;
export interface WeaponDefinition {name:string;assetId:string;ammoType:AmmoType;damage:readonly number[];rate:number;reloadMs:number;magazine:number;speed:number;lifetimeMs:number;spread:number;pellets:number;range:number;automatic:boolean}
export const WEAPONS:Readonly<Record<WeaponClass,WeaponDefinition>>={
 blaster:{name:'Blaster',assetId:'weapon-blaster',ammoType:'energy',damage:[27,30,34],rate:5.5,reloadMs:2300,magazine:30,speed:800,lifetimeMs:2000,spread:0,pellets:1,range:1100,automatic:true},
 shotgun:{name:'Nova Shotgun',assetId:'weapon-nova-shotgun',ammoType:'plasma',damage:[72,85,105],rate:.7,reloadMs:4000,magazine:6,speed:800,lifetimeMs:600,spread:.32,pellets:5,range:350,automatic:true},
 missile:{name:'Missile Launcher',assetId:'weapon-missile-launcher',ammoType:'missiles',damage:[55,65,75],rate:.75,reloadMs:3000,magazine:3,speed:430,lifetimeMs:3000,spread:0,pellets:1,range:1100,automatic:true},
 smg:{name:'Ion SMG',assetId:'weapon-ion-smg',ammoType:'light',damage:[12,14,17],rate:11,reloadMs:2200,magazine:40,speed:850,lifetimeMs:800,spread:.035,pellets:1,range:600,automatic:true},
 zapper:{name:'Zapper',assetId:'weapon-zapper',ammoType:'shock',damage:[15,18,21],rate:1.25,reloadMs:2500,magazine:12,speed:650,lifetimeMs:2000,spread:0,pellets:1,range:1000,automatic:false},
};
export const RARITY_COLORS:Record<Rarity,number>={COMMON:0xdce3eb,RARE:0x489dff,LEGENDARY:0xbe6cff};
export const RARITY_WEIGHTS=[.6,.3,.1] as const;
export const RESERVE_CAPS:Record<AmmoType,number>={energy:180,plasma:36,missiles:18,light:240,shock:72};
export const AMMO_PACKS:Record<AmmoType,number>={energy:30,plasma:6,missiles:3,light:40,shock:12};
export const AMMO_NAMES:Record<AmmoType,string>={energy:'Energy Rounds',plasma:'Plasma Shells',missiles:'Missiles',light:'Light Energy Rounds',shock:'Shock Cells'};
export interface WeaponInstance {id:string;class:WeaponClass;rarity:Rarity;magazine:number;capacity:number;grantConsumed:boolean}
export interface WeaponInventory {slots:(WeaponInstance|null)[];activeSlot:number;reserve:Record<AmmoType,number>;revision:number}
export const emptyReserve=():Record<AmmoType,number>=>({energy:0,plasma:0,missiles:0,light:0,shock:0});
export const weaponDamage=(weapon:Pick<WeaponInstance,'class'|'rarity'>)=>WEAPONS[weapon.class].damage[RARITIES.indexOf(weapon.rarity)]*REGULAR_DAMAGE_SCALE;
export const activeWeapon=(state:Pick<CombatState,'inventory'>)=>state.inventory?.slots[state.inventory.activeSlot]??null;
// Historical protocol name retained for pickup geometry; combat has four typed variants.
export const GOLD_GUN=Object.freeze({pickupRadius:45,maxHeld:1,maxActive:48});
export const hasGoldGun=(state:Pick<CombatState,'status'|'goldGunId'>)=>state.status==='ALIVE'&&!!state.goldGunId;
export const STUN_MS=500,STUN_IMMUNITY_MS=1500,MISSILE_EXPLOSION_RADIUS=130;
export const GALAXY_TYPES=['cryo','inferno','lunar','titan'] as const;
export type GalaxyType=typeof GALAXY_TYPES[number];
export const GALAXY_WEAPONS={
 cryo:{name:'Cryo Stream',assetId:'weapon-cryo-stream',damage:13,rate:16,speed:950,lifetimeMs:750,range:700,color:0x9eefff},
 inferno:{name:'Inferno Cannon',assetId:'weapon-inferno-cannon',damage:45,rate:4,speed:680,lifetimeMs:900,range:600,color:0xff783a},
 lunar:{name:'Lunar Seeker',assetId:'weapon-lunar-seeker',damage:90,rate:2,speed:520,lifetimeMs:3500,range:1800,color:0xd2ccff},
 titan:{name:'Titan Minigun',assetId:'weapon-titan-minigun',damage:24,rate:10,speed:900,lifetimeMs:850,range:750,color:0x70b9ff},
} as const;
export const PLANET_GALAXY:Record<string,GalaxyType>={borealis:'cryo',cinder:'inferno',ashen:'lunar',pelagia:'titan'};
export const GALAXY_CONFIG=Object.freeze({slowFactor:.7,slowMs:600,burnDps:10,burnMs:2000,spinUpMs:750,spinDownMs:500,spreadMin:.012,spreadMax:.13,spreadRampMs:2000,homingCone:Math.PI/3,homingTurnRate:1.1,homingAcquireRange:1500,projectileCap:48});
export function fireInterval(state:Pick<CombatState,'goldGunId'|'galaxyType'|'titanSpin'|'status'|'inventory'>){
 if(!hasGoldGun(state))return 1000/WEAPONS[activeWeapon(state)?.class??'blaster'].rate;
 const type=state.galaxyType??'cryo';return 1000/(GALAXY_WEAPONS[type].rate*(type==='titan'?.25+.75*(state.titanSpin??0):1));
}
export const reloadDuration=(state:Pick<CombatState,'inventory'>)=>WEAPONS[activeWeapon(state)?.class??'blaster'].reloadMs;

export const MAX_PROJECTILE_DAMAGE=Math.max(...GALAXY_TYPES.map(t=>GALAXY_WEAPONS[t].damage),...WEAPON_CLASSES.map(k=>Math.max(...WEAPONS[k].damage)*REGULAR_DAMAGE_SCALE/WEAPONS[k].pellets));
