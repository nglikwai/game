import type { Controller, RumbleTone } from '@/input/contracts';

/**
 * Every controller vibration in one place. Strength is 0–1, times are in ms.
 * Each kind has its own feel: sharp ticks for your own actions, deep thuds for being hurt, pulses for 魂.
 * On directly connected Joy-Cons / Pro Controllers the tone changes the HD rumble pitch.
 */
export const RUMBLE = {
  /** Your weapon lands: a crisp kick, harder for heavier hits (by damage dealt). */
  hit: { base: 0.3, perDamage: 1 / 25, ms: 50, msPerStrength: 90 },
  /** You get hit: a duller, longer thud, by damage taken. */
  hurt: { base: 0.35, perDamage: 1 / 30, ms: 90, msPerStrength: 100 },
  /** Knocked out (or swallowed by a sand pit): one long, full-strength rumble. */
  ko: { strength: 1, ms: 500 },
  /** A Revival Pill saves you: three rising pulses. */
  revive: { strengths: [0.4, 0.6, 0.85], ms: 80, gap: 150 },
  /** HP drops below this share of max: a heartbeat (two quick beats), once until you heal back above it. */
  lowHp: { below: 0.3, strength: 0.6, ms: 60, gap: 140 },
  /** Any skill cast: a light tick. */
  skill: { strength: 0.25, ms: 40 },
  /** A 魂 summon (天雷, 聖火, 神樹, 死神) lands: a boom that grows with the level spent. */
  summon: { base: 0.6, perLevel: 0.1, ms: 200, msPerLevel: 60 },
  /** 暴走 begins: a deep roar that grows with the level spent. */
  rage: { base: 0.6, perLevel: 0.1, ms: 300, msPerLevel: 100 },
  /** 見切 blocks a hit: a sharp snap. */
  counter: { strength: 0.85, ms: 70 },
  /** A barrel blows up near you: strong up close, fading out to `reach` × its blast radius. */
  blast: { max: 1, min: 0.3, reach: 1.8, ms: 220 },
  /** 魂 reaching level N: N pulses, stronger each level; level 4 ends on a long one. */
  soul: { base: 0.4, perLevel: 0.15, ms: 90, gap: 170, finishMs: 260 },
} as const;

type Pad = Controller | undefined | null;

/** `count` short buzzes in a row (does nothing on a controller that can't vibrate). */
export function rumblePulses(controller: Pad, count: number, strength: number | readonly number[], ms = 90, gap = 170): void {
  if (!controller?.rumble) return;
  for (let k = 0; k < count; k++) {
    const s = typeof strength === 'number' ? strength : strength[k] ?? strength[strength.length - 1]!;
    if (k === 0) controller.rumble(s, ms);
    else setTimeout(() => controller.rumble?.(s, ms), k * gap);
  }
}

const once = (controller: Pad, strength: number, ms: number, tone: RumbleTone = 'normal') =>
  controller?.rumble?.(Math.min(1, strength), Math.round(ms), tone);

export function rumbleHit(controller: Pad, damage: number): void {
  const r = RUMBLE.hit, s = Math.min(1, r.base + damage * r.perDamage);
  once(controller, s, r.ms + s * r.msPerStrength, 'sharp');
}

export function rumbleHurt(controller: Pad, damage: number): void {
  const r = RUMBLE.hurt, s = Math.min(1, r.base + damage * r.perDamage);
  once(controller, s, r.ms + s * r.msPerStrength, 'deep');
}

export const rumbleKO = (controller: Pad) => once(controller, RUMBLE.ko.strength, RUMBLE.ko.ms, 'deep');

export const rumbleRevive = (controller: Pad) =>
  rumblePulses(controller, RUMBLE.revive.strengths.length, RUMBLE.revive.strengths, RUMBLE.revive.ms, RUMBLE.revive.gap);

export const rumbleLowHp = (controller: Pad) => rumblePulses(controller, 2, RUMBLE.lowHp.strength, RUMBLE.lowHp.ms, RUMBLE.lowHp.gap);

export const rumbleSkill = (controller: Pad) => once(controller, RUMBLE.skill.strength, RUMBLE.skill.ms, 'sharp');

export function rumbleSummon(controller: Pad, level: number): void {
  const r = RUMBLE.summon;
  once(controller, r.base + r.perLevel * level, r.ms + r.msPerLevel * level, 'deep');
}

export function rumbleRage(controller: Pad, level: number): void {
  const r = RUMBLE.rage;
  once(controller, r.base + r.perLevel * level, r.ms + r.msPerLevel * level, 'deep');
}

export const rumbleCounter = (controller: Pad) => once(controller, RUMBLE.counter.strength, RUMBLE.counter.ms, 'sharp');

/** `closeness` is 1 at the barrel and 0 at the edge of the felt range. */
export function rumbleBlast(controller: Pad, closeness: number): void {
  const r = RUMBLE.blast;
  if (closeness <= 0) return;
  once(controller, r.min + (r.max - r.min) * Math.min(1, closeness), r.ms, 'deep');
}

/** 魂 reaching level N: N pulses, each level stronger; a full meter (level 4) ends on a long one. */
export function rumbleSoulLevel(controller: Pad, level: number): void {
  const r = RUMBLE.soul;
  rumblePulses(controller, level, Math.min(1, r.base + r.perLevel * level), r.ms, r.gap);
  if (level >= 4 && controller?.rumble) setTimeout(() => controller.rumble?.(1, r.finishMs), level * r.gap);
}
