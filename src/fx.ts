import * as Phaser from 'phaser';
import { drawLog, drawShurikenStar, kunai } from './art';

/**
 * Short-lived visual effects: particles plus scripted effects (weapon strikes,
 * shockwaves, smoke). Drawn every frame into three layers:
 * floor (under fighters), over (normal blend) and glow (additive blend).
 */

type Layer = 'floor' | 'over' | 'glow';

interface Particle {
  kind: 'flame' | 'spark' | 'dust' | 'smoke' | 'leaf';
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  /** Fraction of velocity kept per second. */
  drag: number;
  color: number;
}

interface Effect {
  age: number;
  life: number;
  layer: Layer;
  draw(g: Phaser.GameObjects.Graphics, t: number): void;
}

/** Fire colours from hot to cool, by particle age 0 → 1. */
function flameColor(t: number) {
  if (t < 0.15) return 0xffc861;
  if (t < 0.4) return 0xff8a2a;
  if (t < 0.7) return 0xd9401f;
  return 0x6e1c10;
}

/** Seconds into 死神's visit when his scythe lands (the scene applies the hit then). */
export const REAPER_SWING = 0.55;

export class Fx {
  private particles: Particle[] = [];
  private effects: Effect[] = [];

  update(dt: number) {
    for (const p of this.particles) {
      p.age += dt;
      const keep = Math.pow(p.drag, dt);
      p.vx *= keep;
      p.vy *= keep;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'flame' || p.kind === 'smoke') p.vy -= 20 * dt; // heat rises
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (const e of this.effects) e.age += dt;
    this.effects = this.effects.filter((e) => e.age < e.life);
  }

  draw(floor: Phaser.GameObjects.Graphics, over: Phaser.GameObjects.Graphics, glow: Phaser.GameObjects.Graphics) {
    const layers = { floor, over, glow };
    for (const e of this.effects) e.draw(layers[e.layer], e.age / e.life);
    for (const p of this.particles) {
      const t = p.age / p.life;
      switch (p.kind) {
        case 'flame':
          // Additive, so keep each flame faint: overlapping ones build up to bright cores on their own.
          glow.fillStyle(flameColor(t), 0.42 * (1 - t)).fillCircle(p.x, p.y, p.size * (1 - t * 0.6));
          break;
        case 'spark':
          glow.fillStyle(p.color, 1 - t).fillCircle(p.x, p.y, p.size * (1 - t));
          break;
        case 'dust':
          over.fillStyle(p.color, 0.5 * (1 - t)).fillCircle(p.x, p.y, p.size * (0.6 + t));
          break;
        case 'smoke':
          over.fillStyle(p.color, 0.6 * (1 - t)).fillCircle(p.x, p.y, p.size * (0.5 + t * 1.2));
          break;
        case 'leaf':
          over.fillStyle(p.color, 1 - t).fillEllipse(p.x, p.y, p.size * 1.6, p.size);
          break;
      }
    }
  }

  private add(p: Omit<Particle, 'age'>) {
    this.particles.push({ ...p, age: 0 });
  }

  private effect(layer: Layer, life: number, draw: Effect['draw']) {
    this.effects.push({ age: 0, life, layer, draw });
  }

  // ---------- weapon strikes ----------

  /** 火扇: a sweep of flame across the fan-shaped hit area. */
  flameFan(x: number, y: number, facing: number, radius: number, spread: number) {
    for (let i = 0; i < 48; i++) {
      const a = facing + (Math.random() - 0.5) * spread;
      const r0 = 14 + Math.random() * 10;
      const life = 0.3 + Math.random() * 0.2;
      // Fast start with heavy drag, so the flames rush out and settle across the whole fan.
      const speed = ((radius - r0) / life) * (1.1 + Math.random() * 0.9);
      this.add({ kind: 'flame', x: x + Math.cos(a) * r0, y: y + Math.sin(a) * r0, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, size: 6 + Math.random() * 7, drag: 0.04, color: 0 });
    }
    // A bright arc sweeping across the fan.
    this.effect('glow', 0.16, (g, t) => {
      const a0 = facing - spread / 2;
      const a1 = a0 + spread * Math.min(1, t * 1.4);
      g.lineStyle(10 * (1 - t), 0xffc04a, 0.8 * (1 - t));
      g.beginPath();
      g.arc(x, y, radius * 0.75, a0, a1, false);
      g.strokePath();
    });
  }

  /** 手裡劍: a spinning star streaking down the line, sparks where it ends. */
  shurikenThrow(x: number, y: number, facing: number, from: number, to: number, color: number) {
    const c = Math.cos(facing);
    const s = Math.sin(facing);
    const life = 0.16;
    this.effect('over', life + 0.12, (g, t) => {
      const k = Math.min(1, t * ((life + 0.12) / life));
      const d = from + (to - from) * k;
      const sx = x + c * from;
      const sy = y + s * from;
      const px = x + c * d;
      const py = y + s * d;
      g.lineStyle(5, color, 0.5 * (1 - t)).lineBetween(sx, sy, px, py);
      g.lineStyle(2.5, 0xffffff, 0.9 * (1 - t)).lineBetween(sx, sy, px, py);
      if (k < 1) drawShurikenStar(g, px, py, 10, t * 40);
    });
    const ex = x + c * to;
    const ey = y + s * to;
    setTimeout(() => this.sparks(ex, ey, 0xe8ecf4, 8), life * 1000);
  }

  /** 冰棍: the staff whips through both ends, trailing frost and leaving ice crystals at the tips. */
  staffSweep(getPos: () => { x: number; y: number }, facing: number, length: number, width: number) {
    this.effect('over', 0.3, (g, t) => {
      const { x, y } = getPos();
      const a = facing + Math.PI / 2 - t * Math.PI;
      const c = Math.cos(a);
      const s = Math.sin(a);
      g.lineStyle(width * 0.5 * (1 - t), 0xbfe9ff, 0.4 * (1 - t)).lineBetween(x - c * length, y - s * length, x + c * length, y + s * length);
      g.lineStyle(2, 0xffffff, 0.7 * (1 - t)).lineBetween(x - c * length, y - s * length, x + c * length, y + s * length);
      for (const d of [1, -1]) {
        g.lineStyle(5 * (1 - t), 0x9fe0ff, 0.85 * (1 - t));
        g.beginPath();
        g.arc(x, y, length * 0.9, a - (d > 0 ? 0 : Math.PI) - 0.6, a - (d > 0 ? 0 : Math.PI), false);
        g.strokePath();
        // A snowflake riding the tip.
        this.snowflake(g, x + d * c * length * 0.92, y + d * s * length * 0.92, 7 * (1 - t * 0.5), (1 - t) * 0.9);
      }
    });
    const c = Math.cos(facing);
    const s = Math.sin(facing);
    const { x, y } = getPos();
    for (const d of [1, -1]) {
      this.sparks(x + d * c * length, y + d * s * length, 0xdff6ff, 6);
      this.frostMark(x + d * c * length * 0.8, y + d * s * length * 0.8);
    }
  }

  /** A six-armed snowflake. */
  private snowflake(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, alpha: number) {
    g.lineStyle(1.5, 0xe8fbff, alpha);
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3;
      g.lineBetween(x - Math.cos(a) * r, y - Math.sin(a) * r, x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
  }

  /** A patch of frost on the ground that melts away. */
  private frostMark(x: number, y: number) {
    this.effect('floor', 1.2, (g, t) => {
      g.fillStyle(0xcdeeff, 0.28 * (1 - t)).fillCircle(x, y, 16);
      g.lineStyle(1.5, 0xeaf9ff, 0.6 * (1 - t));
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        g.lineBetween(x + Math.cos(a) * 5, y + Math.sin(a) * 5, x + Math.cos(a) * 15, y + Math.sin(a) * 15);
      }
    });
  }

  /** 冰棍 hit: a burst of ice crystals on whoever it struck. */
  frostBurst(x: number, y: number) {
    const rot = Math.random() * Math.PI;
    this.effect('glow', 0.45, (g, t) => {
      g.lineStyle(3 * (1 - t), 0xbfe9ff, 0.9 * (1 - t)).strokeCircle(x, y, 8 + t * 26);
      for (let k = 0; k < 6; k++) {
        const a = rot + (k * Math.PI) / 3;
        this.snowflake(g, x + Math.cos(a) * (10 + t * 26), y + Math.sin(a) * (10 + t * 26), 5 * (1 - t * 0.6), 1 - t);
      }
    });
    this.sparks(x, y, 0xdff6ff, 10);
    this.frostMark(x, y);
  }

  /** 苦無: three kunai streaking out along their rays. */
  kunaiVolley(x: number, y: number, angles: number[], from: number, to: number, color: number) {
    const life = 0.18;
    this.effect('over', life + 0.12, (g, t) => {
      const k = Math.min(1, t * ((life + 0.12) / life));
      const d = from + (to - from) * k;
      for (const a of angles) {
        const c = Math.cos(a);
        const s = Math.sin(a);
        g.lineStyle(2, color, 0.45 * (1 - t)).lineBetween(x + c * from, y + s * from, x + c * d, y + s * d);
        if (k < 1) kunai(g, x + c * d, y + s * d, a, 13);
      }
    });
    setTimeout(() => {
      for (const a of angles) this.sparks(x + Math.cos(a) * to, y + Math.sin(a) * to, 0xe8ecf4, 4);
    }, life * 1000);
  }

  /** 大錘: shockwave ring, dust and cracks where the hammer lands. */
  hammerSmash(cx: number, cy: number, radius: number) {
    this.effect('glow', 0.28, (g, t) => {
      g.lineStyle(8 * (1 - t), 0xfff0c8, 0.7 * (1 - t)).strokeCircle(cx, cy, radius * (0.2 + 0.85 * t));
    });
    this.effect('over', 0.35, (g, t) => {
      g.lineStyle(3, 0x8a7a60, 0.6 * (1 - t)).strokeCircle(cx, cy, radius * (0.1 + 0.95 * t));
    });
    // Ground cracks, fading slowly.
    const cracks: { x: number; y: number }[][] = [];
    for (let i = 0; i < 7; i++) {
      let a = (i / 7) * Math.PI * 2 + Math.random() * 0.5;
      let r = 4;
      const line = [{ x: cx, y: cy }];
      while (r < radius * 0.85) {
        r += 7 + Math.random() * 6;
        a += (Math.random() - 0.5) * 0.5;
        line.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
      }
      cracks.push(line);
    }
    this.effect('floor', 1.6, (g, t) => {
      g.lineStyle(2, 0x1c1914, 0.8 * (1 - t));
      for (const line of cracks) {
        g.beginPath();
        g.moveTo(line[0].x, line[0].y);
        for (const p of line.slice(1)) g.lineTo(p.x, p.y);
        g.strokePath();
      }
    });
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 90;
      this.add({ kind: 'dust', x: cx + Math.cos(a) * 10, y: cy + Math.sin(a) * 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4, size: 4 + Math.random() * 5, drag: 0.05, color: 0x9c8f78 });
    }
  }

  /** 長槍: a straight, pointed thrust trail, fading inside the narrow hit lane. */
  spearThrust(x: number, y: number, facing: number, offset: number, length: number, width: number, color: number) {
    const c = Math.cos(facing), s = Math.sin(facing);
    const at = (f: number, side = 0) => ({ x: x + c * f - s * side, y: y + s * f + c * side });
    this.effect('glow', 0.18, (g, t) => {
      const tip = at(offset + length);
      const base = offset + length * t * 0.65;
      g.fillStyle(color, 0.3 * (1 - t)).fillPoints([
        at(base, -width * 0.45), tip, at(base, width * 0.45),
      ] as Phaser.Math.Vector2[], true);
      const start = at(base);
      g.lineStyle(3 * (1 - t), 0xfff3d4, 0.9 * (1 - t)).lineBetween(start.x, start.y, tip.x, tip.y);
      for (const side of [-1, 1]) {
        const from = at(offset + length * 0.2, side * width * 0.35);
        const to = at(offset + length * 0.8, side * width * 0.35);
        g.lineStyle(1, 0xd8e9ff, 0.5 * (1 - t)).lineBetween(from.x, from.y, to.x, to.y);
      }
    });
  }

  /** 雙匕: two crossing crescent slashes. */
  daggerSlash(x: number, y: number, facing: number, reach: number, width: number, color: number) {
    const cx = x + Math.cos(facing) * (reach * 0.55);
    const cy = y + Math.sin(facing) * (reach * 0.55);
    const r = width * 0.55;
    for (const tilt of [0.7, -0.7]) {
      this.effect('glow', 0.18, (g, t) => {
        const a = facing + tilt + Math.PI / 2;
        const sweep = 2.2 * Math.min(1, t * 2.5);
        g.lineStyle(6 * (1 - t), 0xffffff, 0.9 * (1 - t));
        g.beginPath();
        g.arc(cx - Math.cos(facing) * r * 0.5, cy - Math.sin(facing) * r * 0.5, r, a - 1.1, a - 1.1 + sweep, false);
        g.strokePath();
        g.lineStyle(2, color, 0.8 * (1 - t));
        g.beginPath();
        g.arc(cx - Math.cos(facing) * r * 0.5, cy - Math.sin(facing) * r * 0.5, r - 4, a - 1.1, a - 1.1 + sweep, false);
        g.strokePath();
      });
    }
    this.sparks(cx, cy, 0xffffff, 6);
  }

  /** 流星錘: the weight whirled once around the ninja, with a motion trail. */
  chainSpin(getPos: () => { x: number; y: number }, facing: number, inner: number, outer: number) {
    const r = (inner + outer) / 2;
    this.effect('over', 0.22, (g, t) => {
      const { x, y } = getPos();
      const a = facing + t * Math.PI * 2.2;
      g.lineStyle(outer - inner, 0xc9ced8, 0.18 * (1 - t));
      g.beginPath();
      g.arc(x, y, r, a - 1.6, a, false);
      g.strokePath();
      const wx = x + Math.cos(a) * r;
      const wy = y + Math.sin(a) * r;
      g.lineStyle(1.5, 0x9aa0ab, 1 - t * 0.5).lineBetween(x, y, wx, wy);
      g.fillStyle(0x3d424c, 1).fillCircle(wx, wy, 6);
      g.lineStyle(1.5, 0xd9ae4a, 1).strokeCircle(wx, wy, 6);
    });
  }

  /** 鎖鐮: the sickle flung out on its chain, sweeping across the curved band. */
  sickleSweep(getPos: () => { x: number; y: number }, facing: number, inner: number, outer: number, angle: number) {
    const r = (inner + outer) / 2;
    this.effect('over', 0.2, (g, t) => {
      const { x, y } = getPos();
      const a0 = facing - angle / 2;
      const a = a0 + angle * Math.min(1, t * 1.3);
      // Silver trail along the band.
      g.lineStyle(outer - inner, 0xdfe6f0, 0.22 * (1 - t));
      g.beginPath();
      g.arc(x, y, r, a0, a, false);
      g.strokePath();
      const sx = x + Math.cos(a) * r;
      const sy = y + Math.sin(a) * r;
      g.lineStyle(1.5, 0x9aa0ab, 1 - t * 0.5).lineBetween(x, y, sx, sy);
      // The sickle blade, spinning.
      const rot = a + t * 12;
      g.lineStyle(4, 0xd3d8e2, 1);
      g.beginPath();
      g.arc(sx, sy, 9, rot, rot + 2.2, false);
      g.strokePath();
      g.lineStyle(3, 0x6b3f1f, 1).lineBetween(sx, sy, sx - Math.cos(rot) * 8, sy - Math.sin(rot) * 8);
    });
    this.effect('glow', 0.2, (g, t) => {
      const { x, y } = getPos();
      const a = facing - angle / 2 + angle * Math.min(1, t * 1.3);
      g.lineStyle(3 * (1 - t), 0xffffff, 0.7 * (1 - t));
      g.beginPath();
      g.arc(x, y, outer - 4, a - 0.5, a, false);
      g.strokePath();
    });
  }

  /** 焙烙玉: the bomb bursts into a fireball with smoke and a shockwave. */
  bombBlast(cx: number, cy: number, radius: number) {
    this.effect('glow', 0.3, (g, t) => {
      g.fillStyle(0xffd27a, 0.55 * (1 - t)).fillCircle(cx, cy, radius * (0.3 + 0.7 * t));
      g.lineStyle(6 * (1 - t), 0xffb03a, 0.8 * (1 - t)).strokeCircle(cx, cy, radius * (0.4 + 0.7 * t));
    });
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * radius * 2.4;
      this.add({ kind: 'flame', x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35 + Math.random() * 0.25, size: 7 + Math.random() * 8, drag: 0.04, color: 0 });
    }
    this.smoke(cx, cy, 16, 1.3);
    this.sparks(cx, cy, 0xffd86b, 10);
    // Scorch mark left on the ground.
    this.effect('floor', 1.8, (g, t) => {
      g.fillStyle(0x1a1410, 0.4 * (1 - t)).fillCircle(cx, cy, radius * 0.7);
    });
  }

  /** 忍刀: a bright cut along the lunge. */
  lungeSlash(getPos: () => { x: number; y: number }, facing: number, length: number, width: number) {
    const start = getPos();
    this.effect('glow', 0.22, (g, t) => {
      const c = Math.cos(facing);
      const s = Math.sin(facing);
      const end = getPos();
      // Streak from where the lunge began to the sword tip.
      const tipX = end.x + c * length;
      const tipY = end.y + s * length;
      g.lineStyle(width * 0.5 * (1 - t), 0xffffff, 0.75 * (1 - t)).lineBetween(start.x, start.y, tipX, tipY);
      g.lineStyle(3 * (1 - t), 0x9fd8ff, 0.9 * (1 - t)).lineBetween(start.x - s * 6, start.y + c * 6, tipX - s * 6, tipY + c * 6);
    });
  }

  /** 雷符: lightning bolts crackling out along the four arms of the cross. */
  lightningCross(x: number, y: number, facing: number, arm: number, width: number) {
    // Pre-jagged bolts so they hold still while they fade.
    const bolts: { x: number; y: number }[][] = [];
    for (let k = 0; k < 4; k++) {
      const a = facing + (k * Math.PI) / 2;
      for (let n = 0; n < 2; n++) {
        const pts = [{ x, y }];
        for (let d = 10; d <= arm; d += 10) {
          const side = (Math.random() - 0.5) * width * 0.8;
          pts.push({ x: x + Math.cos(a) * d - Math.sin(a) * side, y: y + Math.sin(a) * d + Math.cos(a) * side });
        }
        bolts.push(pts);
      }
    }
    this.effect('glow', 0.25, (g, t) => {
      const flicker = Math.random() < 0.7 ? 1 : 0.4;
      for (const pts of bolts) {
        g.lineStyle(4 * (1 - t), 0x9fd8ff, 0.8 * (1 - t) * flicker);
        g.strokePoints(pts as Phaser.Math.Vector2[], false);
        g.lineStyle(1.5, 0xffffff, (1 - t) * flicker);
        g.strokePoints(pts as Phaser.Math.Vector2[], false);
      }
      g.fillStyle(0xdff4ff, 0.6 * (1 - t)).fillCircle(x, y, 16 * (1 - t));
    });
    for (let k = 0; k < 4; k++) {
      const a = facing + (k * Math.PI) / 2;
      this.sparks(x + Math.cos(a) * arm, y + Math.sin(a) * arm, 0x9fd8ff, 4);
    }
  }

  /** The log left behind by Substitution, fading away. */
  substituteLog(x: number, y: number) {
    const a = Math.random() * Math.PI;
    this.effect('floor', 1.6, (g, t) => drawLog(g, x, y, a, 1 - t));
  }

  /** Soul lightning: a forked bolt from the sky onto (x, y), with a flash, shockwave and scorch mark. */
  skyBolt(x: number, y: number) {
    const jag = (x0: number, y0: number, x1: number, y1: number, step: number, wobble: number) => {
      const pts = [{ x: x0, y: y0 }];
      const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
      for (let i = 1; i < n; i++) {
        const k = i / n;
        pts.push({ x: x0 + (x1 - x0) * k + (Math.random() - 0.5) * wobble, y: y0 + (y1 - y0) * k + (Math.random() - 0.5) * wobble * 0.3 });
      }
      pts.push({ x: x1, y: y1 });
      return pts;
    };
    const main = jag(x + (Math.random() - 0.5) * 80, y - 420, x, y, 22, 34);
    // A few branches splitting off the main bolt.
    const branches = [0.3, 0.5, 0.7].map((k) => {
      const p = main[Math.floor(main.length * k)];
      return jag(p.x, p.y, p.x + (Math.random() - 0.5) * 120, p.y + 40 + Math.random() * 60, 16, 20);
    });
    this.effect('glow', 0.45, (g, t) => {
      const flicker = Math.random() < 0.75 ? 1 : 0.35;
      g.lineStyle(16 * (1 - t), 0x6f8fff, 0.35 * (1 - t) * flicker).strokePoints(main as Phaser.Math.Vector2[], false);
      g.lineStyle(7 * (1 - t), 0xbfd0ff, 0.8 * (1 - t) * flicker).strokePoints(main as Phaser.Math.Vector2[], false);
      g.lineStyle(3, 0xffffff, (1 - t) * flicker).strokePoints(main as Phaser.Math.Vector2[], false);
      for (const b of branches) g.lineStyle(2, 0xdfe8ff, 0.8 * (1 - t) * flicker).strokePoints(b as Phaser.Math.Vector2[], false);
      g.fillStyle(0xffffff, 0.9 * (1 - t)).fillCircle(x, y, 18 * (1 - t * 0.5));
      g.fillStyle(0x9fb8ff, 0.35 * (1 - t)).fillCircle(x, y, 60 * (0.4 + t));
    });
    this.effect('glow', 0.4, (g, t) => g.lineStyle(6 * (1 - t), 0xdfe8ff, 0.8 * (1 - t)).strokeCircle(x, y, 20 + t * 90));
    this.effect('floor', 1.8, (g, t) => {
      g.fillStyle(0x15121a, 0.5 * (1 - t)).fillCircle(x, y, 26);
      g.lineStyle(2, 0x6f8fff, 0.5 * (1 - t));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        g.lineBetween(x + Math.cos(a) * 14, y + Math.sin(a) * 14, x + Math.cos(a) * 34, y + Math.sin(a) * 34);
      }
    });
    this.sparks(x, y, 0xb9c8ff, 16);
  }

  /**
   * The summoning circle under a caster: two counter-rotating rings, a star and rune
   * ticks, growing as the call completes (`t` 0→1). Drawn every frame by the scene.
   */
  summonCircle(floor: Phaser.GameObjects.Graphics, glow: Phaser.GameObjects.Graphics, x: number, y: number, t: number, color: number, now: number) {
    const r = 30 + 40 * Math.min(1, t * 1.5);
    const a = now * 2.2;
    floor.fillStyle(color, 0.12 + 0.12 * t).fillCircle(x, y, r);
    glow.lineStyle(3, color, 0.8).strokeCircle(x, y, r);
    glow.lineStyle(1.5, 0xffffff, 0.6).strokeCircle(x, y, r * 0.78);
    // Six-pointed star inside.
    for (const off of [0, Math.PI / 3]) {
      const pts = [0, 1, 2].map((k) => ({ x: x + Math.cos(-a + off + (k * Math.PI * 2) / 3) * r * 0.75, y: y + Math.sin(-a + off + (k * Math.PI * 2) / 3) * r * 0.75 }));
      glow.lineStyle(2, color, 0.75).strokePoints(pts as Phaser.Math.Vector2[], true);
    }
    // Rune ticks around the outer ring.
    for (let k = 0; k < 12; k++) {
      const ang = a + (k / 12) * Math.PI * 2;
      glow.lineStyle(3, 0xffffff, 0.7).lineBetween(x + Math.cos(ang) * r, y + Math.sin(ang) * r, x + Math.cos(ang) * (r + 7), y + Math.sin(ang) * (r + 7));
    }
    // Sparks spiralling up.
    if (Math.random() < 0.6) {
      const ang = Math.random() * Math.PI * 2;
      this.particles.push({ kind: 'spark', x: x + Math.cos(ang) * r, y: y + Math.sin(ang) * r, vx: -Math.sin(ang) * 40, vy: -60, age: 0, life: 0.5, size: 2.5, drag: 0.5, color });
    }
  }

  /** A target mark that tightens as the summon completes (`t` 0→1). */
  targetMark(g: Phaser.GameObjects.Graphics, x: number, y: number, t: number, color: number, now: number) {
    const r = 46 - 22 * t;
    g.lineStyle(2.5, color, 0.6 + 0.4 * Math.sin(now * 14));
    g.strokeCircle(x, y, r);
    for (let k = 0; k < 4; k++) {
      const ang = now * 3 + (k * Math.PI) / 2;
      g.lineBetween(x + Math.cos(ang) * (r - 8), y + Math.sin(ang) * (r - 8), x + Math.cos(ang) * (r + 8), y + Math.sin(ang) * (r + 8));
    }
  }

  /** 捨身: a blood-red shockwave bursting out to `radius`, with a flash at the centre. */
  sacrificeBlast(x: number, y: number, radius: number) {
    this.effect('glow', 0.5, (g, t) => {
      const r = radius * Math.min(1, t * 2.2);
      g.fillStyle(0xff3a3a, 0.28 * (1 - t)).fillCircle(x, y, r);
      g.lineStyle(10 * (1 - t), 0xff5a4a, 0.85 * (1 - t)).strokeCircle(x, y, r);
      g.lineStyle(3, 0xffd0c0, 0.9 * (1 - t)).strokeCircle(x, y, r * 0.92);
      g.fillStyle(0xffffff, 0.8 * Math.max(0, 1 - t * 4)).fillCircle(x, y, 30);
    });
    this.effect('floor', 1.2, (g, t) => {
      g.lineStyle(2, 0x8a1020, 0.6 * (1 - t)).strokeCircle(x, y, radius);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        g.lineBetween(x + Math.cos(a) * 20, y + Math.sin(a) * 20, x + Math.cos(a) * radius * 0.8, y + Math.sin(a) * radius * 0.8);
      }
    });
    this.sparks(x, y, 0xff6a5a, 22);
  }

  /** 神樹: thick roots whip up out of the ground around (x, y) and coil, shedding leaves. */
  treeRoots(x: number, y: number) {
    const roots = Array.from({ length: 6 }, (_, k) => ({ a: (k / 6) * Math.PI * 2 + Math.random() * 0.5, len: 26 + Math.random() * 16, bend: (Math.random() - 0.5) * 1.4 }));
    this.effect('over', 0.7, (g, t) => {
      const grow = Math.min(1, t * 3.5);
      const fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      for (const r of roots) {
        const pts = [0, 0.33, 0.66, 1].map((k) => {
          const a = r.a + r.bend * k;
          const d = r.len * grow * k;
          return { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d };
        });
        g.lineStyle(7, 0x3a2614, 0.9 * fade).strokePoints(pts as Phaser.Math.Vector2[], false);
        g.lineStyle(3, 0x6f9a3a, 0.9 * fade).strokePoints(pts as Phaser.Math.Vector2[], false);
      }
    });
    this.effect('glow', 0.6, (g, t) => {
      g.fillStyle(0x7ae08a, 0.35 * (1 - t)).fillCircle(x, y, 20 + t * 34);
      g.lineStyle(4 * (1 - t), 0xbff5b8, 0.8 * (1 - t)).strokeCircle(x, y, 14 + t * 56);
    });
    for (let i = 0; i < 5; i++) this.leaf(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 30);
    this.sparks(x, y, 0x9fe89a, 8);
  }

  /** 聖火: a column of golden flame falling onto (x, y), leaving a burning ring. */
  holyFlame(x: number, y: number) {
    this.effect('glow', 0.55, (g, t) => {
      const drop = Math.min(1, t * 3);
      const top = y - 260 * (1 - drop);
      g.fillStyle(0xffb03a, 0.35 * (1 - t)).fillRect(x - 14, top - 120, 28, y - top + 120);
      g.fillStyle(0xfff0b0, 0.8 * (1 - t)).fillRect(x - 5, top - 90, 10, y - top + 90);
      g.fillStyle(0xffd27a, 0.7 * (1 - t)).fillCircle(x, y, 26 * (0.5 + t));
    });
    this.effect('glow', 0.5, (g, t) => g.lineStyle(5 * (1 - t), 0xffc04a, 0.8 * (1 - t)).strokeCircle(x, y, 16 + t * 60));
    this.effect('floor', 1.4, (g, t) => {
      g.lineStyle(3, 0xff8a2a, 0.6 * (1 - t)).strokeCircle(x, y, 24);
      g.fillStyle(0x2a1408, 0.35 * (1 - t)).fillCircle(x, y, 22);
    });
    for (let i = 0; i < 6; i++) this.ember(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 20);
    this.sparks(x, y, 0xffd27a, 10);
  }

  /** The great bell tolling: golden shockwave rings rolling out to `radius`. */
  bellWave(x: number, y: number, radius: number) {
    for (const [delay, w] of [[0, 10], [0.12, 6], [0.24, 3]] as const) {
      this.effect('glow', 0.6 + delay, (g, t) => {
        const k = Math.max(0, (t * (0.6 + delay) - delay) / 0.6);
        if (k <= 0) return;
        g.lineStyle(w * (1 - k), 0xffd27a, 0.8 * (1 - k)).strokeCircle(x, y, 30 + (radius - 30) * k);
      });
    }
    this.sparks(x, y, 0xffd27a, 12);
  }

  /** A fire vent blowing: a column of flame, a ring of fire on the ground, embers and smoke. */
  eruption(x: number, y: number, radius: number) {
    this.effect('glow', 0.7, (g, t) => {
      const h = 140 * Math.min(1, t * 4) * (1 - t);
      g.fillStyle(0xff6a1a, 0.5 * (1 - t)).fillEllipse(x, y - h / 2, radius * 1.1, h + 20);
      g.fillStyle(0xffe08a, 0.8 * (1 - t)).fillEllipse(x, y - h / 2, radius * 0.5, h);
      g.fillStyle(0xff8a2a, 0.35 * (1 - t)).fillCircle(x, y, radius);
    });
    this.effect('floor', 1.5, (g, t) => g.fillStyle(0x1a0a04, 0.5 * (1 - t)).fillCircle(x, y, radius * 0.8));
    for (let i = 0; i < 12; i++) this.ember(x + (Math.random() - 0.5) * radius, y + (Math.random() - 0.5) * radius);
    this.smoke(x, y - 20, 8, 1.2);
  }

  /** Stepping through a portal: a ring bursting outward and a swirl of sparks. */
  portalBurst(x: number, y: number, color: number) {
    this.effect('glow', 0.4, (g, t) => {
      g.lineStyle(5 * (1 - t), color, 0.9 * (1 - t)).strokeCircle(x, y, 14 + t * 40);
      g.fillStyle(0xffffff, 0.6 * (1 - t)).fillCircle(x, y, 18 * (1 - t));
    });
    this.sparks(x, y, color, 10);
  }

  /** A firework bursting overhead: a ring of coloured sparks that falls and fades. */
  firework(x: number, y: number, color: number) {
    const n = 18;
    this.effect('glow', 1.3, (g, t) => {
      const r = 70 * Math.sqrt(Math.min(1, t * 2));
      const fall = t * t * 30;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r + fall;
        g.fillStyle(color, 0.9 * (1 - t)).fillCircle(px, py, 2.5);
        g.lineStyle(1.5, color, 0.4 * (1 - t)).lineBetween(px, py, x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7 + fall);
      }
      g.fillStyle(0xffffff, Math.max(0, 0.8 - t * 4)).fillCircle(x, y, 10);
    });
  }

  /**
   * 死神 comes for someone: a hooded reaper rises out of dark smoke behind the target,
   * raises his scythe and swings (at REAPER_SWING of the way through). On a hit, skeletal
   * hands burst from the ground to clutch them, a chain binds them to him and their soul is
   * torn out towards him; on a miss he cuts through empty air and fades away.
   */
  reaperCatch(getPos: () => { x: number; y: number }, hit: boolean) {
    const life = hit ? 1.6 : 1.1;
    const swingAt = REAPER_SWING / life;
    const side = Math.random() < 0.5 ? -1 : 1;
    const start = getPos();
    for (let i = 0; i < 14; i++) this.smoke(start.x + side * 30 + (Math.random() - 0.5) * 40, start.y - 20 + (Math.random() - 0.5) * 30, 1, 0.9);
    // The reaper himself, drawn over everything (in his own units, K× a ninja's scale).
    const K = 1.45;
    this.effect('over', life, (g, t) => {
      const { x, y } = getPos();
      const fade = Math.min(1, t / 0.2) * Math.min(1, (1 - t) / 0.2);
      const rx = x + side * 44 * K;
      const ry = y - 30 * K - Math.min(1, t / 0.25) * 12;
      const P = (dx: number, dy: number) => ({ x: rx + dx * K, y: ry + dy * K });
      // Tattered robe.
      g.fillStyle(0x14081c, 0.92 * fade);
      g.fillPoints([P(-18, -22), P(18, -22), P(28, 40), P(16, 32), P(8, 44), P(-2, 34), P(-12, 46), P(-20, 34), P(-30, 42)] as Phaser.Math.Vector2[], true);
      // Hood, the void inside it and two burning eyes.
      const hood = P(0, -26);
      g.fillStyle(0x1e0c2a, fade).fillCircle(hood.x, hood.y, 17 * K);
      g.fillStyle(0x000000, fade).fillEllipse(hood.x, hood.y + 3 * K, 20 * K, 18 * K);
      g.fillStyle(0xff3a5a, fade).fillCircle(hood.x - 5 * K, hood.y + K, 2.5 * K).fillCircle(hood.x + 5 * K, hood.y + K, 2.5 * K);
      // Scythe: raised until the swing, then sweeping down across the target.
      const k = Phaser.Math.Clamp((t - swingAt + 0.12) / 0.14, 0, 1);
      const a = Phaser.Math.Linear(-side * 1.9, side * 0.9, k) - Math.PI / 2;
      const hand = P(-side * 14, -4);
      const len = 74 * K;
      const tipX = hand.x + Math.cos(a) * len;
      const tipY = hand.y + Math.sin(a) * len;
      g.lineStyle(4 * K, 0x4a3426, fade).lineBetween(hand.x - Math.cos(a) * 20 * K, hand.y - Math.sin(a) * 20 * K, tipX, tipY);
      // Curved blade off the top of the pole.
      const bladeDir = a + (side * Math.PI) / 2;
      g.fillStyle(0xd8dce8, fade).fillTriangle(
        tipX, tipY,
        tipX + (Math.cos(bladeDir) * 46 - Math.cos(a) * 10) * K, tipY + (Math.sin(bladeDir) * 46 - Math.sin(a) * 10) * K,
        tipX + (Math.cos(bladeDir) * 14 - Math.cos(a) * 14) * K, tipY + (Math.sin(bladeDir) * 14 - Math.sin(a) * 14) * K,
      );
      // Bony hand on the pole.
      g.fillStyle(0xe8e0cc, fade).fillCircle(hand.x, hand.y, 4 * K);
    });
    // The swing's trail.
    this.effect('glow', life, (g, t) => {
      const ts = (t - swingAt + 0.06) / 0.25;
      if (ts < 0 || ts > 1) return;
      const { x, y } = getPos();
      g.lineStyle(14 * (1 - ts), 0x9a5aff, 0.6 * (1 - ts));
      g.beginPath();
      g.arc(x + side * 44 * K, y - 30 * K, 70 * K, side > 0 ? Math.PI * 0.6 : -Math.PI * 0.4, side > 0 ? Math.PI * 1.2 : Math.PI * 0.2, side < 0);
      g.strokePath();
      g.lineStyle(3, 0xf0e8ff, 0.9 * (1 - ts)).lineBetween(x - 34, y - 20 * side, x + 34, y + 20 * side);
    });
    if (!hit) return;
    // Caught: hands from the ground, a chain to the reaper, the soul pulled out.
    const hands = Array.from({ length: 5 }, (_, i) => ({ a: (i / 5) * Math.PI * 2 + Math.random() * 0.5, d: 22 + Math.random() * 8 }));
    this.effect('over', life, (g, t) => {
      const th = (t - swingAt) / (1 - swingAt);
      if (th < 0) return;
      const { x, y } = getPos();
      const grow = Math.min(1, th * 4);
      const fade = Math.min(1, (1 - th) * 3);
      g.fillStyle(0x0a0410, 0.6 * fade).fillCircle(x, y + 4, 30 * grow);
      for (const h of hands) {
        const bx = x + Math.cos(h.a) * h.d;
        const by = y + Math.sin(h.a) * h.d * 0.6 + 6;
        const reach = (1 - grow * 0.6) * h.d;
        const fx = x + Math.cos(h.a) * reach * 0.4;
        const fy = y + Math.sin(h.a) * reach * 0.3;
        g.lineStyle(3, 0xe8e0cc, fade).lineBetween(bx, by, fx, fy);
        for (const sp of [-0.5, 0, 0.5]) {
          const ca = Math.atan2(fy - by, fx - bx) + sp;
          g.lineBetween(fx, fy, fx + Math.cos(ca) * 8 * grow, fy + Math.sin(ca) * 8 * grow);
        }
      }
      // Chain from the reaper's hand to the victim.
      const rx = x + side * (44 - 14) * K;
      const ry = y - 34 * K;
      g.lineStyle(2, 0x9aa0b0, fade);
      for (let k = 0; k < 8; k++) {
        const u0 = k / 8;
        const u1 = (k + 0.6) / 8;
        g.strokeEllipse(Phaser.Math.Linear(rx, x, (u0 + u1) / 2), Phaser.Math.Linear(ry, y, (u0 + u1) / 2), 6, 4);
      }
    });
    this.effect('glow', life, (g, t) => {
      const ts = (t - swingAt - 0.05) / (1 - swingAt - 0.05);
      if (ts < 0) return;
      const { x, y } = getPos();
      // The soul: a pale wisp dragged out of the body towards the reaper.
      const sx = Phaser.Math.Linear(x, x + side * 40 * K, ts);
      const sy = Phaser.Math.Linear(y, y - 50 * K, ts);
      const fade = 1 - ts;
      g.fillStyle(0xcfe0ff, 0.7 * fade).fillCircle(sx, sy, 9);
      g.fillStyle(0xcfe0ff, 0.35 * fade).fillTriangle(sx - 8, sy + 2, sx + 8, sy + 2, sx - side * 4, sy + 22);
      g.fillStyle(0x10081c, 0.8 * fade).fillCircle(sx - 3, sy - 1, 1.6).fillCircle(sx + 3, sy - 1, 1.6);
    });
  }

  /** A tower bringing a player back: a beam of light from the tower to them. */
  respawnBeam(x0: number, y0: number, x1: number, y1: number, color: number) {
    this.effect('glow', 0.5, (g, t) => {
      g.lineStyle(8 * (1 - t), color, 0.5 * (1 - t)).lineBetween(x0, y0, x1, y1);
      g.lineStyle(2, 0xffffff, 0.8 * (1 - t)).lineBetween(x0, y0, x1, y1);
      g.fillStyle(0xffffff, 0.6 * (1 - t)).fillCircle(x1, y1, 22 * (1 - t * 0.5));
    });
    this.sparks(x1, y1, color, 8);
  }

  // ---------- general ----------

  /** Star-burst at the point of impact. */
  hitSpark(x: number, y: number, color = 0xffe08a) {
    const rot = Math.random() * Math.PI;
    this.effect('glow', 0.14, (g, t) => {
      g.lineStyle(3 * (1 - t), color, 1 - t);
      for (let i = 0; i < 6; i++) {
        const a = rot + (i * Math.PI) / 3;
        const r0 = 4 + t * 8;
        const r1 = 10 + t * 14;
        g.lineBetween(x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      }
      g.fillStyle(0xffffff, 1 - t).fillCircle(x, y, 6 * (1 - t));
    });
    this.sparks(x, y, color, 5);
  }

  sparks(x: number, y: number, color: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 140;
      this.add({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.2 + Math.random() * 0.2, size: 2 + Math.random() * 1.5, drag: 0.02, color });
    }
  }

  /** Ninja smoke puff (vanishing, respawning, dashing). */
  smoke(x: number, y: number, n = 14, size = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (20 + Math.random() * 50) * size;
      this.add({ kind: 'smoke', x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.3, size: (6 + Math.random() * 6) * size, drag: 0.1, color: 0xd8d4cc });
    }
  }

  /** Flames licking up around a fighter with Fury. */
  ember(x: number, y: number) {
    const a = Math.random() * Math.PI * 2;
    this.add({ kind: 'flame', x: x + Math.cos(a) * 16, y: y + Math.sin(a) * 16, vx: Math.cos(a) * 10, vy: -30, life: 0.4, size: 3 + Math.random() * 3, drag: 0.5, color: 0 });
  }

  /** Fireball trail. */
  fireTrail(x: number, y: number, r: number) {
    this.add({ kind: 'flame', x: x + (Math.random() - 0.5) * r, y: y + (Math.random() - 0.5) * r, vx: 0, vy: 0, life: 0.3, size: r * 0.8, drag: 0.5, color: 0 });
  }

  /** Small green leaves while healing. */
  leaf(x: number, y: number) {
    const a = Math.random() * Math.PI * 2;
    this.add({ kind: 'leaf', x: x + Math.cos(a) * 20, y: y + Math.sin(a) * 20, vx: -Math.cos(a) * 20, vy: -Math.sin(a) * 20 - 10, life: 0.6, size: 3, drag: 0.5, color: 0x7dff8a });
  }
}
