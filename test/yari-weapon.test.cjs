const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { FIRE_KUNAI, THUNDER_FAN, WEAPONS, rollOniWeapon, shapeArea, shapeReach, shapeHits, shapeHitsRect } = load('src/gameplay/weapons.ts');
const { WEAPON_AREA, DAMAGE_PER_SEC, KNOCKBACK_PER_SEC } = load('src/config/index.ts');
const { randomCpuLoadout } = load('src/ai/loadouts.ts');
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { Fx } = load('src/rendering/effects.ts');
const { drawHeldWeapon, drawWeaponIcon } = load('src/rendering/fighterArt.ts');
const { T, setLang } = load('src/localization/index.ts');
const yari = WEAPONS.find((w) => w.id === 'yari');

test('Yari appends a bilingual option while preserving saved weapon indices and balance', () => {
  assert.deepEqual(Array.from(WEAPONS, (w) => w.id), [
    'fan', 'shuriken', 'hammer', 'daggers', 'flail', 'kusarigama', 'bomb', 'ninjato', 'talisman', 'staff', 'kunai', 'yari', 'nunchaku', 'whip', 'windmill', 'spade',
  ]);
  assert.ok(Math.abs(shapeArea(yari.shape) - WEAPON_AREA) < 1e-6);
  assert.ok(Math.abs(yari.damage / yari.cycle - DAMAGE_PER_SEC * yari.power) < 1e-9);
  assert.ok(yari.power < 1, 'a long, safe reach hits softer');
  assert.equal(yari.peCost, undefined);
  assert.equal(yari.knockback / yari.cycle, KNOCKBACK_PER_SEC);
  assert.ok(yari.windup + yari.active < yari.cycle);
  assert.ok(shapeReach(yari.shape) > shapeReach(WEAPONS[1].shape));
  assert.equal(yari.lunge, undefined);
  setLang('zh'); assert.equal(T().weaponName(yari), '長槍');
  setLang('en'); assert.equal(T().weaponName(yari), 'Yari Spear');
});

test('the thrust hits at long reach in the facing direction, misses sideways and behind, and reaches objectives', () => {
  const reach = shapeReach(yari.shape);
  for (const facing of [0, Math.PI / 2, Math.PI, -Math.PI / 3]) {
    const point = (forward, side = 0) => [100 + Math.cos(facing) * forward - Math.sin(facing) * side,
      200 + Math.sin(facing) * forward + Math.cos(facing) * side];
    const hit = (forward, side = 0) => shapeHits(yari.shape, 100, 200, facing, ...point(forward, side), 18);
    assert.equal(hit(reach - 5), true);
    assert.equal(hit(reach + 25), false);
    assert.equal(hit(reach / 2, 40), false);
    assert.equal(hit(-40), false);
    assert.equal(shapeHitsRect(yari.shape, 100, 200, facing, ...point(reach - 20), 40, 40), true);
  }
});

test('samurai CPU rolls can equip Yari with a valid skill set', () => {
  const original = Math.random;
  try {
    Math.random = () => 0.999999;
    const gear = randomCpuLoadout('team', [], ['ronin', 'shinobi', 'mystic']);
    assert.equal(gear.role, 'samurai');
    assert.equal(WEAPONS[gear.weapon].id, 'yari');
    assert.equal(gear.skills.length, 3);
  } finally { Math.random = original; }
});

test('the battle dispatches a thrust effect using the actual weapon hit lane', () => {
  const scene = new BattleScene();
  let args;
  scene.fx = { spearThrust: (...values) => { args = values; } };
  scene.weaponFx({ weapon: yari, x: 100, y: 200, facing: 0.5, color: 0xd9ae4a });
  assert.deepEqual(args, [100, 200, 0.5, yari.shape.offset, yari.shape.length, yari.shape.width, 0xd9ae4a]);
});

test('spear icons, held poses and the complete thrust effect draw finite geometry and expire', () => {
  let draws = 0;
  const check = (arg) => {
    if (typeof arg === 'number') assert.ok(Number.isFinite(arg));
    else if (Array.isArray(arg)) arg.forEach(check);
    else if (arg && typeof arg === 'object') Object.values(arg).forEach(check);
  };
  const g = new Proxy({}, { get: (_, method) => (...args) => {
    args.forEach(check);
    if (['fillPoints', 'lineBetween', 'fillCircle'].includes(method)) draws++;
    return g;
  } });
  for (const size of [14, 28, 40]) drawWeaponIcon(g, 'yari', 20, 20, size, 0xd9ae4a);
  for (const facing of [0, 1.4, Math.PI]) for (const phase of ['idle', 'windup', 'strike']) for (const t of [0, 0.25, 0.5, 1]) {
    drawHeldWeapon(g, 'yari', { x: 100, y: 200, facing, phase, t, color: 0xd9ae4a, time: 1 });
  }
  const fx = new Fx();
  fx.spearThrust(100, 200, 0.5, yari.shape.offset, yari.shape.length, yari.shape.width, 0xd9ae4a);
  for (let frame = 0; frame < 15; frame++) { fx.draw(g, g, g); fx.update(1 / 60); }
  const after = draws;
  fx.draw(g, g, g);
  assert.equal(draws, after);
  assert.ok(draws > 100);
});

test('the Oni King draws either an enlarged thunder fan or enlarged fire kunai', () => {
  const fan = WEAPONS.find((w) => w.id === 'fan');
  const kunai = WEAPONS.find((w) => w.id === 'kunai');
  assert.equal(WEAPONS.some((w) => w.id === 'thunder-fan' || w.id === 'fire-kunai'), false);
  assert.equal(THUNDER_FAN.shape.kind, 'sector');
  assert.equal(THUNDER_FAN.shape.angle, fan.shape.angle);
  assert.ok(shapeArea(THUNDER_FAN.shape) > shapeArea(fan.shape) * 2);
  assert.ok(THUNDER_FAN.cycle < fan.cycle);
  assert.ok(THUNDER_FAN.damage > fan.damage * 1.5);
  assert.equal(FIRE_KUNAI.shape.kind, 'rays');
  assert.equal(FIRE_KUNAI.shape.count, kunai.shape.count);
  assert.ok(shapeArea(FIRE_KUNAI.shape) > shapeArea(kunai.shape) * 2);
  assert.ok(shapeReach(FIRE_KUNAI.shape) > shapeReach(kunai.shape));
  assert.ok(FIRE_KUNAI.cycle < kunai.cycle);
  assert.ok(FIRE_KUNAI.damage > kunai.damage);
  setLang('zh');
  assert.equal(T().weaponName(THUNDER_FAN), '雷扇');
  assert.equal(T().weaponName(FIRE_KUNAI), '火苦無');
  setLang('en');
  assert.equal(T().weaponName(THUNDER_FAN), 'Thunder Fan');
  assert.equal(T().weaponName(FIRE_KUNAI), 'Fire Kunai');
  const seen = new Set();
  for (let i = 0; i < 8; i++) seen.add(rollOniWeapon(() => i / 8).id);
  assert.deepEqual([...seen].sort(), ['fire-kunai', 'thunder-fan']);
  const g = new Proxy({}, { get: () => () => g });
  drawWeaponIcon(g, 'thunder-fan', 20, 20, 28, 0x7eb6ff);
  drawHeldWeapon(g, 'thunder-fan', { x: 100, y: 200, facing: 0.4, phase: 'strike', t: 0.2, color: 0x7eb6ff, time: 1 });
  drawWeaponIcon(g, 'fire-kunai', 20, 20, 28, 0xff7a32);
  drawHeldWeapon(g, 'fire-kunai', { x: 100, y: 200, facing: 0.4, phase: 'strike', t: 0.2, color: 0xff7a32, time: 1 });
  const fx = new Fx();
  fx.thunderFan(100, 200, 0.4, THUNDER_FAN.shape.radius, THUNDER_FAN.shape.angle);
  fx.fireKunai(100, 200, [0.2, 0.4, 0.6], FIRE_KUNAI.shape.offset, FIRE_KUNAI.shape.offset + FIRE_KUNAI.shape.length);
  fx.weaponImpact('fire-kunai', 140, 200, 0.4, 0xff7a32);
  fx.draw(g, g, g);
  fx.update(1 / 60);
});
