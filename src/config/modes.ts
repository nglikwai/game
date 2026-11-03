import { PLAYER_COLORS } from '@/config/display';

export const MAX_PLAYERS = PLAYER_COLORS.length;

/** At most this many of the slots can be real people (the rest are CPU or empty). */
export const MAX_HUMANS = 4;

export type QuestMode = 'quest';

export type QuestSide = 'heroes' | 'hell';

/** Standard puts every player on the hero side, Hell puts every player on Hell's side, and Free lets each player choose. */
export type QuestRule = 'heroes' | 'hell' | 'free';

export const QUEST_RULES: QuestRule[] = ['heroes', 'hell', 'free'];

export type GameMode = 'ffa' | 'team' | 'princess' | 'siege' | 'expedition' | QuestMode;

export const GAME_MODES: GameMode[] = ['ffa', 'team', 'princess', 'siege', 'quest', 'expedition'];

export const isQuestMode = (mode: GameMode): mode is QuestMode => mode === 'quest';

/**
 * How smart the CPU fighters are. Standard is the original behaviour; Hard reacts faster, picks its
 * targets and distances more cleverly, punishes openings and dodges better.
 */
export type Difficulty = 'standard' | 'hard';

export const DIFFICULTIES: Difficulty[] = ['standard', 'hard'];

/** Both cooperative modes configure up to four heroes in the lobby. */
export const isPartyMode = (mode: GameMode) => isQuestMode(mode) || mode === 'expedition';
