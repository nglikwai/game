const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { WEAPONS, aimTurn, shapeArea, shapeReach, shapeHits, shapeHitsRect, waveLine } = load('src/gameplay/weapons.ts');
const { WEAPON_AREA, DAMAGE_PER_SEC } = load('src/config/index.ts');
const { drawHeldWeapon, drawWeaponIcon } = load('src/rendering/fighterArt.ts');
const { T, setLang } = load('src/localization/index.ts');
const nunchaku = WEAPONS.find((w) => w.id === 'nunchaku');
const whip = WEAPONS.find((w) => w.id === 'whip');
const yari = WEAPONS.find((w) => w.id === 'yari');

/** A point `forward` along `facing` and `side` across it, from (100, 200). */
const at = (facing, forward, side = 0) => [100 + Math.cos(facing) * forward - Math.sin(facing) * side, 200 + Math.sin(facing) * forward + Math.cos(facing) * side];

test('both new weapons keep the shared area and their own damage rate, are named in both languages, and stay short of the long weapons', () => {
  for (const w of [nunchaku, whip]) {
    assert.ok(Math.abs(shapeArea(w.shape) - WEAPON_AREA) / WEAPON_AREA < 0.01);
    assert.ok(Math.abs(w.damage / w.cycle - DAMAGE_PER_SEC * w.power) < 1e-9);
    assert.ok(shapeReach(w.shape) < shapeReach(yari.shape) / 2);
  }
  setLang('zh'); assert.equal(T().weaponName(nunchaku), '雙節棍'); assert.equal(T().weaponName(whip), '九節鞭');
  setLang('en'); assert.equal(T().weaponName(nunchaku), 'Nunchaku'); assert.equal(T().weaponName(whip), 'Chain Whip');
});

test('the nunchaku hits to both sides but not straight ahead or behind', () => {
  const r = nunchaku.shape.radius;
  for (const facing of [0, 1.2, Math.PI, -2]) {
    const hit = (forward, side) => shapeHits(nunchaku.shape, 100, 200, facing, ...at(facing, forward, side), 18);
    assert.equal(hit(0, r * 0.7), true);
    assert.equal(hit(0, -r * 0.7), true);
    assert.equal(hit(r * 0.8, 0), false);
    assert.equal(hit(-r * 0.8, 0), false);
    assert.equal(hit(0, r + 30), false);
    assert.equal(shapeHitsRect(nunchaku.shape, 100, 200, facing, ...at(facing, 0, r * 0.6), 40, 40), true);
  }
  // CPUs turn side-on to swing it.
  assert.equal(aimTurn(nunchaku.shape), Math.PI / 2);
  assert.equal(aimTurn(whip.shape), 0);
});

test('the chain whip hits along its S and misses in the pockets of its bends', () => {
  const s = whip.shape;
  const line = Array.from(waveLine(s));
  for (const facing of [0, 0.7, Math.PI]) {
    const hit = (forward, side) => shapeHits(s, 100, 200, facing, ...at(facing, forward, side), 18);
    for (const p of line) assert.equal(hit(p.x, p.y), true);
    // Inside the first bend, on the far side from the crest.
    assert.equal(hit(s.offset + s.length / 4, -s.amplitude * 0.9), false);
    assert.equal(hit(s.offset + (s.length * 3) / 4, s.amplitude * 0.9), false);
    assert.equal(hit(-40, 0), false);
    assert.equal(hit(s.offset + s.length + 60, 0), false);
  }
});

test('icons and held poses draw finite geometry', () => {
  const check = (arg) => {
    if (typeof arg === 'number') assert.ok(Number.isFinite(arg));
    else if (Array.isArray(arg)) arg.forEach(check);
    else if (arg && typeof arg === 'object') Object.values(arg).forEach(check);
  };
  let draws = 0;
  const g = new Proxy({}, { get: () => (...args) => { args.forEach(check); draws++; return g; } });
  for (const id of ['nunchaku', 'whip']) {
    for (const size of [14, 28, 40]) drawWeaponIcon(g, id, 20, 20, size, 0xd9ae4a);
    for (const facing of [0, 1.4, Math.PI]) for (const phase of ['idle', 'windup', 'strike']) for (const t of [0, 0.25, 0.75, 1]) {
      drawHeldWeapon(g, id, { x: 100, y: 200, facing, phase, t, color: 0xd9ae4a, time: 1 });
    }
  }
  assert.ok(draws > 100);
});

const windmill = WEAPONS.find((w) => w.id === 'windmill');
const spade = WEAPONS.find((w) => w.id === 'spade');

test('the windmill and spade keep the shared area, stay short, and are named in both languages', () => {
  for (const w of [windmill, spade]) {
    assert.ok(Math.abs(shapeArea(w.shape) - WEAPON_AREA) / WEAPON_AREA < 0.01);
    assert.ok(Math.abs(w.damage / w.cycle - DAMAGE_PER_SEC * w.power) < 1e-9);
    assert.ok(shapeReach(w.shape) < shapeReach(yari.shape) / 2);
  }
  setLang('zh'); assert.equal(T().weaponName(windmill), '風車刃'); assert.equal(T().weaponName(spade), '月牙鏟');
  setLang('en'); assert.equal(T().weaponName(windmill), 'Windmill Blade'); assert.equal(T().weaponName(spade), 'Crescent Spade');
});

test('the windmill hits along its three arms all round, but not between them', () => {
  const { pinwheelArms } = load('src/gameplay/weapons.ts');
  const s = windmill.shape;
  for (const facing of [0, 1, -2.5]) {
    const hit = (lx, ly) => shapeHits(s, 100, 200, facing, ...at(facing, lx, ly), 18);
    for (const arm of pinwheelArms(s)) for (const p of arm) assert.equal(hit(p.x, p.y), true);
    // Out at the tips, halfway between two arms.
    const tipAngle = s.curl;
    for (let k = 0; k < s.arms; k++) {
      const a = tipAngle + ((k + 0.5) / s.arms) * Math.PI * 2;
      assert.equal(hit(Math.cos(a) * s.outer, Math.sin(a) * s.outer), false);
    }
  }
});

test('the spade scoops in front and to the front-sides, but not far ahead, inside the U, or behind', () => {
  const s = spade.shape;
  const mid = (s.inner + s.outer) / 2;
  for (const facing of [0, 2, -1]) {
    const hit = (lx, ly) => shapeHits(s, 100, 200, facing, ...at(facing, lx, ly), 18);
    assert.equal(hit(s.center - mid, 0), true, 'the bottom of the U, right in front');
    const horn = Math.PI - s.angle / 2 + 0.05;
    assert.equal(hit(s.center + Math.cos(horn) * mid, Math.sin(horn) * mid), true, 'a horn');
    assert.equal(hit(s.center, 0), false, 'inside the U');
    assert.equal(hit(s.center + s.outer + 40, 0), false, 'far ahead');
    assert.equal(hit(-60, 0), false, 'behind');
  }
});

test('windmill and spade icons and held poses draw finite geometry', () => {
  const check = (arg) => {
    if (typeof arg === 'number') assert.ok(Number.isFinite(arg));
    else if (Array.isArray(arg)) arg.forEach(check);
    else if (arg && typeof arg === 'object') Object.values(arg).forEach(check);
  };
  const g = new Proxy({}, { get: () => (...args) => { args.forEach(check); return g; } });
  for (const id of ['windmill', 'spade']) {
    drawWeaponIcon(g, id, 20, 20, 28, 0xd9ae4a);
    for (const phase of ['idle', 'windup', 'strike']) for (const t of [0, 0.5, 1]) drawHeldWeapon(g, id, { x: 100, y: 200, facing: 0.7, phase, t, color: 0xd9ae4a, time: 1 });
  }
});
