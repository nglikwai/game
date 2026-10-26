const { test } = require('node:test');
const assert = require('node:assert/strict');

function setup(stageName = 'bossStage') {
  const load = require('./load-source.cjs')();
  const { QUEST, prepareQuest } = load('src/config.ts');
  const { getSettings } = load('src/settings.ts');
  const { BattleScene } = load('src/scenes/BattleScene.ts');
  const slots = structuredClone(getSettings().slots);
  slots.forEach((s, i) => { s.control = i < 4 ? `kb${i + 1}` : 'off'; s.questSide = i % 2 ? 'hell' : 'heroes'; });
  const scene = new BattleScene();
  scene.init({ slots, mode: 'quest', quest: { ...prepareQuest({ stage: QUEST[stageName] }), rule: 'free', side: 'heroes' } });
  scene.countdown = 0;
  return { scene, slots, QUEST, load };
}

test('mixed quest players keep their own faction, controller, bindings and HUD seat', () => {
  const { scene, slots } = setup();
  assert.equal(scene.isMixedQuest, true);
  const selected = [0, 5, 2, 7];
  for (let i = 0; i < 4; i++) {
    const index = selected[i];
    assert.equal(scene.slots[index].control, `kb${i + 1}`);
    assert.deepEqual(Array.from(scene.slots[index].binds), Array.from(slots[i].binds));
    assert.equal(scene.slots[index].team, i % 2);
    assert.equal(scene.fighterLabel({ index, team: i % 2 }), `P${i + 1}`);
    assert.equal(scene.hudPanel(index).y0, 0);
    assert.equal(scene.slots[index < 4 ? index + 4 : index - 4].control, 'cpu');
  }
  assert.equal(scene.slots.filter((s) => s.control.startsWith('kb')).length, 4);
});

test('only Hell humans receive the Oni, twin warden and Bell Oni boss seats', () => {
  for (const name of ['bossStage', 'wardenStage', 'dirgeStage']) {
    const { scene, QUEST } = setup(name);
    assert.deepEqual(Array.from(scene.questBossSeats), name === 'wardenStage' ? [5, 7] : [5]);
    for (const index of scene.questBossSeats) assert.equal(scene.slots[index].team, 1);
    assert.equal(scene.quest.stage, QUEST[name]);
  }
});

test('a mixed quest carries items and scores for both factions into the next stage', () => {
  const { scene } = setup();
  scene.fighters = [
    { index: 0, team: 0, pocket: [{ id: 'rice-ball' }], soul: 30 },
    { index: 5, team: 1, pocket: [{ id: 'rice-ball' }], soul: 60 },
  ];
  scene.stats[0].kos = 2; scene.stats[5].kos = 4;
  const carry = scene.questCarry();
  assert.equal(carry.players[0].soul, 30);
  assert.equal(carry.players[5].soul, 60);
  assert.equal(carry.stats[0].kos, 2);
  assert.equal(carry.stats[5].kos, 4);
  const { BattleScene } = setup().load('src/scenes/BattleScene.ts');
  const next = new BattleScene();
  next.init({ mode: 'quest', slots: scene.lobbySlots, quest: { ...scene.quest, carry } });
  assert.equal(next.slots[0].control, 'kb1');
  assert.equal(next.slots[5].control, 'kb2');
  assert.equal(next.stats[5].kos, 4);
});

test('either faction can win a mixed finale without losing the winner on the result page', () => {
  for (const team of [0, 1]) {
    const { scene, load } = setup();
    scene.quest.route = [scene.quest.stage];
    let banner;
    scene.time = { delayedCall() {} };
    scene.showEndBanner = (msg) => { banner = msg; };
    if (team === 1) scene.questFail(); else scene.questClear();
    assert.equal(scene.winningTeam, team);
    assert.equal(scene.over, true);
    const { T } = load('src/i18n.ts');
    assert.equal(banner, T().teamWins(T().questSides[team === 1 ? 'hell' : 'heroes']));
  }
});

test('hero elimination awards Hell a mixed stage, while destroying its boss awards Heroes', () => {
  for (const team of [0, 1]) {
    const { scene } = setup();
    scene.fighters = [{ index: 0, team: 0, alive: team === 0 }, { index: 5, team: 1, alive: team === 1, boss: true }];
    scene.time = { delayedCall() {} };
    scene.showEndBanner = () => {};
    scene.quest.route = [scene.quest.stage];
    scene.updateQuest(0.05);
    assert.equal(scene.winningTeam, team);
  }
});
