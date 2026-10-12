import type {AmmoType,WeaponInstance} from './weapons';
export const LOOT_CONFIG=Object.freeze({weaponCount:20,ammoCount:25,pickupRadius:45,spacing:180,playerClearance:220,planetClearance:80,cap:160,replenishMs:5000,dropLifetimeMs:120000,pickupGraceMs:750});
interface PickupBase {id:string;x:number;y:number;spawnTimeMs:number;source:'world'|'drop';blockedId?:string;blockedUntilMs?:number}
export type LootPickup=(PickupBase&{kind:'weapon';weapon:WeaponInstance})|(PickupBase&{kind:'ammo';ammoType:AmmoType;quantity:number});
export interface LootSnapshot {pickups:LootPickup[]}
export interface InventoryCommand {sequence:number;roomCode:string;round:number;reloadSession:string;lifeGeneration:number;teleportSequence:number;revision:number;action:'switch'|'swap';slot?:number}
export interface InventoryResult {ok:boolean;reason:string}
export function parseInventoryCommand(raw:unknown):InventoryCommand|null {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const r=raw as InventoryCommand;
 if(Object.keys(r).some(k=>!['sequence','roomCode','round','reloadSession','lifeGeneration','teleportSequence','revision','action','slot'].includes(k))||!Number.isSafeInteger(r.sequence)||r.sequence<=0||!Number.isSafeInteger(r.round)||!Number.isSafeInteger(r.lifeGeneration)||!Number.isSafeInteger(r.teleportSequence)||!Number.isSafeInteger(r.revision)||typeof r.roomCode!=='string'||typeof r.reloadSession!=='string'||!['switch','swap'].includes(r.action)||r.action==='switch'&&(!Number.isInteger(r.slot)||r.slot!<0||r.slot!>2)||r.action==='swap'&&r.slot!==undefined)return null;
 return r;
}
