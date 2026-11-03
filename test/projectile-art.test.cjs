const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { drawProjectile, projectileStyle } = load('src/rendering/projectileArt.ts');
const { drawShotEmblem } = load('src/rendering/skillEmblems.ts');
const { Fx } = load('src/rendering/effects.ts');
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { SKILLS } = load('src/gameplay/skills.ts');
const { drawHeldWeapon, drawWeaponIcon } = load('src/rendering/fighterArt.ts');
const { WEAPONS } = load('src/gameplay/weapons.ts');

function graphics() {
  const calls = [];
  const check = v => {
    if (typeof v === 'number') assert.ok(Number.isFinite(v));
    else if (Array.isArray(v)) v.forEach(check);
    else if (v && typeof v === 'object') Object.values(v).forEach(check);
  };
  const g = new Proxy({}, { get: (_, key) => (...args) => {
    args.forEach(check); calls.push([key, ...args]);
    if (key === 'lineStyle') assert.ok(args[0] >= 0);
    return g;
  } });
  return { g, calls };
}
function shot(style) {
  return { x: 300, y: 300, vx: 450, vy: -120, radius: 13, team: 1, traveled: 80, dead: false,
    element: ['fire', 'ice', 'thunder'].includes(style) ? style : undefined,
    effect: { kind: 'projectile', radius: style === 'steel' ? 5 : 13, color: 0xcee4ff, boomerang: style === 'chakram', pull: style === 'hook' } };
}

test('all six projectile families draw distinct finite silhouettes without mutating gameplay or spawning effects', () => {
  const signatures = [];
  for (const style of ['fire', 'ice', 'thunder', 'chakram', 'hook', 'steel']) {
    const p = shot(style), before = JSON.stringify(p), fx = new Fx(), { g, calls } = graphics();
    assert.equal(projectileStyle(p), style);
    for (const now of [0, .07, .3, 12]) drawProjectile(g, g, p, now, fx);
    signatures.push(JSON.stringify(calls));
    assert.equal(JSON.stringify(p), before);
    assert.equal(fx.particles.length, 0); assert.equal(fx.effects.length, 0);
    assert.ok(calls.length > 15);
  }
  assert.equal(new Set(signatures).size, 6);
});

test('moving projectiles do not leave particle trails, alive or dead', () => {
  for (const style of ['fire', 'ice', 'thunder', 'chakram', 'hook', 'steel']) {
    const scene = new BattleScene(); scene.fighters = []; scene.projectiles = [shot(style)];
    scene.updateFx(1 / 60);
    assert.equal(scene.fx.particles.length, 0, style);
    scene.fx = new Fx(); scene.projectiles[0].dead = true; scene.updateFx(1 / 60);
    assert.equal(scene.fx.particles.length, 0);
  }
});

test('all projectile skills have unique departure emblems which leave the projectile definition intact', () => {
  const signatures = [];
  for (const skill of SKILLS.filter(s => s.effect.kind === 'projectile')) {
    const e = skill.effect, before = JSON.stringify(e), { g, calls } = graphics();
    for (const t of [0, .2, .6, 1]) drawShotEmblem(g, e, 300, 300, -.5, t, .5);
    signatures.push(JSON.stringify(calls)); assert.equal(JSON.stringify(e), before);
  }
  assert.equal(new Set(signatures).size, signatures.length);
});

test('detailed held weapons render safely in every attack phase and orientation', () => {
  for (const weapon of WEAPONS) for (const phase of ['idle', 'windup', 'strike']) for (const t of [0, .5, 1]) {
    const { g, calls } = graphics();
    drawHeldWeapon(g, weapon.id, { x: 300, y: 300, facing: t * Math.PI * 2, phase, t, time: .7, color: 0x9bc0de, reach: 80 });
    assert.ok(calls.length > 0, weapon.id);
  }
});

test('shuriken battle artwork is three times larger while the loadout icon stays within its original size', () => {
  const radius = (calls, x, y) => Math.max(...calls.find(c => c[0] === 'fillPoints')[1].map(p => Math.hypot(p.x - x, p.y - y)));
  const held = graphics();
  drawHeldWeapon(held.g, 'shuriken', { x: 0, y: 0, facing: 0, phase: 'idle', t: 0, time: 0, color: 0xffffff, reach: 80 });
  assert.ok(Math.abs(radius(held.calls, 12, 11) - 24) < 1e-9);
  const fx = new Fx(), thrown = graphics();
  fx.shurikenThrow(0, 0, 0, 18, 240, 0xffffff); fx.update(.06); fx.draw(thrown.g, thrown.g, thrown.g);
  assert.ok(Math.abs(radius(thrown.calls, 18 + 222 * .06 / .16, 0) - 30) < 1e-9);
  const icon = graphics(); drawWeaponIcon(icon.g, 'shuriken', 0, 0, 40, 0xffffff);
  assert.ok(Math.abs(radius(icon.calls, 0, 0) - 20) < 1e-9);
});

test('projectile bodies stay near their current position without painted travel paths or afterimages', () => {
  for (const style of ['fire', 'ice', 'thunder', 'chakram', 'hook', 'steel']) {
    const p = shot(style), { g, calls } = graphics();
    drawProjectile(g, g, p, .7, new Fx());
    const points = calls.flatMap(([method, ...args]) => {
      if (['fillPoints', 'strokePoints'].includes(method)) return args[0];
      if (method === 'lineBetween') return [{ x: args[0], y: args[1] }, { x: args[2], y: args[3] }];
      if (['fillCircle', 'fillEllipse', 'strokeCircle', 'arc'].includes(method)) return [{ x: args[0], y: args[1] }];
      if (method === 'fillTriangle') return [0, 2, 4].map(i => ({ x: args[i], y: args[i + 1] }));
      return [];
    });
    assert.ok(points.length > 0);
    for (const point of points) assert.ok(Math.hypot(point.x - p.x, point.y - p.y) <= 26, `${style} must draw at the projectile, not behind it`);
  }
});
