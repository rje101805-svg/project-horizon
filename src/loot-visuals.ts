import Phaser from 'phaser';
import {activeWeapon,WEAPONS,RARITY_COLORS,AMMO_NAMES,type WeaponClass} from '../shared/weapons';
import {LOOT_CONFIG,type LootPickup} from '../shared/loot';
import type {Snapshot} from '../shared/protocol';
import {weaponGlyph} from './weapon-visuals';
let hudOwner:LootVisuals|undefined;
export class LootVisuals {
 readonly graphics:Phaser.GameObjects.Graphics;private snapshot?:Snapshot;private labels:Phaser.GameObjects.Text[]=[];
 constructor(private scene:Phaser.Scene){this.graphics=scene.add.graphics().setDepth(4.4);for(let i=0;i<16;i++)this.labels.push(scene.add.text(0,0,'',{fontFamily:'monospace',fontSize:'11px',backgroundColor:'#07101ddd'}).setOrigin(.5).setDepth(8).setVisible(false));hudOwner=this;}
 accept(snapshot:Snapshot,selfId:string){this.snapshot=snapshot;const self=snapshot.players.find(p=>p.id===selfId),inv=self?.inventory;
  if(hudOwner!==this)return;
  const hud=document.getElementById('inventory-hud')!,prompt=document.getElementById('swap-prompt')!,stun=document.getElementById('hud-stun')!;
  hud.hidden=!self||self.status!=='ALIVE'||self.lifeState!=='active';
  const lines=inv?.slots.map((w,i)=>`${i===inv.activeSlot?'▶':'·'} ${i+1} ${w?w.rarity+' '+WEAPONS[w.class].name:'EMPTY'}`).join('\n')??'';
  const content=self?.goldGunId?'GALAXY GUN · REGULAR SLOTS DISABLED':lines+(self?.isReloading?`\nRELOADING ${(self.reloadRemainingMs/1000).toFixed(1)}s`:'');if(hud.textContent!==content)hud.textContent=content;
  stun.hidden=!(self?.stunRemainingMs||self?.stunImmunityRemainingMs);stun.textContent=self?.stunRemainingMs?`STUNNED ${(self.stunRemainingMs/1000).toFixed(1)}s`:self?.stunImmunityRemainingMs?`STUN IMMUNITY ${(self.stunImmunityRemainingMs/1000).toFixed(1)}s`:'';
  const nearest=self&&inv&&!self.goldGunId&&self.status==='ALIVE'&&self.lifeState==='active'&&snapshot.match.state==='active'&&!inv.slots.includes(null)?snapshot.loot?.pickups.filter((p):p is LootPickup&{kind:'weapon'}=>p.kind==='weapon'&&!(p.blockedId===self.id&&snapshot.timeMs<(p.blockedUntilMs??0))&&(p.x-self.x)**2+(p.y-self.y)**2<=LOOT_CONFIG.pickupRadius**2).sort((a,b)=>(a.x-self.x)**2+(a.y-self.y)**2-((b.x-self.x)**2+(b.y-self.y)**2)||a.id.localeCompare(b.id))[0]:undefined;
  prompt.hidden=!nearest;if(nearest)prompt.textContent=`F — SWAP FOR ${nearest.weapon.rarity} ${WEAPONS[nearest.weapon.class].name.toUpperCase()}`;
 }
 render(camera:Phaser.Cameras.Scene2D.Camera,selfId:string){
  const g=this.graphics;g.clear();for(const label of this.labels)label.setVisible(false);if(!this.snapshot||!selfId){if(hudOwner===this)for(const id of ['inventory-hud','swap-prompt','hud-stun'])document.getElementById(id)!.hidden=true;return;}
  const view=camera.worldView,time=this.snapshot.timeMs;let count=0;
  for(const p of this.snapshot.loot?.pickups??[]){if(p.x<view.x-35||p.y<view.y-35||p.x>view.right+35||p.y>view.bottom+35)continue;
   const y=p.y+Math.sin(time/650+p.x)*3,color=p.kind==='weapon'?RARITY_COLORS[p.weapon.rarity]:0x91d8ba;
   g.fillStyle(color,.12).fillCircle(p.x,y,23);g.lineStyle(1,color,.8).strokeCircle(p.x,y,23);
   if(p.kind==='weapon')weaponGlyph(g,p.weapon.class,p.x,y,time/9000+p.x,color);
   else{const a=time/9000+p.x,c=Math.cos(a),s=Math.sin(a),line=(ax:number,ay:number,bx:number,by:number)=>g.lineBetween(p.x+ax*c-ay*s,y+ax*s+ay*c,p.x+bx*c-by*s,y+bx*s+by*c);g.lineStyle(2,color);line(-8,-6,8,-6);line(8,-6,8,6);line(8,6,-8,6);line(-8,6,-8,-6);line(-3,-4,-3,4);line(3,-4,3,4);}
   if(count<16){const label=this.labels[count++],text=p.kind==='weapon'?`${p.weapon.rarity} ${WEAPONS[p.weapon.class].name}`:`${AMMO_NAMES[p.ammoType]} ×${p.quantity}`;if(label.text!==text)label.setText(text);const hex=`#${color.toString(16).padStart(6,'0')}`;if(label.style.color!==hex)label.setColor(hex);const w=label.width/camera.zoom,h=label.height/camera.zoom,cy=y+28;let overlap=false;for(let i=0;i<count-1;i++){const other=this.labels[i];if(other.visible&&Math.abs(other.x-p.x)<(other.width/camera.zoom+w)/2+6&&Math.abs(other.y-cy)<(other.height/camera.zoom+h)/2+4){overlap=true;break;}}label.setPosition(p.x,cy).setScale(1/camera.zoom).setVisible(!overlap);}
  }
  for(const e of this.snapshot.effects??[]){const age=time-e.timeMs;if(age<0||age>400)continue;const factor=age/400,color=e.kind==='explosion'?0xff985c:0x9bafff;g.lineStyle(3*(1-factor),color,1-factor).strokeCircle(e.x,e.y,e.radius*(.2+.8*factor));}
 }
 destroy(){this.graphics.destroy();for(const l of this.labels)l.destroy();if(hudOwner===this){hudOwner=undefined;for(const id of ['inventory-hud','swap-prompt','hud-stun'])document.getElementById(id)!.hidden=true;}}
}
