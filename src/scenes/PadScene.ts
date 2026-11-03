import { ACTION_COUNT } from '@/input/actions';
import * as Phaser from 'phaser';
import { HEIGHT, WIDTH } from '@/config';
import { T, getLang } from '@/localization';
import { MAX_PAD_SLOTS } from '@/input/controllerIds';
import { configurable, connectJoyCons, hidKeys, hidPad, hidPads, hidState, hidSupported, isProPad, joyLabel, lastError, setHidMap, type HidMap, type JoyButtons } from '@/input/nintendoHid';
import { type PadSide } from '@/input/gamepads';
import {
  setPadMap, type PadMap,
} from '@/input/padSettings';
import { C, FocusNav, Petals, UIScene, addBackdrop, addButton, addMenuHeader, drawFrame, toast, txt, type Modal } from '@/ui';
import { drawControllerIcon } from '@/rendering/menuArt';

/** Rows shown at once; more controllers than that go on further pages. */
const ROWS = 4;
const ROW_Y = 110;
const ROW_H = 118;
const ROW_X = 40;
const ROW_W = WIDTH - 80;
const ACTIONS = ACTION_COUNT;

/** Short names of the seven actions, for the live test line. */
const actShort = () => (getLang() === 'zh' ? ['攻', '技1', '技2', '技3', '用', '換', '技4'] : ['Atk', 'S1', 'S2', 'S3', 'Use', 'Nxt', 'S4']);
const actLine = (acts: boolean[]) => acts.slice(0, ACTIONS).map((on, n) => `${actShort()[n]}${on ? '●' : '○'}`).join(' ');

/** Walking through "press the button for …" for one controller (or one half of it). */
interface CalState {
  kind: 'pad' | 'hid';
  /** Gamepad slot (0-based) or direct Joy-Con number (1-based). */
  index: number;
  id: string;
  side?: PadSide;
  /** 0 = movement (gamepads only), 1–6 = attack, skills 1–3, use item, next item, skill 4. */
  step: number;
  map: PadMap;
  keys: (keyof JoyButtons | null)[];
  used: Set<number>;
  usedKeys: Set<string>;
  /** Inputs that were already down when the step began; they count again only after being let go. */
  ignore: Set<number>;
  ignoreAxes: Set<number>;
  hint: string;
  modal: Modal;
}

/**
 * Controller Setup: lists directly connected Joy-Cons and Pro Controllers with live input,
 * provides the direct-connect action, and lets each Joy-Con configure its buttons.
 */
export class PadScene extends UIScene {
  private petals!: Petals;
  private nav!: FocusNav;
  private layer!: Phaser.GameObjects.Container;
  private from = 'Title';
  private fromData?: object;
  private signature = '';
  private page = 0;
  private foundText!: Phaser.GameObjects.Text;
  private updaters: (() => void)[] = [];
  private cal: CalState | null = null;

  constructor() {
    super('Pads');
  }

  create(data: { from?: string; fromData?: object }) {
    this.setupUI();
    this.from = data?.from ?? 'Title';
    this.fromData = data?.fromData;
    addBackdrop(this, 0.75);
    this.petals = new Petals(this, { x: 0, y: 0, w: WIDTH, h: HEIGHT }, 10);
    addMenuHeader(this, T().padSetup);
    txt(this, WIDTH / 2, 84, T().padSetupHint, 12, C.dim, { origin: 0.5, wrap: 1100, align: 'center' });
    this.foundText = txt(this, WIDTH - 40, 40, '', 13, '#8ac79f', { origin: [1, 0.5], bold: true });

    this.layer = this.add.container(0, 0);
    this.nav = new FocusNav(this);
    this.pushNav(this.nav);
    this.nav.onBack = () => this.leave();
    this.cal = null;
    this.build();
  }

  private leave() {
    this.scene.start(this.from, this.fromData);
  }

  private pads(): (Gamepad | null)[] {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    return Array.from({ length: MAX_PAD_SLOTS }, (_, i) => {
      const p = list[i];
      return p && p.connected ? p : null;
    });
  }

  private sig() {
    return hidPads().map((j) => `${isProPad(j) ? 'P' : j.side}${j.connected ? 1 : 0}`).join(',');
  }

  private build() {
    this.layer.removeAll(true);
    this.nav.reset();
    this.updaters = [];
    this.signature = this.sig();

    const entries = hidPads().filter(j => j.connected).map((_, n) => n + 1);
    const connectedCount = entries.length;
    const pages = Math.max(1, Math.ceil(connectedCount / ROWS));
    this.page = Math.min(this.page, pages - 1);
    const ordered = entries.slice(this.page * ROWS, (this.page + 1) * ROWS);
    this.foundText.setText(T().padFound(connectedCount));

    ordered.forEach((n, row) => {
      const y = ROW_Y + row * ROW_H;
      const g = this.add.graphics();
      const live = !!hidPad(n);
      drawFrame(g, ROW_X, y, ROW_W, ROW_H - 10, { fill: 0x17202e, fillAlpha: 0.95, border: live ? 0x658b81 : C.border, radius: 12 });
      drawControllerIcon(g, ROW_X + 41, y + 51, 43, live ? 0x8bbd9e : 0x596c82);
      if (live) g.fillStyle(0x8bbd9e, 0.8).fillCircle(ROW_X + ROW_W - 12, y + 14, 3);
      this.layer.add(g);
      const glow = this.add.graphics();
      this.layer.add(glow);
      this.buildHidRow(n, y, glow);
    });

    if (connectedCount === 0) {
      this.layer.add(txt(this, WIDTH / 2, ROW_Y + 160, T().hidNone, 20, C.dim, { origin: 0.5 }));
    }

    // Paging, then the direct-connect button.
    if (pages > 1) {
      addButton(this, this.layer, this.nav, { id: 'prev', x: WIDTH / 2 - 100, y: HEIGHT - 40, w: 80, h: 40, label: '◀', onPress: () => { this.page = (this.page + pages - 1) % pages; this.build(); } });
      this.layer.add(txt(this, WIDTH / 2, HEIGHT - 40, `${this.page + 1} / ${pages}`, 16, C.dim, { origin: 0.5 }));
      addButton(this, this.layer, this.nav, { id: 'next', x: WIDTH / 2 + 100, y: HEIGHT - 40, w: 80, h: 40, label: '▶', onPress: () => { this.page = (this.page + 1) % pages; this.build(); } });
    }
    if (hidSupported()) {
      this.layer.add(txt(this, 340, 590, T().hidHelp, 12, C.dim, { wrap: 880 }));
      addButton(this, this.layer, this.nav, { id: 'hid', x: 960, y: HEIGHT - 40, w: 520, h: 46, label: `🔌  ${T().hidConnect}`, size: 18, primary: true, onPress: () => void connectJoyCons() });
    } else {
      this.layer.add(txt(this, 340, 590, T().hidUnsupported, 13, C.faint, { wrap: 880 }));
    }
    const status = txt(this, 340, 622, '', 12, '#ff8a8a', { wrap: 560 });
    this.layer.add(status);
    this.updaters.push(() => status.setText(lastError ? T().hidError(lastError) : hidPads().some((j) => j.connected && j.slow) ? T().hidSlowTip : ''));
    addButton(this, this.layer, this.nav, { id: 'back', x: 110, y: HEIGHT - 40, w: 150, h: 46, label: T().back, onPress: () => this.leave() });
    this.nav.done(this.nav.current ?? undefined);
  }

  // ---------- rows ----------

  /** A Joy-Con or Pro Controller connected directly. */
  private buildHidRow(n: number, y: number, glow: Phaser.GameObjects.Graphics) {
    const j = hidPad(n);
    if (!j) return;
    if (isProPad(j)) {
      this.buildProRow(n, y, glow);
      return;
    }
    this.layer.add(txt(this, ROW_X + 84, y + 16, T().hidRow(n), 21, C.text, { title: true, bold: true }));
    this.layer.add(txt(this, ROW_X + 84, y + 48, `Joy-Con (${j.side}) ⚡`, 14, C.text, { bold: true }));
    const link = txt(this, ROW_X + 84, y + 70, '', 10, C.dim);
    const warn = txt(this, ROW_X + 84, y + 86, '', 10, '#ff8a8a', { wrap: 238 });
    const raw = txt(this, ROW_X + 340, y + 14, '', 12, C.dim);
    const test = txt(this, ROW_X + 340, y + 40, '', 14, C.text, { bold: true });
    this.layer.add([link, warn, raw, test]);
    this.updaters.push(() => {
      const now = hidPad(n);
      if (!now || isProPad(now)) return;
      const bat = now.battery >= 0 ? `${T().hidBattery[now.battery]}${now.charging ? ' ⚡' : ''}` : '–';
      link.setText(T().hidRate(now.rate, bat));
      link.setColor(now.slow ? '#ff8a8a' : '#9fe89a');
      warn.setText(now.slow ? T().hidSlow : '');
      if (!now.ready) {
        raw.setText(T().hidWaiting);
        test.setText('');
        return;
      }
      const held = now.held();
      raw.setText(T().hidRaw(held.length ? held.join(' ') : '–', `${now.stick[0].toFixed(2)} / ${now.stick[1].toFixed(2)}`));
      const acts = hidKeys(now.side).map((k) => now.down[k]);
      test.setText(T().padTest('', actLine(acts), `${now.stick[0].toFixed(1)}, ${now.stick[1].toFixed(1)}`));
      test.setColor(acts.some(Boolean) || held.length > 0 ? '#ffd27a' : C.text);
      glow.clear();
      if (held.length > 0) glow.lineStyle(3, C.gold, 0.9).strokeRoundedRect(ROW_X, y, ROW_W, ROW_H - 10, 12);
    });
    // The current choice for each action, then set / reset.
    this.layer.add(txt(this, ROW_X + 340, y + 70, hidKeys(j.side).map((k, i) => `${T().bindNames[i]} ${joyLabel(j.side, k)}`).join('  ·  '), 12, C.dim, { wrap: 420 }));
    addButton(this, this.layer, this.nav, { id: `h${n}-c`, x: ROW_X + 790 + 56 + 75, y: y + 40, w: 150, h: 34, label: T().padCalibrate, size: 15, onPress: () => this.openCalibrate('hid', n) });
    addButton(this, this.layer, this.nav, { id: `h${n}-r`, x: ROW_X + 790 + 56 + 150 + 10 + 45, y: y + 40, w: 90, h: 34, label: T().padReset, size: 15, onPress: () => { setHidMap(j.side, null); this.build(); } });
  }

  /** The B01-style Pro Controller: Switch face buttons, left stick moves, right stick aims. */
  private buildProRow(n: number, y: number, glow: Phaser.GameObjects.Graphics) {
    this.layer.add(txt(this, ROW_X + 84, y + 16, T().hidRow(n), 21, C.text, { title: true, bold: true }));
    this.layer.add(txt(this, ROW_X + 84, y + 48, `${T().hidProName} ⚡`, 14, C.text, { bold: true }));
    this.layer.add(txt(this, ROW_X + 84, y + 72, 'B · X · A · Y · ZR · ZL', 12, C.dim));
    const raw = txt(this, ROW_X + 340, y + 18, '', 12, C.dim);
    const test = txt(this, ROW_X + 340, y + 48, '', 14, C.text, { bold: true });
    this.layer.add([raw, test]);
    this.updaters.push(() => {
      const now = hidPad(n);
      if (!now || !isProPad(now)) return;
      if (!now.ready) {
        raw.setText(T().hidWaiting);
        test.setText('');
        return;
      }
      const st = hidState(now);
      const held = now.held();
      raw.setText(T().hidRaw(held.length ? held.join(' ') : '–', `${st.mx.toFixed(2)} / ${st.my.toFixed(2)}   ${st.ax.toFixed(2)} / ${st.ay.toFixed(2)}`));
      test.setText(T().padTest('', actLine(st.actions), `${st.mx.toFixed(1)}, ${st.my.toFixed(1)}`));
      test.setColor(st.actions.some(Boolean) || held.length > 0 ? '#ffd27a' : C.text);
      glow.clear();
      if (held.length > 0) glow.lineStyle(3, C.gold, 0.9).strokeRoundedRect(ROW_X, y, ROW_W, ROW_H - 10, 12);
    });
  }

  update(_t: number, dms: number) {
    this.petals.update(dms / 1000);
    if (!this.cal && this.sig() !== this.signature) this.build();
    this.updaters.forEach((u) => u());
    if (this.cal) this.pollCalibration();
  }

  // ---------- button setup ----------

  /** Walk through "press the button for …" for one controller (or one half of it). */
  openCalibrate(kind: 'pad' | 'hid', index: number, side?: PadSide) {
    let id = '';
    let who = '';
    if (kind === 'pad') {
      const pad = this.pads()[index];
      if (!pad) return;
      id = pad.id;
      who = `${T().padSlot(index + 1)}${side ? ` ${side === 'L' ? T().padHalfL : T().padHalfR}` : ''}`;
    } else {
      const j = hidPad(index);
      if (!j || isProPad(j)) return;
      side = j.side;
      j.takeEdges();
      who = `${T().hidRow(index)} (${j.side})`;
    }
    this.cal = {
      kind, index, id, side, step: kind === 'hid' ? 1 : 0, map: { move: null, actions: Array(ACTIONS).fill(null) }, keys: Array(ACTIONS).fill(null),
      used: new Set(), usedKeys: new Set(), ignore: new Set(), ignoreAxes: new Set(), hint: '', modal: null as unknown as Modal,
    };
    this.snapshot();
    // While setting buttons, the pad must not also drive the menu: keyCapture silences it.
    this.keyCapture = (e) => {
      if (e.keyCode === Phaser.Input.Keyboard.KeyCodes.ESC) this.cal?.modal.close();
      else if (e.keyCode === Phaser.Input.Keyboard.KeyCodes.ENTER) this.advance();
    };
    this.cal.modal = this.openModal({
      w: 780,
      h: 580,
      title: T().padCalTitle(who),
      closable: false,
      onClose: () => {
        this.keyCapture = null;
        this.cal = null;
      },
      build: (m) => this.buildCalibration(m),
    });
  }

  private buildCalibration(m: Modal) {
    const cal = this.cal;
    if (!cal) return;
    const steps = T().padCalSteps;
    steps.forEach((name, n) => {
      const y = m.y + 92 + n * 40;
      const skipped = cal.kind === 'hid' && n === 0;
      const done = n < cal.step && !skipped;
      const now = n === cal.step;
      const g = this.add.graphics();
      g.fillStyle(now ? 0x2a2412 : C.well, 1).fillRoundedRect(m.x + 40, y - 16, m.w - 80, 34, 8);
      if (now) g.lineStyle(2, C.gold, 1).strokeRoundedRect(m.x + 40, y - 16, m.w - 80, 34, 8);
      m.content.add(g);
      m.content.add(txt(this, m.x + 60, y + 1, `${done ? '✔' : now ? '▶' : '·'}  ${name}`, 17, now ? C.goldHex : done ? C.text : C.faint, { bold: now, origin: [0, 0.5] }));
      let v = '';
      if (skipped) v = T().padCalFixed;
      else if (done) {
        if (n === 0) v = cal.map.move === 'dpad' ? '＋' : cal.map.move ? `${cal.map.move.ax}/${cal.map.move.ay}` : '–';
        else if (cal.kind === 'hid') v = cal.keys[n - 1] ? joyLabel(cal.side!, cal.keys[n - 1]!) : '–';
        else v = cal.map.actions[n - 1] === null ? '–' : `#${cal.map.actions[n - 1]}`;
      }
      if (v) m.content.add(txt(this, m.x + m.w - 60, y + 1, v, 16, C.dim, { origin: [1, 0.5] }));
    });
    m.content.add(txt(this, WIDTH / 2, m.y + 92 + steps.length * 40 + 14, T().padCalPress(steps[cal.step]), 20, C.goldHex, { bold: true, origin: 0.5 }));
    if (cal.hint) m.content.add(txt(this, WIDTH / 2, m.y + 92 + steps.length * 40 + 42, cal.hint, 14, '#ff8a8a', { origin: 0.5 }));
    m.content.add(txt(this, WIDTH / 2, m.y + m.h - 78, T().padCalSkip, 13, C.faint, { origin: 0.5 }));
    addButton(this, m.content, m.nav, { id: 'cancel', x: WIDTH / 2, y: m.y + m.h - 40, w: 180, h: 40, label: T().back, size: 17, onPress: () => m.close() });
  }

  /** Remember what is already held, so it only counts for the next step once let go. */
  private snapshot() {
    const cal = this.cal;
    if (!cal || cal.kind !== 'pad') return;
    const pad = this.pads()[cal.index];
    cal.ignore = new Set(pad ? pad.buttons.map((b, n) => (b.pressed || b.value > 0.5 ? n : -1)).filter((n) => n >= 0) : []);
    cal.ignoreAxes = new Set(pad ? pad.axes.map((a, n) => (n !== 9 && Math.abs(a) > 0.7 ? n : -1)).filter((n) => n >= 0) : []);
  }

  /** Done with the current step (a press, or Enter to keep the default): next one, or finish. */
  private advance() {
    const cal = this.cal;
    if (!cal) return;
    cal.step++;
    cal.hint = '';
    this.snapshot();
    if (cal.step > ACTIONS) {
      if (cal.kind === 'hid') setHidMap(cal.side!, cal.keys as HidMap);
      else setPadMap(cal.id, cal.side, cal.map);
      cal.modal.close();
      toast(this, T().padCalSaved, '#9fe89a');
      this.build();
      return;
    }
    cal.modal.rebuild();
  }

  private pollCalibration() {
    const cal = this.cal;
    if (!cal) return;
    if (cal.kind === 'hid') return this.pollHidCalibration(cal);
    const pad = this.pads()[cal.index];
    if (!pad) return;
    const held = pad.buttons.map((b, n) => (b.pressed || b.value > 0.5 ? n : -1)).filter((n) => n >= 0);
    const pushed = pad.axes.map((a, n) => (n !== 9 && Math.abs(a) > 0.7 ? n : -1)).filter((n) => n >= 0);
    // Things that were down when the step began only count once let go and pressed again.
    for (const n of [...cal.ignore]) if (!held.includes(n)) cal.ignore.delete(n);
    for (const n of [...cal.ignoreAxes]) if (!pushed.includes(n)) cal.ignoreAxes.delete(n);
    if (cal.step === 0) {
      // Movement: the d-pad buttons, or whichever stick was pushed (its pair of axes).
      const dpad = held.find((n) => n >= 12 && n <= 15 && !cal.ignore.has(n));
      const axis = pushed.find((n) => !cal.ignoreAxes.has(n));
      if (dpad !== undefined) cal.map.move = 'dpad';
      else if (axis !== undefined) cal.map.move = { ax: axis - (axis % 2), ay: axis - (axis % 2) + 1 };
      else return;
      this.advance();
      return;
    }
    const btn = held.find((n) => !cal.ignore.has(n));
    if (btn === undefined) return;
    if (cal.used.has(btn)) {
      cal.hint = T().padCalUsed;
      cal.ignore.add(btn);
      cal.modal.rebuild();
      return;
    }
    cal.used.add(btn);
    cal.map.actions[cal.step - 1] = btn;
    this.advance();
  }

  /** A directly connected Joy-Con: every new press arrives as an event, so even a very quick tap is caught. */
  private pollHidCalibration(cal: CalState) {
    const j = hidPad(cal.index);
    if (!j || isProPad(j)) return;
    const allowed = configurable(j.side);
    const key = j.takeEdges().find((k) => allowed.includes(k));
    if (!key) return;
    if (cal.usedKeys.has(key)) {
      cal.hint = T().padCalUsed;
      cal.modal.rebuild();
      return;
    }
    cal.usedKeys.add(key);
    cal.keys[cal.step - 1] = key;
    this.advance();
  }
}
