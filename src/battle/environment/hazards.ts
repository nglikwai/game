import * as Phaser from 'phaser';
import { sfx } from '@/sfx';
import { C } from '@/ui';
import { toWorld, toWorldRect, ARENA } from '@/battle/coordinates';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type EnvironmentHazardsContext = Phaser.Scene & Pick<BattleScene,
  'boulders' | 'countdown' | 'dealDamage' | 'elapsedFight' | 'fightStart'
  | 'fighters' | 'flameMarks' | 'flamePatches' | 'flameT' | 'fx'
  | 'g' | 'gGlow' | 'gOver' | 'ignite' | 'map'
  | 'portalLock' | 'rollT' | 'rollWarn' | 'screenFlash' | 'spikeState'
  | 'spikeTick' | 'stormMarks' | 'stormT' | 'time' | 'ventMarks'
  | 'ventT' | 'zoneAt'
>;

// ---------- weather ----------

/** Lightning storm: mark a few spots (one near a random fighter), strike them a moment later. */
export function updateStorm(this: EnvironmentHazardsContext, dt: number): void {
  const L = this.map.lightning;
  if (!L) return;
  this.stormT -= dt;
  if (this.stormT <= 0) {
    this.stormT = L.interval;
    const alive = this.fighters.filter((f) => f.alive);
    for (let k = 0; k < L.strikes; k++) {
      const near = k === 0 && alive.length > 0 ? alive[Math.floor(Math.random() * alive.length)] : null;
      const x = near ? near.x + (Math.random() - 0.5) * 120 : ARENA.x + 40 + Math.random() * (ARENA.w - 80);
      const y = near ? near.y + (Math.random() - 0.5) * 120 : ARENA.y + 40 + Math.random() * (ARENA.h - 80);
      this.stormMarks.push({ x: Phaser.Math.Clamp(x, ARENA.x + 20, ARENA.x + ARENA.w - 20), y: Phaser.Math.Clamp(y, ARENA.y + 20, ARENA.y + ARENA.h - 20), t: 0 });
    }
    sfx.thunder();
  }
  for (const m of this.stormMarks) {
    m.t += dt;
    if (m.t < L.warn) continue;
    sfx.skyThunder();
    this.fx.skyBolt(m.x, m.y);
    this.screenFlash(0xffffff, 0.2);
    for (const f of this.fighters) {
      if (!f.alive || f.untouchable) continue;
      const dx = f.x - m.x;
      const dy = f.y - m.y;
      const d = Math.hypot(dx, dy);
      if (d < L.radius + f.radius) this.dealDamage(undefined, f, L.damage, dx / (d || 1), dy / (d || 1), 320, 0.4);
    }
  }
  this.stormMarks = this.stormMarks.filter((m) => m.t < L.warn);
}

/** Fire vents: pick a few, mark them, then they erupt and burn anyone standing on them. */
export function updateVents(this: EnvironmentHazardsContext, dt: number): void {
  const V = this.map.vents;
  if (!V) return;
  this.ventT -= dt;
  if (this.ventT <= 0) {
    this.ventT = V.interval;
    const spots = [...V.spots].sort(() => Math.random() - 0.5).slice(0, V.count);
    for (const s of spots) this.ventMarks.push({ ...toWorld(s), t: 0 });
    sfx.rumble();
  }
  for (const m of this.ventMarks) {
    m.t += dt;
    if (m.t < V.warn) continue;
    sfx.eruption();
    this.fx.eruption(m.x, m.y, V.radius);
    for (const f of this.fighters) {
      if (!f.alive || f.untouchable) continue;
      const dx = f.x - m.x;
      const dy = f.y - m.y;
      const d = Math.hypot(dx, dy);
      if (d < V.radius + f.radius) this.dealDamage(undefined, f, V.damage, dx / (d || 1), dy / (d || 1), 380, 0.35);
    }
    this.ignite(m.x, m.y, V.radius, 3.4, 14);
  }
  this.ventMarks = this.ventMarks.filter((m) => m.t < V.warn);
}

/** Leave a patch of fire. A fresh burst on the same spot keeps the old one burning. */
export function ignite(this: EnvironmentHazardsContext, x: number, y: number, r: number, life: number, dps: number): void {
  const existing = this.flamePatches.find((p) => Math.hypot(p.x - x, p.y - y) < 24);
  if (existing) {
    existing.t = 0;
    existing.life = life;
    existing.r = Math.max(existing.r, r);
    existing.dps = Math.max(existing.dps, dps);
    return;
  }
  this.flamePatches.push({ x, y, r, t: 0, life, dps, tick: 0 });
}

/** Braziers mark a spot, burst, and leave fire that burns anyone standing in it. */
export function updateFlames(this: EnvironmentHazardsContext, dt: number): void {
  const F = this.map.flames;
  if (F) {
    this.flameT -= dt;
    if (this.flameT <= 0) {
      this.flameT = F.interval;
      const busy = [...this.flameMarks, ...this.flamePatches];
      const free = F.spots.filter((s) => {
        const p = toWorld(s);
        return !busy.some((b) => Math.hypot(b.x - p.x, b.y - p.y) < 24);
      });
      const spots = [...(free.length ? free : F.spots)].sort(() => Math.random() - 0.5).slice(0, F.count);
      for (const s of spots) this.flameMarks.push({ ...toWorld(s), r: F.radius, dps: F.dps, life: F.life, t: 0 });
      if (spots.length) sfx.rumble();
    }
  }
  const warn = F?.warn ?? 1.2;
  for (const m of this.flameMarks) {
    m.t += dt;
    if (m.t < warn) continue;
    sfx.eruption();
    this.fx.eruption(m.x, m.y, m.r);
    this.ignite(m.x, m.y, m.r, m.life, m.dps);
  }
  this.flameMarks = this.flameMarks.filter((m) => m.t < warn);
  for (const p of this.flamePatches) {
    p.t += dt;
    p.tick += dt;
    if (p.tick < 0.5) continue;
    p.tick -= 0.5;
    for (const f of this.fighters) {
      if (!f.alive || f.untouchable || f.trapped) continue;
      if (Math.hypot(f.x - p.x, f.y - p.y) >= p.r) continue;
      f.takeChip(p.dps * 0.5);
    }
  }
  this.flamePatches = this.flamePatches.filter((p) => p.t < p.life);
}

export function renderFlames(this: EnvironmentHazardsContext, now: number): void {
  const warn = this.map.flames?.warn ?? 1.2;
  for (const m of this.flameMarks) {
    const k = Math.min(1, m.t / warn);
    const pulse = 0.5 + 0.5 * Math.sin(now * (12 + k * 28));
    this.g.fillStyle(0xff5a1a, 0.1 + 0.24 * k).fillCircle(m.x, m.y, m.r * (0.4 + 0.6 * k));
    this.g.lineStyle(3, 0xffb03a, 0.4 + 0.5 * pulse).strokeCircle(m.x, m.y, m.r);
    if (Math.random() < 0.3) this.fx.ember(m.x + (Math.random() - 0.5) * 20, m.y + (Math.random() - 0.5) * 20);
  }
  for (const p of this.flamePatches) {
    const fade = Math.max(0.35, 1 - p.t / p.life);
    const flick = 0.8 + 0.2 * Math.sin(now * 9 + p.x);
    this.g.fillStyle(0x2a1006, 0.5 * fade).fillCircle(p.x, p.y, p.r);
    this.gGlow.fillStyle(0xff6a1a, 0.28 * flick).fillCircle(p.x, p.y, p.r * 0.9);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + now * 0.4;
      const px = p.x + Math.cos(a) * p.r * 0.42;
      const py = p.y + Math.sin(a) * p.r * 0.42;
      const h = (12 + 10 * Math.sin(now * 8 + k)) * flick;
      const sway = Math.sin(now * 6 + k) * 3;
      this.g.fillStyle(k % 2 ? 0xffe08a : 0xff6a1a, 0.85 * fade).fillTriangle(px - 6, py, px + 6, py, px + sway, py - h);
    }
  }
}

export function renderVents(this: EnvironmentHazardsContext, now: number): void {
  const V = this.map.vents;
  if (!V) return;
  // Every vent smoulders; the ones about to blow glow brighter and shake out sparks.
  for (const s of V.spots) {
    const p = toWorld(s);
    const flick = 0.5 + 0.5 * Math.sin(now * 5 + p.x);
    this.gGlow.fillStyle(0xff6a1a, 0.12 + 0.08 * flick).fillCircle(p.x, p.y, 16);
  }
  for (const m of this.ventMarks) {
    const k = m.t / V.warn;
    const pulse = 0.5 + 0.5 * Math.sin(now * (12 + k * 30));
    this.g.fillStyle(0xff5a1a, 0.12 + 0.28 * k).fillCircle(m.x, m.y, V.radius * k);
    this.g.lineStyle(3, 0xffb03a, 0.4 + 0.5 * pulse).strokeCircle(m.x, m.y, V.radius);
    if (Math.random() < 0.3) this.fx.ember(m.x + (Math.random() - 0.5) * 20, m.y + (Math.random() - 0.5) * 20);
  }
}

/** Portals: step into one, come out of its partner (once you step off, you can use it again). */
export function updatePortals(this: EnvironmentHazardsContext): void {
  const P = this.map.portals;
  if (!P) return;
  const R = 24;
  for (const f of this.fighters) {
    if (!f.alive) continue;
    const lock = this.portalLock.get(f);
    if (lock) {
      if (Math.hypot(f.x - lock.x, f.y - lock.y) > R + f.radius + 6) this.portalLock.delete(f);
      continue;
    }
    for (const pair of P) {
      const a = toWorld(pair.a);
      const b = toWorld(pair.b);
      const from = Math.hypot(f.x - a.x, f.y - a.y) < R ? a : Math.hypot(f.x - b.x, f.y - b.y) < R ? b : null;
      if (!from) continue;
      const to = from === a ? b : a;
      this.fx.portalBurst(from.x, from.y, pair.color);
      f.warp(to.x, to.y);
      this.fx.portalBurst(to.x, to.y, pair.color);
      this.portalLock.set(f, to);
      sfx.portal();
      break;
    }
  }
}

export function renderPortals(this: EnvironmentHazardsContext, now: number): void {
  for (const pair of this.map.portals ?? []) {
    for (const [k, s] of [pair.a, pair.b].entries()) {
      const p = toWorld(s);
      const spin = now * (k ? -2 : 2);
      this.g.fillStyle(0x000000, 0.4).fillCircle(p.x, p.y, 26);
      this.gGlow.fillStyle(pair.color, 0.25).fillCircle(p.x, p.y, 24);
      for (let r = 0; r < 3; r++) {
        const rr = 8 + r * 7;
        this.gGlow.lineStyle(2.5, pair.color, 0.8 - r * 0.2);
        this.gGlow.beginPath();
        this.gGlow.arc(p.x, p.y, rr, spin + r, spin + r + Math.PI * 1.3);
        this.gGlow.strokePath();
      }
    }
  }
}

/** Rolling boulders: warn which lane, then one rolls all the way across, flattening anyone in the way. */
export function updateRollers(this: EnvironmentHazardsContext, dt: number): void {
  const R = this.map.rollers;
  if (!R) return;
  this.rollT -= dt;
  if (this.rollT <= 0 && !this.rollWarn) {
    this.rollT = R.interval;
    const lane = R.lanes[Math.floor(Math.random() * R.lanes.length)];
    this.rollWarn = { y: toWorld({ x: 0, y: lane }).y, dir: Math.random() < 0.5 ? 1 : -1, t: 0 };
    sfx.rumble();
  }
  if (this.rollWarn) {
    this.rollWarn.t += dt;
    if (this.rollWarn.t >= R.warn) {
      const w = this.rollWarn;
      this.boulders.push({ x: w.dir > 0 ? ARENA.x - R.radius : ARENA.x + ARENA.w + R.radius, y: w.y, dir: w.dir, spin: 0, hit: new Set() });
      this.rollWarn = null;
      sfx.boulder();
    }
  }
  for (const b of this.boulders) {
    b.x += b.dir * R.speed * dt;
    b.spin += (b.dir * R.speed * dt) / R.radius;
    if (Math.random() < 0.3) this.fx.smoke(b.x - b.dir * R.radius, b.y + R.radius * 0.6, 1, 0.5);
    for (const f of this.fighters) {
      if (!f.alive || f.untouchable || b.hit.has(f)) continue;
      if (Math.hypot(f.x - b.x, f.y - b.y) > R.radius + f.radius) continue;
      b.hit.add(f);
      // Thrown forward and off to the side the fighter was on.
      const side = f.y < b.y ? -1 : 1;
      this.dealDamage(undefined, f, R.damage, b.dir * 0.6, side * 0.8, 560, 0.5);
    }
  }
  this.boulders = this.boulders.filter((b) => {
    const gone = b.x < ARENA.x - R.radius * 2 || b.x > ARENA.x + ARENA.w + R.radius * 2;
    if (gone) this.fx.smoke(Phaser.Math.Clamp(b.x, ARENA.x, ARENA.x + ARENA.w), b.y, 10, 1);
    return !gone;
  });
}

export function renderRollers(this: EnvironmentHazardsContext, now: number): void {
  const R = this.map.rollers;
  if (!R) return;
  const w = this.rollWarn;
  if (w) {
    // The lane lights up, with arrows racing the way the boulder will come.
    const pulse = 0.5 + 0.5 * Math.sin(now * 16);
    this.g.fillStyle(0xff5a3a, 0.08 + 0.1 * pulse).fillRect(ARENA.x, w.y - R.radius, ARENA.w, R.radius * 2);
    for (let k = 0; k < 8; k++) {
      const x = ARENA.x + (((k / 8 + now * 0.8 * w.dir) % 1) + 1) % 1 * ARENA.w;
      this.gOver.lineStyle(4, 0xffd0a0, 0.5 + 0.4 * pulse);
      this.gOver.lineBetween(x - w.dir * 14, w.y - 12, x, w.y).lineBetween(x, w.y, x - w.dir * 14, w.y + 12);
    }
  }
  for (const b of this.boulders) {
    this.g.fillStyle(0x000000, 0.35).fillEllipse(b.x + 6, b.y + R.radius * 0.7, R.radius * 2.2, R.radius * 0.9);
    this.gOver.fillStyle(0x7a6a5a, 1).fillCircle(b.x, b.y, R.radius);
    this.gOver.lineStyle(3, 0x4a3e34, 1).strokeCircle(b.x, b.y, R.radius);
    // Cracks that turn as it rolls.
    for (let k = 0; k < 3; k++) {
      const a = b.spin + (k * Math.PI * 2) / 3;
      this.gOver.lineStyle(2, 0x4a3e34, 0.9).lineBetween(b.x + Math.cos(a) * 4, b.y + Math.sin(a) * 4, b.x + Math.cos(a) * R.radius * 0.8, b.y + Math.sin(a) * R.radius * 0.8);
    }
    this.gOver.fillStyle(0xa89a88, 0.6).fillCircle(b.x - R.radius * 0.3, b.y - R.radius * 0.35, R.radius * 0.3);
  }
}

/** Which spike set is up right now (0 or 1), and whether the other is about to rise. */
export function spikeState(this: EnvironmentHazardsContext): { up: number; rising: boolean; } {
  const C = this.map.spikeCycle!;
  const t = this.elapsedFight();
  const phase = Math.floor(t / C.period);
  return { up: phase % 2, rising: t - phase * C.period > C.period - C.warn };
}

/** Seconds of fighting so far (works in every mode, unlike the respawn clock). */
export function elapsedFight(this: EnvironmentHazardsContext): number {
  return Math.max(0, this.time.now / 1000 - this.fightStart);
}

export function updateSpikes(this: EnvironmentHazardsContext, dt: number): void {
  const C = this.map.spikeCycle;
  if (!C) return;
  const { up } = this.spikeState();
  for (const f of this.fighters) {
    if (!f.alive || f.untouchable) continue;
    const z = this.zoneAt(f.x, f.y);
    if (z?.kind !== 'spikes' || z.group !== up) {
      this.spikeTick.delete(f);
      continue;
    }
    // Up spikes bite every half second you stand on them.
    const t = (this.spikeTick.get(f) ?? 0) - dt;
    if (t <= 0) {
      this.dealDamage(undefined, f, C.dps / 2, 0, 0, 0, 0.1);
      sfx.spikes();
      this.spikeTick.set(f, 0.5);
    } else this.spikeTick.set(f, t);
  }
}

export function renderSpikes(this: EnvironmentHazardsContext, now: number): void {
  const C = this.map.spikeCycle;
  if (!C) return;
  const live = this.countdown <= 0;
  const { up, rising } = live ? this.spikeState() : { up: -1, rising: false };
  for (const z of this.map.zones ?? []) {
    if (z.kind !== 'spikes') continue;
    const r = toWorldRect(z);
    const isUp = z.group === up;
    const warn = rising && !isUp && Math.floor(now * 10) % 2 === 0;
    for (let y = r.y - r.h / 2 + 10; y < r.y + r.h / 2; y += 20) {
      for (let x = r.x - r.w / 2 + 10; x < r.x + r.w / 2; x += 20) {
        if (isUp) {
          this.g.fillStyle(0xd8dce8, 1).fillTriangle(x - 5, y + 5, x + 5, y + 5, x, y - 7);
          this.g.fillStyle(0x8a90a0, 1).fillTriangle(x, y - 7, x + 5, y + 5, x + 2, y + 5);
        } else {
          this.g.fillStyle(warn ? 0xff5a3a : 0x1a1a20, warn ? 0.9 : 0.8).fillCircle(x, y, 2.5);
        }
      }
    }
  }
}
