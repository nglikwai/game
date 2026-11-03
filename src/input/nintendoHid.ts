import { type ActionValues } from '@/input/actions';
import type { HomeLight, RumbleTone } from '@/input/contracts';
import { padLabels, sidewaysMove, type PadSide, type PadState } from '@/input/gamepads';

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
 *
 * The same connection also reads a controller that calls itself a Pro Controller
 * (vendor 0x057e, product 0x2009), including the B01. macOS and Chrome leave that
 * clone's buttons unread: it keeps sending the simple 0x3f report, whose sticks
 * are Rx/Ry rather than the Z/Rz a genuine pad uses. See `proStateFromReport`.
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
/** Switch Pro Controller, and clones (such as the B01) that use the same id. */
const PRO_CONTROLLER = 0x2009;

const api = (): HidApi | undefined => (navigator as unknown as { hid?: HidApi }).hid;

/** No rumble: 160 Hz low band, 320 Hz high band, both silent. */
const NEUTRAL_RUMBLE = [0x00, 0x01, 0x40, 0x40];

/** HD rumble pitch for each tone: [high band Hz, low band Hz]. Deep thuds, crisp kicks, or the neutral buzz. */
const TONES: Record<RumbleTone, [number, number]> = { deep: [160, 80], normal: [320, 160], sharp: [640, 320] };

/**
 * One motor's four HD-rumble bytes, for an amplitude of 0–1 at the tone's two frequencies.
 * Follows the Switch encoding: frequency codes round(log2(Hz / 10) × 32), shifted per band; amplitude code
 * round(log2(amp × 8.7) × 32), doubled for the high band and halved (+64) for the low band.
 */
export function rumbleBytes(amp: number, tone: RumbleTone = 'normal'): number[] {
  if (amp <= 0) return [...NEUTRAL_RUMBLE];
  const [high, low] = TONES[tone];
  const hf = (Math.round(Math.log2(high / 10) * 32) - 0x60) * 4;
  const lf = Math.round(Math.log2(low / 10) * 32) - 0x40;
  const code = Math.round(Math.log2(Math.min(1, Math.max(0.25, amp)) * 8.7) * 32);
  return [hf & 0xff, (hf >> 8) + code * 2, lf, 0x40 + (code >> 1)];
}

/** The Switch's own player-light patterns for players 1–8 (the four lights on the rail). */
const PLAYER_LIGHTS = [0x1, 0x3, 0x7, 0xf, 0x9, 0xa, 0xb, 0x6];

/** Subcommand 0x30 argument: player `slot`'s lights, steady or (low nibble moved up) flashing. */
export const playerLightBits = (slot: number, flash = false) => {
  const bits = PLAYER_LIGHTS[((slot % 8) + 8) % 8]!;
  return flash ? bits << 4 : bits;
};

/**
 * Subcommand 0x38 data for the HOME button ring: off, a slow breathing glow, or a fast pulse (both repeat forever).
 * Bytes: mini-cycle count | step time, start intensity | repeats (0 = forever), the two intensities, then each
 * mini cycle's fade | hold multipliers.
 */
export function homeLightPattern(mode: HomeLight): number[] {
  if (mode === 'glow') return [0x2f, 0x00, 0xf2, 0x22, 0x22];
  if (mode === 'pulse') return [0x28, 0x00, 0xf0, 0x11, 0x11];
  return [0x00, 0x00, 0x00, 0x00, 0x00];
}

type Pad = { device: HidDevice; nextPacket(): number; rumbleStop?: ReturnType<typeof setTimeout> };

/** Rumble both motors (report 0x10 carries rumble only); a later call replaces an unfinished one. */
function playRumble(pad: Pad, amp: number, ms: number, tone: RumbleTone = 'normal') {
  const send = (bytes: number[]) => pad.device.sendReport(0x10, new Uint8Array([pad.nextPacket(), ...bytes, ...bytes])).catch(() => undefined);
  void send(rumbleBytes(amp, tone));
  clearTimeout(pad.rumbleStop);
  pad.rumbleStop = setTimeout(() => void send(NEUTRAL_RUMBLE), ms);
}

/** A subcommand (report 0x01) with silent rumble, padded to the full 48-byte report. */
function sendSubcommand(pad: Pad, subcommand: number, args: number[]) {
  const out = new Uint8Array(48);
  out.set([pad.nextPacket(), ...NEUTRAL_RUMBLE, ...NEUTRAL_RUMBLE, subcommand, ...args]);
  return pad.device.sendReport(0x01, out);
}

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
  rumbleStop?: ReturnType<typeof setTimeout>;

  constructor(readonly device: HidDevice, readonly side: PadSide) {}

  /** Switch the Joy-Con to full reports, and turn its vibration motor on. */
  async init() {
    await this.send(0x03, [0x30]);
    // A second nudge: some Joy-Cons miss the first one while they are still waking up.
    setTimeout(() => void this.send(0x03, [0x30]).catch(() => undefined), 400);
    setTimeout(() => void this.send(0x48, [0x01]).catch(() => undefined), 600);
  }

  nextPacket() {
    this.packet = (this.packet + 1) & 0x0f;
    return this.packet;
  }

  rumble(amp: number, ms: number, tone?: RumbleTone) {
    playRumble(this, amp, ms, tone);
  }

  setLights(slot: number, flash: boolean) {
    void this.send(0x30, [playerLightBits(slot, flash)]).catch(() => undefined);
  }

  /** Only a right Joy-Con has a HOME button; the left one simply ignores this. */
  setHomeLight(mode: HomeLight) {
    if (this.side === 'R') void this.send(0x38, homeLightPattern(mode)).catch(() => undefined);
  }

  private async send(subcommand: number, args: number[]) {
    await sendSubcommand(this, subcommand, args);
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

/**
 * Simple report 0x3f (WebHID has already dropped the report id), which is what a
 * Pro Controller sends until it is switched to full reports — and what the B01
 * keeps sending. Buttons are a little-endian 16-bit field:
 * bit 0 B (bottom), 1 A (right), 2 Y (left), 3 X (top), 4 L, 5 R, 6 ZL, 7 ZR,
 * 8 −, 9 +, 10 left stick, 11 right stick, 12 Home, 13 Capture.
 * Byte 2 is a hat: 0 up, then clockwise; 8 or 15 means centered.
 * Bytes 3–10 are left X, left Y, right X, right Y as uint16 around 32768.
 * Vertical grows downward, the same way the game's movement does.
 */
const PRO_CENTER = 32768;
const PRO_SPAN = 24000;

function proAxis(raw: number): number {
  const v = Math.max(-1, Math.min(1, (raw - PRO_CENTER) / PRO_SPAN));
  return Math.abs(v) < 0.2 ? 0 : v;
}

function stick12(d: DataView, offset: number, center: [number, number] | null): { v: [number, number]; center: [number, number] } {
  const rawX = d.getUint8(offset) | ((d.getUint8(offset + 1) & 0x0f) << 8);
  const rawY = (d.getUint8(offset + 1) >> 4) | (d.getUint8(offset + 2) << 4);
  const c = center ?? [rawX, rawY];
  const norm = (value: number, origin: number) => Math.max(-1, Math.min(1, (value - origin) / 1400));
  const x = norm(rawX, c[0]);
  const y = -norm(rawY, c[1]);
  return { v: [Math.abs(x) < 0.2 ? 0 : x, Math.abs(y) < 0.2 ? 0 : y], center: c };
}

const HAT: [number, number][] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

function faceState(bits: { b: boolean; a: boolean; y: boolean; x: boolean; l: boolean; r: boolean; zl: boolean; zr: boolean; minus: boolean; plus: boolean }, move: [number, number], aim: [number, number]): PadState {
  return {
    mx: move[0], my: move[1], ax: aim[0], ay: aim[1],
    actions: [bits.b || bits.r, bits.x, bits.a, bits.y, bits.zr, bits.zl, bits.l],
    confirm: bits.a, back: bits.b, start: bits.plus || bits.minus,
  };
}

export function proStateFromReport(
  reportId: number,
  bytes: Uint8Array,
  centers: { l: [number, number] | null; r: [number, number] | null } = { l: null, r: null },
): { state: PadState; centers: { l: [number, number] | null; r: [number, number] | null } } | null {
  const raw = Uint8Array.from(bytes);
  const view = new DataView(raw.buffer);
  if (reportId === 0x3f) {
    if (raw.length < 11) return null;
    const buttons = raw[0] | (raw[1] << 8);
    const hat = raw[2] & 0x0f;
    let move: [number, number] = [proAxis(view.getUint16(3, true)), proAxis(view.getUint16(5, true))];
    if (hat <= 7) move = HAT[hat];
    const aim: [number, number] = [proAxis(view.getUint16(7, true)), proAxis(view.getUint16(9, true))];
    return {
      centers,
      state: faceState({
        b: !!(buttons & 0x0001), a: !!(buttons & 0x0002), y: !!(buttons & 0x0004), x: !!(buttons & 0x0008),
        l: !!(buttons & 0x0010), r: !!(buttons & 0x0020), zl: !!(buttons & 0x0040), zr: !!(buttons & 0x0080),
        minus: !!(buttons & 0x0100), plus: !!(buttons & 0x0200),
      }, move, aim),
    };
  }
  if ((reportId === 0x30 || reportId === 0x21) && raw.length >= 11) {
    const right = raw[2];
    const shared = raw[3];
    const left = raw[4];
    const l = stick12(view, 5, centers.l);
    const r = stick12(view, 8, centers.r);
    let move = l.v;
    const down = !!(left & 0x01);
    const up = !!(left & 0x02);
    const rightB = !!(left & 0x04);
    const leftB = !!(left & 0x08);
    if (down || up || rightB || leftB) move = [(rightB ? 1 : 0) - (leftB ? 1 : 0), (down ? 1 : 0) - (up ? 1 : 0)];
    return {
      centers: { l: l.center, r: r.center },
      state: faceState({
        y: !!(right & 0x01), x: !!(right & 0x02), b: !!(right & 0x04), a: !!(right & 0x08),
        r: !!(right & 0x40), zr: !!(right & 0x80),
        minus: !!(shared & 0x01), plus: !!(shared & 0x02),
        l: !!(left & 0x40), zl: !!(left & 0x80),
      }, move, r.v),
    };
  }
  return null;
}

/** A Pro Controller (or a clone that uses its id) read directly, both sticks and every face button. */
export class HidPro {
  readonly kind = 'pro' as const;
  connected = true;
  ready = false;
  /** Unused for this pad; kept so a slow-link warning is never shown for event-only reports. */
  slow = false;
  rate = 0;
  battery = -1;
  charging = false;
  private st: PadState = { mx: 0, my: 0, ax: 0, ay: 0, actions: [false, false, false, false, false, false, false], confirm: false, back: false, start: false };
  private heldActs = [false, false, false, false, false, false, false];
  private edges = [false, false, false, false, false, false, false];
  private centers: { l: [number, number] | null; r: [number, number] | null } = { l: null, r: null };
  private samples: number[] = [];
  private packet = 3;
  rumbleStop?: ReturnType<typeof setTimeout>;

  constructor(readonly device: HidDevice) {}

  nextPacket() {
    this.packet = (this.packet + 1) & 0x0f;
    return this.packet;
  }

  rumble(amp: number, ms: number, tone?: RumbleTone) {
    playRumble(this, amp, ms, tone);
  }

  setLights(slot: number, flash: boolean) {
    void sendSubcommand(this, 0x30, [playerLightBits(slot, flash)]).catch(() => undefined);
  }

  setHomeLight(mode: HomeLight) {
    void sendSubcommand(this, 0x38, homeLightPattern(mode)).catch(() => undefined);
  }

  /** Ask for full 0x30 reports, then turn vibration on. A clone that ignores this keeps sending 0x3f, which we still read. */
  async init() {
    for (const [subcommand, arg] of [[0x03, 0x30], [0x48, 0x01]] as const) {
      try {
        await sendSubcommand(this, subcommand, [arg]);
      } catch {
        // Simple reports still arrive; a clone without a motor or lights just ignores these.
      }
    }
  }

  parse(reportId: number, data: DataView) {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const parsed = proStateFromReport(reportId, bytes, this.centers);
    if (!parsed) return;
    this.centers = parsed.centers;
    const next = parsed.state.actions;
    for (let i = 0; i < next.length; i++) if (next[i] && !this.heldActs[i]) this.edges[i] = true;
    this.heldActs = [...next];
    this.st = parsed.state;
    this.ready = true;
    const now = performance.now();
    this.samples.push(now);
    this.samples = this.samples.filter((t) => now - t < 1000);
    this.rate = this.samples.length;
  }

  /** Held buttons plus any tap that has not been read yet. `take` uses those taps up. */
  state(take = false): PadState {
    const actions = this.st.actions.map((v, i) => v || this.edges[i]) as PadState['actions'];
    if (take) this.edges = [false, false, false, false, false, false, false];
    return { ...this.st, actions };
  }

  held(): string[] {
    const names = ['B', 'X', 'A', 'Y', 'ZR', 'ZL', 'L'];
    const down = names.filter((_, i) => this.st.actions[i]);
    if (this.st.start) down.push('+');
    return down;
  }
}

export type DirectPad = HidJoyCon | HidPro;
export const isProPad = (p: DirectPad | { kind?: string }): p is HidPro => (p as { kind?: string }).kind === 'pro';

/** Directly connected Joy-Cons and Pro Controllers, in the order they were connected. */
const pads: DirectPad[] = [];
const listeners = new Set<() => void>();
export let lastError = '';

export const hidPads = () => pads;
export const hidPad = (n: number): DirectPad | null => pads.filter((p) => p.connected)[n - 1] ?? null;
export const onHidChange = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const changed = () => listeners.forEach((fn) => fn());

const sideOf = (d: HidDevice): PadSide | null => (d.productId === JOYCON_L ? 'L' : d.productId === JOYCON_R ? 'R' : null);

/** Open one Joy-Con or Pro Controller and start reading it. */
async function attach(device: HidDevice) {
  const side = sideOf(device);
  const pro = device.productId === PRO_CONTROLLER;
  if (!side && !pro) return;
  let pad = pads.find((p) => p.device === device);
  if (pad?.connected && device.opened) return;
  if (!pad) {
    pad = side ? new HidJoyCon(device, side) : new HidPro(device);
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

/** Ask the player to pick Joy-Cons or a Pro Controller (needs a click or key press), then start reading them. */
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
  L: ['left', 'right', 'down', 'up', 'sr', 'sl', 'l'],
  R: ['a', 'y', 'x', 'b', 'sr', 'sl', 'r'],
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

/** The seven action buttons in use for this Joy-Con (custom choice or default). */
export function hidKeys(side: PadSide): (keyof JoyButtons)[] {
  const map = getHidMap(side);
  const keys = DEFAULT_KEYS[side].map((def, i) => map?.[i] ?? def);
  // Existing custom maps may already use L/R for another action. Pick an unused fallback.
  if (!map?.[6] && keys.slice(0, 6).includes(keys[6])) keys[6] = configurable(side).find((k) => !keys.slice(0, 6).includes(k)) ?? keys[6];
  return keys;
}

/**
 * What a directly-connected Joy-Con is doing, as the same state a gamepad gives (held sideways, one per
 * player). With `take`, taps shorter than a frame also count (and are used up).
 */
export function hidState(p: DirectPad, take = false): PadState {
  if (isProPad(p)) return p.state(take);
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

/** Button names for attack, skills 1–3, use item, next item, skill 4. */
export const hidLabels = (side: PadSide): ActionValues<string> =>
  hidKeys(side).map((k) => joyLabel(side, k)) as ActionValues<string>;

/** Button names for a directly connected pad: Switch face buttons on a Pro Controller, the Joy-Con's own otherwise. */
export function directLabels(p: DirectPad | null): ActionValues<string> {
  return p && isProPad(p) ? padLabels('nintendo') : hidLabels(p && !isProPad(p) ? p.side : 'R');
}
