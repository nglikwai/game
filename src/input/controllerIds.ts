import { type PadSide } from '@/input/gamepads';
import { type ControlId } from '@/input/contracts';

// ---------- control options shown in the menu ----------

/** Chrome offers up to 8 gamepad slots. */
export const MAX_PAD_SLOTS = 8;

/** 'pad2R' → { index: 1, side: 'R' }; 'pad3' → { index: 2 }; anything else → null. */
export function parsePad(id: string): { index: number; side?: PadSide } | null {
  const m = /^pad(\d)([LR])?$/.exec(id);
  return m ? { index: Number(m[1]) - 1, side: m[2] as PadSide | undefined } : null;
}

/** Base choices; the lobby adds directly connected controllers as they show up. */
export const CONTROL_OPTIONS: ControlId[] = ['off', 'kb1', 'kb2', 'kb3', 'kb4', 'cpu'];
