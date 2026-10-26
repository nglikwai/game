import * as Phaser from 'phaser';
import { SOUL_FROM_HURT, QUEST } from '@/config';
import { AIController } from '@/controls';
import { Fighter } from '@/Fighter';
import { type ItemEffect } from '@/items';
import { type SkillEffect } from '@/skills';
import { shapeHits, shapeHitsRect } from '@/weapons';
import { T } from '@/i18n';
import { sfx } from '@/sfx';
import { S, ARENA } from '@/battle/coordinates';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type CombatActionsContext = Phaser.Scene & Pick<BattleScene,
  'breakWall' | 'chests' | 'damageLantern' | 'damageTower' | 'dealDamage'
  | 'deathTime' | 'explodeKeg' | 'fighters' | 'fx' | 'kegs'
  | 'lantern' | 'nightCandles' | 'obstacleRects' | 'openChest' | 'over'
  | 'popText' | 'projectiles' | 'quest' | 'questTeam' | 'respawnTimers'
  | 'screenFlash' | 'snuffCandle' | 'stats' | 'towers' | 'walls'
>;

// ---------- Arena interface ----------
export function onSwingActive(this: CombatActionsContext, f: Fighter): void {
  const w = f.weapon;
  for (const t of this.fighters) {
    if (!f.isEnemy(t) || !t.alive || t.untouchable || f.swingHits.has(t)) continue;
    if (!shapeHits(w.shape, f.x, f.y, f.facing, t.x, t.y, t.radius)) continue;
    f.swingHits.add(t);
    const dx = t.x - f.x;
    const dy = t.y - f.y;
    const d = Math.hypot(dx, dy) || 1;
    const taken = t.stats.taken;
    this.dealDamage(f, t, w.damage * f.damageMult, dx / d, dy / d, w.knockback * f.damageMult, w.hitstun);
    if (t.stats.taken > taken) this.fx.weaponImpact(w.id, t.x - dx / d * t.radius * 0.5, t.y - dy / d * t.radius * 0.5, f.facing, f.color);
    if (w.id === 'staff') {
      // The Ice Staff leaves its victim frosted.
      this.fx.frostBurst(t.x, t.y);
      sfx.iceCrack();
      t.chillT = 0.9;
    }
  }

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

  const lantern = this.lantern;
  if (lantern?.alive && f.team !== lantern.team && !f.swingHits.has(lantern) &&
    shapeHitsRect(w.shape, f.x, f.y, f.facing, lantern.x, lantern.y, lantern.w, lantern.h)) {
    f.swingHits.add(lantern);
    this.damageLantern(w.damage * f.damageMult, f);
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
  const before = to.hp;
  const taken = to.stats.taken;
  to.takeHit(dmg, dx, dy, knockback, hitstun);
  // Measure damage before any automatic revival restores the target's HP.
  const actual = to.stats.taken - taken;
  this.fx.hitSpark(to.x - dx * to.radius * 0.6, to.y - dy * to.radius * 0.6, from?.color ?? 0xffffff);
  if (!from) return; // tower arrows don't count towards anyone's stats
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
    const inside = x > ARENA.x + r && x < ARENA.x + ARENA.w - r && y > ARENA.y + r && y < ARENA.y + ARENA.h - r;
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
    const inside = x > ARENA.x + r && x < ARENA.x + ARENA.w - r && y > ARENA.y + r && y < ARENA.y + ARENA.h - r;
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
    const x = Phaser.Math.Between(ARENA.x + 40, ARENA.x + ARENA.w - 40);
    const y = Phaser.Math.Between(ARENA.y + 40, ARENA.y + ARENA.h - 40);
    const blocked =
      this.obstacleRects.some((o) => x > o.x - r && x < o.right + r && y > o.y - r && y < o.bottom + r) ||
      this.chests.some((c) => Math.abs(x - c.x) < c.w / 2 + r && Math.abs(y - c.y) < c.h / 2 + r);
    if (blocked) continue;
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
