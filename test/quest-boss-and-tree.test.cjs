const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { BattleScene, bossRole } = load('src/scenes/BattleScene.ts');
const { Fighter } = load('src/Fighter.ts');
const { emptyIntent } = load('src/controls.ts');
const { WEAPONS } = load('src/weapons.ts');
const { ROLES, roleById } = load('src/roles.ts');
const { skillById, skillCooldownFor } = load('src/skills.ts');
const { QUEST, SOUL_FIRE, SOUL_THUNDER, SOUL_REAPER, SOUL_TREE } = load('src/config.ts');
const { TREE_SUMMONS } = load('src/questTree.ts');

function battle(stage = QUEST.bossStage) {
  const scene = new BattleScene();
  scene.init({ mode: 'quest', slots: [], quest: { stage } });
  scene.countdown = 0;
  scene.popText = () => {}; scene.showBanner = () => {};
  scene.fx = { respawnBeam() {}, hitSpark() {}, smoke() {}, hammerSmash() {} };
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
  assert.equal(tree.hp, 800);
  assert.equal(tree.main, true); assert.equal(tree.tree, true);
  assert.equal(scene.towers.includes(tree), true);
  scene.updateTowers(100);
  assert.equal(scene.projectiles.length, 0);
  guard.state = 'dead'; scene.updateTeamRespawns(0);
  assert.equal(scene.respawnTimers.get(guard), 10);
  scene.updateTeamRespawns(10);
  assert.equal(guard.alive, true);
  assert.equal(tree.hp, 720);
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

test('rescuing both princesses does not stop a living tree from casting or reviving guards', () => {
  const { scene, tree, guard } = treeBattle();
  scene.walls = [{ rescued: true }, { rescued: true }];
  scene.questTreeT = 0;
  scene.updateQuestTree(0.1);
  assert.ok(scene.questTreeCast);
  guard.state = 'dead'; scene.teamRespawnT[1] = 0; scene.updateTeamRespawns(0);
  assert.equal(guard.alive, true);
  assert.equal(tree.hp, 720);
});
