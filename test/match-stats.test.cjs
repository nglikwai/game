const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { Fighter } = load('src/gameplay/Fighter.ts');
const { BattleScene } = load('src/scenes/BattleScene.ts');
const { WEAPONS } = load('src/gameplay/weapons.ts');
const { roleById } = load('src/gameplay/roles.ts');
const { skillById } = load('src/gameplay/skills.ts');
const { ITEMS } = load('src/gameplay/items.ts');
const { createMatchStats } = load('src/battle/results/stats.ts');

function fighter(index = 0, arena = {}) {
  const body = { center: { x: 100, y: 100 }, velocity: { x: 0, y: 0 }, setVelocity() {}, reset() {} };
  return new Fighter(index, 0xffffff, WEAPONS[0], [skillById('arrow'), skillById('lifeline'), null], roleById('ronin'), { labels: [] }, body, {
    popText() {}, spawnProjectile() {}, onPillRevived() {}, onSubstitute() {},
    findReviveTarget: () => null, ...arena,
  });
}
const item = (id) => ITEMS.find((it) => it.id === id);

test('healing counts actual HP gained and excludes respawn HP', () => {
  const f = fighter();
  f.hp -= 4;
  assert.equal(f.heal(25), 4);
  assert.equal(f.heal(25), 0);
  assert.equal(f.stats.recovered, 4);
  f.revive(100, 100);
  assert.equal(f.stats.recovered, 4);
});

test('damage is capped to remaining HP; a pill cannot turn dealt damage negative', () => {
  const attacker = fighter();
  const target = fighter(1);
  const scene = new BattleScene();
  scene.stats = [attacker.stats, target.stats];
  scene.fx = { hitSpark() {} };
  target.hp = 8;
  target.pocket.push(item('revival-pill'));
  scene.dealDamage(attacker, target, 200, 1, 0, 0, 0);
  assert.equal(target.hp, 40);
  assert.equal(attacker.stats.dealt, 8);
  assert.equal(target.stats.taken, 8);
  assert.equal(target.stats.items, 1);
  assert.equal(target.stats.recovered, 40);
  assert.equal(target.stats.deaths, 0);
  assert.equal(attacker.stats.kos, 0);
  scene.dealDamage(attacker, target, 200, 1, 0, 0, 0); // untouchable after a pill
  assert.equal(attacker.stats.dealt, 8);
  target.state = 'idle';
  scene.dealDamage(attacker, target, 200, 1, 0, 0, 0);
  assert.equal(target.stats.taken, 48);
  assert.equal(target.stats.deaths, 1);
  assert.equal(attacker.stats.kos, 1);
  scene.dealDamage(attacker, target, 200, 1, 0, 0, 0);
  assert.equal(target.stats.deaths, 1);
  assert.equal(attacker.stats.kos, 1);
});

test('damage reduction, substitution and chip damage update totals correctly', () => {
  const f = fighter();
  f.ward(0.5, 5);
  f.takeChip(12);
  assert.equal(f.stats.taken, 6);
  f.substituteT = 1;
  f.takeHit(20, 1, 0, 0, 0);
  assert.equal(f.stats.taken, 6);
  f.hp = 3;
  f.takeChip(200);
  assert.equal(f.stats.taken, 9);
  assert.equal(f.stats.deaths, 1);
});

test('skill and item counters reject failed uses and include automatic items', () => {
  const f = fighter();
  f.pe = 0;
  f.tryUseSkill(0, 0, 0);
  assert.equal(f.stats.skills, 0);
  f.pe = f.maxPe;
  f.tryUseSkill(0, 0, 0);
  f.tryUseSkill(0, 0, 0); // cooldown
  f.tryUseSkill(2, 0, 0); // empty slot
  f.tryUseSkill(1, 0, 0); // no fallen teammate
  assert.equal(f.stats.skills, 1);
  f.pocket.push(item('revival-pill'));
  f.tryUseItem(0, 0, 0);
  assert.equal(f.stats.items, 0);
  assert.equal(f.pocket.length, 1);
  f.pocket.push(item('rice-ball'), item('rice-ball'));
  f.receiveItem(item('rice-ball')); // full pocket: automatic use
  f.tryUseItem(1, 0, 0);
  assert.equal(f.stats.items, 2);
});

test('revives credit the teammate who performed them without counting respawns', () => {
  const target = fighter(1);
  target.takeHit(1000, 1, 0, 0, 0);
  const f = fighter(0, { findReviveTarget: () => target, reviveSpot: () => ({ x: 100, y: 100 }), onRevived() {} });
  f.tryUseSkill(1, 0, 0);
  assert.equal(f.stats.revives, 1);
  assert.equal(f.stats.skills, 1);
  assert.equal(target.alive, true);
  assert.equal(target.stats.deaths, 1);
  target.revive(100, 100);
  assert.equal(f.stats.revives, 1);
});

test('Quest carries every metric forward and new games start at zero', () => {
  const stats = createMatchStats({ dealt: 90, kos: 2, deaths: 1, taken: 35, recovered: 20, skills: 4, items: 3, revives: 1, wall: 12 });
  const scene = new BattleScene();
  scene.init({ mode: 'quest', slots: [], quest: { stage: 1, carry: { players: {}, stats: [stats] } } });
  assert.deepEqual({ ...scene.stats[0] }, { ...stats });
  scene.stats[0].skills++;
  assert.equal(stats.skills, 4); // stage snapshots are independent
  scene.init({ mode: 'ffa', slots: [] });
  assert.ok(Object.values(scene.stats[0]).every((n) => n === 0));
});

test('eight-player results render every metric in English and Chinese within the screen', () => {
  const { setLang, T } = load('src/localization/index.ts');
  for (const lang of ['en', 'zh']) {
    setLang(lang);
    const scene = new BattleScene();
    const texts = [];
    const graphics = new Proxy({}, { get: () => () => graphics });
    scene.add = {
      graphics: () => graphics,
      text: (x, y, text, style) => {
        const entry = {
          x, y, text, width: String(text).length * parseInt(style.fontSize) * 0.6,
          setOrigin() { return this; }, setScale() { return this; },
        };
        texts.push(entry);
        return entry;
      },
    };
    scene.fighters = Array.from({ length: 8 }, (_, n) => fighter(n));
    scene.fighters.forEach((f, n) => f.team = n % 2);
    scene.stats = scene.fighters.map((f, n) => Object.assign(f.stats, { dealt: 987 + n, kos: 2, deaths: 3, taken: 456, recovered: 123, skills: 10, items: 11, revives: 1, wall: 99 }));
    scene.mode = 'siege';
    scene.winningTeam = 0;
    scene.quest = null;
    scene.openModal = (options) => {
      assert.ok(options.w <= 1280 && options.h <= 720);
      options.build({ x: (1280 - options.w) / 2, y: (720 - options.h) / 2, w: options.w, h: options.h, content: { add() {} }, nav: { add() {} } });
    };
    scene.openResults('Winner', '#fff');
    for (const label of [T().score, T().dealt, T().kos, T().deaths, T().taken, T().recovered, T().skillsUsed, T().itemsUsed, T().revives, T().towerDmg]) {
      assert.ok(texts.some((t) => t.text === label), `missing ${label}`);
    }
    assert.equal(texts.filter((t) => /^P\d/.test(t.text)).length, 10); // 8 rows + 2 award cards
    const rows = texts.filter((t) => /^P\d/.test(t.text) && t.x === 122);
    assert.deepEqual(rows.map((t) => Number(/^P(\d)/.exec(t.text)[1])), [7, 5, 3, 1, 8, 6, 4, 2]);
    assert.equal(texts.filter((t) => t.text === 'MVP').length, 2); // card + row badge
    assert.equal(texts.filter((t) => t.text === 'SVP').length, 2);
    assert.equal(texts.filter((t) => t.text === '456').length, 8);
    assert.equal(texts.filter((t) => t.text === '99').length, 8);
    for (const t of texts) assert.ok(t.x >= 0 && t.x <= 1280 && t.y >= 0 && t.y <= 720);
  }
});
