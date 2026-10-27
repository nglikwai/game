const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { Fighter } = load('src/gameplay/Fighter.ts');
const { WEAPONS } = load('src/gameplay/weapons.ts');
const { roleById } = load('src/gameplay/roles.ts');
const { QUEST, QUEST_SEMIFINALS, rollQuestRoute, routeWithStage, MAP_SCALE } = load('src/config/index.ts');
const { getMap, QUEST_MAPS } = load('src/maps/index.ts');
const { T, setLang } = load('src/localization/index.ts');
const { bondStep, chargeEnd, inRingGap, ringGaps, ringTouches, segmentDistance, wyvernInterval, wyvernStep } = load('src/battle/quest/wyvernRules.ts');

const S = MAP_SCALE;
const W = QUEST.wyverns;

function fighter(index, team, x = 400, y = 400) {
  const body = {
    center: { x, y }, velocity: { x: 0, y: 0 }, enable: true,
    setVelocity() {}, reset() {},
  };
  const known = { popText() {}, terrainAt() { return null; }, hazardSlow() { return 1; }, inTowerAura() { return false; } };
  const arena = new Proxy(known, { get: (t, k) => (k in t ? t[k] : () => null) });
  const f = new Fighter(index, 0xffffff, WEAPONS[0], [], roleById('ronin'), { labels: [] }, body, arena);
  f.team = team;
  return f;
}

function place(f, x, y) {
  f.body.center.x = x;
  f.body.center.y = y;
}

function box() {
  return { setImmovable() {}, reset(x, y) { this.x = x; this.y = y; }, destroy() {} };
}

/** Run the wyverns with a fixed random roll, without leaking it into another test. */
function step(scene, dt, roll) {
  const random = Math.random;
  try { if (roll !== undefined) Math.random = () => roll; scene.updateWyverns(dt); }
  finally { Math.random = random; }
}

function gorge() {
  const scene = new BattleScene();
  scene.init({ mode: 'quest', slots: ['keys', 'off', 'off', 'off'].map((control) => ({ control, team: 0 })), quest: { stage: QUEST.wyvernStage } });
  scene.countdown = 0;
  scene.showBanner = () => {};
  scene.popText = () => {};
  scene.fx = new Proxy({}, { get: () => () => {} });
  scene.physics = { add: { body: () => box(), staticBody: () => box(), collider: () => ({ destroy() {} }) } };
  scene.dealDamage = (_from, to, dmg) => { to.hp -= dmg; if (to.hp <= 0) to.state = 'dead'; };
  return scene;
}

const sun = (scene) => scene.wyverns.find((w) => w.kind === 'sun');
const moon = (scene) => scene.wyverns.find((w) => w.kind === 'moon');

test('the eclipse gorge is the second semi-final, drawn as often as the dragon, with boss music', () => {
  assert.equal(QUEST.maps[QUEST.wyvernStage], 'eclipse');
  assert.ok(QUEST_MAPS.some((m) => m.id === 'eclipse'));
  assert.equal(getMap('eclipse').zh, '日月峽');
  assert.deepEqual(Array.from(QUEST_SEMIFINALS), [QUEST.dragonStage, QUEST.wyvernStage]);
  const seen = new Set();
  for (let n = 0; n < 60; n++) {
    const route = rollQuestRoute();
    assert.ok(QUEST_SEMIFINALS.includes(route[3]));
    seen.add(route[3]);
  }
  assert.equal(seen.size, 2);
  // Asking for the wyverns puts them in the semi-final slot.
  const route = routeWithStage(QUEST.wyvernStage);
  assert.equal(route[3], QUEST.wyvernStage);
  assert.equal(route.length, 5);
  assert.equal(gorge().bgm, 'boss');
  for (const lang of ['en', 'zh']) {
    setLang(lang);
    assert.ok(T().questGoals[QUEST.wyvernStage].length > 0);
    assert.ok(T().hellGoals[QUEST.wyvernStage].length > 0);
    assert.ok(T().wyvernStatus(2, -1, 2).length > 0);
  }
  setLang('zh');
});

test('two wyverns stand on the enemy side as moving targets, scaled by party size, that never shoot arrows', () => {
  const scene = gorge();
  scene.fighters = [fighter(0, 0)];
  scene.placeWyverns(3);
  assert.equal(scene.wyverns.length, 2);
  assert.deepEqual(Array.from(scene.wyverns, (w) => w.kind), ['sun', 'moon']);
  for (const wy of scene.wyverns) {
    assert.ok(scene.towers.includes(wy.tower));
    assert.equal(wy.tower.team, 1);
    assert.equal(wy.tower.wyvern, wy.kind);
    assert.equal(wy.tower.range, 0);
    assert.equal(wy.tower.maxHp, W.hpBase + W.hpPerPlayer * 3);
    assert.ok(scene.obstacleRects.includes(wy.tower.rect));
  }
  // The Sun starts in the upper gorge, the Moon in the lower; the Moon attacks half a beat later.
  assert.ok(sun(scene).tower.y < moon(scene).tower.y);
  assert.ok(moon(scene).t > sun(scene).t);
});

test('the bond: a fallen wyvern rises after the delay while its partner stands; both down means gone for good', () => {
  assert.deepEqual({ ...bondStep(true, true, -1, 1, 15) }, { reviveT: -1, rise: false });
  assert.deepEqual({ ...bondStep(false, true, -1, 1, 15) }, { reviveT: 15, rise: false });
  assert.deepEqual({ ...bondStep(false, true, 15, 5, 15) }, { reviveT: 10, rise: false });
  assert.deepEqual({ ...bondStep(false, true, 0.5, 1, 15) }, { reviveT: -1, rise: true });
  assert.deepEqual({ ...bondStep(false, false, 7, 1, 15) }, { reviveT: -1, rise: false });
  assert.ok(wyvernInterval(true, false) < wyvernInterval(false, false));
  assert.ok(wyvernInterval(false, true) > wyvernInterval(false, false));

  const scene = gorge();
  const hero = fighter(0, 0);
  scene.fighters = [hero];
  scene.placeWyverns(1);
  place(hero, 150 * S, 150 * S);
  for (const wy of scene.wyverns) wy.t = 999;
  const s = sun(scene);
  scene.damageTower(s.tower, 1e9, undefined);
  assert.equal(s.tower.alive, false);
  assert.ok(!scene.obstacleRects.includes(s.tower.rect));
  step(scene, 0.1);
  assert.equal(s.reviveT, W.reviveAfter);
  step(scene, W.reviveAfter - 1);
  assert.equal(s.tower.alive, false);
  step(scene, 1.2);
  assert.equal(s.tower.alive, true);
  assert.equal(s.tower.hp, Math.round(s.tower.maxHp * W.reviveHp));
  assert.ok(scene.obstacleRects.includes(s.tower.rect));

  // Now fell both inside the window: neither comes back, and with no guards left the stage clears.
  let cleared = 0;
  scene.questClear = () => { cleared++; };
  scene.questFail = () => {};
  scene.damageTower(s.tower, 1e9, undefined);
  step(scene, 0.1);
  scene.updateQuest(0.01);
  assert.equal(cleared, 0);
  scene.damageTower(moon(scene).tower, 1e9, undefined);
  step(scene, 0.1);
  step(scene, W.reviveAfter * 2);
  assert.ok(scene.wyverns.every((w) => !w.tower.alive && w.reviveT < 0));
  scene.updateQuest(0.01);
  assert.equal(cleared, 1);
});

test('the lightning chain between them shocks whoever stands on it, and nobody away from it or on their side', () => {
  const scene = gorge();
  const onChain = fighter(0, 0);
  const away = fighter(1, 0);
  const guard = fighter(4, 1);
  scene.fighters = [onChain, away, guard];
  scene.placeWyverns(1);
  for (const wy of scene.wyverns) wy.t = 999;
  const a = sun(scene).tower;
  const b = moon(scene).tower;
  place(onChain, (a.x + b.x) / 2, (a.y + b.y) / 2);
  place(guard, (a.x + b.x) / 2, (a.y + b.y) / 2 + 4);
  place(away, 150 * S, 150 * S);
  assert.ok(segmentDistance(onChain, a, b) < 1);
  const hp = [onChain.hp, away.hp, guard.hp];
  step(scene, W.tether.tick + 0.05);
  assert.ok(onChain.hp < hp[0]);
  assert.equal(away.hp, hp[1]);
  assert.equal(guard.hp, hp[2]);
});

test('frost ring: the gaps are safe, anywhere else on the ring is struck by ice once', () => {
  const gaps = ringGaps(3, () => 0);
  assert.equal(gaps.length, 3);
  assert.ok(inRingGap(gaps[1], gaps, 0.5));
  assert.ok(inRingGap(gaps[2] + 0.2, gaps, 0.5));
  assert.ok(!inRingGap(gaps[0] + Math.PI / 3, gaps, 0.5));
  assert.ok(inRingGap(gaps[0] + Math.PI * 2, gaps, 0.5));
  assert.ok(ringTouches(100, 110, 20, 5));
  assert.ok(!ringTouches(100, 130, 20, 5));

  for (const safe of [true, false]) {
    const scene = gorge();
    const hero = fighter(0, 0);
    scene.fighters = [hero];
    scene.placeWyverns(1);
    place(hero, 150 * S, 150 * S);
    sun(scene).t = 999;
    moon(scene).t = 0.01;
    // Roll the ring, then let it go.
    for (let k = 0; k < 25 && scene.wyvernRings.length === 0; k++) step(scene, 0.05, 0.1);
    assert.equal(scene.wyvernRings.length, 1);
    const ring = scene.wyvernRings[0];
    const angle = ring.gaps[0] + (safe ? 0 : Math.PI / 3);
    const d = ring.r + 200 * S;
    place(hero, ring.x + Math.cos(angle) * d, ring.y + Math.sin(angle) * d);
    sun(scene).tower.alive = false;
    sun(scene).reviveT = 99;
    moon(scene).t = 999;
    const hp = hero.hp;
    for (let k = 0; k < 40; k++) step(scene, 0.05);
    if (safe) assert.equal(hero.hp, hp);
    else {
      assert.ok(hero.hp < hp);
      assert.ok(hero.frostT > 0);
      assert.equal(ring.hit.length, 1);
    }
  }
});

test('sunfall marks each target, warns CPUs off the marks, then bursts with fire on whoever is still inside', () => {
  const scene = gorge();
  const hero = fighter(0, 0);
  scene.fighters = [hero];
  scene.placeWyverns(1);
  const s = sun(scene);
  place(hero, s.tower.x - 400 * S, s.tower.y);
  moon(scene).tower.alive = false;
  moon(scene).reviveT = 99;
  s.t = 0.01;
  step(scene, 0.05, 0.1);
  assert.equal(s.cast.kind, 'sunfall');
  assert.equal(s.cast.marks.length, 1);
  const dangers = scene.wyvernDangers();
  assert.ok(dangers.some((z) => z.safeTeam === 1 && Math.hypot(z.x - hero.x, z.y - hero.y) < z.r));
  const hp = hero.hp;
  for (let k = 0; k < 30; k++) step(scene, 0.05, 0.1);
  assert.ok(hero.hp < hp);
  assert.ok(hero.burnT > 0);
});

test('blaze charge: the Sun holds still while its lane shows, then rushes down it and hits each fighter once', () => {
  const end = chargeEnd({ x: 100, y: 100 }, 0, 1000, { minX: 0, maxX: 400, minY: 0, maxY: 400 });
  assert.deepEqual({ ...end }, { x: 400, y: 100 });
  const scene = gorge();
  const hero = fighter(0, 0);
  scene.fighters = [hero];
  scene.placeWyverns(1);
  const s = sun(scene);
  place(hero, s.tower.x - 300 * S, s.tower.y);
  moon(scene).tower.alive = false;
  moon(scene).reviveT = 99;
  s.t = 0.01;
  step(scene, 0.05, 0.9);
  assert.equal(s.cast.kind, 'charge');
  const start = { x: s.tower.x, y: s.tower.y };
  step(scene, W.charge.warn * 0.5, 0.9);
  assert.deepEqual({ x: s.tower.x, y: s.tower.y }, start);
  const hp = hero.hp;
  let hits = 0;
  for (let k = 0; k < 80; k++) {
    step(scene, 0.02, 0.9);
    if (s.charge) hits = s.charge.hit.length;
  }
  assert.ok(hero.hp < hp);
  assert.equal(hits, 1);
  assert.ok(s.tower.x < start.x);
});

test('the wyverns keep their distance from each other and stay inside their halves of the gorge', () => {
  const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 1000 };
  const close = wyvernStep({ x: 500, y: 500 }, null, { x: 520, y: 500 }, 300, 100, 0.5, bounds, 200, 600);
  // The partner is just to the right: it steps away, to the left.
  assert.ok(close.x < 500);
  const far = wyvernStep({ x: 500, y: 500 }, null, { x: 500, y: 0 }, 300, 100, 0.5, { ...bounds, minY: 400 }, 100, 300);
  assert.ok(far.y < 500 && far.y >= 400);
  const scene = gorge();
  const hero = fighter(0, 0);
  scene.fighters = [hero];
  scene.placeWyverns(1);
  for (const wy of scene.wyverns) wy.t = 999;
  place(hero, sun(scene).tower.x - 60 * S, sun(scene).tower.y);
  for (let k = 0; k < 100; k++) step(scene, 0.05);
  assert.ok(sun(scene).tower.y < moon(scene).tower.y);
  assert.ok(Math.hypot(sun(scene).tower.x - moon(scene).tower.x, sun(scene).tower.y - moon(scene).tower.y) <= W.maxGap * S + 40);
});
