import {
  BODY_RADIUS, DAMAGE_PER_SEC, HITSTUN_PER_CYCLE, KNOCKBACK_PER_SEC,
  PE_COST_PER_SEC, WEAPON_AREA,
} from './config';

/** Hit shapes, all relative to the attacker's centre and facing angle. */
export type Shape =
  | { kind: 'sector'; radius: number; angle: number }
  | { kind: 'rect'; offset: number; length: number; width: number }
  | { kind: 'circle'; offset: number; radius: number }
  | { kind: 'ring'; inner: number; outer: number }
  /** A curved band: the part of a sector between two radii. */
  | { kind: 'arc'; inner: number; outer: number; angle: number }
  /** A plus sign centred on the fighter: arms of length `arm` (from the centre) and width `width`. */
  | { kind: 'cross'; arm: number; width: number }
  /** A bar straight through the fighter: `length` out in front and the same behind. */
  | { kind: 'twin'; length: number; width: number }
  /** `count` thin rays fanning out `spread` apart, from `offset` out to `offset + length`. */
  | { kind: 'rays'; offset: number; length: number; width: number; spread: number; count: number };

export type WeaponId = 'fan' | 'shuriken' | 'hammer' | 'daggers' | 'flail' | 'kusarigama' | 'bomb' | 'ninjato' | 'talisman' | 'staff' | 'kunai';

export interface Weapon {
  id: WeaponId;
  name: string;
  zh: string;
  shape: Shape;
  /** Seconds per full attack (windup + active + recovery). Lower = faster. */
  cycle: number;
  windup: number;
  active: number;
  damage: number;
  knockback: number;
  /** Speed of a forward lunge during the active frames, if the weapon has one (px/s). */
  lunge?: number;
  peCost: number;
  hitstun: number;
}

const A = WEAPON_AREA;

// Each shape fixes one free dimension and solves the other so area === WEAPON_AREA.
const sector = (angleDeg: number): Shape => {
  const angle = (angleDeg * Math.PI) / 180;
  return { kind: 'sector', angle, radius: Math.sqrt((2 * A) / angle) };
};
const rect = (width: number, offset: number): Shape => ({ kind: 'rect', width, offset, length: A / width });
const circle = (gap: number): Shape => {
  const radius = Math.sqrt(A / Math.PI);
  return { kind: 'circle', radius, offset: BODY_RADIUS + gap + radius };
};
const ring = (inner: number): Shape => ({ kind: 'ring', inner, outer: Math.sqrt(A / Math.PI + inner * inner) });
const cross = (width: number): Shape => ({ kind: 'cross', width, arm: (A + width * width) / (4 * width) });
const arc = (inner: number, angleDeg: number): Shape => {
  const angle = (angleDeg * Math.PI) / 180;
  return { kind: 'arc', inner, angle, outer: Math.sqrt((2 * A) / angle + inner * inner) };
};

const twin = (width: number): Shape => ({ kind: 'twin', width, length: A / (2 * width) });
const rays = (width: number, spreadDeg: number, count = 3): Shape => ({
  kind: 'rays', width, count, offset: BODY_RADIUS, spread: (spreadDeg * Math.PI) / 180, length: A / (count * width),
});

function make(id: WeaponId, name: string, zh: string, shape: Shape, cycle: number): Weapon {
  return {
    id, name, zh, shape, cycle,
    windup: cycle * 0.45,
    active: 0.08,
    damage: DAMAGE_PER_SEC * cycle,
    knockback: KNOCKBACK_PER_SEC * cycle,
    peCost: PE_COST_PER_SEC * cycle,
    hitstun: HITSTUN_PER_CYCLE * cycle,
  };
}

export const WEAPONS: Weapon[] = [
  // Fan-shaped flame sweep.
  make('fan', 'Fire Fan', '火扇', sector(110), 0.55),
  // A shuriken streaking down a long, narrow line.
  make('shuriken', 'Shuriken', '手裡劍', rect(32, BODY_RADIUS), 0.8),
  make('hammer', 'Hammer', '大錘', circle(-10), 1.1),
  make('daggers', 'Daggers', '雙匕', rect(110, 6), 0.32),
  make('flail', 'Flail', '流星錘', ring(36), 0.85),
  // Sickle on a chain: a curved band at mid range, with a blind spot up close.
  make('kusarigama', 'Kusarigama', '鎖鐮', arc(60, 130), 0.7),
  // Thrown bomb: the same circle as the hammer, but landing far away. Slowest, hardest-hitting.
  make('bomb', 'Fire Bomb', '焙烙玉', circle(104), 1.2),
  // A lunging slash: you dash forward through a long, narrow strip.
  { ...make('ninjato', 'Ninjato', '忍刀', rect(56, 10), 0.6), lunge: 850 },
  // Lightning strikes in a cross around you, all four directions at once.
  make('talisman', 'Thunder Talisman', '雷符', cross(34), 0.9),
  // A staff swung through both ends at once: hits in front and behind.
  make('staff', 'Bō Staff', '棍', twin(34), 0.65),
  // Three kunai thrown in a fan: long reach, but with gaps between them.
  make('kunai', 'Kunai Volley', '苦無', rays(17, 20), 0.75),
];

export function shapeArea(s: Shape): number {
  switch (s.kind) {
    case 'sector': return 0.5 * s.radius * s.radius * s.angle;
    case 'rect': return s.length * s.width;
    case 'circle': return Math.PI * s.radius * s.radius;
    case 'ring': return Math.PI * (s.outer * s.outer - s.inner * s.inner);
    case 'arc': return 0.5 * s.angle * (s.outer * s.outer - s.inner * s.inner);
    case 'cross': return 4 * s.arm * s.width - s.width * s.width;
    case 'twin': return 2 * s.length * s.width;
    case 'rays': return s.count * s.length * s.width;
  }
}

/** Furthest distance from the attacker's centre the shape reaches. */
export function shapeReach(s: Shape): number {
  switch (s.kind) {
    case 'sector': return s.radius;
    case 'rect': return s.offset + s.length;
    case 'circle': return s.offset + s.radius;
    case 'ring': return s.outer;
    case 'arc': return s.outer;
    case 'cross': return s.arm;
    case 'twin': return s.length;
    case 'rays': return s.offset + s.length;
  }
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Does a circular body (tx, ty, tr) overlap shape s cast from (ox, oy) facing `facing`? */
export function shapeHits(
  s: Shape, ox: number, oy: number, facing: number, tx: number, ty: number, tr: number,
): boolean {
  const dx = tx - ox;
  const dy = ty - oy;
  const d = Math.hypot(dx, dy);
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  switch (s.kind) {
    case 'sector': {
      if (d > s.radius + tr) return false;
      if (d <= tr) return true;
      const diff = Math.abs(wrapAngle(Math.atan2(dy, dx) - facing));
      return diff <= s.angle / 2 + Math.asin(Math.min(1, tr / d));
    }
    case 'rect': {
      const lx = dx * fx + dy * fy;
      const ly = -dx * fy + dy * fx;
      const cx = Math.max(s.offset, Math.min(s.offset + s.length, lx));
      const cy = Math.max(-s.width / 2, Math.min(s.width / 2, ly));
      return Math.hypot(lx - cx, ly - cy) <= tr;
    }
    case 'circle': {
      const cx = ox + fx * s.offset;
      const cy = oy + fy * s.offset;
      return Math.hypot(tx - cx, ty - cy) <= s.radius + tr;
    }
    case 'ring':
      return d <= s.outer + tr && d >= s.inner - tr;
    case 'cross': {
      // Two rectangles through the centre, along and across the facing.
      const lx = dx * fx + dy * fy;
      const ly = -dx * fy + dy * fx;
      const inBar = (a: number, b: number) => Math.hypot(a - Math.max(-s.arm, Math.min(s.arm, a)), b - Math.max(-s.width / 2, Math.min(s.width / 2, b))) <= tr;
      return inBar(lx, ly) || inBar(ly, lx);
    }
    case 'arc': {
      if (d > s.outer + tr || d < s.inner - tr) return false;
      const diff = Math.abs(wrapAngle(Math.atan2(dy, dx) - facing));
      return diff <= s.angle / 2 + Math.asin(Math.min(1, tr / Math.max(d, tr)));
    }
    case 'twin': {
      const lx = dx * fx + dy * fy;
      const ly = -dx * fy + dy * fx;
      const cx = Math.max(-s.length, Math.min(s.length, lx));
      const cy = Math.max(-s.width / 2, Math.min(s.width / 2, ly));
      return Math.hypot(lx - cx, ly - cy) <= tr;
    }
    case 'rays':
      return rayAngles(s, facing).some((a) =>
        shapeHits({ kind: 'rect', offset: s.offset, length: s.length, width: s.width }, ox, oy, a, tx, ty, tr));
  }
}

/** The facing of each ray in a 'rays' shape. */
export function rayAngles(s: Extract<Shape, { kind: 'rays' }>, facing: number): number[] {
  return Array.from({ length: s.count }, (_, k) => facing + (k - (s.count - 1) / 2) * s.spread);
}

export function drawShape(
  g: Phaser.GameObjects.Graphics, s: Shape, ox: number, oy: number, facing: number,
  color: number, alpha: number,
): void {
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  g.fillStyle(color, alpha);
  switch (s.kind) {
    case 'sector':
      g.beginPath();
      g.slice(ox, oy, s.radius, facing - s.angle / 2, facing + s.angle / 2, false);
      g.fillPath();
      break;
    case 'rect': {
      const px = -fy * (s.width / 2);
      const py = fx * (s.width / 2);
      const nx = ox + fx * s.offset;
      const ny = oy + fy * s.offset;
      const far = s.offset + s.length;
      const ex = ox + fx * far;
      const ey = oy + fy * far;
      g.fillPoints([
        { x: nx + px, y: ny + py }, { x: ex + px, y: ey + py },
        { x: ex - px, y: ey - py }, { x: nx - px, y: ny - py },
      ] as Phaser.Math.Vector2[], true);
      break;
    }
    case 'circle':
      g.fillCircle(ox + fx * s.offset, oy + fy * s.offset, s.radius);
      break;
    case 'ring':
      g.lineStyle(s.outer - s.inner, color, alpha);
      g.strokeCircle(ox, oy, (s.outer + s.inner) / 2);
      break;
    case 'cross':
      for (const rot of [0, Math.PI / 2]) {
        const c = Math.cos(facing + rot);
        const sn = Math.sin(facing + rot);
        const px = -sn * (s.width / 2);
        const py = c * (s.width / 2);
        g.fillPoints([
          { x: ox - c * s.arm + px, y: oy - sn * s.arm + py }, { x: ox + c * s.arm + px, y: oy + sn * s.arm + py },
          { x: ox + c * s.arm - px, y: oy + sn * s.arm - py }, { x: ox - c * s.arm - px, y: oy - sn * s.arm - py },
        ] as Phaser.Math.Vector2[], true);
      }
      break;
    case 'arc':
      g.lineStyle(s.outer - s.inner, color, alpha);
      g.beginPath();
      g.arc(ox, oy, (s.outer + s.inner) / 2, facing - s.angle / 2, facing + s.angle / 2, false);
      g.strokePath();
      break;
    case 'twin': {
      const px = -fy * (s.width / 2);
      const py = fx * (s.width / 2);
      g.fillPoints([
        { x: ox - fx * s.length + px, y: oy - fy * s.length + py }, { x: ox + fx * s.length + px, y: oy + fy * s.length + py },
        { x: ox + fx * s.length - px, y: oy + fy * s.length - py }, { x: ox - fx * s.length - px, y: oy - fy * s.length - py },
      ] as Phaser.Math.Vector2[], true);
      break;
    }
    case 'rays':
      for (const a of rayAngles(s, facing)) drawShape(g, { kind: 'rect', offset: s.offset, length: s.length, width: s.width }, ox, oy, a, color, alpha);
      break;
  }
}

/**
 * Does shape s overlap the axis-aligned rectangle (centre cx, cy; size w, h)?
 * Approximated by testing the rectangle's closest point to the attacker plus
 * points around its edge, which is plenty for chunky obstacles.
 */
export function shapeHitsRect(
  s: Shape, ox: number, oy: number, facing: number, cx: number, cy: number, w: number, h: number,
): boolean {
  const l = cx - w / 2;
  const t = cy - h / 2;
  const pts: [number, number][] = [[Math.max(l, Math.min(l + w, ox)), Math.max(t, Math.min(t + h, oy))]];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const fx = l + (w * i) / n;
    const fy = t + (h * i) / n;
    pts.push([fx, t], [fx, t + h], [l, fy], [l + w, fy]);
  }
  return pts.some(([px, py]) => shapeHits(s, ox, oy, facing, px, py, 2));
}
