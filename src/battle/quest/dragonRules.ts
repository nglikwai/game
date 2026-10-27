import { ELEMENT, QUEST } from '@/config';
import { type DragonElement } from '@/battle/types';

/** The heads take turns in this order, skipping any that have fallen. */
export const DRAGON_ORDER: readonly DragonElement[] = ['fire', 'ice', 'thunder'];

export const DRAGON_COLORS: Record<DragonElement, number> = { fire: 0xff6a2a, ice: 0x8fd8ff, thunder: 0xb08aff };

/** First intersection of a ray with a solid rectangle; parallel rays remain finite. */
export function dragonRayEntry(x: number, y: number, angle: number, rect: { x: number; y: number; width: number; height: number }): number | null {
  let enter = 0;
  let exit = Infinity;
  for (const [origin, direction, lo, hi] of [
    [x, Math.cos(angle), rect.x, rect.x + rect.width],
    [y, Math.sin(angle), rect.y, rect.y + rect.height],
  ]) {
    if (Math.abs(direction) < 1e-9) {
      if (origin < lo || origin > hi) return null;
      continue;
    }
    const a = (lo - origin) / direction;
    const b = (hi - origin) / direction;
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
  }
  return enter <= exit ? enter : null;
}

/** A round fighter touching the beam segment, including either endpoint. */
export function touchesDragonBeam(x: number, y: number, radius: number, from: { x: number; y: number }, angle: number, length: number, width: number): boolean {
  const c = Math.cos(angle), s = Math.sin(angle);
  const along = Math.max(0, Math.min(length, (x - from.x) * c + (y - from.y) * s));
  return Math.hypot(x - from.x - along * c, y - from.y - along * s) <= radius + width / 2;
}

/** Which living head shoots next after `last` (or the first in order if none has yet). */
export function nextDragonHead(alive: readonly DragonElement[], last: DragonElement | null): DragonElement | null {
  if (alive.length === 0) return null;
  const start = last ? DRAGON_ORDER.indexOf(last) + 1 : 0;
  for (let k = 0; k < DRAGON_ORDER.length; k++) {
    const e = DRAGON_ORDER[(start + k) % DRAGON_ORDER.length]!;
    if (alive.includes(e)) return e;
  }
  return null;
}

/** Seconds between shots: each lost head makes the rest faster; while guards still fight, the dragon holds back. */
export function dragonInterval(aliveHeads: number, guardsStanding = false): number {
  const lost = Math.max(0, DRAGON_ORDER.length - aliveHeads);
  return (QUEST.dragon.interval / QUEST.dragon.speedUpPerLostHead ** lost) * (guardsStanding ? QUEST.dragon.guardPhaseSlow : 1);
}

/** Turn `from` toward `to` (radians) by at most `maxStep`, the short way round. */
export function turnToward(from: number, to: number, maxStep: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return from + Math.max(-maxStep, Math.min(maxStep, diff));
}

/** Does the aim still follow its target, or has it locked for the shot? */
export const aimFollows = (elapsed: number, warn: number, lock: number) => elapsed < warn - lock;

/**
 * One step of the dragon's walk: back away from a fighter who is too close, close in on one who is too far,
 * otherwise drift to line up with them. Always kept inside `bounds`.
 */
export function dragonStep(
  at: { x: number; y: number }, target: { x: number; y: number } | null, keep: number, speed: number, dt: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): { x: number; y: number; vx: number; vy: number } {
  let vx = 0;
  let vy = 0;
  if (target) {
    const dx = at.x - target.x;
    const dy = at.y - target.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < keep * 0.85) { vx = (dx / d) * speed; vy = (dy / d) * speed; }
    else if (d > keep * 1.25) { vx = (-dx / d) * speed; vy = (-dy / d) * speed; }
    else vy = Math.max(-1, Math.min(1, -dy / 60)) * speed * 0.6;
  }
  const x = Math.max(bounds.minX, Math.min(bounds.maxX, at.x + vx * dt));
  const y = Math.max(bounds.minY, Math.min(bounds.maxY, at.y + vy * dt));
  return { x, y, vx: (x - at.x) / (dt || 1), vy: (y - at.y) / (dt || 1) };
}

/** What a target's current condition is, as far as an element hit cares. */
export interface ElementTarget {
  frostT: number;
  frozen: boolean;
}

/** What an element hit does to one target. */
export interface ElementOutcome {
  damage: number;
  burn?: number;
  frost?: number;
  freeze?: number;
  paralyze?: number;
  peDrain?: number;
  /** Fire melted the ice the target was frozen in. */
  melt?: boolean;
  /** Lightning conducted through frost for extra damage. */
  conduct?: boolean;
}

/**
 * The element rules, kept pure so they can be tested on their own.
 * - Fire: damage and a burn. On a frozen target, it also melts the ice.
 * - Ice: damage and frostbite. On a target that is already frostbitten, it freezes them solid.
 * - Thunder: damage, a short paralysis and lost PE. Frost conducts it for extra damage.
 * `share` scales the damage and paralysis of a lightning chain.
 */
export function resolveElementHit(element: DragonElement, t: ElementTarget, share = 1): ElementOutcome {
  const d = QUEST.dragon;
  if (element === 'fire') return { damage: d.fire.damage, burn: d.fire.burn, melt: t.frozen };
  if (element === 'ice') {
    return t.frostT > 0 ? { damage: d.ice.damage, frost: d.ice.frost, freeze: d.ice.freeze } : { damage: d.ice.damage, frost: d.ice.frost };
  }
  const conduct = t.frostT > 0;
  return {
    damage: d.thunder.damage * share * (conduct ? ELEMENT.conduct : 1),
    paralyze: share < 1 ? d.thunder.chainParalyze : d.thunder.paralyze,
    peDrain: d.thunder.peDrain * share,
    conduct,
  };
}
