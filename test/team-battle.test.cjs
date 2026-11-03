const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene } = load('@/scenes/BattleScene.ts');
const { checkTeamElimination } = load('@/battle/results/teamBattle.ts');
const { updateTowers, updateTowerHealing, inTowerAura } = load('@/battle/objectives/towers.ts');

test('team victory requires the entire enemy roster to be defeated regardless of surviving towers', () => {
  const fighters = [{ team: 0, alive: true }, { team: 1, alive: true }, { team: 1, alive: false }];
  let winner, ended = 0;
  const scene = { mode: 'team', over: false, countdown: 0, fighters,
    towers: [{ team: 1, main: true, alive: true }], endRound(f) { winner = f; ended++; } };
  checkTeamElimination.call(scene); assert.equal(ended, 0);
  fighters[1].alive = false;
  checkTeamElimination.call(scene); assert.equal(ended, 1); assert.equal(winner, fighters[0]);
  fighters[0].alive = false;
  checkTeamElimination.call(scene); assert.equal(winner, undefined, 'simultaneous wipes draw');
});

test('team elimination checks leave other modes, countdowns and completed rounds alone', () => {
  for (const state of [{ mode: 'siege' }, { mode: 'quest' }, { countdown: 1 }, { over: true }]) {
    checkTeamElimination.call({ mode: 'team', over: false, countdown: 0, fighters: [{ alive: true, team: 0 }],
      endRound() { assert.fail('must not end'); }, ...state });
  }
});

test('the battle update resolves a final KO before a ready tower respawn', () => {
  const scene = new BattleScene(); scene.init({ mode: 'team', slots: [] }); scene.countdown = 0;
  const winner = { team: 0, alive: true, update() {}, controller: { read() {} } };
  scene.fighters = [winner, { ...winner, team: 1, alive: false }];
  scene.petals = { update() {} }; scene.holdForLostPads = () => false;
  for (const method of ['updateRescueGate', 'updateProjectiles', 'updateCaltrops', 'updateFx', 'updateDoors', 'render', 'renderHud']) scene[method] = () => {};
  scene.terrainAt = () => null;
  scene.updateTeamRespawns = () => assert.fail('respawn must not undo a final KO');
  scene.endRound = f => { assert.equal(f, winner); scene.over = true; };
  scene.update(0, 16);
  assert.equal(scene.over, true);
});

test('team towers still attack enemies and heal nearby allies while victory remains a team wipe', () => {
  const fighter = { team: 0, alive: true, hp: 20, maxHp: 100, x: 100, y: 100, stats: { recovered: 0 } };
  const enemy = { team: 1, alive: true, hp: 100, maxHp: 100, x: 180, y: 100 };
  const tower = { team: 0, main: true, alive: true, hp: 500, maxHp: 500, x: 100, y: 100, w: 64,
    aura: 200, range: 300, reload: 0, fireInterval: 2, arrow: { radius: 5, speed: 300 } };
  const scene = { mode: 'team', towers: [tower], fighters: [fighter, enemy], projectiles: [], towerHeals: [] };
  updateTowers.call(scene, 1); updateTowerHealing.call(scene, 1);
  assert.equal(scene.projectiles.length, 1); assert.equal(scene.projectiles[0].team, 0);
  assert.ok(scene.projectiles[0].vx > 0); assert.equal(tower.reload, 2);
  assert.equal(scene.towerHeals.length, 1); assert.equal(inTowerAura.call(scene, fighter), true);
  assert.ok(fighter.hp > 20); assert.equal(fighter.stats.recovered, fighter.hp - 20);
  assert.equal(tower.hp, 500 - fighter.stats.recovered); assert.equal(enemy.hp, 100);
});
