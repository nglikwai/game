import { renderCursedTree } from '@/rendering/mapProps';
import { layoutPoint } from '@/maps/layout';
import * as Phaser from 'phaser';
import { SOUL_MISS_PARALYZE, QUEST, HEIGHT, HUD_HEIGHT, RES, WIDTH, type GroveIllusion, type GroveRole } from '@/config';
import { skillById } from '@/gameplay/skills';
import { T } from '@/localization';
import { sfx } from '@/audio/sfx';
import { pickTreeSummon } from '@/battle/quest/treeRules';
import { REAPER_SWING } from '@/rendering/effects';
import { FONT, toHex } from '@/ui';
import { type Tower, type QuestTreeCast } from '@/battle/types';
import { S, toWorld } from '@/battle/coordinates';
import { TOWER_ARROW } from '@/battle/objectives/towerConfig';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type QuestSnareContext = Phaser.Scene & Pick<BattleScene,
  'lFloor' | 'map' |
  'add' | 'applySnareHit' | 'countdown' | 'dealDamage' | 'fighters'
  | 'freeSpot' | 'fx' | 'g' | 'gGlow' | 'gOver'
  | 'isHell' | 'lTop' | 'obstacleRects' | 'over' | 'paintSnareVeil'
  | 'paused' | 'physics' | 'popText' | 'reap' | 'showBanner'
  | 'snareCast' | 'snareIllusion' | 'snareLabels' | 'snareSide' | 'snareSummonT'
  | 'snareTrees' | 'snareVeil' | 'sprites' | 'strikeSnare' | 'summonResult'
  | 'time' | 'towers'
>;

/** The side whose allies can be sealed in the saplings. */
export function snareSide(this: QuestSnareContext): 0 | 1 {
  return this.isHell ? 1 : 0;
}

/** Two small trees. Jobs are shuffled, and the last allies on that side start inside them. */
export function placeSnareTrees(this: QuestSnareContext, partySize: number): void {
  const roles: GroveRole[] = Math.random() < 0.5 ? ['summon', 'illusion'] : ['illusion', 'summon'];
  const illusions: GroveIllusion[] = ['sand', 'heat', 'ice'];
  this.snareIllusion = illusions[Math.floor(Math.random() * illusions.length)]!;
  this.snareVeil = this.add.graphics().setDepth(12);
  const base = QUEST.snare.hpBase + QUEST.snare.hpPerPlayer * partySize;
  const side = this.snareSide();
  QUEST.snare.spots.forEach((spot, i) => {
    const role = roles[i]!;
    const hp = base * (role === 'summon' ? QUEST.snare.summonHp : 1);
    const p = toWorld(layoutPoint(this.map, spot));
    const w = 56 * S;
    const h = 66 * S;
    const body = this.physics.add.staticBody(p.x - w / 2, p.y - h / 2, w, h);
    const collider = this.physics.add.collider(this.fighters.map((f) => f.body), body);
    const rect = new Phaser.Geom.Rectangle(p.x - w / 2, p.y - h / 2, w, h);
    this.obstacleRects.push(rect);
    const tree: Tower = {
      team: side === 0 ? 1 : 0, main: false, tree: true, snare: true, grove: role,
      x: p.x, y: p.y, w, h, hp, maxHp: hp, alive: true, shakeT: 0,
      body, collider, rect, range: 0, fireInterval: 1, reload: 0, aura: QUEST.snare.aura, arrow: TOWER_ARROW,
    };
    this.snareTrees.push(tree);
    this.towers.push(tree);
    const label = this.add.text(p.x, p.y - h / 2 - 22, T().groveRole(role), {
      fontFamily: FONT, resolution: RES, fontSize: '13px', fontStyle: 'bold', color: '#e7f0c8', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);
    this.lTop.add(label);
    this.snareLabels.push(label);
  });
  const allies = this.fighters.filter((f) => f.team === side && f.alive);
  const prisoners = allies.slice(Math.max(1, allies.length - 2));
  prisoners.forEach((f, i) => {
    const tree = this.snareTrees[i];
    if (!tree) return;
    tree.prisoner = f;
    f.trapped = true;
    f.body.enable = false;
    f.body.reset(tree.x - f.radius, tree.y - f.radius);
  });
}

export function releaseSnarePrisoner(this: QuestSnareContext, tree: Tower): void {
  const f = tree.prisoner;
  if (!f?.trapped) return;
  f.trapped = false;
  const spot = this.freeSpot({ x: tree.x, y: tree.y + 48 }, this.fighters.filter((o) => o.alive && !o.trapped).map((o) => ({ x: o.x, y: o.y })));
  f.body.enable = true;
  f.revive(spot.x, spot.y);
  this.sprites[f.index]?.setVisible(true);
  this.showBanner(T().snareFreed(f.index + 1), 0x9ddeb0);
  this.fx.respawnBeam(tree.x, tree.y, spot.x, spot.y, f.color);
}

export function paintSnareVeil(this: QuestSnareContext): void {
  const veil = this.snareVeil;
  if (!veil) return;
  veil.clear();
  const illusion = this.snareTrees.some((t) => t.grove === 'illusion' && t.alive) && this.snareIllusion === 'sand';
  if (!illusion) return;
  veil.fillStyle(0xc4a36a, 0.28).fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
}

/** Both saplings work until they fall. The summon one marks someone on the trapped side. */
export function updateSnare(this: QuestSnareContext, dt: number): void {
  if (this.countdown > 0 || this.paused) return;
  this.paintSnareVeil();
  this.snareTrees.forEach((tree, i) => this.snareLabels[i]?.setAlpha(tree.alive ? 1 : 0.35));
  const tree = this.snareTrees.find((t) => t.grove === 'summon' && t.alive);
  if (!tree) { this.snareCast = null; return; }
  if (this.snareCast) {
    this.snareCast.elapsed += dt;
    if (this.snareCast.elapsed < this.snareCast.spell.warn) return;
    const cast = this.snareCast;
    this.snareCast = null;
    this.snareSummonT = QUEST.snare.summonInterval;
    this.strikeSnare(cast);
    return;
  }
  this.snareSummonT -= dt;
  if (this.snareSummonT > 0) return;
  const side = this.snareSide();
  const targets = this.fighters.filter((f) => f.team === side && f.alive && !f.trapped && !f.untouchable);
  if (!targets.length) return;
  const target = targets[Math.floor(Math.random() * targets.length)]!;
  const spell = pickTreeSummon();
  this.snareCast = { spell, target, x: target.x, y: target.y, elapsed: 0 };
  this.popText(tree.x, tree.y - 46, T().groveTreeCast(T().skillName(skillById(spell.skillId)!), target.index + 1), toHex(spell.color));
  sfx.summonCharge(spell.kind, spell.warn);
}

export function strikeSnare(this: QuestSnareContext, cast: QuestTreeCast): void {
  const { spell, x, y } = cast;
  const tree = this.snareTrees.find((t) => t.grove === 'summon' && t.alive);
  if (tree) this.fx.summonPulse(() => ({ x: tree.x, y: tree.y }), spell.color, 0.12);
  const chance = Math.min(1, spell.hitChance + QUEST.snare.summonHitBonus);
  if (spell.kind === 'soulReaper') {
    const hit = Math.random() < chance;
    sfx.reaper();
    this.fx.reaperCatch(() => ({ x, y }), hit);
    this.time.delayedCall(REAPER_SWING * 1000, () => {
      if (this.over || !this.snareTrees.some((t) => t.grove === 'summon' && t.alive)) return;
      sfx.scythe();
      this.applySnareHit(cast, hit);
    });
    return;
  }
  if (spell.kind === 'soulFire') { sfx.holyFire(); this.fx.holyFlame(x, y); }
  else if (spell.kind === 'soulThunder') { sfx.skyThunder(); this.fx.skyBolt(x, y); }
  else { sfx.sacredTree(); this.fx.treeRoots(x, y); }
  this.applySnareHit(cast, Math.random() < chance);
}

export function applySnareHit(this: QuestSnareContext, cast: QuestTreeCast, hit: boolean): void {
  if (this.over || !this.snareTrees.some((t) => t.grove === 'summon' && t.alive)) return;
  const { target, spell } = cast;
  const side = this.snareSide();
  if (target.team !== side || !target.alive || target.trapped || target.untouchable) return;
  if (Math.hypot(target.x - cast.x, target.y - cast.y) > QUEST.snare.radius + target.radius) {
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

export function renderSnareCast(this: QuestSnareContext, now: number): void {
  const cast = this.snareCast;
  const tree = this.snareTrees.find((t) => t.grove === 'summon' && t.alive);
  if (!cast || !tree) return;
  const color = cast.spell.color;
  const progress = Math.min(1, cast.elapsed / cast.spell.warn);
  this.fx.summonCircle(this.g, this.gGlow, tree.x, tree.y, progress, color, now, cast.spell.kind);
}

export function renderSnareTree(this: QuestSnareContext, g: Phaser.GameObjects.Graphics, over: Phaser.GameObjects.Graphics, tree: Tower, now: number): void {
  const x = tree.x + (tree.shakeT > 0 ? Math.sin(now * 80) * 2 : 0);
  const y = tree.y;
  const tint = tree.grove === 'illusion' ? 0xe2c56a : 0x945bc2;
  const wood = tree.grove === 'illusion' ? 0x6e6240 : 0x554631;
  const rendered = renderCursedTree(this, tree, x, y, true);
  if (!tree.alive) {
    g.fillStyle(0x24231f, 1).fillEllipse(x, y, 36, 24);
    g.lineStyle(3, 0x514536, 1).lineBetween(x - 16, y + 6, x + 14, y - 10);
    return;
  }
  g.fillStyle(tint, 0.08).fillCircle(x, y, tree.aura);
  g.lineStyle(2, tint, 0.45).strokeCircle(x, y, tree.aura);
  if (!rendered) {
    for (let k = 0; k < 7; k++) {
      const a = k * Math.PI * 2 / 7;
      g.lineStyle(5, wood, 1).lineBetween(x, y, x + Math.cos(a) * 28, y + Math.sin(a) * 22);
  }
  over.fillStyle(0x5a4534, 1).fillEllipse(x, y, 28, 40);
  over.lineStyle(2, tint, 1).strokeEllipse(x, y, 28, 40);
  }
  over.fillStyle(tint, 0.9).fillCircle(x - 5, y - 4, 2.4).fillCircle(x + 5, y - 4, 2.4);
  if (tree.prisoner?.trapped) over.fillStyle(tree.prisoner.color, 1).fillCircle(x, y + 8, 6);
  const bw = tree.w;
  over.fillStyle(0x080b10, 0.9).fillRoundedRect(x - bw / 2, y - tree.h / 2 - 12, bw, 7, 2);
  over.fillStyle(tint, 1).fillRoundedRect(x - bw / 2 + 1, y - tree.h / 2 - 11, (bw - 2) * Math.max(0, tree.hp / tree.maxHp), 5, 2);
}
