import { layoutPoint } from '@/maps/layout';
import * as Phaser from 'phaser';
import { SOUL_MISS_PARALYZE, QUEST, WIDTH } from '@/config';
import { skillById } from '@/gameplay/skills';
import { T } from '@/localization';
import { sfx } from '@/audio/sfx';
import { ARENA_MID_Y as SCREEN_MID_Y } from '@/maps';
import { pickTreeSummon } from '@/battle/quest/treeRules';
import { REAPER_SWING } from '@/rendering/effects';
import { toHex } from '@/ui';
import { type QuestTreeCast } from '@/battle/types';
import { S, toWorld } from '@/battle/coordinates';
import { TOWER_ARROW, TOWER_STATS } from '@/battle/objectives/towerConfig';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type QuestTreeContext = Phaser.Scene & Pick<BattleScene,
  'map' |
  'applyQuestTreeHit' | 'countdown' | 'dealDamage' | 'fighters' | 'freeSpot'
  | 'fx' | 'g' | 'gGlow' | 'gOver' | 'obstacleRects'
  | 'over' | 'paused' | 'physics' | 'popText' | 'quest'
  | 'questTree' | 'questTreeCast' | 'questTreeT' | 'reap' | 'strikeQuestTree'
  | 'summonResult' | 'summonTreeConfig' | 'time' | 'towers'
>;

// ---------- 闖關 Quest ----------

/** Prison tree or the warden-stage tree at the back. Null on every other stage. */
export function summonTreeConfig(this: QuestTreeContext): { x: number; y: number; hpBase: number; hpPerPlayer: number; aura: number; interval: number; initialDelay: number; radius: number; warnScale: number; } | null {
  if (this.quest?.stage === QUEST.rescueStage) return QUEST.rescue.tree;
  if (this.quest?.stage === QUEST.wardenStage) return QUEST.wardens.tree;
  return null;
}

/** The summon tree marks one random living party member, then strikes that fixed spot. */
export function updateQuestTree(this: QuestTreeContext, dt: number): void {
  const config = this.summonTreeConfig();
  if (!config || this.over || !this.questTree?.alive) {
    this.questTreeCast = null;
    return;
  }
  if (this.paused || this.countdown > 0) return;
  if (this.questTreeCast) {
    const cast = this.questTreeCast;
    cast.elapsed += dt;
    if (cast.elapsed < cast.spell.warn * config.warnScale) return;
    this.questTreeCast = null;
    this.questTreeT = config.interval;
    this.strikeQuestTree(cast);
    return;
  }
  this.questTreeT -= dt;
  if (this.questTreeT > 0) return;
  const targets = this.fighters.filter((f) => f.team === 0 && f.alive && !f.untouchable);
  if (!targets.length) return;
  const target = targets[Math.floor(Math.random() * targets.length)];
  const spell = pickTreeSummon();
  this.questTreeCast = { spell, target, x: target.x, y: target.y, elapsed: 0 };
  const tree = toWorld(layoutPoint(this.map, config));
  this.popText(tree.x, tree.y - 75, T().questTreeCast(T().skillName(skillById(spell.skillId)!), target.index + 1), toHex(spell.color));
  sfx.summonCharge(spell.kind, spell.warn);
}

export function strikeQuestTree(this: QuestTreeContext, cast: QuestTreeCast): void {
  const { spell, x, y } = cast;
  const tree = this.questTree;
  if (tree?.alive) this.fx.summonPulse(() => ({ x: tree.x, y: tree.y }), spell.color, 0.12);
  if (spell.kind === 'soulReaper') {
    const hit = Math.random() < spell.hitChance;
    sfx.reaper();
    this.fx.reaperCatch(() => ({ x, y }), hit);
    this.time.delayedCall(REAPER_SWING * 1000, () => {
      if (this.over || !this.summonTreeConfig() || !this.questTree?.alive) return;
      sfx.scythe();
      this.applyQuestTreeHit(cast, hit);
    });
    return;
  }
  if (spell.kind === 'soulFire') { sfx.holyFire(); this.fx.holyFlame(x, y); }
  else if (spell.kind === 'soulThunder') { sfx.skyThunder(); this.fx.skyBolt(x, y); }
  else { sfx.sacredTree(); this.fx.treeRoots(x, y); }
  this.applyQuestTreeHit(cast);
}

export function applyQuestTreeHit(this: QuestTreeContext, cast: QuestTreeCast, hit = Math.random() < cast.spell.hitChance): void {
  const config = this.summonTreeConfig();
  if (this.over || !config || !this.questTree?.alive) return;
  const { target, spell } = cast;
  if (target.team !== 0 || !target.alive || target.untouchable) return;
  // Leaving the targeted area avoids damage and paralysis entirely.
  if (Math.hypot(target.x - cast.x, target.y - cast.y) > config.radius + target.radius) {
    this.summonResult(target, false, spell.color);
    return;
  }
  this.summonResult(target, hit, spell.color);
  if (!hit) { target.paralyze(SOUL_MISS_PARALYZE); return; }
  if (spell.kind === 'soulReaper') {
    if (this.reap(undefined, target) && target.alive) target.paralyze(spell.paralyze);
    return;
  }
  this.dealDamage(undefined, target, Phaser.Math.Between(spell.minDamage, spell.maxDamage), 0, 0, 0, 0, false);
  if (target.alive) target.paralyze(spell.paralyze);
}

export function renderQuestTree(this: QuestTreeContext, now: number): void {
  const config = this.summonTreeConfig();
  if (!config || this.over || !this.questTree?.alive) return;
  const cast = this.questTreeCast;
  const tree = this.questTree;
  const color = cast?.spell.color ?? 0xa86aff;
  this.gGlow.fillStyle(color, 0.12 + 0.06 * Math.sin(now * 3)).fillCircle(tree.x, tree.y, 90);
  if (!cast) return;
  const progress = Math.min(1, cast.elapsed / (cast.spell.warn * config.warnScale));
  this.fx.summonCircle(this.g, this.gGlow, tree.x, tree.y, progress, color, now, cast.spell.kind);
}

/** Stage 2: two great towers on the enemy side. They shoot, heal and keep sending enemies back in. */
export function placeQuestTowers(this: QuestTreeContext, partySize: number): void {
  const bodies = this.fighters.map((f) => f.body);
  const st = TOWER_STATS.main;
  const size = QUEST.tower.size;
  const hp = QUEST.tower.base + QUEST.tower.perPlayer * partySize;
  for (const dy of [-150, 150]) {
    const p = this.freeSpot(toWorld(layoutPoint(this.map, { x: WIDTH - 230, y: SCREEN_MID_Y + dy })), [], size / 2 + 10);
    const body = this.physics.add.staticBody(p.x - size / 2, p.y - size / 2, size, size);
    const collider = this.physics.add.collider(bodies, body);
    const rect = new Phaser.Geom.Rectangle(p.x - size / 2, p.y - size / 2, size, size);
    this.obstacleRects.push(rect);
    this.towers.push({
      team: 1, main: true, x: p.x, y: p.y, w: size, h: size, hp, maxHp: hp, alive: true, shakeT: 0, body, collider, rect,
      range: st.range, fireInterval: st.fireInterval, reload: st.fireInterval, aura: st.aura, arrow: st.arrow,
    });
  }
  // The party gets a small tower of its own: it shoots enemies and buffs allies in its aura (it can be destroyed,
  // but it doesn't bring anyone back, only a main tower does that).
  const mine = TOWER_STATS.small;
  const msize = mine.size;
  const mhp = (mine.hp * Math.max(2, partySize)) / 2;
  const q = this.freeSpot(toWorld(layoutPoint(this.map, { x: 380, y: SCREEN_MID_Y })), [], msize / 2 + 10);
  const mbody = this.physics.add.staticBody(q.x - msize / 2, q.y - msize / 2, msize, msize);
  const mcollider = this.physics.add.collider(bodies, mbody);
  const mrect = new Phaser.Geom.Rectangle(q.x - msize / 2, q.y - msize / 2, msize, msize);
  this.obstacleRects.push(mrect);
  this.towers.push({
    team: 0, main: false, x: q.x, y: q.y, w: msize, h: msize, hp: mhp, maxHp: mhp, alive: true, shakeT: 0, body: mbody, collider: mcollider, rect: mrect,
    range: mine.range, fireInterval: mine.fireInterval, reload: mine.fireInterval, aura: mine.aura, arrow: mine.arrow,
  });
}

/** Keep the prison tree as a tree: destructible, able to revive guards, and never shooting arrows. */
export function placeQuestTree(this: QuestTreeContext, partySize: number): void {
  const config = QUEST.rescue.tree;
  const p = toWorld(layoutPoint(this.map, config));
  const w = 52 * S, h = 64 * S;
  const hp = config.hpBase + config.hpPerPlayer * partySize;
  const body = this.physics.add.staticBody(p.x - w / 2, p.y - h / 2, w, h);
  const collider = this.physics.add.collider(this.fighters.map((f) => f.body), body);
  const rect = new Phaser.Geom.Rectangle(p.x - w / 2, p.y - h / 2, w, h);
  this.obstacleRects.push(rect);
  this.questTree = {
    team: 1, main: true, tree: true, x: p.x, y: p.y, w, h, hp, maxHp: hp, alive: true, shakeT: 0,
    body, collider, rect, range: 0, fireInterval: 1, reload: 0, aura: config.aura, arrow: TOWER_ARROW,
  };
  this.towers.push(this.questTree);
}

/** A summon tree behind the twin wardens. It does not revive them. */
export function placeWardenTree(this: QuestTreeContext, partySize: number): void {
  const config = QUEST.wardens.tree;
  const p = toWorld(layoutPoint(this.map, config));
  const w = 88 * S, h = 100 * S;
  const hp = config.hpBase + config.hpPerPlayer * partySize;
  const body = this.physics.add.staticBody(p.x - w / 2, p.y - h / 2, w, h);
  const collider = this.physics.add.collider(this.fighters.map((f) => f.body), body);
  const rect = new Phaser.Geom.Rectangle(p.x - w / 2, p.y - h / 2, w, h);
  this.obstacleRects.push(rect);
  this.questTree = {
    team: 1, main: false, tree: true, x: p.x, y: p.y, w, h, hp, maxHp: hp, alive: true, shakeT: 0,
    body, collider, rect, range: 0, fireInterval: 1, reload: 0, aura: config.aura, arrow: TOWER_ARROW,
  };
  this.towers.push(this.questTree);
  this.questTreeT = config.initialDelay;
}
