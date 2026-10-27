const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { LobbyScene } = load('src/scenes/LobbyScene.ts');
const { PadScene } = load('src/scenes/PadScene.ts');
const { getSettings } = load('src/state/gameSettings.ts');
const { createMatchStats } = load('src/battle/results/stats.ts');
const { QUEST } = load('src/config/index.ts');
const { T, setLang } = load('src/localization/index.ts');
const baseSlots = structuredClone(getSettings().slots);

function defeat(stage) {
  const checkpoint = { stage, campaign: 'quest', carry: { players: { 0: { pocket: [{ id: 'rice-ball' }], soul: 50 } }, stats: [createMatchStats({ dealt: 125, wall: 300 })] } };
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
    assert.equal(data.retryQuest.stage, stage);
    assert.equal(JSON.stringify(data.retryQuest.carry), JSON.stringify(d.checkpoint.carry));
    assert.ok(data.retryQuest.route.includes(stage));
    assert.notEqual(data.retryQuest, d.checkpoint);
    assert.equal(data.retryQuest.carry.stats[0].dealt, 125);
    const lobby = new LobbyScene();
    getSettings().mode = 'ffa';
    lobby.init(data);
    const settings = getSettings();
    assert.equal(settings.mode, d.checkpoint.campaign);
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

test('player setup changed after a loss stays saved when the lobby is opened again', () => {
  const d = defeat(QUEST.rescueStage);
  d.buttons.find((b) => b.id === 'edit').onEnter();
  const payload = d.started().data;
  const before = payload.slots[0].role;
  const lobby = new LobbyScene();
  lobby.sys = { settings: { data: payload } };
  lobby.init(payload);
  const player = getSettings().slots[0];
  player.role = before === 'mystic' ? 'samurai' : 'mystic';
  player.weapon = 9;
  player.skills = ['fury', 'blink', 'meditate', null];
  // Going home and opening fighter setup again must not replay the lost stage's old slots.
  lobby.init(lobby.sys.settings.data);
  assert.equal(lobby.retryQuest, null);
  assert.equal(getSettings().slots[0].role, player.role);
  assert.equal(getSettings().slots[0].weapon, 9);
  assert.equal(getSettings().slots[0].skills[0], 'fury');
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
  assert.equal(data.quest.route.length, 5);
  assert.equal(data.quest.stage, data.quest.route[0]);
  const fresh = new BattleScene(); fresh.init(data);
  assert.equal(fresh.quest.stage, data.quest.route[0]);
  assert.deepEqual(Array.from(fresh.quest.route), Array.from(data.quest.route));
});

test('the defeat screen routes direct retry and start over through loading in both languages', () => {
  for (const lang of ['en', 'zh']) for (const stage of [QUEST.rescueStage, QUEST.wardenStage]) {
    setLang(lang);
    const d = defeat(stage);
    assert.deepEqual(d.buttons.map((b) => b.id), ['edit', 'retry', 'over', 'lobby']);
    for (const button of d.buttons) {
      assert.ok(button.x >= 0 && button.x + button.w <= 1280);
      assert.ok(button.y >= 0 && button.y + button.h <= 720);
    }
    d.buttons.find((b) => b.id === 'retry').onEnter();
    assert.equal(d.started().key, 'Loading');
    assert.equal(d.started().data.quest.stage, stage);
    assert.deepEqual(Array.from(d.started().data.quest.route), Array.from(d.scene.quest.route));
    d.buttons.find((b) => b.id === 'over').onEnter();
    assert.equal(d.started().key, 'Loading');
    assert.equal(d.started().data.quest.carry, undefined);
    assert.equal(d.started().data.mode, 'quest');
    assert.equal(d.started().data.quest.stage, d.started().data.quest.route[0]);
    const fresh = new BattleScene(); fresh.init(d.started().data);
    assert.deepEqual(Array.from(fresh.quest.route), Array.from(d.started().data.quest.route));
    assert.ok(T().questEdit && T().questRetrySetup(3));
  }
});
