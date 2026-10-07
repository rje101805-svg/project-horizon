import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Phaser from 'phaser';
import { initialCombatState } from '../shared/combat';
import { RoomStore } from '../server/rooms';
import { fire, advanceProjectiles } from '../server/projectiles';
import { parseProjectileHit, type ProjectileHit } from '../shared/hit-feedback';
import { combatPresentation, HIT_FEEDBACK_LIFETIME_MS, MAX_HIT_FEEDBACK, SHIELD_COLOR, LOW_HEALTH_COLOR } from '../src/combat-presentation';
import { HitFeedback } from '../src/hit-feedback';
import { ShipCombatHud } from '../src/ship-combat-hud';
import { DamageNumbers } from '../src/damage-numbers';

function fixture() {
  const store = new RoomStore(); store.create('a', 'A', 0); const room = store.roomFor('a')!; store.join('b', room.code, 'B', 0);
  const a = room.players.get('a')!, b = room.players.get('b')!;
  Object.assign(a.state, { x: 200, y: 1800 }); Object.assign(b.state, { x: 270, y: 1800, shield: 10 });
  fire(room, a, { sequence: 1, aim: 0, lifeGeneration: 0, teleportSequence: 0 }, 0);
  let hit!: ProjectileHit; advanceProjectiles(room, h => hit = h, 1);
  return { a, b, hit, snapshot: { tick: 1, timeMs: 1000 / 30, roomCode: room.code, blackHole: { ...room.blackHole },
    players: [{ ...a.state }, { ...b.state }], survivingHumans: 1, projectiles: [] } };
}
test('combat HUD uses independent authoritative ratios and inclusive centralized warning thresholds', () => {
  const s = initialCombatState(), before = structuredClone(s); assert.equal(combatPresentation(s).shield, 1);
  assert.equal(combatPresentation(s).health, 1); assert.equal(combatPresentation(s).lowAmmo, false); assert.deepEqual(s, before);
  s.shield = 0; s.health = 26; s.ammo = 4;
  let p = combatPresentation(s); assert.equal(p.shield, 0); assert.equal(p.health, .26); assert.equal(p.lowHealth, false); assert.equal(p.lowAmmo, false);
  s.health = 25; s.ammo = 3; p = combatPresentation(s); assert.equal(p.lowHealth, true); assert.equal(p.lowAmmo, true);
  s.ammo = 0; s.health = 0; p = combatPresentation(s); assert.equal(p.lowAmmo, true); assert.equal(p.lowHealth, true);
  s.ammo = 12; s.health = 100; p = combatPresentation(s); assert.equal(p.lowAmmo, false); assert.equal(p.lowHealth, false);
});

function renderingFixture() {
  const graphics = {
    x: 0, y: 0, visible: false, clears: 0, color: 0, outlines: [] as {color:number;width:number}[],
    setName() { return this; }, setDepth() { return this; },
    setVisible(v: boolean) { this.visible = v; return this; }, setPosition(x:number,y:number) { this.x=x;this.y=y;return this; },
    clear() { this.clears++; this.outlines=[]; return this; }, fillStyle(c:number) { this.color=c;return this; },
    lineStyle(_w:number,c:number) { this.color=c;return this; }, fillRect() { return this; },
    strokeRect(_x:number,_y:number,w:number) { this.outlines.push({color:this.color,width:w});return this; },
  };
  const texts: { text: string; x:number; y:number; color:string; name:string; destroyed:boolean }[] = [];
  const scene = { add: { graphics: () => graphics, text: (x:number,y:number,text:string,style:{color:string}) => {
    const object = { x,y,text,color:style.color,name:'',destroyed:false,
      setOrigin() { return this; }, setDepth() { return this; }, setName(name:string) { this.name=name;return this; },
      destroy() { this.destroyed=true; } };
    texts.push(object); return object;
  } } } as unknown as Phaser.Scene;
  return { scene, graphics, texts };
}
test('local graphics retain zero-shield outline, follow ship, warn on low health and only redraw changed pixels', () => {
  const { a } = fixture(), { scene, graphics } = renderingFixture(), bars = new ShipCombatHud(scene);
  Object.assign(a.state, { shield: 0, health: 25 }); bars.accept(a.state, 0); bars.render(300,400,0);
  assert.equal(graphics.visible, true); assert.equal(graphics.x, 264); assert.equal(graphics.y, 345);
  assert.ok(graphics.outlines.some(o => o.color === SHIELD_COLOR && o.width === 72));
  assert.ok(graphics.outlines.some(o => o.color === LOW_HEALTH_COLOR));
  assert.equal(bars.presentation!.shield, 0); assert.equal(bars.presentation!.health, .25);
  const redraws = graphics.clears; bars.render(320,450,16); assert.equal(graphics.clears, redraws); assert.equal(graphics.x, 284);
  a.state.lifeState = 'dead'; bars.accept(a.state,32); bars.render(320,450,32); assert.equal(graphics.visible, false);
});
test('reload visual progresses smoothly but stays active until authoritative completion and never mutates state', () => {
  const { a } = fixture(), { scene, graphics } = renderingFixture(), bars = new ShipCombatHud(scene);
  Object.assign(a.state, { isReloading:true, reloadProgress:0, reloadRemainingMs:1500 }); const before = structuredClone(a.state);
  bars.accept(a.state,0); bars.render(200,1800,0); const start = graphics.clears;
  bars.render(200,1800,750); assert.ok(graphics.clears > start); assert.equal(graphics.outlines.length,3);
  bars.render(200,1800,10000); assert.equal(bars.presentation!.reloading,true); assert.equal(graphics.outlines.length,3); assert.deepEqual(a.state,before);
  Object.assign(a.state, { isReloading:false,reloadProgress:1,reloadRemainingMs:0 }); bars.accept(a.state,10001); bars.render(200,1800,10001);
  assert.equal(graphics.outlines.length,2); assert.equal(bars.presentation!.reloading,false);
});
test('hit model validates server receipts, owner/session/lifecycle and target identity without mutating snapshots', () => {
  const { hit, snapshot } = fixture(), model = new HitFeedback(), before = structuredClone(snapshot);
  assert.ok(parseProjectileHit(hit));
  for (const bad of [null,{}, { ...hit,healthDamage:Infinity }, { ...hit,shieldDamage:-1 }, { ...hit,x:-1 },
    { ...hit,shieldDamage:0,healthDamage:0 }, { ...hit,healthDamage:9999 }, { ...hit,targetId:hit.ownerId }]) assert.equal(parseProjectileHit(bad),null);
  for (const bad of [{ ...hit,ownerId:'b' }, { ...hit,ownerSession:'other' }, { ...hit,lifeGeneration:1 },
    { ...hit,teleportSequence:1 }, { ...hit,roomCode:'OTHER' }, { ...hit,targetSession:'old' }]) assert.equal(model.add(bad,snapshot,'a',0),false);
  assert.equal(model.add(hit,snapshot,'a',0),true); assert.equal(model.add(hit,snapshot,'a',1),false);
  assert.deepEqual(snapshot,before); assert.equal(model.sample(1).length,1);
  const later = structuredClone(snapshot); later.players[1].lifeGeneration++; model.reconcile(later,'a'); assert.equal(model.sample(2).length,0);
  model.clear(); const oldSession = structuredClone(snapshot); oldSession.players[0].reloadSession='new'; assert.equal(model.add(hit,oldSession,'a',3),false);
});
test('separate rapid hits use distinct slots, split numbers stay separate, expiry destroys actual text objects', () => {
  const { hit,snapshot } = fixture(), model = new HitFeedback(), { scene,texts } = renderingFixture(), numbers = new DamageNumbers(scene);
  assert.equal(model.add(hit,snapshot,'a',0),true);
  assert.equal(model.add({ ...hit,projectileId:'next',shotSequence:2 },snapshot,'a',100),true);
  const active=model.sample(100); assert.deepEqual(active.map(v=>v.slot),[0,1]); numbers.render(active);
  assert.equal(numbers.objects.size,2); assert.equal(texts.length,4);
  assert.deepEqual(texts.map(t=>[t.text,t.color]),[['10','#65d9ff'],['15','#ffffff'],['10','#65d9ff'],['15','#ffffff']]);
  assert.notEqual(texts[0].x,texts[1].x); assert.notEqual(texts[0].y,texts[2].y);
  numbers.render(model.sample(HIT_FEEDBACK_LIFETIME_MS)); assert.equal(numbers.objects.size,1); assert.equal(texts[0].destroyed,true);
  numbers.render(model.sample(HIT_FEEDBACK_LIFETIME_MS+100)); assert.equal(numbers.objects.size,0); assert.ok(texts.every(t=>t.destroyed));
});
test('shield-only and health-only receipts each create just one correctly colored number', () => {
  const { hit,snapshot }=fixture(), model=new HitFeedback(), {scene,texts}=renderingFixture(), numbers=new DamageNumbers(scene);
  model.add({...hit,shieldDamage:25,healthDamage:0},snapshot,'a',0);
  model.add({...hit,projectileId:'health',shieldDamage:0,healthDamage:25},snapshot,'a',0);
  numbers.render(model.sample(0)); assert.deepEqual(texts.map(t=>[t.text,t.color]),[['25','#65d9ff'],['25','#ffffff']]);
});
test('sustained feedback stays bounded, expires, removes departed players and clears on disconnect', () => {
  const { hit,snapshot }=fixture(), model=new HitFeedback(), {scene}=renderingFixture(), numbers=new DamageNumbers(scene);
  for(let n=0;n<1000;n++) {
    model.add({...hit,projectileId:`bullet-${n}`,shotSequence:n+1},snapshot,'a',n);
    const active=model.sample(n); assert.ok(active.length<=MAX_HIT_FEEDBACK); numbers.render(active); assert.ok(numbers.objects.size<=MAX_HIT_FEEDBACK);
  }
  assert.ok((model as unknown as {seen:Set<string>}).seen.size<=MAX_HIT_FEEDBACK*4);
  numbers.render(model.sample(2000)); assert.equal(numbers.objects.size,0);
  model.add({...hit,projectileId:'last'},snapshot,'a',2001); model.removeMissing(['a']); assert.equal(model.sample(2001).length,0);
  model.clear(); numbers.clear(); assert.equal(model.sample(2002).length,0);
});
