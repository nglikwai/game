const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { Fighter } = load('src/gameplay/Fighter.ts');
const { WEAPONS } = load('src/gameplay/weapons.ts');
const { roleById } = load('src/gameplay/roles.ts');
const { QUEST, QUEST_SEMIFINALS, rollQuestRoute, ELEMENT, MAP_SCALE, WIDTH, HEIGHT, HUD_HEIGHT } = load('src/config/index.ts');
const { getMap } = load('src/maps/index.ts');
const { nextDragonHead, dragonInterval, dragonStep, aimFollows, resolveElementHit, turnToward } = load('src/battle/quest/dragonRules.ts');
const { dragonRayEntry, touchesDragonBeam } = load('src/battle/quest/dragonRules.ts');
const { dragonBeamPath, updateDragonBeam, renderDragonBeam } = load('src/battle/quest/dragonBeams.ts');

function fighter(index, team, x = 400, y = 400) {
  const body = {
    center: { x, y }, velocity: { x: 0, y: 0 }, enable: true,
    setVelocity() {}, reset() {},
  };
  // Only what these tests rely on is spelled out; anything else the fighter asks the arena for is a no-op.
  const known = { popText() {}, terrainAt() { return null; }, hazardSlow() { return 1; }, inTowerAura() { return false; } };
  const arena = new Proxy(known, { get: (t, k) => (k in t ? t[k] : () => null) });
  const f = new Fighter(index, 0xffffff, WEAPONS[0], [], roleById('ronin'), { labels: [] }, body, arena);
  f.team = team;
  return f;
}

/** A fighter's position is its body's centre. */
function place(f, x, y) {
  f.body.center.x = x;
  f.body.center.y = y;
}

/** Choose a deterministic attack roll without leaking it into another test. */
function updateWithRoll(scene, dt, roll) {
  const random = Math.random;
  try { Math.random = () => roll; scene.updateDragon(dt); }
  finally { Math.random = random; }
}

/** A moving physics box, as the Phaser stub would need it. */
function box() {
  return { setImmovable() {}, reset(x, y) { this.x = x; this.y = y; }, destroy() {} };
}

function lair(partyControls = ['keys', 'off', 'off', 'off']) {
  const scene = new BattleScene();
  scene.init({
    mode: 'quest',
    slots: partyControls.map((control) => ({ control, team: 0 })),
    quest: { stage: QUEST.dragonStage },
  });
  scene.countdown = 0;
  scene.showBanner = () => {};
  scene.popText = () => {};
  scene.fx = { ember() {}, summonPulse() {}, frostBurst() {}, sparks() {}, hitSpark() {}, smoke() {}, bombBlast() {}, skyBolt() {}, respawnBeam() {} };
  scene.physics = { add: { body: () => box(), staticBody: () => box(), collider: () => ({ destroy() {} }) } };
  scene.dealDamage = (_from, to, dmg) => { to.hp -= dmg; if (to.hp <= 0) to.state = 'dead'; };
  return scene;
}

test('the dragon lair is one of the semi-finals, with three guards and boss music', () => {
  assert.equal(QUEST.maps[QUEST.dragonStage], 'dragon');
  assert.ok(QUEST_SEMIFINALS.includes(QUEST.dragonStage));
  const route = rollQuestRoute();
  assert.ok(QUEST_SEMIFINALS.includes(route[route.length - 2]));
  assert.equal(getMap('dragon').zh, '龍巢');
  const scene = lair();
  assert.equal(scene.slots.filter((s) => s.team === 1 && s.control === 'cpu').length, 3);
  assert.equal(scene.bgm, 'boss');
});

test('three heads ride on the body on the enemy side, scaled by party size, and never shoot arrows or respawn anyone', () => {
  const scene = lair();
  scene.fighters = [fighter(0, 0)];
  scene.placeDragon(2);
  assert.ok(scene.dragonBody.alive);
  assert.deepEqual(Array.from(scene.dragonHeads, (h) => h.dragon), ['fire', 'thunder', 'ice']);
  for (const h of scene.dragonHeads) {
    assert.equal(h.team, 1);
    assert.equal(h.main, false);
    assert.equal(h.range, 0);
    assert.equal(h.maxHp, QUEST.dragon.hpBase + QUEST.dragon.hpPerPlayer * 2);
    assert.ok(scene.towers.includes(h));
    // Heads sit in front of (to the left of) the body.
    assert.ok(h.x < scene.dragonBody.x);
  }
});

test('the dragon walks to keep its distance, stays in its area, and carries its heads along', () => {
  const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 1000 };
  const close = dragonStep({ x: 500, y: 500 }, { x: 450, y: 500 }, 300, 100, 0.5, bounds);
  assert.ok(close.x > 500, 'backs away from a fighter who is too close');
  const far = dragonStep({ x: 500, y: 500 }, { x: 0, y: 500 }, 300, 100, 0.5, bounds);
  assert.ok(far.x < 500, 'closes in on a fighter who is too far');
  const edge = dragonStep({ x: 995, y: 500 }, { x: 990, y: 500 }, 300, 100, 1, bounds);
  assert.equal(edge.x, 1000, 'never leaves its area');
  const scene = lair();
  const hero = fighter(0, 0);
  scene.fighters = [hero];
  scene.placeDragon(1);
  // Start it away from the edge of its area so it has room to back off.
  scene.dragonBody.x -= 200;
  place(hero, scene.dragonBody.x - 60, scene.dragonBody.y);
  scene.dragonT = 99;
  scene.updateDragon(0.01);
  const before = { body: scene.dragonBody.x, head: scene.dragonHeads[0].x };
  scene.updateDragon(0.5);
  const moved = scene.dragonBody.x - before.body;
  assert.ok(moved > 0);
  assert.ok(Math.abs(scene.dragonHeads[0].x - before.head - moved) < 1e-6);
  assert.equal(scene.dragonHeads[0].rect.x, scene.dragonHeads[0].x - scene.dragonHeads[0].w / 2);
});

test('the heads take turns in order, skip fallen heads, speed up as heads fall, and hold back while guards fight', () => {
  assert.equal(nextDragonHead(['fire', 'ice', 'thunder'], null), 'fire');
  assert.equal(nextDragonHead(['fire', 'ice', 'thunder'], 'fire'), 'ice');
  assert.equal(nextDragonHead(['fire', 'thunder'], 'fire'), 'thunder');
  assert.equal(nextDragonHead(['fire', 'thunder'], 'thunder'), 'fire');
  assert.equal(nextDragonHead([], 'fire'), null);
  assert.equal(dragonInterval(3), QUEST.dragon.interval);
  assert.ok(dragonInterval(2) < dragonInterval(3));
  assert.ok(dragonInterval(1) < dragonInterval(2));
  assert.equal(dragonInterval(3, true), QUEST.dragon.interval * QUEST.dragon.guardPhaseSlow);
  // The aim follows until the last `lock` seconds.
  assert.equal(aimFollows(0.2, 0.8, 0.3), true);
  assert.equal(aimFollows(0.6, 0.8, 0.3), false);
});

test('elements: fire burns and melts ice, ice freezes the frostbitten, frost conducts lightning', () => {
  const fire = resolveElementHit('fire', { frostT: 0, frozen: true });
  assert.equal(fire.burn, QUEST.dragon.fire.burn);
  assert.equal(fire.melt, true);
  const firstIce = resolveElementHit('ice', { frostT: 0, frozen: false });
  assert.equal(firstIce.frost, QUEST.dragon.ice.frost);
  assert.equal(firstIce.freeze, undefined);
  const secondIce = resolveElementHit('ice', { frostT: 1, frozen: false });
  assert.equal(secondIce.freeze, QUEST.dragon.ice.freeze);
  const bolt = resolveElementHit('thunder', { frostT: 0, frozen: false });
  assert.equal(bolt.damage, QUEST.dragon.thunder.damage);
  assert.equal(bolt.paralyze, QUEST.dragon.thunder.paralyze);
  const conducted = resolveElementHit('thunder', { frostT: 2, frozen: false });
  assert.equal(conducted.conduct, true);
  assert.equal(conducted.damage, QUEST.dragon.thunder.damage * ELEMENT.conduct);
  const chained = resolveElementHit('thunder', { frostT: 0, frozen: false }, QUEST.dragon.thunder.chainShare);
  assert.equal(chained.damage, QUEST.dragon.thunder.damage * QUEST.dragon.thunder.chainShare);
  assert.equal(chained.paralyze, QUEST.dragon.thunder.chainParalyze);
});

test('a burning fighter loses HP over time and is healed for less', () => {
  const f = fighter(0, 0);
  f.hp = 50;
  f.burn(2);
  const intent = { mx: 0, my: 0, ax: 0, ay: 0, attack: false, skills: [false, false, false, false], useItem: false, nextItem: false };
  for (let k = 0; k < 10; k++) f.update(0.1, intent);
  assert.ok(Math.abs(f.hp - (50 - ELEMENT.burn.dps)) < 0.01);
  const gained = f.heal(20);
  assert.ok(Math.abs(gained - 20 * ELEMENT.burn.healing) < 0.01);
  for (let k = 0; k < 20; k++) f.update(0.1, intent);
  assert.equal(f.burnT, 0);
  assert.equal(f.heal(10), 10);
});

test('frostbite slows swings; a freeze holds a fighter until fire melts it', () => {
  const f = fighter(0, 0);
  f.frostbite(3);
  f.pe = 100;
  f.tryAttack();
  assert.equal(f.state, 'windup');
  assert.ok(Math.abs(f.stateDur - f.weapon.windup * ELEMENT.frost.swing) < 1e-9);
  const g = fighter(1, 0);
  g.freeze(1.2);
  assert.equal(g.paralyzed, true);
  assert.equal(g.frozen, true);
  assert.equal(g.melt(), true);
  assert.equal(g.paralyzed, false);
  assert.equal(g.melt(), false);
});

test('a head aims, then fires element shots; a hit applies the element and lightning chains to a teammate', () => {
  const scene = lair();
  const hero = fighter(0, 0);
  const mate = fighter(1, 0);
  scene.fighters = [hero, mate];
  scene.projectiles = [];
  scene.placeDragon(1);
  place(hero, scene.dragonBody.x - 380 * MAP_SCALE, scene.dragonBody.y);
  place(mate, hero.x, hero.y + 40);
  scene.dragonT = 0;
  updateWithRoll(scene, 0.01, 0.99);
  assert.equal(scene.dragonCast.element, 'fire');
  scene.updateDragon(QUEST.dragon.fire.warn + 0.01);
  assert.equal(scene.dragonCast, null);
  assert.equal(scene.projectiles.length, QUEST.dragon.fire.shots);
  assert.ok(scene.projectiles.every((p) => p.element === 'fire' && p.team === 1));
  // Shots leave from outside the head, so the dragon's own heads don't stop them.
  const head = scene.dragonHeads[0];
  for (const p of scene.projectiles) assert.ok(Math.abs(p.x - head.x) > head.w / 2 || Math.abs(p.y - head.y) > head.h / 2);
  // A lightning bolt on the hero: damage, paralysis, lost PE, and half again on the nearby teammate.
  hero.pe = 100;
  const hp = { hero: hero.hp, mate: mate.hp };
  scene.applyDragonHit(hero, 'thunder', { x: hero.x + 100, y: hero.y });
  assert.equal(hero.hp, hp.hero - QUEST.dragon.thunder.damage);
  assert.equal(hero.paralyzed, true);
  assert.equal(hero.pe, 100 - QUEST.dragon.thunder.peDrain);
  assert.equal(mate.hp, hp.mate - QUEST.dragon.thunder.damage * QUEST.dragon.thunder.chainShare);
  assert.equal(scene.dragonChains.length, 1);
});

test('the stage clears only when every guard and every head is down, and the dragon then collapses', () => {
  const scene = lair();
  const hero = fighter(0, 0);
  const guard = fighter(4, 1);
  scene.fighters = [hero, guard];
  scene.placeDragon(1);
  let cleared = 0;
  scene.questClear = () => { cleared++; };
  scene.questFail = () => {};
  guard.state = 'dead';
  scene.updateQuest(0.01);
  assert.equal(cleared, 0);
  for (const h of scene.dragonHeads) h.alive = false;
  scene.updateQuest(0.01);
  assert.equal(cleared, 1);
  assert.equal(scene.dragonBody.alive, false);
});

test('the lair keeps the guards and the dragon apart at the start, with stones for cover', () => {
  const map = getMap('dragon');
  assert.equal(map.obstacles.filter((o) => o.kind === 'pillar').length, 2);
  const leftmostHead = QUEST.dragon.start.x + Math.min(...QUEST.dragon.heads.map((h) => h.dx)) - QUEST.dragon.headSize / 2;
  for (const g of QUEST.dragon.guards) assert.ok(g.x + 18 < leftmostHead);
  assert.ok(map.herbs.spots.length >= 2);
});

test('every shot is fast, reaches across the whole cave, and bursts over an area', () => {
  const diagonal = Math.hypot(WIDTH, HEIGHT - HUD_HEIGHT) * MAP_SCALE;
  for (const e of ['fire', 'ice', 'thunder']) {
    const spec = QUEST.dragon[e];
    assert.ok(spec.range >= diagonal, `${e} reaches the far corner`);
    assert.ok(spec.speed >= 700, `${e} is fast`);
    assert.ok(spec.blast >= 60, `${e} bursts over an area`);
  }
});

test('a burst hits everyone on the other side inside it, misses those outside, and spares the dragon\'s side', () => {
  const scene = lair();
  const inside = fighter(0, 0);
  const edge = fighter(1, 0);
  const outside = fighter(2, 0);
  const guard = fighter(4, 1);
  scene.fighters = [inside, edge, outside, guard];
  const r = QUEST.dragon.fire.blast * MAP_SCALE;
  place(inside, 500, 500);
  place(edge, 500 + r, 500);
  place(outside, 500 + r + 80, 500);
  place(guard, 510, 500);
  const hp = scene.fighters.map((f) => f.hp);
  scene.dragonBlast({ x: 500, y: 500, vx: 1, vy: 0, team: 1, element: 'fire' });
  assert.equal(inside.hp, hp[0] - QUEST.dragon.fire.damage);
  assert.equal(edge.hp, hp[1] - QUEST.dragon.fire.damage);
  assert.ok(inside.burnT > 0 && edge.burnT > 0);
  assert.equal(outside.hp, hp[2]);
  assert.equal(outside.burnT, 0);
  assert.equal(guard.hp, hp[3]);
  assert.equal(scene.dragonBursts.length, 1);
});

test('the dragon turns, the short way and at a limited rate, until its heads face a fighter behind it', () => {
  assert.equal(turnToward(0, 1, 0.25), 0.25);
  assert.equal(turnToward(0, -1, 0.25), -0.25);
  // From just under +π to just over −π is a short turn, not a long way round.
  assert.ok(Math.abs(turnToward(3, -3, 1) - (3 + (Math.PI * 2 - 6))) < 1e-9);
  const scene = lair();
  const hero = fighter(0, 0);
  scene.fighters = [hero];
  scene.placeDragon(1);
  assert.equal(scene.dragonBody.facing, Math.PI);
  // Stand to the dragon's right (behind it), at the distance it likes.
  place(hero, scene.dragonBody.x + QUEST.dragon.keepRange * MAP_SCALE, scene.dragonBody.y);
  scene.dragonT = 99;
  for (let k = 0; k < 60; k++) scene.updateDragon(0.1);
  const facing = Math.atan2(Math.sin(scene.dragonBody.facing), Math.cos(scene.dragonBody.facing));
  assert.ok(Math.abs(facing) < 0.2, 'now faces right');
  for (const h of scene.dragonHeads) assert.ok(h.x > scene.dragonBody.x, 'heads are now on its right');
});

test('while any head lives, fallen guards come back one at a time up to three; after that they stay down', () => {
  const scene = lair();
  const hero = fighter(0, 0);
  const guards = [4, 5, 6, 7].map((i) => fighter(i, 1));
  scene.fighters = [hero, ...guards];
  scene.placeDragon(1);
  place(hero, scene.dragonBody.x - QUEST.dragon.keepRange * MAP_SCALE, scene.dragonBody.y);
  scene.dragonT = 999;
  guards[0].state = 'dead';
  guards[1].state = 'dead';
  scene.updateDragon(QUEST.dragon.guardRespawn - 0.5);
  assert.equal(guards.filter((g) => g.alive).length, 2);
  scene.updateDragon(1);
  assert.equal(guards.filter((g) => g.alive).length, 3);
  scene.updateDragon(QUEST.dragon.guardRespawn);
  assert.equal(guards.filter((g) => g.alive).length, QUEST.dragon.maxGuards);
  scene.updateDragon(QUEST.dragon.guardRespawn);
  assert.equal(guards.filter((g) => g.alive).length, 3);
  // Every head cut off: no more guards return.
  for (const h of scene.dragonHeads) h.alive = false;
  guards[2].state = 'dead';
  scene.updateDragon(0.01);
  scene.updateDragon(QUEST.dragon.guardRespawn * 2);
  assert.equal(guards[2].alive, false);
});

test('each head glows for half a second before a randomly chosen three-second sweeping breath', () => {
  for (const element of ['fire', 'ice', 'thunder']) {
    const scene = lair();
    scene.fighters = [fighter(0, 0)];
    scene.placeDragon(1);
    const head = scene.dragonHeads.find((h) => h.dragon === element);
    for (const other of scene.dragonHeads) other.alive = other === head;
    scene.dragonT = 0;
    updateWithRoll(scene, 0.01, 0);
    assert.equal(scene.dragonCast.beam, true);
    assert.equal(scene.dragonCast.warn, 0.5);
    scene.updateDragon(0.49);
    assert.equal(scene.dragonBeam, null);
    scene.updateDragon(0.011);
    assert.equal(scene.dragonCast, null);
    assert.equal(scene.dragonBeam.element, element);
    assert.equal(scene.projectiles.length, 0);
    const initial = scene.dragonBeam.angle;
    for (let k = 0; k < 15; k++) scene.updateDragon(0.1);
    assert.ok(Math.abs(Math.abs(scene.dragonBeam.angle - initial) - QUEST.dragon.beam.sweep / 2) < 1e-8);
    for (let k = 0; k < 16; k++) scene.updateDragon(0.1);
    assert.equal(scene.dragonBeam, null);
    scene.dragonT = 0;
    updateWithRoll(scene, 0.01, 0.99);
    assert.equal(scene.dragonCast.element, element);
    assert.equal(scene.dragonCast.beam, false);
  }
});

test('every head rolls beam or projectiles each turn, allowing either attack to repeat', () => {
  for (const element of ['fire', 'ice', 'thunder']) {
    const scene = lair();
    scene.fighters = [fighter(0, 0)];
    scene.placeDragon(1);
    for (const head of scene.dragonHeads) head.alive = head.dragon === element;
    for (const [roll, beam] of [[0, true], [0.49, true], [0.5, false], [0.99, false], [0, true]]) {
      scene.dragonCast = null;
      scene.dragonT = 0;
      updateWithRoll(scene, 0.01, roll);
      assert.equal(scene.dragonCast.element, element);
      assert.equal(scene.dragonCast.beam, beam);
      assert.equal(scene.dragonCast.warn, beam ? 0.5 : QUEST.dragon[element].warn);
    }
  }
});

test('beam geometry handles vertical rays, edges, targets behind the mouth and solid cover', () => {
  assert.equal(dragonRayEntry(0, 0, 0, { x: 100, y: -10, width: 20, height: 20 }), 100);
  assert.equal(dragonRayEntry(0, 0, Math.PI / 2, { x: -10, y: 100, width: 20, height: 20 }), 100);
  assert.equal(dragonRayEntry(0, 0, 0, { x: 100, y: 10, width: 20, height: 20 }), null);
  assert.equal(dragonRayEntry(0, 0, 0, { x: -100, y: -10, width: 20, height: 20 }), null);
  assert.equal(touchesDragonBeam(50, 15, 5, { x: 0, y: 0 }, 0, 100, 20), true);
  assert.equal(touchesDragonBeam(50, 16, 5, { x: 0, y: 0 }, 0, 100, 20), false);
  assert.equal(touchesDragonBeam(-30, 0, 5, { x: 0, y: 0 }, 0, 100, 20), false);
});

test('breath damages on timed ticks, spares allies and protected fighters, and stops at stone cover', () => {
  const scene = lair();
  const exposed = fighter(0, 0), covered = fighter(1, 0), ally = fighter(4, 1), safe = fighter(2, 0);
  scene.fighters = [exposed, covered, ally, safe];
  scene.placeDragon(1);
  const head = scene.dragonHeads[0];
  // Hold the angle fixed here to isolate collision and tick timing from the sweep test above.
  const beam = { element: 'fire', head, startAngle: Math.PI, angle: Math.PI, direction: 0, elapsed: 0, tick: 0 };
  scene.dragonBeam = beam;
  place(exposed, head.x - 140, head.y);
  place(covered, head.x - 400, head.y);
  place(ally, exposed.x, exposed.y);
  place(safe, exposed.x, exposed.y); safe.trapped = true;
  scene.shotBlockers = [{ x: head.x - 250, y: head.y - 70, width: 40, height: 140 }];
  const path = dragonBeamPath(beam, scene.shotBlockers, []);
  assert.ok(Math.abs(path.endX - (head.x - 210)) < 1e-8);
  const hp = exposed.hp;
  updateDragonBeam.call(scene, 0.01);
  assert.equal(exposed.hp, hp - QUEST.dragon.fire.damage * QUEST.dragon.beam.damageScale);
  const afterHit = exposed.hp;
  updateDragonBeam.call(scene, 0.1);
  assert.equal(exposed.hp, afterHit);
  updateDragonBeam.call(scene, 0.4);
  assert.equal(exposed.hp, hp - 2 * QUEST.dragon.fire.damage * QUEST.dragon.beam.damageScale);
  for (const f of [covered, ally, safe]) assert.equal(f.hp, f.maxHp);
  assert.ok(exposed.burnT > 0);

  // Chests are also solid cover, using the same segment for rendering and damage.
  const chestPath = dragonBeamPath(beam, [], [{ x: head.x - 200, y: head.y, w: 40, h: 80 }]);
  assert.ok(Math.abs(chestPath.endX - (head.x - 180)) < 1e-8);
});

test('ice and lightning breath preserve their elements without long repeated control or lightning chains', () => {
  for (const element of ['ice', 'thunder']) {
    const scene = lair();
    const hero = fighter(0, 0), mate = fighter(1, 0);
    scene.fighters = [hero, mate];
    scene.placeDragon(1);
    const head = scene.dragonHeads.find((h) => h.dragon === element);
    place(hero, head.x - 160, head.y);
    place(mate, hero.x, hero.y + 100);
    hero.frostbite(1);
    scene.dragonBeam = { element, head, startAngle: Math.PI, angle: Math.PI, direction: 0, elapsed: 0, tick: 0 };
    updateDragonBeam.call(scene, 0.01);
    const expected = QUEST.dragon[element].damage * QUEST.dragon.beam.damageScale * (element === 'thunder' ? ELEMENT.conduct : 1);
    assert.equal(hero.hp, hero.maxHp - expected);
    assert.ok(hero.stateDur <= QUEST.dragon.beam.maxControl);
    assert.equal(hero.frozen, element === 'ice');
    assert.equal(mate.hp, mate.maxHp);
    assert.equal(scene.dragonChains.length, 0);
  }
});

test('beam time freezes on pause/countdown/results and the beam ends when its head falls or the scene resets', () => {
  for (const stop of ['paused', 'countdown', 'over', 'head', 'reset']) {
    const scene = lair();
    scene.fighters = [fighter(0, 0)];
    scene.placeDragon(1);
    const head = scene.dragonHeads[0];
    scene.dragonBeam = { element: 'fire', head, startAngle: Math.PI, angle: Math.PI, direction: 1, elapsed: 0, tick: 0 };
    if (stop === 'head') head.alive = false;
    else if (stop === 'reset') scene.init({ mode: 'quest', slots: [], quest: { stage: QUEST.dragonStage } });
    else scene[stop] = stop === 'countdown' ? 2 : true;
    scene.updateDragon(0.1);
    if (stop === 'head' || stop === 'reset') assert.equal(scene.dragonBeam, null);
    else assert.equal(scene.dragonBeam.elapsed, 0);
  }
});

test('each beam draws a colored stream with an element-specific core and no warning line', () => {
  const scene = lair();
  scene.fighters = [fighter(0, 0)]; scene.placeDragon(1);
  for (const element of ['fire', 'ice', 'thunder']) {
    const calls = [];
    const graphics = new Proxy({}, { get: (_, key) => (...args) => { calls.push({ key, args }); return graphics; } });
    scene.gGlow = graphics;
    const head = scene.dragonHeads.find((h) => h.dragon === element);
    scene.dragonBeam = { element, head, startAngle: Math.PI, angle: Math.PI, direction: 1, elapsed: 1, tick: 0 };
    renderDragonBeam.call(scene, 2);
    assert.ok(calls.some((c) => c.key === 'lineBetween'));
    assert.ok(calls.some((c) => c.key === (element === 'ice' ? 'fillTriangle' : element === 'fire' ? 'fillCircle' : 'lineStyle')));
    calls.length = 0; scene.dragonBeam = null;
    renderDragonBeam.call(scene, 2);
    assert.equal(calls.length, 0);
  }
});
