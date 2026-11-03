const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { MAP_PROPS, mapPropKey, mapPropSignature, renderCursedTree } = load('src/rendering/mapProps.ts');
const { withMapProps, paintScenery } = load('src/maps/art/renderedProps.ts');
const { MAPS, QUEST_MAPS, addArenaTexture } = load('src/maps/index.ts');
const { createQuestLayout } = load('src/maps/layout.ts');

function canvas() {
  let depth = 0;
  const images = [];
  const ctx = new Proxy({}, { get: (_, key) => (...args) => {
    for (const n of args) if (typeof n === 'number') assert.ok(Number.isFinite(n));
    if (key === 'save') depth++;
    if (key === 'restore') assert.ok(--depth >= 0);
    if (key === 'drawImage') images.push(args);
    if (String(key).includes('Gradient')) return { addColorStop() {} };
  }, set: () => true });
  return { ctx, images, depth: () => depth };
}
const sources = Object.fromEntries(Object.keys(MAP_PROPS).map(k => [k, { kind: k }]));

test('loaded scenery replaces prop bodies across normal, Quest and seeded maps without altering geometry', () => {
  let normal = 0, quest = 0;
  for (const map of [...MAPS, ...QUEST_MAPS, ...QUEST_MAPS.map(m => createQuestLayout(m, 221))]) {
    const before = JSON.stringify(map), c = canvas();
    withMapProps(c.ctx, map, sources, 'none', () => map.paint(c.ctx, () => .4));
    assert.equal(c.depth(), 0);
    assert.equal(JSON.stringify(map), before);
    if (c.images.length) { if (MAPS.includes(map)) normal++; else quest++; }
  }
  assert.ok(normal >= 25, `normal map coverage: ${normal}`);
  assert.ok(quest >= 15, `Quest and seeded map coverage: ${quest}`);
});

test('failed and late asset loads keep fallback art and cannot reuse its cached texture', () => {
  const c = canvas(), textures = new Map();
  let paints = 0;
  const map = { ...MAPS[1], paint(...args) { paints++; MAPS[1].paint(...args); } };
  const scene = { textures: { exists: k => textures.has(k), get: k => ({ getSourceImage: () => textures.get(k) }), createCanvas(k) {
    const tex = { getContext: () => c.ctx, refresh() {} }; textures.set(k, tex); return tex;
  } } };
  const fallback = addArenaTexture(scene, map);
  assert.equal(c.images.length, 0);
  textures.set(mapPropKey('bamboo'), sources.bamboo);
  const loaded = addArenaTexture(scene, map);
  assert.notEqual(fallback, loaded);
  assert.ok(c.images.length > 0);
  assert.equal(addArenaTexture(scene, map), loaded);
  assert.equal(paints, 2);
  assert.notEqual(mapPropSignature({}), mapPropSignature({ bamboo: sources.bamboo }));
});

test('scenery scope restores fallback painting even if a map painter throws', () => {
  const c = canvas(), o = { kind: 'rock', x: 40, y: 40, w: 40, h: 40 };
  assert.throws(() => withMapProps(c.ctx, MAPS[1], sources, 'none', () => { throw Error('bad paint'); }));
  assert.equal(paintScenery(c.ctx, o), false);
});

test('a live Quest tree owns one reusable sprite, hides on destruction and restores on revival', () => {
  let created = 0;
  const image = { setVisible(v) { this.visible = v; return this; }, setPosition() { return this; }, setDisplaySize(w,h) { this.size = [w,h]; return this; }, setTint() { return this; } };
  const scene = { textures: { exists: () => true }, add: { image() { created++; return image; } }, lFloor: { add() {} } };
  const tree = { alive: true, w: 70, h: 60, grove: 'summon' };
  assert.equal(renderCursedTree(scene, tree, 100, 200), true);
  renderCursedTree(scene, tree, 101, 201);
  assert.equal(created, 1);
  tree.alive = false;
  assert.equal(renderCursedTree(scene, tree, 100, 200), false);
  assert.equal(image.visible, false);
  tree.alive = true;
  renderCursedTree(scene, tree, 100, 200, true);
  assert.equal(image.visible, true);
  assert.equal(created, 1);
  assert.ok(image.size[0] < 70 * 2);
});
