const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene } = load('@/scenes/BattleScene.ts');
const { Fighter } = load('@/gameplay/Fighter.ts');
const { roleById } = load('@/gameplay/roles.ts');
const { WEAPONS } = load('@/gameplay/weapons.ts');
const { ITEMS } = load('@/gameplay/items.ts');
const { QUEST, MAP_SCALE } = load('@/config/index.ts');
const { emptyIntent } = load('@/input/contracts.ts');
const { toWorld, ARENA } = load('@/battle/coordinates.ts');
const { sandPitContains, sandPitForce } = load('@/battle/environment/sandPits.ts');
const { layoutPoint } = load('@/maps/layout.ts');
const { getMap } = load('@/maps/index.ts');

function battle(seed = 123) {
  const scene = new BattleScene();
  scene.init({ mode: 'quest', slots: [], quest: { stage: QUEST.ambushStage, layoutSeed: seed } });
  scene.countdown = 0; scene.popText = () => {};
  scene.onPillRevived = () => {};
  scene.fx = { smoke() {}, sparks() {} };
  const pit = scene.map.zones[0], center = toWorld(pit);
  const make = (index, team, fraction = 0.8) => {
    const body = { center: { x: center.x + pit.w * MAP_SCALE / 2 * fraction, y: center.y }, velocity: { x: 0, y: 0 }, enable: true,
      setVelocity(x, y) { this.velocity = { x, y }; }, reset(x, y) { this.center = { x: x + 18, y: y + 18 }; } };
    const f = new Fighter(index, 0xffffff, WEAPONS[0], [], roleById('ronin'), { labels: [] }, body, scene);
    f.team = team; scene.fighters.push(f); return f;
  };
  return { scene, pit, center, make };
}

test('pits use elliptical bounds and inward pull strengthens toward the fatal center', () => {
  const { pit, center } = battle();
  const radius = pit.w * MAP_SCALE / 2;
  const outer = sandPitForce(pit, center.x + radius * 0.9, center.y);
  const inner = sandPitForce(pit, center.x + radius * 0.3, center.y);
  assert.ok(outer.x < 0 && Math.abs(outer.y) < 1e-9);
  assert.ok(Math.abs(inner.x) > Math.abs(outer.x));
  assert.equal(sandPitForce(pit, center.x + radius * 1.1, center.y), null);
  assert.equal(sandPitContains(pit, center.x + radius * 0.9, center.y + pit.h * MAP_SCALE / 2 * 0.9), false);
  assert.deepEqual({ ...sandPitForce(pit, center.x, center.y) }, { x: 0, y: 0 });
});

test('entering the rim immediately damages either team without stun; nearby safe ground takes no damage', () => {
  const { scene, make } = battle();
  const hero = make(0, 0), enemy = make(4, 1), outside = make(1, 0, 1.05);
  scene.updateSandPits(0.25);
  // 80% out is depth 0.2: 10 dps × (0.3 + 0.7 × 0.2) for a quarter second.
  const chip = 10 * (0.3 + 0.7 * 0.2) * 0.25;
  assert.ok(Math.abs(hero.hp - (hero.maxHp - chip)) < 1e-9); assert.ok(Math.abs(enemy.hp - (enemy.maxHp - chip)) < 1e-9);
  assert.equal(hero.state, 'idle'); assert.equal(outside.hp, outside.maxHp);
  assert.ok(Math.abs(hero.stats.taken - chip) < 1e-9);
});

test('the pit center instantly kills through guards, casting and a Revival Pill; normal combat still allows pill revival', () => {
  const { scene, make } = battle();
  const f = make(0, 0, 0);
  f.ward(0.9, 100); f.state = 'casting';
  f.pocket.push(ITEMS.find((item) => item.id === 'revival-pill'));
  scene.updateSandPits(0.01);
  assert.equal(f.alive, false); assert.equal(f.hp, 0); assert.equal(f.stats.deaths, 1);
  assert.equal(f.stats.taken, f.maxHp); assert.equal(f.body.enable, false); assert.equal(f.pocket.length, 1);
  scene.updateSandPits(0.1); assert.equal(f.stats.deaths, 1);
  f.revive(200, 200); f.takeChip(1000);
  assert.equal(f.alive, true); assert.equal(f.pocket.length, 0); assert.equal(f.stats.deaths, 1);
});

test('standing still sinks a fighter, outward movement escapes the edge, and knockback accelerates a fall', () => {
  const sink = battle(), f = sink.make(0, 0);
  for (let k = 0; k < 800 && f.alive; k++) {
    f.update(0.025, emptyIntent());
    f.body.center.x += f.vx * 0.025; f.body.center.y += f.vy * 0.025;
    sink.scene.updateSandPits(0.025);
  }
  assert.equal(f.alive, false);
  const escape = battle(), runner = escape.make(0, 0, 0.95);
  for (let k = 0; k < 20; k++) {
    runner.update(0.025, { ...emptyIntent(), mx: 1 });
    runner.body.center.x += runner.vx * 0.025;
    escape.scene.updateSandPits(0.025);
  }
  assert.equal(runner.alive, true);
  assert.equal(sandPitContains(escape.pit, runner.x, runner.y), false);
  const pushed = battle(), victim = pushed.make(0, 0, 0.25);
  victim.takeHit(1, -1, 0, 400, 0.3);
  for (let k = 0; k < 40 && victim.alive; k++) {
    victim.update(0.025, emptyIntent()); victim.body.center.x += victim.vx * 0.025;
    pushed.scene.updateSandPits(0.025);
  }
  assert.equal(victim.alive, false);
});

test('pits freeze during previews, pause and results; other maps retain their terrain behavior', () => {
  for (const stop of ['countdown', 'paused', 'over']) {
    const { scene, make } = battle(); const f = make(0, 0, 0);
    scene[stop] = stop === 'countdown' ? 5 : true;
    scene.updateSandPits(10); assert.equal(f.hp, f.maxHp); assert.equal(f.alive, true);
  }
  const { scene, make } = battle(); const f = make(0, 0);
  scene.map = getMap('whirlpool'); scene.updateSandPits(10);
  assert.equal(f.hp, f.maxHp); assert.ok(scene.map.zones.some((z) => z.kind === 'vortex'));
});

test('random layouts keep the visible pit center, pull, fatal core and safe spawn positions aligned', () => {
  const base = getMap('ambush');
  assert.equal(base.zones.length, 4);
  assert.equal(QUEST.ambush.enemyHp, 1.25);
  for (let seed = 0; seed < 40; seed++) {
    const { scene } = battle(seed);
    scene.map.zones.forEach((pit, i) => {
      const at = toWorld(layoutPoint(scene.map, base.zones[i]));
      const c = toWorld(pit);
      assert.ok(Math.hypot(at.x - c.x, at.y - c.y) < 1e-6);
      const safe = scene.freeSpot(c, []);
      assert.equal(sandPitContains(pit, safe.x, safe.y, 20), false);
    });
  }
});

test('CPU waypoints can cross the sand without entering any pit\'s deep middle or stopping', () => {
  const map = getMap('ambush'), pit = map.zones[0];
  const target = { x: 1100, y: pit.y }, at = { x: 180, y: pit.y };
  for (let step = 0; step < 400 && Math.hypot(at.x - target.x, at.y - target.y) > 8; step++) {
    const goal = map.route(at.x, at.y, target.x, target.y) ?? target;
    const distance = Math.hypot(goal.x - at.x, goal.y - at.y);
    assert.ok(distance > 1, 'routing must advance instead of returning the current spot');
    const amount = Math.min(8, distance);
    at.x += (goal.x - at.x) / distance * amount; at.y += (goal.y - at.y) / distance * amount;
    const world = toWorld(at);
    const deep = (z) => ({ ...z, w: z.w * z.avoid, h: z.h * z.avoid });
    assert.ok(map.zones.every((z) => !sandPitContains(deep(z), world.x, world.y)));
  }
  assert.ok(Math.hypot(at.x - target.x, at.y - target.y) <= 8);
});

test('random chests avoid the pits and their edges', () => {
  const { scene, center } = battle();
  const phaser = load('phaser'), between = phaser.Math.Between;
  const safe = { x: ARENA.x + ARENA.w / 2, y: ARENA.y + ARENA.h / 2 };
  const values = [center.x, center.y, safe.x, safe.y];
  let placed;
  scene.addChest = (x, y) => { placed = { x, y }; };
  try {
    phaser.Math.Between = () => values.shift();
    scene.dropRandomChest(0);
  } finally { phaser.Math.Between = between; }
  assert.deepEqual(placed, safe);
});

test('the wide pits cover about 70% of the arena around a small round fatal core that CPUs keep away from', () => {
  const { sandPitCore, sandPitDangers } = load('@/battle/environment/sandPits.ts');
  const map = getMap('ambush');
  let inside = 0, total = 0;
  for (let x = ARENA.x; x < ARENA.x + ARENA.w; x += 6) for (let y = ARENA.y; y < ARENA.y + ARENA.h; y += 6) {
    total++;
    if (map.zones.some((z) => sandPitContains(z, x, y))) inside++;
  }
  assert.ok(inside / total > 0.66 && inside / total < 0.74);
  const pit = map.zones[0];
  assert.ok(sandPitCore(pit) < 20 * MAP_SCALE);
  const danger = sandPitDangers(map)[0];
  assert.ok(danger.ry > sandPitCore(pit) * 2 && danger.rx < pit.w * MAP_SCALE / 2);
});

test('a CPU dodging a swing will not dash into a pit\'s deep middle', () => {
  const { AIController } = load('@/ai/AIController.ts');
  const { SKILLS } = load('@/gameplay/skills.ts');
  const dodges = (hazard) => {
    const { scene, center, make } = battle();
    const f = make(0, 0, 0), foe = make(4, 1, 0);
    f.body.center = { x: center.x + 170, y: center.y };
    foe.body.center = { x: center.x + 210, y: center.y };
    foe.facing = Math.PI; foe.state = 'windup';
    f.skills = [SKILLS.find((sk) => sk.id === 'blink')]; f.cooldowns = [0]; f.pe = f.maxPe;
    const world = { fighters: scene.fighters, projectiles: [], objectives: [], chests: [],
      fires: () => hazard ? [{ x: center.x, y: center.y, r: 120, rx: 120, ry: 120 }] : [] };
    const ai = new AIController('hard');
    const original = Math.random;
    let dashed = 0;
    try {
      Math.random = () => 0;
      for (let k = 0; k < 20; k++) if (ai.decide(f, world).skills[0]) dashed++;
    } finally { Math.random = original; }
    return dashed;
  };
  assert.ok(dodges(false) > 0);
  assert.equal(dodges(true), 0);
});
