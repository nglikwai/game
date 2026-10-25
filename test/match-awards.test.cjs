const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-source.cjs')();
const { performanceScore, rankMatchResults, selectMatchAwards } = load('src/matchAwards.ts');
const { createMatchStats } = load('src/matchStats.ts');
const player = (index, team, stats) => ({ index, team, stats: createMatchStats(stats) });

test('MVP comes from the winners and SVP from the losing team, regardless of overall score', () => {
  const players = [player(0, 0, { dealt: 50 }), player(1, 0, { dealt: 200 }), player(2, 1, { dealt: 1000 }), player(3, 1, { dealt: 400 })];
  const { mvp, svp } = selectMatchAwards(players, 0);
  assert.equal(mvp.index, 1);
  assert.equal(svp.index, 2);
  assert.deepEqual(players.map((p) => p.index), [0, 1, 2, 3]);
});

test('objectives and teammate revives contribute; received healing and damage do not', () => {
  const stats = createMatchStats({ dealt: 120, wall: 300, kos: 2, revives: 1, deaths: 2 });
  assert.equal(performanceScore(stats), 645);
  stats.taken = stats.recovered = stats.skills = stats.items = 9999;
  assert.equal(performanceScore(stats), 645);
  const players = [player(0, 0, { dealt: 200 }), player(1, 0, { wall: 300, revives: 1 })];
  assert.equal(selectMatchAwards(players, 0).mvp.index, 1);
  assert.equal(performanceScore(createMatchStats({ deaths: 100 })), 0);
});

test('FFA winner receives MVP; highest-scoring other fighter gets SVP', () => {
  const players = [player(0, 0, { dealt: 90 }), player(1, 1, { dealt: 800 }), player(2, 2, { dealt: 400 })];
  const awards = selectMatchAwards(players, 0);
  assert.equal(awards.mvp.index, 0);
  assert.equal(awards.svp.index, 1);
});

test('draws award neither title; solo Quest never awards the same player twice', () => {
  const players = [player(0, 0, { kos: 1 }), player(1, 1, { kos: 1 })];
  const draw = selectMatchAwards(players, null);
  assert.equal(draw.mvp, undefined);
  assert.equal(draw.svp, undefined);
  const solo = selectMatchAwards([players[0]], 0, true);
  assert.equal(solo.mvp.index, 0);
  assert.equal(solo.svp, undefined);
});

test('Quest selects distinct party leaders using carried stage totals', () => {
  const players = [player(0, 0, { dealt: 300 }), player(1, 0, { revives: 5 }), player(2, 0, { kos: 1 })];
  const awards = selectMatchAwards(players, 0, true);
  assert.equal(awards.mvp.index, 1);
  assert.equal(awards.svp.index, 0);
});

test('ties resolve consistently by KOs, deaths, then player number', () => {
  const a = player(3, 0, { dealt: 200 });
  const b = player(2, 0, { dealt: 100, kos: 1 });
  assert.equal(selectMatchAwards([a, b], 0).mvp.index, 2);
  const c = player(1, 0, { dealt: 125, kos: 1, deaths: 1 });
  assert.equal(selectMatchAwards([c, b], 0).mvp.index, 2);
  const d = player(0, 0, { dealt: 100, kos: 1 });
  assert.equal(selectMatchAwards([b, d], 0).mvp.index, 0);
});

test('result rows put the winning team first even when the losing team has higher scores', () => {
  const players = [player(0, 0, { dealt: 1000 }), player(1, 1, { dealt: 50 }),
    player(2, 0, { dealt: 2000 }), player(3, 1, { dealt: 200 })];
  assert.deepEqual(Array.from(rankMatchResults(players, 1), (p) => p.index), [3, 1, 2, 0]);
  assert.deepEqual(players.map((p) => p.index), [0, 1, 2, 3]);
});

test('teammates rank by the complete performance score, matching MVP and SVP', () => {
  const players = [player(0, 0, { dealt: 500, deaths: 10 }), player(1, 0, { dealt: 100, kos: 2 }),
    player(2, 1, { dealt: 200 }), player(3, 1, { wall: 100, revives: 2 })];
  const rows = rankMatchResults(players, 0);
  assert.deepEqual(Array.from(rows, (p) => p.index), [1, 0, 3, 2]);
  const awards = selectMatchAwards(players, 0);
  assert.equal(rows[0], awards.mvp);
  assert.equal(rows[2], awards.svp);
});

test('FFA ranks the winner first and the remaining players by score; Quest ranks the party by score', () => {
  const players = [player(0, 0, { dealt: 50 }), player(1, 1, { dealt: 200 }), player(2, 2, { dealt: 400 })];
  assert.deepEqual(Array.from(rankMatchResults(players, 0, false), (p) => p.index), [0, 2, 1]);
  assert.deepEqual(Array.from(rankMatchResults(players, null, false), (p) => p.index), [2, 1, 0]);
  players.forEach((p) => p.team = 0);
  assert.deepEqual(Array.from(rankMatchResults(players, 0), (p) => p.index), [2, 1, 0]);
});

test('draws keep teams together and equal scores use the established award tie-breakers', () => {
  const players = [player(3, 1, { dealt: 200 }), player(2, 0, { dealt: 100, kos: 1 }),
    player(1, 1, { dealt: 200 }), player(0, 0, { dealt: 200 })];
  assert.deepEqual(Array.from(rankMatchResults(players, null), (p) => p.index), [2, 0, 1, 3]);
});
