import * as Phaser from 'phaser';
import { HEIGHT, WIDTH } from '../config';
import { T, getLang } from '../i18n';
import { padKind, padName, type PadSide } from '../gamepads';
import { MAX_PAD_SLOTS } from '../controls';
import { PAD_GRIPS, PAD_MODES, getPadGrip, getPadMode, isSplit, readController, resetPadMaps, setPadGrip, setPadMap, setPadMode, type PadMap } from '../padconfig';
import { C, FocusNav, Petals, UIScene, addBackdrop, addButton, addSelector, drawFrame, toast, txt, type Modal } from '../ui';

/** Rows shown at once; more controllers than that go on further pages. */
const ROWS = 4;
const ROW_Y = 110;
const ROW_H = 118;
const ROW_X = 40;
const ROW_W = WIDTH - 80;
const ACTIONS = 6;

/** Short names of the six actions, for the live test line. */
const actShort = () => (getLang() === 'zh' ? ['攻', '技1', '技2', '技3', '用', '換'] : ['Atk', 'S1', 'S2', 'S3', 'Use', 'Nxt']);

/** A Joy-Con half, or the whole pad. */
interface Target {
  side?: PadSide;
  label: string;
}

interface CalState {
  index: number;
  id: string;
  side?: PadSide;
  step: number;
  map: PadMap;
  used: Set<number>;
  /** True once everything has been released, so the previous press isn't read again. */
  armed: boolean;
  hint: string;
  modal: Modal;
}

/**
 * Controller Setup: shows every controller the browser can see with live input, lets you
 * pick how each is used (one player, or a joined Joy-Con pair split into two players),
 * and set its buttons yourself by pressing them.
 */
export class PadScene extends UIScene {
  private petals!: Petals;
  private nav!: FocusNav;
  private layer!: Phaser.GameObjects.Container;
  private from = 'Title';
  private signature = '';
  private page = 0;
  private foundText!: Phaser.GameObjects.Text;
  private live: { index: number; row: number; raw: Phaser.GameObjects.Text; tests: { side?: PadSide; text: Phaser.GameObjects.Text; label: string }[]; glow: Phaser.GameObjects.Graphics }[] = [];
  private cal: CalState | null = null;

  constructor() {
    super('Pads');
  }

  create(data: { from?: string }) {
    this.setupUI();
    this.from = data?.from ?? 'Title';
    addBackdrop(this, 0.75);
    this.petals = new Petals(this, { x: 0, y: 0, w: WIDTH, h: HEIGHT }, 10);
    txt(this, WIDTH / 2, 40, T().padSetup, 38, C.goldHex, { title: true, bold: true, origin: 0.5, stroke: '#2a0a06', strokeThickness: 6 });
    txt(this, WIDTH / 2, 76, T().padSetupHint, 13, C.dim, { origin: 0.5, wrap: 1100, align: 'center' });
    this.foundText = txt(this, WIDTH / 2, 98, '', 13, C.goldHex, { origin: 0.5, bold: true });

    this.layer = this.add.container(0, 0);
    this.nav = new FocusNav(this);
    this.pushNav(this.nav);
    this.nav.onBack = () => this.leave();
    this.cal = null;
    this.build();
  }

  private leave() {
    this.scene.start(this.from);
  }

  private pads(): (Gamepad | null)[] {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    return Array.from({ length: MAX_PAD_SLOTS }, (_, i) => {
      const p = list[i];
      return p && p.connected ? p : null;
    });
  }

  private sig() {
    return this.pads().map((p) => (p ? `${p.id}|${getPadMode(p.id)}` : '-')).join('#');
  }

  private targets(pad: Gamepad): Target[] {
    return isSplit(pad)
      ? [{ side: 'L', label: T().padHalfL }, { side: 'R', label: T().padHalfR }]
      : [{ label: T().padWhole }];
  }

  private build() {
    this.layer.removeAll(true);
    this.nav.reset();
    this.live = [];
    this.signature = this.sig();

    // Every controller the browser reports (in whichever of its slots), topped up with empty slots from the start.
    const all = this.pads();
    const connected = all.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
    const shown = [...connected];
    for (let i = 0; shown.length < ROWS && i < all.length; i++) if (!shown.includes(i)) shown.push(i);
    shown.sort((a, b) => a - b);
    const pages = Math.max(1, Math.ceil(connected.length / ROWS));
    this.page = Math.min(this.page, pages - 1);
    const visible = connected.length > ROWS ? shown.slice(this.page * ROWS, this.page * ROWS + ROWS) : shown.slice(0, ROWS);
    this.foundText.setText(T().padFound(connected.length));

    visible.forEach((i, row) => {
      const pad = all[i];
      const y = ROW_Y + row * ROW_H;
      const g = this.add.graphics();
      drawFrame(g, ROW_X, y, ROW_W, ROW_H - 10, { fill: C.panel, fillAlpha: 0.95, border: pad ? C.gold : C.border, radius: 12 });
      this.layer.add(g);
      const glow = this.add.graphics();
      this.layer.add(glow);
      this.layer.add(txt(this, ROW_X + 20, y + 16, T().padSlot(i + 1), 24, pad ? C.goldHex : C.faint, { title: true, bold: true }));

      if (!pad) {
        this.layer.add(txt(this, ROW_X + 20, y + 52, T().padNotFound, 15, C.faint));
        return;
      }
      const kind = padKind(pad.id);
      this.layer.add(txt(this, ROW_X + 20, y + 50, padName(kind) + (isSplit(pad) ? '  ✂' : ''), 15, C.text, { bold: true }));
      this.layer.add(txt(this, ROW_X + 20, y + 72, pad.id, 10, C.faint, { wrap: 300 }));

      // Live readout: raw numbers (to see what the browser reports), then what each half / the pad is doing.
      const raw = txt(this, ROW_X + 340, y + 14, '', 12, C.dim);
      this.layer.add(raw);
      const tests = this.targets(pad).map((t, n) => {
        const text = txt(this, ROW_X + 340, y + 40 + n * 24, '', 14, C.text, { bold: true });
        this.layer.add(text);
        return { side: t.side, text, label: t.label };
      });
      this.live.push({ index: i, row, raw, tests, glow });

      // Mode and button setup.
      const mode = getPadMode(pad.id);
      addSelector(this, this.layer, this.nav, {
        id: `p${i}-mode`, x: ROW_X + 790, y: y + 6, w: 390, h: 30, labelW: 56, label: T().padMode, value: T().padModeNames[mode],
        onAdjust: (d) => {
          const n = PAD_MODES.length;
          setPadMode(pad.id, PAD_MODES[(PAD_MODES.indexOf(mode) + d + n) % n]);
          this.build();
        },
      });
      const split = isSplit(pad);
      if (split) {
        const grip = getPadGrip(pad.id);
        addSelector(this, this.layer, this.nav, {
          id: `p${i}-grip`, x: ROW_X + 790, y: y + 40, w: 390, h: 30, labelW: 56, label: T().padGrip, value: T().padGripNames[grip],
          onAdjust: () => {
            setPadGrip(pad.id, PAD_GRIPS[(PAD_GRIPS.indexOf(grip) + 1) % PAD_GRIPS.length]);
            this.build();
          },
        });
      }
      const buttons: { id: string; label: string; w: number; onPress: () => void }[] = split
        ? [
            { id: 'cl', label: T().padCalLeft, w: 120, onPress: () => this.openCalibrate(i, 'L') },
            { id: 'cr', label: T().padCalRight, w: 120, onPress: () => this.openCalibrate(i, 'R') },
          ]
        : [{ id: 'c', label: T().padCalibrate, w: 150, onPress: () => this.openCalibrate(i) }];
      buttons.push({
        id: 'rs', label: T().padReset, w: 90,
        onPress: () => {
          resetPadMaps(pad.id);
          this.build();
        },
      });
      let bx = ROW_X + 790 + 56;
      buttons.forEach((b) => {
        addButton(this, this.layer, this.nav, { id: `p${i}-${b.id}`, x: bx + b.w / 2, y: y + 88, w: b.w, h: 30, label: b.label, size: 15, onPress: b.onPress });
        bx += b.w + 10;
      });
    });

    if (pages > 1) {
      addButton(this, this.layer, this.nav, { id: 'prev', x: WIDTH / 2 - 100, y: HEIGHT - 40, w: 80, h: 40, label: '◀', onPress: () => { this.page = (this.page + pages - 1) % pages; this.build(); } });
      this.layer.add(txt(this, WIDTH / 2, HEIGHT - 40, `${this.page + 1} / ${pages}`, 16, C.dim, { origin: 0.5 }));
      addButton(this, this.layer, this.nav, { id: 'next', x: WIDTH / 2 + 100, y: HEIGHT - 40, w: 80, h: 40, label: '▶', onPress: () => { this.page = (this.page + 1) % pages; this.build(); } });
    }
    addButton(this, this.layer, this.nav, { id: 'back', x: 110, y: HEIGHT - 40, w: 150, h: 46, label: T().back, onPress: () => this.leave() });
    this.nav.done(this.nav.current ?? undefined);
  }

  update(_t: number, dms: number) {
    this.petals.update(dms / 1000);
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    if (!this.cal && this.sig() !== this.signature) this.build();
    for (const row of this.live) {
      const pad = list[row.index];
      if (!pad || !pad.connected) continue;
      const down = pad.buttons.map((b, n) => (b.pressed || b.value > 0.5 ? n : -1)).filter((n) => n >= 0);
      const axes = pad.axes.map((a) => a.toFixed(2)).join(' / ');
      row.raw.setText(T().padRaw(down.length ? down.join(', ') : '–', axes));
      const short = actShort();
      const any = down.length > 0 || pad.axes.some((a, n) => Math.abs(a) > 0.5 && n !== 9);
      row.tests.forEach((t) => {
        const st = readController(pad, t.side);
        const acts = st.actions.slice(0, ACTIONS).map((on, n) => `${short[n]}${on ? '●' : '○'}`).join(' ');
        t.text.setText(T().padTest(t.label, acts, `${st.mx.toFixed(1)}, ${st.my.toFixed(1)}`));
        t.text.setColor(st.actions.some(Boolean) || st.mx !== 0 || st.my !== 0 ? '#ffd27a' : C.text);
      });
      const y = ROW_Y + row.row * ROW_H;
      row.glow.clear();
      if (any) row.glow.lineStyle(3, C.gold, 0.9).strokeRoundedRect(ROW_X, y, ROW_W, ROW_H - 10, 12);
    }
    if (this.cal) this.pollCalibration(list[this.cal.index] ?? null);
  }

  // ---------- button setup ----------

  /** Walk through "press the button for …" for one controller (or one half of it). */
  openCalibrate(index: number, side?: PadSide) {
    const pad = this.pads()[index];
    if (!pad) return;
    const who = `${T().padSlot(index + 1)}${side ? ` ${side === 'L' ? T().padHalfL : T().padHalfR}` : ''}`;
    this.cal = {
      index, id: pad.id, side, step: 0, map: { move: null, actions: Array(ACTIONS).fill(null) }, used: new Set(), armed: false, hint: '', modal: null as unknown as Modal,
    };
    // While setting buttons, the pad must not also drive the menu: keyCapture silences it.
    this.keyCapture = (e) => {
      if (e.keyCode === Phaser.Input.Keyboard.KeyCodes.ESC) this.cal?.modal.close();
      else if (e.keyCode === Phaser.Input.Keyboard.KeyCodes.ENTER) this.advance();
    };
    this.cal.modal = this.openModal({
      w: 780,
      h: 540,
      title: T().padCalTitle(who),
      closable: false,
      onClose: () => {
        this.keyCapture = null;
        this.cal = null;
      },
      build: (m) => this.buildCalibration(m),
    });
  }

  private stepName(step: number) {
    return T().padCalSteps[step];
  }

  private buildCalibration(m: Modal) {
    const cal = this.cal;
    if (!cal) return;
    const steps = T().padCalSteps;
    steps.forEach((name, n) => {
      const y = m.y + 92 + n * 40;
      const done = n < cal.step;
      const now = n === cal.step;
      const g = this.add.graphics();
      g.fillStyle(now ? 0x2a2412 : C.well, 1).fillRoundedRect(m.x + 40, y - 16, m.w - 80, 34, 8);
      if (now) g.lineStyle(2, C.gold, 1).strokeRoundedRect(m.x + 40, y - 16, m.w - 80, 34, 8);
      m.content.add(g);
      m.content.add(txt(this, m.x + 60, y + 1, `${done ? '✔' : now ? '▶' : '·'}  ${name}`, 17, now ? C.goldHex : done ? C.text : C.faint, { bold: now, origin: [0, 0.5] }));
      if (done) {
        const v = n === 0 ? (cal.map.move === 'dpad' ? '＋' : cal.map.move ? `${cal.map.move.ax}/${cal.map.move.ay}` : '–') : cal.map.actions[n - 1] === null ? '–' : `#${cal.map.actions[n - 1]}`;
        m.content.add(txt(this, m.x + m.w - 60, y + 1, v, 16, C.dim, { origin: [1, 0.5] }));
      }
    });
    const prompt = cal.armed ? T().padCalPress(this.stepName(cal.step)) : T().padCalRelease;
    m.content.add(txt(this, WIDTH / 2, m.y + 92 + steps.length * 40 + 14, prompt, 20, C.goldHex, { bold: true, origin: 0.5 }));
    if (cal.hint) m.content.add(txt(this, WIDTH / 2, m.y + 92 + steps.length * 40 + 42, cal.hint, 14, '#ff8a8a', { origin: 0.5 }));
    m.content.add(txt(this, WIDTH / 2, m.y + m.h - 78, T().padCalSkip, 13, C.faint, { origin: 0.5 }));
    addButton(this, m.content, m.nav, { id: 'cancel', x: WIDTH / 2, y: m.y + m.h - 40, w: 180, h: 40, label: T().back, size: 17, onPress: () => m.close() });
  }

  /** Done with the current step (a press, or Enter to keep the default): next one, or finish. */
  private advance() {
    const cal = this.cal;
    if (!cal) return;
    cal.step++;
    cal.armed = false;
    cal.hint = '';
    if (cal.step >= T().padCalSteps.length) {
      setPadMap(cal.id, cal.side, cal.map);
      cal.modal.close();
      toast(this, T().padCalSaved, '#9fe89a');
      this.build();
      return;
    }
    cal.modal.rebuild();
  }

  private pollCalibration(pad: Gamepad | null) {
    const cal = this.cal;
    if (!cal || !pad) return;
    const held = pad.buttons.map((b, n) => (b.pressed || b.value > 0.5 ? n : -1)).filter((n) => n >= 0);
    const pushed = pad.axes.map((a, n) => (n !== 9 && Math.abs(a) > 0.7 ? n : -1)).filter((n) => n >= 0);
    if (!cal.armed) {
      // Wait for a clean slate before listening for the next input.
      if (held.length === 0 && pad.axes.every((a, n) => n === 9 || Math.abs(a) < 0.3)) {
        cal.armed = true;
        cal.modal.rebuild();
      }
      return;
    }
    if (cal.step === 0) {
      // Movement: the d-pad buttons, or whichever stick was pushed (its pair of axes).
      const dpad = held.find((n) => n >= 12 && n <= 15);
      if (dpad !== undefined) cal.map.move = 'dpad';
      else if (pushed.length) cal.map.move = { ax: pushed[0] - (pushed[0] % 2), ay: pushed[0] - (pushed[0] % 2) + 1 };
      else return;
      this.advance();
      return;
    }
    const btn = held.find((n) => !cal.used.has(n));
    if (btn === undefined) {
      if (held.length) {
        cal.hint = T().padCalUsed;
        cal.armed = false;
        cal.modal.rebuild();
      }
      return;
    }
    cal.used.add(btn);
    cal.map.actions[cal.step - 1] = btn;
    this.advance();
  }
}
