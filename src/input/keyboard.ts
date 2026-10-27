import * as Phaser from 'phaser';
import { type Intent, type Controller, type ControlId, type Binds, type Labels, type KeySetId, type KeySet } from '@/input/contracts';

const K = Phaser.Input.Keyboard.KeyCodes;

export const KEY_SETS: Record<KeySetId, KeySet> = {
  kb1: { move: [K.W, K.S, K.A, K.D], defaultBinds: [K.F, K.Q, K.E, K.R, K.G, K.C, K.T] },
  kb2: { move: [K.UP, K.DOWN, K.LEFT, K.RIGHT], defaultBinds: [K.FORWARD_SLASH, K.PERIOD, K.SEMICOLON, K.QUOTES, K.CLOSED_BRACKET, K.OPEN_BRACKET, K.BACK_SLASH] },
  kb3: { move: [K.I, K.K, K.J, K.L], defaultBinds: [K.H, K.Y, K.U, K.O, K.N, K.B, K.P] },
  kb4: { move: [K.NUMPAD_EIGHT, K.NUMPAD_FIVE, K.NUMPAD_FOUR, K.NUMPAD_SIX], defaultBinds: [K.NUMPAD_ZERO, K.NUMPAD_ONE, K.NUMPAD_TWO, K.NUMPAD_THREE, K.NUMPAD_ADD, K.NUMPAD_SUBTRACT, K.NUMPAD_SEVEN] },
};

export const isKeySet = (id: ControlId): id is KeySetId => id in KEY_SETS;

const META_LABEL = /Mac|iPhone|iPad/.test(navigator.userAgent) ? 'Cmd' : 'Win';

const KEY_LABEL_OVERRIDES: Record<number, string> = {
  [K.FORWARD_SLASH]: '/', [K.BACK_SLASH]: '\\', [K.PERIOD]: '.', [K.COMMA]: ',', [K.SEMICOLON]: ';',
  [K.QUOTES]: "'", [K.OPEN_BRACKET]: '[', [K.CLOSED_BRACKET]: ']', [K.MINUS]: '-', [K.PLUS]: '=',
  [K.BACKTICK]: '`', [K.UP]: '↑', [K.DOWN]: '↓', [K.LEFT]: '←', [K.RIGHT]: '→', [K.SPACE]: 'Space',
  [K.SHIFT]: 'Shift', [K.CTRL]: 'Ctrl', [K.ALT]: 'Alt', [K.TAB]: 'Tab', [K.BACKSPACE]: 'Bksp',
  [K.NUMPAD_ADD]: 'Num+', [K.NUMPAD_SUBTRACT]: 'Num-',
  // OS keys (left / right Cmd on Mac, Windows key elsewhere) aren't in Phaser's KeyCodes.
  91: META_LABEL, 92: META_LABEL, 93: META_LABEL,
  [K.ZERO]: '0', [K.ONE]: '1', [K.TWO]: '2', [K.THREE]: '3', [K.FOUR]: '4',
  [K.FIVE]: '5', [K.SIX]: '6', [K.SEVEN]: '7', [K.EIGHT]: '8', [K.NINE]: '9',
};

const NUMPAD_DIGITS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];

NUMPAD_DIGITS.forEach((d, n) => { KEY_LABEL_OVERRIDES[K[`NUMPAD_${d}` as keyof typeof K]] = `Num${n}`; });

const KEY_NAMES = new Map<number, string>();

for (const [name, code] of Object.entries(K)) if (!KEY_NAMES.has(code)) KEY_NAMES.set(code, name);

export function keyLabel(code: number): string {
  return KEY_LABEL_OVERRIDES[code] ?? KEY_NAMES.get(code) ?? `#${code}`;
}

// ---------- keyboard ----------

export class KeyboardController implements Controller {
  private keys: Record<'up' | 'down' | 'left' | 'right' | 'attack' | 's1' | 's2' | 's3' | 's4' | 'use' | 'next', Phaser.Input.Keyboard.Key>;
  labels: Labels;

  constructor(scene: Phaser.Scene, move: KeySet['move'], binds: Binds) {
    const kb = scene.input.keyboard!;
    const [up, down, left, right] = move.map((c) => kb.addKey(c));
    const [attack, s1, s2, s3, use, next, s4] = binds.map((c) => kb.addKey(c));
    this.keys = { up, down, left, right, attack, s1, s2, s3, use, next, s4 };
    this.labels = binds.map(keyLabel) as Labels;
  }

  read(): Intent {
    const k = this.keys;
    const jd = Phaser.Input.Keyboard.JustDown;
    return {
      mx: (k.right.isDown ? 1 : 0) - (k.left.isDown ? 1 : 0),
      my: (k.down.isDown ? 1 : 0) - (k.up.isDown ? 1 : 0),
      ax: 0, ay: 0,
      attack: jd(k.attack),
      skills: [jd(k.s1), jd(k.s2), jd(k.s3), jd(k.s4)],
      useItem: jd(k.use),
      nextItem: jd(k.next),
    };
  }
}
