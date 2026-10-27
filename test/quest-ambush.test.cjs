const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene } = load('@/scenes/BattleScene.ts');
const { QUEST, QUEST_FIGHTS, prepareQuest, MAP_SCALE, WIDTH, HEIGHT, HUD_HEIGHT } = load('@/config/index.ts');
const { getSettings } = load('@/state/gameSettings.ts');
const { getMap, MAPS } = load('@/maps/index.ts');
const { layoutPoint } = load('@/maps/layout.ts');
const { toWorld } = load('@/battle/coordinates.ts');
const { T, setLang } = load('@/localization/index.ts');

function battle(partySize = 4, side = 'heroes', seed = 123) {
  const slots = structuredClone(getSettings().slots);
  slots.forEach((s, i) => { s.control = i < partySize ? 'cpu' : 'off'; s.questSide = side; });
  const scene = new BattleScene();
  scene.init({ mode: 'quest', slots, quest: { stage: QUEST.ambushStage, side, layoutSeed: seed } });
  scene.countdown = 0;
  return scene;
}

test('Red Sand Ambush is an opening enemy fight with four opening choices and localized goals', () => {
  assert.equal(QUEST_FIGHTS.length, 4);
  assert.ok(QUEST_FIGHTS.includes(QUEST.ambushStage));
  const run = prepareQuest({ stage: QUEST.ambushStage });
  assert.equal(run.route[0], QUEST.ambushStage); assert.equal(run.route.length, 5);
  const map = getMap('ambush');
  assert.equal(map.zh, '赤砂伏擊'); assert.equal(MAPS.includes(map), false);
  assert.equal(battle().bgm, 'hell');
  for (const lang of ['en', 'zh']) {
    setLang(lang); assert.ok(T().questGoals[QUEST.ambushStage]); assert.ok(T().hellGoals[QUEST.ambushStage]);
  }
});

test('one to four heroes start centrally with two to four enemies split across both flanks', () => {
  for (let party = 1; party <= 4; party++) for (let seed = 0; seed < 20; seed++) {
    const scene = battle(party, 'heroes', seed);
    const starts = scene.assignStarts(false);
    const center = toWorld(layoutPoint(scene.map, { x: WIDTH / 2, y: (HUD_HEIGHT + HEIGHT) / 2 }));
    const heroes = scene.slots.flatMap((s, i) => s.control !== 'off' && s.team === 0 ? [i] : []);
    const foes = scene.slots.flatMap((s, i) => s.control !== 'off' && s.team === 1 ? [i] : []);
    assert.equal(heroes.length, party); assert.equal(foes.length, Math.min(4, party + 1));
    for (const i of heroes) assert.ok(Math.hypot(starts[i].x - center.x, starts[i].y - center.y) < 75 * MAP_SCALE);
    assert.ok(foes.some((i) => starts[i].x < center.x - 250 * MAP_SCALE));
    assert.ok(foes.some((i) => starts[i].x > center.x + 250 * MAP_SCALE));
    for (const i of [...heroes, ...foes]) for (const o of scene.map.obstacles) {
      const at = toWorld(o);
      const dx = Math.max(0, Math.abs(starts[i].x - at.x) - o.w * MAP_SCALE / 2);
      const dy = Math.max(0, Math.abs(starts[i].y - at.y) - o.h * MAP_SCALE / 2);
      assert.ok(Math.hypot(dx, dy) > 20);
    }
  }
});

test('the ambush only clears after every enemy falls; eliminating the party fails', () => {
  const scene = battle();
  const hero = { team: 0, alive: true }, foe = { team: 1, alive: true };
  scene.fighters = [hero, foe];
  let clears = 0, fails = 0;
  scene.questClear = () => clears++; scene.questFail = () => fails++;
  scene.updateQuest(1); assert.equal(clears, 0);
  foe.alive = false; scene.updateQuest(1); assert.equal(clears, 1);
  hero.alive = false; scene.updateQuest(1); assert.equal(fails, 1);
});

test('Hell ambushers win by eliminating heroes and lose when the ambushers all fall', () => {
  for (const winner of [0, 1]) {
    const scene = battle(1, 'hell');
    scene.fighters = [0, 1].map((team) => ({ team, alive: team === winner }));
    let result;
    scene.questClear = () => result = 'clear'; scene.questFail = () => result = 'fail';
    scene.updateQuest(0.01);
    assert.equal(result, winner === 1 ? 'clear' : 'fail');
    const starts = scene.assignStarts(false);
    assert.ok(starts[0] && starts[4]);
  }
});

test('barrels and sand pits share the retry layout and can hurt either side', () => {
  const scene = battle(), again = battle();
  assert.deepEqual(scene.map.kegs, again.map.kegs); assert.deepEqual(scene.map.zones, again.map.zones);
  assert.ok(scene.map.zones.every((z) => z.kind === 'sandpit'));
  assert.equal(scene.map.kegs.spots.length, 4);
  const hits = [];
  scene.fighters = [0, 1].map((team) => ({ team, alive: true, untouchable: false, x: 505, y: 500, radius: 18 }));
  const keg = { x: 500, y: 500, alive: true, body: { enable: true }, rect: {} };
  scene.kegs = [keg]; scene.obstacleRects = [keg.rect];
  scene.fx = { bombBlast() {} }; scene.screenFlash = () => {};
  scene.dealDamage = (_from, to) => hits.push(to.team);
  scene.explodeKeg(keg);
  assert.deepEqual(hits, [0, 1]); assert.equal(keg.alive, false);
});
