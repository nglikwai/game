import { sidewaysMove, type PadSide, type PadState } from './gamepads';

/**
 * Direct Joy-Con input over WebHID. A Joy-Con that the system has joined into a pair
 * reaches the browser as one standard gamepad with no SL / SR (the buttons on the rail,
 * which are the ones you press when holding a Joy-Con sideways). Reading each Joy-Con's own
 * HID reports gives every button, and lets the two halves be two players.
 *
 * Opt-in: the player connects them from the Controller Setup page (the browser asks which
 * devices to allow). Protocol notes: the Joy-Con sends the plain "0x3f" reports until told to
 * send the "0x30" full reports (subcommand 0x03, argument 0x30); those carry the buttons in
 * bytes 2–4 (right, shared, left), the left stick in bytes 5–7 and the right stick in 8–10.
 * WebHID hands those bytes over without the leading report id.
 */

// Minimal WebHID typings (the DOM lib in use doesn't include them).
interface HidDevice {
  vendorId: number;
  productId: number;
  productName: string;
  opened: boolean;
  open(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  addEventListener(type: 'inputreport', fn: (e: { reportId: number; data: DataView }) => void): void;
}
interface HidApi {
  requestDevice(o: { filters: { vendorId: number }[] }): Promise<HidDevice[]>;
  getDevices(): Promise<HidDevice[]>;
  addEventListener(type: 'connect' | 'disconnect', fn: (e: { device: HidDevice }) => void): void;
}

const NINTENDO = 0x057e;
const JOYCON_L = 0x2006;
const JOYCON_R = 0x2007;

const api = (): HidApi | undefined => (navigator as unknown as { hid?: HidApi }).hid;

export const hidSupported = () => !!api();

export type JoyButtons = Record<'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'x' | 'y' | 'sl' | 'sr' | 'l' | 'r' | 'zl' | 'zr' | 'minus' | 'plus' | 'stick' | 'home' | 'capture', boolean>;

const noButtons = (): JoyButtons => ({
  up: false, down: false, left: false, right: false, a: false, b: false, x: false, y: false,
  sl: false, sr: false, l: false, r: false, zl: false, zr: false, minus: false, plus: false, stick: false, home: false, capture: false,
});

/** One Joy-Con read directly. */
export class HidJoyCon {
  connected = true;
  /** True once a full report has arrived (so we know it is really talking to us). */
  ready = false;
  down: JoyButtons = noButtons();
  /** Buttons pressed since they were last taken, so a tap shorter than a frame still counts. */
  private pressed = new Set<keyof JoyButtons>();
  /** Stick in the controller's own frame: x right, y down, −1…1. */
  stick: [number, number] = [0, 0];
  /** Battery: 0 (empty) … 4 (full), and whether it is charging. */
  battery = -1;
  charging = false;
  private stamps: number[] = [];
  private center: [number, number] | null = null;
  private samples: [number, number][] = [];
  private packet = 0;

  constructor(readonly device: HidDevice, readonly side: PadSide) {}

  /** Switch the Joy-Con to full reports. */
  async init() {
    await this.send(0x03, [0x30]);
    // A second nudge: some Joy-Cons miss the first one while they are still waking up.
    setTimeout(() => void this.send(0x03, [0x30]).catch(() => undefined), 400);
  }

  private async send(subcommand: number, args: number[]) {
    const neutralRumble = [0x00, 0x01, 0x40, 0x40, 0x00, 0x01, 0x40, 0x40];
    this.packet = (this.packet + 1) & 0x0f;
    await this.device.sendReport(0x01, new Uint8Array([this.packet, ...neutralRumble, subcommand, ...args]));
  }

  /** A "0x30" (or subcommand reply "0x21") report: buttons and sticks. */
  parse(reportId: number, d: DataView) {
    if ((reportId !== 0x30 && reportId !== 0x21) || d.byteLength < 11) return;
    this.ready = true;
    const now = performance.now();
    this.stamps.push(now);
    while (this.stamps.length && now - this.stamps[0] > 1000) this.stamps.shift();
    const bat = d.getUint8(1) >> 4;
    this.battery = bat >> 1;
    this.charging = !!(bat & 1);
    const right = d.getUint8(2);
    const shared = d.getUint8(3);
    const left = d.getUint8(4);
    const b = this.down;
    const before = { ...b };
    if (this.side === 'R') {
      b.y = !!(right & 0x01); b.x = !!(right & 0x02); b.b = !!(right & 0x04); b.a = !!(right & 0x08);
      b.sr = !!(right & 0x10); b.sl = !!(right & 0x20); b.r = !!(right & 0x40); b.zr = !!(right & 0x80);
    } else {
      b.down = !!(left & 0x01); b.up = !!(left & 0x02); b.right = !!(left & 0x04); b.left = !!(left & 0x08);
      b.sr = !!(left & 0x10); b.sl = !!(left & 0x20); b.l = !!(left & 0x40); b.zl = !!(left & 0x80);
    }
    b.minus = !!(shared & 0x01); b.plus = !!(shared & 0x02);
    b.stick = !!(shared & (this.side === 'R' ? 0x04 : 0x08));
    b.home = !!(shared & 0x10); b.capture = !!(shared & 0x20);
    for (const k of Object.keys(b) as (keyof JoyButtons)[]) if (b[k] && !before[k]) this.pressed.add(k);
    // 12-bit stick values; the Joy-Con's rest position is learned from its first reports.
    const o = this.side === 'R' ? 8 : 5;
    const rawX = d.getUint8(o) | ((d.getUint8(o + 1) & 0x0f) << 8);
    const rawY = (d.getUint8(o + 1) >> 4) | (d.getUint8(o + 2) << 4);
    if (!this.center) {
      this.samples.push([rawX, rawY]);
      if (this.samples.length >= 6) {
        this.center = [
          this.samples.reduce((s, v) => s + v[0], 0) / this.samples.length,
          this.samples.reduce((s, v) => s + v[1], 0) / this.samples.length,
        ];
      }
      this.stick = [0, 0];
      return;
    }
    const dead = 0.2;
    const norm = (v: number) => Math.max(-1, Math.min(1, v / 1100));
    const sx = norm(rawX - this.center[0]);
    const sy = -norm(rawY - this.center[1]); // raw y grows upwards
    this.stick = [Math.abs(sx) < dead ? 0 : sx, Math.abs(sy) < dead ? 0 : sy];
  }

  /** How many reports arrived in the last second: a healthy Joy-Con sends about 60. */
  get rate(): number {
    const now = performance.now();
    return this.stamps.filter((t) => now - t <= 1000).length;
  }

  /** Reports so rare that the controls will feel laggy. */
  get slow(): boolean {
    return this.ready && this.rate < 30;
  }

  /** Buttons newly pressed since the last call (and forget them). */
  takeEdges(): (keyof JoyButtons)[] {
    const out = [...this.pressed];
    this.pressed.clear();
    return out;
  }

  /** Names of the buttons currently held (for the setup page). */
  held(): string[] {
    return (Object.keys(this.down) as (keyof JoyButtons)[]).filter((k) => this.down[k]).map((k) => joyLabel(this.side, k));
  }
}

/** Directly connected Joy-Cons, in the order they were connected. */
const pads: HidJoyCon[] = [];
const listeners = new Set<() => void>();
export let lastError = '';

export const hidPads = () => pads;
export const hidPad = (n: number): HidJoyCon | null => pads.filter((p) => p.connected)[n - 1] ?? null;
export const onHidChange = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const changed = () => listeners.forEach((fn) => fn());

const sideOf = (d: HidDevice): PadSide | null => (d.productId === JOYCON_L ? 'L' : d.productId === JOYCON_R ? 'R' : null);

/** Open one Joy-Con and start reading it. */
async function attach(device: HidDevice) {
  const side = sideOf(device);
  if (!side) return;
  let pad = pads.find((p) => p.device === device);
  if (pad?.connected && device.opened) return;
  if (!pad) {
    pad = new HidJoyCon(device, side);
    pads.push(pad);
    device.addEventListener('inputreport', (e) => pad!.parse(e.reportId, e.data));
  }
  pad.connected = true;
  pad.ready = false;
  try {
    if (!device.opened) await device.open();
    await pad.init();
    lastError = '';
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    pad.connected = false;
  }
  changed();
}

/** Ask the player to pick Joy-Cons (needs a click or key press), then start reading them. */
export async function connectJoyCons(): Promise<number> {
  const hid = api();
  if (!hid) return 0;
  try {
    const picked = await hid.requestDevice({ filters: [{ vendorId: NINTENDO }] });
    for (const d of picked) await attach(d);
    return picked.length;
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    changed();
    return 0;
  }
}

/** On start-up: reopen Joy-Cons the player allowed before, and follow them as they come and go. */
export function initJoyConHid() {
  const hid = api();
  if (!hid) return;
  void hid.getDevices().then((list) => list.forEach((d) => void attach(d)));
  hid.addEventListener('connect', (e) => void attach(e.device));
  hid.addEventListener('disconnect', (e) => {
    const p = pads.find((x) => x.device === e.device);
    if (p) {
      p.connected = false;
      p.ready = false;
      changed();
    }
  });
}

/** Short on-screen names of a Joy-Con's buttons. */
const NAMES: Record<PadSide, Partial<Record<keyof JoyButtons, string>>> = {
  L: { left: '←', right: '→', up: '↑', down: '↓', sl: 'SL', sr: 'SR', l: 'L', zl: 'ZL', minus: '−', stick: '●', capture: '▣' },
  R: { a: 'A', b: 'B', x: 'X', y: 'Y', sl: 'SL', sr: 'SR', r: 'R', zr: 'ZR', plus: '+', stick: '●', home: '⌂' },
};
export const joyLabel = (side: PadSide, key: keyof JoyButtons) => NAMES[side][key] ?? String(key);

/** Buttons that can be given to a game action (+ / − pause, and Home / Capture are left alone). */
export const configurable = (side: PadSide): (keyof JoyButtons)[] =>
  (Object.keys(NAMES[side]) as (keyof JoyButtons)[]).filter((k) => !['plus', 'minus', 'home', 'capture'].includes(k));

/** Which button does attack, skill 1–3, use item, next item, unless the player chose otherwise. */
const DEFAULT_KEYS: Record<PadSide, (keyof JoyButtons)[]> = {
  L: ['left', 'right', 'down', 'up', 'sr', 'sl'],
  R: ['a', 'y', 'x', 'b', 'sr', 'sl'],
};

export type HidMap = (keyof JoyButtons | null)[];
const MAP_KEY = 'arena-duel-hid-maps';

function loadMaps(): Partial<Record<PadSide, HidMap>> {
  try {
    return JSON.parse(localStorage.getItem(MAP_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export const getHidMap = (side: PadSide): HidMap | null => loadMaps()[side] ?? null;

export function setHidMap(side: PadSide, map: HidMap | null) {
  const all = loadMaps();
  if (map) all[side] = map;
  else delete all[side];
  try {
    localStorage.setItem(MAP_KEY, JSON.stringify(all));
  } catch {
    // Not critical.
  }
}

/** The six action buttons in use for this Joy-Con (custom choice or default). */
export function hidKeys(side: PadSide): (keyof JoyButtons)[] {
  const map = getHidMap(side);
  return DEFAULT_KEYS[side].map((def, i) => map?.[i] ?? def);
}

/**
 * What a directly-connected Joy-Con is doing, as the same state a gamepad gives (held sideways, one per
 * player). With `take`, taps shorter than a frame also count (and are used up).
 */
export function hidState(p: HidJoyCon, take = false): PadState {
  const d = p.down;
  const [mx, my] = sidewaysMove(p.side, p.stick[0], p.stick[1]);
  const left = p.side === 'L';
  const tapped = new Set(take ? p.takeEdges() : []);
  return {
    mx, my, ax: 0, ay: 0,
    actions: hidKeys(p.side).map((k) => d[k] || tapped.has(k)) as PadState['actions'],
    confirm: left ? d.left : d.a,
    back: left ? d.down : d.b,
    start: d.plus || d.minus,
  };
}

/** Button names for attack, skills 1–3, use item, next item. */
export const hidLabels = (side: PadSide): [string, string, string, string, string, string] =>
  hidKeys(side).map((k) => joyLabel(side, k)) as [string, string, string, string, string, string];
