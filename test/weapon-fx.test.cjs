const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { WEAPONS } = load('src/weapons.ts');
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { Fighter } = load('src/Fighter.ts');
const { roleById } = load('src/roles.ts');
const { Fx } = load('src/fx.ts');

function graphics() {
  let calls = 0;
  const validate = (v) => {
    if (typeof v === 'number') assert.ok(Number.isFinite(v));
    else if (Array.isArray(v)) v.forEach(validate);
    else if (v && typeof v === 'object') Object.values(v).forEach(validate);
  };
  const g = new Proxy({}, { get: (_, method) => (...args) => {
    args.forEach(validate); calls++;
    if (method === 'lineStyle') assert.ok(args[0] >= 0, 'negative line width');
    if (['lineStyle', 'fillStyle'].includes(method) && args.length > (method === 'lineStyle' ? 2 : 1)) {
      const alpha = args.at(-1); assert.ok(alpha >= 0 && alpha <= 1, `invalid alpha ${alpha}`);
    }
    return g;
  } });
  return { g, calls: () => calls };
}

for (const weapon of WEAPONS) test(`${weapon.id}: the actual battle effect draws safely, stays bounded in count, and expires`, () => {
  const before = JSON.stringify(WEAPONS);
  const scene = new BattleScene(), { g, calls } = graphics();
  const fighter = { x: 300, y: 300, facing: -0.4, color: 0xc4a777, weapon };
  scene.weaponFx(fighter);
  assert.ok(scene.fx.effects.length > 0);
  assert.ok(scene.fx.effects.length <= 12);
  assert.ok(scene.fx.particles.length <= 100);
  for (let frame = 0; frame < 140; frame++) {
    fighter.x += 0.5; fighter.y += 0.1; // moving weapons must also draw correctly
    scene.fx.draw(g, g, g); scene.fx.update(1 / 60);
  }
  assert.ok(calls() > 20);
  assert.equal(scene.fx.effects.length, 0);
  assert.equal(scene.fx.particles.length, 0);
  const after = calls(); scene.fx.draw(g, g, g);
  assert.equal(calls(), after);
  assert.equal(JSON.stringify(WEAPONS), before, 'visuals must not mutate weapon balance or shapes');
});

test('throwing weapon glints wait on the scene clock and do not require browser timers', () => {
  for (const method of ['shurikenThrow', 'kunaiVolley']) {
    const fx = new Fx();
    if (method === 'shurikenThrow') fx.shurikenThrow(0, 0, 0, 18, 200, 0xffffff);
    else fx.kunaiVolley(0, 0, [-0.2, 0, 0.2], 18, 160, 0xffffff);
    const early = graphics(); fx.draw(early.g, early.g, early.g);
    const arrivals = fx.effects.filter((e) => e.layer === 'glow');
    assert.ok(arrivals.length > 0);
    const dark = graphics(); arrivals.forEach((e) => e.draw(dark.g, 0));
    assert.equal(dark.calls(), 0);
    // Nothing advances while the game's update is paused.
    assert.ok(arrivals.every((e) => e.age === 0));
    fx.update(0.2);
    const lit = graphics(); arrivals.forEach((e) => e.draw(lit.g, e.age / e.life));
    assert.ok(lit.calls() > 0);
    fx.update(0.2);
    assert.equal(fx.effects.length, 0);
  }
});

test('weapon-specific hit accents fire once for actual damage, and skip blocked or invulnerable targets', () => {
  for (const state of ['hit', 'blocked', 'untouchable']) {
    const scene = new BattleScene(); scene.init({ mode: 'team', slots: [] });
    const make = (index, team, x) => {
      const body = { center: { x, y: 300 }, velocity: { x: 0, y: 0 } };
      const f = new Fighter(index, 0xffffff, WEAPONS.find((w) => w.id === 'daggers'), [], roleById('ronin'), {}, body, {});
      f.team = team; return f;
    };
    const from = make(0, 0, 300), target = make(1, 1, 350);
    if (state === 'untouchable') target.state = 'casting';
    scene.fighters = [from, target];
    const accents = [];
    scene.fx = { weaponImpact: (...args) => accents.push(args) };
    scene.dealDamage = () => { if (state === 'hit') target.stats.taken += 8; };
    scene.onSwingActive(from); scene.onSwingActive(from);
    assert.equal(accents.length, state === 'hit' ? 1 : 0);
    if (accents.length) assert.equal(accents[0][0], 'daggers');
  }
});

test('all impact families draw finite geometry and release their effects', () => {
  const fx = new Fx(), { g, calls } = graphics();
  for (const weapon of WEAPONS) fx.weaponImpact(weapon.id, 300, 300, 0.4, 0x9fbcdc);
  for (let i = 0; i < 60; i++) { fx.draw(g, g, g); fx.update(1 / 60); }
  assert.ok(calls() > 100);
  assert.equal(fx.effects.length, 0); assert.equal(fx.particles.length, 0);
});
