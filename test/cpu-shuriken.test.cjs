const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { Fighter } = load('src/gameplay/Fighter.ts');
const { roleById } = load('src/gameplay/roles.ts');
const { WEAPONS, shapeHits } = load('src/gameplay/weapons.ts');
const { AIController, CPU_SHURIKEN } = load('src/ai/AIController.ts');

function fighter(index, team, x, y, weapon) {
  const body = { center: { x, y }, velocity: { x: 0, y: 0 }, enable: true, setVelocity() {}, reset() {} };
  const f = new Fighter(index, 0xffffff, WEAPONS.find((w) => w.id === weapon), [], roleById('ronin'), { labels: [] }, body, {
    spawnProjectile() {}, inTowerAura: () => false, hazardSlow: () => 1, terrainAt: () => null, windAt: () => null, popText() {},
  });
  f.team = team;
  return f;
}

/** Throws per decision, and how many would actually reach a target down the lane at `distance`. */
function throws(weapon, difficulty, distance = 200, decisions = 600) {
  const cpu = fighter(0, 0, 200, 400, weapon), target = fighter(1, 1, 200 + distance, 400, 'fan');
  const world = { fighters: [cpu, target], projectiles: [], objectives: [], chests: [] };
  const ai = new AIController(difficulty);
  let thrown = 0, landed = 0;
  for (let k = 0; k < decisions; k++) {
    const out = ai.decide(cpu, world);
    if (!out.attack) continue;
    thrown++;
    if (shapeHits(cpu.weapon.shape, cpu.x, cpu.y, Math.atan2(out.ay, out.ax), target.x, target.y, target.radius)) landed++;
  }
  return { rate: thrown / decisions, accuracy: thrown ? landed / thrown : 0 };
}

test('a CPU throws 手裡劍 less often than it swings other weapons in reach', () => {
  const star = throws('shuriken', 'standard', 60), fan = throws('fan', 'standard', 60);
  assert.ok(star.rate < fan.rate * 0.75, `${star.rate} vs ${fan.rate}`);
  assert.ok(star.rate > 0);
});

test('a CPU\'s far 手裡劍 throws wobble and sometimes miss; Hard aims steadier but still not perfectly', () => {
  const standard = throws('shuriken', 'standard', 260), hard = throws('shuriken', 'hard', 260);
  assert.ok(standard.accuracy < 0.95 && standard.accuracy > 0.3, `standard ${standard.accuracy}`);
  assert.ok(hard.accuracy > standard.accuracy - 0.05 && hard.accuracy < 1, `hard ${hard.accuracy}`);
  assert.ok(CPU_SHURIKEN.hardSpread < CPU_SHURIKEN.spread);
  // Other weapons keep exact aim.
  assert.equal(throws('fan', 'standard', 60).accuracy, 1);
});
