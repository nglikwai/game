const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { layoutPoint } = load('@/maps/layout.ts');
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { Fighter } = load('src/gameplay/Fighter.ts');
const { WEAPONS } = load('src/gameplay/weapons.ts');
const { roleById } = load('src/gameplay/roles.ts');
const { QUEST, MAP_SCALE, HUD_HEIGHT } = load('src/config/index.ts');
const { getMap } = load('src/maps/index.ts');

function fighter(index, team) {
  const body = {
    center: { x: 400 + index * 20, y: 400 }, velocity: { x: 0, y: 0 }, enable: true,
    setVelocity() {}, reset(x, y) { this.center.x = x; this.center.y = y; },
  };
  const f = new Fighter(index, 0xff0000 + index, WEAPONS[0], [], roleById('ronin'), { labels: [] }, body, {});
  f.team = team;
  f.x = body.center.x;
  f.y = body.center.y;
  return f;
}

function scene(extra = {}) {
  const battle = new BattleScene();
  battle.init({
    mode: 'quest',
    slots: [
      { control: 'keys', team: 0 },
      { control: 'cpu', team: 0 },
      { control: 'cpu', team: 0 },
      { control: 'off', team: 0 },
    ],
    quest: { stage: QUEST.snareStage, ...extra },
  });
  battle.countdown = 0;
  battle.showBanner = () => {};
  battle.popText = () => {};
  battle.freeSpot = (p) => p;
  battle.fx = { respawnBeam() {}, hitSpark() {}, summonPulse() {}, reaperCatch() {}, holyFlame() {}, skyBolt() {}, treeRoots() {} };
  return battle;
}

function physics(battle) {
  battle.physics = { add: { staticBody: () => ({ destroy() {} }), collider: () => ({ destroy() {} }) } };
  battle.add = {
    text: () => ({ setOrigin() { return this; }, setAlpha() {} }),
    graphics: () => ({ setDepth() { return this; }, clear() {}, fillStyle() { return this; }, fillRect() {} }),
  };
  battle.lTop = { add() {} };
}

test('the snare is a quest map of two small trees, with three enemies', () => {
  const map = getMap('snare');
  assert.equal(QUEST.maps[QUEST.snareStage], 'snare');
  assert.equal(map.obstacles.filter((o) => o.kind === 'deadtree').length, 0);
  assert.equal(QUEST.snare.spots.length, 2);
  assert.ok(QUEST.snare.radius < QUEST.grove.radius);
  assert.ok(QUEST.snare.hpBase < QUEST.grove.hpBase);
  const battle = scene();
  assert.equal(battle.slots.filter((s) => s.team === 1 && s.control === 'cpu').length, QUEST.snare.enemies);
});

test('two allies start inside the trees and the first fighter stays free to break them', () => {
  const battle = scene();
  physics(battle);
  battle.fighters = [fighter(0, 0), fighter(1, 0), fighter(2, 0), fighter(3, 1)];
  const random = Math.random;
  Math.random = () => 0;
  battle.placeSnareTrees(3);
  Math.random = random;
  assert.deepEqual([...battle.snareTrees.map((t) => t.grove)], ['summon', 'illusion']);
  assert.equal(battle.snareTrees[0].team, 1);
  assert.ok(battle.snareTrees[0].hp > battle.snareTrees[1].hp);
  assert.equal(battle.fighters[0].trapped, false);
  assert.equal(battle.fighters[1].trapped, true);
  assert.equal(battle.fighters[2].trapped, true);
  assert.equal(battle.snareTrees[0].prisoner, battle.fighters[1]);
  assert.equal(battle.fighters[3].trapped, false);
  const S = MAP_SCALE;
  QUEST.snare.spots.forEach((spot, i) => {
    assert.equal(battle.snareTrees[i].x, layoutPoint(battle.map, spot).x * S);
    assert.equal(battle.snareTrees[i].y, (layoutPoint(battle.map, spot).y - HUD_HEIGHT) * S);
    assert.ok(battle.snareTrees[i].w < 90);
  });
});

test('a solo fighter is not sealed, and destroying a tree frees its prisoner', () => {
  const battle = scene();
  physics(battle);
  const only = fighter(0, 0);
  battle.fighters = [only];
  battle.placeSnareTrees(1);
  assert.equal(only.trapped, false);
  battle.fighters = [fighter(0, 0), fighter(1, 0)];
  battle.snareTrees = [];
  battle.towers = [];
  battle.placeSnareTrees(2);
  const trapped = battle.fighters.find((f) => f.trapped);
  const tree = battle.snareTrees.find((t) => t.prisoner === trapped);
  battle.releaseSnarePrisoner(tree);
  assert.equal(trapped.trapped, false);
  assert.equal(trapped.alive, true);
  assert.equal(trapped.body.enable, true);
});

test('the stage clears only after both trees fall and the enemies are gone', () => {
  const battle = scene();
  const party = [fighter(0, 0), fighter(1, 0), fighter(2, 0)];
  const foe = fighter(3, 1);
  battle.fighters = [...party, foe];
  battle.snareTrees = [
    { grove: 'summon', alive: true, snare: true },
    { grove: 'illusion', alive: true, snare: true },
  ];
  let cleared = 0;
  let failed = 0;
  battle.questClear = () => cleared++;
  battle.questFail = () => failed++;
  battle.updateQuest(0.05);
  assert.equal(cleared, 0);
  battle.snareTrees.forEach((t) => { t.alive = false; });
  battle.updateQuest(0.05);
  assert.equal(cleared, 0);
  foe.hp = 0;
  foe.state = 'dead';
  battle.updateQuest(0.05);
  assert.equal(cleared, 1);
  party[0].hp = 0;
  party[0].state = 'dead';
  party[1].trapped = true;
  party[2].trapped = true;
  battle.updateQuest(0.05);
  assert.equal(failed, 1);
});

test('the summon sapling marks a free ally on the trapped side', () => {
  const battle = scene();
  const free = fighter(0, 0);
  const trapped = fighter(1, 0);
  trapped.trapped = true;
  const foe = fighter(2, 1);
  battle.fighters = [free, trapped, foe];
  battle.snareTrees = [{ grove: 'summon', alive: true, x: 10, y: 20 }];
  battle.snareSummonT = 0;
  const random = Math.random;
  Math.random = () => 0;
  battle.updateSnare(0.01);
  Math.random = random;
  assert.equal(battle.snareCast.target, free);
  battle.dealDamage(foe, trapped, 40, 1, 0, 0, 0);
  assert.equal(trapped.hp, trapped.maxHp);
});

test('Hell seals its own side, and falling trees do not by themselves lose the stage', () => {
  const battle = scene({ side: 'hell' });
  battle.lobbySlots = [
    { control: 'keys', team: 1, questSide: 'hell' },
    { control: 'cpu', team: 1, questSide: 'hell' },
    { control: 'cpu', team: 1, questSide: 'hell' },
    { control: 'off', team: 1, questSide: 'hell' },
  ];
  physics(battle);
  battle.fighters = [fighter(0, 0), fighter(4, 1), fighter(5, 1), fighter(6, 1)];
  battle.placeSnareTrees(3);
  assert.ok(battle.snareTrees.every((t) => t.team === 0));
  assert.equal(battle.fighters.filter((f) => f.team === 1 && f.trapped).length, 2);
  assert.equal(battle.fighters[1].trapped, false);
  let failed = 0;
  battle.questFail = () => failed++;
  battle.snareTrees.forEach((t) => { t.alive = false; });
  battle.updateQuest(0.05);
  assert.equal(failed, 0);
});
