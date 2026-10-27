import type {Archetype} from './pilots';
export const FIGHTER_IDS=['redline','nova','horizon','shadow','dreadnought','zenith','vulcan','eclipse'] as const;
export type FighterId=typeof FIGHTER_IDS[number];
interface Fighter {identity:string;personality:Archetype;speed:number;acceleration:number;turn:number;maxShield:number;wallCost:number;useTime:number;captureMs:number;pickup:number;radar:number;signature:number;repair:number;wallMs:number;material:number;feed:number;ship:string}
const base:Fighter={identity:'',personality:'Strategist',speed:1,acceleration:1,turn:1,maxShield:100,wallCost:20,useTime:1,captureMs:10000,pickup:1,radar:1,signature:1,repair:40,wallMs:15000,material:25,feed:0,ship:'redline'};
export const FIGHTERS:Readonly<Record<FighterId,Readonly<Fighter>>>=Object.freeze({
 redline:{...base,identity:'Rocket Man',personality:'Aggressor',speed:1.03,acceleration:1.03,ship:'redline'},
 nova:{...base,identity:'Scientist',personality:'Strategist',wallCost:18,useTime:.9,ship:'nova'},
 horizon:{...base,identity:'Adventurist',personality:'Wildcard',captureMs:9000,pickup:1.15,ship:'horizon'},
 shadow:{...base,identity:'Rogue',personality:'Survivor',signature:.88,turn:1.04,ship:'raider'},
 dreadnought:{...base,identity:'Commander',personality:'Strategist',maxShield:108,repair:42,speed:.98,ship:'dreadnought'},
 zenith:{...base,identity:'Oracle',personality:'Strategist',radar:1.12,turn:1.04,ship:'zenith'},
 vulcan:{...base,identity:'Scavenger',personality:'Scavenger',material:28,wallMs:19000,ship:'rocket'},
 eclipse:{...base,identity:'Hunter',personality:'Aggressor',acceleration:1.03,feed:10,ship:'eclipse'},
});
export function isFighter(id:unknown):id is FighterId{return typeof id==='string'&&(FIGHTER_IDS as readonly string[]).includes(id);}
export type FighterState={fighterId?:FighterId;status?:string;lifeState?:string};
// Legacy geometry fixtures without an assigned identity retain neutral physics.
// Alien/OUT states never inherit human passives.
export function fighterStats(s:FighterState|undefined):Readonly<Fighter>{return s?.fighterId&&isFighter(s.fighterId)&&(!s.status||s.status==='ALIVE')?FIGHTERS[s.fighterId]:base;}
export const FIGHTER_TURN_RATE=Math.PI*4;
export function turnHeading(from:number,to:number,rate:number){const delta=Math.atan2(Math.sin(to-from),Math.cos(to-from));return from+Math.max(-rate,Math.min(rate,delta));}

export function materialAmount(s:FighterState|undefined,quantity:number,source:string){return source==='world'&&quantity===25?fighterStats(s).material:quantity;}
