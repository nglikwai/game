import type { Role } from '@/gameplay/roles';

/**
 * One shared skill pool. Each fighter equips up to 4 different skills, in any
 * combination (a slot may also be left empty).
 */

/** Number of skill slots a fighter has. */
export const SKILL_SLOTS = 4;

export type SkillEffect =
  | { kind: 'channelHeal'; heal: number; duration: number }
  | { kind: 'instantHeal'; heal: number }
  /** Heal `heal` HP spread over `duration` s, while you keep moving and fighting. */
  | { kind: 'regen'; heal: number; duration: number }
  /**
   * `pull`: a hook on a chain that drags whoever it catches to the thrower instead of knocking them away.
   * `boomerang`: flies out `range`, then back to the thrower, cutting through everyone once each way.
   */
  | { kind: 'projectile'; speed: number; radius: number; damage: number; knockback: number; hitstun: number; range: number; color: number; pull?: boolean; boomerang?: boolean }
  | { kind: 'speedBuff'; multiplier: number; duration: number }
  | { kind: 'dash'; speed: number; duration: number }
  | { kind: 'powerUp'; multiplier: number; duration: number }
  /** For `duration` s, heal `share` of all the damage you deal. */
  | { kind: 'lifesteal'; share: number; duration: number }
  /** fixedHp: revive with this much HP instead of splitting the caster's (Revival Pill). */
  | { kind: 'revive'; fixedHp?: number }
  | { kind: 'guard'; reduction: number; duration: number }
  | { kind: 'stealth'; duration: number }
  /** The next hit within `window` seconds hits a log instead; you reappear a short way off. */
  | { kind: 'substitute'; window: number }
  /** Spikes on the ground: enemies inside are slowed and take `dps` damage per second. */
  | { kind: 'caltrops'; radius: number; duration: number; dps: number; slow: number }
  /**
   * Charge for `charge` seconds (rooted, still hittable), then pay hpCost of your own HP
   * (fatal at or below it) as enemies in `radius` take double that.
   */
  | { kind: 'sacrifice'; hpCost: number; radius: number; knockback: number; charge: number }
  /** Vanish and reappear at a random spot as far from enemies as possible. */
  | { kind: 'teleport' }
  /** Trade places with the nearest enemy within `range`. */
  | { kind: 'swap'; range: number }
  /** Blink to just behind the nearest enemy within `range`, facing their back. */
  | { kind: 'shadowStep'; range: number }
  /**
   * For `window` s, the next hit is blocked completely. If whoever struck is within `reach`, you strike back
   * for `damage`, knocking them away and stunning them for `stun` s.
   */
  | { kind: 'counter'; window: number; damage: number; knockback: number; stun: number; reach: number }
  /** Heal every living teammate (and yourself), wherever they are. */
  | { kind: 'teamHeal'; heal: number }
  /** Restore PE to every living teammate (and yourself). */
  | { kind: 'teamPe'; amount: number }
  /** Fury for the whole team. */
  | { kind: 'teamFury'; multiplier: number; duration: number }
  /** Golden-Bell style damage reduction for the whole team. */
  | { kind: 'teamGuard'; reduction: number; duration: number }
  /** Spends all full soul levels: lightning on that many nearest enemies, anywhere. */
  | { kind: 'soulThunder' }
  /** Spends soul like Thunder; each strike rarely lands, but hits very hard. */
  | { kind: 'soulReaper' }
  /** Spends soul like Thunder; each strike almost always lands, but burns only a little. */
  | { kind: 'soulFire' }
  /** Spends soul: each level strikes TWO enemies, hitting 75% of the time for a little damage and a long paralysis. */
  | { kind: 'soulTree' }
  /**
   * 暴走: not a skill to equip. Every human player triggers it by holding the next-item button with 魂;
   * it spends every full soul level on a short super state (SOUL_RAGE).
   */
  | { kind: 'soulRage' };

export type SummonKind = 'soulThunder' | 'soulReaper' | 'soulFire' | 'soulTree';
export const isSummon = (kind: string | undefined): kind is SummonKind =>
  kind === 'soulThunder' || kind === 'soulReaper' || kind === 'soulFire' || kind === 'soulTree';
/** Any skill paid for with 魂 (the summons and 暴走): it needs a full soul level and shows the soul meter. */
export const spendsSoul = (kind: string | undefined) => isSummon(kind) || kind === 'soulRage';

/** How many enemies one cast strikes. The Quest boss hits two players per soul level. */
export function summonStrikeCount(kind: SummonKind, level: number, boss = false) {
  const perLevel = boss || kind === 'soulTree' ? 2 : 1;
  return level * perLevel;
}

/** Groups for the loadout screen. */
export type SkillCategory = 'heal' | 'ranged' | 'move' | 'buff' | 'team' | 'ninjutsu' | 'summon';
export const SKILL_CATEGORIES: SkillCategory[] = ['heal', 'ranged', 'move', 'buff', 'team', 'ninjutsu', 'summon'];

export interface Skill {
  id: string;
  category: SkillCategory;
  name: string;
  zh: string;
  desc: string;
  descZh: string;
  peCost: number;
  cooldown: number;
  effect: SkillEffect;
}

export const SKILLS: Skill[] = [
  {
    id: 'meditate', category: 'heal', name: 'Meditate', zh: '調息', peCost: 60, cooldown: 8,
    desc: 'Channel 1.5s to heal 28 HP. Can\'t move; a hit cancels it.',
    descZh: '運氣1.5秒回復28生命，期間不能移動，受擊即中斷。',
    effect: { kind: 'channelHeal', heal: 28, duration: 1.5 },
  },
  {
    id: 'second-wind', category: 'heal', name: 'Second Wind', zh: '回春', peCost: 55, cooldown: 12,
    desc: 'Instantly heal 15 HP.',
    descZh: '立即回復15生命值。',
    effect: { kind: 'instantHeal', heal: 15 },
  },
  {
    id: 'sweet-dew', category: 'heal', name: 'Sweet Dew', zh: '甘露', peCost: 45, cooldown: 16,
    desc: 'Heal 30 HP over 8s. You can keep moving and fighting while it works.',
    descZh: '8秒內逐漸回復30生命，期間可以照常移動和攻擊。',
    effect: { kind: 'regen', heal: 30, duration: 8 },
  },
  {
    id: 'arrow', category: 'ranged', name: 'Arrow', zh: '飛箭', peCost: 18, cooldown: 0.9,
    desc: 'Fast, light shot. 6 dmg.',
    descZh: '快速的輕型射擊，6點傷害。',
    effect: { kind: 'projectile', speed: 950, radius: 5, damage: 6, knockback: 140, hitstun: 0.1, range: 760, color: 0xe8e8e8 },
  },
  {
    id: 'fireball', category: 'ranged', name: 'Fireball', zh: '火球', peCost: 35, cooldown: 2.5,
    desc: 'Slow, heavy shot. 12 dmg, big knockback.',
    descZh: '緩慢的重型射擊，12點傷害，強力擊退。',
    effect: { kind: 'projectile', speed: 520, radius: 13, damage: 12, knockback: 520, hitstun: 0.35, range: 620, color: 0xff7a2a },
  },
  {
    id: 'hook', category: 'ranged', name: 'Hook Chain', zh: '鉤鎖', peCost: 30, cooldown: 7,
    desc: 'Throw a hook on a chain: the first enemy it catches takes 4 dmg and is dragged right up to you.',
    descZh: '擲出鐵鉤，鉤中的第一名敵人受到4點傷害，並被拉到你身前。',
    effect: { kind: 'projectile', speed: 1000, radius: 7, damage: 4, knockback: 0, hitstun: 0.45, range: 520, color: 0xb8c0cc, pull: true },
  },
  {
    id: 'chakram', category: 'ranged', name: 'Chakram', zh: '飛輪', peCost: 30, cooldown: 4,
    desc: 'Throw a spinning blade that flies out 300 px and back to you, cutting every enemy it passes for 6 dmg, once each way.',
    descZh: '擲出旋轉飛輪，飛出300像素後回到手中，去程和回程各對經過的每名敵人造成6點傷害。',
    effect: { kind: 'projectile', speed: 720, radius: 11, damage: 6, knockback: 120, hitstun: 0.15, range: 300, color: 0xd0d8e0, boomerang: true },
  },
  {
    id: 'thunder', category: 'summon', name: 'Thunder', zh: '天雷', peCost: 0, cooldown: 3,
    desc: 'Summon (1s call, untouchable): spends your 魂 (soul); lightning strikes the nearest enemies anywhere, 1 per soul level (max 4). Hit chance 55/65/75/85% by soul level; a hit deals 5–30 damage. Every bolt paralyses (0.8s on a miss, 2s on a hit); paralysed fighters can\'t act and still take 40% damage.',
    descZh: '召喚（需時1秒，期間無敵）：消耗「魂」召喚雷電攻擊最近的敵人，每級魂打1人（最多4人），不限距離。命中率按魂等級為55/65/75/85%，命中造成5–30傷害。無論是否命中都會麻痺（落空0.8秒，命中2秒）；麻痺時無法行動，且仍會受到40%傷害。',
    effect: { kind: 'soulThunder' },
  },
  {
    id: 'reaper', category: 'summon', name: 'Reaper', zh: '死神', peCost: 0, cooldown: 3,
    desc: 'Summon (1s call, untouchable): spends your 魂 (soul); the reaper visits the nearest enemies anywhere, 1 per soul level (max 4). Hit chance only 10/15/20/25% by soul level. A hit ignores protection: under 80 HP the target dies, otherwise they are left at 20 HP (a boss loses at most 200 HP), then paralysed for 2.5s. A miss still paralyses for 0.8s.',
    descZh: '召喚（需時1秒，期間無敵）：消耗「魂」，死神造訪最近的敵人，每級魂1人（最多4人），不限距離。命中率按魂等級只有10/15/20/25%。命中無視防護：生命低於80即死，否則只剩20生命（首領最多損失200生命），並麻痺2.5秒；落空麻痺0.8秒。',
    effect: { kind: 'soulReaper' },
  },
  {
    id: 'holy-fire', category: 'summon', name: 'Holy Fire', zh: '聖火', peCost: 0, cooldown: 3,
    desc: 'Summon (1s call, untouchable): spends your 魂 (soul); holy flames fall on the nearest enemies anywhere, 1 per soul level (max 4). Almost always hits (85/90/95/100% by soul level), but only 5–12 damage; paralyses for 1.2s on a hit, 0.8s on a miss.',
    descZh: '召喚（需時1秒，期間無敵）：消耗「魂」，聖火降在最近的敵人身上，每級魂1人（最多4人），不限距離。幾乎必中（按魂等級85/90/95/100%），但只有5–12傷害；命中麻痺1.2秒，落空麻痺0.8秒。',
    effect: { kind: 'soulFire' },
  },
  {
    id: 'sacred-tree', category: 'summon', name: 'Sacred Tree', zh: '神樹', peCost: 0, cooldown: 3,
    desc: 'Summon (1s call, untouchable): spends your 魂 (soul); sacred roots burst up under the nearest enemies anywhere, 2 per soul level (4 levels = 8). 75% to land on each target, but only 5 damage; a hit paralyses for 2.5s (0.8s on a miss).',
    descZh: '召喚（需時1秒，期間無敵）：消耗「魂」，神樹的根鬚從最近的敵人腳下竄出，每級魂2人（4級即8人），不限距離。每人75%命中，但只有5點傷害；命中麻痺2.5秒（落空0.8秒）。',
    effect: { kind: 'soulTree' },
  },
  {
    id: 'sprint', category: 'move', name: 'Sprint', zh: '疾走', peCost: 25, cooldown: 8,
    desc: '+65% move speed for 3s.',
    descZh: '3秒內移動速度提升65%。',
    effect: { kind: 'speedBuff', multiplier: 1.65, duration: 3 },
  },
  {
    id: 'blink', category: 'move', name: 'Blink Dash', zh: '閃步', peCost: 20, cooldown: 1.8,
    desc: 'Instant burst of speed in your move direction.',
    descZh: '朝移動方向瞬間衝刺。',
    effect: { kind: 'dash', speed: 950, duration: 0.14 },
  },
  {
    id: 'shadow-step', category: 'move', name: 'Shadow Step', zh: '影步', peCost: 25, cooldown: 9,
    desc: 'Blink to just behind the nearest enemy within 360 px, facing their back.',
    descZh: '瞬間閃到360像素內最近敵人的背後，面向對方。',
    effect: { kind: 'shadowStep', range: 360 },
  },
  {
    id: 'swap', category: 'move', name: 'Shadow Swap', zh: '換影', peCost: 25, cooldown: 10,
    desc: 'Trade places with the nearest enemy within 420 px: pull them off an objective, or slip out of a trap.',
    descZh: '與420像素內最近的敵人互換位置：把對方調離目標，或脫離險境。',
    effect: { kind: 'swap', range: 420 },
  },
  {
    id: 'fury', category: 'buff', name: 'Fury', zh: '霸氣', peCost: 35, cooldown: 18,
    desc: '+35% attack damage and knockback for 8s.',
    descZh: '8秒內攻擊傷害和擊退提升35%。',
    effect: { kind: 'powerUp', multiplier: 1.35, duration: 8 },
  },
  {
    id: 'bloodthirst', category: 'buff', name: 'Bloodthirst', zh: '噬血', peCost: 35, cooldown: 18,
    desc: 'For 6s, heal 40% of all the damage you deal.',
    descZh: '6秒內，你造成傷害的40%會回復為自己的生命值。',
    effect: { kind: 'lifesteal', share: 0.4, duration: 6 },
  },
  {
    id: 'counter', category: 'buff', name: 'Counter', zh: '見切', peCost: 25, cooldown: 9,
    desc: 'For 0.6s, block the next hit completely. If the attacker is close, strike back for 14 dmg, knocking them away and stunning them.',
    descZh: '0.6秒內完全擋下下一次攻擊。如果攻擊者在近處，立即反擊造成14點傷害，擊退並令對方硬直。',
    effect: { kind: 'counter', window: 0.6, damage: 14, knockback: 380, stun: 0.6, reach: 150 },
  },
  {
    id: 'golden-bell', category: 'buff', name: 'Golden Bell', zh: '金鐘罩', peCost: 30, cooldown: 16,
    desc: 'Take 35% less damage and knockback for 7s.',
    descZh: '7秒內受到的傷害和擊退減少35%。',
    effect: { kind: 'guard', reduction: 0.35, duration: 7 },
  },
  {
    id: 'stealth', category: 'ninjutsu', name: 'Vanish', zh: '隱身術', peCost: 30, cooldown: 14,
    desc: 'Turn nearly invisible for 3.5s and move 25% faster; CPU enemies lose track of you. Attacking or getting hit reveals you.',
    descZh: '3.5秒內近乎完全隱形，移動快25%，電腦敵人會找不到你。攻擊或受擊時現身。',
    effect: { kind: 'stealth', duration: 3.5 },
  },
  {
    id: 'substitute', category: 'ninjutsu', name: 'Substitution', zh: '替身術', peCost: 25, cooldown: 12,
    desc: 'For 2.5s, the next hit lands on a log instead: you vanish and reappear a short way off, unhurt.',
    descZh: '2.5秒內，下一次攻擊會打在木頭替身上，你會在附近現身，毫髮無傷。',
    effect: { kind: 'substitute', window: 2.5 },
  },
  {
    id: 'caltrops', category: 'ninjutsu', name: 'Caltrops', zh: '撒菱', peCost: 25, cooldown: 10,
    desc: 'Scatter spikes around you for 6s: enemies in them move at half speed and take damage.',
    descZh: '在身邊撒下撒菱6秒，踩到的敵人速度減半並持續受傷。',
    effect: { kind: 'caltrops', radius: 64, duration: 6, dps: 4, slow: 0.5 },
  },
  {
    id: 'sacrifice', category: 'ninjutsu', name: 'Self-Sacrifice', zh: '捨身', peCost: 15, cooldown: 10,
    desc: 'Charge for 0.7s (rooted; you can still be hurt), then spend 30 of your own HP: a blast bursts out from you and every enemy inside takes double (60). With 30 HP or less, it costs your life, but the blast still hits for 60.',
    descZh: '蓄力0.7秒（不能移動，仍會受傷），然後消耗自己30點生命值，從自身爆發衝擊波，圈內所有敵人受到雙倍傷害（60）。生命值不足30時會犧牲自己，但仍對敵人造成60傷害。',
    effect: { kind: 'sacrifice', hpCost: 30, radius: 130, knockback: 420, charge: 0.7 },
  },
  {
    id: 'flicker', category: 'ninjutsu', name: 'Body Flicker', zh: '瞬身術', peCost: 30, cooldown: 12,
    desc: 'Vanish and reappear at a random spot far from any enemy.',
    descZh: '瞬間消失，在遠離敵人的隨機位置現身。',
    effect: { kind: 'teleport' },
  },
  {
    id: 'healing-circle', category: 'team', name: 'Healing Circle', zh: '癒之陣', peCost: 70, cooldown: 14,
    desc: 'Heal your whole team 25 HP, wherever they are (just you in free-for-all).',
    descZh: '全隊回復25生命值，無論隊友在哪裡（混戰中只回復自己）。',
    effect: { kind: 'teamHeal', heal: 25 },
  },
  {
    id: 'spirit-circle', category: 'team', name: 'Spirit Circle', zh: '回氣陣', peCost: 30, cooldown: 20,
    desc: 'Restore 40 PE to your whole team, wherever they are (just you in free-for-all).',
    descZh: '全隊回復40體力，無論隊友在哪裡（混戰中只回復自己）。',
    effect: { kind: 'teamPe', amount: 40 },
  },
  {
    id: 'war-drum', category: 'team', name: 'War Drum', zh: '戰鼓', peCost: 45, cooldown: 22,
    desc: 'Your whole team deals +20% damage for 10s.',
    descZh: '10秒內全隊攻擊傷害提升20%。',
    effect: { kind: 'teamFury', multiplier: 1.2, duration: 10 },
  },
  {
    id: 'ward-circle', category: 'team', name: 'Ward Circle', zh: '護體陣', peCost: 45, cooldown: 22,
    desc: 'Your whole team takes 30% less damage and knockback for 8s.',
    descZh: '8秒內全隊受到的傷害和擊退減少30%。',
    effect: { kind: 'teamGuard', reduction: 0.3, duration: 8 },
  },
  {
    id: 'lifeline', category: 'heal', name: 'Lifeline', zh: '續命', peCost: 70, cooldown: 25,
    desc: 'Revive a fallen teammate from anywhere; they return beside you. Your HP is split evenly between you. (Team modes)',
    descZh: '無論距離，復活倒下的隊友並召回身旁，你的生命值平分給兩人。（限團隊模式）',
    effect: { kind: 'revive' },
  },
];

export const skillById = (id: string | null): Skill | null => SKILLS.find((s) => s.id === id) ?? null;

/** Effective duration, shared by combat, the loadout labels and the HUD sweep. */
export const skillCooldownFor = (skill: Skill, role: Role): number =>
  Math.round(skill.cooldown * role.skillCooldown * 1000) / 1000;
