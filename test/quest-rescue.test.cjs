const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { Fighter } = load('src/gameplay/Fighter.ts');
const { WEAPONS } = load('src/gameplay/weapons.ts');
const { roleById } = load('src/gameplay/roles.ts');
const { QUEST, PRINCESS_WALL_HP, SOUL_REAPER } = load('src/config/index.ts');
const { QUEST_MAPS, MAPS, getMap, mulberry32 } = load('src/maps/index.ts');
const { TREE_SUMMONS, pickTreeSummon } = load('src/battle/quest/treeRules.ts');

function rescue() {
  const scene = new BattleScene();
  scene.init({ mode: 'quest', slots: [], quest: { stage: QUEST.rescueStage } });
  scene.walls = getMap('prison').obstacles.filter((o) => o.kind === 'cage').map((o) => ({ o, team: 0, hp: 1, rescued: false }));
  scene.countdown = 0;
  scene.questTree = { alive: true, tree: true, hp: 800, maxHp: 800, team: 1 };
  scene.towers.push(scene.questTree);
  scene.fx = { hitSpark() {}, holyFlame() {}, skyBolt() {}, treeRoots() {}, reaperCatch() {}, summonPulse() {} };
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

test('every quest map keeps its stage id, boss music, and goal text', () => {
  assert.deepEqual([...QUEST.maps], ['sanzu', 'yama', 'prison', 'grove', 'seals', 'lantern', 'onihall', 'wardens', 'snare', 'night', 'dirge', 'dragon', 'beacons', 'ambush', 'eclipse']);
  assert.deepEqual(Array.from(QUEST_MAPS, (m) => m.id), [...QUEST.maps]);
  assert.equal(MAPS.length, 42); // prison and the grove remain Quest-only
  assert.ok(!MAPS.some((m) => m.id === 'prison' || m.id === 'grove'));
  for (let stage = 0; stage < QUEST.maps.length; stage++) {
    const scene = new BattleScene();
    scene.init({ mode: 'quest', slots: [], quest: { stage } });
    assert.equal(scene.map.id, QUEST.maps[stage]);
    assert.equal(scene.bgm, stage === QUEST.bossStage || stage === QUEST.wardenStage || stage === QUEST.dirgeStage || stage === QUEST.dragonStage || stage === QUEST.wyvernStage ? 'boss' : 'hell');
  }
  const { T, setLang } = load('src/localization/index.ts');
  for (const lang of ['en', 'zh']) {
    setLang(lang);
    assert.equal(T().questGoals.length, QUEST.maps.length);
    assert.ok(T().questGoals[QUEST.rescueStage]);
    assert.ok(T().questGoals[QUEST.groveStage]);
    assert.ok(T().questStage(4).includes(lang === 'zh' ? '四' : '4'));
    assert.ok(T().questStage(5).includes(lang === 'zh' ? '五' : '5'));
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

test('freeing both princesses and defeating the guards clears the rescue stage', () => {
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
  assert.equal(clears, 1);
  assert.equal(scene.questTree.alive, true);
});

test('both princesses must be freed and every guard defeated, whichever is finished last', () => {
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
  scene.updateQuest(0.05);
  assert.equal(clears, 0); // a guard is still alive
  enemy.state = 'dead';
  scene.updateQuest(0.05);
  assert.equal(clears, 1);
  assert.equal(scene.questTree.alive, true);
});

test('rescuers cannot cross the seal or hurt the tree until both walls are broken', () => {
  const cages = getMap('prison').obstacles.filter((o) => o.kind === 'cage');
  const gate = QUEST.rescue.tree.gateX;
  assert.ok(cages.every((o) => o.x + o.w / 2 < gate));
  assert.ok(gate < QUEST.rescue.tree.x);
  const { scene, party, enemy } = rescue();
  assert.equal(scene.rescueGateOpen, false);
  assert.ok(scene.rescueGateX > gate);
  const line = scene.rescueGateX;
  party.body.reset = (x, y) => { party.body.center.x = x + party.radius; party.body.center.y = y + party.radius; };
  party.body.center.x = line + 80;
  scene.updateRescueGate();
  assert.ok(party.x < line);
  enemy.body.center.x = line + 80;
  scene.updateRescueGate();
  assert.equal(enemy.x, line + 80);
  const hp = scene.questTree.hp;
  scene.damageTower(scene.questTree, 40, party);
  assert.equal(scene.questTree.hp, hp);
  scene.damageTower(scene.questTree, 30, undefined);
  assert.equal(scene.questTree.hp, hp - 30);
  for (const wall of scene.walls) wall.rescued = true;
  scene.damageTower(scene.questTree, 40, party);
  assert.equal(scene.questTree.hp, hp - 70);
  scene.damageTower(scene.questTree, 40, enemy);
  assert.equal(scene.questTree.hp, hp - 70);
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
  scene.updateQuestTree(spell.warn * QUEST.rescue.tree.warnScale - 0.05);
  assert.equal(strikes, 0);
  scene.paused = true;
  scene.updateQuestTree(5);
  assert.equal(strikes, 0);
  scene.paused = false;
  scene.updateQuestTree(0.1);
  assert.equal(strikes, 1);
  assert.equal(scene.questTreeCast, null);
  assert.equal(scene.questTreeT, QUEST.rescue.tree.interval);
  scene.updateQuestTree(0.05);
  assert.equal(scene.questTreeCast, null);
});

test('light summons charge faster, heavy effects retain their timing, and only the caster shows charge progress', () => {
  const warnings = Object.fromEntries(TREE_SUMMONS.map((spell) => [spell.kind, spell.warn]));
  assert.deepEqual(warnings, { soulFire: 0.8, soulThunder: 1.1, soulReaper: 1.6, soulTree: 1.6 });
  for (const spell of TREE_SUMMONS) {
    const { scene, party } = rescue();
    const g = new Proxy({}, { get: () => () => g });
    scene.g = scene.gGlow = scene.gOver = g;
    const progress = [];
    scene.fx.summonCircle = (_g, _glow, _x, _y, value) => progress.push(value);
    scene.fx.targetMark = () => assert.fail('summons must not reveal the target area');
    scene.questTreeCast = { spell, target: party, x: party.x, y: party.y, elapsed: spell.warn * QUEST.rescue.tree.warnScale / 2 };
    scene.renderQuestTree(1);
    assert.deepEqual(progress, [0.5]);
  }
});

for (const spell of TREE_SUMMONS) test(`${spell.kind}: damage/paralysis apply on impact; leaving the warning avoids both`, () => {
  const { scene, party } = rescue();
  const cast = { target: party, spell, x: party.x, y: party.y, elapsed: spell.warn };
  scene.applyQuestTreeHit(cast, true);
  if (spell.kind === 'soulReaper') {
    assert.equal(party.hp, SOUL_REAPER.leaveHp);
    assert.equal(party.stats.taken, 100 - SOUL_REAPER.leaveHp);
    assert.equal(party.paralyzed, true);
  } else {
    assert.equal(party.stats.taken, Math.floor((spell.minDamage + spell.maxDamage) / 2));
    assert.equal(party.paralyzed, party.alive);
  }
  const dodged = rescue();
  const warning = { ...cast, target: dodged.party };
  dodged.party.body.center.x += QUEST.rescue.tree.radius + dodged.party.radius + 1;
  dodged.scene.applyQuestTreeHit(warning, true);
  assert.equal(dodged.party.stats.taken, 0);
  assert.equal(dodged.party.paralyzed, false);
});

test('a Reaper hit ignores protection: 80 or more HP is left at 20, and under 80 dies', () => {
  const spell = TREE_SUMMONS.find((s) => s.kind === 'soulReaper');
  for (const hp of [80, 100, 140]) {
    const { scene, party } = rescue();
    party.hp = hp;
    party.ward(0.35, 10);
    scene.applyQuestTreeHit({ target: party, spell, x: party.x, y: party.y, elapsed: 0 }, true);
    assert.equal(party.hp, SOUL_REAPER.leaveHp);
    assert.equal(party.alive, true);
    assert.equal(party.stats.taken, hp - SOUL_REAPER.leaveHp);
    assert.equal(party.paralyzed, true);
  }
  const { scene, party } = rescue();
  party.hp = 79;
  party.ward(0.5, 10);
  scene.applyQuestTreeHit({ target: party, spell, x: party.x, y: party.y, elapsed: 0 }, true);
  assert.equal(party.alive, false);
  assert.equal(party.stats.taken, 79);
  assert.equal(party.paralyzed, false);
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

test('clearing the rescue stage offers the next trial and carries totals, items and soul', () => {
  const { scene, party } = rescue();
  const route = [0, QUEST.rescueStage, 1, QUEST.groveStage, QUEST.sealStage, QUEST.bossStage];
  scene.quest.route = route;
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
  assert.equal(restarted.quest.stage, 1);
  assert.equal(JSON.stringify(restarted.quest.route), JSON.stringify(route));
  assert.equal(restarted.quest.carry.stats[0].wall, 2800);
  assert.equal(restarted.quest.carry.players[0].soul, 50);
  assert.equal(restarted.quest.carry.players[0].pocket[0].id, 'rice-ball');
});

test('stage 3 states its goal once and keeps the upper help callout off that line', () => {
  const { T, setLang } = load('src/localization/index.ts');
  const { MAP_SCALE, HUD_HEIGHT, WIDTH } = load('src/config/index.ts');
  const { ARENA } = load('src/maps/common.ts');
  const S = MAP_SCALE;
  const walls = getMap('prison').obstacles.filter((o) => o.kind === 'cage').map((o) => ({
    o: { ...o, x: o.x * S, y: (o.y - HUD_HEIGHT) * S, w: o.w * S, h: o.h * S },
    team: 0,
  }));
  const screen = (p) => ({ x: p.x / S, y: HUD_HEIGHT + p.y / S });
  for (const lang of ['zh', 'en']) {
    setLang(lang);
    const scene = new BattleScene();
    scene.init({ mode: 'quest', slots: [], quest: { stage: QUEST.rescueStage, route: [0, 1, QUEST.rescueStage, QUEST.groveStage, QUEST.sealStage, QUEST.bossStage] } });
    const texts = [];
    scene.add = {
      text(x, y, text) {
        const obj = { x, y, text, setOrigin() { return obj; }, setDepth() { return obj; }, setText(value) { obj.text = value; return obj; } };
        texts.push(obj);
        return obj;
      },
    };
    scene.tweens = { add() {} };
    scene.lTop = { add() {} };
    scene.walls = walls;
    scene.showPrincessIntro();
    assert.equal(texts.filter((t) => t.text === T().questRescueGoal || t.text === T().princessGoal).length, 0);
    const banners = [];
    scene.fighters = [];
    scene.showBanner = (msg) => banners.push(msg);
    scene.createQuestHud();
    assert.deepEqual(banners, [T().questStageTitle(QUEST.rescueStage + 1, T().questGoals[QUEST.rescueStage])]);
    const help = texts.filter((t) => t.text === T().help).map(screen);
    assert.equal(help.length, 2);
    const upperWall = walls.map((w) => w.o).sort((a, b) => a.y - b.y)[0];
    const upper = help.sort((a, b) => a.y - b.y)[0];
    assert.ok(upper.x < upperWall.x / S - upperWall.w / S / 2);
    assert.ok(upper.x > WIDTH * 0.4);
    assert.ok(upper.y > ARENA.y + 70);
    const lower = help.sort((a, b) => a.y - b.y)[1];
    const lowerWall = walls.map((w) => w.o).sort((a, b) => a.y - b.y)[1];
    const lowerTop = HUD_HEIGHT + (lowerWall.y - lowerWall.h / 2) / S;
    assert.ok(Math.abs(lower.x - lowerWall.x / S) < 1);
    assert.ok(lower.y < lowerTop);
  }
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

test('two guards stand until both princesses are free, then four come and do not return', () => {
  const scene = new BattleScene();
  scene.init({ mode: 'quest', slots: [{ control: 'kb1' }], quest: { stage: QUEST.rescueStage } });
  assert.equal(scene.slots.filter((s) => s.team === 1 && s.control === 'cpu').length, 4);
  assert.equal(QUEST.rescue.held, 2);
  assert.equal(QUEST.rescue.tree.radius, 120);
  assert.ok(QUEST.rescue.tree.warnScale < 1);
  const guards = [4, 5, 6, 7].map((index) => {
    const body = { center: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, enable: true, reset(x, y) { this.center = { x, y }; } };
    const fighter = new Fighter(index, 0xffffff, WEAPONS[0], [], roleById('ronin'), { labels: [] }, body, scene);
    fighter.team = 1;
    fighter.state = 'dead';
    return fighter;
  });
  scene.fighters = guards;
  scene.walls = [{ rescued: false }, { rescued: false }];
  scene.questTree = {
    alive: true, tree: true, main: true, team: 1, hp: 2000, maxHp: 2000,
    x: 1000, y: 400, w: 80, h: 100, shakeT: 0, rect: {},
    body: { destroy() {} }, collider: { destroy() {} },
  };
  scene.towers = [scene.questTree];
  scene.freeSpot = (spot) => spot;
  scene.spawns = [];
  scene.nameTags = [];
  scene.onRevived = () => {};
  scene.fx = { hitSpark() {}, respawnBeam() {}, smoke() {}, hammerSmash() {} };
  scene.popText = () => {};
  scene.showBanner = () => {};
  const living = () => guards.filter((f) => f.alive).length;
  scene.updateTeamRespawns(0);
  scene.updateTeamRespawns(8);
  assert.equal(living(), 2);
  scene.teamRespawnT[1] = 0;
  scene.updateTeamRespawns(0);
  assert.equal(living(), 2);
  scene.teamRespawnT[1] = 0;
  scene.updateTeamRespawns(0);
  assert.equal(living(), 2);
  scene.walls.forEach((w) => { w.rescued = true; });
  guards[0].state = 'dead';
  scene.teamRespawnT[1] = 0;
  scene.updateTeamRespawns(0);
  assert.equal(living(), 1);
  scene.releaseRescueGuards();
  assert.equal(living(), 4);
  guards[0].state = 'dead';
  scene.teamRespawnT[1] = 0;
  scene.updateTeamRespawns(0);
  assert.equal(living(), 3);
});
