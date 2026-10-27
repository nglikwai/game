const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { layoutPoint } = load('@/maps/layout.ts');
const { QUEST, QUEST_MAX_CHESTS, chestsWithinCap, MAP_SCALE, HUD_HEIGHT, GAME_MODES, rollQuestRoute, prepareQuest, questStageNumber, nextQuestStage } = load('src/config/index.ts');
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { WARDEN_GEAR, wardenRole } = load('@/battle/quest/roster.ts');
const { Fighter } = load('src/gameplay/Fighter.ts');
const { WEAPONS } = load('src/gameplay/weapons.ts');
const { skillById } = load('src/gameplay/skills.ts');
const { getSettings, validate, usesTeams } = load('src/state/gameSettings.ts');
const { rollCpuLoadouts } = load('src/ai/loadouts.ts');
const { T, setLang } = load('src/localization/index.ts');

test('a quest run draws one of four fights, two tactics, one of two dragon semi-finals, and one of three finales', () => {
  assert.ok(GAME_MODES.includes('quest'));
  assert.equal(GAME_MODES.includes('quest2'), false);
  const fights = [0, 1, QUEST.nightStage, QUEST.ambushStage];
  const tactics = [QUEST.rescueStage, QUEST.groveStage, QUEST.sealStage, QUEST.escortStage, QUEST.snareStage, QUEST.beaconStage];
  const bosses = new Set();
  const semis = new Set();
  const omittedFights = new Set();
  const omittedTactics = new Set();
  for (let n = 0; n < 40; n++) {
    const route = rollQuestRoute();
    assert.equal(route.length, 5);
    assert.equal(new Set(route).size, 5);
    assert.ok(fights.includes(route[0]));
    assert.equal(route.slice(1, 3).filter((stage) => !tactics.includes(stage)).length, 0);
    assert.equal(tactics.filter((stage) => !route.slice(1, 3).includes(stage)).length, 4);
    assert.ok([QUEST.dragonStage, QUEST.wyvernStage].includes(route[3]));
    semis.add(route[3]);
    assert.ok([QUEST.bossStage, QUEST.wardenStage, QUEST.dirgeStage].includes(route[4]));
    bosses.add(route[4]);
    fights.filter((stage) => !route.includes(stage)).forEach((stage) => omittedFights.add(stage));
    tactics.filter((stage) => !route.includes(stage)).forEach((stage) => omittedTactics.add(stage));
    for (let i = 0; i < route.length; i++) {
      assert.equal(questStageNumber(route, route[i]), i + 1);
      assert.equal(nextQuestStage(route, route[i]), route[i + 1]);
    }
  }
  assert.equal(bosses.size, 3);
  assert.equal(semis.size, 2);
  assert.equal(omittedFights.size, fights.length);
  assert.equal(omittedTactics.size, tactics.length);
  const kept = [QUEST.groveStage, 0, QUEST.sealStage, QUEST.escortStage, 1, QUEST.wardenStage];
  const prepared = prepareQuest({ stage: QUEST.sealStage, route: kept });
  assert.equal(prepared.stage, QUEST.sealStage);
  assert.deepEqual(Array.from(prepared.route), kept);
  const scene = new BattleScene();
  scene.init({ mode: 'quest', slots: [] });
  assert.equal(scene.quest.stage, scene.quest.route[0]);
  assert.equal(scene.quest.campaign, 'quest');
  assert.equal(scene.quest.route.length, 5);
  scene.init({ mode: 'quest', slots: [], quest: { stage: QUEST.bossStage, route: [0, 1, 2, 3, 4, QUEST.bossStage] } });
  let completed = 0;
  scene.endRound = () => completed++;
  scene.enterRound = () => assert.fail('a completed campaign must not spill into another');
  scene.questClear();
  assert.equal(completed, 1);
});

test('Quest 2 permits a solo party and balances CPU roles independently from the stage enemies', () => {
  const settings = structuredClone(getSettings());
  settings.mode = 'quest';
  settings.slots.forEach((s, i) => { s.control = i === 0 ? 'cpu' : 'off'; });
  assert.equal(validate(settings), null);
  assert.equal(usesTeams('quest'), false);
  settings.slots.forEach((s, i) => { s.control = i < 4 ? 'kb1' : 'cpu'; s.team = 0; s.role = 'shinobi'; });
  settings.slots[1].control = 'cpu'; settings.slots[2].control = 'cpu'; settings.slots[3].control = 'cpu';
  for (let roll = 0; roll < 10; roll++) {
    const gear = rollCpuLoadouts('quest', settings.slots);
    const party = new Set(['shinobi', ...[1, 2, 3].map((i) => gear.get(i).role)]);
    assert.equal(party.size, 4);
    assert.equal(new Set([4, 5, 6, 7].map((i) => gear.get(i).role)).size, 4);
    for (let i = 4; i < 8; i++) assert.ok(!gear.get(i).skills.includes('lifeline'));
  }
});

test('both languages describe the single quest and number a finale by its place in the route', () => {
  const route = [0, 1, QUEST.rescueStage, QUEST.groveStage, QUEST.sealStage, QUEST.wardenStage];
  for (const lang of ['en', 'zh']) {
    setLang(lang);
    assert.ok(T().modeNames('quest'));
    assert.ok(T().modeDesc('quest'));
    assert.ok(T().wardenStatus(7).includes('7'));
    assert.notEqual(T().wardenName(0), T().wardenName(1));
    assert.equal(questStageNumber(route, QUEST.wardenStage), 6);
    assert.equal(questStageNumber([QUEST.bossStage], QUEST.bossStage), 1);
  }
});

function wardens() {
  const scene = new BattleScene();
  const slots = structuredClone(getSettings().slots);
  slots.forEach((s, i) => { s.control = i === 0 ? 'cpu' : 'off'; });
  scene.init({ mode: 'quest', slots, quest: { stage: QUEST.wardenStage } });
  scene.countdown = 0;
  scene.physics = { add: { staticBody: () => ({}), collider: () => ({}) } };
  scene.placeWardenTree(1);
  scene.fighters = WARDEN_GEAR.map((gear, i) => {
    const body = { center: { x: 1200, y: 250 + i * 300 }, velocity: { x: 0, y: 0 }, enable: true,
      reset(x, y) { this.center = { x: x + 27, y: y + 27 }; } };
    const f = new Fighter(4 + i, i ? 0x70bcad : 0xc85957, WEAPONS[gear.weapon], gear.skills.map(skillById), wardenRole(1, i), {}, body, scene);
    f.team = 1; f.boss = true;
    scene.spawns[4 + i] = { x: f.x, y: f.y };
    return f;
  });
  scene.fx = { smoke() {}, skillCast() {} };
  scene.freeSpot = (p) => p;
  scene.showBanner = () => {};
  return scene;
}
function kill(f) { f.hp = 0; f.state = 'dead'; f.body.enable = false; }

test('the final stage prepares two wardens and a summon tree behind them', () => {
  const scene = wardens();
  assert.equal(QUEST.wardens.enemies, 2);
  assert.equal(scene.slots.slice(4).filter((s) => s.control !== 'off').length, 2);
  assert.ok(QUEST.wardens.tree.interval >= 8);
  assert.equal(scene.questTree.alive, true);
  assert.equal(scene.questTree.main, false);
  assert.equal(scene.questTree.tree, true);
  assert.equal(scene.questTree.x, layoutPoint(scene.map, QUEST.wardens.tree).x * MAP_SCALE);
  assert.equal(scene.questTree.y, (layoutPoint(scene.map, QUEST.wardens.tree).y - HUD_HEIGHT) * MAP_SCALE);
  assert.equal(scene.bgm, 'boss');
  assert.equal(scene.map.id, 'wardens');
  assert.deepEqual(Array.from(WARDEN_GEAR, (g) => WEAPONS[g.weapon].id), ['hammer', 'talisman']);
  for (let i = 0; i < 2; i++) {
    assert.equal(wardenRole(1, i).maxHp, 570);
    assert.equal(wardenRole(4, i).maxHp, 1020);
    assert.ok(scene.fighters[i].skills.every(Boolean));
  }
});

test('the fallen warden revives after twelve seconds with 60% HP and cleared death bookkeeping', () => {
  const scene = wardens(), f = scene.fighters[0];
  kill(f); f.soul = 40; f.pocket.push({ id: 'rice-ball' });
  scene.deathTime.set(f, 1); scene.respawnTimers.set(f, Infinity);
  scene.questClear = () => assert.fail('one living warden must prevent victory');
  scene.updateWardens(11.99);
  assert.equal(f.alive, false);
  assert.ok(scene.wardenReviveT > 0);
  scene.updateWardens(0.02);
  assert.equal(f.alive, true);
  assert.equal(f.hp, f.maxHp * 0.6);
  assert.equal(f.soul, 20);
  assert.equal(f.pocket.length, 0);
  assert.equal(scene.deathTime.has(f), false);
  assert.equal(scene.respawnTimers.has(f), false);
  assert.equal(scene.wardenReviveT, -1);
});

test('both wardens falling in the revival window completes the stage without reviving either', () => {
  const scene = wardens();
  let clears = 0; scene.questClear = () => clears++;
  kill(scene.fighters[0]); scene.updateWardens(8);
  assert.equal(clears, 0);
  kill(scene.fighters[1]); scene.updateWardens(0.05);
  assert.equal(clears, 1);
  assert.ok(scene.fighters.every((f) => !f.alive));
});

test('revival pauses with gameplay, resets for retry and never runs in another stage', () => {
  for (const stop of ['countdown', 'paused', 'over']) {
    const scene = wardens(); kill(scene.fighters[1]);
    scene.updateWardens(4);
    scene[stop] = stop === 'countdown' ? 1 : true;
    scene.updateWardens(30);
    assert.equal(scene.wardenReviveT, 8);
    assert.equal(scene.fighters[1].alive, false);
  }
  const scene = wardens(); kill(scene.fighters[0]); scene.updateWardens(4);
  scene.init({ mode: 'quest', slots: [], quest: { stage: QUEST.wardenStage } });
  assert.equal(scene.wardenReviveT, -1);
  scene.quest.stage = QUEST.escortStage;
  scene.updateWardens(100);
  assert.equal(scene.wardenReviveT, -1);
});

test('a quest scene holds at most six chests and keeps the big one', () => {
  const { getMap } = load('src/maps/index.ts');
  assert.equal(QUEST_MAX_CHESTS, 6);
  for (const id of QUEST.maps) {
    const spots = getMap(id).chests;
    const kept = chestsWithinCap(spots, QUEST_MAX_CHESTS);
    assert.ok(kept.length <= QUEST_MAX_CHESTS, id);
    assert.equal(kept.some((c) => c.big), spots.some((c) => c.big), id);
  }
  const scene = new BattleScene();
  scene.quest = { stage: 0 };
  scene.fighters = [{}, {}, {}, {}];
  scene.chests = Array.from({ length: QUEST_MAX_CHESTS }, () => ({}));
  scene.chestTimer = 0;
  let drops = 0;
  scene.dropRandomChest = () => { drops += 1; };
  scene.updateRandomChests(1);
  assert.equal(drops, 0);
  scene.chests.pop();
  scene.chestTimer = 0;
  scene.updateRandomChests(1);
  assert.equal(drops, 1);
});
