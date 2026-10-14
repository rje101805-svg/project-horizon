import {LOOT_SCALE} from './world';
import type {AmmoType,WeaponInstance} from './weapons';
export const LOOT_CONFIG=Object.freeze({weaponCount:Math.round(35*LOOT_SCALE),ammoCount:Math.round(35*LOOT_SCALE),pickupRadius:130,recentPickupMs:250,paddedPickupRadius:250,spacing:180,playerClearance:220,planetClearance:80,cap:Math.round(160*LOOT_SCALE),replenishMs:5000,dropLifetimeMs:120000,pickupGraceMs:750});
interface PickupBase {id:string;x:number;y:number;spawnTimeMs:number;source:'world'|'drop';blockedId?:string;blockedUntilMs?:number}
export type LootPickup=(PickupBase&{kind:'weapon';weapon:WeaponInstance})|(PickupBase&{kind:'ammo';ammoType:AmmoType;quantity:number});
export interface LootSnapshot {pickups:LootPickup[]}
export interface InventoryCommand {sequence:number;roomCode:string;round:number;reloadSession:string;lifeGeneration:number;teleportSequence:number;revision:number;action:'switch'|'swap'|'pickup'|'drop'|'reorder';slot?:number;toSlot?:number;pickupId?:string}
export interface InventoryResult {ok:boolean;reason:string}
export const WORLD_WEAPON_COUNTS={blaster:Math.round(10*LOOT_SCALE),smg:Math.round(9*LOOT_SCALE),shotgun:Math.round(8*LOOT_SCALE),zapper:Math.round(5*LOOT_SCALE),missile:Math.round(3*LOOT_SCALE)} as const;
export function parseInventoryCommand(raw:unknown):InventoryCommand|null {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const r=raw as InventoryCommand,validSlot=(v:unknown)=>Number.isInteger(v)&&Number(v)>=0&&Number(v)<=2;
 if(Object.keys(r).some(k=>!['sequence','roomCode','round','reloadSession','lifeGeneration','teleportSequence','revision','action','slot','toSlot','pickupId'].includes(k))||!Number.isSafeInteger(r.sequence)||r.sequence<=0||![r.round,r.lifeGeneration,r.teleportSequence,r.revision].every(v=>Number.isSafeInteger(v)&&v>=0)||typeof r.roomCode!=='string'||typeof r.reloadSession!=='string'||!['switch','swap','pickup','drop','reorder'].includes(r.action))return null;
 if(r.action==='switch'&&(!validSlot(r.slot)||r.toSlot!==undefined||r.pickupId!==undefined)||r.action==='reorder'&&(!validSlot(r.slot)||!validSlot(r.toSlot)||r.pickupId!==undefined)||r.action==='drop'&&(r.slot!==undefined&&!validSlot(r.slot)||r.toSlot!==undefined||r.pickupId!==undefined)||['pickup','swap'].includes(r.action)&&(r.slot!==undefined||r.toSlot!==undefined||r.pickupId!==undefined&&(typeof r.pickupId!=='string'||!r.pickupId||r.pickupId.length>128)))return null;
 return r;
}
