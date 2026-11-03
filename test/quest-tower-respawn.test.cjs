const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { Fighter } = load('src/gameplay/Fighter.ts');
const { roleById } = load('src/gameplay/roles.ts');
const { WEAPONS } = load('src/gameplay/weapons.ts');

function battle(mode = 'quest') {
  const scene = new BattleScene();
  scene.init({ mode, slots: [], ...(mode === 'quest' ? { quest: { stage: 1 } } : {}) });
  const makeFighter = (index, team) => {
    const body = { center: { x: 200, y: 200 }, velocity: { x: 0, y: 0 },
      reset(x, y) { this.center = { x: x + 18, y: y + 18 }; } };
    const f = new Fighter(index, 0xffffff, WEAPONS[0], [], roleById('ronin'), { labels: [] }, body, scene);
    f.team = team; return f;
  };
  const party = makeFighter(0, 0), enemy = makeFighter(4, 1);
  enemy.state = 'dead'; enemy.soul = 80; enemy.pocket.push({ id: 'rice-ball' });
  const tower = (team = 1) => {
    const t = { team, main: true, x: 1100, y: 500, w: 64, h: 64, hp: 500, maxHp: 500, alive: true, rect: {},
      collider: { destroy() {} }, body: { destroy() {} } };
    scene.towers.push(t); scene.obstacleRects.push(t.rect); return t;
  };
  const home = tower();
  scene.fighters = [party, enemy]; scene.stats = scene.fighters.map((f) => f.stats);
  scene.freeSpot = (spot) => spot;
  scene.fx = { hitSpark() {}, respawnBeam() {}, smoke() {}, hammerSmash() {} };
  scene.popText = () => {}; scene.showBanner = () => {};
  return { scene, party, enemy, home, tower, makeFighter };
}

test('stage 2 guards wait 10 seconds initially and each completed respawn deducts 10% tower max HP', () => {
  const { scene, enemy, home } = battle();
  scene.updateTeamRespawns(0);
  assert.equal(scene.respawnTimers.get(enemy), 10);
  assert.equal(home.hp, 500);
  scene.updateTeamRespawns(9.99);
  assert.equal(enemy.alive, false);
  assert.equal(home.hp, 500);
  scene.updateTeamRespawns(0.01);
  assert.equal(enemy.alive, true);
  assert.equal(home.hp, 450);
  assert.equal(enemy.hp, enemy.maxHp * 0.75);
  assert.equal(enemy.soul, 40);
  assert.equal(enemy.pocket.length, 0);
  scene.updateTeamRespawns(1);
  assert.equal(home.hp, 450); // the cost is paid once, not every update
});

test('late-stage enemies return in pairs every 35 seconds, each paying the tower HP cost', () => {
  const { scene, enemy, makeFighter, home } = battle();
  const second = makeFighter(5, 1), third = makeFighter(6, 1);
  second.state = third.state = 'dead';
  scene.fighters.push(second, third); scene.elapsed = 1000;
  [enemy, second, third].forEach((f, i) => scene.deathTime.set(f, i + 2));
  scene.updateTeamRespawns(0);
  assert.equal(scene.respawnTimers.get(enemy), 35);
  assert.equal(scene.respawnTimers.get(second), 35);
  assert.equal(scene.respawnTimers.get(third), Infinity);
  scene.updateTeamRespawns(35);
  assert.equal(enemy.alive, true); assert.equal(second.alive, true); assert.equal(third.alive, false);
  assert.equal(home.hp, 400);
  assert.equal(scene.teamRespawnT[1], 35);
  scene.updateTeamRespawns(34);
  assert.equal(third.alive, false);
  scene.updateTeamRespawns(1);
  assert.equal(third.alive, true);
  assert.equal(home.hp, 350);
});

test('a guard respawn can exhaust its tower, and later respawns use the surviving enemy tower', () => {
  const { scene, enemy, home, tower, makeFighter } = battle();
  const other = tower(); other.y = 800;
  const second = makeFighter(5, 1); second.state = 'dead'; scene.fighters.push(second);
  home.hp = 20;
  scene.teamRespawnT[1] = 0;
  scene.updateTeamRespawns(0);
  assert.equal(enemy.alive, true);
  assert.equal(home.hp, 0); assert.equal(home.alive, false);
  assert.equal(other.hp, 500);
  scene.teamRespawnT[1] = 0;
  scene.updateTeamRespawns(0);
  assert.equal(second.alive, true);
  assert.equal(other.hp, 450);
});

test('exhausting the last enemy tower clears stage 2 and leaves no source for further respawns', () => {
  const { scene, enemy, home } = battle();
  home.hp = 1; scene.teamRespawnT[1] = 0;
  scene.updateTeamRespawns(0);
  assert.equal(home.hp, 0); assert.equal(home.alive, false);
  let clears = 0; scene.questClear = () => clears++;
  scene.updateQuest(0);
  assert.equal(clears, 1);
  enemy.state = 'dead'; scene.updateTeamRespawns(100);
  assert.equal(enemy.alive, false);
  assert.equal(scene.teamRespawnT[1], -1);
});

test('normal team respawns retain their original wait and one-HP tower floor', () => {
  const { scene, enemy, home, makeFighter } = battle('team');
  scene.fighters.push(makeFighter(5, 1)); // An ally must still be standing.
  home.hp = 20;
  scene.updateTeamRespawns(0);
  assert.equal(scene.respawnTimers.get(enemy), 4);
  scene.updateTeamRespawns(4);
  assert.equal(enemy.alive, true);
  assert.equal(home.hp, 1); assert.equal(home.alive, true);
});

test('a surviving tower cannot revive a team after all its fighters are defeated', () => {
  const { scene, enemy, home } = battle('team');
  scene.teamRespawnT[1] = 0;
  scene.updateTeamRespawns(100);
  assert.equal(enemy.alive, false);
  assert.equal(home.alive, true);
  assert.equal(home.hp, 500);
  assert.equal(scene.teamRespawnT[1], -1);
});
