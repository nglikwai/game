const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { nightBossRole, bossRole } = load('@/battle/quest/roster.ts');
const { Fighter } = load('src/Fighter.ts');
const { WEAPONS } = load('src/weapons.ts');
const { roleById } = load('src/roles.ts');
const { QUEST, QUEST_FIGHTS, MAP_SCALE } = load('src/config.ts');
const { getMap } = load('src/maps/index.ts');

function fighter(index, team, x = 200, y = 200) {
  const body = {
    center: { x, y }, velocity: { x: 0, y: 0 }, enable: true,
    setVelocity() {}, reset(nx, ny) { this.center.x = nx; this.center.y = ny; },
  };
  const f = new Fighter(index, 0xffffff, WEAPONS[0], [], roleById('ronin'), { labels: [] }, body, {});
  f.team = team;
  return f;
}

function battle() {
  const scene = new BattleScene();
  scene.init({
    mode: 'quest',
    slots: [
      { control: 'keys', team: 0 },
      { control: 'off', team: 0 },
      { control: 'off', team: 0 },
      { control: 'off', team: 0 },
    ],
    quest: { stage: QUEST.nightStage },
  });
  scene.countdown = 0;
  scene.popText = () => {};
  scene.fx = { hitSpark() {}, holyFlame() {}, smoke() {} };
  scene.dealDamage = (_from, to, dmg) => { to.hp -= dmg; };
  return scene;
}

test('the night alley is an opening fight with four lanterns and a full enemy squad', () => {
  assert.equal(QUEST.maps[QUEST.nightStage], 'night');
  assert.ok(QUEST_FIGHTS.includes(QUEST.nightStage));
  const map = getMap('night');
  assert.equal(map.obstacles.filter((o) => o.kind === 'lantern').length, 4);
  assert.equal(QUEST.night.enemies, 4);
  assert.ok(QUEST.night.hp > 1);
  const scene = battle();
  assert.equal(scene.slots.filter((s) => s.team === 1 && s.control === 'cpu').length, 4);
  assert.equal(scene.bgm, 'hell');
  assert.equal(scene.nightCandles.length, 4);
  assert.ok(scene.nightCandles.every((c) => c.lit));
});

test('the alley clears only when every enemy is down', () => {
  const scene = battle();
  const foe = fighter(4, 1);
  scene.fighters = [fighter(0, 0), foe];
  let cleared = 0;
  scene.questClear = () => cleared++;
  scene.questFail = () => assert.fail('a living party must not lose');
  scene.updateQuest(0.05);
  assert.equal(cleared, 0);
  foe.hp = 0;
  foe.state = 'dead';
  scene.updateQuest(0.05);
  assert.equal(cleared, 1);
});

test('the Night Oni is a small boss standing with the four enemies', () => {
  const scene = battle();
  assert.equal(scene.slots.filter((s) => s.team === 1 && s.control === 'cpu').length, 4);
  const captain = nightBossRole(1);
  assert.ok(captain.maxHp > roleById('ronin').maxHp * QUEST.night.hp);
  assert.ok(captain.maxHp < bossRole(1).maxHp);
  scene.physics = { add: { body() { return { setCircle() {}, setCollideWorldBounds() {} }; } } };
  scene.add = {
    image() { return { setScale() { return this; } }; },
    text() { return { setOrigin() { return this; } }; },
  };
  scene.lSprites = { add() {} };
  scene.lTop = { add() {} };
  scene.textures = { exists() { return true; } };
  scene.spawnNightBoss(1);
  assert.equal(scene.fighters.length, 1);
  const boss = scene.fighters[0];
  assert.equal(boss.boss, true);
  assert.equal(boss.team, 1);
  assert.equal(boss.hp, captain.maxHp);
  assert.equal(boss.skills.filter(Boolean).length, 4);
});

test('the alley stays up while the Night Oni is alive', () => {
  const scene = battle();
  const grunt = fighter(4, 1);
  const boss = fighter(8, 1);
  boss.boss = true;
  scene.fighters = [fighter(0, 0), grunt, boss];
  let cleared = 0;
  scene.questClear = () => cleared++;
  scene.questFail = () => assert.fail('a living party must not lose');
  grunt.hp = 0;
  grunt.state = 'dead';
  scene.updateQuest(0.05);
  assert.equal(cleared, 0);
  boss.hp = 0;
  boss.state = 'dead';
  scene.updateQuest(0.05);
  assert.equal(cleared, 1);
});

test('a candle flare scorches heroes in its light and leaves the squad alone', () => {
  const scene = battle();
  const candle = scene.nightCandles[0];
  for (const other of scene.nightCandles) other.timer = 999;
  candle.timer = 0;
  const hero = fighter(0, 0, candle.x, candle.y);
  const foe = fighter(4, 1, candle.x + 12, candle.y);
  const far = fighter(1, 0, candle.x + QUEST.night.lantern * MAP_SCALE + hero.radius + 40, candle.y);
  hero.hp = foe.hp = far.hp = 100;
  scene.fighters = [hero, foe, far];
  scene.questClear = () => {};
  scene.questFail = () => assert.fail('the flare must not end the stage');
  scene.updateQuest(0.01);
  assert.equal(candle.warn, 0);
  scene.updateQuest(QUEST.night.flareWarn);
  assert.ok(hero.hp < 100);
  assert.equal(foe.hp, 100);
  assert.equal(far.hp, 100);
  assert.equal(candle.lit, true);
  assert.equal(candle.warn, null);
});

test('a hero can blow a candle out, and the flame climbs back', () => {
  const scene = battle();
  const candle = scene.nightCandles[0];
  for (const other of scene.nightCandles) other.timer = 999;
  const hero = fighter(0, 0, candle.x, candle.y);
  const foe = fighter(4, 1, candle.x, candle.y);
  scene.fighters = [hero, foe];
  scene.questClear = () => {};
  scene.questFail = () => {};
  scene.onSwingActive(hero);
  assert.equal(candle.lit, false);
  assert.equal(candle.warn, null);
  candle.lit = true;
  candle.warn = 0.4;
  scene.onSwingActive(foe);
  assert.equal(candle.lit, true);
  candle.lit = false;
  candle.timer = 0.05;
  scene.updateQuest(0.1);
  assert.equal(candle.lit, true);
});

test('hell keeps the candles burning while the heroes are still in the alley', () => {
  const scene = new BattleScene();
  scene.init({
    mode: 'quest',
    slots: [
      { control: 'keys', team: 0, questSide: 'hell' },
      { control: 'off', team: 0 },
      { control: 'off', team: 0 },
      { control: 'off', team: 0 },
    ],
    quest: { stage: QUEST.nightStage, side: 'hell', rule: 'hell' },
  });
  scene.countdown = 0;
  scene.fighters = [fighter(0, 0), fighter(4, 1)];
  scene.questClear = () => assert.fail('living heroes must not clear the alley');
  scene.questFail = () => assert.fail('living hell must not lose');
  const timer = scene.nightCandles[0].timer;
  scene.updateQuest(0.4);
  assert.ok(scene.nightCandles[0].timer < timer - 0.3);
  scene.physics = { add: { body() { return { setCircle() {}, setCollideWorldBounds() {} }; } } };
  scene.add = {
    image() { return { setScale() { return this; } }; },
    text() { return { setOrigin() { return this; } }; },
  };
  scene.lSprites = { add() {} };
  scene.lTop = { add() {} };
  scene.textures = { exists() { return true; } };
  const before = scene.fighters.length;
  scene.spawnNightBoss(1);
  assert.equal(scene.fighters.length, before + 1);
  assert.equal(scene.fighters.at(-1).team, 0);
  assert.equal(scene.fighters.at(-1).boss, true);
});
