const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { paintWaterSurface } = load('src/maps/art/water.ts');
const { mulberry32 } = load('src/maps/common.ts');
const { ninjaTexture } = load('src/rendering/fighterArt.ts');
const { drawCharacterSteps } = load('src/rendering/characterArt.ts');
const { renderTowerModel, drawTowerDetails } = load('src/rendering/towerArt.ts');
const { renderTower } = load('src/battle/objectives/towers.ts');

function drawing() {
  const calls = [];
  let depth = 0;
  function check(v) {
    if (typeof v === 'number') assert.ok(Number.isFinite(v));
    else if (Array.isArray(v)) v.forEach(check);
    else if (v && typeof v === 'object') Object.values(v).forEach(check);
  }
  const ctx = new Proxy({}, { get: (_, key) => (...args) => {
    args.forEach(check); calls.push([key, ...args]);
    if (key === 'save') depth++;
    if (key === 'restore') assert.ok(--depth >= 0);
    if (String(key).includes('Gradient')) return { addColorStop(...args) { calls.push(['stop', ...args]); } };
    return ctx;
  }, set: (_, k, v) => { calls.push([k, v]); return true; } });
  return { ctx, calls, depth: () => depth };
}

test('every water outline clips before surface decoration and produces stable art without changing terrain', () => {
  for (const shape of ['rect','round','ellipse']) for (const theme of ['river','pond','spring','blood']) {
    const p = { x: 320, y: 240, w: 140, h: 80 }, before = JSON.stringify(p);
    const a = drawing(), b = drawing();
    paintWaterSurface(a.ctx, p, shape, theme, mulberry32(22));
    paintWaterSurface(b.ctx, p, shape, theme, mulberry32(22));
    assert.equal(JSON.stringify(a.calls), JSON.stringify(b.calls));
    assert.ok(a.calls.findIndex(c=>c[0]==='clip') < a.calls.findIndex(c=>c[0]==='fillRect'));
    assert.equal(a.depth(), 0); assert.equal(JSON.stringify(p), before);
  }
});

test('role textures have distinct cached silhouettes, keeping the same player colour and texture dimensions', () => {
  const textures = new Map(), paints = [], scene = { textures: { exists: k=>textures.has(k), createCanvas(k,w,h) {
    const d = drawing(); paints.push(d); textures.set(k,{w,h}); return { getContext: ()=>d.ctx, refresh() {} };
  } } };
  const keys = ['ronin','samurai','shinobi','mystic'].map(role=>ninjaTexture(scene,0x729abb,role));
  assert.equal(new Set(keys).size,4);
  assert.equal(new Set(paints.map(d=>JSON.stringify(d.calls))).size,4);
  assert.ok(paints.every(d=>d.depth()===0));
  assert.equal(new Set([...textures.values()].map(v=>`${v.w}:${v.h}`)).size,1);
  assert.equal(ninjaTexture(scene,0x729abb,'samurai'),keys[1]);
  assert.equal(paints.length,4);
});

test('tower models persist once per objective, hide on destruction, and retain the original HP bar', () => {
  for (const main of [false,true]) {
    const d = drawing(); let made=0, modelKey;
    const model={setVisible(v){this.visible=v;return this},setPosition(){return this},setDisplaySize(){return this}};
    const scene={textures:{exists:()=>true},add:{image(x,y,key){made++;modelKey=key;return model}},lFloor:{add(){}},sideColor:()=>0x5a9cdd};
    const tw={team:1,x:300,y:300,w:64,h:64,hp:50,maxHp:100,alive:true,main,range:240,aura:140,shakeT:0};
    renderTower.call(scene,d.ctx,d.ctx,tw,.2);
    renderTower.call(scene,d.ctx,d.ctx,tw,.3);
    assert.equal(made,1);assert.equal(tw.hp,50);
    assert.ok(modelKey.includes(main?'fortress':'watchtower'));
    assert.ok(d.calls.some(([k,...a])=>k==='fillRect'&&a[2]===37&&a[3]===5),'half-full original HP bar');
    tw.alive=false;renderTower.call(scene,d.ctx,d.ctx,tw,.4);assert.equal(model.visible,false);
    tw.alive=true;renderTowerModel(scene,tw,300);assert.equal(model.visible,true);assert.equal(made,1);
    for(const hp of [0,25,50,100]){tw.hp=hp;drawTowerDetails(d.ctx,tw,300,0x5a9cdd,.2);}
  }
});

test('walking steps stay finite across roles and speeds and disappear at rest', () => {
  const d=drawing(), f={x:300,y:300,vx:0,vy:0,index:2,facing:0,radius:25};
  drawCharacterSteps(d.ctx,f,0);assert.equal(d.calls.length,0);
  for(const speed of [40,200,950])for(const facing of [0,Math.PI/2,Math.PI]){f.vx=speed;f.facing=facing;drawCharacterSteps(d.ctx,f,.7)}
  assert.ok(d.calls.length>20);
});
