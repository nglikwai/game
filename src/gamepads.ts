/**
 * Gamepad reading that copes with Nintendo Switch controllers as well as regular
 * (Xbox / PlayStation style) pads.
 *
 * - A Joy-Con pair, Charging Grip or Pro Controller shows up as an ordinary pad; only
 *   the button names differ.
 * - A single Joy-Con is played held sideways (one per player). Its four face buttons
 *   arrive as buttons 0–3 already in sideways positions (0 bottom, 1 right, 2 left,
 *   3 top), SL / SR as 4 / 5, and depending on the browser its stick comes either as
 *   axes 0/1 (or 2/3) or as a "hat" on axis 9 that only reports 8 directions.
 */

export type PadKind = 'standard' | 'nintendo' | 'joyconL' | 'joyconR';

export function padKind(id: string): PadKind {
  const s = id.toLowerCase();
  if (/joy-con \(l\)|joy-con l\b|product: 2006/.test(s)) return 'joyconL';
  if (/joy-con \(r\)|joy-con r\b|product: 2007/.test(s)) return 'joyconR';
  if (/joy-con|pro controller|nintendo|057e/.test(s)) return 'nintendo';
  return 'standard';
}

/** Short name for the lobby. */
export function padName(kind: PadKind): string {
  return { standard: '🎮', nintendo: 'Switch 🎮', joyconL: 'Joy-Con (L)', joyconR: 'Joy-Con (R)' }[kind];
}

/** Button names for: attack, skill 1, skill 2, skill 3, use item, next item. */
export function padLabels(kind: PadKind): [string, string, string, string, string, string] {
  switch (kind) {
    // Sideways left Joy-Con: its arrow buttons are the face buttons.
    case 'joyconL': return ['←', '→', '↓', '↑', 'SR', 'SL'];
    // Sideways right Joy-Con: A bottom, Y top, X right, B left.
    case 'joyconR': return ['A', 'Y', 'X', 'B', 'SR', 'SL'];
    // Nintendo layout by position: B bottom, X top, A right, Y left.
    case 'nintendo': return ['B', 'X', 'A', 'Y', 'ZR', 'ZL'];
    default: return ['A', 'Y', 'B', 'X', 'RT', 'LT'];
  }
}

export type PadSide = 'L' | 'R';

/**
 * A Joy-Con pair that the system joined into ONE controller (named "Joy-Con (L+R)" or
 * similar, never a lone "(L)" / "(R)"). It can be split so each half is its own player.
 */
export function isJoyConPair(id: string): boolean {
  const s = id.toLowerCase();
  return (/joy-con/.test(s) && !/joy-con \(l\)|joy-con \(r\)|joy-con l|joy-con r/.test(s)) || /product: 200e/.test(s);
}

/** Button names for one half of a split pair, held sideways: attack, skill 1–3, use item, next item. */
export function halfLabels(side: PadSide): [string, string, string, string, string, string] {
  return side === 'L' ? ['←', '→', '↓', '↑', 'ZL', 'L'] : ['A', 'Y', 'X', 'B', 'ZR', 'R'];
}

/**
 * A Joy-Con held sideways has its stick (and arrow buttons) turned 90°: the left one is
 * turned counter-clockwise, the right one clockwise. Turns a movement vector read from the
 * pad back into the direction the player means on screen.
 */
export function sidewaysMove(side: PadSide, mx: number, my: number): [number, number] {
  return side === 'L' ? [my, -mx] : [-my, mx];
}

export const halfName = (side: PadSide) => (side === 'L' ? 'Joy-Con (L) ✂' : 'Joy-Con (R) ✂');

export interface PadState {
  mx: number;
  my: number;
  ax: number;
  ay: number;
  /** attack, skill 1–3, use item, next item. */
  actions: [boolean, boolean, boolean, boolean, boolean, boolean];
  /** Menu buttons. */
  confirm: boolean;
  back: boolean;
  start: boolean;
}

const DEAD = 0.25;
const dz = (v: number) => (Math.abs(v) < DEAD ? 0 : v);

/** Decode a hat-switch axis (8 directions; anything above ~1.1 means centred). */
function hat(v: number | undefined): [number, number] {
  if (v === undefined || v > 1.1 || v < -1.1) return [0, 0];
  const i = Math.round((v + 1) / (2 / 7)) % 8;
  const dirs: [number, number][] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  return dirs[i];
}

export function readPad(pad: Gamepad): PadState {
  const kind = padKind(pad.id);
  const b = (i: number) => {
    const x = pad.buttons[i];
    return !!x && (x.pressed || x.value > 0.5);
  };
  const ax = (i: number) => pad.axes[i] ?? 0;
  const single = kind === 'joyconL' || kind === 'joyconR';

  let mx = 0;
  let my = 0;
  if (single) {
    // Whichever stick the browser put it on, else the hat.
    const a = [dz(ax(0)), dz(ax(1))];
    const c = [dz(ax(2)), dz(ax(3))];
    const h = pad.axes.length > 9 ? hat(ax(9)) : [0, 0];
    [mx, my] = Math.hypot(a[0], a[1]) > 0 ? a : Math.hypot(c[0], c[1]) > 0 ? c : h;
  } else {
    mx = dz(ax(0));
    my = dz(ax(1));
  }
  // D-pad (standard layout) overrides the stick. Some browsers (Safari) report a single
  // Joy-Con's stick this way too, so it counts for them when the stick itself is still.
  if (!single || (mx === 0 && my === 0)) {
    if (b(14)) mx = -1;
    if (b(15)) mx = 1;
    if (b(12)) my = -1;
    if (b(13)) my = 1;
  }

  const actions: PadState['actions'] = single
    ? [b(0), b(3), b(1), b(2), b(5), b(4)]
    : [b(0) || b(5), b(3), b(1), b(2) || b(4), b(7), b(6)];
  return {
    mx, my,
    // Only full pads have a second stick for aiming; otherwise you aim where you move.
    ax: single ? 0 : dz(ax(2)),
    ay: single ? 0 : dz(ax(3)),
    actions,
    // Switch convention for Nintendo pads: A (right) confirms, B (bottom) goes back.
    confirm: kind === 'nintendo' ? b(1) : b(0),
    back: kind === 'nintendo' ? b(0) : b(1),
    start: b(9) || b(8),
  };
}

/** All connected pads straight from the browser (index = slot in navigator.getGamepads()). */
export function connectedPads(): Gamepad[] {
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  return Array.from(list).filter((p): p is Gamepad => !!p && p.connected);
}

/**
 * One half of a joined Joy-Con pair (standard mapping: left stick axes 0/1, right stick 2/3,
 * B/A/Y/X = buttons 0–3, L/R = 4/5, ZL/ZR = 6/7, arrow buttons 12–15). The left Joy-Con uses
 * its stick and arrow buttons, the right one its stick and A/B/X/Y, like a sideways single one.
 */
export function readPadHalf(pad: Gamepad, side: PadSide): PadState {
  const b = (i: number) => {
    const x = pad.buttons[i];
    return !!x && (x.pressed || x.value > 0.5);
  };
  const ax = (i: number) => pad.axes[i] ?? 0;
  const left = side === 'L';
  const mx = dz(ax(left ? 0 : 2));
  const my = dz(ax(left ? 1 : 3));
  const actions: PadState['actions'] = left
    ? [b(14), b(15), b(13), b(12), b(6), b(4)]
    : [b(1), b(2), b(3), b(0), b(7), b(5)];
  return {
    mx, my,
    ax: 0, ay: 0,
    actions,
    confirm: left ? b(14) : b(1),
    back: left ? b(13) : b(0),
    start: left ? b(8) : b(9),
  };
}
