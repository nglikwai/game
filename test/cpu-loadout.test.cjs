const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { questFoeSkills, randomCpuEquipment, randomCpuLoadout, rollCpuLoadouts, skillsExceptGroup } = load('src/cpuLoadout.ts');
const { ROLES } = load('src/roles.ts');
const { WEAPONS } = load('src/weapons.ts');
const { skillById } = load('src/skills.ts');

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
    for (const i of [0, 2, 3]) assert.equal(rolls.get(i).skills.length, 3);
    for (const i of [5, 6, 7]) {
      assert.equal(rolls.get(i).skills.length, 4);
      assert.equal(new Set(rolls.get(i).skills).size, 4);
      assert.ok(!rolls.get(i).skills.includes('lifeline'));
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

test('finale bosses take every non-group skill, and middle foes take half of that list', () => {
  const pool = skillsExceptGroup();
  const boss = questFoeSkills('boss');
  assert.equal(JSON.stringify(boss), JSON.stringify(pool));
  assert.ok(pool.length >= 8);
  assert.ok(pool.every((id) => skillById(id).category !== 'team'));
  assert.equal(pool.includes('healing-circle'), false);
  assert.equal(pool.includes('spirit-circle'), false);
  assert.equal(pool.includes('war-drum'), false);
  assert.equal(pool.includes('ward-circle'), false);
  const seen = new Set();
  let seed = 11;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let n = 0; n < 12; n++) {
    const middle = questFoeSkills('middle', random);
    assert.equal(middle.length, Math.floor(pool.length / 2));
    assert.equal(new Set(middle).size, middle.length);
    assert.ok(middle.every((id) => pool.includes(id)));
    seen.add(middle.join(','));
  }
  assert.ok(seen.size > 1);
});
