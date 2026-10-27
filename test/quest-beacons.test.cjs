const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene } = load('@/scenes/BattleScene.ts');
const { Fighter } = load('@/gameplay/Fighter.ts');
const { roleById } = load('@/gameplay/roles.ts');
const { WEAPONS } = load('@/gameplay/weapons.ts');
const { QUEST, QUEST_TACTICS, prepareQuest, MAP_SCALE, HUD_HEIGHT } = load('@/config/index.ts');
const { getMap, MAPS } = load('@/maps/index.ts');
const { layoutPoint } = load('@/maps/layout.ts');
const { AIController } = load('@/ai/AIController.ts');
const { T, setLang } = load('@/localization/index.ts');

function fighter(index, team) {
  const body = { center: { x: 100, y: 300 }, velocity: { x: 0, y: 0 }, enable: true,
    setVelocity() {}, reset(x, y) { this.center = { x: x + 18, y: y + 18 }; } };
  const f = new Fighter(index, 0xffffff, WEAPONS[0], [], roleById('ronin'), { labels: [] }, body, { popText() {} });
  f.team = team; return f;
}
const place = (f, p) => { f.body.center = { x: p.x, y: p.y }; };
function battle(side = 'heroes') {
  const scene = new BattleScene();
  scene.init({ mode: 'quest', slots: [{ control: 'cpu', role: 'ronin' }], quest: { stage: QUEST.beaconStage, side, layoutSeed: 123 } });
  scene.countdown = 0;
  scene.fighters = [fighter(0, 0), fighter(4, 1)];
  scene.spawns[4] = { x: 1400, y: 500 }; place(scene.fighters[1], scene.spawns[4]);
  scene.freeSpot = (p) => p;
  scene.fx = { sparks() {}, smoke() {} }; scene.popText = () => {};
  scene.showBanner = () => {};
  scene.questClear = () => { scene.cleared = true; }; scene.questFail = () => { scene.failed = true; };
  return scene;
}

test('the carrying trial is a random tactic with localized delivery goals and no capture circles', () => {
  assert.ok(QUEST_TACTICS.includes(QUEST.beaconStage));
  const prepared = prepareQuest({ stage: QUEST.beaconStage });
  assert.equal(prepared.route.length, 5);
  assert.ok(prepared.route.slice(1, 3).includes(QUEST.beaconStage));
  assert.equal(MAPS.includes(getMap('beacons')), false);
  const scene = battle();
  assert.equal(scene.seals.length, 0);
  for (const lang of ['en', 'zh']) {
    setLang(lang);
    assert.ok(T().questGoals[QUEST.beaconStage]); assert.ok(T().hellGoals[QUEST.beaconStage]);
    assert.ok(T().spiritRelayProgress(0, 6).includes('6'));
  }
  scene.spiritRelay.sources.forEach((p, i) => {
    const at = layoutPoint(scene.map, QUEST.beacons.spots[i]);
    assert.equal(p.x, at.x * MAP_SCALE); assert.equal(p.y, (at.y - HUD_HEIGHT) * MAP_SCALE);
  });
});

test('standing at the lantern does nothing until a hero collects and brings home a physical spirit', () => {
  const scene = battle(), hero = scene.fighters[0], relay = scene.spiritRelay;
  place(hero, relay.destination); scene.updateSpiritRelay(18);
  assert.equal(relay.delivered, 0);
  const spirit = relay.spirits[0];
  place(hero, spirit); scene.updateSpiritRelay(0.01);
  assert.equal(spirit.carrier, hero); assert.equal(hero.soul, 0);
  scene.updateSpiritRelay(18); assert.equal(relay.delivered, 0);
  place(hero, relay.destination); scene.updateSpiritRelay(0.01);
  assert.equal(relay.delivered, 1);
  assert.equal(relay.spirits.includes(spirit), false);
});

test('one spirit per living hero; guards and summoning or trapped heroes cannot collect', () => {
  const scene = battle(), hero = scene.fighters[0], guard = scene.fighters[1], relay = scene.spiritRelay;
  relay.spirits.forEach((s) => { s.x = hero.x; s.y = hero.y; });
  place(guard, hero); scene.updateSpiritRelay(0.01);
  assert.equal(relay.spirits.filter((s) => s.carrier === hero).length, 1);
  assert.equal(relay.spirits.some((s) => s.carrier === guard), false);
  const ally = fighter(1, 0); scene.fighters.push(ally); place(ally, hero);
  ally.state = 'casting'; scene.updateSpiritRelay(0.01);
  assert.equal(relay.spirits.some((s) => s.carrier === ally), false);
  ally.state = 'idle'; ally.trapped = true; scene.updateSpiritRelay(0.01);
  assert.equal(relay.spirits.some((s) => s.carrier === ally), false);
  ally.trapped = false; scene.updateSpiritRelay(0.01);
  assert.equal(relay.spirits.filter((s) => s.carrier === ally).length, 1);
});

test('defeat or trapping drops the carried spirit for a teammate instead of deleting it', () => {
  for (const lost of ['dead', 'trapped']) {
    const scene = battle(), hero = scene.fighters[0], relay = scene.spiritRelay;
    const spirit = relay.spirits[0]; place(hero, spirit); scene.updateSpiritRelay(0.01);
    place(hero, { x: 700, y: 600 });
    if (lost === 'dead') { hero.hp = 0; hero.state = 'dead'; } else hero.trapped = true;
    scene.updateSpiritRelay(0.01);
    assert.equal(spirit.carrier, null); assert.equal(spirit.x, 700); assert.equal(spirit.y, 600);
    const ally = fighter(1, 0); place(ally, spirit); scene.fighters.push(ally);
    scene.updateSpiritRelay(0.01); assert.equal(spirit.carrier, ally);
    place(ally, relay.destination); scene.updateSpiritRelay(0.01);
    assert.equal(relay.delivered, 1);
  }
});

test('spirits replenish at free springs without exceeding the six required deliveries', () => {
  const scene = battle(), relay = scene.spiritRelay;
  relay.spirits.splice(0, 1); relay.delivered = 1;
  scene.updateSpiritRelay(QUEST.beacons.spawnEvery - 0.01);
  assert.equal(relay.spirits.length, 2);
  scene.updateSpiritRelay(0.02); assert.equal(relay.spirits.length, 3);
  relay.delivered = 5; relay.spirits.splice(1);
  scene.updateSpiritRelay(100);
  assert.equal(relay.spirits.length, 1);
  assert.equal(relay.delivered + relay.spirits.length, 6);
});

test('guards return during collection; delivery six clears immediately while guards are still alive', () => {
  const scene = battle(), guard = scene.fighters[1], relay = scene.spiritRelay;
  guard.hp = 0; guard.state = 'dead';
  scene.updateQuest(9.99); assert.equal(guard.alive, false); assert.equal(scene.cleared, undefined);
  scene.updateQuest(0.02); assert.equal(guard.alive, true);
  const hero = scene.fighters[0]; relay.delivered = 5; relay.spirits.splice(1);
  relay.spirits[0].carrier = hero; place(hero, relay.destination);
  scene.updateQuest(0.01);
  assert.equal(relay.delivered, 6); assert.equal(scene.cleared, true); assert.equal(guard.alive, true);
});

test('Hell wins by defeating the heroes and loses when the final spirit reaches the lantern', () => {
  const win = battle('hell'); win.fighters[0].state = 'dead'; win.updateQuest(0.01); assert.equal(win.cleared, true);
  const lose = battle('hell'), relay = lose.spiritRelay, hero = lose.fighters[0];
  relay.delivered = 5; relay.spirits.splice(1); relay.spirits[0].carrier = hero; place(hero, relay.destination);
  lose.updateQuest(0.01); assert.equal(lose.failed, true);
});

test('CPU heroes seek a free spirit then return to the lantern; guards target a courier', () => {
  for (const difficulty of ['standard', 'hard']) {
    const scene = battle(), self = scene.fighters[0], relay = scene.spiritRelay;
    place(self, { x: 600, y: 500 }); relay.spirits = [{ x: 1000, y: 500, carrier: null }];
    relay.destination = { x: 100, y: 500, radius: 70 };
    const world = { fighters: [self], projectiles: [], objectives: [], chests: [], spiritRelay: relay };
    const ai = new AIController(difficulty);
    assert.ok(ai.decide(self, world).mx > 0.99);
    relay.spirits[0].carrier = self; assert.ok(ai.decide(self, world).mx < -0.99);
    const guard = scene.fighters[1], decoy = fighter(2, 0);
    place(guard, { x: 600, y: 500 }); place(decoy, { x: 650, y: 500 }); place(self, { x: 200, y: 500 });
    world.fighters = [self, guard, decoy];
    assert.ok(new AIController(difficulty).decide(guard, world).ax < -0.9);
  }
});

test('collection and respawn freeze during pause, countdown and results; retry resets delivery and carried spirits', () => {
  for (const stop of ['countdown', 'paused', 'over']) {
    const scene = battle(), relay = scene.spiritRelay;
    place(scene.fighters[0], relay.spirits[0]); scene.fighters[1].state = 'dead';
    scene[stop] = stop === 'countdown' ? 5 : true; scene.updateSpiritRelay(30);
    assert.equal(relay.delivered, 0); assert.equal(relay.spirits[0].carrier, null);
    assert.equal(scene.fighters[1].alive, false); assert.equal(relay.guardT, 10);
  }
  const scene = battle(), before = scene.spiritRelay.destination;
  scene.spiritRelay.delivered = 3;
  scene.init({ mode: 'quest', slots: [], quest: { stage: QUEST.beaconStage, layoutSeed: 123 } });
  assert.equal(scene.spiritRelay.delivered, 0);
  assert.equal(scene.spiritRelay.spirits.length, 3);
  assert.ok(scene.spiritRelay.spirits.every((s) => s.carrier === null));
  assert.deepEqual(scene.spiritRelay.destination, before);
});

test('the relay renders spirits, carried souls and its destination without drawing altar progress arcs', () => {
  const scene = battle(), calls = [];
  const graphics = new Proxy({}, { get: (_, method) => (...args) => {
    calls.push({ method, args }); for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value));
    return graphics;
  } });
  scene.g = scene.gGlow = scene.gOver = graphics;
  scene.spiritRelay.spirits[0].carrier = scene.fighters[0];
  scene.renderSpiritRelay(1);
  assert.ok(calls.some((c) => c.method === 'fillTriangle'));
  assert.equal(calls.some((c) => c.method === 'strokeCircle'), false);
});
