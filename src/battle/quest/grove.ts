import { layoutPoint } from '@/maps/layout';
import * as Phaser from 'phaser';
import { RESPAWN_TOWER_COST, TOWER_RESPAWN_HP, TOWER_RESPAWN_SOUL_KEEP, SOUL_MISS_PARALYZE, QUEST, HEIGHT, HUD_HEIGHT, RES, WIDTH, type GroveIllusion, type GroveRole } from '@/config';
import { skillById } from '@/gameplay/skills';
import { T } from '@/localization';
import { sfx } from '@/audio/sfx';
import { groveSummonHitChance, pickTreeSummon } from '@/battle/quest/treeRules';
import { REAPER_SWING } from '@/rendering/effects';
import { FONT, toHex } from '@/ui';
import { type Tower, type QuestTreeCast } from '@/battle/types';
import { S, toWorld } from '@/battle/coordinates';
import { TOWER_ARROW } from '@/battle/objectives/towerConfig';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type QuestGroveContext = Phaser.Scene & Pick<BattleScene,
  'map' |
  'add' | 'applyGroveHit' | 'countdown' | 'damageTower' | 'dealDamage'
  | 'fighters' | 'freeSpot' | 'fx' | 'g' | 'gGlow'
  | 'gOver' | 'groveAnnounced' | 'groveCast' | 'groveIllusion' | 'groveLabels'
  | 'grovePhase' | 'groveRespawnT' | 'groveSummonT' | 'groveT' | 'groveTrees'
  | 'groveVeil' | 'lTop' | 'nameTags' | 'obstacleRects' | 'onRevived'
  | 'over' | 'paintGroveVeil' | 'paused' | 'physics' | 'popText'
  | 'reap' | 'showBanner' | 'strikeGroveSummon' | 'summonResult' | 'time'
  | 'towers' | 'updateGroveRespawn' | 'updateGroveSummon'
>;

/** Three live trees. Their jobs are dealt onto the fixed spots at random. */
export function placeGroveTrees(this: QuestGroveContext, partySize: number): void {
  const roles: GroveRole[] = ['respawn', 'summon', 'illusion'];
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  const illusions: GroveIllusion[] = ['sand', 'heat', 'ice'];
  this.groveIllusion = illusions[Math.floor(Math.random() * illusions.length)];
  this.groveVeil = this.add.graphics().setDepth(12);
  const baseHp = QUEST.grove.hpBase + QUEST.grove.hpPerPlayer * partySize;
  QUEST.grove.spots.forEach((spot, i) => {
    const hp = baseHp * (roles[i] === 'summon' ? QUEST.grove.summonHp : 1);
    const p = toWorld(layoutPoint(this.map, spot));
    const w = 88 * S, h = 100 * S;
    const body = this.physics.add.staticBody(p.x - w / 2, p.y - h / 2, w, h);
    const collider = this.physics.add.collider(this.fighters.map((f) => f.body), body);
    const rect = new Phaser.Geom.Rectangle(p.x - w / 2, p.y - h / 2, w, h);
    this.obstacleRects.push(rect);
    const tree: Tower = {
      team: 1, main: false, tree: true, grove: roles[i], x: p.x, y: p.y, w, h, hp, maxHp: hp, alive: true, shakeT: 0,
      body, collider, rect, range: 0, fireInterval: 1, reload: 0, aura: QUEST.grove.aura, arrow: TOWER_ARROW,
    };
    this.groveTrees.push(tree);
    this.towers.push(tree);
    const label = this.add.text(p.x, p.y - h / 2 - 28, T().groveRole(roles[i]), {
      fontFamily: FONT, resolution: RES, fontSize: '15px', fontStyle: 'bold', color: '#ffe9b0', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);
    this.lTop.add(label);
    this.groveLabels.push(label);
  });
}

/** Which two trees are on duty. Effects last `interval - rest` seconds, then both rest. */
export function grovePhase(this: QuestGroveContext): { index: number; roles: GroveRole[]; active: boolean; restLeft: number } {
  const order = QUEST.grove.order;
  if (this.countdown > 0) return { index: 0, roles: [], active: false, restLeft: 0 };
  const { interval, rest } = QUEST.grove;
  const index = Math.floor(this.groveT / interval) % order.length;
  const into = this.groveT % interval;
  const scheduled: GroveRole[] = [order[index]!, order[(index + 1) % order.length]!];
  const roles = scheduled.filter((role) => this.groveTrees.some((tree) => tree.grove === role && tree.alive));
  return { index, roles, active: into < interval - rest && roles.length > 0, restLeft: Math.max(0, interval - into) };
}

export function paintGroveVeil(this: QuestGroveContext, phase: { roles: readonly GroveRole[]; active: boolean }): void {
  const veil = this.groveVeil;
  if (!veil) return;
  veil.clear();
  if (!(phase.active && phase.roles.includes('illusion'))) return;
  const [color, alpha] = this.groveIllusion === 'sand' ? [0xc4a36a, 0.34] as const
    : this.groveIllusion === 'heat' ? [0xff7a3a, 0.14] as const
    : [0xb9dcff, 0.18] as const;
  veil.fillStyle(color, alpha).fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
}

/** Two trees work at once. Destroying a tree silences only that one. */
export function updateGrove(this: QuestGroveContext, dt: number): void {
  if (this.countdown > 0 || this.paused) return;
  this.groveT += dt;
  const phase = this.grovePhase();
  this.paintGroveVeil(phase);
  this.groveTrees.forEach((tree, i) => this.groveLabels[i]?.setAlpha(tree.alive ? 1 : 0.35));
  if (phase.active && this.groveAnnounced !== String(phase.index)) {
    this.groveAnnounced = String(phase.index);
    this.showBanner(T().groveDuty(phase.roles, this.groveIllusion), 0xe2c56a);
  }
  if (!phase.active) this.groveAnnounced = '';
  if (phase.active && phase.roles.includes('respawn')) this.updateGroveRespawn(dt);
  else this.groveRespawnT = QUEST.grove.respawnEvery;
  if (phase.active && phase.roles.includes('summon')) this.updateGroveSummon(dt);
  else {
    this.groveCast = null;
    this.groveSummonT = 1.2;
  }
}

/** While the respawn tree works, fallen enemies return in pairs, never past four alive. */
export function updateGroveRespawn(this: QuestGroveContext, dt: number): void {
  const tree = this.groveTrees.find((t) => t.grove === 'respawn' && t.alive);
  if (!tree) return;
  const enemies = this.fighters.filter((f) => f.team === 1);
  const dead = enemies.filter((f) => !f.alive);
  if (!dead.length || enemies.filter((f) => f.alive).length >= QUEST.grove.maxEnemies) {
    this.groveRespawnT = QUEST.grove.respawnEvery;
    return;
  }
  this.groveRespawnT -= dt;
  if (this.groveRespawnT > 0) return;
  const room = QUEST.grove.maxEnemies - enemies.filter((f) => f.alive).length;
  for (const guard of dead.slice(0, Math.min(QUEST.reinforcementBatch, room))) {
    if (!tree.alive) break;
    const spot = this.freeSpot({ x: tree.x + (guard.index % 2 ? 80 : -80), y: tree.y + 70 }, this.fighters.filter((f) => f.alive).map((f) => ({ x: f.x, y: f.y })));
    guard.revive(spot.x, spot.y, guard.maxHp * TOWER_RESPAWN_HP);
    guard.pocket.length = 0;
    guard.selectedItem = 0;
    guard.soul *= TOWER_RESPAWN_SOUL_KEEP;
    this.nameTags[guard.index]?.setVisible(true);
    this.onRevived(guard);
    this.fx.respawnBeam(tree.x, tree.y, spot.x, spot.y, 0xc45a4a);
    sfx.respawn();
    this.popText(tree.x, tree.y - 70, T().groveRole('respawn'), '#e7a090');
    // The same price as a Quest tower: 10% of max HP, and the last revive can fell the tree.
    this.damageTower(tree, tree.maxHp * RESPAWN_TOWER_COST, undefined);
  }
  this.groveRespawnT = QUEST.grove.respawnEvery;
}

/** While the summon tree works, it marks one living party member and casts a summon there. */
export function updateGroveSummon(this: QuestGroveContext, dt: number): void {
  const tree = this.groveTrees.find((t) => t.grove === 'summon' && t.alive);
  if (!tree) { this.groveCast = null; return; }
  if (this.groveCast) {
    this.groveCast.elapsed += dt;
    if (this.groveCast.elapsed < this.groveCast.spell.warn) return;
    const cast = this.groveCast;
    this.groveCast = null;
    this.groveSummonT = QUEST.grove.summonInterval;
    this.strikeGroveSummon(cast);
    return;
  }
  this.groveSummonT -= dt;
  if (this.groveSummonT > 0) return;
  const targets = this.fighters.filter((f) => f.team === 0 && f.alive && !f.untouchable);
  if (!targets.length) return;
  const target = targets[Math.floor(Math.random() * targets.length)];
  const spell = pickTreeSummon();
  this.groveCast = { spell, target, x: target.x, y: target.y, elapsed: 0 };
  this.popText(tree.x, tree.y - 75, T().groveTreeCast(T().skillName(skillById(spell.skillId)!), target.index + 1), toHex(spell.color));
  sfx.summonCharge(spell.kind, spell.warn);
}

export function strikeGroveSummon(this: QuestGroveContext, cast: QuestTreeCast): void {
  const { spell, x, y } = cast;
  const tree = this.groveTrees.find((t) => t.grove === 'summon' && t.alive);
  if (tree) this.fx.summonPulse(() => ({ x: tree.x, y: tree.y }), spell.color, 0.12);
  const treeAlive = () => !!this.groveTrees.find((t) => t.grove === 'summon' && t.alive);
  if (spell.kind === 'soulReaper') {
    const hit = Math.random() < groveSummonHitChance(spell);
    sfx.reaper();
    this.fx.reaperCatch(() => ({ x, y }), hit);
    this.time.delayedCall(REAPER_SWING * 1000, () => {
      if (this.over || !treeAlive()) return;
      sfx.scythe();
      this.applyGroveHit(cast, hit);
    });
    return;
  }
  if (spell.kind === 'soulFire') { sfx.holyFire(); this.fx.holyFlame(x, y); }
  else if (spell.kind === 'soulThunder') { sfx.skyThunder(); this.fx.skyBolt(x, y); }
  else { sfx.sacredTree(); this.fx.treeRoots(x, y); }
  this.applyGroveHit(cast);
}

export function applyGroveHit(this: QuestGroveContext, cast: QuestTreeCast, hit = Math.random() < groveSummonHitChance(cast.spell)): void {
  if (this.over || !this.groveTrees.find((t) => t.grove === 'summon' && t.alive)) return;
  const { target, spell } = cast;
  if (target.team !== 0 || !target.alive || target.untouchable) return;
  if (Math.hypot(target.x - cast.x, target.y - cast.y) > QUEST.grove.radius + target.radius) {
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

export function renderGroveCast(this: QuestGroveContext, now: number): void {
  const cast = this.groveCast;
  const tree = this.groveTrees.find((t) => t.grove === 'summon' && t.alive);
  if (!cast || !tree) return;
  const color = cast.spell.color;
  const progress = Math.min(1, cast.elapsed / cast.spell.warn);
  this.fx.summonCircle(this.g, this.gGlow, tree.x, tree.y, progress, color, now, cast.spell.kind);
}
