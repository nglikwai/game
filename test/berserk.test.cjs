const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { Fighter } = load('src/gameplay/Fighter.ts');
const { roleById } = load('src/gameplay/roles.ts');
const { WEAPONS, shapeArea, shapeReach, scaleShape, rageWeapon } = load('src/gameplay/weapons.ts');
const { SKILLS } = load('src/gameplay/skills.ts');
const { SOUL_RAGE, SOUL_PER_LEVEL } = load('src/config/index.ts');
const { emptyIntent } = load('src/input/contracts.ts');

function fighter(controller = { labels: [] }, weapon = WEAPONS.find((w) => w.id === 'fan')) {
  const body = { center: { x: 300, y: 300 }, velocity: { x: 0, y: 0 }, enable: true, setVelocity() {}, reset(x, y) { this.center = { x: x + 18, y: y + 18 }; } };
  const f = new Fighter(0, 0xffffff, weapon, [], roleById('ronin'), controller, body, {
    spawnProjectile() {}, inTowerAura: () => false, hazardSlow: () => 1, terrainAt: () => null, windAt: () => null, popText() {},
    onSubstitute() {}, onPillRevived() {},
  });
  f.team = 0;
  return f;
}

/** Hold the next-item button for `seconds`. */
function hold(f, seconds, step = 0.05) {
  for (let t = 0; t < seconds - 1e-9; t += step) f.update(step, { ...emptyIntent(), nextItemHeld: true });
}

test('holding next item for the hold time with 魂 enters 暴走 at the level spent; a tap or no 魂 does nothing', () => {
  const f = fighter();
  f.pe = 10;
  hold(f, 0.3);
  assert.equal(f.raging, false, 'no 魂 yet');
  f.soul = SOUL_PER_LEVEL * 2 + 5;
  hold(f, SOUL_RAGE.hold / 2);
  f.update(0.05, emptyIntent()); // let go early
  hold(f, SOUL_RAGE.hold / 2);
  assert.equal(f.raging, false, 'a released hold starts over');
  hold(f, SOUL_RAGE.hold + 0.05);
  assert.equal(f.raging, true);
  assert.equal(f.rageLevel, 2);
  assert.equal(f.soul, 5, 'every full level is spent');
  assert.equal(f.pe, f.maxPe, 'PE refills');
  assert.ok(f.rageT <= SOUL_RAGE.duration[1] && f.rageT > SOUL_RAGE.duration[1] - 0.5);
});

test('CPUs and bosses never enter 暴走, and humans always show the 魂 meter', () => {
  const cpu = fighter({ labels: [], cpu: true });
  cpu.soul = SOUL_PER_LEVEL * 4;
  hold(cpu, 1);
  assert.equal(cpu.raging, false);
  assert.equal(cpu.usesSoul, false);
  const boss = fighter();
  boss.boss = true; boss.soul = SOUL_PER_LEVEL * 4;
  hold(boss, 1);
  assert.equal(boss.raging, false);
  assert.equal(fighter().usesSoul, true);
  assert.equal(SKILLS.some((s) => s.effect.kind === 'soulRage'), false, 'not a skill to equip');
});

test('every buff grows with the level, and the weapon swings faster over a wider area until it wears off', () => {
  let previous = null;
  for (let level = 1; level <= 4; level++) {
    const f = fighter();
    const base = f.weapon;
    const before = { damage: f.damageMult, taken: f.damageTaken };
    f.soul = SOUL_PER_LEVEL * level;
    hold(f, SOUL_RAGE.hold + 0.05);
    assert.equal(f.rageLevel, level);
    const now = {
      damage: f.damageMult / before.damage, taken: f.damageTaken / before.taken,
      area: shapeArea(f.weapon.shape) / shapeArea(base.shape), cycle: f.weapon.cycle / base.cycle, speed: f.rage('speed'),
      knock: f.rage('knockbackTaken'), duration: SOUL_RAGE.duration[level - 1],
    };
    assert.ok(Math.abs(now.damage - SOUL_RAGE.damage[level - 1]) < 1e-9);
    assert.ok(Math.abs(now.area - SOUL_RAGE.area[level - 1]) < 1e-6);
    assert.ok(Math.abs(now.cycle - SOUL_RAGE.swing[level - 1]) < 1e-9);
    if (previous) {
      assert.ok(now.damage > previous.damage && now.taken < previous.taken && now.area > previous.area);
      assert.ok(now.cycle < previous.cycle && now.speed > previous.speed && now.knock < previous.knock && now.duration > previous.duration);
    }
    previous = now;
    // Runs out: the original weapon comes back.
    for (let t = 0; t < now.duration + 0.5; t += 0.1) f.update(0.1, emptyIntent());
    assert.equal(f.raging, false);
    assert.equal(f.weapon, base);
    assert.equal(f.damageMult, before.damage);
  }
});

test('no 魂 is gained while raging, and falling ends it at once', () => {
  const f = fighter();
  f.soul = SOUL_PER_LEVEL;
  hold(f, SOUL_RAGE.hold + 0.05);
  f.addSoul(50);
  assert.equal(f.soul, 0);
  const base = f.weapon;
  f.takeHit(1000, 1, 0, 0, 0);
  assert.equal(f.alive, false);
  assert.equal(f.raging, false);
  assert.notEqual(f.weapon.cycle, rageWeapon(base, 1).cycle);
});

test('super armour from level 3: a hit no longer interrupts; level 2 still flinches; level 4 drinks weapon damage', () => {
  for (const [level, flinch] of [[2, true], [3, false]]) {
    const f = fighter();
    f.soul = SOUL_PER_LEVEL * level;
    hold(f, SOUL_RAGE.hold + 0.05);
    f.takeHit(10, 1, 0, 0, 0.3);
    assert.equal(f.state === 'stun', flinch, `level ${level}`);
  }
  const f = fighter();
  assert.equal(f.rageLifesteal, 0);
  f.soul = SOUL_PER_LEVEL * 4;
  hold(f, SOUL_RAGE.hold + 0.05);
  assert.equal(f.rageLifesteal, SOUL_RAGE.lifesteal);
});

test('scaling a shape scales lengths, not angles or counts', () => {
  for (const w of WEAPONS) {
    const big = scaleShape(w.shape, 1.5);
    assert.ok(Math.abs(shapeArea(big) / shapeArea(w.shape) - 2.25) < 0.02, w.id);
    assert.ok(shapeReach(big) > shapeReach(w.shape));
    for (const key of ['angle', 'spread', 'count', 'waves', 'curl', 'arms']) if (key in w.shape) assert.equal(big[key], w.shape[key]);
  }
});

test('the player super state lasts two seconds beyond its former duration at every soul level', () => {
  for (let level = 1; level <= 4; level++) {
    const f = fighter(); f.soul = level * SOUL_PER_LEVEL;
    hold(f, SOUL_RAGE.hold + .05);
    const formerDuration = 4 + level * 2;
    f.update(formerDuration + 1, emptyIntent());
    assert.equal(f.raging, true, `level ${level} should still have its extra time`);
    f.update(2, emptyIntent()); assert.equal(f.raging, false);
  }
});
