const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { AIController } = load('src/controls.ts');
const { Fighter } = load('src/Fighter.ts');
const { WEAPONS } = load('src/weapons.ts');
const { roleById } = load('src/roles.ts');
const { skillById } = load('src/skills.ts');

function fighter(index, team, x, y, weapon = 'shuriken') {
  const body = { center: { x, y }, velocity: { x: 100, y: 100 } };
  const f = new Fighter(index, 0xffffff, WEAPONS.find((w) => w.id === weapon), [], roleById('ronin'), { labels: [] }, body, {});
  f.team = team;
  return f;
}

function encounter(team = 0) {
  const self = fighter(0, team, 500, 500);
  const enemy = fighter(4, 1 - team, 500, 850);
  const tower = { team: 1 - team, x: 650, y: 500, w: 64, h: 64, alive: true };
  const chest = { x: 640, y: 500, w: 40, h: 40 };
  const world = { fighters: [self, enemy], projectiles: [], objectives: [], chests: [chest], towers: [tower], siege: true, defendTeam: 0 };
  return { self, enemy, tower, world };
}

function decide(difficulty, self, world) {
  const original = Math.random;
  try {
    Math.random = () => 0.5; // no aim jitter or randomly skipped attacks
    return new AIController(difficulty).read(self, world, 0.2);
  } finally { Math.random = original; }
}

for (const difficulty of ['standard', 'hard']) {
  test(`${difficulty}: Quest allies engage enemies instead of an easy nearby tower or chest`, () => {
    const { self, world } = encounter();
    const intent = decide(difficulty, self, world);
    assert.ok(Math.abs(intent.ax) < 1e-8);
    assert.ok(intent.ay > 0.99);
    assert.ok(intent.my > 0.5);
    assert.equal(intent.attack, false); // enemy is beyond melee reach; tower would be in reach
  });

  test(`${difficulty}: an enemy pressuring a wounded teammate takes priority over a closer enemy`, () => {
    const { self, enemy, world } = encounter();
    enemy.body.center.y = 1000;
    const ally = fighter(1, 0, 500, 1100); ally.hp = 25;
    const distraction = fighter(5, 1, 650, 500); distraction.hp = 1;
    world.fighters.push(ally, distraction);
    const intent = decide(difficulty, self, world);
    assert.ok(Math.abs(intent.ax) < 1e-8);
    assert.ok(intent.ay > 0.99);
    assert.ok(intent.my > 0.5);
  });

  test(`${difficulty}: a long-range swing aimed at a teammate also triggers protection`, () => {
    const { self, world } = encounter();
    const attacker = fighter(6, 1, 500, 900, 'yari');
    attacker.state = 'windup'; attacker.facing = Math.PI / 2;
    const ally = fighter(1, 0, 500, 1200);
    world.fighters = [self, fighter(5, 1, 650, 500), ally, attacker];
    const intent = decide(difficulty, self, world);
    assert.ok(Math.abs(intent.ax) < 1e-8);
    assert.ok(intent.ay > 0.99);
  });

  test(`${difficulty}: towers remain a valid target during enemy respawns, then returning guards interrupt`, () => {
    const { self, enemy, world } = encounter();
    enemy.state = 'dead';
    const intent = decide(difficulty, self, world);
    assert.equal(intent.attack, true);
    assert.ok(intent.ax > 0.99);
    assert.ok(Math.abs(intent.ay) < 1e-8);
    enemy.state = 'idle';
    const resumed = decide(difficulty, self, world);
    assert.ok(resumed.ay > 0.99);
    assert.equal(resumed.attack, false);
  });

  test(`${difficulty}: ordinary Siege and Quest enemies retain their tower priorities`, () => {
    const regular = encounter();
    delete regular.world.defendTeam;
    const siege = decide(difficulty, regular.self, regular.world);
    assert.equal(siege.attack, true);
    assert.ok(siege.ax > 0.99);
    const foes = encounter(1);
    const enemy = decide(difficulty, foes.self, foes.world);
    assert.equal(enemy.attack, true);
    assert.ok(enemy.ax > 0.99);
  });

  test(`${difficulty}: healing teammates still comes before attacking enemies or towers`, () => {
    const { self, world } = encounter();
    self.skills.push(skillById('healing-circle'));
    const ally = fighter(1, 0, 500, 950); ally.hp = 30;
    world.fighters.push(ally);
    const intent = decide(difficulty, self, world);
    assert.equal(intent.skills[0], true);
    assert.equal(intent.attack, false);
  });

  test(`${difficulty}: prison allies defend teammates before princess walls or the tree`, () => {
    const { self, enemy, tower, world } = encounter();
    tower.tree = true;
    world.objectives = [{ team: 0, x: 650, y: 500, w: 140, h: 140 }];
    enemy.body.center.y = 1000;
    const ally = fighter(1, 0, 500, 1100); ally.hp = 25;
    world.fighters.push(ally);
    const defending = decide(difficulty, self, world);
    assert.ok(defending.ay > 0.99);
    assert.ok(defending.my > 0.5);
    assert.equal(defending.attack, false);
    enemy.state = 'dead';
    const rescuing = decide(difficulty, self, world);
    assert.equal(rescuing.attack, true);
    assert.ok(rescuing.ax > 0.99);
    world.objectives = [];
    const tree = decide(difficulty, self, world);
    assert.equal(tree.attack, true);
    assert.ok(tree.ax > 0.99);
  });
}

test('defending allies ignore hidden or invulnerable enemies when choosing a tower fallback', () => {
  for (const state of ['hidden', 'invulnerable']) {
    const { self, enemy, world } = encounter();
    if (state === 'hidden') enemy.stealthT = 2;
    else enemy.state = 'casting';
    const intent = decide('standard', self, world);
    assert.equal(intent.attack, true);
    assert.ok(intent.ax > 0.99);
  }
});
