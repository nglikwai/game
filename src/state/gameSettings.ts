import { isQuestMode, GAME_MODES, MAX_HUMANS, MAX_PLAYERS, QUEST, type GameMode, type QuestRule, type QuestSide } from '@/config';
import { KEY_SETS, isKeySet, keyLabel } from '@/input/keyboard';
import { parsePad } from '@/input/controllerIds';
import { type Binds, type ControlId } from '@/input/contracts';
import { DIFFICULTIES, type Difficulty } from '@/config';
import { T } from '@/localization';
import { MAPS, type MapId } from '@/maps';
import type { RoleId } from '@/gameplay/roles';
import { SKILLS, SKILL_SLOTS } from '@/gameplay/skills';

/** One player slot's setup, as chosen in the lobby. */
export interface SlotConfig {
  control: ControlId;
  weapon: number;
  /** Equipped skill ids, one per slot (null = empty). Skill buttons follow the stable indices in input/actions.ts. */
  skills: (string | null)[];
  /** Keyboard keys for [attack, skill 1–3, use item, next item, skill 4]; only used by keyboard controls. */
  binds: Binds;
  /** Team and Save the Princess modes: 0 = red, 1 = blue. */
  team: number;
  role: RoleId;
  /** Quest faction, independent of the versus team. Missing values use the legacy party choice. */
  questSide?: QuestSide;
}

export interface GameSettings {
  mode: GameMode;
  /** Standard, Hell, or Free. Free is the only rule where each player picks a side. */
  questRule: QuestRule;
  /** A map, or 'random' for a different one every round. */
  mapId: MapId | 'random';
  /** How clever the CPU fighters are. */
  difficulty: Difficulty;
  slots: SlotConfig[];
}

const SLOTS_KEY = 'arena-duel-slots';
const MODE_KEY = 'arena-duel-mode';
const MAP_KEY = 'arena-duel-map';
const DIFFICULTY_KEY = 'arena-duel-difficulty';
const QUEST_SIDE_KEY = 'arena-duel-quest-side';

const DEFAULT_SLOTS: SlotConfig[] = [
  { control: 'kb1', weapon: 0, skills: ['meditate', 'arrow', 'blink'], binds: [...KEY_SETS.kb1.defaultBinds], team: 0, role: 'ronin' },
  { control: 'cpu', weapon: 2, skills: ['second-wind', 'fireball', 'fury'], binds: [...KEY_SETS.kb2.defaultBinds], team: 1, role: 'ronin' },
  { control: 'cpu', weapon: 3, skills: ['meditate', 'arrow', 'sprint'], binds: [...KEY_SETS.kb3.defaultBinds], team: 0, role: 'ronin' },
  { control: 'off', weapon: 4, skills: ['lifeline', 'fireball', 'blink'], binds: [...KEY_SETS.kb4.defaultBinds], team: 1, role: 'ronin' },
  { control: 'off', weapon: 1, skills: ['golden-bell', 'arrow', 'sprint'], binds: [...KEY_SETS.kb1.defaultBinds], team: 0, role: 'ronin' },
  { control: 'off', weapon: 3, skills: ['meditate', 'fury', 'blink'], binds: [...KEY_SETS.kb2.defaultBinds], team: 1, role: 'ronin' },
  { control: 'off', weapon: 5, skills: ['second-wind', 'caltrops', 'flicker'], binds: [...KEY_SETS.kb3.defaultBinds], team: 0, role: 'ronin' },
  { control: 'off', weapon: 8, skills: ['healing-circle', 'arrow', 'sprint'], binds: [...KEY_SETS.kb4.defaultBinds], team: 1, role: 'ronin' },
];

// Before the shared skill pool, skills were saved as an index into a per-slot list.
const OLD_SLOT_POOLS = [['meditate', 'second-wind'], ['arrow', 'fireball'], ['sprint', 'blink']];

function loadSlots(): SlotConfig[] {
  try {
    const saved = JSON.parse(localStorage.getItem(SLOTS_KEY) ?? 'null') as SlotConfig[] | null;
    if (Array.isArray(saved) && saved.length >= 4 && saved.every((s) => Array.isArray(s.binds) && s.binds.length >= 4)) {
      // Saves from the 4-player days get the extra slots from the defaults.
      while (saved.length < MAX_PLAYERS) saved.push(structuredClone(DEFAULT_SLOTS[saved.length]));
      const reserved = new Set(saved.filter((s) => isKeySet(s.control)).flatMap(keysOf));
      const skill4Keys = saved.map((s, i) => {
        const preferred = KEY_SETS[isKeySet(s.control) ? s.control : (['kb1', 'kb2', 'kb3', 'kb4'] as const)[i % 4]].defaultBinds[6];
        const key = s.binds[6] ?? [preferred, ...Array.from({ length: 26 }, (_, n) => 65 + n), ...Array.from({ length: 10 }, (_, n) => 48 + n)].find((k) => !reserved.has(k))!;
        if (isKeySet(s.control)) reserved.add(key);
        return key;
      });
      return saved.slice(0, MAX_PLAYERS).map((s, i) => ({
        ...s,
        // Saves from before items have only 4 binds; add that key set's item keys.
        // Older saves have fewer binds (no item keys); fill the gaps from that key set's defaults.
        binds: KEY_SETS[isKeySet(s.control) ? s.control : (['kb1', 'kb2', 'kb3', 'kb4'] as const)[i % 4]].defaultBinds.map(
          (k, n) => s.binds[n] ?? (n === 6 ? skill4Keys[i] : k),
        ) as Binds,
        team: s.team ?? i % 2,
        role: s.role ?? 'ronin',
        questSide: s.questSide === 'hell' || s.questSide === 'heroes' ? s.questSide : undefined,
        skills: Array.from({ length: SKILL_SLOTS }, (_, k) => {
          const v = (s.skills as (string | number | null)[])[k];
          const id = typeof v === 'number' ? OLD_SLOT_POOLS[k]?.[v] ?? null : v;
          return SKILLS.some((sk) => sk.id === id) ? id : null;
        }),
      }));
    }
  } catch {
    // Storage unavailable or corrupt: fall back to defaults.
  }
  return structuredClone(DEFAULT_SLOTS).map((s) => ({ ...s, skills: [...s.skills, null] }));
}

function loadMode(): GameMode {
  try {
    const m = localStorage.getItem(MODE_KEY);
    if (m === 'quest2') return 'quest';
    if (m && (GAME_MODES as readonly string[]).includes(m)) return m as GameMode;
  } catch {
    // Fall through to the default.
  }
  return 'ffa';
}

function loadMap(): MapId | 'random' {
  try {
    const m = localStorage.getItem(MAP_KEY) as MapId | 'random' | null;
    if (m && (m === 'random' || MAPS.some((x) => x.id === m))) return m;
  } catch {
    // Fall through to the default.
  }
  return 'courtyard';
}

function loadDifficulty(): Difficulty {
  try {
    const d = localStorage.getItem(DIFFICULTY_KEY) as Difficulty | null;
    if (d && DIFFICULTIES.includes(d)) return d;
  } catch {
    // Fall through to the default.
  }
  return 'standard';
}

let settings: GameSettings | null = null;

function loadQuestRule(): QuestRule {
  try {
    const saved = localStorage.getItem(QUEST_SIDE_KEY);
    if (saved === 'heroes' || saved === 'hell' || saved === 'free') return saved;
  } catch {
    // Fall through to the default.
  }
  return 'heroes';
}

/** The shared, mutable settings object. Call saveSettings() after changing it. */
export function getSettings(): GameSettings {
  settings ??= { mode: loadMode(), questRule: loadQuestRule(), mapId: loadMap(), difficulty: loadDifficulty(), slots: loadSlots() };
  return settings;
}

export function saveSettings() {
  if (!settings) return;
  try {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(settings.slots));
    localStorage.setItem(MODE_KEY, settings.mode);
    localStorage.setItem(MAP_KEY, settings.mapId);
    localStorage.setItem(DIFFICULTY_KEY, settings.difficulty);
    localStorage.setItem(QUEST_SIDE_KEY, settings.questRule);
  } catch {
    // Not critical; settings just won't survive a reload.
  }
}

/** Modes where players pick a team in the lobby (Quest uses its own per-player faction selector). */
export const usesTeams = (mode: GameMode) => mode !== 'ffa' && !isQuestMode(mode);

/**
 * Deal everyone who is playing into two teams at random, as evenly as possible (with an odd number,
 * either team may get the extra player). Slots that are off keep their team.
 */
export function randomizeTeams(slots: SlotConfig[]) {
  const playing = slots.map((s, i) => (s.control === 'off' ? -1 : i)).filter((i) => i >= 0);
  for (let i = playing.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playing[i], playing[j]] = [playing[j], playing[i]];
  }
  const half = playing.length / 2;
  const redCount = Number.isInteger(half) ? half : Math.random() < 0.5 ? Math.ceil(half) : Math.floor(half);
  playing.forEach((slot, n) => (slots[slot].team = n < redCount ? 0 : 1));
}

/** Every key a keyboard slot listens to: its movement keys plus its binds. */
export function keysOf(slot: SlotConfig): number[] {
  return isKeySet(slot.control) ? [...KEY_SETS[slot.control].move, ...slot.binds] : [];
}

/** Switch a slot's control. Switching key set brings that set's default keys with it. */
export function setControl(slot: SlotConfig, id: ControlId) {
  slot.control = id;
  if (isKeySet(id)) slot.binds = [...KEY_SETS[id].defaultBinds];
}

export type EquipResult = 'equipped' | 'removed' | 'full';

/** Equip a skill into the first empty slot, or unequip it if already equipped. */
export function toggleSkill(slot: SlotConfig, id: string): EquipResult {
  const at = slot.skills.indexOf(id);
  if (at >= 0) {
    slot.skills[at] = null;
    return 'removed';
  }
  const free = slot.skills.indexOf(null);
  if (free < 0 || free >= SKILL_SLOTS) return 'full';
  slot.skills[free] = id;
  return 'equipped';
}

/** Why the current setup can't start, or null if it can. */
export function validate(s: GameSettings): string | null {
  // Quest: only P1–P4 play (the enemies come from the stage).
  const slots = isQuestMode(s.mode) ? s.slots.slice(0, QUEST.partySlots) : s.slots;
  const active = slots.filter((x) => x.control !== 'off');
  if (isQuestMode(s.mode) && active.length < 1) return T().needOne;
  if (!isQuestMode(s.mode) && active.length < 2) return T().needTwo;
  const humans = active.map((x) => x.control).filter((c) => c !== 'cpu');
  if (humans.length > MAX_HUMANS) return T().tooManyHumans(MAX_HUMANS);
  if (new Set(humans).size !== humans.length) return T().sameControls;
  // A whole gamepad and one of its Joy-Con halves would fight over the same buttons.
  const pads = humans.map(parsePad).filter((p): p is NonNullable<typeof p> => !!p);
  if (pads.some((p) => p.side && pads.some((q) => !q.side && q.index === p.index))) return T().sameControls;
  if (usesTeams(s.mode) && new Set(active.map((x) => x.team)).size < 2) return T().needTeams;
  const keys = active.flatMap(keysOf);
  const dup = keys.find((k, n) => keys.indexOf(k) !== n);
  if (dup !== undefined) return T().dupKey(keyLabel(dup));
  return null;
}

/** Put a skill on an explicit action slot; moving it cannot leave duplicate copies. */
export function assignSkill(slot: SlotConfig, id: string, index: number): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= SKILL_SLOTS || !SKILLS.some((s) => s.id === id)) return false;
  while (slot.skills.length < SKILL_SLOTS) slot.skills.push(null);
  const old = slot.skills.indexOf(id);
  if (old === index) return false;
  if (old >= 0) slot.skills[old] = null;
  slot.skills[index] = id;
  return true;
}
