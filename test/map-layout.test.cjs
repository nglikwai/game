const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { QUEST_MAPS, ARENA, spawnPoint } = load('@/maps/index.ts');
const { createQuestLayout, layoutPoint, layoutRect } = load('@/maps/layout.ts');
const { BattleScene } = load('@/scenes/BattleScene.ts');
const { QUEST, MAP_SCALE, HUD_HEIGHT } = load('@/config/index.ts');
const { getSettings } = load('@/state/gameSettings.ts');
const toWorld = (p) => ({ x: p.x * MAP_SCALE, y: (p.y - HUD_HEIGHT) * MAP_SCALE });

for (const base of QUEST_MAPS) test(`${base.id}: seeds vary geometry, preserve borders and do not mutate the original`, () => {
  const before = JSON.stringify(base);
  const a = createQuestLayout(base, 100), same = createQuestLayout(base, 100), b = createQuestLayout(base, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(same)));
  assert.notDeepEqual(a.obstacles, b.obstacles);
  assert.equal(JSON.stringify(base), before);
  assert.equal(a.id, base.id);
  for (const x of [ARENA.x, ARENA.x + ARENA.w]) for (const y of [ARENA.y, ARENA.y + ARENA.h])
    assert.deepEqual({ ...layoutPoint(a, { x, y }) }, { x, y });
  for (const o of a.obstacles) {
    assert.ok(o.w > 0 && o.h > 0);
    assert.ok(o.x - o.w / 2 >= ARENA.x - 1e-6);
    assert.ok(o.x + o.w / 2 <= ARENA.x + ARENA.w + 1e-6);
    assert.ok(o.y - o.h / 2 >= ARENA.y - 1e-6);
    assert.ok(o.y + o.h / 2 <= ARENA.y + ARENA.h + 1e-6);
  }
});

test('random rivers keep three usable bridges and CPU routing matches the shifted crossing', () => {
  const base = QUEST_MAPS.find(m => m.id === 'sanzu');
  const positions = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const map = createQuestLayout(base, seed);
    const blood = map.obstacles.filter(o => o.kind === 'blood').sort((a,b) => a.y-b.y);
    positions.add(Math.round(blood[0].x));
    for (let i = 1; i < blood.length; i++) {
      const gap = blood[i].y - blood[i].h / 2 - (blood[i-1].y + blood[i-1].h / 2);
      assert.ok(gap >= 56, `bridge too narrow: ${gap}`);
    }
    const from = layoutPoint(map, spawnPoint(0,0,0)), to = layoutPoint(map, spawnPoint(0,1,0));
    const expected = base.route(spawnPoint(0,0,0).x,spawnPoint(0,0,0).y,spawnPoint(0,1,0).x,spawnPoint(0,1,0).y);
    const actual = map.route(from.x,from.y,to.x,to.y);
    assert.deepEqual(actual, layoutPoint(map,expected));
    assert.ok(!blood.some(o => Math.abs(actual.y-o.y) < o.h/2), 'AI must enter a real bridge');
  }
  assert.ok(positions.size > 60);
});

test('randomized tree, seal, lantern and gate coordinates survive retries with the same seed', () => {
  for (const stage of [QUEST.rescueStage, QUEST.groveStage, QUEST.sealStage, QUEST.escortStage]) {
    const slots = structuredClone(getSettings().slots);
    const a = new BattleScene(); a.init({ slots, mode:'quest', quest:{ stage, layoutSeed:12345 } });
    const b = new BattleScene(); b.init({ slots, mode:'quest', quest:structuredClone(a.quest) });
    assert.deepEqual(a.map.obstacles,b.map.obstacles);
    if (stage === QUEST.rescueStage) assert.equal(a.rescueGateX,layoutPoint(a.map,{x:QUEST.rescue.tree.gateX,y:0}).x*MAP_SCALE);
    if (stage === QUEST.sealStage) a.seals.forEach((s,i) => {
      const p=toWorld(layoutPoint(a.map,QUEST.seals.spots[i]));assert.equal(s.x,p.x);assert.equal(s.y,p.y);
    });
    if (stage === QUEST.escortStage) {
      const path=QUEST.escort.path.map(p=>toWorld(layoutPoint(a.map,p)));
      assert.deepEqual(JSON.parse(JSON.stringify(a.lantern.path)),JSON.parse(JSON.stringify(path)));
      assert.equal(a.lantern.y,path[1].y);
    }
  }
});

test('geometry edges, hazard positions and decorative paint use the same layout without leaking canvas state', () => {
  for (const base of QUEST_MAPS) {
    const map=createQuestLayout(base,79);
    base.obstacles.forEach((o,i) => assert.deepEqual(map.obstacles[i],layoutRect(map,o)));
    if (base.flames) assert.deepEqual(map.flames.spots,base.flames.spots.map(p=>layoutPoint(map,p)));
    let depth=0,calls=0;
    const ctx=new Proxy({}, {get:(_o,name)=>(...args)=>{
      calls++;for(const v of args)if(typeof v==='number')assert.ok(Number.isFinite(v));
      if(name==='save')depth++;if(name==='restore')assert.ok(--depth>=0);
      if(name==='createLinearGradient'||name==='createRadialGradient')return {addColorStop(){}};
    },set:()=>true});
    map.paint(ctx,()=>0.5);assert.equal(depth,0);assert.ok(calls>1000);
  }
});
