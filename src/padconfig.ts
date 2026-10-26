import { isJoyConPair, readPad, readPadHalf, sidewaysMove, type PadSide, type PadState } from '@/gamepads';

/**
 * Per-controller settings from the Controller Setup page, remembered by the controller's
 * name (so they follow it even if the browser numbers it differently next time):
 * - mode: how the lobby offers it: automatic (by name), one player, or split in two (L / R halves);
 * - maps: a custom button map for the whole pad or one half, made by "press the button for…".
 */

export type PadMode = 'auto' | 'whole' | 'split';
export const PAD_MODES: PadMode[] = ['auto', 'whole', 'split'];

/** Which inputs mean what for one player. null = keep the built-in default. */
export interface PadMap {
  /** Movement: a stick (its two axis numbers) or the d-pad buttons. */
  move: { ax: number; ay: number } | 'dpad' | null;
  /** Button numbers for attack, skill 1–3, use item, next item. */
  actions: (number | null)[];
}

/** How a split Joy-Con is held: sideways (the usual, one per player: its stick is turned 90°) or upright. */
export type PadGrip = 'sideways' | 'upright';
export const PAD_GRIPS: PadGrip[] = ['sideways', 'upright'];

const GRIP_KEY = 'arena-duel-pad-grips';
const MODE_KEY = 'arena-duel-pad-modes';
const MAP_KEY = 'arena-duel-pad-maps';

function load<T>(key: string): Record<string, T> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, T>;
  } catch {
    return {};
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not critical.
  }
}

export function getPadMode(id: string): PadMode {
  return load<PadMode>(MODE_KEY)[id] ?? 'auto';
}

export function setPadMode(id: string, mode: PadMode) {
  const all = load<PadMode>(MODE_KEY);
  if (mode === 'auto') delete all[id];
  else all[id] = mode;
  save(MODE_KEY, all);
}

/** Is this pad offered as two players (its left and right halves)? */
export function isSplit(pad: Pick<Gamepad, 'id'>): boolean {
  const mode = getPadMode(pad.id);
  return mode === 'split' || (mode === 'auto' && isJoyConPair(pad.id));
}

export function getPadGrip(id: string): PadGrip {
  return load<PadGrip>(GRIP_KEY)[id] ?? 'sideways';
}

export function setPadGrip(id: string, grip: PadGrip) {
  const all = load<PadGrip>(GRIP_KEY);
  if (grip === 'sideways') delete all[id];
  else all[id] = grip;
  save(GRIP_KEY, all);
}

const mapKey = (id: string, side?: PadSide) => `${id}|${side ?? 'W'}`;

export function getPadMap(id: string, side?: PadSide): PadMap | null {
  return load<PadMap>(MAP_KEY)[mapKey(id, side)] ?? null;
}

export function setPadMap(id: string, side: PadSide | undefined, map: PadMap | null) {
  const all = load<PadMap>(MAP_KEY);
  if (map) all[mapKey(id, side)] = map;
  else delete all[mapKey(id, side)];
  save(MAP_KEY, all);
}

/** Forget every custom map of this controller (whole and both halves). */
export function resetPadMaps(id: string) {
  for (const side of [undefined, 'L', 'R'] as const) setPadMap(id, side, null);
}

const DEAD = 0.25;

/** What a controller (or one half of it) is doing right now: the built-in mapping with any custom map laid on top. */
export function readController(pad: Gamepad, side?: PadSide): PadState {
  const base = side ? readPadHalf(pad, side) : readPad(pad);
  const map = getPadMap(pad.id, side);
  const out: PadState = { ...base, actions: [...base.actions] };
  const down = (i: number) => {
    const x = pad.buttons[i];
    return !!x && (x.pressed || x.value > 0.5);
  };
  if (map) {
    map.actions.forEach((btn, n) => {
      if (btn !== null && btn !== undefined) out.actions[n] = down(btn);
    });
    if (map.move === 'dpad') {
      out.mx = (down(15) ? 1 : 0) - (down(14) ? 1 : 0);
      out.my = (down(13) ? 1 : 0) - (down(12) ? 1 : 0);
    } else if (map.move) {
      const x = pad.axes[map.move.ax] ?? 0;
      const y = pad.axes[map.move.ay] ?? 0;
      out.mx = Math.abs(x) < DEAD ? 0 : x;
      out.my = Math.abs(y) < DEAD ? 0 : y;
    }
  }
  // A half held sideways: turn its stick / arrows back to screen directions.
  if (side && getPadGrip(pad.id) === 'sideways') [out.mx, out.my] = sidewaysMove(side, out.mx, out.my);
  return out;
}

const SEEN_KEY = 'arena-duel-pad-seen';

/**
 * The controller a "Gamepad N" choice means right now. Chrome numbers controllers in the order it
 * sees them, and a Joy-Con that falls asleep and wakes up again can come back in a different slot,
 * so each slot remembers which controller model it had: if that model now sits in another slot,
 * the choice follows it. Otherwise it is simply whatever is in slot N.
 */
export function resolvePad(index: number): Gamepad | null {
  const list = Array.from(navigator.getGamepads ? navigator.getGamepads() : []);
  const at = (i: number) => {
    const p = list[i];
    return p && p.connected ? p : null;
  };
  const seen = load<string>(SEEN_KEY);
  const key = String(index);
  const here = at(index);
  const want = seen[key];
  let pick = here;
  if (want && here?.id !== want) {
    // Another connected pad of the remembered model that no other slot already claims.
    const claimed = (i: number) => seen[String(i)] === list[i]?.id && i !== index;
    const other = list.map((_, i) => at(i)).find((p) => p && p.id === want && !claimed(p.index));
    if (other) pick = other;
  }
  if (pick && seen[key] !== pick.id) {
    seen[key] = pick.id;
    save(SEEN_KEY, seen);
  }
  return pick;
}
