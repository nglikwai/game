import { QUEST } from '@/config';
import { type WyvernKind } from '@/battle/types';
import { dragonStep } from '@/battle/quest/dragonRules';

/** The Sun Wyvern burns gold; the Moon Wyvern glows cold silver-blue. */
export const WYVERN_COLORS: Record<WyvernKind, number> = { sun: 0xffb43a, moon: 0x9fc4ff };

/** The chain of light between the two wyverns. */
export const TETHER_COLOR = 0xd9c2ff;

type Point = { x: number; y: number };
type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

/** Distance from `p` to the segment a–b. */
export function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/**
 * One step of a wyvern's walk: keep its distance from the nearest fighter like the three-headed dragon,
 * but also stay between `minGap` and `maxGap` from its partner, so the chain between them keeps sweeping the gorge.
 */
export function wyvernStep(
  at: Point, target: Point | null, partner: Point | null, keep: number, speed: number, dt: number, bounds: Bounds,
  minGap: number, maxGap: number,
): { x: number; y: number; vx: number; vy: number } {
  const step = dragonStep(at, target, keep, speed, dt, bounds);
  let { x, y } = step;
  if (partner) {
    const dx = x - partner.x;
    const dy = y - partner.y;
    const d = Math.hypot(dx, dy) || 1;
    const push = d < minGap ? 1 : d > maxGap ? -1 : 0;
    x += (dx / d) * push * speed * 0.8 * dt;
    y += (dy / d) * push * speed * 0.8 * dt;
  }
  x = Math.max(bounds.minX, Math.min(bounds.maxX, x));
  y = Math.max(bounds.minY, Math.min(bounds.maxY, y));
  return { x, y, vx: (x - at.x) / (dt || 1), vy: (y - at.y) / (dt || 1) };
}

/** Seconds between a wyvern's attacks: faster when its partner is down, slower while guards still fight. */
export function wyvernInterval(enraged: boolean, guardsStanding: boolean): number {
  const w = QUEST.wyverns;
  return (w.interval / (enraged ? w.enrage : 1)) * (guardsStanding ? w.guardPhaseSlow : 1);
}

/**
 * The bond between the two wyverns, for one of them. A fallen wyvern rises again `after` seconds later while its
 * partner stands. If the partner falls too before that, both stay down for good.
 */
export function bondStep(selfAlive: boolean, partnerAlive: boolean, reviveT: number, dt: number, after: number): { reviveT: number; rise: boolean } {
  if (selfAlive || !partnerAlive) return { reviveT: -1, rise: false };
  if (reviveT < 0) return { reviveT: after, rise: false };
  const left = reviveT - dt;
  return left <= 0 ? { reviveT: -1, rise: true } : { reviveT: left, rise: false };
}

/** `count` gaps in a frost ring, evenly spaced and turned by a random amount. */
export function ringGaps(count: number, random: () => number = Math.random): number[] {
  const turn = random() * Math.PI * 2;
  return Array.from({ length: count }, (_, k) => turn + (k / count) * Math.PI * 2);
}

/** Is `angle` inside one of the ring's gaps (each `width` radians wide)? */
export function inRingGap(angle: number, gaps: readonly number[], width: number): boolean {
  return gaps.some((g) => {
    let d = angle - g;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d) <= width / 2;
  });
}

/** Does the ring's front (radius `r`, `thickness` thick) touch a fighter of `radius` standing `dist` from its centre? */
export const ringTouches = (r: number, dist: number, thickness: number, radius: number) => Math.abs(dist - r) <= thickness / 2 + radius;

/** Where a charge along `angle` from `from` ends: `length` away, or sooner where it would leave `bounds`. */
export function chargeEnd(from: Point, angle: number, length: number, bounds: Bounds): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  let reach = length;
  if (c > 1e-9) reach = Math.min(reach, (bounds.maxX - from.x) / c);
  if (c < -1e-9) reach = Math.min(reach, (bounds.minX - from.x) / c);
  if (s > 1e-9) reach = Math.min(reach, (bounds.maxY - from.y) / s);
  if (s < -1e-9) reach = Math.min(reach, (bounds.minY - from.y) / s);
  reach = Math.max(0, reach);
  return { x: from.x + c * reach, y: from.y + s * reach };
}
