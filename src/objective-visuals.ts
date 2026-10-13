import {WeaponSprites} from './weapon-assets';
import type Phaser from 'phaser';
import type {Snapshot} from '../shared/protocol';
import {CAPTURE_DURATION_MS} from '../shared/objectives';
import {SHIP_HITBOX_RADIUS} from '../shared/ship-geometry';
import {hasGoldGun,GALAXY_WEAPONS} from '../shared/weapons';
import {visibleCircle} from './visual/lighting';
import {objectiveArrow,type ObjectiveTarget} from './objective-presentation';
export const GOLD_COLOR=0xffc644;
const RING_COLORS={AVAILABLE:0x829ba7,CAPTURING:0x70f2ef,CONTESTED:0xff826e,GOLD_GUN_AVAILABLE:GOLD_COLOR};
const nearest=(a:ObjectiveTarget,b:ObjectiveTarget)=>a.distance-b.distance;
let hudOwner:ObjectiveVisuals|undefined;
export class ObjectiveVisuals {
 readonly rings:Phaser.GameObjects.Graphics;
 readonly gold:Phaser.GameObjects.Graphics;
 readonly arrows:Phaser.GameObjects.Graphics;
 private labels:Phaser.GameObjects.Text[];
 private targets:ObjectiveTarget[]=[];
 private arrowSlots=Array.from({length:8},()=>({x:0,y:0,angle:0}));
 private sprites:WeaponSprites;
 private snapshot:Snapshot|null=null;
 private arrival=0;
 private feedText='';
 private hudText='';
 private feed=document.getElementById('objective-feed')!;
 private hud=document.getElementById('capture-hud')!;
 private description=document.getElementById('capture-description')!;
 private bar=document.getElementById('capture-progress') as HTMLProgressElement;
 constructor(private scene:Phaser.Scene){
  hudOwner=this;this.sprites=new WeaponSprites(scene,4.7,48);
  this.rings=scene.add.graphics().setDepth(-9).setName('capture-rings');
  this.gold=scene.add.graphics().setDepth(4.5).setName('gold-guns');
  this.arrows=scene.add.graphics().setScrollFactor(0).setDepth(9).setName('objective-arrows');
  this.labels=Array.from({length:8},(_,i)=>scene.add.text(0,0,'',{fontSize:'11px',backgroundColor:'#080e1e',padding:{x:3,y:2}}).setScrollFactor(0).setDepth(9).setVisible(false).setName(`objective-arrow-${i}`));
  this.bar.max=CAPTURE_DURATION_MS;
 }
 accept(snapshot:Snapshot,selfId:string){
  this.snapshot=snapshot;this.arrival=performance.now();const state=snapshot.objectives;
  this.targets=state&&snapshot.match.state==='active'?[...state.pickups.map(p=>({id:p.id,kind:'gold' as const,x:p.x,y:p.y,radius:22,label:`${p.source==='drop'?'DROPPED ':''}${GALAXY_WEAPONS[p.galaxyType??'cryo'].name.toUpperCase()}`,distance:0,visible:false})),...state.planets.filter(p=>p.status==='CAPTURING'||p.status==='CONTESTED').map(p=>({id:p.id,kind:'capture' as const,x:p.x,y:p.y,radius:p.captureRadius,label:`${p.status==='CONTESTED'?'CONTESTED':'CAPTURE'} ${p.name}`,distance:0,visible:false}))]:[];
  this.updateHud(snapshot,selfId);
 }
 render(camera:Phaser.Cameras.Scene2D.Camera,now:number,selfId:string,ships:ReadonlyMap<string,{body:Phaser.GameObjects.Container}>){
  if(hudOwner!==this)return;
  this.rings.clear();this.gold.clear();this.sprites.begin();this.arrows.clear();for(const label of this.labels)label.setVisible(false);
  const snapshot=this.snapshot,state=snapshot?.objectives;if(!selfId||!snapshot||!state){this.hud.hidden=this.feed.hidden=true;return;}
  const view=camera.worldView,z=camera.zoom,w=this.scene.scale.width,h=this.scene.scale.height;
  const visualTime=snapshot.timeMs+Math.min(1000,Math.max(0,now-this.arrival));
  for(const p of state.planets){if(p.status==='CONSUMED')continue;if(!visibleCircle(view,p,p.captureRadius*1.08))continue;
   const active=p.status!=='AVAILABLE';this.rings.lineStyle((active?2:1)/z,RING_COLORS[p.status],active?.72:.3).strokeCircle(p.x,p.y,p.captureRadius);
  }
  for(const event of state.announcements){const age=visualTime-event.timeMs;if(event.kind!=='captured'&&event.kind!=='consumed'||age<0||age>1000)continue;const p=state.planets.find(p=>p.id===event.planetId);if(p&&visibleCircle(view,p,p.captureRadius*1.1)){this.rings.lineStyle(3/z,GOLD_COLOR,(1-age/1000)*.8).strokeCircle(p.x,p.y,p.captureRadius*(1+age/10000));this.rings.fillStyle(GOLD_COLOR,(1-age/1000)*.08).fillCircle(p.x,p.y,p.radius);}}
  for(const p of state.pickups){if(!visibleCircle(view,p,28))continue;
   const y=p.y+2*Math.sin(visualTime*.003);this.gold.fillStyle(GOLD_COLOR,.15).fillCircle(p.x,y,21).lineStyle(1,0xffe5a0,.65).strokeCircle(p.x,y,19);if(!this.sprites.draw(GALAXY_WEAPONS[p.galaxyType??'cryo'].assetId,p.x,y,76))this.gun(p.x,y,0);
  }
  for(const p of snapshot.players){const body=ships.get(p.id)?.body;if(body&&(p.slowRemainingMs||p.burnRemainingMs)){this.gold.lineStyle(1.5/z,p.slowRemainingMs?0x9eefff:0xff783a,.8).strokeCircle(body.x,body.y,SHIP_HITBOX_RADIUS+9);}
   if(!hasGoldGun(p)||p.lifeState!=='active'||p.health<=0)continue;if(!body)continue;
   this.gold.lineStyle(2/z,GOLD_COLOR,.88).strokeCircle(body.x,body.y,SHIP_HITBOX_RADIUS+4).fillStyle(GOLD_COLOR,.07).fillCircle(body.x,body.y,SHIP_HITBOX_RADIUS+5);
   const kind=GALAXY_WEAPONS[p.galaxyType??'cryo'];this.gold.lineStyle(1/z,kind.color,.8).strokeCircle(body.x,body.y,SHIP_HITBOX_RADIUS+8);
   if(!this.sprites.draw(kind.assetId,body.x+Math.cos(body.rotation)*23,body.y+Math.sin(body.rotation)*23,30,body.rotation))this.gun(body.x+Math.cos(body.rotation)*21,body.y+Math.sin(body.rotation)*21,body.rotation);
  }
  this.arrows.setScale(1/z).setPosition(w*.5*(1-1/z),h*.5*(1-1/z));
  for(const target of this.targets){target.visible=visibleCircle(view,target,target.radius);target.distance=(target.x-view.centerX)**2+(target.y-view.centerY)**2;}
  this.targets.sort(nearest);let shown=0;
  for(const target of this.targets){if(target.visible||shown===this.labels.length)continue;
   const p=objectiveArrow(target,view,z,w,h,45,this.arrowSlots[shown]),color=target.kind==='gold'?GOLD_COLOR:0x70f2ef;
   // Keep right/top objectives clear of the existing minimap and ammo HUD.
   if(p.x>w-200&&p.y<260)p.x=w-210;
   p.y=Math.max(90,Math.min(h-110,p.y));
   for(let attempt=0;attempt<8&&this.overlapsArrow(p.x,p.y,shown);attempt++)p.y=p.y+28>h-110?90:p.y+28;
   this.arrowSlots[shown].x=p.x;this.arrowSlots[shown].y=p.y;
   const angle=Math.atan2(h/2+(target.y-view.centerY)*z-p.y,w/2+(target.x-view.centerX)*z-p.x),cos=Math.cos(angle),sin=Math.sin(angle);
   this.arrows.lineStyle(2,0x02050d,1).fillStyle(color,.95).fillTriangle(p.x+cos*9,p.y+sin*9,p.x-cos*7-sin*6,p.y-sin*7+cos*6,p.x-cos*7+sin*6,p.y-sin*7-cos*6);
   const label=this.labels[shown++];if(label.text!==target.label)label.setText(target.label);const ink=target.kind==='gold'?'#ffe18a':'#85f4f0';if(label.style.color!==ink)label.setColor(ink);label.setOrigin(p.x>w/2?1:0,.5).setScale(1/z).setPosition(w/2+(p.x+(p.x>w/2?-13:13)-w/2)/z,h/2+(p.y-h/2)/z).setVisible(true);
  }
 }
 private updateHud(snapshot:Snapshot,selfId:string){
  if(hudOwner!==this)return;const state=snapshot.objectives;if(!state||!selfId){this.hud.hidden=this.feed.hidden=true;return;}
  const recent=state.announcements.filter(a=>snapshot.timeMs-a.timeMs<=6000).slice(-3).map(a=>a.text).join('\n');if(recent!==this.feedText){this.feed.textContent=recent;this.feedText=recent;}this.feed.hidden=!recent;
  const local=snapshot.players.find(p=>p.id===selfId);
  if(!local||local.status!=='ALIVE'||local.lifeState!=='active'||snapshot.match.state!=='active'){this.hud.hidden=true;return;}
  const zone=state.planets.find(p=>p.occupants.includes(selfId))??state.planets.find(p=>p.progress.some(r=>r.participantId===selfId&&r.progressMs>0&&!r.completed));
  if(!zone){this.hud.hidden=true;return;}
  const progress=zone.progress.find(p=>p.participantId===selfId),ms=progress?.progressMs??0,inside=zone.occupants.includes(selfId);
  const status=zone.status==='CONTESTED'&&inside?'CONTESTED — CAPTURE PAUSED':progress?.completed?'CAPTURE COMPLETE · ONCE PER MATCH':zone.status==='GOLD_GUN_AVAILABLE'&&inside?'GALAXY GUN AVAILABLE':inside?'CAPTURING':'OUTSIDE — PROGRESS DECAYING';
  const text=`${zone.name} · ${status}\n${(ms/1000).toFixed(1)} / ${(CAPTURE_DURATION_MS/1000).toFixed(0)} seconds`;if(text!==this.hudText){this.description.textContent=text;this.hudText=text;}this.bar.value=ms;this.hud.hidden=false;
 }

 private overlapsArrow(x:number,y:number,count:number){for(let i=0;i<count;i++)if(Math.abs(this.arrowSlots[i].x-x)<170&&Math.abs(this.arrowSlots[i].y-y)<27)return true;return false;}
 private gun(x:number,y:number,angle:number){
  const cos=Math.cos(angle),sin=Math.sin(angle),g=this.gold;
  g.lineStyle(7,0x040912,1).lineBetween(x-cos*10,y-sin*10,x+cos*13,y+sin*13);
  g.lineStyle(4,GOLD_COLOR,1).lineBetween(x-cos*10,y-sin*10,x+cos*13,y+sin*13);
  g.lineStyle(4,0xffe7a4,1).lineBetween(x-cos*4,y-sin*4,x-cos*4-sin*9,y-sin*4+cos*9);
 }
 destroy(){this.sprites.destroy();this.rings.destroy();this.gold.destroy();this.arrows.destroy();for(const label of this.labels)label.destroy();this.targets=[];if(hudOwner===this){hudOwner=undefined;this.hud.hidden=this.feed.hidden=true;this.feed.textContent='';this.description.textContent='';}}
}
