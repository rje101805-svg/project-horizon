import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healthPresentation, SampleRate } from '../src/hud';
import { MAX_HEALTH } from '../shared/lifecycle';
test('HUD health presentation uses shared max, preserves authoritative values and clamps malformed visuals', () => {
  assert.deepEqual(healthPresentation(MAX_HEALTH), { value: MAX_HEALTH, max: MAX_HEALTH, text: `${MAX_HEALTH} / ${MAX_HEALTH}` });
  assert.equal(healthPresentation(73).value, 73); assert.equal(healthPresentation(0).text, `0 / ${MAX_HEALTH}`);
  assert.equal(healthPresentation(500).value, MAX_HEALTH);
  for (const value of [-5, NaN, Infinity, -Infinity, undefined, null, '100']) assert.equal(healthPresentation(value).value, 0);
});
test('FPS counter uses controlled frame events and elapsed time, not a fixed 60', () => {
  const rate = new SampleRate(0);
  for (let i = 0; i < 60; i++) rate.record();
  assert.equal(rate.sample(999), null); assert.equal(rate.sample(1000), 60);
  for (let i = 0; i < 24; i++) rate.record();
  assert.equal(rate.sample(2000), 24);
  for (let i = 0; i < 120; i++) rate.record();
  assert.equal(rate.sample(4000), 60); // two seconds, not an assumed one
});
test('snapshot rate reveals lower delivery and stops independently of configured tick target', () => {
  const rate = new SampleRate(100);
  for (let i = 0; i < 30; i++) rate.record();
  assert.equal(rate.sample(1100), 30);
  for (let i = 0; i < 18; i++) rate.record();
  assert.equal(rate.sample(2100), 18); assert.equal(rate.sample(3100), 0);
  rate.reset(4000); assert.equal(rate.sample(4500), null);
  for (let i = 0; i < 15; i++) rate.record();
  assert.equal(rate.sample(5000), 15);
});
test('rate ignores invalid/backward sample times and does not flicker between samples', () => {
  const rate = new SampleRate(100);
  rate.record(); assert.equal(rate.sample(NaN), null); assert.equal(rate.sample(0), null);
  assert.equal(rate.sample(1100), 1);
  for (let i = 0; i < 10; i++) rate.record();
  assert.equal(rate.sample(1500), 1); assert.equal(rate.sample(2100), 10);
});

test('rolling rendered FPS uses three bounded elapsed-time windows and resets between sessions',()=>{
 const rate=new SampleRate(0,3);for(let i=0;i<60;i++)rate.record();assert.equal(rate.sample(1000),60);
 for(let i=0;i<30;i++)rate.record();assert.equal(rate.sample(2000),45);
 for(let i=0;i<60;i++)rate.record();assert.equal(rate.sample(3000),50);
 for(let i=0;i<90;i++)rate.record();assert.equal(rate.sample(4000),60);
 rate.reset(5000);assert.equal(rate.sample(5999),null);for(let i=0;i<40;i++)rate.record();assert.equal(rate.sample(7000),20);
});
