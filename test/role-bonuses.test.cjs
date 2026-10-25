const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { Fighter } = load('src/Fighter.ts');
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { ROLES, roleById } = load('src/roles.ts');
const { skillById, skillCooldownFor, SKILLS } = load('src/skills.ts');
const { WEAPONS } = load('src/weapons.ts');
const { emptyIntent } = load('src/controls.ts');
const { QUEST } = load('src/config.ts');

function fighter(role) {
  const body = { center: { x: 100, y: 100 }, velocity: { x: 0, y: 0 },
    setVelocity(x, y) { this.velocity = { x, y }; } };
  return new Fighter(0, 0xffffff, WEAPONS[0], [skillById('arrow'), skillById('fireball'), null], role, { labels: [] }, body, {
    spawnProjectile() {}, inTowerAura: () => false, hazardSlow: () => 1, terrainAt: () => null, windAt: () => null,
  });
}

test('Mystic casts set shorter cooldowns and become usable at 90% of the base time', () => {
  const f = fighter(roleById('mystic'));
  f.tryUseSkill(0, 0, 0);
  assert.equal(f.cooldowns[0], 0.81);
  assert.equal(f.canUseSkill(0), false);
  f.update(0.8, emptyIntent());
  assert.equal(f.canUseSkill(0), false);
  f.update(0.011, emptyIntent());
  assert.equal(f.canUseSkill(0), true);
  f.tryUseSkill(1, 0, 0);
  assert.equal(f.cooldowns[1], 2.25);
  // The effective duration shown by the loadout and used by the HUD matches combat.
  assert.equal(f.cooldowns[1], skillCooldownFor(skillById('fireball'), f.role));
});

test('other roles keep their original cooldowns and shared skill definitions remain unchanged', () => {
  const before = JSON.stringify(SKILLS);
  for (const role of ROLES.filter((r) => r.id !== 'mystic')) {
    const f = fighter(role);
    f.tryUseSkill(0, 0, 0);
    assert.equal(f.cooldowns[0], 0.9);
    for (const skill of SKILLS) assert.equal(skillCooldownFor(skill, role), skill.cooldown);
  }
  for (const skill of SKILLS) assert.ok(Math.abs(skillCooldownFor(skill, roleById('mystic')) - skill.cooldown * 0.9) < 1e-8);
  assert.equal(JSON.stringify(SKILLS), before);
});

test('every Quest stage gives all party roles 5% faster movement, preserving enemy and versus speed', () => {
  const before = JSON.stringify(ROLES);
  const scene = new BattleScene();
  for (let stage = 0; stage < QUEST.maps.length; stage++) {
    scene.init({ mode: 'quest', slots: [], quest: { stage } });
    for (const base of ROLES) {
      const normal = fighter(base);
      normal.update(0, { ...emptyIntent(), mx: 1 });
      for (let slot = 0; slot < 8; slot++) {
        const role = scene.roleForSlot(base, slot);
        const f = fighter(role);
        f.update(0, { ...emptyIntent(), mx: 1 });
        const factor = slot < QUEST.partySlots ? 1.05 : 1;
        assert.ok(Math.abs(f.body.velocity.x - normal.body.velocity.x * factor) < 1e-8);
        assert.equal(role.skillCooldown, base.skillCooldown);
        assert.equal(role.peRegen, base.peRegen * (slot < QUEST.partySlots ? 1.1 : 1));
      }
    }
  }
  for (const mode of ['ffa', 'team', 'princess', 'siege']) {
    scene.init({ mode, slots: [] });
    for (const role of ROLES) assert.equal(scene.roleForSlot(role, 0), role);
  }
  assert.equal(JSON.stringify(ROLES), before);
});
