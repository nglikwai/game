const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { Fighter } = load('src/gameplay/Fighter.ts');
const { WEAPONS } = load('src/gameplay/weapons.ts');
const { roleById } = load('src/gameplay/roles.ts');
const { SKILLS, skillById } = load('src/gameplay/skills.ts');
const { AIController } = load('@/ai/AIController.ts');
const { emptyIntent } = load('src/input/index.ts');

function fighter(index, team, x, y, skills = []) {
  const body = { center: { x, y }, velocity: { x: 0, y: 0 }, enable: true,
    setVelocity(vx, vy) { this.velocity = { x: vx, y: vy }; }, reset(x, y) { this.center = { x: x + 18, y: y + 18 }; } };
  const f = new Fighter(index, 0xffffff, WEAPONS[0], skills.map(skillById), roleById('ronin'), { labels: [] }, body, {
    spawnProjectile() {}, inTowerAura: () => false, hazardSlow: () => 1, terrainAt: () => null, windAt: () => null, popText() {},
  });
  f.team = team;
  return f;
}

function scene(fighters) {
  const s = new BattleScene();
  s.init({ mode: 'ffa', slots: [{ control: 'cpu', role: 'ronin' }] });
  s.fighters = fighters;
  s.arenaRect = { x: 0, y: 0, width: 2000, height: 1000, right: 2000, bottom: 1000 };
  s.fx = { sparks() {}, hitSpark() {}, hookPull() { s.pulled = true; } };
  return s;
}

test('both skills sit in rows with room to spare, in both languages', () => {
  const hook = skillById('hook');
  const thirst = skillById('bloodthirst');
  assert.equal(hook.category, 'ranged');
  assert.equal(hook.effect.pull, true);
  assert.equal(thirst.category, 'buff');
  assert.equal(thirst.effect.kind, 'lifesteal');
  for (const s of [hook, thirst]) assert.ok(s.zh && s.descZh && s.desc);
  // The loadout grid is as wide as the biggest category; neither new skill widens it.
  const sizes = {};
  for (const s of SKILLS) sizes[s.category] = (sizes[s.category] ?? 0) + 1;
  assert.ok(sizes.ranged <= 4 && sizes.buff <= 4);
});

test('the hook drags whoever it catches toward the thrower instead of knocking them away', () => {
  const Rectangle = load('phaser').Geom.Rectangle;
  const previous = Rectangle.Contains;
  Rectangle.Contains = (r, x, y) => x >= r.x && y >= r.y && x <= r.x + r.width && y <= r.y + r.height;
  try {
    const thrower = fighter(0, 0, 200, 400), victim = fighter(1, 1, 600, 400);
    const s = scene([thrower, victim]);
    const hits = [];
    s.dealDamage = (...args) => hits.push(args);
    const e = skillById('hook').effect;
    s.projectiles = [{ owner: thrower, team: 0, x: 590, y: 400, vx: e.speed, vy: 0, radius: e.radius, traveled: 0, dead: false, effect: e }];
    s.updateProjectiles(0.001);
    assert.equal(hits.length, 1);
    const [from, to, dmg, dx, , knockback, hitstun] = hits[0];
    assert.equal(from, thrower);
    assert.equal(to, victim);
    assert.ok(Math.abs(dmg - e.damage * thrower.role.attack) < 1e-9);
    assert.ok(dx < -0.99, 'pulled back toward the thrower');
    // About enough slide (knockback / 7) to end just in front of the thrower.
    const gap = 400 - (thrower.radius + victim.radius + 14);
    assert.ok(Math.abs(knockback / 7 - gap) < 1e-6);
    assert.equal(hitstun, e.hitstun);
    assert.equal(s.pulled, true);
  } finally { Rectangle.Contains = previous; }
});

test('Bloodthirst heals a share of the damage dealt, only while it lasts', () => {
  const user = fighter(0, 0, 100, 100, ['bloodthirst']), foe = fighter(1, 1, 140, 100);
  const s = scene([user, foe]);
  user.hp = 50;
  user.pe = user.maxPe;
  user.tryUseSkill(0, 0, 0);
  assert.equal(user.lifestealing, true);
  s.dealDamage(user, foe, 20, 1, 0, 0, 0);
  assert.ok(Math.abs(user.hp - (50 + 20 * skillById('bloodthirst').effect.share)) < 1e-6);
  user.update(skillById('bloodthirst').effect.duration + 0.1, emptyIntent());
  assert.equal(user.lifestealing, false);
  const before = user.hp;
  s.dealDamage(user, foe, 20, 1, 0, 0, 0);
  assert.equal(user.hp, before);
});

test('a CPU hooks a target that is out of weapon reach but within the chain', () => {
  const cpu = fighter(0, 0, 200, 400, ['hook']), target = fighter(1, 1, 560, 400);
  cpu.pe = cpu.maxPe;
  const world = { fighters: [cpu, target], projectiles: [], objectives: [], chests: [] };
  const ai = new AIController('hard');
  let hooked = false;
  for (let k = 0; k < 40 && !hooked; k++) hooked = ai.decide(cpu, world).skills[0] === true;
  assert.equal(hooked, true);
});

test('Shadow Step lands just behind the nearest enemy in range, facing them, and is refused with nobody in range', () => {
  const user = fighter(0, 0, 100, 400, ['shadow-step']), foe = fighter(1, 1, 400, 400);
  foe.facing = Math.PI; // looking back toward the user
  const s = scene([user, foe]);
  s.obstacleRects = []; s.chests = [];
  s.fx = { smoke() {}, shadowStep() {}, skillCast() {} };
  user.arena = s;
  user.pe = user.maxPe;
  user.tryUseSkill(0, 0, 0);
  const x = user.body.center.x, y = user.body.center.y;
  assert.ok(x > 400, 'behind the foe, who faces left');
  assert.ok(Math.abs(y - 400) < 1e-6);
  assert.ok(Math.abs(Math.cos(user.facing) + 1) < 1e-6, 'facing the foe');
  // Too far: refused, no PE spent.
  const far = fighter(2, 0, 100, 400, ['shadow-step']), distant = fighter(3, 1, 900, 400);
  const s2 = scene([far, distant]);
  s2.obstacleRects = []; s2.chests = [];
  far.arena = s2;
  far.pe = far.maxPe;
  far.tryUseSkill(0, 0, 0);
  assert.equal(far.pe, far.maxPe);
  assert.equal(far.body.center.x, 100);
});

test('Counter blocks the next hit and strikes back at a close attacker, once', () => {
  const user = fighter(0, 0, 100, 100, ['counter']), foe = fighter(1, 1, 150, 100);
  const s = scene([user, foe]);
  s.fx = { sparks() {}, hitSpark() {}, counterFlash() {}, skillCast() {} };
  s.popText = () => {};
  user.pe = user.maxPe;
  user.tryUseSkill(0, 0, 0);
  assert.equal(user.countering, true);
  const hp = user.hp, foeHp = foe.hp;
  s.dealDamage(foe, user, 30, -1, 0, 300, 0.2);
  assert.equal(user.hp, hp);
  assert.ok(foe.hp < foeHp);
  assert.equal(user.countering, false);
  // The stance is spent: the next hit lands.
  s.dealDamage(foe, user, 10, -1, 0, 0, 0);
  assert.ok(user.hp < hp);
});

test('a boss loses at most 200 HP to the Reaper; others are still left at 20 or killed', () => {
  const { SOUL_REAPER } = load('src/config/index.ts');
  const boss = fighter(0, 1, 100, 100);
  boss.arena = { popText() {}, onSubstitute() {} };
  boss.boss = true; boss.maxHp = 1000; boss.hp = 900;
  assert.equal(boss.sufferReaper(), true);
  assert.equal(boss.hp, 900 - SOUL_REAPER.bossMax);
  boss.hp = 150;
  boss.sufferReaper();
  assert.equal(boss.hp, SOUL_REAPER.leaveHp);
  const normal = fighter(1, 0, 100, 100);
  normal.arena = boss.arena;
  normal.hp = 100;
  normal.sufferReaper();
  assert.equal(normal.hp, SOUL_REAPER.leaveHp);
});

test('Sweet Dew heals its full amount over its duration, without stopping you', () => {
  const user = fighter(0, 0, 100, 100, ['sweet-dew']);
  user.arena = { ...user.arena, onSkillCast() {} };
  const e = skillById('sweet-dew').effect;
  user.hp = 40;
  user.pe = user.maxPe;
  user.tryUseSkill(0, 0, 0);
  assert.equal(user.regenerating, true);
  assert.equal(user.state, 'idle');
  for (let k = 0; k < 100; k++) user.update(e.duration / 80, emptyIntent());
  assert.ok(Math.abs(user.hp - (40 + e.heal * user.role.healReceived)) < 1e-6);
  assert.equal(user.regenerating, false);
});

test('the chakram cuts through enemies on the way out, turns at its range and cuts them again coming home', () => {
  const Rectangle = load('phaser').Geom.Rectangle;
  const previous = Rectangle.Contains;
  Rectangle.Contains = (r, x, y) => x >= r.x && y >= r.y && x <= r.x + r.width && y <= r.y + r.height;
  try {
    const thrower = fighter(0, 0, 100, 400), a = fighter(1, 1, 200, 400), b = fighter(2, 1, 300, 400);
    const s = scene([thrower, a, b]);
    s.shotBlockers = []; s.chests = []; s.towers = []; s.kegs = []; s.bouncers = [];
    const hits = [];
    s.dealDamage = (from, to) => hits.push(to);
    const e = skillById('chakram').effect;
    const shot = { owner: thrower, team: 0, x: 130, y: 400, vx: e.speed, vy: 0, radius: e.radius, traveled: 0, dead: false, effect: e };
    s.projectiles = [shot];
    for (let k = 0; k < 400 && s.projectiles.length; k++) s.updateProjectiles(1 / 120);
    assert.equal(s.projectiles.length, 0, 'caught again by the thrower');
    assert.deepEqual(hits, [a, b, b, a]);
  } finally { Rectangle.Contains = previous; }
});

test('Shadow Swap trades places with the nearest enemy in range', () => {
  const user = fighter(0, 0, 100, 400, ['swap']), foe = fighter(1, 1, 400, 420);
  const s = scene([user, foe]);
  s.fx = { swapFlash() {}, skillCast() {} };
  user.arena = s;
  user.pe = user.maxPe;
  user.tryUseSkill(0, 0, 0);
  assert.deepEqual([user.body.center.x, user.body.center.y], [400, 420]);
  assert.deepEqual([foe.body.center.x, foe.body.center.y], [100, 400]);
});
