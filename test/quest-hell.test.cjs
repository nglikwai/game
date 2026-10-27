const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { QUEST, prepareQuest } = load('src/config/index.ts');
const { hellSlots, hellBossSlots, applyQuestRule, questFactions } = load('src/battle/quest/factions.ts');
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { LobbyScene } = load('src/scenes/LobbyScene.ts');
const { getSettings, saveSettings } = load('src/state/gameSettings.ts');
const { Fighter } = load('src/gameplay/Fighter.ts');
const { WEAPONS } = load('src/gameplay/weapons.ts');
const { roleById } = load('src/gameplay/roles.ts');
const { AIController } = load('@/ai/AIController.ts');
const { T, setLang } = load('src/localization/index.ts');

function slots() {
  const slots = structuredClone(getSettings().slots);
  slots.forEach((s, i) => { s.control = i === 1 ? 'kb2' : 'off'; });
  return slots;
}
function fighter(index, team) {
  const body = { center: { x: 600, y: 300 }, velocity: { x: 0, y: 0 }, enable: true,
    reset(x, y) { this.center = { x: x + 18, y: y + 18 }; }, setVelocity() {} };
  const f = new Fighter(index, 0xeeeeee, WEAPONS[0], [], roleById('ronin'), { labels: [] }, body, {});
  f.team = team;
  return f;
}
function battle(stage) {
  const scene = new BattleScene();
  scene.init({ mode: 'quest', slots: slots(), quest: { ...prepareQuest({ stage }), side: 'hell' } });
  scene.countdown = 0;
  scene.fighters = [fighter(0, 0), fighter(5, 1)];
  scene.fighters[1].boss = scene.questBossSeats.includes(5);
  scene.fighters.forEach((f) => { scene.stats[f.index] = f.stats; scene.spawns[f.index] = { x: f.x, y: f.y }; });
  scene.fx = { smoke() {}, sparks() {}, respawnBeam() {} };
  scene.showBanner = () => {}; scene.popText = () => {};
  scene.freeSpot = (p) => p;
  scene.updateQuestTree = () => {};
  scene.updateGrove = () => {};
  scene.updateWardens = () => {};
  scene.towers = [{ team: 1, main: true, alive: true }];
  scene.walls = [{ rescued: false }, { rescued: false }];
  scene.groveTrees = [{ alive: true, grove: 'respawn' }, { alive: true }, { alive: true }];
  return scene;
}
function kill(f) { f.state = 'dead'; f.hp = 0; }

test('Hell retains each selected controller and input binding; empty seats get allies and heroes are CPU', () => {
  const lobby = slots(), before = JSON.stringify(lobby), roster = hellSlots(lobby);
  assert.equal(roster.length, 8);
  for (let i = 0; i < 4; i++) {
    assert.equal(roster[i].team, 0); assert.equal(roster[i].control, 'cpu');
    assert.equal(roster[i + 4].team, 1);
  }
  assert.equal(roster[5].control, 'kb2');
  assert.deepEqual(Array.from(roster[5].binds), Array.from(lobby[1].binds));
  assert.equal(roster[4].control, 'cpu');
  assert.equal(JSON.stringify(lobby), before);
  assert.deepEqual(Array.from(hellBossSlots(lobby, QUEST.bossStage)), [5]);
  lobby[3].control = 'hid1';
  assert.deepEqual(Array.from(hellBossSlots(lobby, QUEST.wardenStage)), [5, 7]);
  assert.deepEqual(Array.from(hellBossSlots(lobby, QUEST.groveStage)), []);
});

test('the player gets a boss seat and stays active even when the normal boss would hide reserve guards', () => {
  for (const stage of [QUEST.bossStage, QUEST.wardenStage]) {
    const scene = battle(stage), player = scene.fighters[1];
    assert.equal(scene.slots[5].control, 'kb2');
    assert.ok(scene.questBossSeats.includes(5));
    scene.prepareBossReserve(player, 1);
    assert.equal(player.alive, true);
    assert.equal(scene.bossReserves.size, 0);
    assert.equal(scene.fighterLabel(player), 'P2');
    assert.equal(scene.hudPanel(5).y0, 0);
    assert.ok(scene.hudPanel(0).y0 > 0);
  }
});

test('Hell clears trials by defeating invaders, without counting its own guards as enemies', () => {
  for (const stage of [1, QUEST.rescueStage, QUEST.groveStage, QUEST.sealStage, QUEST.escortStage, QUEST.bossStage, QUEST.wardenStage]) {
    const scene = battle(stage);
    let cleared = 0; scene.questClear = () => cleared++; scene.questFail = () => assert.fail(`unexpected defeat on ${stage}`);
    kill(scene.fighters[0]); scene.updateQuest(0.05);
    assert.equal(cleared, 1);
  }
});

test('Hell must repel both invasion waves, respecting the existing recovery gap', () => {
  const scene = battle(0), hero = scene.fighters[0];
  let cleared = 0; scene.questClear = () => cleared++;
  kill(hero); scene.updateQuest(0.05);
  assert.equal(scene.waveT, QUEST.waveDelay);
  scene.updateQuest(QUEST.waveDelay - 0.01);
  assert.equal(hero.alive, false);
  scene.updateQuest(0.02);
  assert.equal(hero.alive, true);
  assert.equal(scene.wave, 2);
  kill(hero); scene.updateQuest(0.05);
  assert.equal(cleared, 1);
});

test('heroes breaking each defended objective defeats Hell even if a player is still alive', () => {
  for (const stage of [1, QUEST.rescueStage, QUEST.groveStage, QUEST.sealStage, QUEST.escortStage, QUEST.bossStage, QUEST.wardenStage]) {
    const scene = battle(stage);
    let failed = 0; scene.questFail = () => failed++; scene.questClear = () => assert.fail(`wrong-side clear on ${stage}`);
    if (stage === 1) scene.towers.forEach((t) => t.alive = false);
    if (stage === QUEST.rescueStage) scene.walls.forEach((w) => w.rescued = true);
    if (stage === QUEST.groveStage) scene.groveTrees.forEach((t) => t.alive = false);
    if (stage === QUEST.sealStage) scene.seals.forEach((s) => s.sealed = true);
    if (stage === QUEST.escortStage) scene.lantern.arrived = true;
    if (stage === QUEST.bossStage) kill(scene.fighters[1]);
    if (stage === QUEST.wardenStage) {
      const second = fighter(4, 1); second.boss = true; scene.fighters.push(second);
      kill(second); kill(scene.fighters[1]);
    }
    scene.updateQuest(0.05);
    assert.equal(failed, 1);
  }
});

test('Hell pushing the lantern home wins, and tower-backed defenders can wait for respawn', () => {
  const escort = battle(QUEST.escortStage);
  escort.lantern.lost = true;
  let cleared = 0; escort.questClear = () => cleared++;
  escort.updateQuest(0.05);
  assert.equal(cleared, 1);
  const scene = battle(1);
  kill(scene.fighters[1]);
  scene.questFail = () => assert.fail('the main tower can still respawn defenders');
  scene.updateQuest(0.05);
});

test('pauses, countdown and results freeze Hell objectives and invasion waves', () => {
  for (const field of ['over', 'paused', 'countdown']) {
    const scene = battle(0); kill(scene.fighters[0]); scene[field] = field === 'countdown' ? 1 : true;
    scene.questClear = scene.questFail = () => assert.fail('frozen battle ended');
    scene.updateQuest(100);
    assert.equal(scene.waveT, -1);
  }
});

test('Hell checkpoints carry the defending party, preserve the chosen side and survive setup editing', () => {
  const scene = battle(QUEST.sealStage), player = scene.fighters[1];
  player.pocket.push({ id: 'rice-ball' }); player.soul = 60; player.stats.kos = 9;
  const carry = scene.questCarry();
  assert.equal(carry.players[5].soul, 60);
  assert.equal(carry.players[0], undefined);
  const checkpoint = { ...scene.quest, carry };
  const lobby = new LobbyScene();
  getSettings().questRule = 'heroes';
  lobby.init({ retryQuest: checkpoint, slots: slots() });
  assert.equal(getSettings().questRule, 'hell');
  let entered;
  lobby.scene = { start: (key, data) => { assert.equal(key, 'Loading'); entered = data; } };
  lobby.startBattle();
  assert.equal(entered.quest.side, 'hell');
  assert.equal(JSON.stringify(entered.quest.route), JSON.stringify(checkpoint.route));
  assert.equal(entered.quest.carry.players[5].soul, 60);
  const retry = new BattleScene(); retry.init(entered);
  assert.equal(retry.stats[5].kos, 9);
  assert.equal(retry.slots[5].control, 'kb2');
});

test('invading CPU heroes coordinate on one altar instead of splitting below the two-player requirement', () => {
  const a = fighter(0, 0), b = fighter(1, 0);
  a.body.center = { x: 100, y: 200 }; b.body.center = { x: 100, y: 800 };
  const world = { fighters: [a, b], projectiles: [], objectives: [], chests: [], coordinateCaptures: true,
    capturePoints: [{ team: 0, x: 500, y: 200, radius: 90, sealed: false }, { team: 0, x: 500, y: 800, radius: 90, sealed: false }] };
  const ai = new AIController('standard');
  assert.ok(ai.decide(a, world).mx > 0);
  assert.ok(ai.decide(b, world).my < 0);
});

test('standard and Hell assign every player, while Free keeps each choice', () => {
  const party = structuredClone(getSettings().slots).slice(0, 4);
  party.forEach((s, i) => { s.control = 'cpu'; s.questSide = i === 0 ? 'hell' : 'heroes'; });
  applyQuestRule(party, 'heroes');
  assert.ok(party.every((s) => s.questSide === 'heroes'));
  assert.equal(questFactions(party, 'heroes').hell, false);
  applyQuestRule(party, 'hell');
  assert.ok(party.every((s) => s.questSide === 'hell'));
  assert.equal(questFactions(party, 'hell').mixed, false);
  party[0].questSide = 'heroes';
  applyQuestRule(party, 'free');
  assert.equal(party[0].questSide, 'heroes');
  assert.equal(party[1].questSide, 'hell');
  assert.equal(questFactions(party, 'heroes').mixed, true);
});

test('the Hell selector is saved, and both languages explain every defensive objective', () => {
  getSettings().questRule = 'hell'; saveSettings();
  assert.equal(getSettings().questRule, 'hell');
  for (const lang of ['en', 'zh']) {
    setLang(lang);
    assert.ok(T().questSides.hell);
    assert.equal(T().questRules.heroes.length > 0 && T().questRules.hell.length > 0 && T().questRules.free.length > 0, true);
    assert.equal(T().hellGoals.length, QUEST.maps.length);
    assert.ok(T().hellGoals.every(Boolean));
  }
});
