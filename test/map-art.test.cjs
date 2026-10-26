const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const load = require('./load-source.cjs')();
const { MAPS, QUEST_MAPS, addArenaTexture } = load('src/maps/index.ts');
const { MAP_ART, polishMapArt } = load('src/maps/finishArt.ts');
const { mulberry32 } = load('src/maps/common.ts');

function canvas() {
  let depth = 0, calls = 0;
  const hash = createHash('sha256');
  const record = (name, args) => {
    calls++;
    for (const v of args) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${name}: invalid number`);
    hash.update(JSON.stringify([name, ...args]));
  };
  const ctx = new Proxy({}, {
    get: (_o, name) => (...args) => {
      record(name, args);
      if (name === 'save') depth++;
      if (name === 'restore') { depth--; assert.ok(depth >= 0); }
      if (name === 'createLinearGradient' || name === 'createRadialGradient') return { addColorStop: (...args) => record('stop', args) };
    },
    set: (_o, name, value) => { if (typeof value !== 'object') record(name, [value]); return true; },
  });
  return { ctx, finish: () => ({ hash: hash.digest('hex'), calls, depth }) };
}

test('all 42 versus maps and all eleven Quest stages have explicit art direction', () => {
  const maps = [...MAPS, ...QUEST_MAPS];
  assert.equal(maps.length, 53);
  assert.deepEqual(Object.keys(MAP_ART).sort(), maps.map((m) => m.id).sort());
  assert.ok(new Set(Object.values(MAP_ART).map((a) => a.light)).size > 30);
});

for (const map of [...MAPS, ...QUEST_MAPS]) test(`${map.id}: finished art is deterministic, balanced, finite and leaves gameplay geometry intact`, () => {
  const before = JSON.stringify(map);
  const a = canvas(), b = canvas();
  map.paint(a.ctx, mulberry32(8)); map.paint(b.ctx, mulberry32(8));
  const first = a.finish(), second = b.finish();
  assert.equal(first.hash, second.hash);
  assert.ok(first.calls > 300);
  assert.equal(first.depth, 0);
  assert.equal(JSON.stringify(map), before);
  const paint = map.paint;
  polishMapArt(map);
  assert.equal(map.paint, paint, 'finishing must never stack on subsequent registrations');
});

test('arena artwork is baked only once per texture and reused for later draws and previews', () => {
  const { ctx } = canvas();
  let exists = false, paints = 0;
  const map = { ...MAPS[0], paint: (...args) => { paints++; MAPS[0].paint(...args); } };
  const scene = { textures: { exists: () => exists, createCanvas: () => {
    exists = true; return { getContext: () => ctx, refresh() {} };
  } } };
  assert.equal(addArenaTexture(scene, map), addArenaTexture(scene, map));
  assert.equal(paints, 1);
});
