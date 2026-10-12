import type {RoomPlayer} from './rooms';
// Small equipment boundary for future inventory work. No slot inventory yet.
export function equipGoldGun(player:RoomPlayer,id:string):boolean {
 const s=player.state;
 if(typeof id!=='string'||!id||id.length>128||!player.gameplayEnabled||s.status!=='ALIVE'||s.lifeState!=='active'||s.health<=0||s.goldGunId)return false;
 s.goldGunId=id;player.combatTimers.reload=player.combatTimers.cooldown=0;player.combatTimers.reloadCompleted=false;
 s.isReloading=false;s.reloadRemainingMs=s.reloadProgress=s.fireCooldownRemainingMs=0;s.fireCooldownProgress=1;
 return true;
}
export function clearGoldGun(player:RoomPlayer):string|null {
 const id=player.state.goldGunId??null;player.state.goldGunId=null;return id;
}
