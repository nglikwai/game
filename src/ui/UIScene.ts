import * as Phaser from 'phaser';
import { HEIGHT, WIDTH } from '@/config';
import { playMusic, type Track } from '@/audio/music';
import { menuPadSources, type MenuPadKey } from '@/input/menuInput';
import { C, txt, drawFrame } from '@/ui/theme';
import { setupCamera } from '@/ui/backdrop';
import { FocusNav } from '@/ui/FocusNav';

/** Base for every menu-style scene: camera, nav stack, key routing, modals. */
export class UIScene extends Phaser.Scene {
  protected navs: FocusNav[] = [];
  /** When set, the next key press goes here (used for rebinding keys). */
  protected keyCapture: ((e: KeyboardEvent) => void) | null = null;
  /** Ignore keys until this time, so the press that opened a screen doesn't also act on it. */
  private keysReadyAt = 0;

  /** Background music for this screen. */
  protected bgm: Track = 'menu';

  protected setupUI() {
    setupCamera(this);
    playMusic(this.bgm);
    this.navs = [];
    this.keyCapture = null;
    this.keysReadyAt = performance.now() + 200;
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.routeKey(e));
    // Gamepads (including Joy-Cons) drive the menus too.
    this.padPrev.clear();
    this.events.on('update', this.pollPads, this);
    this.events.once('shutdown', () => this.events.off('update', this.pollPads, this));
  }

  /** Per pad: what was held last frame, and when a held direction repeats next. */
  private padPrev = new Map<MenuPadKey, { dir: string; confirm: boolean; back: boolean; start: boolean; actions: readonly boolean[]; repeatAt: number }>();

  /**
   * Stick / d-pad moves focus; confirm activates a button or cycles a setting.
   * Back closes a menu; +/− pauses. Keep the source so sticks cannot adjust settings.
   * During a fight (no menu open) only +/− does anything here.
   */
  private pollPads() {
    if (this.keyCapture) return;
    const inMenu = this.navs.length > 0;
    const K = Phaser.Input.Keyboard.KeyCodes;
    const now = performance.now();
    const sources = menuPadSources();
    const activeKeys = new Set(sources.map((p) => p.key));
    for (const key of this.padPrev.keys()) if (!activeKeys.has(key)) this.padPrev.delete(key);
    let confirm = false, back = false, start = false;
    const press = (keyCode: number) => this.routeKey({ keyCode, preventDefault() {} } as KeyboardEvent, 'gamepad');
    for (const { key, control, st } of sources) {
      const dir = Math.abs(st.mx) > 0.6 || Math.abs(st.my) > 0.6
        ? Math.abs(st.mx) > Math.abs(st.my) ? (st.mx > 0 ? 'R' : 'L') : st.my > 0 ? 'D' : 'U'
        : '';
      const prev = this.padPrev.get(key) ?? { dir: '', confirm: false, back: false, start: false, actions: [], repeatAt: 0 };
      const actionEdges = st.actions.map((on, i) => on && !prev.actions[i]);
      const consumed = inMenu && this.onMenuPadAction(control, actionEdges);
      if (inMenu && !consumed) {
        // A new direction moves at once; holding it repeats after a short pause.
        if (dir && (dir !== prev.dir || now >= prev.repeatAt)) {
          press({ L: K.LEFT, R: K.RIGHT, U: K.UP, D: K.DOWN }[dir]!);
          prev.repeatAt = now + (dir !== prev.dir ? 380 : 120);
        }
        confirm ||= st.confirm && !prev.confirm;
        back ||= st.back && !prev.back;
      }
      start ||= !consumed && st.start && !prev.start;
      this.padPrev.set(key, { dir, confirm: st.confirm, back: st.back, start: st.start, actions: [...st.actions], repeatAt: prev.repeatAt });
    }
    // One button action per frame: confirming a dialog must not also dismiss its parent.
    if (confirm) press(K.ENTER);
    else if (back || start) press(K.ESC);
  }

  private routeKey(e: KeyboardEvent, source: 'keyboard' | 'gamepad' = 'keyboard') {
    if (performance.now() < this.keysReadyAt) return;
    if (this.keyCapture) {
      e.preventDefault();
      this.keyCapture(e);
      return;
    }
    if (source === 'keyboard' && this.onMenuKey(e)) { e.preventDefault(); return; }
    const nav = this.navs[this.navs.length - 1];
    if (nav && nav.key(e, source)) {
      e.preventDefault();
      return;
    }
    this.onUnhandledKey(e);
  }

  /** Screens may consume gameplay skill buttons before confirm/back navigation. */
  protected onMenuPadAction(_control: string, _edges: readonly boolean[]): boolean { return false; }
  protected onMenuKey(_event: KeyboardEvent): boolean { return false; }

  /** Keys no nav used (e.g. Esc in battle opens the pause menu). */
  protected onUnhandledKey(_e: KeyboardEvent) {}

  /** Make `nav` the active one; the previous top nav is disabled until this one is popped. */
  protected pushNav(nav: FocusNav) {
    this.navs[this.navs.length - 1]?.setEnabled(false);
    this.navs.push(nav);
    nav.setEnabled(true);
  }

  protected popNav() {
    this.navs.pop()?.destroy();
    this.navs[this.navs.length - 1]?.setEnabled(true);
  }

  /**
   * A centred modal window. `build` fills it (and is re-run by modal.rebuild());
   * Esc or modal.close() dismisses it.
   */
  openModal(o: { w: number; h: number; title: string; titleColor?: string; depth?: number; build: (m: Modal) => void; onClose?: () => void; closable?: boolean }) {
    const depth = o.depth ?? 200 + this.navs.length * 20;
    const root = this.add.container(0, 0).setDepth(depth);
    // Full-screen dimmer that also swallows clicks meant for whatever is underneath.
    const dim = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, 0.62).setOrigin(0, 0).setInteractive();
    root.add(dim);
    const x = (WIDTH - o.w) / 2;
    const y = (HEIGHT - o.h) / 2;
    const g = this.add.graphics();
    drawFrame(g, x, y, o.w, o.h, { fill: 0x141821, border: C.gold, radius: 14, ornate: true });
    root.add(g);
    root.add(txt(this, WIDTH / 2, y + 34, o.title, 32, o.titleColor ?? C.goldHex, { title: true, bold: true, origin: 0.5 }));
    const content = this.add.container(0, 0);
    root.add(content);
    const nav = new FocusNav(this, depth + 5);
    const modal: Modal = {
      x, y, w: o.w, h: o.h, content, nav,
      rebuild: () => {
        content.removeAll(true);
        nav.reset();
        o.build(modal);
        nav.done();
      },
      close: () => {
        root.destroy();
        this.popNav();
        o.onClose?.();
      },
    };
    if (o.closable !== false) nav.onBack = () => modal.close();
    this.pushNav(nav);
    modal.rebuild();
    return modal;
  }
}

export interface Modal {
  x: number;
  y: number;
  w: number;
  h: number;
  content: Phaser.GameObjects.Container;
  nav: FocusNav;
  rebuild(): void;
  close(): void;
}
