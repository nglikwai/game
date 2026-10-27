import { type ActionValues } from '@/input/actions';
import type { Fighter } from '@/gameplay/Fighter';
import type { Projectile, SpiritRelay } from '@/battle/types';

export interface Intent {
  mx: number;
  my: number;
  /** Optional explicit aim direction (gamepad right stick / AI). */
  ax: number;
  ay: number;
  /** Edge-triggered: true only on the frame the button is pressed. */
  attack: boolean;
  /** One flag per equipped skill. Players have four; bosses can have many more. */
  skills: boolean[];
  /** Use the selected pocket item / move the selection to the next item (edge-triggered). */
  useItem: boolean;
  nextItem: boolean;
  /** CPU only: use this pocket slot directly. */
  useItemAt?: number;
}

export const emptyIntent = (): Intent => ({ mx: 0, my: 0, ax: 0, ay: 0, attack: false, skills: [false, false, false, false], useItem: false, nextItem: false });

export interface WorldView {
  fighters: Fighter[];
  projectiles: Projectile[];
  /** Save the Princess: all walls still holding princesses (centre + size). */
  objectives: { team: number; x: number; y: number; w: number; h: number }[];
  /** Treasure chests on the field (centre + size). */
  chests: { x: number; y: number; w: number; h: number }[];
  /** Quest: nobody paths to a chest. An enemy may still break one while fighting. */
  lootChests?: boolean;
  /** Watchtowers (team modes). */
  towers?: { team: number; x: number; y: number; w: number; h: number; alive: boolean; tree?: boolean; grove?: string }[];
  /**
   * Go for the enemy towers wherever they are (the dragon's heads) whenever no enemy fighter is within this distance;
   * nearer enemies are fought first.
   */
  towersWhenClear?: number;
  /** Siege: towers are the main objective. */
  siege?: boolean;
  /** This team's CPU allies fight enemies and defend teammates before attacking objectives. */
  defendTeam?: number;
  /** Floor objectives that charge by standing inside, never by attacking them. */
  capturePoints?: { team: number; x: number; y: number; radius: number; sealed: boolean }[];
  /** Couriers collect one physical spirit and bring it to the lantern; enemies intercept them. */
  spiritRelay?: SpiritRelay;
  /** Invading CPU heroes agree on one altar so objectives needing two allies remain achievable. */
  coordinateCaptures?: boolean;
  /** Moving Quest objective: allies guide it and guards can attack it. */
  escort?: { team: number; x: number; y: number; w: number; h: number; radius: number; alive: boolean; arrived: boolean; lost?: boolean };
  /** The map's routing hint for CPU fighters (e.g. which bridge to take), if any. */
  route?: (fx: number, fy: number, tx: number, ty: number) => { x: number; y: number } | null;
  /** Shrinking barrier: the safe circle right now, if the map has one. */
  safe?: () => { x: number; y: number; r: number } | null;
  /** Healing herbs that are grown and ready to pick. */
  herbs?: () => { x: number; y: number }[];
  /** Fire on the ground, spots about to burst, and other marked danger. `safeTeam` is a side it can't hurt. */
  fires?: () => { x: number; y: number; r: number; safeTeam?: number; rx?: number; ry?: number }[];
}

export interface Controller {
  read(self: Fighter, world: WorldView, dt: number): Intent;
  /** Short labels in the saved action order (skill 4 is last); shown in the HUD. */
  labels: Labels;
  /** Gamepads only: false while the controller is not connected (asleep, out of range). */
  readonly connected?: boolean;
}

export type PadSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type ControlId =
  | 'off' | 'kb1' | 'kb2' | 'kb3' | 'kb4' | 'cpu'
  | `pad${PadSlot}`
  /** One half of a Joy-Con pair that the system joined into a single controller (so the two halves are two players). */
  | `pad${PadSlot}${'L' | 'R'}`
  /** A Joy-Con read directly over WebHID (so SL / SR work); the Nth one connected. */
  | `hid${1 | 2 | 3 | 4}`;

/** Saved key order: attack, skills 1–3, use item, next item, skill 4. */
export type Binds = ActionValues<number>;

export type Labels = ActionValues<string>;

export type KeySetId = 'kb1' | 'kb2' | 'kb3' | 'kb4';

export interface KeySet {
  /** Movement keys are fixed per set: up, down, left, right. */
  move: [number, number, number, number];
  defaultBinds: Binds;
}
