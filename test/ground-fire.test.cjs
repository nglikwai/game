const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { Fighter } = load('src/Fighter.ts');
const { WEAPONS } = load('src/weapons.ts');
const { roleById } = load('src/roles.ts');
const { QUEST } = load('src/config.ts');
const { getMap } = load('src/maps/index.ts');

function fighter(index, team, x, y) {
  const body = {
    center: { x, y }, velocity: { x: 0, y: 0 }, enable: true,
    setVelocity() {}, reset(nx, ny) { this.center.x = nx; this.center.y = ny; },
  };
  const f = new Fighter(index, 0xffffff, WEAPONS[0], [], roleById('ronin'), { labels: [] }, body, {});
  f.team = team;
  return f;
}

function sceneFor(data) {
  const scene = new BattleScene();
  scene.init(data);
  scene.countdown = 0;
  scene.fx = { eruption() {}, ember() {} };
  scene.dealDamage = () => {};
  scene.fighters = [];
  return scene;
}

const party = [
  { control: 'kb1', team: 0 },
  { control: 'off', team: 0 },
  { control: 'off', team: 0 },
  { control: 'off', team: 0 },
];

test('the Oni hall and Dirge hall burst fire from their braziers', () => {
  const hall = getMap('onihall');
  const dirge = getMap('dirge');
  assert.equal(hall.flames.spots.length, 4);
  assert.equal(hall.flames.count, 2);
  assert.equal(dirge.flames.spots.length, 2);
  assert.equal(dirge.flames.count, 1);
  assert.ok(hall.flames.dps > 0 && hall.flames.life > 2);
});

test('a burst leaves fire, and only a fighter standing in it is burned', () => {
  const scene = sceneFor({ mode: 'quest', slots: party, quest: { stage: QUEST.bossStage } });
  const flames = scene.map.flames;
  scene.flameT = 0;
  scene.updateFlames(0.05);
  assert.equal(scene.flameMarks.length, flames.count);
  const spot = scene.flameMarks[0];
  const on = fighter(0, 0, spot.x, spot.y);
  const off = fighter(1, 1, spot.x + flames.radius + 30, spot.y);
  scene.fighters = [on, off];
  const hp = on.hp;
  while (scene.flameMarks.length) scene.updateFlames(0.05);
  assert.equal(scene.flamePatches.length, flames.count);
  assert.equal(on.hp, hp);
  scene.updateFlames(0.5);
  assert.ok(on.hp < hp);
  assert.equal(off.hp, hp);
  assert.ok(on.hp <= hp - flames.dps * 0.5 + 0.01);
});

test('a vent eruption leaves fire that keeps burning', () => {
  const scene = sceneFor({
    mode: 'ffa',
    mapId: 'volcano',
    slots: party,
  });
  assert.equal(scene.map.id, 'volcano');
  scene.ventT = 0;
  scene.updateVents(0.05);
  assert.equal(scene.ventMarks.length, scene.map.vents.count);
  while (scene.ventMarks.length) scene.updateVents(0.05);
  assert.equal(scene.flamePatches.length, scene.map.vents.count);
  const p = scene.flamePatches[0];
  const on = fighter(0, 0, p.x, p.y);
  scene.fighters = [on];
  const hp = on.hp;
  scene.updateFlames(0.5);
  assert.ok(on.hp < hp);
});
