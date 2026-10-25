const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { Fighter } = load('src/Fighter.ts');
const { WEAPONS } = load('src/weapons.ts');
const { roleById } = load('src/roles.ts');
const { QUEST, PRINCESS_WALL_HP } = load('src/config.ts');
const { QUEST_MAPS, MAPS, getMap, mulberry32 } = load('src/maps/index.ts');
const { TREE_SUMMONS, pickTreeSummon } = load('src/questTree.ts');

function rescue() {
  const scene = new BattleScene();
  scene.init({ mode: 'quest', slots: [], quest: { stage: QUEST.rescueStage } });
  scene.walls = getMap('prison').obstacles.filter((o) => o.kind === 'cage').map((o) => ({ o, team: 0, hp: 1, rescued: false }));
  scene.countdown = 0;
  scene.questTree = { alive: true, tree: true, hp: 800, maxHp: 800, team: 1 };
  scene.towers.push(scene.questTree);
  scene.fx = { hitSpark() {}, holyFlame() {}, skyBolt() {}, treeRoots() {}, reaperCatch() {} };
  scene.popText = () => {};
  scene.summonResult = () => {};
  scene.screenFlash = () => {};
  const makeFighter = (index, team) => {
    const body = { center: { x: 600, y: 400 }, velocity: { x: 0, y: 0 }, setVelocity() {} };
    const fighter = new Fighter(index, 0xffffff, WEAPONS[0], [], roleById('ronin'), { labels: [] }, body, scene);
    fighter.team = team;
    return fighter;
  };
  const party = makeFighter(0, 0);
  const enemy = makeFighter(4, 1);
  scene.fighters = [party, enemy];
  return { scene, party, enemy, makeFighter };
}

test('Quest inserts the rescue stage before the boss, with four stages and the correct music', () => {
  assert.deepEqual([...QUEST.maps], ['sanzu', 'yama', 'prison', 'onihall']);
  assert.deepEqual(Array.from(QUEST_MAPS, (m) => m.id), [...QUEST.maps]);
  assert.equal(MAPS.length, 42); // prison remains Quest-only
  assert.ok(!MAPS.some((m) => m.id === 'prison'));
  for (let stage = 0; stage < QUEST.maps.length; stage++) {
    const scene = new BattleScene();
    scene.init({ mode: 'quest', slots: [], quest: { stage } });
    assert.equal(scene.map.id, QUEST.maps[stage]);
    assert.equal(scene.bgm, stage === QUEST.bossStage ? 'boss' : 'hell');
  }
  const { T, setLang } = load('src/i18n.ts');
  for (const lang of ['en', 'zh']) {
    setLang(lang);
    assert.equal(T().questGoals.length, 4);
    assert.ok(T().questGoals[QUEST.rescueStage]);
    assert.ok(T().questStage(4).includes(lang === 'zh' ? '四' : '4'));
  }
});

test('prison has exactly two party princesses with the summoning tree behind both walls', () => {
  const map = getMap('prison');
  const walls = map.obstacles.filter((o) => o.kind === 'cage');
  assert.equal(walls.length, 2);
  assert.ok(walls.every((o) => o.team === 0 && o.x < QUEST.rescue.tree.x));
  assert.ok(map.obstacles.some((o) => o.kind === 'deadtree' && o.x === QUEST.rescue.tree.x));
  for (const chest of map.chests) for (const o of map.obstacles) {
    assert.ok(Math.abs(chest.x - o.x) >= o.w / 2 + (chest.big ? 26 : 17) || Math.abs(chest.y - o.y) >= o.h / 2 + (chest.big ? 20 : 14));
  }
  const ctx = new Proxy({}, { get: (_, name) => (...args) => {
    for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg));
    if (name === 'createRadialGradient') return { addColorStop() {} };
  }, set: () => true });
  map.paint(ctx, mulberry32(8));
});

test('both walls scale with party size and remain stronger than versus walls', () => {
  for (const size of [1, 2, 3, 4]) {
    const { scene, makeFighter } = rescue();
    scene.fighters = Array.from({ length: size }, (_, n) => makeFighter(n, 0));
    scene.configurePrincessWalls();
    for (const wall of scene.walls) {
      assert.equal(wall.hp, 900 + 250 * size);
      assert.equal(wall.maxHp, wall.hp);
      assert.ok(wall.hp > PRINCESS_WALL_HP * size / 2);
    }
  }
});

test('defeating guards or freeing one princess does not clear the rescue stage', () => {
  const { scene, enemy } = rescue();
  let clears = 0;
  scene.questClear = () => clears++;
  enemy.state = 'dead';
  scene.updateQuest(0.05);
  assert.equal(clears, 0);
  scene.walls[0].rescued = true;
  scene.updateQuest(0.05);
  assert.equal(clears, 0);
  scene.walls[1].rescued = true;
  scene.updateQuest(0.05);
  assert.equal(clears, 0); // the living tree is still an objective
  scene.questTree.alive = false;
  scene.updateQuest(0.05);
  assert.equal(clears, 1);
});

test('both princesses, the tree and the guards must all be cleared, whichever is finished last', () => {
  const { scene, enemy } = rescue();
  let clears = 0;
  let finishes = 0;
  scene.questClear = () => { clears++; scene.over = true; };
  scene.endRound = () => finishes++;
  scene.world = { objectives: scene.walls.map((w) => ({ ...w.o })) };
  const object = (x, y) => ({ x, y, angle: 0, setStrokeStyle() { return this; }, setAngle() { return this; }, setOrigin() { return this; } });
  scene.add = { rectangle: object, text: object };
  scene.lTop = { add() {} };
  scene.tweens = { add() {} };
  scene.showBanner = () => {};
  scene.breakWall(scene.walls[0]);
  assert.equal(clears, 0);
  assert.equal(scene.world.objectives.length, 1);
  scene.breakWall(scene.walls[1]);
  assert.equal(clears, 0);
  assert.equal(finishes, 0);
  assert.equal(scene.world.objectives.length, 0);
  scene.questTree.alive = false;
  scene.updateQuest(0.05);
  assert.equal(clears, 0); // a guard is still alive after the tree falls
  enemy.state = 'dead';
  scene.updateQuest(0.05);
  assert.equal(clears, 1);
});

test('tree randomly selects from all four summon types and only targets living, vulnerable party members', () => {
  assert.equal(new Set(TREE_SUMMONS.map((s) => s.kind)).size, 4);
  for (let n = 0; n < 4; n++) assert.equal(pickTreeSummon(() => (n + 0.5) / 4), TREE_SUMMONS[n]);
  const { scene, party, makeFighter } = rescue();
  const dead = makeFighter(1, 0); dead.state = 'dead';
  const casting = makeFighter(2, 0); casting.state = 'casting';
  scene.fighters.push(dead, casting);
  scene.questTreeT = 0;
  scene.updateQuestTree(0.05);
  assert.equal(scene.questTreeCast.target, party);
  assert.equal(scene.questTreeCast.x, party.x);
  assert.equal(scene.questTreeCast.y, party.y);
});

for (const spell of TREE_SUMMONS) test(`${spell.kind}: tree warning follows its effect weight, pauses, then waits for its next cast`, () => {
  const { scene, party } = rescue();
  let strikes = 0;
  scene.strikeQuestTree = () => strikes++;
  scene.questTreeCast = { spell, target: party, x: party.x, y: party.y, elapsed: 0 };
  scene.updateQuestTree(spell.warn - 0.1);
  assert.equal(strikes, 0);
  scene.paused = true;
  scene.updateQuestTree(5);
  assert.equal(strikes, 0);
  scene.paused = false;
  scene.updateQuestTree(0.2);
  assert.equal(strikes, 1);
  assert.equal(scene.questTreeCast, null);
  assert.equal(scene.questTreeT, QUEST.rescue.tree.interval);
  scene.updateQuestTree(0.05);
  assert.equal(scene.questTreeCast, null);
});

test('light summons warn faster, heavy effects retain their timing, and warning graphics match each impact', () => {
  const warnings = Object.fromEntries(TREE_SUMMONS.map((spell) => [spell.kind, spell.warn]));
  assert.deepEqual(warnings, { soulFire: 0.8, soulThunder: 1.1, soulReaper: 1.6, soulTree: 1.6 });
  for (const spell of TREE_SUMMONS) {
    const { scene, party } = rescue();
    const g = new Proxy({}, { get: () => () => g });
    scene.g = scene.gGlow = scene.gOver = g;
    const progress = [];
    scene.fx.summonCircle = (_g, _glow, _x, _y, value) => progress.push(value);
    scene.fx.targetMark = (_g, _x, _y, value) => progress.push(value);
    scene.questTreeCast = { spell, target: party, x: party.x, y: party.y, elapsed: spell.warn / 2 };
    scene.renderQuestTree(1);
    assert.deepEqual(progress, [0.5, 0.5]);
  }
});

for (const spell of TREE_SUMMONS) test(`${spell.kind}: damage/paralysis apply on impact; leaving the warning avoids both`, () => {
  const { scene, party } = rescue();
  const cast = { target: party, spell, x: party.x, y: party.y, elapsed: spell.warn };
  scene.applyQuestTreeHit(cast, true);
  assert.equal(party.stats.taken, Math.floor((spell.minDamage + spell.maxDamage) / 2));
  assert.equal(party.paralyzed, party.alive); // a fatal Reaper hit cannot paralyse a dead fighter
  const dodged = rescue();
  const warning = { ...cast, target: dodged.party };
  dodged.party.body.center.x += QUEST.rescue.tree.radius + dodged.party.radius + 1;
  dodged.scene.applyQuestTreeHit(warning, true);
  assert.equal(dodged.party.stats.taken, 0);
  assert.equal(dodged.party.paralyzed, false);
});

test('Reaper impact waits for its swing and cannot hurt anyone after stage completion', () => {
  const { scene, party } = rescue();
  const callbacks = [];
  scene.time = { delayedCall: (_delay, callback) => callbacks.push(callback) };
  const spell = TREE_SUMMONS.find((s) => s.kind === 'soulReaper');
  scene.strikeQuestTree({ target: party, spell, x: party.x, y: party.y, elapsed: 2 });
  assert.equal(party.stats.taken, 0);
  assert.equal(callbacks.length, 1);
  scene.over = true;
  callbacks[0]();
  assert.equal(party.stats.taken, 0);
  scene.over = false;
  scene.questTree.alive = false;
  callbacks[0]();
  assert.equal(party.stats.taken, 0);
  scene.updateQuestTree(10);
  assert.equal(scene.questTreeCast, null);
});

test('clearing the rescue stage offers the boss next and carries totals, items and soul', () => {
  const { scene, party } = rescue();
  const queued = [];
  let modal;
  let restarted;
  scene.time = { delayedCall: (_delay, fn) => queued.push(fn) };
  scene.showEndBanner = (_msg, _color, next) => next();
  scene.openModal = (options) => { modal = options; };
  scene.scene = { start: (key, data) => { assert.equal(key, 'Loading'); restarted = data; } };
  scene.questTreeCast = { target: party };
  scene.stats[0] = party.stats;
  party.stats.wall = 2800;
  party.soul = 50;
  party.pocket.push({ id: 'rice-ball' });
  scene.questClear();
  assert.equal(scene.over, true);
  assert.equal(scene.questTreeCast, null);
  const buttons = [];
  const graphics = new Proxy({}, { get: () => () => graphics });
  scene.add = {
    graphics: () => graphics,
    text: () => ({ setOrigin() { return this; } }),
  };
  modal.build({ x: 330, y: 210, w: 620, h: 300, content: { add() {} }, nav: { add: (button) => buttons.push(button) } });
  buttons.find((b) => b.id === 'next').onEnter();
  assert.equal(restarted.quest.stage, QUEST.bossStage);
  assert.equal(restarted.quest.carry.stats[0].wall, 2800);
  assert.equal(restarted.quest.carry.players[0].soul, 50);
  assert.equal(restarted.quest.carry.players[0].pocket[0].id, 'rice-ball');
});

test('retry restores the current rescue stage and its original carried state', () => {
  const { scene } = rescue();
  let restarted;
  scene.scene = { start: (key, data) => { assert.equal(key, 'Loading'); restarted = data; } };
  scene.restartRound();
  assert.equal(restarted.quest.stage, QUEST.rescueStage);
  const next = new BattleScene();
  next.init(restarted);
  assert.equal(next.map.id, 'prison');
  assert.equal(next.questTreeCast, null);
  assert.equal(next.questTreeT, QUEST.rescue.tree.initialDelay);
});
