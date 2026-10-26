const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { Fighter } = load('src/Fighter.ts');
const { WEAPONS } = load('src/weapons.ts');
const { roleById } = load('src/roles.ts');
const { QUEST, MAP_SCALE, HUD_HEIGHT, RESPAWN_TOWER_COST, TOWER_RESPAWN_HP, TOWER_RESPAWN_SOUL_KEEP } = load('src/config.ts');
const { getMap, mulberry32 } = load('src/maps/index.ts');

function fighter(index, team) {
  const body = {
    center: { x: 400, y: 400 }, velocity: { x: 0, y: 0 }, enable: true,
    setVelocity() {}, reset() {},
  };
  const f = new Fighter(index, 0xffffff, WEAPONS[0], [], roleById('ronin'), { labels: [] }, body, {});
  f.team = team;
  f.x = 400;
  f.y = 400;
  return f;
}

function grove() {
  const scene = new BattleScene();
  scene.init({
    mode: 'quest',
    slots: [
      { control: 'keys', team: 0 },
      { control: 'off', team: 0 },
      { control: 'off', team: 0 },
      { control: 'off', team: 0 },
    ],
    quest: { stage: QUEST.groveStage },
  });
  scene.countdown = 0;
  scene.showBanner = () => {};
  scene.popText = () => {};
  scene.freeSpot = (p) => p;
  scene.fx = { respawnBeam() {}, hitSpark() {} };
  scene.fighters = [fighter(0, 0)];
  return scene;
}

function trees(scene, alive = { respawn: true, summon: true, illusion: true }) {
  scene.groveTrees = ['respawn', 'summon', 'illusion'].map((role) => ({ grove: role, alive: alive[role], x: 10, y: 20 }));
}

test('the grove sits before the boss, with three trees at the top and two bottom corners', () => {
  const map = getMap('grove');
  const trees = map.obstacles.filter((o) => o.kind === 'deadtree');
  assert.deepEqual(trees.map(({ x, y }) => [x, y]), QUEST.grove.spots.map(({ x, y }) => [x, y]));
  assert.equal(QUEST.groveStage, QUEST.sealStage - 1);
  assert.equal(QUEST.maps[QUEST.groveStage], 'grove');
  for (const chest of map.chests) for (const o of map.obstacles) {
    assert.ok(Math.abs(chest.x - o.x) >= o.w / 2 + (chest.big ? 26 : 17) || Math.abs(chest.y - o.y) >= o.h / 2 + (chest.big ? 20 : 14));
  }
  const ctx = new Proxy({}, { get: (_, name) => (...args) => {
    for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg));
    if (name === 'createRadialGradient') return { addColorStop() {} };
  }, set: () => true });
  map.paint(ctx, mulberry32(3));
});

test('the grove always starts with four enemies and deals the three jobs onto the spots', () => {
  const scene = grove();
  assert.equal(scene.slots.filter((s) => s.team === 1 && s.control === 'cpu').length, 4);
  const bodies = [];
  scene.physics = { add: { staticBody: (...args) => { const body = { args, destroy() {} }; bodies.push(body); return body; }, collider: () => ({ destroy() {} }) } };
  scene.add = {
    text: () => ({ setOrigin() { return this; } }),
    graphics: () => ({ setDepth() { return this; } }),
  };
  scene.lTop = { add() {} };
  const random = Math.random;
  Math.random = () => 0;
  scene.placeGroveTrees(2);
  Math.random = () => 0.99;
  const shuffled = scene.groveTrees.map((t) => t.grove);
  scene.groveTrees = [];
  scene.towers = scene.towers.filter((t) => !t.grove);
  scene.placeGroveTrees(2);
  Math.random = random;
  assert.deepEqual([...shuffled], ['summon', 'illusion', 'respawn']);
  assert.equal(scene.groveIllusion, 'ice');
  assert.deepEqual([...scene.groveTrees.map((t) => t.grove)], ['respawn', 'summon', 'illusion']);
  const hp = 380 + 100 * 2;
  for (const tree of scene.groveTrees) {
    assert.equal(tree.hp, hp * (tree.grove === 'summon' ? 1.5 : 1));
    assert.equal(tree.main, false);
    assert.equal(tree.team, 1);
  }
  const S = MAP_SCALE;
  QUEST.grove.spots.forEach((spot, i) => {
    assert.equal(scene.groveTrees[i].x, spot.x * S);
    assert.equal(scene.groveTrees[i].y, (spot.y - HUD_HEIGHT) * S);
  });
  assert.equal(bodies.length, 6);
});

test('effects take turns for the active window, rest, and leave a dead tree silent', () => {
  const scene = grove();
  trees(scene);
  const { interval, rest } = QUEST.grove;
  const active = interval - rest;
  const at = (t) => { scene.groveT = t; const phase = scene.grovePhase(); return { index: phase.index, roles: [...phase.roles], active: phase.active, restLeft: phase.restLeft }; };
  assert.deepEqual([...QUEST.grove.order], ['summon', 'illusion', 'respawn']);
  assert.deepEqual(at(0), { index: 0, roles: ['summon', 'illusion'], active: true, restLeft: interval });
  assert.equal(at(active - 0.1).active, true);
  assert.deepEqual(at(active).roles, ['summon', 'illusion']);
  assert.equal(at(active).active, false);
  assert.equal(at(active).restLeft, rest);
  assert.deepEqual(at(interval).roles, ['illusion', 'respawn']);
  assert.equal(at(interval).active, true);
  assert.equal(at(interval + active).active, false);
  assert.deepEqual(at(interval * 2).roles, ['respawn', 'summon']);
  assert.equal(at(interval * 2).active, true);
  assert.deepEqual(at(interval * 3).roles, ['summon', 'illusion']);
  scene.groveTrees.find((t) => t.grove === 'summon').alive = false;
  assert.deepEqual(at(5).roles, ['illusion']);
  assert.equal(at(5).active, true);
  scene.groveTrees.find((t) => t.grove === 'illusion').alive = false;
  assert.equal(at(5).active, false);
  scene.countdown = 3;
  assert.equal(at(100).active, false);
});

test('the respawn tree brings back one fallen enemy on its timer, never past four alive', () => {
  const scene = grove();
  trees(scene);
  const enemies = [4, 5, 6, 7].map((i) => fighter(i, 1));
  enemies[1].state = 'dead';
  enemies[1].soul = 40;
  enemies[1].pocket.push({ id: 'rice-ball' });
  scene.fighters.push(...enemies);
  const tree = scene.groveTrees[0];
  tree.hp = tree.maxHp = 1000;
  scene.groveRespawnT = 0;
  scene.updateGroveRespawn(0);
  assert.equal(tree.hp, 1000 - 1000 * RESPAWN_TOWER_COST);
  assert.equal(enemies[1].alive, true);
  assert.equal(enemies[1].hp, enemies[1].maxHp * TOWER_RESPAWN_HP);
  assert.equal(enemies[1].soul, 40 * TOWER_RESPAWN_SOUL_KEEP);
  assert.equal(enemies[1].pocket.length, 0);
  assert.equal(scene.fighters.filter((f) => f.team === 1 && f.alive).length, 4);
  scene.groveRespawnT = 0;
  scene.updateGroveRespawn(1);
  assert.equal(scene.groveRespawnT, QUEST.grove.respawnEvery);

  enemies[2].state = 'dead';
  scene.groveT = QUEST.grove.interval - QUEST.grove.rest;
  scene.updateGrove(1);
  assert.equal(enemies[2].alive, false);

  scene.groveT = 5;
  tree.hp = tree.maxHp * RESPAWN_TOWER_COST;
  scene.destroyTower = (tw) => { tw.alive = false; };
  scene.groveRespawnT = 0;
  scene.updateGroveRespawn(0);
  assert.equal(enemies[2].alive, true);
  assert.equal(tree.hp, 0);
  assert.equal(tree.alive, false);
  enemies[3].state = 'dead';
  scene.updateGroveRespawn(1);
  assert.equal(enemies[3].alive, false);
});

test('hot air slows only the party, ice slicks the floor, and sand is a veil during the illusion window', () => {
  const scene = grove();
  trees(scene);
  const illusionAt = QUEST.grove.interval;
  const illusionRest = illusionAt + (QUEST.grove.interval - QUEST.grove.rest);
  scene.groveT = illusionAt;
  scene.groveIllusion = 'heat';
  assert.equal(scene.hazardSlow({ team: 0 }), QUEST.grove.heatSlow);
  assert.equal(scene.hazardSlow({ team: 1 }), 1);
  scene.groveT = illusionRest;
  assert.equal(scene.hazardSlow({ team: 0 }), 1);

  scene.groveT = illusionAt;
  scene.groveIllusion = 'ice';
  assert.equal(scene.terrainAt(0, 0), 'ice');
  scene.groveT = illusionRest;
  assert.equal(scene.terrainAt(0, 0), null);

  const paints = [];
  scene.groveVeil = { clear() { paints.push('clear'); }, fillStyle() { return this; }, fillRect() { paints.push('fill'); } };
  scene.groveIllusion = 'sand';
  scene.groveT = illusionAt;
  scene.updateGrove(0);
  assert.ok(paints.includes('fill'));
  paints.length = 0;
  scene.groveT = illusionRest;
  scene.updateGrove(0);
  assert.deepEqual(paints, ['clear']);
});

test('the summon tree marks a player only while it is on duty, and all three trees must fall to clear', () => {
  const scene = grove();
  trees(scene);
  scene.groveT = 0;
  scene.groveSummonT = 0;
  scene.updateGrove(0);
  assert.ok(scene.groveCast);
  assert.equal(scene.groveCast.target.team, 0);

  scene.groveCast = null;
  scene.groveTrees[1].alive = false;
  scene.groveSummonT = 0;
  scene.updateGrove(0);
  assert.equal(scene.groveCast, null);
  assert.equal(scene.groveSummonT, 1.2);

  let cleared = 0;
  scene.questClear = () => { cleared++; };
  scene.groveTrees.forEach((t) => { t.alive = false; });
  scene.updateQuest(0.1);
  assert.equal(cleared, 1);
  scene.groveTrees[2].alive = true;
  scene.updateQuest(0.1);
  assert.equal(cleared, 1);
});

test('the summon tree covers a wider circle and lands more often than the prison tree', () => {
  const { TREE_SUMMONS, groveSummonHitChance } = load('src/battle/quest/treeRules.ts');
  assert.ok(QUEST.grove.radius > QUEST.rescue.tree.radius);
  assert.equal(QUEST.grove.summonInterval, 2);
  for (const spell of TREE_SUMMONS) {
    const chance = groveSummonHitChance(spell);
    assert.ok(chance >= spell.hitChance && chance <= 1);
    if (spell.hitChance < 1) assert.ok(chance > spell.hitChance);
  }
});
