const { test } = require('node:test');
const assert = require('node:assert/strict');
const audio = [];
const load = require('./load-source.cjs')({
  music: { stopMusic: (immediate) => audio.push(['stop', immediate]) },
  sfx: { battleTransition: () => audio.push(['transition']) },
});
const { LoadingScene } = load('src/scenes/LoadingScene.ts');
const { LobbyScene } = load('src/scenes/LobbyScene.ts');
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { QUEST, questStageNumber } = load('src/config.ts');
const { getMap } = load('src/maps/index.ts');
const { getSettings } = load('src/settings.ts');
const { setLang, T } = load('src/i18n.ts');

function loading(data) {
  const scene = new LoadingScene();
  const starts = [], texts = [];
  const graphics = new Proxy({}, { get: () => () => graphics });
  scene.cameras = { main: { setOrigin() { return this; }, setZoom() { return this; } } };
  scene.add = { graphics: () => graphics, text: (_x, _y, value) => {
    const text = { text: value, setOrigin() { return this; }, setText(value) { this.text = value; return this; } };
    texts.push(text); return text;
  } };
  scene.scene = { start: (...args) => starts.push(args) };
  scene.init(data); scene.create();
  return { scene, starts, texts };
}

test('the lobby routes a snapshot of the selected setup through Loading', () => {
  const scene = new LobbyScene();
  const settings = getSettings();
  let start;
  scene.scene = { start: (...args) => { start = args; } };
  scene.startBattle();
  assert.equal(start[0], 'Loading');
  assert.equal(start[1].mode, settings.mode);
  assert.equal(start[1].mapId, settings.mapId);
  assert.equal(JSON.stringify(start[1].slots), JSON.stringify(settings.slots));
  assert.notEqual(start[1].slots, settings.slots);
});

test('loading waits five seconds, holds the finished screen for two seconds, and enters exactly once', () => {
  const data = { mode: 'quest', slots: [], mapId: 'random' };
  const { scene, starts, texts } = loading(data);
  scene.update(0, 2500);
  assert.equal(starts.length, 0);
  assert.equal(texts.at(-1).text, '50%');
  scene.update(0, 2499);
  assert.equal(starts.length, 0);
  scene.update(0, 1);
  assert.equal(starts.length, 0);
  assert.equal(texts.at(-1).text, '100%');
  scene.update(0, 1999);
  assert.equal(starts.length, 0);
  scene.update(0, 1);
  assert.equal(starts.length, 1);
  assert.equal(starts[0][0], 'Battle');
  assert.equal(starts[0][1], data);
  scene.update(0, 5000);
  assert.equal(starts.length, 1);
});

test('a new visit resets loading progress and uses the new setup', () => {
  const { scene, starts } = loading({ mode: 'ffa', slots: [] });
  scene.update(0, 5000);
  scene.update(0, 2000);
  const next = { mode: 'team', slots: [] };
  scene.init(next); scene.create();
  scene.update(0, 4999);
  assert.equal(starts.length, 1);
  scene.update(0, 1);
  assert.equal(starts.length, 1);
  scene.update(0, 2000);
  assert.equal(starts.length, 2);
  assert.equal(starts[1][1], next);
});

test('loading labels are present in both languages', () => {
  for (const lang of ['zh', 'en']) {
    setLang(lang);
    const { texts } = loading({ mode: 'ffa', slots: [] });
    assert.ok(texts.some((text) => text.text === T().loadingBattle));
    assert.ok(texts.some((text) => text.text === T().loadingBattleHint));
  }
});

test('every Quest stage waits five seconds and retains its checkpoint before the battle countdown', () => {
  const routes = [
    [0, 1, QUEST.rescueStage, QUEST.groveStage, QUEST.sealStage, QUEST.bossStage],
    [QUEST.escortStage, 0, 1, QUEST.rescueStage, QUEST.groveStage, QUEST.wardenStage],
  ];
  for (const route of routes) for (const stage of route) {
    const battle = new BattleScene();
    const data = { mode: 'quest', slots: [], quest: { stage, route, carry: { players: {}, stats: [] } } };
    let next;
    battle.scene = { start: (key, payload) => { assert.equal(key, 'Loading'); next = payload; } };
    battle.enterRound(data);
    assert.equal(next.quest.stage, stage);
    assert.deepEqual(Array.from(next.quest.route), route);
    assert.deepEqual(next.quest.carry, data.quest.carry);
    assert.notEqual(next, data);
    const { scene, starts, texts } = loading(next);
    assert.ok(texts.some((t) => t.text === T().mapName(getMap(QUEST.maps[stage]))));
    assert.ok(texts.some((t) => t.text === T().questStageTitle(questStageNumber(route, stage), T().questGoals[stage])));
    scene.update(0, 4999);
    assert.equal(starts.length, 0);
    scene.update(0, 1);
    assert.equal(starts.length, 0);
    scene.update(0, 2000);
    assert.equal(starts.length, 1);
    const entered = new BattleScene();
    entered.init(starts[0][1]);
    assert.equal(entered.quest.stage, stage);
    assert.equal(entered.map.id, QUEST.maps[stage]);
    assert.equal(entered.countdown, 8); // 3-second battlefield preview, then the 5-second countdown
  }
});

test('the battlefield is held for three seconds before 5-4-3-2-1, with FIGHT at eight seconds', () => {
  const scene = new BattleScene();
  scene.init({ mode: 'ffa', slots: [] });
  assert.equal(scene.countdown, 8);
  const scheduled = [], labels = [];
  scene.time = { delayedCall: (at, run) => scheduled.push({ at, run }) };
  scene.tweens = { add() {} };
  scene.add = { text: (_x, _y, label) => {
    labels.push(label);
    const text = new Proxy({}, { get: () => () => text });
    return text;
  } };
  scene.startCountdown();
  assert.deepEqual(scheduled.map((e) => e.at), [3000, 4000, 5000, 6000, 7000, 8000]);
  assert.deepEqual(labels, []);
  for (const event of scheduled) event.run();
  assert.deepEqual(labels, ['5', '4', '3', '2', '1', T().fight]);
});

test('loading cuts music immediately and plays one transition cue when the bar finishes', () => {
  audio.length = 0;
  const { scene, starts } = loading({ mode: 'ffa', slots: [] });
  assert.deepEqual(audio, [['stop', true]]);
  scene.update(0, 4999);
  assert.deepEqual(audio, [['stop', true]]);
  const fills = [];
  const overlay = new Proxy({}, { get: (_, key) => (...args) => { fills.push([key, ...args]); return overlay; } });
  scene.add.graphics = () => overlay;
  scene.update(0, 1);
  assert.deepEqual(audio, [['stop', true], ['transition']]);
  assert.equal(fills.some(([key]) => key === 'fillRect'), false);
  scene.update(0, 1999);
  assert.equal(starts.length, 0);
  scene.update(0, 1);
  assert.equal(starts.length, 1);
  assert.equal(audio.length, 2);
});
