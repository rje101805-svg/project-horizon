import type {RoomPlayer} from './rooms';
import type {GalaxyType} from '../shared/weapons';
export function equipGoldGun(player:RoomPlayer,id:string,galaxyType:GalaxyType='cryo'):boolean {
 const s=player.state;
 if(typeof id!=='string'||!id||id.length>128||!player.gameplayEnabled||s.status!=='ALIVE'||s.lifeState!=='active'||s.health<=0||s.goldGunId)return false;
 player.dropRegular?.();s.goldGunId=id;s.galaxyType=galaxyType;s.titanSpin=0;s.titanSustainMs=0;player.titanTriggerUntilMs=0;player.combatTimers.reload=player.combatTimers.cooldown=0;player.combatTimers.reloadCompleted=false;
 s.isReloading=false;s.reloadRemainingMs=s.reloadProgress=s.fireCooldownRemainingMs=0;s.fireCooldownProgress=1;
 return true;
}
export function clearGoldGun(player:RoomPlayer):string|null {
 const id=player.state.goldGunId??null;player.state.goldGunId=null;player.state.galaxyType=null;player.state.titanSpin=0;player.state.titanSustainMs=0;player.titanTriggerUntilMs=0;return id;
}
