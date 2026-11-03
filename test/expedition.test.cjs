const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene } = load('@/scenes/BattleScene.ts');
const { Fighter } = load('@/gameplay/Fighter.ts');
const { roleById } = load('@/gameplay/roles.ts');
const { WEAPONS } = load('@/gameplay/weapons.ts');
const { EXPEDITION: E } = load('@/config/expedition.ts');
const { toWorld, S } = load('@/battle/coordinates.ts');
const { createExpedition, expeditionCheckpoint, expeditionCamera, gateIsOpen } = load('@/battle/expedition/rules.ts');
const { createForest } = load('@/maps/expedition/forest.ts');
const { forestRouter } = load('@/battle/expedition/navigation.ts');
const runtime = load('@/battle/expedition/runtime.ts');
const { emptyIntent } = load('@/input/contracts.ts');
const { getSettings, validate, usesTeams } = load('@/state/gameSettings.ts');
const { LobbyScene } = load('@/scenes/LobbyScene.ts');
const { T } = load('@/localization/index.ts');

function encounter(saved) {
  const slots = structuredClone(getSettings().slots);
  slots.forEach((s, i) => { s.control = i === 0 ? 'kb1' : i === 1 ? 'cpu' : 'off'; });
  const scene = new BattleScene(); scene.init({ mode: 'expedition', slots, expedition: saved });
  scene.countdown = 0;
  scene.showBanner = () => {}; scene.popText = () => {};
  scene.fx = { sparks() {}, smoke() {}, holyLight() {}, hitSpark() {} };
  scene.onRevived = () => {};
  scene.physics = { add: { staticBody: () => ({ destroy() {} }), collider: () => ({ destroy() {} }) } };
  scene.expeditionView = { gate: null, thorns: [], rally: null };
  scene.fighters = scene.slots.flatMap((slot, i) => {
    if (slot.control === 'off') return [];
    const start = scene.expeditionStart(i);
    const body = { center: { ...start }, velocity: { x: 0, y: 0 }, enable: true,
      setVelocity(x, y) { this.velocity = { x, y }; }, reset(x, y) { this.center = { x: x + 18, y: y + 18 }; } };
    const controller = { labels: [], cpu: slot.control === 'cpu', read: emptyIntent };
    const f = new Fighter(i, 0xffffff, WEAPONS[0], [], { ...roleById(slot.role) }, controller, body, scene);
    f.team = slot.team; scene.stats[i] = f.stats; return [f];
  });
  scene.world = { fighters: scene.fighters, projectiles: [], objectives: [], chests: [], towers: [] };
  scene.refreshHudLoadout = () => {};
  scene.showEndBanner = (_msg, _color, then) => { scene.afterBanner = then; };
  scene.scene = { start: (...args) => { scene.nextScene = args; } };
  runtime.setupExpedition.call(scene);
  return scene;
}

const moveParty = (scene, point) => scene.fighters.filter((f) => f.team === 0).forEach((f, i) => {
  const p = toWorld(point); f.body.center = { x: p.x + i * 40, y: p.y };
});
const killEnemies = (scene) => scene.fighters.filter((f) => f.team === 1).forEach((f) => { f.state = 'dead'; f.hp = 0; });

test('Expedition supports a single hero, ignores unused enemy lobby slots, and never requires opposing teams', () => {
  const settings = structuredClone(getSettings()); settings.mode = 'expedition';
  settings.slots.forEach((slot, i) => { slot.control = i === 0 ? 'kb1' : 'off'; slot.team = 1; });
  assert.equal(validate(settings), null); assert.equal(usesTeams('expedition'), false);
  const slots = runtime.expeditionSlots(settings.slots);
  assert.ok(slots.slice(0, 4).every((s) => s.team === 0));
  assert.equal(slots.filter((s) => s.control === 'cpu').length, 4);
  assert.equal(settings.slots[0].team, 1, 'lobby choices are not mutated');
});

test('checkpoints keep completed objectives but discard active encounters and combat timers on retry', () => {
  const e = createExpedition(); e.cleared.push('village', 'river', 'rescue'); e.checkpoint = 'fortress'; e.active = 'fortress';
  const saved = expeditionCheckpoint(e), retry = createExpedition(saved);
  assert.equal(gateIsOpen(retry), true); assert.equal(retry.checkpoint, 'fortress'); assert.equal(retry.active, null);
  assert.equal(retry.cleared.length, 3); assert.equal(retry.seed, e.seed);
  retry.cleared.push('entrance'); assert.equal(saved.cleared.length, 3);
  assert.equal(createExpedition({ cleared: ['village'], checkpoint: 'fortress', seed: 1 }).checkpoint, 'entrance');
});

test('camera follows solo movement, fits a local party and never exposes outside the world', () => {
  const bounds = { x: 0, y: 0, w: 5000, h: 3200 }, view = { w: 1280, h: 628 };
  const at = expeditionCamera([{ x: 2000, y: 1800, vx: 200 }], bounds, view);
  assert.ok(at.x > 2000); assert.equal(at.zoom, 1.12);
  const party = expeditionCamera([{ x: 1000, y: 1000 }, { x: 1900, y: 1460 }], bounds, view);
  assert.ok(party.zoom < at.zoom);
  for (const point of [{ x: 0, y: 0 }, { x: 5000, y: 3200 }]) {
    const camera = expeditionCamera([point], bounds, view);
    assert.ok(camera.x - view.w / camera.zoom / 2 >= -1e-6);
    assert.ok(camera.y + view.h / camera.zoom / 2 <= bounds.h + 1e-6);
  }
});

test('the scene uses a genuinely larger world, party bonuses and dormant enemy seats', () => {
  const scene = encounter();
  assert.ok(scene.arenaRect.width > 4500); assert.ok(scene.arenaRect.height > 3000);
  assert.equal(scene.quest, null); assert.equal(scene.map.id, 'expedition-forest');
  assert.equal(scene.fighters.filter((f) => f.team === 1 && f.alive).length, 0);
  assert.equal(scene.bossReserves.size, 4); assert.ok(scene.expeditionView.gate);
  const role = roleById('ronin'), boosted = scene.roleForSlot(role, 0);
  assert.equal(boosted.speed, role.speed * 1.05); assert.notEqual(boosted, role);
});

test('both captain orders open the gate once, and cleared camps never reactivate', () => {
  for (const order of [['village', 'river'], ['river', 'village']]) {
    const scene = encounter();
    for (const id of order) {
      moveParty(scene, E.camps.find((c) => c.id === id)); scene.updateExpedition(0.1);
      assert.equal(scene.expedition.active, id); assert.ok(scene.fighters.some((f) => f.team === 1 && f.alive));
      killEnemies(scene); scene.updateExpedition(0.1); assert.ok(scene.expedition.cleared.includes(id));
    }
    assert.equal(scene.expeditionView.gate, null); assert.equal(gateIsOpen(scene.expedition), true);
    moveParty(scene, E.camps.find((c) => c.id === order[0])); scene.updateExpedition(0.1);
    assert.equal(scene.expedition.active, null);
    moveParty(scene, E.checkpoint); scene.updateExpedition(0.1); assert.equal(scene.expedition.checkpoint, 'fortress');
  }
});

test('optional rescue unlocks a single safe heal and nearby allies can revive without a spare button', () => {
  const scene = encounter({ cleared: ['village', 'river', 'rescue'], checkpoint: 'fortress', seed: 1 });
  moveParty(scene, E.healing);
  const heroes = scene.fighters.filter((f) => f.team === 0); heroes.forEach((f) => { f.hp = 10; });
  scene.updateExpedition(0.1); assert.ok(heroes.every((f) => f.hp === f.maxHp)); assert.equal(scene.expedition.healingUsed, true);
  heroes[0].hp = 10; scene.updateExpedition(0.1); assert.equal(heroes[0].hp, 10);
  heroes[1].state = 'dead'; heroes[1].hp = 0;
  for (let i = 0; i < 62; i++) scene.updateExpedition(0.05);
  assert.equal(heroes[1].alive, true); assert.equal(heroes[0].stats.revives, 1);
});

test('commander summons bounded guards at half HP, destroying the banner stops further summons, and death clears the stage', () => {
  const scene = encounter({ cleared: ['village', 'river'], checkpoint: 'fortress', seed: 2 });
  moveParty(scene, E.camps.find((c) => c.id === 'fortress')); scene.updateExpedition(0.05);
  const boss = scene.fighters.find((f) => f.index === 4); boss.hp = boss.maxHp * 0.49;
  scene.updateExpedition(0.05);
  assert.ok(scene.expeditionView.rally?.alive); assert.equal(scene.fighters.filter((f) => f.team === 1 && f.alive).length, 3);
  scene.expeditionView.rally.alive = false;
  scene.fighters.filter((f) => f.team === 1 && f !== boss).forEach((f) => { f.state = 'dead'; });
  for (let i = 0; i < 400; i++) scene.updateExpedition(0.05);
  assert.equal(scene.fighters.filter((f) => f.team === 1 && f.alive).length, 1);
  killEnemies(scene); scene.updateExpedition(0.05); assert.equal(scene.over, true); assert.equal(scene.winningTeam, 0);
});

test('party wipe exposes retry and equipment editing with a detached checkpoint payload; pauses freeze objectives', () => {
  const scene = encounter({ cleared: ['village'], checkpoint: 'entrance', seed: 7 });
  moveParty(scene, E.camps.find((c) => c.id === 'river'));
  scene.paused = true; scene.updateExpedition(10); assert.equal(scene.expedition.active, null);
  scene.paused = false; scene.fighters.filter((f) => f.team === 0).forEach((f) => { f.state = 'dead'; });
  scene.updateExpedition(0.05); assert.equal(scene.over, true); assert.equal(scene.winningTeam, 1); assert.equal(typeof scene.afterBanner, 'function');
  let modal;
  scene.openModal = (options) => { modal = options; };
  scene.afterBanner();
  const graphic = new Proxy({}, { get: () => () => graphic });
  scene.add = { graphics: () => graphic, text: () => ({ setOrigin() { return this; } }) };
  const buttons = [];
  modal.build({ y: 100, content: { add() {} }, nav: { add: (item) => buttons.push(item) } });
  buttons.find((button) => button.id === 'exp-1').onEnter();
  const [key, payload] = scene.nextScene;
  assert.equal(key, 'Lobby'); assert.equal(payload.retryExpedition.cleared[0], 'village');
  const settings = getSettings(), original = structuredClone(settings);
  try {
    const lobby = new LobbyScene(); lobby.init(payload);
    assert.equal(settings.mode, 'expedition');
    settings.slots[0].weapon = 3; settings.slots[0].skills = ['arrow', 'sprint', null, null];
    let launched;
    lobby.scene = { start: (...args) => { launched = args; } }; lobby.startBattle();
    assert.equal(launched[0], 'Loading'); assert.equal(launched[1].slots[0].weapon, 3);
    assert.equal(launched[1].expedition.cleared[0], 'village'); assert.equal(launched[1].expedition.seed, 7);
    assert.notEqual(launched[1].slots, settings.slots);
    const retry = new BattleScene(); retry.init(launched[1]);
    assert.equal(retry.expedition.cleared[0], 'village'); assert.equal(retry.countdown, 8);
  } finally { Object.assign(settings, original); }
});

test('routing can recover after knockback puts a fighter inside a tree navigation margin', () => {
  const route = forestRouter(1000, 800, [{ x: 500, y: 400, w: 60, h: 60 }]);
  const waypoint = route(545, 400, 800, 400);
  assert.ok(waypoint && waypoint.x > 552, 'escape the inflated margin instead of returning the current position');
});

test('the commander gives a half-second charge cue, colliding with cover stuns him, and thorn barriers expire', () => {
  const scene = encounter({ cleared: ['village', 'river'], checkpoint: 'fortress', seed: 2 });
  moveParty(scene, E.camps.find((c) => c.id === 'fortress')); scene.updateExpedition(0.05);
  const boss = scene.fighters.find((f) => f.index === 4), state = scene.expedition;
  scene.fighters.filter((f) => f.team === 0).forEach((f) => { f.body.center.x = boss.x + 300; });
  state.chargeT = 0; scene.updateExpedition(0.05);
  assert.ok(state.charge && state.charge.warn > 0.4); assert.equal(boss.body.velocity.x, 0);
  for (let i = 0; i < 10; i++) scene.updateExpedition(0.05);
  assert.equal(boss.body.velocity.x, E.boss.chargeSpeed);
  const Rectangle = load('phaser').Geom.Rectangle;
  scene.obstacleRects.push(new Rectangle(boss.x + boss.radius + 5, boss.y - 50, 80, 100));
  scene.updateExpedition(0.05); assert.equal(state.charge, null); assert.equal(boss.paralyzed, true);
  state.thornT = 0; scene.updateExpedition(0.05); assert.ok(scene.expeditionView.thorns.length > 0);
  state.thornT = 100;
  for (let i = 0; i < 102; i++) scene.updateExpedition(0.05);
  assert.equal(scene.expeditionView.thorns.length, 0);
});

test('expedition results list heroes with cooperative MVP/SVP and include objective damage', () => {
  const scene = encounter(); scene.winningTeam = 0;
  let modal;
  scene.openModal = (options) => { modal = options; };
  const graphic = new Proxy({}, { get: () => () => graphic }), texts = [];
  scene.add = { graphics: () => graphic, text: (_x, _y, text) => {
    texts.push(text); return { width: 100, setOrigin() { return this; }, setScale() { return this; } };
  } };
  scene.openResults(T().expeditionClear, '#a5e0be');
  modal.build({ x: 60, y: 50, w: modal.w, h: modal.h, content: { add() {} }, nav: { add() {} } });
  assert.ok(texts.includes('MVP')); assert.ok(texts.includes('SVP'));
  assert.ok(!texts.includes(T().noAward), 'recognise the second hero instead of searching the unlisted enemy team');
  assert.ok(texts.includes(T().objectiveDmg));
  assert.ok(!texts.some((text) => /^P[5-8]\s/.test(text)), 'reused enemy seats stay off the results table');
});

test('seeded trees leave the two branching objectives and the southern rescue connected', () => {
  for (let seed = 0; seed < 6; seed++) {
    const map = createForest(seed);
    assert.equal(JSON.stringify(map.obstacles), JSON.stringify(createForest(seed).obstacles));
    const route = forestRouter(E.width, E.height, [...map.obstacles, E.gate]);
    for (const target of E.camps.filter((c) => c.id !== 'fortress')) {
      const at = { ...E.start };
      for (let step = 0; step < 1000 && Math.hypot(at.x - target.x, at.y - target.y) > 12; step++) {
        const goal = route(at.x, at.y, target.x, target.y) ?? target;
        const d = Math.hypot(at.x - goal.x, at.y - goal.y); assert.ok(d > 0.1, `${seed}: blocked route to ${target.id}`);
        const amount = Math.min(20, d); at.x += (goal.x - at.x) / d * amount; at.y += (goal.y - at.y) / d * amount;
      }
      assert.ok(Math.hypot(at.x - target.x, at.y - target.y) <= 12, `${seed}: route must reach ${target.id}`);
    }
  }
});
