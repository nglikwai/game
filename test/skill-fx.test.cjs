const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { Fx } = load('src/rendering/effects.ts');
const { SKILLS, skillById, isSummon } = load('src/gameplay/skills.ts');
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { Fighter } = load('src/gameplay/Fighter.ts');
const { WEAPONS } = load('src/gameplay/weapons.ts');
const { roleById } = load('src/gameplay/roles.ts');
const { SUMMON_LIGHT_RADIUS } = load('src/config/index.ts');

function graphics() {
  const calls = [];
  const check = (v) => {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `invalid geometry: ${v}`);
    else if (Array.isArray(v)) v.forEach(check);
    else if (v && typeof v === 'object') Object.values(v).forEach(check);
  };
  const g = new Proxy({}, { get: (_, name) => (...args) => {
    args.forEach(check); calls.push([name, ...args]); return g;
  } });
  return { g, calls };
}

test('every equipped skill draws finite, short-lived cast artwork without a screen overlay', () => {
  for (const skill of SKILLS) {
    const fx = new Fx(), { g, calls } = graphics();
    fx.skillCast(() => ({ x: 300, y: 300 }), skill.effect, 0.6);
    for (let frame = 0; frame < 30; frame++) {
      if (isSummon(skill.effect.kind) && frame < 20) fx.summonCircle(g, g, 300, 300, frame / 20, 0x90c5ff, frame / 20, skill.effect.kind);
      fx.draw(g, g, g); fx.update(0.05);
    }
    assert.ok(calls.length > 10, skill.id);
    assert.ok(!calls.some(([name]) => name === 'fillRect'), skill.id);
    assert.equal(fx.effects.length, 0, `${skill.id}: effects must expire`);
    assert.equal(fx.particles.length, 0, `${skill.id}: drawing rituals must not create particles`);
  }
});

test('summon symbols have four distinct silhouettes and remain inside the caster lighting circle', () => {
  const signatures = [];
  for (const kind of ['soulThunder', 'soulFire', 'soulTree', 'soulReaper']) {
    const fx = new Fx(), { g, calls } = graphics();
    fx.summonCircle(g, g, 300, 300, 1, 0x90c5ff, 1, kind);
    signatures.push(JSON.stringify(calls));
    for (const [name, ...args] of calls) {
      if (name === 'fillCircle' || name === 'strokeCircle') {
        const [x, y, r] = args;
        assert.ok(Math.hypot(x - 300, y - 300) + r <= SUMMON_LIGHT_RADIUS + 0.01);
      }
    }
    for (let n = 0; n < 100; n++) fx.summonCircle(g, g, 300, 300, 0.5, 0x90c5ff, n / 60, kind);
    assert.equal(fx.effects.length, 0);
    assert.equal(fx.particles.length, 0);
  }
  assert.equal(new Set(signatures).size, 4);
});

test('fire, roots, lightning, reaper and lifeline effects render throughout their lifetime and expire', () => {
  const fx = new Fx(), { g, calls } = graphics();
  fx.holyFlame(300, 300); fx.treeRoots(600, 300); fx.skyBolt(900, 300);
  fx.reaperCatch(() => ({ x: 400, y: 500 }), true);
  fx.lifeline(() => ({ x: 100, y: 500 }), () => ({ x: 400, y: 500 }));
  for (let frame = 0; frame < 50; frame++) { fx.draw(g, g, g); fx.update(0.05); }
  assert.ok(calls.length > 1000);
  assert.equal(fx.effects.length, 0); assert.equal(fx.particles.length, 0);
});

test('ninja departure effects do not follow a fighter and expose their hidden or teleported position', () => {
  for (const id of ['stealth', 'flicker', 'substitute']) {
    const fx = new Fx(); let pos = { x: 300, y: 300 };
    fx.skillCast(() => pos, skillById(id).effect, 0);
    pos = { x: 1200, y: 900 };
    const { g, calls } = graphics(); fx.update(0.1); fx.draw(g, g, g);
    assert.ok(calls.filter(([n]) => n.endsWith('Circle')).every(([, x, y]) => x === 300 && y === 300));
  }
});

test('only accepted skill casts trigger a flourish; failed casts and pocket items do not', () => {
  const casts = [];
  const arena = { popText() {}, spawnProjectile() {}, onSkillCast: (...args) => casts.push(args) };
  const body = { center: { x: 300, y: 300 }, velocity: { x: 0, y: 0 } };
  const f = new Fighter(0, 0xffffff, WEAPONS[0], [skillById('arrow')], roleById('ronin'), {}, body, arena);
  f.pe = 0; f.tryUseSkill(0, 0, 0); assert.equal(casts.length, 0);
  f.pe = 100; f.tryUseSkill(0, 0, 0); assert.equal(casts.length, 1);
  f.tryUseSkill(0, 0, 0); assert.equal(casts.length, 1);
  f.pocket.push({ effect: { kind: 'instantHeal', heal: 10 } });
  f.tryUseItem(0, 0, 0); assert.equal(casts.length, 1);
});

test('team casting visuals reach living allies only; dash flourishes use the actual movement direction', () => {
  const scene = new BattleScene(), casts = [];
  scene.fx = { skillCast: (getPos, e, facing) => casts.push({ ...getPos(), kind: e.kind, facing }) };
  const caster = { x: 100, y: 100, facing: 0, alive: true, team: 0, isEnemy: (f) => f.team !== 0 };
  scene.fighters = [caster, { x: 200, y: 100, facing: 0, alive: true, team: 0 }, { x: 300, y: 100, alive: false, team: 0 }, { x: 400, y: 100, alive: true, team: 1 }];
  scene.onSkillCast(caster, skillById('healing-circle').effect, 0, 0);
  assert.deepEqual(casts.map((p) => p.x), [100, 200]);
  casts.length = 0;
  scene.onSkillCast(caster, skillById('blink').effect, 0, 1);
  assert.equal(casts.length, 1); assert.equal(casts[0].facing, Math.PI / 2);
});
