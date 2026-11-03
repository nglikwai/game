const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { Fighter } = load('src/gameplay/Fighter.ts');
const { roleById } = load('src/gameplay/roles.ts');
const { WEAPONS } = load('src/gameplay/weapons.ts');
const { rumbleBytes } = load('src/input/nintendoHid.ts');

function fighter(index, team, x, y, weapon, rumbles) {
  const body = { center: { x, y }, velocity: { x: 0, y: 0 }, enable: true, setVelocity() {}, reset() {} };
  const controller = { labels: [], rumble: rumbles ? (s, ms) => rumbles.push([s, ms]) : undefined };
  const f = new Fighter(index, 0xffffff, weapon, [], roleById('ronin'), controller, body, {
    spawnProjectile() {}, inTowerAura: () => false, hazardSlow: () => 1, terrainAt: () => null, windAt: () => null, popText() {},
  });
  f.team = team;
  return f;
}

function swing(weapon, targetX) {
  const rumbles = [];
  const s = new BattleScene();
  s.init({ mode: 'ffa', slots: [{ control: 'cpu', role: 'ronin' }] });
  const attacker = fighter(0, 0, 300, 300, weapon, rumbles), target = fighter(1, 1, targetX, 300, WEAPONS[0]);
  s.fighters = [attacker, target];
  s.kegs = []; s.chests = []; s.walls = []; s.towers = [];
  s.fx = { weaponImpact() {}, hitSpark() {}, sparks() {}, frostBurst() {} };
  attacker.facing = 0;
  s.onSwingActive(attacker);
  return rumbles;
}

test('a landed weapon hit rumbles the attacker\'s controller once, harder for heavier weapons; a miss does not', () => {
  const fan = WEAPONS.find((w) => w.id === 'fan'), hammer = WEAPONS.find((w) => w.id === 'hammer');
  const light = swing(fan, 340), heavy = swing(hammer, 340);
  assert.equal(light.length, 1); assert.equal(heavy.length, 1);
  assert.ok(heavy[0][0] > light[0][0] && heavy[0][1] > light[0][1]);
  for (const [strength, ms] of [...light, ...heavy]) assert.ok(strength > 0 && strength <= 1 && ms >= 50 && ms <= 140);
  assert.equal(swing(fan, 900).length, 0);
});

test('Joy-Con rumble bytes are neutral at zero and stay in range at full strength', () => {
  assert.deepEqual([...rumbleBytes(0)], [0x00, 0x01, 0x40, 0x40]);
  const full = rumbleBytes(1);
  assert.ok(full.every((b) => b >= 0 && b <= 0xff));
  assert.ok(full[1] > 0x01 && full[3] > 0x40);
  assert.ok(rumbleBytes(0.5)[1] < full[1]);
});

test('each new 魂 level buzzes that many times, for anyone who can spend 魂', async () => {
  const { skillById } = load('src/gameplay/skills.ts');
  const { SOUL_PER_LEVEL } = load('src/config/index.ts');
  const make = (skills) => {
    const rumbles = [];
    const f = fighter(0, 0, 300, 300, WEAPONS[0], rumbles);
    f.skills = skills.map(skillById);
    return { f, rumbles };
  };
  const summon = load('src/gameplay/skills.ts').SKILLS.find((s) => ['soulThunder', 'soulFire', 'soulTree', 'soulReaper'].includes(s.effect.kind)).id;
  const { f, rumbles } = make([summon]);
  f.addSoul(SOUL_PER_LEVEL * 0.5);
  assert.equal(rumbles.length, 0, 'no buzz until a level fills');
  f.addSoul(SOUL_PER_LEVEL * 0.6);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(rumbles.length, 1);
  f.addSoul(SOUL_PER_LEVEL);
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(rumbles.length, 3);
  assert.ok(rumbles[1][0] > rumbles[0][0], 'level 2 buzzes harder');
  f.addSoul(SOUL_PER_LEVEL * 2);
  await new Promise((r) => setTimeout(r, 1000));
  assert.equal(rumbles.length, 3 + 4 + 1, 'level 4: four pulses and a long finish');
  assert.equal(rumbles.at(-1)[1], 260);
  f.addSoul(SOUL_PER_LEVEL);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(rumbles.length, 8, 'a full meter stays quiet');
  // A CPU without a 魂 skill never uses its meter, so it never buzzes (humans always can, for 暴走).
  const plain = make([]);
  plain.f.controller = { ...plain.f.controller, cpu: true };
  plain.f.addSoul(SOUL_PER_LEVEL * 4);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(plain.rumbles.length, 0);
});

test('HD rumble tones change pitch but keep the same strength, and every byte stays in range', () => {
  const { rumbleBytes: bytes } = load('src/input/nintendoHid.ts');
  const deep = [...bytes(0.8, 'deep')], normal = [...bytes(0.8, 'normal')], sharp = [...bytes(0.8, 'sharp')];
  assert.notDeepEqual(deep, normal); assert.notDeepEqual(sharp, normal);
  for (const b of [...deep, ...normal, ...sharp]) assert.ok(Number.isInteger(b) && b >= 0 && b <= 0xff);
  // Low band frequency byte: 80 Hz < 160 Hz < 320 Hz; low band amplitude byte is the same.
  assert.ok(deep[2] < normal[2] && normal[2] < sharp[2]);
  assert.equal(deep[3], normal[3]); assert.equal(sharp[3], normal[3]);
  assert.deepEqual([...bytes(0, 'deep')], [0x00, 0x01, 0x40, 0x40]);
});

test('player lights follow the Switch patterns and flash in the high nibble; the HOME ring has off, glow and pulse', () => {
  const { playerLightBits, homeLightPattern } = load('src/input/nintendoHid.ts');
  assert.deepEqual([0, 1, 2, 3].map((s) => playerLightBits(s)), [0x1, 0x3, 0x7, 0xf]);
  assert.equal(playerLightBits(1, true), 0x30);
  assert.ok([0, 1, 2, 3, 4, 5, 6, 7].every((s) => playerLightBits(s) > 0 && playerLightBits(s) <= 0xf));
  assert.ok(homeLightPattern('off').every((b) => b === 0));
  for (const mode of ['glow', 'pulse']) assert.ok(homeLightPattern(mode)[0] > 0);
  assert.notDeepEqual([...homeLightPattern('glow')], [...homeLightPattern('pulse')]);
});

test('Joy-Con lights only change when the fighter\'s state does: flash on low HP, HOME glows for 魂 and pulses when full', () => {
  const { SOUL_PER_LEVEL } = load('src/config/index.ts');
  const { SKILLS } = load('src/gameplay/skills.ts');
  const lights = [], homes = [];
  const f = fighter(2, 0, 300, 300, WEAPONS[0]);
  f.controller = { labels: [], setLights: (slot, flash) => lights.push([slot, flash]), setHomeLight: (mode) => homes.push(mode) };
  f.skills = [SKILLS.find((s) => s.effect.kind === 'soulThunder')];
  f.syncPadLights(); f.syncPadLights();
  assert.deepEqual(lights, [[2, false]]); assert.deepEqual(homes, ['off']);
  f.soul = SOUL_PER_LEVEL; f.syncPadLights();
  f.soul = SOUL_PER_LEVEL * 4; f.syncPadLights();
  assert.deepEqual(homes, ['off', 'glow', 'pulse']);
  f.hp = f.maxHp * 0.2; f.syncPadLights();
  assert.deepEqual(lights.at(-1), [2, true]);
  f.resetPadLights();
  assert.deepEqual(lights.at(-1), [2, false]); assert.equal(homes.at(-1), 'off');
});

test('being hurt thuds deep and a KO rumbles long', () => {
  const felt = [];
  const f = fighter(0, 0, 300, 300, WEAPONS[0]);
  f.controller = { labels: [], rumble: (s, ms, tone) => felt.push({ s, ms, tone }) };
  f.arena.onSubstitute = () => {};
  f.takeHit(10, 1, 0, 0, 0.1);
  assert.equal(felt.at(-1).tone, 'deep');
  f.takeHit(1000, 1, 0, 0, 0.1);
  assert.equal(f.alive, false);
  assert.equal(felt.at(-1).tone, 'deep'); assert.equal(felt.at(-1).ms, 500); assert.equal(felt.at(-1).s, 1);
});
