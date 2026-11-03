import * as Phaser from 'phaser';
import { WIDTH } from '@/config';
import { T } from '@/localization';
import { sfx } from '@/audio/sfx';
import { ARENA_MID_Y as SCREEN_MID_Y } from '@/maps';
import { S, toWorld, toWorldRect } from '@/battle/coordinates';
import type { BattleScene } from '@/scenes/BattleScene';

import { RUMBLE, rumbleBlast } from '@/input/rumble';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type EnvironmentFeaturesContext = Phaser.Scene & Pick<BattleScene,
  'barrierAnnounced' | 'barrierCircle' | 'barrierTick' | 'bellT' | 'countdown'
  | 'dealDamage' | 'doors' | 'elapsedFight' | 'explodeKeg' | 'fighters'
  | 'freeSpot' | 'fx' | 'g' | 'gGlow' | 'gOver'
  | 'herbs' | 'kegs' | 'map' | 'obstacleRects' | 'physics'
  | 'popText' | 'screenFlash' | 'shotBlockers' | 'showBanner' | 'time'
  | 'updateDoors'
>;

// ---------- doors, kegs, bell, barrier, herbs ----------

/** Physical bits some maps add: sliding doors, kegs, herb spots. */
export function setupMapFeatures(this: EnvironmentFeaturesContext): void {
  const bodies = this.fighters.map((f) => f.body);
  const solid = (x: number, y: number, w: number, h: number) => {
    const body = this.physics.add.staticBody(x - w / 2, y - h / 2, w, h);
    this.physics.add.collider(bodies, body);
    return { rect: new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h), body };
  };
  for (const d of this.map.doors?.rects ?? []) {
    const r = toWorldRect(d);
    const { rect, body } = solid(r.x, r.y, r.w, r.h);
    body.enable = false;
    this.doors.push({ rect, body, group: d.group, closed: false });
  }
  this.updateDoors();
  for (const s of this.map.kegs?.spots ?? []) {
    const p = toWorld(s);
    const size = 30;
    const { rect, body } = solid(p.x, p.y, size, size);
    this.obstacleRects.push(rect);
    this.kegs.push({ x: p.x, y: p.y, size, alive: true, t: 0, rect, body });
  }
  this.herbs = (this.map.herbs?.spots ?? []).map((s) => ({ ...toWorld(s), grown: true, t: 0 }));
  this.bellT = this.map.bell?.interval ?? 0;
}

/** Doors: set 0 shut / set 1 open, swapping every period. Anyone caught in a closing door is nudged out. */
export function updateDoors(this: EnvironmentFeaturesContext): void {
  const D = this.map.doors;
  if (!D) return;
  const shutGroup = Math.floor(this.elapsedFight() / D.period) % 2;
  for (const d of this.doors) {
    const shut = d.group === shutGroup;
    if (shut === d.closed) continue;
    d.closed = shut;
    d.body.enable = shut;
    if (shut) {
      this.obstacleRects.push(d.rect);
      this.shotBlockers.push(d.rect);
      for (const f of this.fighters) {
        if (!f.alive || !Phaser.Geom.Rectangle.Overlaps(d.rect, new Phaser.Geom.Rectangle(f.x - f.radius, f.y - f.radius, f.radius * 2, f.radius * 2))) continue;
        const spot = this.freeSpot({ x: f.x, y: f.y }, []);
        f.warp(spot.x, spot.y);
      }
      sfx.door();
    } else {
      this.obstacleRects.splice(this.obstacleRects.indexOf(d.rect), 1);
      this.shotBlockers.splice(this.shotBlockers.indexOf(d.rect), 1);
    }
  }
}

export function renderDoors(this: EnvironmentFeaturesContext, now: number): void {
  const D = this.map.doors;
  if (!D) return;
  const t = this.elapsedFight();
  const closingSoon = this.countdown <= 0 && t % D.period > D.period - D.warn;
  for (const d of this.doors) {
    const r = d.rect;
    if (d.closed) {
      // A shoji panel: wooden frame, paper squares.
      this.gOver.fillStyle(0x6a4424, 1).fillRect(r.x, r.y, r.width, r.height);
      this.gOver.fillStyle(0xf2ead8, 1).fillRect(r.x + 3, r.y + 3, r.width - 6, r.height - 6);
      this.gOver.lineStyle(1.5, 0x6a4424, 1);
      for (let x = r.x + 14; x < r.right - 4; x += 14) this.gOver.lineBetween(x, r.y, x, r.bottom);
      for (let y = r.y + 14; y < r.bottom - 4; y += 14) this.gOver.lineBetween(r.x, y, r.right, y);
    } else {
      // Open: just the track, flashing red when it's about to slide shut.
      const warn = closingSoon && Math.floor(now * 10) % 2 === 0;
      this.g.lineStyle(2, warn ? 0xff5a3a : 0x4a3424, warn ? 0.9 : 0.6).strokeRect(r.x, r.y, r.width, r.height);
    }
  }
}

export function explodeKeg(this: EnvironmentFeaturesContext, k: (EnvironmentFeaturesContext['kegs'])[number]): void {
  const K = this.map.kegs;
  if (!K || !k.alive) return;
  k.alive = false;
  k.t = K.respawn;
  k.body.enable = false;
  this.obstacleRects.splice(this.obstacleRects.indexOf(k.rect), 1);
  sfx.explosion();
  this.fx.bombBlast(k.x, k.y, K.radius);
  this.screenFlash(0xffa040, 0.25);
  for (const f of this.fighters) {
    if (!f.alive || f.untouchable) continue;
    const dx = f.x - k.x;
    const dy = f.y - k.y;
    const d = Math.hypot(dx, dy);
    if (d < K.radius + f.radius) this.dealDamage(undefined, f, K.damage, dx / (d || 1), dy / (d || 1), 600, 0.45);
    // Everyone nearby feels the blast, fading with distance.
    if (f.alive) rumbleBlast(f.controller, 1 - d / (K.radius * RUMBLE.blast.reach));
  }
  // Chain reaction.
  for (const o of this.kegs) if (o.alive && Math.hypot(o.x - k.x, o.y - k.y) < K.radius * 1.3) this.time.delayedCall(160, () => this.explodeKeg(o));
}

export function updateKegs(this: EnvironmentFeaturesContext, dt: number): void {
  for (const k of this.kegs) {
    if (k.alive) continue;
    k.t -= dt;
    if (k.t > 0) continue;
    // Rolls back in once nobody's standing on the spot.
    if (this.fighters.some((f) => f.alive && Math.hypot(f.x - k.x, f.y - k.y) < k.size + f.radius)) continue;
    k.alive = true;
    k.body.enable = true;
    this.obstacleRects.push(k.rect);
    this.fx.smoke(k.x, k.y, 5, 0.6);
  }
}

export function renderKegs(this: EnvironmentFeaturesContext, now: number): void {
  for (const k of this.kegs) {
    if (!k.alive) continue;
    const r = k.size / 2;
    this.g.fillStyle(0x000000, 0.3).fillEllipse(k.x + 4, k.y + 6, k.size * 1.1, k.size * 0.6);
    this.gOver.fillStyle(0x8a1e1a, 1).fillCircle(k.x, k.y, r);
    this.gOver.lineStyle(3, 0x3a2a1a, 1).strokeCircle(k.x, k.y, r);
    this.gOver.lineStyle(2, 0x3a2a1a, 1).strokeCircle(k.x, k.y, r * 0.55);
    this.gOver.fillStyle(0xf2e6d0, 1).fillCircle(k.x, k.y, r * 0.35);
    this.gOver.fillStyle(0x1a1a1a, 1).fillCircle(k.x, k.y, r * 0.18);
    // The fuse fizzing.
    if (Math.random() < 0.3) this.gGlow.fillStyle(0xffd27a, 0.9).fillCircle(k.x + r * 0.7, k.y - r * 0.7, 2 + Math.sin(now * 30));
  }
}

/** The bell tolls: everyone near it is blasted outward, harder the closer they are. */
export function updateBell(this: EnvironmentFeaturesContext, dt: number): void {
  const B = this.map.bell;
  if (!B) return;
  this.bellT -= dt;
  if (this.bellT > 0) return;
  this.bellT = B.interval;
  const c = toWorld(B);
  sfx.bell();
  this.fx.bellWave(c.x, c.y, B.radius);
  for (const f of this.fighters) {
    if (!f.alive || f.untouchable) continue;
    const dx = f.x - c.x;
    const dy = f.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d > B.radius) continue;
    const k = 1 - d / B.radius;
    this.dealDamage(undefined, f, Math.max(3, B.damage * k), dx / (d || 1), dy / (d || 1), 500 + 700 * k, 0.4);
  }
}

export function renderBell(this: EnvironmentFeaturesContext, now: number): void {
  const B = this.map.bell;
  if (!B) return;
  const c = toWorld(B);
  if (this.countdown <= 0 && this.bellT < B.warn) {
    // The bell itself glows, without previewing its damage area.
    const k = 1 - this.bellT / B.warn;
    this.gGlow.fillStyle(0xffd27a, 0.15 + 0.25 * k * (0.5 + 0.5 * Math.sin(now * 20))).fillCircle(c.x, c.y, 40);
  }
}

/** The safe circle right now (battlefield coords). */
export function barrierCircle(this: EnvironmentFeaturesContext): { x: number; y: number; r: number; } {
  const B = this.map.barrier!;
  const t = Phaser.Math.Clamp((this.elapsedFight() - B.delay) / B.duration, 0, 1);
  const c = toWorld({ x: WIDTH / 2, y: SCREEN_MID_Y });
  return { x: c.x, y: c.y, r: (B.start + (B.end - B.start) * t) * S };
}

export function updateBarrier(this: EnvironmentFeaturesContext, dt: number): void {
  const B = this.map.barrier;
  if (!B) return;
  if (!this.barrierAnnounced && this.elapsedFight() >= B.delay) {
    this.barrierAnnounced = true;
    this.showBanner(T().barrierShrink, 0xb57bff);
    sfx.rumble();
  }
  const c = this.barrierCircle();
  for (const f of this.fighters) {
    if (!f.alive || f.untouchable || Math.hypot(f.x - c.x, f.y - c.y) < c.r) {
      this.barrierTick.delete(f);
      continue;
    }
    const t = (this.barrierTick.get(f) ?? 0) - dt;
    if (t <= 0) {
      this.dealDamage(undefined, f, B.dps / 2, 0, 0, 0, 0);
      this.barrierTick.set(f, 0.5);
    } else this.barrierTick.set(f, t);
  }
}

export function renderBarrier(this: EnvironmentFeaturesContext, now: number): void {
  if (!this.map.barrier) return;
  const c = this.barrierCircle();
  // Everything outside the circle is tinted by drawing one enormous ring around it.
  const W = 2400;
  this.gOver.lineStyle(W, 0x6a2aaa, 0.28).strokeCircle(c.x, c.y, c.r + W / 2);
  const pulse = 0.5 + 0.5 * Math.sin(now * 4);
  this.gGlow.lineStyle(4, 0xc89aff, 0.5 + 0.4 * pulse).strokeCircle(c.x, c.y, c.r);
}

export function updateHerbs(this: EnvironmentFeaturesContext, dt: number): void {
  const H = this.map.herbs;
  if (!H) return;
  for (const h of this.herbs) {
    if (!h.grown) {
      h.t -= dt;
      if (h.t <= 0) h.grown = true;
      continue;
    }
    const f = this.fighters.find((o) => o.alive && o.hp < o.maxHp && Math.hypot(o.x - h.x, o.y - h.y) < o.radius + 16);
    if (!f) continue;
    const gained = f.heal(H.heal);
    this.popText(f.x, f.y - 30, `+${Math.round(gained)}`, '#7dff8a');
    sfx.heal();
    for (let k = 0; k < 6; k++) this.fx.leaf(h.x, h.y);
    h.grown = false;
    h.t = H.regrow;
  }
}

export function renderHerbs(this: EnvironmentFeaturesContext, now: number): void {
  const H = this.map.herbs;
  if (!H) return;
  for (const h of this.herbs) {
    const k = h.grown ? 1 : 1 - h.t / H.regrow;
    const size = 4 + 10 * k;
    if (h.grown) this.gGlow.fillStyle(0x7dff8a, 0.18 + 0.1 * Math.sin(now * 3 + h.x)).fillCircle(h.x, h.y, 20);
    for (let j = 0; j < 5; j++) {
      const a = (j / 5) * Math.PI * 2 + now * 0.3;
      this.gOver.fillStyle(h.grown ? 0x4ac85a : 0x6a8a4a, 1).fillEllipse(h.x + Math.cos(a) * size * 0.5, h.y + Math.sin(a) * size * 0.5, size * 0.9, size * 0.45);
    }
    if (h.grown) this.gOver.fillStyle(0xffe08a, 1).fillCircle(h.x, h.y, 3);
  }
}
