import {WEAPONS,GALAXY_WEAPONS,RARITY_COLORS,type WeaponInstance} from '../shared/weapons';
import type {PlayerState} from '../shared/protocol';
import type {InventoryCommand} from '../shared/loot';
import {weaponAssetUrl} from './weapon-assets';
// A focusable slot keeps DOM focus after a click; that must not lock flight.
export const inventoryInteracting=()=>owner?.interacting??false;
let owner:InventoryUI|undefined;
export class InventoryUI {
 private root=document.getElementById('inventory-hud')!;private slots:HTMLDivElement[]=[];private dragSlot:number|null=null;private self?:PlayerState;private signature='';private pointerActive=false;
 get interacting(){return this.pointerActive||this.dragSlot!==null;}
 constructor(private action:(action:InventoryCommand['action'],slot?:number,toSlot?:number)=>void,private release:()=>void){
  owner=this;this.root.replaceChildren();this.root.setAttribute('role','group');
  for(let i=0;i<3;i++){
   const slot=document.createElement('div');slot.className='weapon-slot';slot.dataset.slot=String(i);slot.tabIndex=0;slot.draggable=false;
   const image=document.createElement('img');image.alt='';image.draggable=false;image.onerror=()=>image.hidden=true;
   const label=document.createElement('span');label.className='weapon-slot-label';
   const drop=document.createElement('button');drop.type='button';drop.className='weapon-drop';drop.textContent='DROP';drop.setAttribute('aria-label',`Drop slot ${i+1}`);
   drop.addEventListener('click',e=>{e.stopPropagation();this.action('drop',i);});
   slot.append(image,label,drop);this.root.append(slot);this.slots.push(slot);
   slot.addEventListener('click',e=>{if((e.target as HTMLElement).closest('button'))return;if(this.self?.goldGunId)return;if(this.self?.inventory?.slots[i]&&this.self.inventory.activeSlot!==i)this.action('switch',i);});
   slot.addEventListener('keydown',e=>{if(e.code==='Enter'&&e.target===slot){e.preventDefault();slot.click();}});
   slot.addEventListener('dragstart',e=>{this.dragSlot=i;this.release();e.dataTransfer?.setData('text/plain',String(i));if(e.dataTransfer)e.dataTransfer.effectAllowed='move';});
   slot.addEventListener('dragover',e=>{if(this.dragSlot!==null){e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='move';}});
   slot.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();if(this.dragSlot!==null&&!this.self?.goldGunId)this.action('reorder',this.dragSlot,i);this.dragSlot=null;});
   slot.addEventListener('dragend',()=>{this.dragSlot=null;this.pointerActive=false;});
  }
  this.root.addEventListener('pointerdown',this.block);this.root.addEventListener('mousedown',this.block);this.root.addEventListener('mouseup',this.block);this.root.addEventListener('keydown',this.keyBlock);this.root.addEventListener('wheel',this.block,{passive:false});
  window.addEventListener('pointerup',this.finishPointer,true);window.addEventListener('pointercancel',this.finishPointer,true);window.addEventListener('mouseup',this.finishPointer,true);window.addEventListener('blur',this.finishPointer);
  document.addEventListener('dragover',this.outsideOver);document.addEventListener('drop',this.outsideDrop);
 }
 private finishPointer=(e:Event)=>{this.pointerActive=false;if(e.type==='blur')this.dragSlot=null;};
 private block=(e:Event)=>{if(e.type==='pointerdown'||e.type==='mousedown')this.pointerActive=true;else if(e.type==='mouseup')this.pointerActive=false;e.stopPropagation();if(e.type==='wheel')e.preventDefault();this.release();};
 private keyBlock=(e:KeyboardEvent)=>{
  // Space/Enter belong to the focused UI control. WASD, slot selection, F/G/R/E
  // and F3 keep reaching the existing game handlers after the gesture ends.
  if(e.code==='Space'||e.code==='Enter'){e.stopPropagation();if(e.code==='Space')e.preventDefault();}
 };
 private outsideOver=(e:DragEvent)=>{if(this.dragSlot!==null&&!this.root.contains(e.target as Node))e.preventDefault();};
 private outsideDrop=(e:DragEvent)=>{if(this.dragSlot===null)return;e.preventDefault();if(!this.root.contains(e.target as Node))this.action('drop',this.dragSlot);this.dragSlot=null;this.pointerActive=false;};
 accept(self:PlayerState|undefined){
  this.self=self;this.root.hidden=!self||self.status!=='ALIVE'||self.lifeState!=='active';if(!self)return;
  const inv=self.inventory,signature=JSON.stringify([inv,self.goldGunId,self.galaxyType,self.isReloading]);if(signature===this.signature)return;this.signature=signature;
  this.slots.forEach((slot,i)=>{
   const w=inv?.slots[i],galaxy=i===0&&!!self.goldGunId,type=GALAXY_WEAPONS[self.galaxyType??'cryo'],active=galaxy||!self.goldGunId&&inv?.activeSlot===i&&!!w;
   slot.hidden=!!self.goldGunId&&i>0;slot.draggable=galaxy||!!w;slot.classList.toggle('equipped',active);slot.style.borderColor=galaxy?'#ffc644':w?`#${RARITY_COLORS[w.rarity].toString(16)}`:'#43536d';
   const image=slot.querySelector('img')!;const asset=galaxy?type.assetId:w?WEAPONS[w.class].assetId:'';image.hidden=!asset;if(asset&&image.getAttribute('src')!==weaponAssetUrl(asset))image.src=weaponAssetUrl(asset);
   const text=galaxy?`GALAXY GUN · ${type.name}\n∞ AMMO · REGULAR SLOTS DISABLED`:w?`${i+1} ${w.rarity} ${WEAPONS[w.class].name}\n${w.magazine}/${w.capacity} · RESERVE ${inv!.reserve[WEAPONS[w.class].ammoType]}`:`${i+1} EMPTY`;
   slot.querySelector('span')!.textContent=(active?'▶ ':'')+text;slot.querySelector('button')!.hidden=!galaxy&&!w;
  });
 }
 destroy(){window.removeEventListener('pointerup',this.finishPointer,true);window.removeEventListener('pointercancel',this.finishPointer,true);window.removeEventListener('mouseup',this.finishPointer,true);window.removeEventListener('blur',this.finishPointer);document.removeEventListener('dragover',this.outsideOver);document.removeEventListener('drop',this.outsideDrop);this.root.removeEventListener('pointerdown',this.block);this.root.removeEventListener('mousedown',this.block);this.root.removeEventListener('mouseup',this.block);this.root.removeEventListener('keydown',this.keyBlock);this.root.removeEventListener('wheel',this.block);if(owner===this){owner=undefined;this.root.hidden=true;this.root.replaceChildren();}}
}
