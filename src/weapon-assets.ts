import type Phaser from 'phaser';
export const WEAPON_ASSETS={
 'weapon-blaster':'regular/blaster.png','weapon-nova-shotgun':'regular/nova-shotgun.png','weapon-missile-launcher':'regular/missile-launcher.png','weapon-ion-smg':'regular/ion-smg.png','weapon-zapper':'regular/zapper.png',
 'weapon-cryo-stream':'galaxy/cryo-stream.png','weapon-inferno-cannon':'galaxy/inferno-cannon.png','weapon-lunar-seeker':'galaxy/lunar-seeker.png','weapon-titan-minigun':'galaxy/titan-minigun.png',
} as const;
export type WeaponAssetId=keyof typeof WEAPON_ASSETS;
export const weaponAssetUrl=(id:string)=>id in WEAPON_ASSETS?`${import.meta.env.BASE_URL}assets/weapons/processed/${WEAPON_ASSETS[id as WeaponAssetId]}`:'';
export function preloadWeaponAssets(scene:Phaser.Scene){for(const id of Object.keys(WEAPON_ASSETS))scene.load.image(id,weaponAssetUrl(id));}
// Bounded, pooled sprites. Shared by regular/Galaxy pickups and equipment.
export class WeaponSprites {
 private sprites:Phaser.GameObjects.Image[]=[];private used=0;
 constructor(private scene:Phaser.Scene,private depth:number,private cap=96){}
 begin(){this.used=0;for(const s of this.sprites)s.setVisible(false);}
 draw(id:string,x:number,y:number,width:number,angle=0){
  if(!this.scene.textures.exists(id)||this.used>=this.cap)return false;
  const sprite=this.sprites[this.used]??(this.sprites[this.used]=this.scene.add.image(0,0,id).setDepth(this.depth).setName('weapon-png'));this.used++;
  sprite.setTexture(id).setPosition(x,y).setRotation(angle).setScale(width/sprite.width).setVisible(true);return true;
 }
 destroy(){for(const s of this.sprites)s.destroy();this.sprites=[];}
}
