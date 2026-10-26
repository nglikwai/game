import { QUEST } from '@/config';

/** A summon strike's hit chance for the soul level spent (1–4). */
export const soulHitChance = (byLevel: number[], level: number) => byLevel[Math.min(byLevel.length, Math.max(1, level)) - 1];

export const summonHitChance = (base: number, boss = false) => Math.min(1, base + (boss ? QUEST.boss.summonHitBonus : 0));
