import * as Phaser from 'phaser';
import { SOUL_FROM_HURT, QUEST } from '@/config';
import { AIController } from '@/ai/AIController';
import { Fighter } from '@/gameplay/Fighter';
import { type ItemEffect } from '@/gameplay/items';
import { type SkillEffect } from '@/gameplay/skills';
import { shapeHits, shapeHitsRect } from '@/gameplay/weapons';
import { T } from '@/localization';
import { sfx } from '@/audio/sfx';
import { rumbleCounter, rumbleHit } from '@/input/rumble';
import { S } from '@/battle/coordinates';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type CombatActionsContext = Phaser.Scene & Pick<BattleScene,
  'arenaRect' | 'expedition' | 'breakWall' | 'chests' | 'damageTower' | 'dealDamage'
  | 'deathTime' | 'explodeKeg' | 'fighters' | 'fx' | 'kegs'
  | 'lantern' | 'nightCandles' | 'obstacleRects' | 'openChest' | 'over'
  | 'popText' | 'projectiles' | 'quest' | 'questTeam' | 'respawnTimers'
  | 'screenFlash' | 'snuffCandle' | 'stats' | 'towers' | 'walls'
>;

// ---------- Arena interface ----------
export function onSwingActive(this: CombatActionsContext, f: Fighter): void {
  const w = f.weapon;
  let landed = false;
  for (const t of this.fighters) {
    if (!f.isEnemy(t) || !t.alive || t.untouchable || f.swingHits.has(t)) continue;
    if (!shapeHits(w.shape, f.x, f.y, f.facing, t.x, t.y, t.radius)) continue;
    f.swingHits.add(t);
    const dx = t.x - f.x;
    const dy = t.y - f.y;
    const d = Math.hypot(dx, dy) || 1;
    const taken = t.stats.taken;
    this.dealDamage(f, t, w.damage * f.damageMult, dx / d, dy / d, w.knockback * f.damageMult, w.hitstun);
    if (t.stats.taken > taken) {
      landed = true;
      this.fx.weaponImpact(w.id, t.x - dx / d * t.radius * 0.5, t.y - dy / d * t.radius * 0.5, f.facing, f.color);
    }
    if (w.id === 'staff') {
      // The Ice Staff leaves its victim frosted.
      this.fx.frostBurst(t.x, t.y);
      sfx.iceCrack();
      t.chillT = 0.9;
    }
  }
  // The attacker's controller kicks on a landed hit: heavier weapons kick harder and longer.
  if (landed) rumbleHit(f.controller, w.damage * f.damageMult);

  for (const k of this.kegs) {
    if (!k.alive || f.swingHits.has(k) || !shapeHitsRect(w.shape, f.x, f.y, f.facing, k.x, k.y, k.size, k.size)) continue;
    f.swingHits.add(k);
    this.explodeKeg(k);
  }

  for (const c of [...this.chests]) {
    // Quest allies leave every chest for the players. An enemy can break one a swing happens to hit.
    if (this.quest && f.controller instanceof AIController && (f.team ?? this.questTeam) === this.questTeam) break;
    if (f.swingHits.has(c) || !shapeHitsRect(w.shape, f.x, f.y, f.facing, c.x, c.y, c.w, c.h)) continue;
    f.swingHits.add(c);
    const dmg = w.damage * f.damageMult;
    c.hp -= dmg;
    c.shakeT = 0.12;
    sfx.chestHit();
    this.fx.hitSpark(c.x, c.y - 4, 0xe0b070);
    if (c.hp <= 0) this.openChest(c, f);
  }

  for (const tw of this.towers) {
    if (!tw.alive || tw.team === f.team || f.swingHits.has(tw)) continue;
    if (!shapeHitsRect(w.shape, f.x, f.y, f.facing, tw.x, tw.y, tw.w, tw.h)) continue;
    f.swingHits.add(tw);
    this.damageTower(tw, w.damage * f.damageMult, f);
  }

  if (this.quest?.stage === QUEST.nightStage && f.team === 0) {
    const hit = 40 * S;
    for (const candle of this.nightCandles) {
      if (!candle.lit || f.swingHits.has(candle)) continue;
      if (!shapeHitsRect(w.shape, f.x, f.y, f.facing, candle.x, candle.y, hit, hit)) continue;
      f.swingHits.add(candle);
      this.snuffCandle(candle);
    }
  }

  // You can only break your own team's princess out.
  for (const wall of this.walls) {
    if (wall.team !== f.team || wall.hp <= 0 || this.over || f.swingHits.has(wall)) continue;
    const o = wall.o;
    if (shapeHitsRect(w.shape, f.x, f.y, f.facing, o.x, o.y, o.w, o.h)) {
      f.swingHits.add(wall);
      const dmg = w.damage * f.damageMult;
      this.stats[f.index].wall += Math.min(wall.hp, dmg);
      wall.hp = Math.max(0, wall.hp - dmg);
      wall.lastHitter = f;
      wall.shakeT = 0.12;
      sfx.wallHit();
      this.fx.hitSpark(o.x + Phaser.Math.Between(-30, 30), o.y + Phaser.Math.Between(-30, 30), 0xd8d0c0);
      this.popText(o.x + Phaser.Math.Between(-30, 30), o.y - o.h / 2 - 10, `-${Math.round(dmg)}`, '#f2c94c');
      if (wall.hp <= 0) this.breakWall(wall);
    }
  }
}

export function spawnProjectile(this: CombatActionsContext, f: Fighter, e: Extract<ItemEffect, { kind: 'projectile' }>): void {
  const fx = Math.cos(f.facing);
  const fy = Math.sin(f.facing);
  this.projectiles.push({
    owner: f, team: f.team, effect: e, dead: false, traveled: 0, radius: e.radius,
    x: f.x + fx * (f.radius + e.radius + 2),
    y: f.y + fy * (f.radius + e.radius + 2),
    vx: fx * e.speed,
    vy: fy * e.speed,
  });
}

export function onSkillCast(this: CombatActionsContext, f: Fighter, e: SkillEffect, mx: number, my: number): void {
  const facing = Math.hypot(mx, my) > 0.1 && e.kind === 'dash' ? Math.atan2(my, mx) : f.facing;
  this.fx.skillCast(() => ({ x: f.x, y: f.y }), e, facing);
  if (e.kind.startsWith('team')) {
    for (const ally of this.fighters) {
      if (ally !== f && ally.alive && !f.isEnemy(ally)) this.fx.skillCast(() => ({ x: ally.x, y: ally.y }), e, ally.facing);
    }
  }
}

// ---------- internals ----------

/** Apply a hit and record it in the round stats. */
export function dealDamage(this: CombatActionsContext, from: Fighter | undefined, to: Fighter, dmg: number, dx: number, dy: number, knockback: number, hitstun: number, soulGain = true): void {
  if (to.trapped) return;
  if (to.countering && to.alive && !to.untouchable && to.counterSpec) {
    // 見切: the hit is blocked outright, and an attacker in reach is struck back.
    const spec = to.counterSpec;
    to.endCounter();
    rumbleCounter(to.controller);
    sfx.guard();
    this.fx.counterFlash(to.x, to.y);
    this.popText(to.x, to.y - 34, T().countered, '#cfe3ff');
    if (from && from !== to && from.alive && Math.hypot(from.x - to.x, from.y - to.y) <= spec.reach + from.radius) {
      const d = Math.hypot(from.x - to.x, from.y - to.y) || 1;
      to.facing = Math.atan2(from.y - to.y, from.x - to.x);
      this.dealDamage(to, from, spec.damage * to.role.attack, (from.x - to.x) / d, (from.y - to.y) / d, spec.knockback, spec.stun);
    }
    return;
  }
  const before = to.hp;
  const taken = to.stats.taken;
  to.takeHit(dmg, dx, dy, knockback, hitstun);
  // Measure damage before any automatic revival restores the target's HP.
  const actual = to.stats.taken - taken;
  this.fx.hitSpark(to.x - dx * to.radius * 0.6, to.y - dy * to.radius * 0.6, from?.color ?? 0xffffff);
  if (!from) return; // tower arrows don't count towards anyone's stats
  // 噬血: a share of the damage dealt heals the attacker.
  // 暴走 at level 4 also drinks a share of what it deals; the stronger of the two applies.
  const drink = Math.max(from.lifestealing ? from.lifestealShare : 0, from.rageLifesteal);
  if (drink > 0 && from.alive && actual > 0 && from.heal(actual * drink) > 0) this.fx.sparks(from.x, from.y - 6, 0xff4a5a, 3);
  // Hurting enemies fills your soul (lightning itself doesn't, so it can't chain); being hurt fills a little too.
  if (soulGain) {
    from.addSoul(actual);
    to.addSoul(actual * SOUL_FROM_HURT);
  }
  this.stats[from.index].dealt += actual;
  if (before > 0 && !to.alive) this.stats[from.index].kos++;
}

export function findReviveTarget(this: CombatActionsContext, f: Fighter): Fighter | null {
  return this.fighters.find((t) => t !== f && !t.alive && !f.isEnemy(t)) ?? null;
}

export function reviveSpot(this: CombatActionsContext, f: Fighter): { x: number; y: number } {
  const r = f.radius;
  const d = r * 2.4;
  // Try behind the caster first, then sweep around them.
  for (let i = 0; i < 8; i++) {
    const a = f.facing + Math.PI + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 4);
    const x = f.x + Math.cos(a) * d;
    const y = f.y + Math.sin(a) * d;
    const inside = x > this.arenaRect.x + r && x < (this.arenaRect.x + this.arenaRect.width) - r && y > this.arenaRect.y + r && y < (this.arenaRect.y + this.arenaRect.height) - r;
    const blocked = this.obstacleRects.some((o) => x > o.x - r && x < o.right + r && y > o.y - r && y < o.bottom + r);
    const crowded = this.fighters.some((o) => o.alive && Math.hypot(o.x - x, o.y - y) < r * 2);
    if (inside && !blocked && !crowded) return { x, y };
  }
  return { x: f.x, y: f.y };
}

export function onSubstitute(this: CombatActionsContext, f: Fighter, dirx: number, diry: number): void {
  // Leave a log (and smoke) where we were, reappear ~100px away from the attacker.
  const from = { x: f.x, y: f.y };
  const base = Math.atan2(diry, dirx);
  let spot = from;
  for (let i = 0; i < 8; i++) {
    const a = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 5);
    const x = from.x + Math.cos(a) * 100;
    const y = from.y + Math.sin(a) * 100;
    const r = f.radius;
    const inside = x > this.arenaRect.x + r && x < (this.arenaRect.x + this.arenaRect.width) - r && y > this.arenaRect.y + r && y < (this.arenaRect.y + this.arenaRect.height) - r;
    const blocked = this.obstacleRects.some((o) => x > o.x - r && x < o.right + r && y > o.y - r && y < o.bottom + r);
    if (inside && !blocked) {
      spot = { x, y };
      break;
    }
  }
  f.body.reset(spot.x - f.radius, spot.y - f.radius);
  this.fx.smoke(from.x, from.y, 16, 1.1);
  this.fx.smoke(spot.x, spot.y, 10, 0.8);
  this.fx.substituteLog(from.x, from.y);
  this.popText(from.x, from.y - 26, T().substituted, '#d9c9a0');
}

export function teleportSafe(this: CombatActionsContext, f: Fighter): void {
  const enemies = this.fighters.filter((o) => o.alive && f.isEnemy(o));
  const r = f.radius;
  let best: { x: number; y: number } | null = null;
  let bestScore = -1;
  for (let k = 0; k < 60; k++) {
    const x = Phaser.Math.Between(this.expedition ? Math.max(this.arenaRect.x + 40, f.x - 500) : this.arenaRect.x + 40, this.expedition ? Math.min((this.arenaRect.x + this.arenaRect.width) - 40, f.x + 500) : (this.arenaRect.x + this.arenaRect.width) - 40);
    const y = Phaser.Math.Between(this.expedition ? Math.max(this.arenaRect.y + 40, f.y - 500) : this.arenaRect.y + 40, this.expedition ? Math.min((this.arenaRect.y + this.arenaRect.height) - 40, f.y + 500) : (this.arenaRect.y + this.arenaRect.height) - 40);
    const blocked =
      this.obstacleRects.some((o) => x > o.x - r && x < o.right + r && y > o.y - r && y < o.bottom + r) ||
      this.chests.some((c) => Math.abs(x - c.x) < c.w / 2 + r && Math.abs(y - c.y) < c.h / 2 + r);
    if (blocked || this.expedition && !(this.expedition.cleared.includes('river') && this.expedition.cleared.includes('village')) && y < 950) continue;
    // Score = distance to the nearest enemy (anywhere is fine if there are none).
    const score = enemies.length ? Math.min(...enemies.map((e) => Math.hypot(e.x - x, e.y - y))) : Math.random();
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  if (!best) return;
  this.fx.smoke(f.x, f.y, 16, 1.1);
  f.body.reset(best.x - r, best.y - r);
  this.fx.smoke(best.x, best.y, 12, 0.9);
}

/** 影步: the nearest enemy within `range` that can be seen and touched. */
export function shadowStepTarget(this: CombatActionsContext, f: Fighter, range: number): Fighter | null {
  const near = this.fighters.filter((o) => o.alive && f.isEnemy(o) && !o.untouchable && !o.trapped && !o.hidden
    && Math.hypot(o.x - f.x, o.y - f.y) <= range);
  return near.reduce<Fighter | null>((a, b) => (!a || f.distTo(b) < f.distTo(a) ? b : a), null);
}

/** 影步: reappear just behind the target (or beside them, if their back is against something), facing them. */
export function shadowStep(this: CombatActionsContext, f: Fighter, range: number): void {
  const t = shadowStepTarget.call(this, f, range);
  if (!t) return;
  const r = f.radius;
  const gap = t.radius + r + 8;
  let spot: { x: number; y: number } | null = null;
  for (let i = 0; i < 8 && !spot; i++) {
    // Straight behind first, then fanning round to either side.
    const a = t.facing + Math.PI + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 6);
    const x = t.x + Math.cos(a) * gap;
    const y = t.y + Math.sin(a) * gap;
    const inside = x > this.arenaRect.x + r && x < (this.arenaRect.x + this.arenaRect.width) - r && y > this.arenaRect.y + r && y < (this.arenaRect.y + this.arenaRect.height) - r;
    const blocked = this.obstacleRects.some((o) => x > o.x - r && x < o.right + r && y > o.y - r && y < o.bottom + r)
      || this.chests.some((c) => Math.abs(x - c.x) < c.w / 2 + r && Math.abs(y - c.y) < c.h / 2 + r);
    if (inside && !blocked) spot = { x, y };
  }
  if (!spot) return;
  this.fx.shadowStep(f.x, f.y, spot.x, spot.y, f.color);
  f.body.reset(spot.x - r, spot.y - r);
  f.facing = Math.atan2(t.y - spot.y, t.x - spot.x);
}

/** 換影: you and the nearest enemy in range trade places. */
export function swapPlaces(this: CombatActionsContext, f: Fighter, range: number): void {
  const t = shadowStepTarget.call(this, f, range);
  if (!t) return;
  const mine = { x: f.x, y: f.y };
  const theirs = { x: t.x, y: t.y };
  this.fx.swapFlash(mine.x, mine.y, theirs.x, theirs.y, f.color);
  f.warp(theirs.x, theirs.y);
  t.warp(mine.x, mine.y);
  f.facing = Math.atan2(mine.y - theirs.y, mine.x - theirs.x);
}

export function forTeam(this: CombatActionsContext, f: Fighter, apply: (t: Fighter) => void): void {
  for (const t of this.fighters) {
    if (!t.alive || t.isEnemy(f)) continue;
    apply(t);
    this.fx.sparks(t.x, t.y, 0xffd86b, 6);
  }
}

export function healTeam(this: CombatActionsContext, f: Fighter, amount: number): void {
  for (const t of this.fighters) {
    if (!t.alive || t.isEnemy(f)) continue;
    const gained = t.heal(amount);
    if (gained > 0) this.popText(t.x, t.y - 30, `+${Math.round(gained)}`, '#7dff8a');
    for (let k = 0; k < 6; k++) this.fx.leaf(t.x, t.y);
  }
}

export function onPillRevived(this: CombatActionsContext, f: Fighter): void {
  sfx.respawn();
  this.fx.smoke(f.x, f.y, 12, 1);
  this.fx.sparks(f.x, f.y, 0xff7ac0, 14);
  this.screenFlash(0xff7ac0, 0.18);
  this.popText(f.x, f.y - 40, T().pillRevived, '#ff9ad0');
}

export function onRevived(this: CombatActionsContext, target: Fighter, by?: Fighter): void {
  this.respawnTimers.delete(target);
  this.deathTime.delete(target);
  if (by) {
    this.fx.lifeline(() => ({ x: by.x, y: by.y }), () => ({ x: target.x, y: target.y }));
    this.fx.skillCast(() => ({ x: target.x, y: target.y }), { kind: 'revive' }, target.facing);
  }
}
