const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { bossRole } = load('@/battle/quest/roster.ts');
const { Fighter } = load('src/gameplay/Fighter.ts');
const { AIController } = load('@/ai/AIController.ts');
const { emptyIntent } = load('@/input/index.ts');
const { summonStrikeCount } = load('src/gameplay/skills.ts');
const { WEAPONS } = load('src/gameplay/weapons.ts');
const { ROLES, roleById } = load('src/gameplay/roles.ts');
const { skillById, skillCooldownFor } = load('src/gameplay/skills.ts');
const { QUEST, SOUL_PER_LEVEL, SOUL_LEVELS, SOUL_FROM_HURT, SOUL_FIRE, SOUL_THUNDER, SOUL_REAPER, SOUL_TREE } = load('src/config/index.ts');
const { TREE_SUMMONS } = load('src/battle/quest/treeRules.ts');

function battle(stage = QUEST.bossStage) {
  const scene = new BattleScene();
  scene.init({ mode: 'quest', slots: [], quest: { stage } });
  scene.countdown = 0;
  scene.popText = () => {}; scene.showBanner = () => {};
  scene.fx = { respawnBeam() {}, hitSpark() {}, smoke() {}, hammerSmash() {}, summonPulse() {}, skillCast() {} };
  scene.freeSpot = (spot) => spot;
  const make = (index, team, role = roleById('ronin')) => {
    const body = { center: { x: 900, y: 500 }, velocity: { x: 0, y: 0 }, enable: true,
      reset(x, y) { this.center = { x: x + 18, y: y + 18 }; },
      setVelocity(x, y) { this.velocity = { x, y }; } };
    const f = new Fighter(index, 0xffffff, WEAPONS[0], [], role, { labels: [] }, body, scene);
    f.team = team; return f;
  };
  const party = make(0, 0);
  const boss = make(4, 1, bossRole(1)); boss.boss = true;
  const guards = [5, 6, 7].map((i) => make(i, 1));
  scene.fighters = [party, boss, ...guards];
  scene.inTowerAura = () => false; scene.terrainAt = () => null; scene.hazardSlow = () => 1; scene.windAt = () => null;
  return { scene, party, boss, guards, make };
}

test('boss fills reserve slots by paying HP, keeps the initial solo enemy count and caps the roster at four', () => {
  const { scene, boss, guards } = battle();
  for (const f of [boss, ...guards]) scene.prepareBossReserve(f, 1);
  assert.equal(scene.fighters.filter((f) => f.team === 1 && f.alive).length, 2);
  assert.equal(scene.bossReserves.size, 2);
  assert.equal(guards[1].stats.deaths, 0);
  const hp = boss.hp;
  scene.updateBossReinforcements(9.99);
  assert.equal(boss.hp, hp);
  scene.updateBossReinforcements(0.01);
  assert.equal(boss.hp, hp - 36);
  assert.equal(scene.fighters.filter((f) => f.team === 1 && f.alive).length, 3);
  scene.updateBossReinforcements(10);
  assert.equal(boss.hp, hp - 72);
  assert.equal(scene.fighters.filter((f) => f.team === 1 && f.alive).length, 4);
  scene.updateBossReinforcements(100);
  assert.equal(boss.hp, hp - 72);
  assert.equal(scene.bossReserves.size, 0);
});

test('fallen guards respawn before unused reserves, clear their pockets and keep half their soul', () => {
  const { scene, boss, guards } = battle();
  for (const f of [boss, ...guards]) scene.prepareBossReserve(f, 1);
  const guard = guards[0]; guard.state = 'dead'; guard.hp = 0;
  guard.pocket.push({ id: 'rice-ball' }); guard.soul = 50;
  scene.deathTime.set(guard, 1); scene.respawnTimers.set(guard, Infinity);
  scene.updateBossReinforcements(10);
  assert.equal(guard.alive, true);
  assert.equal(guard.hp, guard.maxHp * 0.75);
  assert.equal(guard.pocket.length, 0);
  assert.equal(guard.soul, 25);
  assert.equal(scene.bossReserves.size, 2);
  assert.equal(scene.deathTime.has(guard), false);
  assert.equal(scene.respawnTimers.has(guard), false);
});

test('boss reinforcements stop during previews, pauses, victory, boss death and insufficient HP', () => {
  for (const stop of ['countdown', 'paused', 'over', 'dead', 'lowHp', 'otherStage']) {
    const { scene, boss, guards } = battle(); guards[0].state = 'dead';
    if (stop === 'countdown') scene.countdown = 1;
    if (stop === 'paused') scene.paused = true;
    if (stop === 'over') scene.over = true;
    if (stop === 'dead') boss.state = 'dead';
    if (stop === 'lowHp') boss.hp = 36;
    if (stop === 'otherStage') scene.quest.stage = 0;
    const hp = boss.hp;
    scene.updateBossReinforcements(100);
    assert.equal(guards[0].alive, false, stop);
    assert.equal(boss.hp, hp, stop);
  }
});

test('all boss paralysis is capped at one second and repeated hits do not extend the episode', () => {
  for (const duration of [0.8, SOUL_FIRE.paralyze, SOUL_THUNDER.paralyze, SOUL_REAPER.paralyze, SOUL_TREE.paralyze, 10]) {
    const { boss } = battle();
    boss.paralyze(duration);
    assert.equal(boss.stateDur, Math.min(1, duration));
    boss.update(0.5, emptyIntent());
    const remaining = boss.stateDur - boss.stateT;
    boss.paralyze(10);
    assert.equal(boss.stateDur - boss.stateT, remaining);
    boss.update(0.501, emptyIntent());
    assert.equal(boss.paralyzed, false);
  }
  const { guards } = battle(); guards[0].paralyze(3.5);
  assert.equal(guards[0].stateDur, 3.5);
});

test('finale soul scaling reduces damage dealt and hurt gains without reducing player gains or the meter cap', () => {
  const { scene, boss, party, guards } = battle();
  boss.soulGainScale = QUEST.boss.soulGainScale;
  scene.stats = [];
  for (const f of scene.fighters) scene.stats[f.index] = f.stats;

  scene.dealDamage(boss, party, 20, 1, 0, 0, 0);
  assert.equal(boss.soul, 16);
  assert.equal(party.soul, 20 * SOUL_FROM_HURT);
  scene.dealDamage(party, boss, 20, 1, 0, 0, 0);
  assert.equal(boss.soul, 16 + 16 * SOUL_FROM_HURT);
  assert.equal(party.soul, 20 + 20 * SOUL_FROM_HURT);

  guards[0].addSoul(20);
  assert.equal(guards[0].soul, 20);
  boss.addSoul(1000);
  assert.equal(boss.soul, SOUL_LEVELS * SOUL_PER_LEVEL);
});

test('boss speed and cooldown buffs use the actual Fighter movement and skill timers without changing normal roles', () => {
  const before = JSON.stringify(ROLES);
  const { scene, boss } = battle();
  boss.skills.push(skillById('fireball'));
  scene.spawnProjectile = () => {};
  boss.tryUseSkill(0, 0, 0);
  assert.equal(boss.cooldowns[0], 1.875);
  assert.equal(skillCooldownFor(skillById('fury'), boss.role), 13.5);
  boss.update(0, { ...emptyIntent(), mx: 1 });
  const ordinary = battle().make(1, 0); ordinary.update(0, { ...emptyIntent(), mx: 1 });
  assert.ok(Math.abs(boss.body.velocity.x / ordinary.body.velocity.x - 1.05) < 1e-8);
  assert.equal(JSON.stringify(ROLES), before);
});

test('tree damage is 25% stronger while ordinary player summon damage remains unchanged', () => {
  const expected = { soulFire: [SOUL_FIRE.minDamage, SOUL_FIRE.maxDamage], soulThunder: [SOUL_THUNDER.minDamage, SOUL_THUNDER.maxDamage],
    soulReaper: [SOUL_REAPER.damage, SOUL_REAPER.damage], soulTree: [SOUL_TREE.damage, SOUL_TREE.damage] };
  for (const spell of TREE_SUMMONS) {
    assert.equal(spell.minDamage, expected[spell.kind][0] * 1.25);
    assert.equal(spell.maxDamage, expected[spell.kind][1] * 1.25);
  }
  assert.equal(SOUL_REAPER.damage, 80);
  assert.equal(SOUL_TREE.damage, 5);
});

function treeBattle() {
  const b = battle(QUEST.rescueStage);
  b.scene.fighters = [b.party, b.guards[0]];
  b.scene.physics = { add: { staticBody: () => ({ destroy() {} }), collider: () => ({ destroy() {} }) } };
  b.scene.placeQuestTree(1);
  b.scene.stats = b.scene.fighters.map((f) => f.stats);
  return { ...b, tree: b.scene.questTree, guard: b.guards[0] };
}

test('the living tree has scalable HP and acts as a main tower without shooting arrows', () => {
  const { scene, tree, guard } = treeBattle();
  assert.equal(tree.hp, 1200);
  assert.equal(tree.main, true); assert.equal(tree.tree, true);
  assert.equal(scene.towers.includes(tree), true);
  scene.updateTowers(100);
  assert.equal(scene.projectiles.length, 0);
  guard.state = 'dead'; scene.updateTeamRespawns(0);
  assert.equal(scene.respawnTimers.get(guard), 8);
  scene.updateTeamRespawns(7.99);
  assert.equal(guard.alive, false);
  assert.equal(tree.hp, 1200);
  scene.updateTeamRespawns(0.01);
  assert.equal(guard.alive, true);
  assert.equal(tree.hp, 1080);
});

test('the tree can be destroyed by combat or respawn costs and then stops both spells and respawns', () => {
  for (const source of ['attack', 'respawn']) {
    const { scene, tree, guard } = treeBattle();
    scene.questTreeCast = { spell: TREE_SUMMONS[0], target: scene.fighters[0], elapsed: 0 };
    tree.hp = 1;
    if (source === 'attack') scene.damageTower(tree, 20, undefined);
    else { guard.state = 'dead'; scene.teamRespawnT[1] = 0; scene.updateTeamRespawns(0); }
    assert.equal(tree.hp, 0); assert.equal(tree.alive, false);
    assert.equal(scene.questTreeCast, null);
    assert.equal(scene.obstacleRects.includes(tree.rect), false);
    guard.state = 'dead'; scene.updateTeamRespawns(100); scene.updateQuestTree(100);
    assert.equal(guard.alive, false);
    assert.equal(scene.questTreeCast, null);
  }
});

test('the boss summon strikes two players per soul level and uses that level\'s hit chance plus a boss bonus', () => {
  assert.equal(summonStrikeCount('soulThunder', 1, false), 1);
  assert.equal(summonStrikeCount('soulThunder', 1, true), 2);
  assert.equal(summonStrikeCount('soulThunder', 2, true), 4);
  assert.equal(summonStrikeCount('soulFire', 1, true), 2);
  assert.equal(summonStrikeCount('soulReaper', 3, true), 6);
  assert.equal(summonStrikeCount('soulTree', 1, false), 2);
  assert.equal(summonStrikeCount('soulTree', 1, true), 2);

  const { scene, party, boss, make } = battle();
  const second = make(1, 0);
  const third = make(2, 0);
  second.body.center = { x: 400, y: 500 };
  third.body.center = { x: 200, y: 500 };
  scene.fighters = [party, second, third, boss];
  scene.over = false;
  scene.summonTally = () => () => {};
  scene.summonResult = () => {};
  scene.screenFlash = () => {};
  scene.fx.skyBolt = () => {};
  scene.time = { delayedCall: (_delay, fn) => fn() };
  let damaged = 0;
  scene.dealDamage = () => { damaged++; };
  const random = Math.random;
  Math.random = () => 0;
  scene.thunderStrike(boss, 1);
  assert.equal(damaged, 2);
  damaged = 0;
  boss.boss = false;
  scene.thunderStrike(boss, 1);
  assert.equal(damaged, 1);
  boss.boss = true;
  Math.random = () => 0.7;
  damaged = 0;
  let marked = 0;
  scene.summonResult = () => { marked++; };
  scene.thunderStrike(boss, 1);
  assert.equal(marked, 2);
  assert.equal(damaged, 0);
  Math.random = random;

  boss.skills = [null, skillById('thunder'), null];
  boss.soul = SOUL_PER_LEVEL;
  boss.pe = boss.maxPe;
  boss.cooldowns = [0, 0, 0];
  boss.state = 'idle';
  const world = { fighters: [party, second, boss], projectiles: [], objectives: [], chests: [], towers: [] };
  assert.equal(new AIController().decide(boss, world).skills[1], true);
  const grunt = make(5, 1);
  grunt.skills = [skillById('thunder'), null, null];
  grunt.soul = SOUL_PER_LEVEL;
  grunt.pe = grunt.maxPe;
  grunt.cooldowns = [0, 0, 0];
  grunt.state = 'idle';
  assert.equal(new AIController().decide(grunt, { ...world, fighters: [party, second, grunt] }).skills[0], false);
});

test('after both princesses are rescued the living tree keeps casting but stops reviving guards', () => {
  const { scene, tree, guard } = treeBattle();
  scene.walls = [{ rescued: true }, { rescued: true }];
  scene.questTreeT = 0;
  scene.updateQuestTree(0.1);
  assert.ok(scene.questTreeCast);
  guard.state = 'dead'; scene.teamRespawnT[1] = 0; scene.updateTeamRespawns(0);
  assert.equal(guard.alive, false);
  assert.equal(tree.hp, tree.maxHp);
});

test('every guard return rerolls equipment, refreshes its HUD, and preserves role, scaled HP and stats', () => {
  const { scene, guards } = battle();
  const guard = guards[0];
  const role = guard.role, stats = guard.stats;
  guard.stats.kos = 3;
  guard.maxHp = 170;
  const names = [], glyphs = [];
  scene.hudNames[guard.index] = { setText: (s) => names.push(s) };
  scene.hudSkillGlyphs[guard.index] = [0, 1, 2].map(() => ({ setText: (s) => glyphs.push(s) }));
  const random = Math.random;
  const rolls = [];
  try {
    for (const value of [0, 0.999]) {
      Math.random = () => value;
      guard.state = 'dead'; guard.hp = 0;
      guard.cooldowns.fill(99);
      scene.updateBossReinforcements(10);
      rolls.push({ weapon: guard.weapon.id, skills: guard.skills.map((s) => s.id) });
      assert.ok(WEAPONS.includes(guard.weapon));
      assert.equal(guard.skills.length, 4);
      assert.ok(guard.skills.every((s) => s && s.id !== 'lifeline'));
      assert.equal(new Set(guard.skills.map((s) => s.id)).size, 4);
      assert.equal(guard.role, role);
      assert.equal(guard.maxHp, 170);
      assert.equal(guard.hp, 127.5);
      assert.equal(guard.stats, stats);
      assert.equal(guard.stats.kos, 3);
      assert.deepEqual([...guard.cooldowns], [0, 0, 0, 0]);
    }
  } finally { Math.random = random; }
  assert.notEqual(rolls[0].weapon, rolls[1].weapon);
  assert.notDeepEqual(rolls[0].skills, rolls[1].skills);
  assert.equal(names.length, 2);
  assert.equal(glyphs.length, 6);
});

test('all four boss summons gain ten percentage points without changing ordinary player hit rates', () => {
  const { summonHitChance } = load('@/battle/combat/summonRules.ts');
  assert.equal(summonHitChance(0.95, true), 1);
  for (const [method, threshold] of [['thunderStrike', 0.6], ['holyFireStrike', 0.9], ['treeStrike', 0.8], ['reaperStrike', 0.15]]) {
    const { scene, boss, party } = battle();
    scene.fighters = [party, boss];
    scene.fx = new Proxy({}, { get: () => () => {} });
    scene.summonTally = () => () => {};
    scene.summonResult = () => {};
    scene.time = { delayedCall: (_delay, run) => run() };
    let hits = 0;
    scene.dealDamage = () => hits++;
    const suffer = party.sufferReaper.bind(party);
    party.sufferReaper = () => { hits++; return suffer(); };
    const random = Math.random;
    try {
      Math.random = () => threshold;
      scene[method](boss, 1);
      assert.equal(hits, 1, `${method}: boss bonus should land`);
      hits = 0;
      boss.boss = false;
      party.state = 'idle';
      scene[method](boss, 1);
      assert.equal(hits, 0, `${method}: ordinary caster should miss`);
    } finally { Math.random = random; }
  }
});
