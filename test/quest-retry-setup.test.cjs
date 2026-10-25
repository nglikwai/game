const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { LobbyScene } = load('src/scenes/LobbyScene.ts');
const { PadScene } = load('src/scenes/PadScene.ts');
const { getSettings } = load('src/settings.ts');
const { createMatchStats } = load('src/matchStats.ts');
const { QUEST } = load('src/config.ts');
const { T, setLang } = load('src/i18n.ts');
const baseSlots = structuredClone(getSettings().slots);

function defeat(stage) {
  const checkpoint = { stage, carry: { players: { 0: { pocket: [{ id: 'rice-ball' }], soul: 50 } }, stats: [createMatchStats({ dealt: 125, wall: 300 })] } };
  const scene = new BattleScene();
  scene.init({ mode: 'quest', slots: structuredClone(baseSlots), quest: checkpoint });
  scene.stats[0].dealt = 9999; // the failed attempt must not replace the starting checkpoint
  scene.time = { delayedCall() {} };
  scene.showEndBanner = (_msg, _color, next) => next();
  let modal, started;
  scene.openModal = (options) => { modal = options; };
  scene.scene = { start: (key, data) => { started = { key, data }; } };
  scene.questFail();
  const graphics = new Proxy({}, { get: () => () => graphics });
  scene.add = { graphics: () => graphics, text: () => ({ setOrigin() { return this; } }) };
  const buttons = [];
  modal.build({ x: (1280 - modal.w) / 2, y: (720 - modal.h) / 2, w: modal.w, h: modal.h,
    content: { add() {} }, nav: { add: (item) => buttons.push(item) } });
  return { scene, checkpoint, buttons, started: () => started };
}

test('each failed Quest stage can edit setup and retry that exact stage with its original checkpoint', () => {
  for (let stage = 0; stage < QUEST.maps.length; stage++) {
    const d = defeat(stage);
    d.buttons.find((b) => b.id === 'edit').onEnter();
    const { key, data } = d.started();
    assert.equal(key, 'Lobby');
    assert.equal(JSON.stringify(data.retryQuest), JSON.stringify(d.checkpoint));
    assert.notEqual(data.retryQuest, d.checkpoint);
    assert.equal(data.retryQuest.carry.stats[0].dealt, 125);
    const lobby = new LobbyScene();
    getSettings().mode = 'ffa';
    lobby.init(data);
    const settings = getSettings();
    assert.equal(settings.mode, 'quest');
    const player = settings.slots[0];
    player.role = 'mystic'; player.weapon = 11; player.skills = ['arrow', 'fireball', 'blink'];
    player.binds[0] = 123;
    let loading;
    lobby.scene = { start: (key, data) => { loading = { key, data }; } };
    lobby.startBattle();
    assert.equal(loading.key, 'Loading');
    assert.equal(loading.data.quest.stage, stage);
    assert.equal(loading.data.slots[0].role, 'mystic');
    assert.equal(loading.data.slots[0].weapon, 11);
    assert.deepEqual(loading.data.slots[0].skills, ['arrow', 'fireball', 'blink']);
    assert.equal(loading.data.slots[0].binds[0], 123);
    const retry = new BattleScene();
    retry.init(loading.data);
    assert.equal(retry.map.id, QUEST.maps[stage]);
    assert.equal(retry.quest.carry.players[0].soul, 50);
    assert.equal(retry.quest.carry.players[0].pocket[0].id, 'rice-ball');
    assert.equal(retry.stats[0].dealt, 125);
    assert.equal(retry.questTreeCast, null);
    assert.equal(retry.wave, 1);
  }
});

test('controller setup returns to the retry lobby without losing edits or the checkpoint', () => {
  const d = defeat(QUEST.rescueStage);
  d.buttons.find((b) => b.id === 'edit').onEnter();
  const lobby = new LobbyScene(); lobby.init(d.started().data);
  getSettings().slots[0].role = 'shinobi';
  const pads = new PadScene();
  // This is the same return payload supplied by the retry lobby's Controller Setup button.
  pads.from = 'Lobby'; pads.fromData = { retryQuest: lobby.retryQuest };
  let returned;
  pads.scene = { start: (key, data) => { returned = { key, data }; } };
  pads.leave();
  assert.equal(returned.key, 'Lobby');
  lobby.init(returned.data);
  assert.equal(getSettings().slots[0].role, 'shinobi');
  assert.equal(lobby.retryQuest.stage, QUEST.rescueStage);
  assert.equal(lobby.retryQuest.carry.players[0].soul, 50);
});

test('entering the normal lobby clears retry state, so a fresh Quest starts at stage one', () => {
  const d = defeat(QUEST.bossStage);
  d.buttons.find((b) => b.id === 'edit').onEnter();
  const lobby = new LobbyScene(); lobby.init(d.started().data);
  lobby.init({});
  assert.equal(lobby.retryQuest, null);
  let data;
  lobby.scene = { start: (_key, next) => { data = next; } };
  lobby.startBattle();
  assert.equal(data.quest, undefined);
  const fresh = new BattleScene(); fresh.init(data);
  assert.equal(fresh.quest.stage, 0);
});

test('the defeat screen routes direct retry and start over through loading in both languages', () => {
  for (const lang of ['en', 'zh']) {
    setLang(lang);
    const d = defeat(QUEST.rescueStage);
    assert.deepEqual(d.buttons.map((b) => b.id), ['edit', 'retry', 'over', 'lobby']);
    for (const button of d.buttons) {
      assert.ok(button.x >= 0 && button.x + button.w <= 1280);
      assert.ok(button.y >= 0 && button.y + button.h <= 720);
    }
    d.buttons.find((b) => b.id === 'retry').onEnter();
    assert.equal(d.started().key, 'Loading');
    assert.equal(d.started().data.quest.stage, QUEST.rescueStage);
    d.buttons.find((b) => b.id === 'over').onEnter();
    assert.equal(d.started().key, 'Loading');
    assert.equal(d.started().data.quest, undefined);
    assert.ok(T().questEdit && T().questRetrySetup(3));
  }
});
