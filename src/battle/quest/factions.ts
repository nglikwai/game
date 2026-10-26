import { QUEST, QUEST_RULES, type QuestRule, type QuestSide } from '@/config';
import type { SlotConfig } from '@/settings';

/** Per-player choices override the legacy whole-party setting. */
export function questSideOf(slot: SlotConfig, fallback: QuestSide = 'heroes'): QuestSide {
  return slot.questSide ?? fallback;
}

/** A saved run without an explicit rule follows its old whole-party side. */
export function questRuleOf(quest?: { rule?: QuestRule; side?: QuestSide }): QuestRule {
  if (quest?.rule && (QUEST_RULES as readonly string[]).includes(quest.rule)) return quest.rule;
  return quest?.side === 'hell' ? 'hell' : 'heroes';
}

/** Standard and Hell assign every seat. Free leaves the per-player choices alone. */
export function applyQuestRule(slots: SlotConfig[], rule: QuestRule) {
  if (rule === 'free') return;
  for (const slot of slots.slice(0, QUEST.partySlots)) slot.questSide = rule;
}

export function questFactions(lobby: SlotConfig[], fallback: QuestSide = 'heroes') {
  const active = lobby.slice(0, QUEST.partySlots).filter((s) => s.control !== 'off');
  const hell = active.some((s) => questSideOf(s, fallback) === 'hell');
  const heroes = active.some((s) => questSideOf(s, fallback) === 'heroes');
  return { hell, mixed: hell && heroes, side: hell && !heroes ? 'hell' as const : 'heroes' as const };
}

/** Keep the world's teams intact: invading heroes on the left, the playable Hell team on the right. */
export function hellSlots(lobby: SlotConfig[], fallback: QuestSide = 'hell'): SlotConfig[] {
  const base = lobby[0];
  const heroes = Array.from({ length: QUEST.partySlots }, (_, i): SlotConfig => ({
    ...(lobby[i] ?? base), control: lobby[i] && lobby[i].control !== 'off' && questSideOf(lobby[i], fallback) === 'heroes' ? lobby[i].control : 'cpu', team: 0,
  }));
  const hell = Array.from({ length: QUEST.partySlots }, (_, i): SlotConfig => ({
    ...(lobby[i] ?? base), control: lobby[i] && lobby[i].control !== 'off' && questSideOf(lobby[i], fallback) === 'hell' ? lobby[i].control : 'cpu', team: 1,
  }));
  return [...heroes, ...hell];
}

/** Human controllers get the boss seats first, without moving anyone's input or checkpoint slot. */
export function hellBossSlots(lobby: SlotConfig[], stage: number, fallback: QuestSide = 'hell'): number[] {
  const seats = Array.from({ length: QUEST.partySlots }, (_, i) => i);
  const human = (i: number) => !!lobby[i] && lobby[i].control !== 'off' && lobby[i].control !== 'cpu' && questSideOf(lobby[i], fallback) === 'hell';
  seats.sort((a, b) => Number(human(b)) - Number(human(a)) || a - b);
  const count = stage === QUEST.bossStage || stage === QUEST.dirgeStage ? 1 : stage === QUEST.wardenStage ? 2 : 0;
  return seats.slice(0, count).map((i) => QUEST.partySlots + i);
}
