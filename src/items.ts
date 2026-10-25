import type { SkillEffect } from './skills';

/**
 * Items come out of treasure chests. Each one is the instant effect of a skill
 * (no PE cost, no cooldown) and is kept in the fighter's pocket until used.
 */

export const POCKET_SIZE = 3;

export type ItemEffect = SkillEffect | { kind: 'restorePe'; amount: number };

export interface Item {
  id: string;
  name: string;
  zh: string;
  desc: string;
  descZh: string;
  /** Character shown on the item's icon. */
  glyph: string;
  color: number;
  effect: ItemEffect;
  /** Relative drop chance. */
  weight: number;
  /** Only drops in team modes (it needs teammates). */
  teamOnly?: boolean;
}

export const ITEMS: Item[] = [
  {
    id: 'rice-ball', name: 'Rice Ball', zh: '飯團', glyph: '飯', color: 0x3f9b5a, weight: 30,
    desc: '+25 HP.', descZh: '回復25生命值。',
    effect: { kind: 'instantHeal', heal: 25 },
  },
  {
    id: 'stamina-tea', name: 'Stamina Tea', zh: '體力茶', glyph: '茶', color: 0xb08a2e, weight: 15,
    desc: '+60 PE.', descZh: '回復60體力。',
    effect: { kind: 'restorePe', amount: 60 },
  },
  {
    id: 'spirit-pill', name: 'Spirit Pill', zh: '靈氣丹', glyph: '靈', color: 0x3f7fd9, weight: 7,
    desc: 'Fully restore PE.', descZh: '體力立即全滿。',
    effect: { kind: 'restorePe', amount: 100 },
  },
  {
    id: 'fury-pill', name: 'Fury Pill', zh: '霸氣丹', glyph: '霸', color: 0xb8322a, weight: 12,
    desc: 'Fury for 5s.', descZh: '霸氣5秒。',
    effect: { kind: 'powerUp', multiplier: 1.5, duration: 5 },
  },
  {
    id: 'bell-charm', name: 'Golden Bell Charm', zh: '金鐘符', glyph: '金', color: 0xa8842c, weight: 12,
    desc: 'Golden Bell for 4s.', descZh: '金鐘罩4秒。',
    effect: { kind: 'guard', reduction: 0.5, duration: 4 },
  },
  {
    id: 'wind-charm', name: 'Wind Charm', zh: '疾風符', glyph: '風', color: 0x2f8fa8, weight: 12,
    desc: 'Sprint for 3s.', descZh: '疾走3秒。',
    effect: { kind: 'speedBuff', multiplier: 1.65, duration: 3 },
  },
  {
    id: 'fire-charm', name: 'Fire Charm', zh: '火球符', glyph: '火', color: 0xc8572a, weight: 12,
    desc: 'Throw a fireball.', descZh: '發射一顆火球。',
    effect: { kind: 'projectile', speed: 520, radius: 13, damage: 12, knockback: 520, hitstun: 0.35, range: 620, color: 0xff7a2a },
  },
  {
    id: 'revival-pill', name: 'Revival Pill', zh: '還魂丹', glyph: '魂', color: 0xc2417f, weight: 7,
    desc: 'Revive a fallen teammate beside you with 40 HP. Keep one in your pocket and it also saves you: when you would die, it revives you on the spot with 40 HP.',
    descZh: '復活倒下的隊友並召回身旁，回復40生命值。放在道具欄裡，自己將要死亡時也會自動使用，當場以40生命值復活。',
    effect: { kind: 'revive', fixedHp: 40 },
  },
];

export function rollItem(teams: boolean): Item {
  const pool = ITEMS.filter((it) => teams || !it.teamOnly);
  let r = Math.random() * pool.reduce((sum, it) => sum + it.weight, 0);
  for (const it of pool) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return pool[0];
}
