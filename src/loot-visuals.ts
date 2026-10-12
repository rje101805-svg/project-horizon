import {WeaponSprites} from './weapon-assets';
import {InventoryUI} from './inventory-ui';
import type {InventoryCommand} from '../shared/loot';
import {GALAXY_WEAPONS} from '../shared/weapons';
import Phaser from 'phaser';
import {activeWeapon,WEAPONS,RARITY_COLORS,AMMO_NAMES,type WeaponClass} from '../shared/weapons';
import {LOOT_CONFIG,type LootPickup} from '../shared/loot';
import type {Snapshot} from '../shared/protocol';
import {weaponGlyph} from './weapon-visuals';
let hudOwner:LootVisuals|undefined;
export class LootVisuals {
 readonly graphics:Phaser.GameObjects.Graphics;private snapshot?:Snapshot;private labels:Phaser.GameObjects.Text[]=[];private sprites:WeaponSprites;private inventory:InventoryUI;private recent?:{id:string;timeMs:number;life:string};highlightedId?:string;
 constructor(private scene:Phaser.Scene,action:(action:InventoryCommand['action'],slot?:number,toSlot?:number)=>void,release:()=>void){this.sprites=new WeaponSprites(scene,4.6);this.inventory=new InventoryUI(action,release);this.graphics=scene.add.graphics().setDepth(4.4);for(let i=0;i<16;i++)this.labels.push(scene.add.text(0,0,'',{fontFamily:'monospace',fontSize:'11px',backgroundColor:'#07101ddd'}).setOrigin(.5).setDepth(8).setVisible(false));hudOwner=this;}
 accept(snapshot:Snapshot,selfId:string){this.snapshot=snapshot;const self=snapshot.players.find(p=>p.id===selfId),inv=self?.inventory;
  if(hudOwner!==this)return;
  this.inventory.accept(self);
  const prompt=document.getElementById('swap-prompt')!,stun=document.getElementById('hud-stun')!;
  stun.hidden=!(self?.stunRemainingMs||self?.stunImmunityRemainingMs||self?.slowRemainingMs||self?.burnRemainingMs||self?.galaxyType==='titan');
  stun.textContent=self?.stunRemainingMs?`STUNNED ${(self.stunRemainingMs/1000).toFixed(1)}s`:self?.slowRemainingMs?`CRYO SLOW ${(self.slowRemainingMs/1000).toFixed(1)}s`:self?.burnRemainingMs?`BURNING ${(self.burnRemainingMs/1000).toFixed(1)}s`:self?.galaxyType==='titan'?`TITAN SPIN ${Math.round((self.titanSpin??0)*100)}%`:self?.stunImmunityRemainingMs?`STUN IMMUNITY ${(self.stunImmunityRemainingMs/1000).toFixed(1)}s`:'';
  const life=self?`${snapshot.match.round}:${self.lifeGeneration}:${self.teleportSequence}`:'';
  const eligible=!!self&&!!inv&&!self.goldGunId&&self.status==='ALIVE'&&self.lifeState==='active'&&snapshot.match.state==='active';
  const candidates=eligible?[...(snapshot.loot?.pickups.filter(p=>p.kind==='weapon')??[]),...(snapshot.objectives?.pickups??[])].filter(p=>!(p.blockedId===self!.id&&snapshot.timeMs<(p.blockedUntilMs??0))):[];
  const distance=(p:{x:number;y:number})=>(p.x-self!.x)**2+(p.y-self!.y)**2;
  let nearest=candidates.filter(p=>distance(p)<=LOOT_CONFIG.pickupRadius**2).sort((a,b)=>distance(a)-distance(b)||a.id.localeCompare(b.id))[0];
  if(nearest)this.recent={id:nearest.id,timeMs:snapshot.timeMs,life};
  else if(this.recent?.life===life&&snapshot.timeMs-this.recent.timeMs<=LOOT_CONFIG.recentPickupMs)nearest=candidates.find(p=>p.id===this.recent!.id&&distance(p)<=LOOT_CONFIG.paddedPickupRadius**2)!;
  else this.recent=undefined;
  this.highlightedId=nearest?.id;prompt.hidden=!nearest;
  if(nearest){const weapon='kind' in nearest&&nearest.kind==='weapon'?nearest.weapon:undefined,name=weapon?`${weapon.rarity} ${WEAPONS[weapon.class].name}`:`GALAXY ${GALAXY_WEAPONS['galaxyType' in nearest&&nearest.galaxyType?nearest.galaxyType:'cryo'].name}`,color=weapon?RARITY_COLORS[weapon.rarity]:0xffc644;
   prompt.textContent=`[F] ${inv!.slots.includes(null)||!weapon?'PICK UP':'SWAP'} — ${name.toUpperCase()}`;prompt.style.color=`#${color.toString(16).padStart(6,'0')}`;
  }

 }
 render(camera:Phaser.Cameras.Scene2D.Camera,selfId:string){
  const g=this.graphics;g.clear();this.sprites.begin();for(const label of this.labels)label.setVisible(false);if(!this.snapshot||!selfId){if(hudOwner===this)for(const id of ['inventory-hud','swap-prompt','hud-stun'])document.getElementById(id)!.hidden=true;return;}
  const view=camera.worldView,time=this.snapshot.timeMs;let count=0;
  for(const p of this.snapshot.loot?.pickups??[]){if(p.x<view.x-70||p.y<view.y-70||p.x>view.right+70||p.y>view.bottom+70)continue;
   const y=p.y+Math.sin(time/650+p.x)*3,color=p.kind==='weapon'?RARITY_COLORS[p.weapon.rarity]:0x91d8ba;
   g.fillStyle(color,.12).fillCircle(p.x,y,36);g.lineStyle(1,color,.8).strokeCircle(p.x,y,36);
   if(p.kind==='weapon'){if(!this.sprites.draw(WEAPONS[p.weapon.class].assetId,p.x,y,68,Math.sin(time/1900+p.x)*.07))weaponGlyph(g,p.weapon.class,p.x,y,0,color,1.7);}
   else{const a=time/9000+p.x,c=Math.cos(a),s=Math.sin(a),line=(ax:number,ay:number,bx:number,by:number)=>g.lineBetween(p.x+ax*c-ay*s,y+ax*s+ay*c,p.x+bx*c-by*s,y+bx*s+by*c);g.lineStyle(2,color);line(-8,-6,8,-6);line(8,-6,8,6);line(8,6,-8,6);line(-8,6,-8,-6);line(-3,-4,-3,4);line(3,-4,3,4);}
   if(count<16){const label=this.labels[count++],text=p.kind==='weapon'?`${p.weapon.rarity} ${WEAPONS[p.weapon.class].name}`:`${AMMO_NAMES[p.ammoType]} ×${p.quantity}`;if(label.text!==text)label.setText(text);const hex=`#${color.toString(16).padStart(6,'0')}`;if(label.style.color!==hex)label.setColor(hex);const w=label.width/camera.zoom,h=label.height/camera.zoom,cy=y+40;let overlap=false;for(let i=0;i<count-1;i++){const other=this.labels[i];if(other.visible&&Math.abs(other.x-p.x)<(other.width/camera.zoom+w)/2+6&&Math.abs(other.y-cy)<(other.height/camera.zoom+h)/2+4){overlap=true;break;}}label.setPosition(p.x,cy).setScale(1/camera.zoom).setVisible(!overlap);}
  }
  for(const e of this.snapshot.effects??[]){const age=time-e.timeMs;if(age<0||age>400)continue;const factor=age/400,color=e.color??(e.kind==='explosion'?0xff985c:e.kind==='frost'?0x9eefff:e.kind==='burn'?0xff783a:0x9bafff);g.lineStyle(3*(1-factor),color,1-factor).strokeCircle(e.x,e.y,e.radius*(.2+.8*factor));}
 }
 destroy(){this.sprites.destroy();this.inventory.destroy();this.graphics.destroy();for(const l of this.labels)l.destroy();if(hudOwner===this){hudOwner=undefined;for(const id of ['inventory-hud','swap-prompt','hud-stun'])document.getElementById(id)!.hidden=true;}}
}
