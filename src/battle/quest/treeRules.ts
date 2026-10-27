import { QUEST, SOUL_FIRE, SOUL_REAPER, SOUL_THUNDER, SOUL_TREE } from '@/config';
import type { SummonKind } from '@/gameplay/skills';

export interface TreeSummon {
  kind: SummonKind;
  skillId: string;
  color: number;
  hitChance: number;
  minDamage: number;
  maxDamage: number;
  paralyze: number;
  /** Time for the marked warning before this spell strikes. */
  warn: number;
}

/** The prison tree retains level-two hit chances and paralysis, with stronger damage. */
export const TREE_SUMMONS: readonly TreeSummon[] = ([
  { kind: 'soulFire', skillId: 'holy-fire', color: 0xffb03a, ...SOUL_FIRE, hitChance: SOUL_FIRE.hitChance[1], warn: QUEST.rescue.tree.lightWarn },
  { kind: 'soulThunder', skillId: 'thunder', color: 0x8fb4ff, ...SOUL_THUNDER, hitChance: SOUL_THUNDER.hitChance[1], warn: QUEST.rescue.tree.thunderWarn },
  { kind: 'soulReaper', skillId: 'reaper', color: 0xa86aff, ...SOUL_REAPER, hitChance: SOUL_REAPER.hitChance[1], minDamage: SOUL_REAPER.damage, maxDamage: SOUL_REAPER.damage, warn: QUEST.rescue.tree.warn },
  { kind: 'soulTree', skillId: 'sacred-tree', color: 0x6adf7a, ...SOUL_TREE, minDamage: SOUL_TREE.damage, maxDamage: SOUL_TREE.damage, warn: QUEST.rescue.tree.warn },
] satisfies TreeSummon[]).map((spell) => ({ ...spell, minDamage: spell.minDamage * QUEST.rescue.tree.damage, maxDamage: spell.maxDamage * QUEST.rescue.tree.damage }));

export function pickTreeSummon(random: () => number = Math.random): TreeSummon {
  return TREE_SUMMONS[Math.floor(random() * TREE_SUMMONS.length)];
}

/** Grove summons use the same spells, with a better chance to land. */
export function groveSummonHitChance(spell: TreeSummon): number {
  return Math.min(1, spell.hitChance + QUEST.grove.summonHitBonus);
}
