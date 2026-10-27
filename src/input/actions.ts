/** Existing item indices stay fixed so saved controller maps remain compatible. */
export const ACTION_COUNT = 7;
export type ActionValues<T> = [T, T, T, T, T, T, T];
/** Attack, skills 1–4, then items in the UI; storage keeps skill 4 at the appended index. */
export const DISPLAY_ACTIONS = [0, 1, 2, 3, 6, 4, 5] as const;
export const SKILL_ACTIONS = [1, 2, 3, 6] as const;
export const skillAction = (slot: number): number => SKILL_ACTIONS[slot] ?? -1;
