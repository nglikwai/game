const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { WEAPONS, shapeArea, shapeReach, shapeHits, shapeHitsRect } = load('src/weapons.ts');
const { WEAPON_AREA, DAMAGE_PER_SEC, PE_COST_PER_SEC, KNOCKBACK_PER_SEC } = load('src/config.ts');
const { randomCpuLoadout } = load('src/cpuLoadout.ts');
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { Fx } = load('src/fx.ts');
const { drawHeldWeapon, drawWeaponIcon } = load('src/art.ts');
const { T, setLang } = load('src/i18n.ts');
const yari = WEAPONS.find((w) => w.id === 'yari');

test('Yari appends a bilingual option while preserving saved weapon indices and balance', () => {
  assert.deepEqual(Array.from(WEAPONS, (w) => w.id), [
    'fan', 'shuriken', 'hammer', 'daggers', 'flail', 'kusarigama', 'bomb', 'ninjato', 'talisman', 'staff', 'kunai', 'yari',
  ]);
  assert.ok(Math.abs(shapeArea(yari.shape) - WEAPON_AREA) < 1e-6);
  assert.equal(yari.damage / yari.cycle, DAMAGE_PER_SEC);
  assert.equal(yari.peCost / yari.cycle, PE_COST_PER_SEC);
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
