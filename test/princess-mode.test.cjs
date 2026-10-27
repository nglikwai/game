const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { MAPS } = load('src/maps/index.ts');
const { ARENA, cagesFor, obstaclesFor, chestsFor, sideOf } = load('src/maps/common.ts');
const { PRINCESS_WALL_HP } = load('src/config/index.ts');
const { createMatchStats } = load('src/battle/results/stats.ts');

function battle() {
  const scene = new BattleScene();
  scene.init({ mode: 'princess', slots: [] });
  let progress = '';
  const wins = [];
  const banners = [];
  scene.walls = cagesFor(false).map((o) => ({ o, team: o.team, hp: PRINCESS_WALL_HP, maxHp: PRINCESS_WALL_HP,
    rescued: false, lastHitter: null, shakeT: 0, cracks: [], rect: {},
    body: { destroyed: false, destroy() { this.destroyed = true; } },
  }));
  scene.world = { objectives: scene.walls.map((w) => ({ ...w.o })) };
  scene.obstacleRects = scene.walls.map((w) => w.rect);
  scene.shotBlockers = [...scene.obstacleRects];
  scene.helpTexts = scene.walls.map(() => ({ destroy() {} }));
  scene.princessText = { setText: (text) => progress = text };
  const object = (x, y) => ({ x, y, angle: 0, setStrokeStyle() { return this; }, setAngle() { return this; }, setOrigin() { return this; } });
  scene.add = { rectangle: object, text: object };
  scene.lTop = { add() {} };
  scene.tweens = { add() {} };
  scene.fx = { hitSpark() {} };
  scene.popText = () => {};
  scene.showBanner = (msg) => banners.push(msg);
  scene.endRound = (_winner, msg) => { wins.push(msg); scene.over = true; };
  scene.stats = [createMatchStats()];
  return { scene, wins, banners, progress: () => progress };
}

test('four corner princesses: two per team on the enemy side, including flipped starts', () => {
  assert.equal(PRINCESS_WALL_HP, 680);
  for (const flip of [false, true]) {
    const cages = cagesFor(flip);
    assert.equal(cages.length, 4);
    assert.equal(new Set(cages.map((o) => `${o.x},${o.y}`)).size, 4);
    for (const team of [0, 1]) {
      const own = cages.filter((o) => o.team === team);
      assert.equal(own.length, 2);
      assert.ok(own.every((o) => (o.x > 640 ? 1 : 0) === sideOf(1 - team, flip)));
      assert.ok(own.some((o) => o.y < 406) && own.some((o) => o.y > 406));
    }
    for (const o of cages) {
      assert.ok(o.x - o.w / 2 > ARENA.x && o.x + o.w / 2 < ARENA.x + ARENA.w);
      assert.ok(o.y - o.h / 2 > ARENA.y && o.y + o.h / 2 < ARENA.y + ARENA.h);
    }
  }
});

test('all 42 maps clear approach space around all four walls and keep chests outside', () => {
  for (const map of MAPS) for (const flip of [false, true]) {
    const obstacles = obstaclesFor(map, 'princess', flip);
    const cages = obstacles.filter((o) => o.kind === 'cage');
    assert.equal(cages.length, 4);
    for (const c of cages) {
      for (const o of obstacles.filter((o) => o.kind !== 'cage')) {
        assert.ok(Math.abs(c.x - o.x) >= (c.w + o.w) / 2 + 28 || Math.abs(c.y - o.y) >= (c.h + o.h) / 2 + 28, `${map.id}: obstructed princess`);
      }
      for (const chest of chestsFor(map, 'princess')) {
        assert.ok(Math.abs(chest.x - c.x) >= (c.w + 52) / 2 + 20 || Math.abs(chest.y - c.y) >= (c.h + 40) / 2 + 20, `${map.id}: chest inside wall`);
      }
    }
  }
});

test('first rescue keeps the match and other three objectives active; second wins', () => {
  const { scene, wins, banners, progress } = battle();
  const [first, second, enemy] = scene.walls;
  scene.breakWall(first);
  assert.equal(wins.length, 0);
  assert.equal(scene.over, false);
  assert.equal(scene.world.objectives.length, 3);
  assert.equal(first.body.destroyed, true);
  assert.ok(!scene.obstacleRects.includes(first.rect));
  assert.ok(!scene.shotBlockers.includes(first.rect));
  assert.ok(progress().includes('1/2'));
  assert.equal(banners.length, 1);
  scene.breakWall(first); // duplicate callback cannot count twice
  assert.equal(scene.world.objectives.length, 3);
  assert.equal(banners.length, 1);
  scene.breakWall(enemy); // each team has freed one
  assert.equal(wins.length, 0);
  scene.breakWall(second);
  assert.equal(wins.length, 1);
  assert.equal(scene.over, true);
  assert.equal(scene.world.objectives.length, 1);
  assert.ok(progress().includes('2/2'));
});

test('weapons can damage the second wall, skip rescued walls, and cannot hurt enemy princess walls', () => {
  const { scene, wins } = battle();
  const [first, second, enemy] = scene.walls;
  scene.breakWall(first);
  const f = { index: 0, team: 0, x: second.o.x - 70, y: second.o.y, facing: 0, damageMult: 1,
    weapon: { shape: { kind: 'circle', offset: 70, radius: 60 }, damage: 20 }, swingHits: new Set() };
  scene.onSwingActive(f);
  assert.equal(second.hp, 660);
  assert.equal(scene.stats[0].wall, 20);
  scene.onSwingActive(f); // same swing never damages twice
  assert.equal(second.hp, 660);
  f.x = enemy.o.x - 70; f.y = enemy.o.y; f.swingHits.clear();
  scene.onSwingActive(f);
  assert.equal(enemy.hp, 680);
  f.x = second.o.x - 70; f.y = second.o.y; f.swingHits.clear();
  f.weapon.damage = 1000;
  scene.onSwingActive(f);
  assert.equal(second.hp, 0);
  assert.equal(scene.stats[0].wall, 680); // no overkill in results
  assert.equal(wins.length, 1);
});
