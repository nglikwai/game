const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { createLantern, advanceLantern, distanceToEscortPath } = load('src/battle/quest/escortRules.ts');
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { AIController } = load('@/ai/AIController.ts');
const { Fighter } = load('src/gameplay/Fighter.ts');
const { WEAPONS } = load('src/gameplay/weapons.ts');
const { roleById } = load('src/gameplay/roles.ts');
const { QUEST, MAP_SCALE, HUD_HEIGHT } = load('src/config/index.ts');
const { getMap, MAPS, ARENA } = load('src/maps/index.ts');

function fighter(index, team, x, y) {
  const body = { center: { x, y }, velocity: { x: 0, y: 0 }, enable: true,
    setVelocity() {}, reset(x, y) { this.center = { x: x + 18, y: y + 18 }; } };
  const f = new Fighter(index, 0xffffff, WEAPONS[0], [], roleById('ronin'), { labels: [] }, body, {});
  f.team = team;
  return f;
}

function battle() {
  const scene = new BattleScene();
  scene.init({ mode: 'quest', slots: [{ control: 'cpu', role: 'ronin' }], quest: { stage: QUEST.escortStage } });
  scene.countdown = 0;
  scene.fighters = [fighter(0, 0, scene.lantern.x, scene.lantern.y), fighter(4, 1, 1400, 500)];
  scene.freeSpot = (p) => p;
  scene.fx = { sparks() {}, smoke() {}, hitSpark() {} };
  scene.showBanner = () => {};
  return scene;
}

test('the lantern path stays open and inside the arena', () => {
  assert.equal(QUEST.maps[QUEST.escortStage], 'lantern');
  const map = getMap('lantern');
  assert.ok(!MAPS.includes(map));
  for (const p of QUEST.escort.path) {
    assert.ok(p.x - QUEST.escort.radius > ARENA.x && p.x + QUEST.escort.radius < ARENA.x + ARENA.w);
    assert.ok(p.y - QUEST.escort.radius > ARENA.y && p.y + QUEST.escort.radius < ARENA.y + ARENA.h);
  }
  for (const o of map.obstacles) assert.ok(distanceToEscortPath(o, QUEST.escort.path) > QUEST.escort.radius + Math.hypot(o.w, o.h) / 2);
  for (const c of map.chests) assert.ok(distanceToEscortPath(c, QUEST.escort.path) > QUEST.escort.radius + 40);
});

function riders(lantern, teams) {
  return teams.map((team) => ({ get x() { return lantern.x; }, get y() { return lantern.y; }, team, alive: true }));
}

test('the lantern starts in the center; two allies push it, one does not, and both sides stop it', () => {
  const a = createLantern(1, MAP_SCALE, HUD_HEIGHT), b = createLantern(4, MAP_SCALE, HUD_HEIGHT);
  assert.ok(Math.abs(a.x - QUEST.escort.path[1].x * MAP_SCALE) < 1e-9);
  assert.equal(a.progress, 0.5);
  const ally = { x: a.x, y: a.y, team: 0, alive: true };
  const enemy = { ...ally, team: 1 };
  for (const occupants of [[ally], [{ ...ally, alive: false }, ally], [ally, ally, enemy]]) {
    const before = a.x;
    advanceLantern(a, occupants, 10);
    assert.equal(a.x, before);
    assert.equal(a.push, 0);
  }
  const origin = a.x;
  advanceLantern(a, [ally, ally], 1);
  advanceLantern(b, riders(b, [0, 0, 0, 0]), 1);
  const step = QUEST.escort.speed * MAP_SCALE;
  assert.ok(Math.abs(a.x - (origin + step)) < 1e-6);
  assert.equal(a.distance, b.distance);
  assert.equal(a.push, 1);
  assert.ok(b.maxHp > a.maxHp);
  const back = a.x;
  advanceLantern(a, [enemy], 1);
  assert.ok(Math.abs(a.x - (back - step)) < 1e-6);
  assert.equal(a.push, -1);
});

test('left empty, the lantern drifts slowly back toward the party side but never into a loss', () => {
  const lantern = createLantern(1, 1, 0);
  const start = lantern.x;
  advanceLantern(lantern, [], 1);
  assert.ok(Math.abs(lantern.x - (start - lantern.speed * QUEST.escort.drift)) < 1e-6);
  assert.equal(lantern.drifting, true);
  assert.equal(lantern.push, 0);
  // A dead fighter standing in it counts as nobody.
  advanceLantern(lantern, [{ x: lantern.x, y: lantern.y, team: 0, alive: false }], 1);
  assert.equal(lantern.drifting, true);
  // One ally holds it in place.
  const held = lantern.x;
  advanceLantern(lantern, [{ x: lantern.x, y: lantern.y, team: 0, alive: true }], 5);
  assert.equal(lantern.x, held);
  assert.equal(lantern.drifting, false);
  advanceLantern(lantern, [], 10000);
  assert.equal(lantern.x, lantern.left);
  assert.equal(lantern.lost, false);
  assert.equal(lantern.progress, 0);
});

test('two allies can push the lantern to the enemy side, and enemies alone can push it back to a loss', () => {
  const win = createLantern(1, 1, 0);
  advanceLantern(win, riders(win, [0, 0]), (win.right - win.x) / win.speed);
  assert.equal(win.arrived, true);
  assert.equal(win.progress, 1);
  assert.equal(win.x, win.right);
  const lose = createLantern(1, 1, 0);
  advanceLantern(lose, riders(lose, [1]), (lose.x - lose.left) / lose.speed);
  assert.equal(lose.lost, true);
  assert.equal(lose.progress, 0);
  assert.equal(lose.x, lose.left);
  const dead = createLantern(1, 1, 0); dead.alive = false;
  advanceLantern(dead, riders(dead, [0, 0]), 100);
  assert.equal(dead.progress, 0.5);
});

test('reaching the enemy side clears; a push back or a defeated party fails', () => {
  for (const ending of ['arrive', 'lost', 'party']) {
    const scene = battle();
    let clears = 0, fails = 0;
    scene.questClear = () => clears++; scene.questFail = () => fails++;
    if (ending === 'arrive') scene.lantern.arrived = true;
    if (ending === 'lost') scene.lantern.lost = true;
    if (ending === 'party') scene.fighters[0].state = 'dead';
    scene.updateQuest(0.01);
    assert.equal(clears, ending === 'arrive' ? 1 : 0);
    assert.equal(fails, ending === 'arrive' ? 0 : 1);
    if (ending !== 'party') assert.equal(scene.fighters[1].alive, true);
  }
});

test('attacks do not damage the lantern', () => {
  const scene = battle(), lantern = scene.lantern;
  scene.fighters[0].body.center = { x: 100, y: 800 };
  const guard = scene.fighters[1];
  guard.body.center = { x: lantern.x - 60, y: lantern.y }; guard.facing = 0;
  scene.onSwingActive(guard);
  scene.onSwingActive(guard);
  guard.team = 0; guard.swingHits.clear();
  scene.onSwingActive(guard);
  scene.damageLantern(100000, guard);
  assert.equal(lantern.hp, lantern.maxHp);
  assert.equal(lantern.alive, true);
});

test('projectiles pass through the lantern', () => {
  const scene = battle(), lantern = scene.lantern;
  const Rectangle = load('phaser').Geom.Rectangle;
  const previous = Rectangle.Contains;
  Rectangle.Contains = (r, x, y) => x >= r.x && y >= r.y && x <= r.x + r.width && y <= r.y + r.height;
  try {
    scene.arenaRect = { x: 0, y: 0, width: 1800, height: 1000 };
    scene.fighters = [];
    const shot = (team) => ({ team, x: lantern.x - 40, y: lantern.y, vx: 400, vy: 0, radius: 5, traveled: 0, dead: false,
      effect: { damage: 20, range: 1000, knockback: 0, hitstun: 0 } });
    scene.projectiles = [shot(1), shot(0)];
    scene.updateProjectiles(0.05);
    assert.equal(lantern.hp, lantern.maxHp);
    assert.equal(lantern.alive, true);
    assert.equal(scene.projectiles.length, 2);
  } finally { Rectangle.Contains = previous; }
});

test('one fallen guard returns on the escort timer, away from the lantern, with death bookkeeping reset', () => {
  const scene = battle(), guard = scene.fighters[1];
  guard.state = 'dead'; guard.hp = 0; guard.soul = 40; guard.pocket.push({ id: 'rice-ball' });
  scene.deathTime.set(guard, 2); scene.respawnTimers.set(guard, Infinity);
  scene.updateEscort(QUEST.escort.respawnEvery - 0.01);
  assert.equal(guard.alive, false);
  scene.updateEscort(0.02);
  assert.equal(guard.alive, true);
  assert.equal(guard.hp, guard.maxHp * 0.75);
  assert.equal(guard.soul, 20);
  assert.equal(guard.pocket.length, 0);
  assert.equal(scene.deathTime.has(guard), false);
  assert.ok(Math.hypot(guard.x - scene.lantern.x, guard.y - scene.lantern.y) > scene.lantern.radius);
});

test('countdown, pause and end screen freeze escort, respawns and incoming damage; retry restores lantern', () => {
  for (const stop of ['countdown', 'paused', 'over']) {
    const scene = battle(); scene[stop] = stop === 'countdown' ? 1 : true;
    scene.fighters[1].state = 'dead';
    scene.updateEscort(100); scene.damageLantern(100);
    assert.equal(scene.lantern.distance, 0);
    assert.equal(scene.lantern.hp, scene.lantern.maxHp);
    assert.equal(scene.fighters[1].alive, false);
    assert.equal(scene.escortRespawnT, QUEST.escort.respawnEvery);
  }
  const scene = battle(); scene.damageLantern(100); scene.updateEscort(1);
  scene.init({ mode: 'quest', slots: [{ control: 'cpu' }], quest: { stage: QUEST.escortStage } });
  assert.equal(scene.lantern.progress, 0.5);
  assert.equal(scene.lantern.hp, scene.lantern.maxHp);
});

for (const difficulty of ['standard', 'hard']) {
  test(`${difficulty}: two CPU allies stay with the lantern and push it to the enemy side`, () => {
    const lantern = createLantern(2, 1, 0);
    const allies = [0, 1].map((i) => fighter(i, 0, lantern.x, lantern.y));
    const world = { fighters: allies, projectiles: [], objectives: [], chests: [], escort: lantern, defendTeam: 0 };
    const ai = new AIController(difficulty);
    for (let tick = 0; tick < 5000 && !lantern.arrived; tick++) {
      for (const ally of allies) {
        const intent = ai.decide(ally, world);
        ally.body.center.x += intent.mx * 100 * 0.05;
        ally.body.center.y += intent.my * 100 * 0.05;
      }
      advanceLantern(lantern, allies, 0.05);
    }
    assert.equal(lantern.arrived, true);
  });

  test(`${difficulty}: allies guide the lantern instead of pursuing distant enemies, and guards walk into it without attacking it`, () => {
    const lantern = createLantern(1, 1, 0); lantern.x = 500; lantern.y = 400;
    const ally = fighter(0, 0, 200, 400), enemy = fighter(4, 1, 1000, 400);
    const world = { fighters: [ally, enemy], projectiles: [], objectives: [], chests: [], escort: lantern, defendTeam: 0 };
    const ai = new AIController(difficulty);
    assert.ok(ai.decide(ally, world).mx > 0.99);
    ally.body.center.x = 500;
    assert.equal(ai.decide(ally, world).mx, 0);
    ally.body.center = { x: 100, y: 700 };
    enemy.body.center = { x: lantern.x - 60, y: lantern.y };
    const raid = ai.decide(enemy, world);
    assert.equal(raid.attack, false);
    assert.ok(raid.mx > 0.99);
    // Once inside, the guard holds its place to push and still doesn't swing.
    enemy.body.center = { x: lantern.x, y: lantern.y };
    const hold = ai.decide(enemy, world);
    assert.equal(hold.attack, false);
  });

  test(`${difficulty}: an ally fights a guard threatening the lantern`, () => {
    const lantern = createLantern(1, 1, 0); lantern.x = 500; lantern.y = 400;
    const ally = fighter(0, 0, 500, 400), enemy = fighter(4, 1, 500, 560);
    const world = { fighters: [ally, enemy], projectiles: [], objectives: [], chests: [], escort: lantern, defendTeam: 0 };
    const intent = new AIController(difficulty).decide(ally, world);
    assert.ok(intent.my > 0.5);
  });
}

test('escort reinforcements arrive together from opposite sides of the lantern', () => {
  const scene = battle();
  const guards = [scene.fighters[1], fighter(5, 1, 1400, 500), fighter(6, 1, 1400, 500)];
  scene.fighters.push(...guards.slice(1));
  guards.forEach(f => { f.state = 'dead'; });
  scene.escortRespawnT = 0;
  scene.updateEscort(0);
  assert.deepEqual(guards.map(f => f.alive), [true, true, false]);
  assert.ok((guards[0].y - scene.lantern.y) * (guards[1].y - scene.lantern.y) < 0);
});
