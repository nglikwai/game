const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { MAPS, getMap } = load('src/maps/index.ts');
const { ARENA, mulberry32, spawnPoint, obstaclesFor, chestsFor } = load('src/maps/common.ts');
const ids = ['tea', 'storm', 'sunken', 'frostfire', 'orchard', 'astral'];

test('six new arenas register once and are available to selection and Random', () => {
  assert.equal(MAPS.length, 42);
  assert.equal(new Set(MAPS.map((m) => m.id)).size, MAPS.length);
  for (const id of ids) assert.equal(getMap(id).id, id);
});

for (const id of ids) test(`${id}: bounded layouts, clear spawns, reachable chests and safe painting`, () => {
  const map = getMap(id);
  assert.ok(map.name && map.zh && map.desc && map.descZh);
  const intersects = (p, o, pad) => Math.abs(p.x - o.x) < o.w / 2 + pad && Math.abs(p.y - o.y) < o.h / 2 + pad;
  for (const mode of ['ffa', 'team', 'princess', 'siege']) {
    const obstacles = obstaclesFor(map, mode);
    for (const p of chestsFor(map, mode)) {
      assert.ok(!obstacles.some((o) => intersects(p, o, p.big ? 32 : 21)), `${mode}: chest ${p.x}, ${p.y} overlaps an obstacle`);
    }
  }
  for (const o of [...map.obstacles, ...(map.zones ?? [])]) {
    assert.ok(o.w > 0 && o.h > 0);
    assert.ok(o.x - o.w / 2 >= ARENA.x && o.x + o.w / 2 <= ARENA.x + ARENA.w);
    assert.ok(o.y - o.h / 2 >= ARENA.y && o.y + o.h / 2 <= ARENA.y + ARENA.h);
  }
  for (let i = 0; i < 8; i++) {
    const p = spawnPoint(i, null, 0);
    assert.ok(!map.obstacles.some((o) => intersects(p, o, 18)), `P${i + 1} starts inside an obstacle`);
  }
  for (const pair of map.portals ?? []) for (const p of [pair.a, pair.b]) {
    assert.ok(!map.obstacles.some((o) => intersects(p, o, 30)), 'portal exit is obstructed');
  }
  // Walk a grid with fighter-radius clearance, then check every chest is approachable.
  const step = 16;
  const visited = new Set();
  const queue = [[8, 6]];
  for (let n = 0; n < queue.length; n++) {
    const [x, y] = queue[n]; const key = `${x},${y}`;
    const p = { x: ARENA.x + 18 + x * step, y: ARENA.y + 18 + y * step };
    if (visited.has(key) || x < 0 || y < 0 || p.x > ARENA.x + ARENA.w - 18 || p.y > ARENA.y + ARENA.h - 18 || map.obstacles.some((o) => intersects(p, o, 18))) continue;
    visited.add(key);
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const reachable = [...visited].map((key) => { const [x, y] = key.split(',').map(Number); return { x: ARENA.x + 18 + x * step, y: ARENA.y + 18 + y * step }; });
  for (const chest of map.chests) assert.ok(reachable.some((p) => Math.hypot(p.x - chest.x, p.y - chest.y) < 60), 'chest is unreachable');

  let calls = 0;
  const ctx = new Proxy({}, { get: (_target, name) => (...args) => {
    calls++;
    for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `${name} received an invalid coordinate`);
    if (name === 'createRadialGradient' || name === 'createLinearGradient') return { addColorStop() {} };
  }, set: () => true });
  map.paint(ctx, mulberry32(8));
  assert.ok(calls > 100, 'map artwork did not render');
});
