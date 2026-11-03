import { drawWeaponContact } from '@/rendering/impactArt';
import { drawShotEmblem } from '@/rendering/skillEmblems';
import * as Phaser from 'phaser';
import { drawLog, drawShurikenStar, SHURIKEN_BATTLE_SCALE, kunai, spear, windmillWheel, crescentSpade, ninjato } from '@/rendering/fighterArt';
import { SUMMON_LIGHT_RADIUS } from '@/config';
import type { SkillEffect, SummonKind } from '@/gameplay/skills';
import { scoopLine, waveLine, type Shape, type WeaponId } from '@/gameplay/weapons';

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
          // Velocity-aligned sparks leave sharp streaks, cooling to small glints as they slow.
          glow.lineStyle(Math.max(.4, p.size * (1 - t) * .7), p.color, 1 - t)
            .lineBetween(p.x - p.vx * .025, p.y - p.vy * .025, p.x, p.y);
          glow.fillStyle(0xfff6dd, (1 - t) * .65).fillCircle(p.x, p.y, p.size * .4 * (1 - t));
          break;
        case 'dust':
          { const r = p.size * (.6 + t);
            over.fillStyle(p.color, .5 * (1 - t)).fillTriangle(p.x - r, p.y + r * .5, p.x + r * .15, p.y - r, p.x + r, p.y + r * .35);
          }
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

  // ---------- skill identities ----------

  /** A short cast flourish; silhouettes, not just colours, distinguish the skill families. */
  skillCast(getPos: () => { x: number; y: number }, e: SkillEffect, facing: number) {
    if (e.kind.startsWith('soul')) return; // Soul calls have their own continuous ritual.
    const kind = e.kind;
    const heal = kind === 'channelHeal' || kind === 'instantHeal' || kind === 'regen' || kind === 'teamHeal' || kind === 'revive';
    const shield = kind === 'guard' || kind === 'teamGuard' || kind === 'counter';
    const fury = kind === 'powerUp' || kind === 'teamFury' || kind === 'sacrifice' || kind === 'lifesteal';
    const wind = kind === 'dash' || kind === 'speedBuff';
    const shadow = kind === 'stealth' || kind === 'teleport' || kind === 'substitute' || kind === 'shadowStep' || kind === 'swap';
    const shot = e.kind === 'projectile' ? e : null;
    const color = heal ? 0x80edbb : shield ? 0xffd376 : fury ? 0xff7958 : wind ? 0x89e4f4
      : shadow ? 0xb5a0f5 : kind === 'teamPe' ? 0x90c5ff : shot ? shot.color : 0xc4cbd9;
    // Ninja tricks leave a mark at departure, rather than giving away the hidden fighter.
    const origin = getPos();
    const at = shadow || shot || kind === 'caltrops' ? () => origin : getPos;
    const team = kind.startsWith('team');
    const radius = team ? 72 : kind === 'caltrops' && e.kind === 'caltrops' ? e.radius : 40;
    this.effect('floor', 0.65, (g, t) => {
      const { x, y } = at();
      const r = radius * (0.45 + 0.55 * Math.sin(Math.min(1, t * 2) * Math.PI / 2));
      const a = Math.sin(Math.PI * Math.min(1, t * 1.5)) * 0.5;
      if (shot) drawShotEmblem(g, shot, x, y, facing, t, a);
      else if (kind !== 'caltrops') g.lineStyle(2, color, a).strokeCircle(x, y, r);
      if (heal) {
        // Six petals opening flat on the ground.
        for (let k = 0; k < 6; k++) {
          const ang = k * Math.PI / 3;
          const p = (d: number, off: number) => ({ x: x + Math.cos(ang + off) * d, y: y + Math.sin(ang + off) * d });
          g.fillStyle(color, a * 0.22).fillPoints([p(6, 0), p(r * 0.7, -0.3), p(r, 0), p(r * 0.7, 0.3)] as Phaser.Math.Vector2[], true);
          g.lineStyle(1, color, a).strokePoints([p(6, 0), p(r * 0.7, -0.3), p(r, 0), p(r * 0.7, 0.3)] as Phaser.Math.Vector2[], true);
        }
      } else if (shadow) {
        // Broken ink seal and four departing paper shards.
        for (let k = 0; k < 4; k++) {
          const a0 = k * Math.PI / 2 + t;
          g.lineStyle(3, color, a).beginPath().arc(x, y, r, a0, a0 + 0.65, false).strokePath();
        }
      } else if (fury || kind === 'caltrops') {
        const n = fury ? 8 : 5;
        for (let k = 0; k < n; k++) {
          const a0 = k * Math.PI * 2 / n;
          g.lineStyle(2, color, a).lineBetween(x + Math.cos(a0) * r * 0.65, y + Math.sin(a0) * r * 0.65, x + Math.cos(a0) * r, y + Math.sin(a0) * r);
        }
      }
    });
    this.effect('over', 0.5, (g, t) => {
      const { x, y } = at();
      const fade = Math.sin(Math.PI * Math.min(1, t * 1.4));
      if (shield) {
        this.guardAura(g, x, y, 26 + t * 22, fade, t);
      } else if (heal || kind === 'teamPe') {
        // A rising healing cross, or three blue spirit diamonds.
        for (let k = 0; k < (kind === 'revive' ? 5 : 3); k++) {
          const px = x + (k - 1) * 17, py = y - 16 - t * 45 + (k % 2) * 13;
          if (heal) {
            g.lineStyle(2.5, color, fade).lineBetween(px - 4, py, px + 4, py).lineBetween(px, py - 4, px, py + 4);
          } else {
            g.lineStyle(2, color, fade).strokePoints([{ x: px, y: py - 6 }, { x: px + 4, y: py }, { x: px, y: py + 6 }, { x: px - 4, y: py }] as Phaser.Math.Vector2[], true);
          }
        }
      } else if (wind || shot) {
        for (let k = 0; k < 3; k++) {
          const a = facing + k * Math.PI * 2 / 3 + t * 2;
          const px = x + Math.cos(a) * 18, py = y + Math.sin(a) * 18;
          g.fillStyle(color, fade).fillCircle(px, py, 2.5);
        }
      } else if (fury) {
        for (let k = 0; k < 7; k++) {
          const a = k * Math.PI * 2 / 7 - Math.PI / 2;
          const r = 24 + t * 35;
          g.fillStyle(color, fade * 0.75).fillTriangle(x + Math.cos(a - 0.1) * r, y + Math.sin(a - 0.1) * r, x + Math.cos(a) * (r + 14), y + Math.sin(a) * (r + 14), x + Math.cos(a + 0.1) * r, y + Math.sin(a + 0.1) * r);
        }
      } else {
        for (let k = 0; k < 6; k++) {
          const a = k * Math.PI / 3 + t;
          const px = x + Math.cos(a) * (18 + t * 40), py = y + Math.sin(a) * (18 + t * 40);
          g.lineStyle(2, color, fade).lineBetween(px - 4, py - 6, px + 4, py + 6).lineBetween(px + 4, py - 6, px - 4, py + 6);
        }
      }
    });
    this.effect('glow', 0.4, (g, t) => {
      const { x, y } = at();
      g.lineStyle(2 * (1 - t), color, 0.6 * (1 - t)).strokeCircle(x, y, 18 + t * radius);
      g.fillStyle(color, 0.12 * (1 - t)).fillCircle(x, y, 24 + t * 12);
    });
  }

  /** Golden Bell / Ward: six faceted panels with a bright edge and an open centre. */
  guardAura(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, alpha: number, now: number) {
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3 + now * 0.18;
      const pts = [-0.43, 0, 0.43].map((off) => ({ x: x + Math.cos(a + off) * radius, y: y + Math.sin(a + off) * radius }));
      g.lineStyle(2, 0xffd376, alpha * 0.8).strokePoints(pts as Phaser.Math.Vector2[], false);
      g.lineStyle(1, 0xfff4c5, alpha * 0.6).lineBetween(pts[1].x, pts[1].y, x + Math.cos(a) * (radius + 5), y + Math.sin(a) * (radius + 5));
    }
  }

  /** A visible thread makes the source and recipient of Lifeline clear. */
  lifeline(getFrom: () => { x: number; y: number }, getTo: () => { x: number; y: number }) {
    this.effect('glow', 0.75, (g, t) => {
      const a = getFrom(), b = getTo();
      g.lineStyle(3, 0x80edbb, 0.45 * (1 - t)).lineBetween(a.x, a.y, b.x, b.y);
      for (let k = 0; k < 4; k++) {
        const u = (t * 1.5 + k / 4) % 1;
        g.fillStyle(0xe0ffe9, 0.8 * (1 - t)).fillCircle(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, 3);
      }
    });
  }

  // ---------- weapon strikes ----------

  /** Arrival glints run on the scene clock, so pauses and scene changes cannot leave delayed timers. */
  private arrivalFlash(x: number, y: number, color: number, delay: number) {
    const life = delay + 0.14;
    this.effect('glow', life, (g, t) => {
      const u = (t * life - delay) / 0.14;
      if (u < 0) return;
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4;
        g.lineStyle(2, color, 0.65 * (1 - u)).lineBetween(x + Math.cos(a) * 3, y + Math.sin(a) * 3, x + Math.cos(a) * (8 + u * 10), y + Math.sin(a) * (8 + u * 10));
      }
    });
  }

  private chainLinks(g: Phaser.GameObjects.Graphics, x: number, y: number, tx: number, ty: number, alpha: number) {
    const d = Math.hypot(tx - x, ty - y), n = Math.max(2, Math.ceil(d / 10));
    for (let k = 1; k < n; k++) {
      const u = k / n;
      g.lineStyle(1.2, k % 2 ? 0xe0d5b5 : 0x8796a7, alpha).strokeEllipse(x + (tx - x) * u, y + (ty - y) * u, k % 2 ? 5 : 3, k % 2 ? 3 : 5);
    }
  }

  /** 見切: a bright parry flash, two crossing cuts and a ring of sparks. */
  counterFlash(x: number, y: number) {
    this.sparks(x, y, 0xe8f2ff, 10);
    this.effect('glow', 0.3, (g, t) => {
      const r = 18 + t * 26;
      g.lineStyle(3 * (1 - t), 0xe8f2ff, 0.9 * (1 - t)).strokeCircle(x, y, r);
      for (const a of [Math.PI / 4, -Math.PI / 4]) {
        const l = 26 * Math.min(1, t * 3);
        g.lineStyle(3 * (1 - t), 0xffffff, 1 - t).lineBetween(x - Math.cos(a) * l, y - Math.sin(a) * l, x + Math.cos(a) * l, y + Math.sin(a) * l);
      }
    });
  }

  /** 影步: smoke at departure and arrival. */
  shadowStep(fromX: number, fromY: number, toX: number, toY: number, color: number) {
    this.smoke(fromX, fromY, 12, 0.9);
    this.smoke(toX, toY, 8, 0.7);
  }

  /** 換影: a puff of smoke at both spots. */
  swapFlash(ax: number, ay: number, bx: number, by: number, color: number) {
    this.smoke(ax, ay, 10, 0.8);
    this.smoke(bx, by, 10, 0.8);
  }

  /** 飛輪 in flight: a four-bladed steel ring, spinning. */
  drawChakram(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, spin: number) {
    g.lineStyle(3, 0xd0d8e0, 1).strokeCircle(x, y, r * 0.65);
    for (let k = 0; k < 4; k++) {
      const a = spin + (k * Math.PI) / 2;
      const tip = { x: x + Math.cos(a) * r * 1.25, y: y + Math.sin(a) * r * 1.25 };
      const base = { x: x + Math.cos(a - 0.7) * r * 0.65, y: y + Math.sin(a - 0.7) * r * 0.65 };
      const back = { x: x + Math.cos(a + 0.35) * r * 0.65, y: y + Math.sin(a + 0.35) * r * 0.65 };
      g.fillStyle(0xe8eef6, 1).fillTriangle(base.x, base.y, tip.x, tip.y, back.x, back.y);
    }
    g.fillStyle(0x3a2a1c, 1).fillCircle(x, y, r * 0.25);
  }

  /** 鉤鎖 in flight: the chain from the thrower to the hook. */
  drawChain(g: Phaser.GameObjects.Graphics, x: number, y: number, tx: number, ty: number, alpha: number) {
    this.chainLinks(g, x, y, tx, ty, alpha);
  }

  /** 鉤鎖 landing: the chain stays taut between thrower and victim while they are dragged in. */
  hookPull(from: () => { x: number; y: number }, to: () => { x: number; y: number }) {
    const t0 = to();
    this.sparks(t0.x, t0.y, 0xdfe6f0, 6);
    this.effect('over', 0.35, (g, t) => {
      const a = from();
      const b = to();
      this.chainLinks(g, a.x, a.y, b.x, b.y, 1 - t * 0.6);
      g.lineStyle(2, 0xdfe6f0, 0.9 * (1 - t)).strokeCircle(b.x, b.y, 10 + t * 6);
    });
  }

  /** Small accents on confirmed hits distinguish steel, blunt, fire and lightning impacts. */
  weaponImpact(id: WeaponId, x: number, y: number, facing: number, accent: number) {
    if (id === 'staff') return; // Its existing frost burst also communicates the chill debuff.
    const fire = id === 'fan' || id === 'bomb' || id === 'fire-kunai', heavy = id === 'hammer' || id === 'flail' || id === 'nunchaku' || id === 'spade';
    const lightning = id === 'talisman' || id === 'thunder-fan';
    const color = fire ? 0xffbc67 : lightning ? 0xb5dcff : heavy ? 0xe8cc99 : accent;
    this.effect('over', 0.24, (g, t) => drawWeaponContact(g, id, x, y, facing, color, t));
    if (fire) for (let k = 0; k < 3; k++) this.ember(x, y);
  }

  /** 雷扇: the fire fan's sweep, in lightning. */
  thunderFan(x: number, y: number, facing: number, radius: number, spread: number) {

    this.effect('glow', 0.2, (g, t) => {
      for (let k = 0; k < 5; k++) {
        const a = facing + (k - 2) * spread * 0.18;
        let px = x + Math.cos(a) * radius * 0.2;
        let py = y + Math.sin(a) * radius * 0.2;
        g.lineStyle(2, 0xfff6c2, 0.9 * (1 - t));
        g.beginPath();
        g.moveTo(px, py);
        for (let n = 1; n <= 4; n++) {
          const along = radius * (0.2 + n * 0.18);
          const side = (n % 2 ? 1 : -1) * 10 * (1 - t);
          px = x + Math.cos(a) * along - Math.sin(a) * side;
          py = y + Math.sin(a) * along + Math.cos(a) * side;
          g.lineTo(px, py);
        }
        g.strokePath();
      }
    });
    for (let i = 0; i < 28; i++) {
      const a = facing + (Math.random() - 0.5) * spread;
      const r0 = 16 + Math.random() * radius * 0.5;
      const speed = 80 + Math.random() * 160;
      this.add({ kind: 'spark', x: x + Math.cos(a) * r0, y: y + Math.sin(a) * r0, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0.18 + Math.random() * 0.12, size: 2 + Math.random() * 2, drag: 0.2, color: Math.random() < 0.5 ? 0xf4fbff : 0x7eb6ff });
    }
  }

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
    this.effect('over', 0.2, (g, t) => {
      const px = x + Math.cos(facing) * 18, py = y + Math.sin(facing) * 18;
      g.fillStyle(0xffdc8a, 1 - t).fillCircle(px, py, 5 * (1 - t));
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
      const px = x + c * d;
      const py = y + s * d;
      if (k < 1) {
        drawShurikenStar(g, px, py, 10 * SHURIKEN_BATTLE_SCALE, t * 40);
      }
    });
    const ex = x + c * to;
    const ey = y + s * to;
    this.arrivalFlash(ex, ey, 0xe8ecf4, life);
  }

  /** 冰棍: the staff whips through both ends, with ice crystals at the tips. */
  staffSweep(getPos: () => { x: number; y: number }, facing: number, length: number, width: number) {
    this.effect('over', 0.3, (g, t) => {
      const { x, y } = getPos();
      const a = facing + Math.PI / 2 - t * Math.PI;
      const c = Math.cos(a);
      const s = Math.sin(a);
      g.lineStyle(4, 0x608eae, 1 - t).lineBetween(x - c * length, y - s * length, x + c * length, y + s * length);
      g.lineStyle(2, 0xffffff, 0.7 * (1 - t)).lineBetween(x - c * length, y - s * length, x + c * length, y + s * length);
      for (const d of [1, -1]) {
        // A snowflake riding the tip.
        this.snowflake(g, x + d * c * length * 0.92, y + d * s * length * 0.92, 7 * (1 - t * 0.5), (1 - t) * 0.9);
      }
    });
    const c = Math.cos(facing);
    const s = Math.sin(facing);
    const { x, y } = getPos();
    for (const d of [1, -1]) {
      this.sparks(x + d * c * length, y + d * s * length, 0xdff6ff, 6);
    }
  }

  /** 雙節棍: a stick whirled out to each side at once, cracking at the end of both arcs. */
  nunchakuWhirl(getPos: () => { x: number; y: number }, facing: number, radius: number, angle: number) {
    this.effect('over', 0.22, (g, t) => {
      const { x, y } = getPos();
      const sweep = Math.min(1, t * 1.4);
      for (const side of [-1, 1]) {
        const a = facing + side * (Math.PI / 2 + (sweep - 0.5) * angle);
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const inner = { x: x + c * radius * 0.5, y: y + sn * radius * 0.5 };
        const outer = { x: x + c * radius * 0.92, y: y + sn * radius * 0.92 };
        this.chainLinks(g, x + c * 10, y + sn * 10, inner.x, inner.y, 1 - t * 0.5);
        g.lineStyle(6, 0x2a1a12, 1 - t * 0.5).lineBetween(inner.x, inner.y, outer.x, outer.y);
        g.lineStyle(2, 0x6b4a2e, 1 - t * 0.5).lineBetween(inner.x, inner.y, outer.x, outer.y);
        g.fillStyle(0xd9ae4a, 1 - t * 0.5).fillCircle(inner.x, inner.y, 2.6).fillCircle(outer.x, outer.y, 2.6);
      }
    });
    const { x, y } = getPos();
    for (const side of [-1, 1]) {
      const a = facing + side * (Math.PI / 2 + angle / 2);
      this.sparks(x + Math.cos(a) * radius, y + Math.sin(a) * radius, 0xf3e2b8, 4);
    }
  }

  /** 九節鞭: the chain whip lashed out along its S, section by section, cracking at the dart tip. */
  whipLash(getPos: () => { x: number; y: number }, facing: number, shape: Extract<Shape, { kind: 'wave' }>) {
    const line = waveLine(shape, 36);
    const c = Math.cos(facing);
    const sn = Math.sin(facing);
    const world = (x: number, y: number, p: { x: number; y: number }) => ({ x: x + c * p.x - sn * p.y, y: y + sn * p.x + c * p.y });
    const reached = (t: number) => Math.max(1, Math.floor(Math.min(1, t * 2.2) * (line.length - 1)));
    this.effect('over', 0.3, (g, t) => {
      const { x, y } = getPos();
      const head = reached(t);
      // Nine steel sections strung along the line, the last one the dart.
      for (let k = 1; k <= 9; k++) {
        const i = Math.round((head * k) / 9);
        const p = world(x, y, line[i]!);
        const q = world(x, y, line[Math.max(0, i - 1)]!);
        const a = Math.atan2(p.y - q.y, p.x - q.x);
        if (k === 9) {
          const tip = [{ x: p.x + Math.cos(a) * 9, y: p.y + Math.sin(a) * 9 }, { x: p.x - Math.sin(a) * 4, y: p.y + Math.cos(a) * 4 }, { x: p.x + Math.sin(a) * 4, y: p.y - Math.cos(a) * 4 }];
          g.fillStyle(0xdfe6f0, 1 - t * 0.5).fillPoints(tip as Phaser.Math.Vector2[], true);
          g.fillStyle(0xb8383e, 1 - t * 0.5).fillCircle(p.x - Math.cos(a) * 3, p.y - Math.sin(a) * 3, 2.4);
        } else {
          g.lineStyle(4, 0x8f98a6, 1 - t * 0.5).lineBetween(p.x - Math.cos(a) * 4, p.y - Math.sin(a) * 4, p.x + Math.cos(a) * 4, p.y + Math.sin(a) * 4);
          g.fillStyle(0xd3d8e2, 1 - t * 0.5).fillCircle(p.x, p.y, 1.6);
        }
      }
    });
    const { x, y } = getPos();
    const tip = world(x, y, line[line.length - 1]!);
    this.sparks(tip.x, tip.y, 0xeaf2ff, 6);
  }

  /** 風車刃: the three blades whirled round once, without a painted sweep path. */
  windmillSpin(getPos: () => { x: number; y: number }, facing: number, shape: Extract<Shape, { kind: 'pinwheel' }>) {
    this.effect('over', 0.32, (g, t) => {
      const { x, y } = getPos();
      const a = facing + t * Math.PI * 2, radius = shape.outer * .65;
      windmillWheel(g, x + Math.cos(a) * radius, y + Math.sin(a) * radius, 22, a * 3);
    });
  }

  /** 月牙鏟: the crescent blade scoops through the U in front, throwing up dust at the bottom of the swing. */
  spadeScoop(x: number, y: number, facing: number, shape: Extract<Shape, { kind: 'scoop' }>) {
    const line = scoopLine(shape);
    const c = Math.cos(facing), sn = Math.sin(facing);
    const world = (p: { x: number; y: number }) => ({ x: x + c * p.x - sn * p.y, y: y + sn * p.x + c * p.y });
    const pts = line.map(world);
    this.effect('over', 0.26, (g, t) => {
      // The blade sweeps from one horn to the other.
      const head = Math.max(1, Math.round(Math.min(1, t * 1.8) * (pts.length - 1)));
      const p = pts[head]!;
      crescentSpade(g, p.x, p.y, facing + t * Math.PI, 32);
    });
    const bottom = world({ x: shape.center - (shape.inner + shape.outer) / 2, y: 0 });
    this.smoke(bottom.x, bottom.y, 8, 0.6);
    this.sparks(bottom.x, bottom.y, 0xe6d3a8, 5);
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
        if (k < 1) {
          kunai(g, x + c * d, y + s * d, a, 13);
        }
      }
    });
    for (const a of angles) this.arrivalFlash(x + Math.cos(a) * to, y + Math.sin(a) * to, 0xe8ecf4, life);
  }

  /** 火苦無: the kunai volley, enlarged and burning along each ray. */
  fireKunai(x: number, y: number, angles: number[], from: number, to: number) {
    const life = 0.22;
    this.effect('over', life + 0.16, (g, t) => {
      const k = Math.min(1, t * ((life + 0.16) / life));
      const d = from + (to - from) * k;
      for (const a of angles) {
        const c = Math.cos(a);
        const s = Math.sin(a);
        if (k < 1) {
          const px = x + c * d, py = y + s * d;
          g.fillStyle(0xff8b38, .8 * (1 - t)).fillCircle(px, py, 6);
          kunai(g, px, py, a, 20);
        }
      }
    });
    for (const a of angles) this.arrivalFlash(x + Math.cos(a) * to, y + Math.sin(a) * to, 0xffb45a, life);
  }

  /** 大錘: shockwave ring, dust and cracks where the hammer lands. */
  hammerSmash(cx: number, cy: number, radius: number) {
    this.effect('over', 0.45, (g, t) => {
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4 + 0.2, r = radius * (0.2 + t * 0.65);
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r - Math.sin(t * Math.PI) * 18;
        g.fillStyle(0x95856e, 0.8 * (1 - t)).fillTriangle(x - 4, y + 3, x, y - 5, x + 6, y + 2);
        g.lineStyle(1, 0xe3c79b, 0.6 * (1 - t)).lineBetween(x - 3, y + 1, x, y - 4);
      }
    });
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

  /** 長槍: the physical spear thrusts forward. */
  spearThrust(x: number, y: number, facing: number, offset: number, length: number, width: number, color: number) {
    const c = Math.cos(facing), s = Math.sin(facing);
    this.effect('over', 0.18, (g, t) => {
      const d = offset + length * Math.sin(t * Math.PI) * .7;
      spear(g, x + c * d, y + s * d, facing, 44, color);
    });
    this.arrivalFlash(x + c * (offset + length), y + s * (offset + length), 0xffe5aa, 0.06);
  }

  /** 雙匕: two quick tapered cuts crossing inside the short, wide hit lane. */
  daggerSlash(x: number, y: number, facing: number, reach: number, width: number, color: number) {
    const c = Math.cos(facing), s = Math.sin(facing);
    this.effect('over', 0.18, (g, t) => {
      for (const side of [-1, 1]) {
        const d = reach * (.25 + .5 * Math.sin(t * Math.PI)), lateral = side * width * (.3 - t * .5);
        kunai(g, x + c * d - s * lateral, y + s * d + c * lateral, facing - side * .5, 16);
      }
    });
    this.sparks(x + c * reach * .55, y + s * reach * .55, 0xeaf2ff, 6);
  }

  /** 流星錘: the weight whirled once around the ninja, on its chain. */
  chainSpin(getPos: () => { x: number; y: number }, facing: number, inner: number, outer: number) {
    const r = (inner + outer) / 2;
    this.effect('over', 0.22, (g, t) => {
      const { x, y } = getPos();
      const a = facing + t * Math.PI * 2.2;
      const wx = x + Math.cos(a) * r;
      const wy = y + Math.sin(a) * r;
      this.chainLinks(g, x, y, wx, wy, 1 - t * 0.5);
      for (let k = 0; k < 6; k++) {
        const a0 = a + k * Math.PI / 3;
        g.fillStyle(0xc4cbd4, 1 - t * 0.6).fillTriangle(wx + Math.cos(a0 - 0.3) * 6, wy + Math.sin(a0 - 0.3) * 6, wx + Math.cos(a0) * 11, wy + Math.sin(a0) * 11, wx + Math.cos(a0 + 0.3) * 6, wy + Math.sin(a0 + 0.3) * 6);
      }
      g.fillStyle(0x3d424c, 1 - t * 0.6).fillCircle(wx, wy, 7);
      g.lineStyle(1.5, 0xd9ae4a, 1 - t * 0.6).strokeCircle(wx, wy, 7);
      g.fillStyle(0xe2ebf4, 0.85 * (1 - t)).fillCircle(wx - 2, wy - 2, 2);
    });
  }

  /** 鎖鐮: the sickle flung out on its chain, sweeping across the curved band. */
  sickleSweep(getPos: () => { x: number; y: number }, facing: number, inner: number, outer: number, angle: number) {
    const r = (inner + outer) / 2;
    this.effect('over', 0.2, (g, t) => {
      const { x, y } = getPos();
      const a0 = facing - angle / 2;
      const a = a0 + angle * Math.min(1, t * 1.3);
      const sx = x + Math.cos(a) * r;
      const sy = y + Math.sin(a) * r;
      this.chainLinks(g, x, y, sx, sy, 1 - t * 0.5);
      // The sickle blade, spinning.
      const rot = a + t * 12;
      g.lineStyle(4, 0xd3d8e2, 1);
      g.beginPath();
      g.arc(sx, sy, 9, rot, rot + 2.2, false);
      g.strokePath();
      g.lineStyle(3, 0x6b3f1f, 1).lineBetween(sx, sy, sx - Math.cos(rot) * 8, sy - Math.sin(rot) * 8);
    });
  }

  /** 焙烙玉: the bomb bursts into a fireball with smoke and a shockwave. */
  bombBlast(cx: number, cy: number, radius: number) {
    this.effect('over', 0.5, (g, t) => {
      // Two low pressure rings and outward fragments give the blast weight.
      for (const scale of [0.65, 0.95]) {
        g.lineStyle(4 * (1 - t), 0xc6ad8f, 0.3 * (1 - t)).strokeEllipse(cx, cy + 7, radius * (0.35 + t * 0.65) * scale * 2, radius * (0.35 + t * 0.65) * scale);
      }
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4, r = radius * (0.2 + t * 0.7);
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        g.lineStyle(3 * (1 - t), 0xffe1a1, 0.8 * (1 - t)).lineBetween(x, y, x + Math.cos(a) * 12, y + Math.sin(a) * 12);
      }
    });
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

  /** 忍刀: the blade extends during the lunge. */
  lungeSlash(getPos: () => { x: number; y: number }, facing: number, length: number, width: number) {
    this.effect('over', 0.22, (g, t) => {
      const { x, y } = getPos();
      const extension = 10 + Math.sin(t * Math.PI) * length * .5;
      ninjato(g, x + Math.cos(facing) * extension, y + Math.sin(facing) * extension, facing, 28);
    });
  }

  /** 雷符: lightning bolts crackling out along the four arms of the cross. */
  lightningCross(x: number, y: number, facing: number, arm: number, width: number) {
    this.effect('over', 0.3, (g, t) => {
      for (let k = 0; k < 4; k++) {
        const a = facing + k * Math.PI / 2, d = arm * (0.25 + t * 0.55);
        const p = (forward: number, side: number) => ({ x: x + Math.cos(a) * (d + forward) - Math.sin(a) * side, y: y + Math.sin(a) * (d + forward) + Math.cos(a) * side });
        // Paper charms drift outward along the four lightning arms.
        g.fillStyle(0xffe6a8, 0.85 * (1 - t)).fillPoints([p(-10, -5), p(10, -5), p(10, 5), p(-10, 5)] as Phaser.Math.Vector2[], true);
        const a0 = p(-6, 0), a1 = p(5, 0), a2 = p(0, -3), a3 = p(0, 3);
        g.lineStyle(1.2, 0x6a4352, 0.9 * (1 - t)).lineBetween(a0.x, a0.y, a1.x, a1.y).lineBetween(a2.x, a2.y, a3.x, a3.y);
      }
    });
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
  summonCircle(floor: Phaser.GameObjects.Graphics, glow: Phaser.GameObjects.Graphics, x: number, y: number, t: number, color: number, now: number, kind?: SummonKind) {
    // Soft circular shadow and coloured light grow outward from the caster, never the screen.
    const halo = SUMMON_LIGHT_RADIUS * (0.4 + 0.6 * Math.min(1, t));
    for (let layer = 8; layer >= 1; layer--) {
      const radius = halo * layer / 8;
      floor.fillStyle(0x04050b, 0.025 + t * 0.008).fillCircle(x, y, radius);
      glow.fillStyle(color, 0.008 + t * 0.004).fillCircle(x, y, radius);
    }
    glow.lineStyle(2, color, 0.14 + t * 0.12).strokeCircle(x, y, halo);
    const r = 30 + 40 * Math.min(1, t * 1.5);
    const a = now * 2.2;
    floor.fillStyle(color, 0.12 + 0.12 * t).fillCircle(x, y, r);
    glow.lineStyle(3, color, 0.8).strokeCircle(x, y, r);
    glow.lineStyle(1.5, 0xffffff, 0.6).strokeCircle(x, y, r * 0.78);
    // Each ritual has a different silhouette, readable even without its colour.
    if (kind) this.summonGlyph(glow, x, y - 102, 25 + t * 8, kind, color, 0.45 + t * 0.45, now);
    for (const off of kind ? [] : [0, Math.PI / 3]) {
      const pts = [0, 1, 2].map((k) => ({ x: x + Math.cos(-a + off + (k * Math.PI * 2) / 3) * r * 0.75, y: y + Math.sin(-a + off + (k * Math.PI * 2) / 3) * r * 0.75 }));
      glow.lineStyle(2, color, 0.75).strokePoints(pts as Phaser.Math.Vector2[], true);
    }
    // Rune ticks around the outer ring.
    for (let k = 0; k < 12; k++) {
      const ang = a + (k / 12) * Math.PI * 2;
      glow.lineStyle(3, 0xffffff, 0.7).lineBetween(x + Math.cos(ang) * r, y + Math.sin(ang) * r, x + Math.cos(ang) * (r + 7), y + Math.sin(ang) * (r + 7));
    }
    // Orbiting motes are drawn directly: render rate cannot multiply the particle count.
    for (let k = 0; k < 6; k++) {
      const ang = now * 2 + k * Math.PI / 3;
      const rise = ((now * 0.7 + k / 6) % 1) * 55;
      glow.lineStyle(1.5, color, 0.45).lineBetween(x + Math.cos(ang) * r, y + Math.sin(ang) * r - rise, x + Math.cos(ang - 0.12) * r, y + Math.sin(ang - 0.12) * r - rise + 8);
    }
  }

  private summonGlyph(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, kind: SummonKind, color: number, alpha: number, now: number) {
    const p = (dx: number, dy: number) => ({ x: x + dx * r, y: y + dy * r });
    g.lineStyle(1.5, color, alpha * 0.5).strokeCircle(x, y, r * 1.3);
    if (kind === 'soulThunder') {
      g.fillStyle(color, alpha * 0.25).fillPoints([p(0.2, -1), p(-0.55, 0.1), p(-0.05, 0.1), p(-0.25, 1), p(0.65, -0.25), p(0.1, -0.25)] as Phaser.Math.Vector2[], true);
      g.lineStyle(3, 0xe5efff, alpha).strokePoints([p(0.2, -1), p(-0.55, 0.1), p(0.2, 0.1), p(-0.25, 1)] as Phaser.Math.Vector2[], false);
      for (const side of [-1, 1]) g.lineStyle(2, color, alpha).strokePoints([p(side * 0.7, -0.7), p(side, -0.2), p(side * 0.75, 0.15), p(side, 0.65)] as Phaser.Math.Vector2[], false);
    } else if (kind === 'soulFire') {
      for (let k = 0; k < 5; k++) {
        const a = Math.PI + k * Math.PI / 4;
        const tip = { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
        g.lineStyle(2, color, alpha).strokePoints([{ x: x - 12, y: y + r * 0.5 }, tip, { x: x + 12, y: y + r * 0.5 }] as Phaser.Math.Vector2[], false);
      }
      g.fillStyle(0xfff0b0, alpha).fillPoints([p(-0.3, 0.5), p(-0.45, -0.05), p(0, -0.85), p(0.15, -0.1), p(0.4, -0.35), p(0.35, 0.5)] as Phaser.Math.Vector2[], true);
    } else if (kind === 'soulTree') {
      g.lineStyle(3, color, alpha).lineBetween(x, y + r, x, y - r * 0.9);
      for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
        const root = p(0, 0.5 - k * 0.55), tip = p(side * (0.85 - k * 0.15), -k * 0.5);
        g.lineStyle(2, color, alpha).lineBetween(root.x, root.y, tip.x, tip.y);
        g.fillStyle(0xd1f5a6, alpha * 0.85).fillEllipse(tip.x, tip.y, 10, 5);
      }
      g.lineStyle(2, color, alpha).lineBetween(x, y + r * 0.6, x - r * 0.6, y + r).lineBetween(x, y + r * 0.6, x + r * 0.6, y + r);
    } else {
      // Crescent gate, hood and hollow eyes, rather than another star-shaped seal.
      const rot = Math.sin(now * 1.3) * 0.1;
      g.lineStyle(4, color, alpha).beginPath().arc(x, y, r, -1.2 + rot, 1.8 + rot, false).strokePath();
      g.lineStyle(2, 0xe8ddff, alpha * 0.7).beginPath().arc(x, y, r * 0.8, -1.2 + rot, 1.8 + rot, false).strokePath();
      g.lineStyle(2, color, alpha).strokePoints([p(-0.55, 0.65), p(-0.5, -0.3), p(0, -0.8), p(0.5, -0.3), p(0.55, 0.65)] as Phaser.Math.Vector2[], false);
      g.fillStyle(0xe8ddff, alpha).fillEllipse(x, y, r * 0.6, r * 0.65);
      g.fillStyle(0x1a0b25, alpha).fillCircle(x - r * 0.12, y - r * 0.06, r * 0.08).fillCircle(x + r * 0.12, y - r * 0.06, r * 0.08);
    }
  }

  /** A summon impact lights only a circle around its caster, following them as it fades. */
  summonPulse(getPos: () => { x: number; y: number }, color: number, alpha: number) {
    this.effect('over', 0.26, (g, t) => {
      const { x, y } = getPos();
      for (let layer = 8; layer >= 1; layer--) {
        g.fillStyle(0x04050b, alpha * 0.08 * (1 - t)).fillCircle(x, y, SUMMON_LIGHT_RADIUS * layer / 8);
      }
    });
    this.effect('glow', 0.26, (g, t) => {
      const { x, y } = getPos();
      for (let layer = 8; layer >= 1; layer--) {
        g.fillStyle(color, alpha * 0.15 * (1 - t)).fillCircle(x, y, SUMMON_LIGHT_RADIUS * layer / 8);
      }
      g.lineStyle(3 * (1 - t), color, alpha * (1 - t)).strokeCircle(x, y, SUMMON_LIGHT_RADIUS * (0.7 + t * 0.3));
    });
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
    this.effect('over', 0.85, (g, t) => {
      const grow = Math.min(1, t * 5), fade = Math.min(1, (1 - t) * 3);
      // Roots climb into a living cage, with pale leaves at the tips.
      for (const side of [-1, 1]) {
        const pts = Array.from({ length: 9 }, (_, k) => {
          const u = k / 8;
          return { x: x + side * (32 - Math.sin(u * Math.PI) * 14), y: y + 10 - u * 75 * grow };
        });
        g.lineStyle(6, 0x3b3920, fade * 0.8).strokePoints(pts as Phaser.Math.Vector2[], false);
        g.lineStyle(2, 0xa5d884, fade * 0.8).strokePoints(pts as Phaser.Math.Vector2[], false);
        for (const k of [3, 5, 7]) {
          const p = pts[k];
          g.fillStyle(0xc7f3a2, fade * 0.8).fillEllipse(p.x + side * 7, p.y - 3, 13, 6);
        }
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
    this.effect('glow', 0.65, (g, t) => {
      const fade = 1 - t;
      const rise = Math.sin(Math.min(1, t * 2 + 0.15) * Math.PI / 2);
      // Seven tapered tongues replace the rectangular light column.
      for (let k = -3; k <= 3; k++) {
        const px = x + k * 9;
        const h = (110 - Math.abs(k) * 20) * rise;
        const sway = Math.sin(t * 12 + k * 1.7) * 8;
        g.fillStyle(k % 2 ? 0xffa63d : 0xffd878, fade * 0.45).fillPoints([
          { x: px - 10, y: y + 6 }, { x: px - 7, y: y - h * 0.4 },
          { x: px + sway, y: y - h }, { x: px + 5, y: y - h * 0.55 }, { x: px + 12, y: y + 6 },
        ] as Phaser.Math.Vector2[], true);
      }
      g.fillStyle(0xfff4c5, 0.75 * fade).fillEllipse(x, y - 15, 20 * fade + 3, 45 * rise);
      g.lineStyle(3 * fade, 0xffd27a, 0.75 * fade).strokeEllipse(x, y + 5, 50 + t * 80, 22 + t * 35);
    });
    this.effect('floor', 1.1, (g, t) => {
      g.fillStyle(0x2a1408, 0.25 * (1 - t)).fillCircle(x, y, 30);
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        const r = 24 + Math.min(1, t * 4) * 22;
        const p = (d: number, off: number) => ({ x: x + Math.cos(a + off) * d, y: y + Math.sin(a + off) * d * 0.6 });
        g.lineStyle(2, 0xffb03a, 0.6 * (1 - t)).strokePoints([p(6, 0), p(r * 0.7, -0.2), p(r, 0), p(r * 0.7, 0.2), p(6, 0)] as Phaser.Math.Vector2[], false);
      }
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
