const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { Fighter } = load('src/gameplay/Fighter.ts');
const { WEAPONS } = load('src/gameplay/weapons.ts');
const { roleById } = load('src/gameplay/roles.ts');
const { QUEST, QUEST_BOSSES, MAP_SCALE, HUD_HEIGHT, WIDTH, HEIGHT } = load('src/config/index.ts');
const { getMap } = load('src/maps/index.ts');
const { hellBossSlots } = load('src/battle/quest/factions.ts');

function fighter(index, team, x, y) {
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
    quest: { stage: QUEST.dirgeStage },
  });
  scene.countdown = 0;
  scene.showBanner = () => {};
  scene.dealDamage = (_from, to, dmg) => { to.hp -= dmg; };
  return scene;
}

test('the dirge is a finale with one Bell Oni and a center bell', () => {
  assert.equal(QUEST.maps[QUEST.dirgeStage], 'dirge');
  assert.ok(QUEST_BOSSES.includes(QUEST.dirgeStage));
  const map = getMap('dirge');
  assert.equal(map.zh, '喪鐘殿');
  const scene = battle();
  assert.equal(scene.slots.filter((s) => s.team === 1 && s.control === 'cpu').length, 1);
  assert.equal(scene.bgm, 'boss');
  assert.deepEqual([...scene.questBossSeats], [4]);
  const lobby = [
    { control: 'keys', team: 1, questSide: 'hell', weapon: 0, skills: [], binds: [], role: 'ronin' },
    { control: 'off', team: 1, questSide: 'hell', weapon: 0, skills: [], binds: [], role: 'ronin' },
    { control: 'off', team: 1, questSide: 'hell', weapon: 0, skills: [], binds: [], role: 'ronin' },
    { control: 'off', team: 1, questSide: 'hell', weapon: 0, skills: [], binds: [], role: 'ronin' },
  ];
  assert.deepEqual([...hellBossSlots(lobby, QUEST.dirgeStage)], [4]);
});

test('the toll strikes the other side inside the ring and misses anyone who steps out', () => {
  const scene = battle();
  const bell = { x: (WIDTH / 2) * MAP_SCALE, y: (((HUD_HEIGHT + HEIGHT) / 2) - HUD_HEIGHT) * MAP_SCALE };
  scene.fighters = [fighter(0, 0, bell.x, bell.y), fighter(4, 1, bell.x + 800, bell.y)];
  scene.fighters[1].boss = true;
  const party = scene.fighters[0];
  const before = party.hp;
  scene.dirgeTollT = 0;
  scene.updateDirge(0.01);
  assert.ok(scene.dirgeWarn);
  scene.updateDirge(QUEST.dirge.tollWarn);
  assert.equal(scene.dirgeWarn, null);
  assert.ok(party.hp < before);
  assert.equal(scene.fighters[1].hp, scene.fighters[1].maxHp);
  party.hp = before;
  party.body.center.x = bell.x + 4000;
  scene.dirgeTollT = 0;
  scene.updateDirge(0.01);
  scene.updateDirge(QUEST.dirge.tollWarn);
  assert.equal(party.hp, before);
  const side = QUEST.dirge.tolls[1];
  party.body.center.x = side.x * MAP_SCALE;
  party.body.center.y = (side.y - HUD_HEIGHT) * MAP_SCALE;
  scene.dirgeTollT = 0;
  scene.updateDirge(0.01);
  scene.updateDirge(QUEST.dirge.tollWarn);
  assert.ok(party.hp < before);
  assert.equal(QUEST.dirge.tolls.length, 3);
});

test('the stage clears when the Bell Oni falls', () => {
  const scene = battle();
  const boss = fighter(4, 1, 10, 10);
  boss.boss = true;
  scene.fighters = [fighter(0, 0, 20, 20), boss];
  let cleared = 0;
  scene.questClear = () => cleared++;
  scene.updateQuest(0.05);
  assert.equal(cleared, 0);
  boss.hp = 0;
  boss.state = 'dead';
  scene.updateQuest(0.05);
  assert.equal(cleared, 1);
});
