// Draft cards carry a mark and a meter so the three choices read apart at a glance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/state.js';
import {draftPower} from '../src/ui/build-panel.js';

function tower(type) {
  return {id: `tower:${type}`, kind: 'tower', type, replace: false, rank: 1};
}

function hero(id, cap = 4) {
  return {id: `hero_upgrade:${id}`, kind: 'hero_upgrade', upgradeId: id, replace: false, cap, nextLevel: 1};
}

function fills(power) {
  return Object.fromEntries(power.bars.map((bar) => [bar.key, bar.fill]));
}

test('tower meters separate damage, attack speed, range, and role', () => {
  const state = createRun({seed: 3, difficulty: 'normal', runId: 'draft-meters'});
  const bolt = draftPower(state, tower('bolt'), 'en');
  const fire = draftPower(state, tower('fire'), 'en');
  const frost = draftPower(state, tower('frost'), 'zh');
  const lightning = draftPower(state, tower('lightning'), 'zh');
  const poison = draftPower(state, tower('poison'), 'en');
  const support = draftPower(state, tower('support'), 'zh');
  for (const power of [bolt, fire, frost, lightning, poison, support]) {
    assert.deepEqual(power.bars.map((bar) => bar.key), ['damage', 'speed', 'range']);
  }
  const boltFill = fills(bolt);
  const fireFill = fills(fire);
  assert.ok(boltFill.damage > fireFill.damage);
  assert.ok(boltFill.speed > fireFill.speed);
  assert.ok(fills(lightning).range > boltFill.range);
  assert.ok(fills(poison).damage < fills(frost).damage);
  assert.equal(bolt.label, 'Shot');
  assert.equal(fire.label, 'Burn');
  assert.equal(frost.label, '减速');
  assert.equal(lightning.label, '连锁');
  assert.equal(support.label, '光环');
  assert.equal(bolt.bars[0].caption, 'Dmg');
  assert.equal(frost.bars[2].caption, '距');
  const signatures = [bolt, fire, frost, lightning, poison, support].map((power) => power.bars.map((bar) => bar.fill).join(','));
  assert.equal(new Set(signatures).size, signatures.length);
});

test('hero meters emphasize the stat that upgrade changes', () => {
  const state = createRun({seed: 4, difficulty: 'normal', runId: 'draft-hero-meters'});
  const strike = draftPower(state, hero('strike'), 'zh');
  const cadence = draftPower(state, hero('cadence'), 'en');
  const reach = draftPower(state, hero('reach', 3), 'zh');
  const focus = draftPower(state, hero('focus'), 'en');
  const lethality = draftPower(state, hero('lethality', 3), 'zh');
  const pierce = draftPower(state, hero('pierce', 2), 'en');
  const barbed = draftPower(state, hero('barbed', 3), 'zh');
  assert.ok(fills(strike).damage > fills(strike).speed);
  assert.ok(fills(cadence).speed > fills(cadence).damage);
  assert.ok(fills(reach).range > fills(reach).damage);
  assert.deepEqual(focus.bars.map((bar) => bar.key), ['crit']);
  assert.deepEqual(lethality.bars.map((bar) => bar.key), ['critDamage']);
  assert.deepEqual(pierce.bars.map((bar) => bar.key), ['pierce']);
  assert.deepEqual(barbed.bars.map((bar) => bar.key), ['poison']);
  assert.equal(strike.label, '伤害');
  assert.equal(cadence.label, 'Speed');
  assert.equal(reach.label, '射程');
  assert.equal(focus.label, 'Crit');
  assert.equal(lethality.label, '暴伤');
  assert.equal(barbed.bars[0].caption, '毒');
  for (const power of [strike, cadence, reach, focus, lethality, pierce, barbed]) {
    assert.equal(power.label.includes('strike'), false);
    assert.equal(power.label.includes('cadence'), false);
  }
});
