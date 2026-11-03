const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { WEAPONS, shapeReach } = load('src/gameplay/weapons.ts');
const { DAMAGE_PER_SEC, KNOCKBACK_PER_SEC } = load('src/config/index.ts');
const { Fighter } = load('src/gameplay/Fighter.ts');
const { roleById } = load('src/gameplay/roles.ts');
const { emptyIntent } = load('src/input/contracts.ts');

const byId = (id) => WEAPONS.find((w) => w.id === id);

test('weapons cost no PE and are balanced by area, speed and damage instead', () => {
  for (const w of WEAPONS) {
    assert.equal(w.peCost, undefined);
    assert.ok(w.power >= 0.75 && w.power <= 1.35, w.id);
    assert.ok(Math.abs(w.damage - DAMAGE_PER_SEC * w.power * w.cycle) < 1e-9, w.id);
    assert.ok(Math.abs(w.knockback - KNOCKBACK_PER_SEC * w.cycle) < 1e-9, w.id);
  }
  // Long, safe reach hits softer than short, risky weapons.
  for (const far of ['shuriken', 'yari', 'kunai']) for (const near of ['hammer', 'nunchaku', 'spade', 'daggers']) {
    assert.ok(shapeReach(byId(far).shape) > shapeReach(byId(near).shape));
    assert.ok(byId(far).power < byId(near).power, `${far} vs ${near}`);
  }
});

test('a fighter with no PE can still swing', () => {
  const body = { center: { x: 200, y: 200 }, velocity: { x: 0, y: 0 }, enable: true, setVelocity() {}, reset() {} };
  const f = new Fighter(0, 0xffffff, byId('hammer'), [], roleById('ronin'), { labels: [] }, body, {
    spawnProjectile() {}, inTowerAura: () => false, hazardSlow: () => 1, terrainAt: () => null, windAt: () => null, popText() {},
  });
  f.pe = 0;
  f.update(0.016, { ...emptyIntent(), attack: true });
  assert.equal(f.state, 'windup');
});
