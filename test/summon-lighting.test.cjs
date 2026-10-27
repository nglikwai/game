const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { Fx } = load('src/rendering/effects.ts');
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { SUMMON_LIGHT_RADIUS } = load('src/config/index.ts');
const { TREE_SUMMONS } = load('src/battle/quest/treeRules.ts');

function graphics() {
  const circles = [];
  const g = new Proxy({}, { get: (_o, method) => (...args) => {
    assert.ok(!['fillRect', 'fillRoundedRect'].includes(method), 'summon lighting must not draw a screen rectangle');
    if (method === 'fillCircle' || method === 'strokeCircle') circles.push(args);
    return g;
  } });
  return { g, circles };
}

test('summon charge lighting is bounded by a large circle centered on the caster', () => {
  const fx = new Fx();
  const { g, circles } = graphics();
  fx.summonCircle(g, g, 450, 320, 1, 0xffb03a, 1);
  assert.ok(circles.some((c) => c[2] === SUMMON_LIGHT_RADIUS));
  for (const [x, y, radius] of circles) {
    assert.equal(x, 450); assert.equal(y, 320);
    assert.ok(radius > 0 && radius <= SUMMON_LIGHT_RADIUS);
  }
});

test('impact light and shadow follow the caster, remain circular, and expire', () => {
  const fx = new Fx();
  let position = { x: 200, y: 300 };
  fx.summonPulse(() => position, 0xa86aff, 0.35);
  const first = graphics(); fx.draw(first.g, first.g, first.g);
  assert.ok(first.circles.length > 0);
  assert.ok(first.circles.every(([x, y, r]) => x === 200 && y === 300 && r <= SUMMON_LIGHT_RADIUS));
  position = { x: 240, y: 360 }; fx.update(0.1);
  const next = graphics(); fx.draw(next.g, next.g, next.g);
  assert.ok(next.circles.every(([x, y, r]) => x === 240 && y === 360 && r <= SUMMON_LIGHT_RADIUS));
  fx.update(0.2);
  const expired = graphics(); fx.draw(expired.g, expired.g, expired.g);
  assert.equal(expired.circles.length, 0);
});

function scene() {
  const scene = new BattleScene();
  const pulses = [];
  scene.screenFlash = () => assert.fail('summons must not flash the entire screen');
  scene.add = { rectangle: () => assert.fail('summons must not dim the entire screen') };
  scene.fx = new Proxy({}, { get: (_o, name) => name === 'summonPulse'
    ? (getPosition) => pulses.push(getPosition()) : () => {} });
  scene.time = { delayedCall: (_delay, run) => run() };
  scene.summonResult = () => {}; scene.summonTally = () => () => {};
  scene.dealDamage = () => {}; scene.reap = () => true;
  scene.applyQuestTreeHit = () => {}; scene.applyGroveHit = () => {};
  return { scene, pulses };
}

test('starting a summon creates no full-screen shadow object', () => {
  const { scene: s } = scene();
  s.onSummonStart({ summoning: { kind: 'soulReaper', level: 1 } });
});

for (const method of ['thunderStrike', 'holyFireStrike', 'treeStrike', 'reaperStrike']) {
  test(`${method}: impact lighting stays at the caster rather than the distant target or screen`, () => {
    const { scene: s, pulses } = scene();
    const caster = { x: 100, y: 150, alive: true, boss: true };
    const target = { x: 1000, y: 800, alive: true, untouchable: false, paralyze() {} };
    s.summonTargets = () => [target];
    const random = Math.random;
    try { Math.random = () => 0; s[method](caster, 1); }
    finally { Math.random = random; }
    assert.ok(pulses.length > 0);
    assert.ok(pulses.every((p) => p.x === caster.x && p.y === caster.y));
  });
}

for (const grove of [false, true]) test(`${grove ? 'grove' : 'prison'} tree lighting stays centered on the tree for every summon`, () => {
  for (const spell of TREE_SUMMONS) {
    const { scene: s, pulses } = scene();
    const tree = { x: 350, y: 450, alive: true, grove: 'summon' };
    s.questTree = tree; s.groveTrees = [tree];
    const cast = { spell, x: 900, y: 700, elapsed: spell.warn };
    s[grove ? 'strikeGroveSummon' : 'strikeQuestTree'](cast);
    assert.ok(pulses.length > 0);
    assert.ok(pulses.every((p) => p.x === tree.x && p.y === tree.y));
  }
});
