import * as Phaser from 'phaser';
import { SOUL_CAST_TIME, SOUL_REAPER, SOUL_FIRE, SOUL_TREE, SOUL_MISS_PARALYZE, SOUL_THUNDER } from '@/config';
import { Fighter } from '@/gameplay/Fighter';
import { summonStrikeCount, type SkillEffect } from '@/gameplay/skills';
import { T } from '@/localization';
import { sfx } from '@/audio/sfx';
import { REAPER_SWING } from '@/rendering/effects';
import { toHex, txt } from '@/ui';
import { soulHitChance, summonHitChance } from '@/battle/combat/summonRules';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type CombatSummonsContext = Phaser.Scene & Pick<BattleScene,
  'dealDamage' | 'fighters' | 'fx' | 'lTop' | 'over'
  | 'popText' | 'reap' | 'reaperSwing' | 'screenFlash' | 'stats'
  | 'summonNoticeAt' | 'summonResult' | 'summonTally' | 'summonTargets' | 'time'
  | 'tweens'
>;

export function thunderStrike(this: CombatSummonsContext, f: Fighter, level: number): void {
  // The nearest enemies, struck one after another from closest to farthest.
  const count = summonStrikeCount('soulThunder', level, f.boss);
  const targets = this.summonTargets(f, count);
  const tally = this.summonTally(f, '⚡', 0xc9d6ff, targets.length);
  targets.forEach((t, k) => {
    this.time.delayedCall(k * SOUL_THUNDER.stagger * 1000, () => {
      if (!t.alive || t.untouchable || this.over) return tally(null);
      sfx.skyThunder();
      this.fx.skyBolt(t.x, t.y);
      this.fx.summonPulse(() => ({ x: f.x, y: f.y }), 0xffffff, 0.35);
      // Every bolt paralyses; one that hits also hurts and paralyses longer.
      // Hit chance follows soul spent, with a small boss-only bonus.
      if (Math.random() >= summonHitChance(soulHitChance(SOUL_THUNDER.hitChance, level), f.boss)) {
        this.summonResult(t, false, 0xc9d6ff);
        t.paralyze(SOUL_MISS_PARALYZE);
        return tally(false);
      }
      this.summonResult(t, true, 0xc9d6ff);
      this.dealDamage(f, t, Phaser.Math.Between(SOUL_THUNDER.minDamage, SOUL_THUNDER.maxDamage), 0, 0, 0, 0, false);
      if (t.alive) t.paralyze(SOUL_THUNDER.paralyze);
      tally(true);
    });
  });
}

/** A summon strike's verdict, big and clear over the target. */
export function summonResult(this: CombatSummonsContext, t: Fighter, hit: boolean, color: number): void {
  const label = txt(this, t.x, t.y - 52, hit ? T().summonHit : T().summonMiss, hit ? 26 : 22, hit ? toHex(color) : '#9aa0ab', {
    title: true, bold: true, origin: 0.5, stroke: '#000000', strokeThickness: 5,
  });
  this.lTop.add(label);
  label.setScale(1.6).setAlpha(0);
  this.tweens.add({ targets: label, scale: 1, alpha: 1, duration: 160, ease: 'Back.easeOut' });
  this.tweens.add({ targets: label, y: label.y - 26, alpha: 0, delay: 700, duration: 450, onComplete: () => label.destroy() });
}

/**
   * Counts a summon's strikes as they land; once all are in, shows "hit 2 / 3" over the
   * caster. Call the returned function once per target with true (hit), false (miss) or
   * null (the target was gone by then).
   */
export function summonTally(this: CombatSummonsContext, f: Fighter, icon: string, color: number, total: number): (hit: boolean | null) => void {
  let done = 0;
  let hits = 0;
  return (hit: boolean | null) => {
    done++;
    if (hit) hits++;
    if (done < total || !f.alive) return;
    const msg = txt(this, f.x, f.y - 44, `${icon} ${T().summonTally(hits, total)}`, 18, hits > 0 ? toHex(color) : '#9aa0ab', {
      bold: true, origin: 0.5, stroke: '#000000', strokeThickness: 4,
    });
    this.lTop.add(msg);
    this.tweens.add({ targets: msg, y: msg.y - 30, alpha: 0, delay: 900, duration: 500, onComplete: () => msg.destroy() });
  };
}

export function summonBlocked(this: CombatSummonsContext, f: Fighter, reason: 'soul' | 'target'): void {
  const now = this.time.now;
  if ((this.summonNoticeAt.get(f) ?? 0) > now) return;
  this.summonNoticeAt.set(f, now + 700);
  this.popText(f.x, f.y - 40, reason === 'soul' ? T().needSoul : T().noTarget, reason === 'soul' ? '#c9a6ff' : '#9aa0ab');
}

export function hasSummonTarget(this: CombatSummonsContext, f: Fighter): boolean {
  return this.summonTargets(f, 1).length > 0;
}

export function sacrifice(this: CombatSummonsContext, f: Fighter, e: Extract<SkillEffect, { kind: 'sacrifice' }>): void {
  sfx.sacrifice();
  this.fx.sacrificeBlast(f.x, f.y, e.radius);
  this.screenFlash(0xff2a2a, 0.2);
  for (const t of this.fighters) {
    if (!t.alive || !f.isEnemy(t) || t.untouchable) continue;
    const dx = t.x - f.x;
    const dy = t.y - f.y;
    const d = Math.hypot(dx, dy);
    if (d > e.radius + t.radius) continue;
    this.dealDamage(f, t, e.hpCost * 2, dx / (d || 1), dy / (d || 1), e.knockback, 0.35);
  }
}

export function holyFireStrike(this: CombatSummonsContext, f: Fighter, level: number): void {
  const count = summonStrikeCount('soulFire', level, f.boss);
  const targets = this.summonTargets(f, count);
  const tally = this.summonTally(f, '🔥', 0xffd27a, targets.length);
  targets.forEach((t, k) => {
    this.time.delayedCall(k * SOUL_FIRE.stagger * 1000, () => {
      if (!t.alive || t.untouchable || this.over) return tally(null);
      sfx.holyFire();
      this.fx.holyFlame(t.x, t.y);
      this.fx.summonPulse(() => ({ x: f.x, y: f.y }), 0xffc04a, 0.15);
      if (Math.random() >= summonHitChance(soulHitChance(SOUL_FIRE.hitChance, level), f.boss)) {
        this.summonResult(t, false, 0xffd27a);
        t.paralyze(SOUL_MISS_PARALYZE);
        return tally(false);
      }
      this.summonResult(t, true, 0xffd27a);
      this.dealDamage(f, t, Phaser.Math.Between(SOUL_FIRE.minDamage, SOUL_FIRE.maxDamage), 0, 0, 0, 0, false);
      if (t.alive) t.paralyze(SOUL_FIRE.paralyze);
      tally(true);
    });
  });
}

export function treeStrike(this: CombatSummonsContext, f: Fighter, level: number): void {
  const count = summonStrikeCount('soulTree', level, f.boss);
  const targets = this.summonTargets(f, count);
  const tally = this.summonTally(f, '🌳', 0x9fe89a, targets.length);
  targets.forEach((t, k) => {
    this.time.delayedCall(k * SOUL_TREE.stagger * 1000, () => {
      if (!t.alive || t.untouchable || this.over) return tally(null);
      sfx.sacredTree();
      this.fx.treeRoots(t.x, t.y);
      if (Math.random() >= summonHitChance(SOUL_TREE.hitChance, f.boss)) {
        this.summonResult(t, false, 0x9fe89a);
        t.paralyze(SOUL_MISS_PARALYZE);
        return tally(false);
      }
      this.summonResult(t, true, 0x9fe89a);
      this.dealDamage(f, t, SOUL_TREE.damage, 0, 0, 0, 0, false);
      if (t.alive) t.paralyze(SOUL_TREE.paralyze);
      tally(true);
    });
  });
  this.fx.summonPulse(() => ({ x: f.x, y: f.y }), 0x6adf7a, 0.15);
}

export function reaperStrike(this: CombatSummonsContext, f: Fighter, level: number): void {
  const count = summonStrikeCount('soulReaper', level, f.boss);
  const targets = this.summonTargets(f, count);
  const tally = this.summonTally(f, '☠', 0xc9a6ff, targets.length);
  targets.forEach((t, k) => {
    this.time.delayedCall(k * SOUL_REAPER.stagger * 1000, () => {
      if (!t.alive || t.untouchable || this.over) return tally(null);
      // The reaper rises behind them; whether he catches them is decided now and shown in the effect.
      const hit = Math.random() < summonHitChance(soulHitChance(SOUL_REAPER.hitChance, level), f.boss);
      sfx.reaper();
      this.fx.reaperCatch(() => ({ x: t.x, y: t.y }), hit);
      this.fx.summonPulse(() => ({ x: f.x, y: f.y }), 0x5a1a8a, 0.3);
      this.time.delayedCall(REAPER_SWING * 1000, () => tally(this.reaperSwing(f, t, hit)));
    });
  });
}

/** The reaper's scythe lands: a miss just stuns; a hit is a crushing blow, often fatal. */
export function reaperSwing(this: CombatSummonsContext, f: Fighter, t: Fighter, hit: boolean): boolean | null {
  if (!t.alive || this.over) return null;
  sfx.scythe();
  if (!hit) {
    this.summonResult(t, false, 0xc9a6ff);
    t.paralyze(SOUL_MISS_PARALYZE);
    return false;
  }
  // Caught. Substitution can still step aside; damage reduction cannot.
  this.summonResult(t, true, 0xff6a8a);
  this.fx.summonPulse(() => ({ x: f.x, y: f.y }), 0xff2a4a, 0.3);
  if (!this.reap(f, t)) return false;
  if (t.alive) {
    t.paralyze(SOUL_REAPER.paralyze);
    return true;
  }
  this.popText(t.x, t.y - 36, T().reaperKill, '#ff4a6a');
  this.fx.summonPulse(() => ({ x: f.x, y: f.y }), 0xff2a4a, 0.4);
  sfx.deathGong();
  // A big 死 stamped over the fallen.
  const stamp = txt(this, t.x, t.y, T().deathStamp, 72, '#ff3a5a', { title: true, bold: true, origin: 0.5, stroke: '#1a0008', strokeThickness: 8 });
  this.lTop.add(stamp);
  stamp.setScale(2.2).setAlpha(0);
  this.tweens.add({ targets: stamp, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
  this.tweens.add({ targets: stamp, alpha: 0, delay: 1000, duration: 500, onComplete: () => stamp.destroy() });
  return true;
}

/** Reaper hit: protection does not reduce it. Under 80 HP dies; otherwise left at 20. */
export function reap(this: CombatSummonsContext, from: Fighter | undefined, target: Fighter): boolean {
  const before = target.hp;
  const taken = target.stats.taken;
  if (!target.sufferReaper()) return false;
  this.fx.hitSpark(target.x, target.y, from?.color ?? 0xff4a6a);
  if (!from) return true;
  this.stats[from.index].dealt += target.stats.taken - taken;
  if (before > 0 && !target.alive) this.stats[from.index].kos++;
  return true;
}

// ---------- summoning effects ----------
export function summonColor(this: CombatSummonsContext, f: Fighter): 11037439 | 16756794 | 7004026 | 9417983 {
  const kind = f.summoning?.kind;
  return kind === 'soulReaper' ? 0xa86aff : kind === 'soulFire' ? 0xffb03a : kind === 'soulTree' ? 0x6adf7a : 0x8fb4ff;
}

/** The nearest enemies a summon would hit right now (they get target marks while it's called). */
export function summonTargets(this: CombatSummonsContext, f: Fighter, count: number): Fighter[] {
  return this.fighters
    .filter((t) => t.alive && f.isEnemy(t) && !t.untouchable)
    .sort((a, b) => f.distTo(a) - f.distTo(b))
    .slice(0, count);
}

export function onSummonStart(this: CombatSummonsContext, f: Fighter): void {
  const s = f.summoning!;
  sfx.summonCharge(s.kind, SOUL_CAST_TIME);
  // The caster's circular lighting is drawn by Fx.summonCircle during the call.
}
