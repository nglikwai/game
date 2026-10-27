import * as Phaser from 'phaser';
import { QUEST } from '@/config';
import { Fighter } from '@/gameplay/Fighter';
import { sfx } from '@/audio/sfx';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type CombatProjectilesContext = Phaser.Scene & Pick<BattleScene,
  'dragonBlast' | 'arenaRect' | 'bouncers' | 'caltrops' | 'chests' | 'countdown'
  | 'damageTower' | 'dealDamage' | 'explodeKeg' | 'fighters'
  | 'fx' | 'kegs' | 'over' | 'projectiles'
  | 'quest' | 'rescueGateOpen' | 'rescueGateX' | 'shotBlockers' | 'stats'
  | 'towers'
>;

export function updateProjectiles(this: CombatProjectilesContext, dt: number): void {
  for (const p of this.projectiles) {
    const e = p.effect;
    const px = p.x;
    const py = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.traveled += Math.hypot(p.vx, p.vy) * dt;
    // Off a crystal: flip whichever way it came in through, and go back to where it was.
    const crystal = p.ignoreObstacles ? undefined : this.bouncers.find((r) => Phaser.Geom.Rectangle.Contains(r, p.x, p.y));
    if (crystal) {
      if (px < crystal.x || px > crystal.right) p.vx = -p.vx;
      else p.vy = -p.vy;
      p.x = px;
      p.y = py;
      this.fx.sparks(p.x, p.y, 0x9fe8ff, 5);
      sfx.crystal();
    }
    const out = !Phaser.Geom.Rectangle.Contains(this.arenaRect, p.x, p.y);
    const sealed = this.quest?.stage === QUEST.rescueStage && !this.rescueGateOpen && p.team === 0 && p.x > this.rescueGateX;
    const wall =
      this.shotBlockers.some((r) => Phaser.Geom.Rectangle.Contains(r, p.x, p.y)) ||
      this.chests.some((c) => Math.abs(p.x - c.x) < c.w / 2 && Math.abs(p.y - c.y) < c.h / 2);
    // A dragon's shots fly through its own heads (and a wyvern's through both wyverns).
    const tower = p.ignoreObstacles ? undefined : this.towers.find((tw) => tw.alive
      && !(p.element && (tw.dragon || tw.wyvern) && tw.team === p.team)
      && !(tw.tree && !tw.grove && p.team === tw.team)
      && Phaser.Geom.Rectangle.Contains(tw.rect, p.x, p.y));
    if (tower) {
      // Enemy shots damage the tower; friendly ones just stop.
      if (tower.team !== p.team) this.damageTower(tower, e.damage * (p.owner?.role.attack ?? 1), p.owner);
      p.dead = true;
      continue;
    }
    const keg = p.ignoreObstacles ? undefined : this.kegs.find((k) => k.alive && Phaser.Geom.Rectangle.Contains(k.rect, p.x, p.y));
    if (keg) {
      this.explodeKeg(keg);
      p.dead = true;
      continue;
    }
    if (out || sealed || (wall && !p.ignoreObstacles) || p.traveled > e.range) {
      if (sealed) this.fx.sparks(this.rescueGateX, p.y, 0xd4a9ef, 4);
      p.dead = true;
      continue;
    }
    for (const t of this.fighters) {
      if (t.team === p.team || !t.alive || t.untouchable) continue;
      if (Math.hypot(t.x - p.x, t.y - p.y) > t.radius + p.radius) continue;
      const s = Math.hypot(p.vx, p.vy);
      // A dragon's shot bursts on whoever it reaches (the burst below does the damage).
      if (!p.element) this.dealDamage(p.owner, t, e.damage * (p.owner?.role.attack ?? 1), p.vx / s, p.vy / s, e.knockback, e.hitstun);
      p.dead = true;
      break;
    }
  }
  for (let i = this.projectiles.length - 1; i >= 0; i--) {
    const p = this.projectiles[i]!;
    if (!p.dead) continue;
    // A dragon's shot bursts wherever it stops: on a fighter, a stone, the wall or at the end of its range.
    if (p.element) this.dragonBlast(p);
    this.projectiles.splice(i, 1);
  }
}

export function dropCaltrops(this: CombatProjectilesContext, f: Fighter, e: { radius: number; duration: number; dps: number; slow: number }): void {
  const spikes = Array.from({ length: 26 }, () => {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * e.radius;
    return { x: f.x + Math.cos(a) * r, y: f.y + Math.sin(a) * r, a: Math.random() * Math.PI };
  });
  this.caltrops.push({ x: f.x, y: f.y, r: e.radius, t: 0, life: e.duration, team: f.team, owner: f, dps: e.dps, slow: e.slow, spikes, tick: 0 });
}

/** Damage ticks every half second for enemies standing in caltrops. */
export function updateCaltrops(this: CombatProjectilesContext, dt: number): void {
  if (this.countdown > 0 || this.over) return;
  for (const c of this.caltrops) {
    c.t += dt;
    c.tick += dt;
    if (c.tick < 0.5) continue;
    c.tick -= 0.5;
    for (const f of this.fighters) {
      if (!f.alive || f.team === c.team || Math.hypot(f.x - c.x, f.y - c.y) >= c.r) continue;
      const before = f.hp;
      const taken = f.stats.taken;
      f.takeChip(c.dps * 0.5);
      const actual = f.stats.taken - taken;
      c.owner.addSoul(actual);
      this.stats[c.owner.index].dealt += actual;
      if (before > 0 && !f.alive) this.stats[c.owner.index].kos++;
    }
  }
  this.caltrops = this.caltrops.filter((c) => c.t < c.life);
}
