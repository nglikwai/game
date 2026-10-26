import { QUEST } from './config';

export interface SpiritLantern {
  x: number;
  y: number;
  team: number;
  w: number;
  h: number;
  radius: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Pushed all the way to the enemy side. */
  arrived: boolean;
  /** Pushed all the way back to the party side. */
  lost: boolean;
  moving: boolean;
  /** 1 toward the enemy side, -1 back toward the party, 0 stopped. */
  push: -1 | 0 | 1;
  /** 0 on the party side, 0.5 at the center, 1 on the enemy side. */
  progress: number;
  distance: number;
  speed: number;
  left: number;
  right: number;
  path: { x: number; y: number }[];
}

/** The lantern begins at the middle of the lane, halfway between the two sides. */
export function createLantern(partySize: number, scale: number, hudHeight: number): SpiritLantern {
  const path = QUEST.escort.path.map((p) => ({ x: p.x * scale, y: (p.y - hudHeight) * scale }));
  const hp = QUEST.escort.hpBase + QUEST.escort.hpPerPlayer * Math.max(1, partySize);
  const start = path[1];
  const span = path[2].x - path[0].x;
  const progress = span > 0 ? (start.x - path[0].x) / span : 0.5;
  return {
    ...start, team: 0, w: 40 * scale, h: 48 * scale, radius: QUEST.escort.radius * scale,
    hp, maxHp: hp, alive: true, arrived: false, lost: false, moving: false, push: 0,
    progress: Math.abs(progress - 0.5) < 1e-9 ? 0.5 : progress, distance: 0,
    speed: QUEST.escort.speed * scale, left: path[0].x, right: path[2].x, path,
  };
}

/**
 * Two living allies and no enemies push toward the enemy side. Enemies alone push
 * backward. Both sides inside the circle, or fewer than two allies with nobody
 * opposing them, leaves the lantern where it is.
 */
export function advanceLantern(lantern: SpiritLantern, fighters: { x: number; y: number; team: number; alive: boolean }[], dt: number): void {
  lantern.moving = false;
  lantern.push = 0;
  if (!lantern.alive || lantern.arrived || lantern.lost || dt <= 0) return;
  const inside = (f: { x: number; y: number; alive: boolean }) => f.alive && Math.hypot(f.x - lantern.x, f.y - lantern.y) <= lantern.radius;
  const allies = fighters.filter((f) => f.team === lantern.team && inside(f)).length;
  const foes = fighters.filter((f) => f.team !== lantern.team && inside(f)).length;
  const push: -1 | 0 | 1 = allies > 0 && foes > 0 ? 0 : foes > 0 ? -1 : allies >= QUEST.escort.allies ? 1 : 0;
  lantern.push = push;
  lantern.moving = push !== 0;
  if (!push) return;
  const step = lantern.speed * dt;
  const next = lantern.x + push * step;
  const reached = push > 0 ? next >= lantern.right - 1e-4 : next <= lantern.left + 1e-4;
  if (reached) {
    lantern.distance += push > 0 ? lantern.right - lantern.x : lantern.x - lantern.left;
    lantern.x = push > 0 ? lantern.right : lantern.left;
    lantern.progress = push > 0 ? 1 : 0;
    lantern.arrived = push > 0;
    lantern.lost = push < 0;
    lantern.moving = false;
    lantern.push = 0;
    return;
  }
  lantern.x = next;
  lantern.distance += step;
  const span = lantern.right - lantern.left;
  const progress = span > 0 ? (lantern.x - lantern.left) / span : 0.5;
  lantern.progress = Math.abs(progress - 0.5) < 1e-9 ? 0.5 : progress;
}

/** Distance from a point to the closest spot on the lantern lane, for keeping chests off it. */
export function distanceToEscortPath(point: { x: number; y: number }, path: { x: number; y: number }[]): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t)));
  }
  return best;
}
