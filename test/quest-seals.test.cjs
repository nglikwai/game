const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { chargeSeal } = load('src/questSeals.ts');
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { AIController } = load('src/controls.ts');
const { Fighter } = load('src/Fighter.ts');
const { WEAPONS } = load('src/weapons.ts');
const { roleById } = load('src/roles.ts');
const { QUEST, nextQuestStage, MAP_SCALE, HUD_HEIGHT } = load('src/config.ts');
const { getMap, MAPS, ARENA, mulberry32 } = load('src/maps/index.ts');

const point = (allies = 2) => ({ team: 0, x: 500, y: 500, radius: 90, allies, progress: 0, sealed: false, contested: false });
const occupant = (team, x = 500, alive = true) => ({ team, x, y: 500, alive });

function fighter(index, team, x = 500, y = 500) {
  const body = { center: { x, y }, velocity: { x: 0, y: 0 }, enable: true,
    setVelocity() {}, reset(x, y) { this.center = { x: x + 18, y: y + 18 }; } };
  const f = new Fighter(index, 0xffffff, WEAPONS[0], [], roleById('ronin'), { labels: [] }, body, {});
  f.team = team;
  return f;
}

function battle(stage = QUEST.sealStage) {
  const scene = new BattleScene();
  scene.init({ mode: 'quest', slots: [{ control: 'cpu', role: 'ronin' }], quest: { stage } });
  scene.countdown = 0;
  scene.fighters = [fighter(0, 0), fighter(4, 1, 1400, 500)];
  scene.spawns[4] = { x: 1400, y: 500 };
  scene.freeSpot = (p) => p;
  scene.fx = { sparks() {}, smoke() {} };
  scene.showBanner = () => {};
  return scene;
}

test('the new Quest-only altar courtyard sits before the lantern escort and has open capture zones', () => {
  assert.equal(QUEST.sealStage, QUEST.escortStage - 1);
  assert.equal(QUEST.maps[QUEST.sealStage], 'seals');
  const map = getMap('seals');
  assert.ok(!MAPS.includes(map));
  for (const p of QUEST.seals.spots) {
    const r = QUEST.seals.radius;
    assert.ok(p.x - r > ARENA.x && p.x + r < ARENA.x + ARENA.w);
    assert.ok(p.y - r > ARENA.y && p.y + r < ARENA.y + ARENA.h);
    for (const o of map.obstacles) {
      const dx = Math.max(0, Math.abs(p.x - o.x) - o.w / 2);
      const dy = Math.max(0, Math.abs(p.y - o.y) - o.h / 2);
      assert.ok(Math.hypot(dx, dy) > r + 18);
    }
    for (const c of map.chests) assert.ok(Math.hypot(c.x - p.x, c.y - p.y) > r + 30);
  }
  const peak = getMap('peak');
  assert.equal(JSON.stringify(map.lightning), JSON.stringify(peak.lightning));
  const ctx = new Proxy({}, { get: (_, key) => (...args) => {
    for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg));
    if (key === 'createRadialGradient') return { addColorStop() {} };
  }, set: () => true });
  map.paint(ctx, mulberry32(42));
});

test('the three rings need 1, 2 and 3 allies, and extra allies do not charge faster', () => {
  assert.equal(JSON.stringify(QUEST.seals.allies), '[1,2,3]');
  assert.equal(QUEST.seals.chargeTime, 40);
  const one = point(1);
  assert.equal(chargeSeal(one, [occupant(0)], QUEST.seals.chargeTime), true);
  const two = point(2);
  const half = QUEST.seals.chargeTime / 2;
  assert.equal(chargeSeal(two, [occupant(0)], QUEST.seals.chargeTime), false);
  assert.equal(two.progress, 0);
  assert.equal(chargeSeal(two, [occupant(0), occupant(0)], half), false);
  assert.equal(two.progress, 0.5);
  const stacked = point(2);
  chargeSeal(stacked, [occupant(0), occupant(0), occupant(0), occupant(0)], half);
  assert.equal(stacked.progress, 0.5);
  chargeSeal(two, [], 20);
  assert.equal(two.progress, 0.5);
  chargeSeal(two, [occupant(0, 650), occupant(0, 500, false), occupant(0)], 20);
  assert.equal(two.progress, 0.5);
  assert.equal(chargeSeal(two, [occupant(0), occupant(0)], half), true);
  assert.equal(two.sealed, true);
  const three = point(3);
  assert.equal(chargeSeal(three, [occupant(0), occupant(0)], QUEST.seals.chargeTime), false);
  assert.equal(three.progress, 0);
  assert.equal(chargeSeal(three, [occupant(0), occupant(0), occupant(0)], QUEST.seals.chargeTime), true);
});

test('living guards contest a seal; removing the guard resumes its saved progress', () => {
  const seal = point();
  const quarter = QUEST.seals.chargeTime / 4;
  chargeSeal(seal, [occupant(0), occupant(0)], quarter);
  chargeSeal(seal, [occupant(0), occupant(0), occupant(1)], 50);
  assert.equal(seal.contested, true);
  assert.equal(seal.progress, 0.25);
  assert.equal(chargeSeal(seal, [occupant(0), occupant(0), occupant(1, 500, false)], QUEST.seals.chargeTime - quarter), true);
  assert.equal(seal.contested, false);
});

test('battle creates correctly scaled seals, clears only after all three and every guard is dead, and resets progress for retry', () => {
  const scene = battle();
  const ally = fighter(1, 0);
  scene.fighters.push(ally);
  assert.equal(scene.seals.length, 3);
  assert.equal(JSON.stringify(scene.seals.map((p) => p.allies)), '[1,2,3]');
  scene.seals.forEach((p, i) => {
    assert.equal(p.x, QUEST.seals.spots[i].x * MAP_SCALE);
    assert.equal(p.y, (QUEST.seals.spots[i].y - HUD_HEIGHT) * MAP_SCALE);
  });
  let clears = 0;
  scene.questClear = () => clears++;
  scene.questFail = () => assert.fail('living party must not fail');
  const third = fighter(2, 0);
  scene.fighters.push(third);
  scene.seals.forEach((p) => {
    const holders = [scene.fighters[0], ally, third].slice(0, p.allies);
    for (const f of [scene.fighters[0], ally, third]) f.body.center = holders.includes(f) ? { x: p.x, y: p.y } : { x: 0, y: 0 };
    scene.updateQuest(QUEST.seals.chargeTime);
    assert.equal(p.sealed, true);
  });
  assert.equal(clears, 0);
  assert.equal(scene.fighters[1].alive, true);
  scene.fighters[1].state = 'dead';
  scene.fighters[1].hp = 0;
  scene.updateQuest(0);
  assert.equal(clears, 1);
  scene.init({ mode: 'quest', slots: [], quest: { stage: QUEST.sealStage } });
  assert.ok(scene.seals.every((p) => !p.sealed && p.progress === 0));
});

test('guards return one at a time on the seal timer and stop when the seals are all broken', () => {
  const scene = battle();
  const guard = scene.fighters[1];
  guard.state = 'dead'; guard.hp = 0; guard.soul = 40; guard.pocket.push({ id: 'rice-ball' });
  scene.deathTime.set(guard, 2); scene.respawnTimers.set(guard, Infinity);
  scene.updateSeals(QUEST.seals.respawnEvery - 0.01);
  assert.equal(guard.alive, false);
  scene.updateSeals(0.02);
  assert.equal(guard.alive, true);
  assert.equal(guard.hp, guard.maxHp * 0.75);
  assert.equal(guard.pocket.length, 0);
  assert.equal(guard.soul, 20);
  assert.equal(scene.deathTime.has(guard), false);
  guard.state = 'dead';
  scene.seals.forEach((p) => { p.sealed = true; });
  scene.updateSeals(100);
  assert.equal(guard.alive, false);
});

test('previews, pauses, and end screens freeze charging and guard respawns', () => {
  for (const stop of ['countdown', 'paused', 'over']) {
    const scene = battle();
    scene[stop] = stop === 'countdown' ? 1 : true;
    scene.fighters[0].body.center = { ...scene.seals[0] };
    scene.fighters[1].state = 'dead';
    scene.updateSeals(100);
    assert.equal(scene.seals[0].progress, 0);
    assert.equal(scene.fighters[1].alive, false);
    assert.equal(scene.sealRespawnT, QUEST.seals.respawnEvery);
  }
});

for (const stage of [QUEST.groveStage, QUEST.sealStage, QUEST.escortStage]) test(`stage ${stage + 1} advances through loading with items, soul and accumulated stats`, () => {
  const scene = battle(stage);
  let modal, entered;
  scene.time = { delayedCall() {} };
  scene.showEndBanner = (_text, _color, next) => next();
  scene.openModal = (options) => { modal = options; };
  scene.scene = { start: (key, data) => { assert.equal(key, 'Loading'); entered = data; } };
  const party = scene.fighters[0];
  scene.stats[0] = party.stats;
  party.stats.kos = 7; party.soul = 60; party.pocket.push({ id: 'rice-ball' });
  scene.questClear();
  const buttons = [];
  const graphics = new Proxy({}, { get: () => () => graphics });
  scene.add = { graphics: () => graphics, text: () => ({ setOrigin() { return this; } }) };
  modal.build({ x: 330, y: 210, w: 620, h: 300, content: { add() {} }, nav: { add: (button) => buttons.push(button) } });
  buttons.find((b) => b.id === 'next').onEnter();
  assert.equal(entered.quest.stage, nextQuestStage(scene.quest.route, stage));
  assert.deepEqual(Array.from(entered.quest.route), Array.from(scene.quest.route));
  assert.equal(entered.quest.carry.stats[0].kos, 7);
  assert.equal(entered.quest.carry.players[0].soul, 60);
  assert.equal(entered.quest.carry.players[0].pocket[0].id, 'rice-ball');
});

for (const difficulty of ['standard', 'hard']) {
  test(`${difficulty}: allies approach and hold an unbroken seal, then move to the next one`, () => {
    const self = fighter(0, 0, 200, 500);
    const a = point(), b = { ...point(), x: 900 };
    const world = { fighters: [self], projectiles: [], objectives: [], chests: [], defendTeam: 0, capturePoints: [a, b] };
    const ai = new AIController(difficulty);
    assert.ok(ai.decide(self, world).mx > 0.99);
    self.body.center.x = 500;
    const holding = ai.decide(self, world);
    assert.equal(holding.mx, 0); assert.equal(holding.my, 0); assert.equal(holding.attack, false);
    a.sealed = true;
    assert.ok(ai.decide(self, world).mx > 0.99);
    b.sealed = true;
    assert.equal(ai.decide(self, world).mx, 0);
  });

  test(`${difficulty}: allies defend a threatened teammate before capturing a seal`, () => {
    const self = fighter(0, 0, 500, 500);
    const ally = fighter(1, 0, 500, 1000); ally.hp = 20;
    const enemy = fighter(4, 1, 500, 900);
    const world = { fighters: [self, ally, enemy], projectiles: [], objectives: [], chests: [], defendTeam: 0, capturePoints: [{ ...point(), x: 200 }] };
    const intent = new AIController(difficulty).decide(self, world);
    assert.ok(intent.my > 0.5);
    assert.ok(Math.abs(intent.mx) < 0.6);
  });
}
