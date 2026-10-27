export const GUARDIAN_CONFIG=Object.freeze({count:4,hp:60,radius:11,thinkMs:200,respawnMs:60000,spawnClearance:110,materialsPerKill:5,maxMaterialsPerPlanet:40,projectileCap:3,reactionMs:450,telegraphMs:300,slowMs:600,slowFactor:.8});
export interface GuardianProfile {name:string;color:number;style:'ice'|'volcanic'|'terrestrial'|'moon';speed:number;damage:number;aggression:number;engageFactor:number;leashFactor:number;range:number;intervalMs:number;aimError:number;projectileSpeed:number;closeFactor:number}
export const GUARDIAN_PROFILES:Readonly<Record<string,GuardianProfile>>={
 borealis:{name:'Borealis Guardians',color:0x96e9ff,style:'ice',speed:85,damage:6,aggression:1,engageFactor:1.8,leashFactor:2.5,range:760,intervalMs:1300,aimError:.13,projectileSpeed:570,closeFactor:1},
 cinder:{name:'Cinder Guardians',color:0xff8047,style:'volcanic',speed:165,damage:6,aggression:1.15,engageFactor:1.8,leashFactor:2.1,range:620,intervalMs:1300,aimError:.13,projectileSpeed:620,closeFactor:1.35},
 pelagia:{name:'Pelagia Guardians',color:0x77e5a9,style:'terrestrial',speed:120,damage:6,aggression:1,engageFactor:1.8,leashFactor:2.5,range:800,intervalMs:1200,aimError:.13,projectileSpeed:580,closeFactor:1},
 ashen:{name:'Ashen Guardians',color:0xcac6ee,style:'moon',speed:145,damage:4,aggression:.9,engageFactor:1.8,leashFactor:2.5,range:1050,intervalMs:1400,aimError:.15,projectileSpeed:640,closeFactor:1},
};
export interface Guardian {id:string;planetId:string;slot:number;x:number;y:number;vx:number;vy:number;rotation:number;health:number;maxHealth:number;telegraph:boolean}
export interface GuardianGang {planetId:string;remaining:number;consumed:boolean;respawnRemainingMs:number|null}
export interface GuardianSnapshot {round:number;units:Guardian[];gangs:GuardianGang[]}
