const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { QUEST_ENEMY_BANNED, questBossSkills, questBossSkillPair, randomCpuEquipment, randomCpuLoadout, rollCpuLoadouts, skillsExceptGroup } = load('src/ai/loadouts.ts');
const { ROLES } = load('src/gameplay/roles.ts');
const { WEAPONS } = load('src/gameplay/weapons.ts');
const { skillById } = load('src/gameplay/skills.ts');

const slot = (control = 'cpu', role = 'ronin', team = 0) => ({ control, role, team, weapon: 0, skills: [], binds: [] });

test('random CPU roles avoid a chosen ninja teammate, including humans in later slots', () => {
  const slots = [slot(), slot('kb1', 'shinobi'), slot(), slot()];
  const before = JSON.stringify(slots);
  for (let n = 0; n < 100; n++) {
    const rolls = rollCpuLoadouts('team', slots);
    const roles = ['shinobi', ...Array.from(rolls.values(), (g) => g.role)];
    assert.equal(new Set(roles).size, 4);
  }
  assert.equal(JSON.stringify(slots), before);
});

test('role balance is per team across all versus team modes', () => {
  for (const mode of ['team', 'princess', 'siege']) {
    const slots = [slot(), slot(), slot('kb1', 'shinobi'), slot('kb2', 'samurai'),
      slot(), slot(), slot('kb3', 'shinobi', 1), slot('kb4', 'mystic', 1), slot('cpu', 'ronin', 1), slot('cpu', 'ronin', 1)];
    const rolls = rollCpuLoadouts(mode, slots);
    for (const team of [0, 1]) {
      const roles = slots.flatMap((s, i) => s.team === team ? [rolls.get(i)?.role ?? s.role] : []);
      if (team === 1) assert.equal(new Set(roles).size, 4);
      else {
        const counts = ROLES.map((r) => roles.filter((id) => id === r.id).length);
        assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
      }
    }
  }
});

test('disabled slots and enemy roles do not reserve a teammate role', () => {
  const rolls = rollCpuLoadouts('team', [slot(), slot('kb1', 'samurai'), slot('kb2', 'shinobi'), slot('kb3', 'ronin'),
    slot('off', 'mystic'), slot('kb4', 'mystic', 1)]);
  assert.equal(rolls.get(0).role, 'mystic');
});

test('after all roles are represented, random CPUs use the least represented roles', () => {
  const teammates = ['shinobi', 'shinobi', 'ronin', 'samurai', 'mystic'];
  for (let n = 0; n < 100; n++) assert.notEqual(randomCpuLoadout('team', [], teammates).role, 'shinobi');
});

test('Quest reserves party selections and the boss, with balanced enemy grunts and no enemy lifeline', () => {
  // Lobby team numbers are irrelevant to Quest party/enemy membership.
  const slots = [slot('cpu', 'ronin', 1), slot('kb1', 'shinobi', 1), slot('cpu', 'ronin', 1), slot('cpu', 'ronin', 1),
    slot(), slot(), slot(), slot()];
  for (let n = 0; n < 40; n++) {
    const rolls = rollCpuLoadouts('quest', slots, new Map([[4, 'samurai']]));
    assert.equal(new Set(['shinobi', ...[0, 2, 3].map((i) => rolls.get(i).role)]).size, 4);
    assert.equal(rolls.has(4), false);
    assert.equal(new Set(['samurai', ...[5, 6, 7].map((i) => rolls.get(i).role)]).size, 4);
    for (const i of [0, 2, 3]) {
      assert.equal(rolls.get(i).skills.length, 4);
      assert.equal(new Set(rolls.get(i).skills).size, 4);
    }
    for (const i of [5, 6, 7]) {
      assert.equal(rolls.get(i).skills.length, 4);
      assert.equal(new Set(rolls.get(i).skills).size, 4);
      assert.ok(!rolls.get(i).skills.includes('lifeline'));
      assert.ok(!rolls.get(i).skills.includes('sprint'));
      assert.ok(rolls.get(i).skills.every((id) => skillById(id).category !== 'team'));
    }
    for (const i of [0, 2, 3]) assert.ok(rolls.get(i).skills.every((id) => skillById(id).category !== 'team'));
  }
});

test('team CPUs can still roll group skills, while Quest CPUs cannot', () => {
  let teamSaw = false;
  for (let n = 0; n < 80; n++) {
    const team = randomCpuEquipment('team', 'mystic');
    if (team.skills.some((id) => skillById(id).category === 'team')) teamSaw = true;
    for (const gear of [randomCpuEquipment('quest', 'mystic', ['lifeline'], 4), randomCpuLoadout('quest')]) {
      assert.ok(gear.skills.every((id) => skillById(id).category !== 'team'));
    }
  }
  assert.equal(teamSaw, true);
});

test('FFA still rolls independent valid loadouts with no team-only skills', () => {
  const allRoles = new Set();
  for (let n = 0; n < 150; n++) {
    const gear = rollCpuLoadouts('ffa', [slot(), slot('kb1', 'shinobi')]).get(0);
    allRoles.add(gear.role);
    assert.ok(WEAPONS[gear.weapon]);
    assert.equal(gear.skills.length, 4);
    assert.equal(new Set(gear.skills).size, 4);
    assert.ok(gear.skills.every((id) => skillById(id) && skillById(id).category !== 'team' && id !== 'lifeline'));
  }
  assert.equal(allRoles.size, 4);
});

test('finale bosses take six non-group skills', () => {
  const pool = skillsExceptGroup();
  const seen = new Set();
  for (let n = 0; n < 20; n++) {
    const boss = questBossSkills();
    assert.equal(boss.length, 6);
    assert.equal(new Set(boss).size, 6);
    assert.ok(boss.every((id) => pool.includes(id) && skillById(id).category !== 'team' && id !== 'sprint'));
    for (const id of boss) seen.add(id);
  }
  assert.ok(seen.size > 6);
  assert.equal(pool.includes('healing-circle'), false);
  assert.equal(pool.includes('spirit-circle'), false);
  assert.equal(pool.includes('war-drum'), false);
  assert.equal(pool.includes('ward-circle'), false);
});

test('ordinary quest enemies equip at most four skills, never Lifeline, Sprint or a group skill', () => {
  for (let n = 0; n < 40; n++) {
    const gear = randomCpuEquipment('quest', 'shinobi', QUEST_ENEMY_BANNED, 4);
    assert.equal(gear.skills.length, 4);
    assert.equal(new Set(gear.skills).size, 4);
    assert.ok(gear.skills.every((id) => id !== 'lifeline' && id !== 'sprint' && skillById(id).category !== 'team'));
  }
});

test('twin bosses may equip Reaper on only one boss across randomized loadouts', () => {
  let seed = 712, reapers = 0;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 100; i++) {
    const pair = questBossSkillPair(random);
    for (const skills of pair) {
      assert.equal(skills.length, 6);
      assert.equal(new Set(skills).size, 6);
      assert.ok(skills.every(id => skillById(id).category !== 'team'));
    }
    const count = pair.filter(skills => skills.includes('reaper')).length;
    assert.ok(count <= 1);
    reapers += count;
  }
  assert.ok(reapers > 0, 'Reaper remains available to one of the bosses');
});
