import * as Phaser from 'phaser';
import { HEIGHT, RES, WIDTH } from './config';
import { addArenaTexture, type AmbientKind } from './maps';
import { sfx } from './sfx';
import { playMusic, type Track } from './music';
import { connectedPads, readPad } from './gamepads';
import type { Skill, SkillEffect } from './skills';

// ---------- theme ----------

export const FONT = '"Segoe UI", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
/** Brush-style 楷體 for titles (ships with macOS and Windows), falling back to a serif. */
export const TITLE_FONT = '"Kaiti TC", "STKaiti", "BiauKai", "DFKai-SB", "KaiTi", serif';

export const C = {
  bg: 0x0d0f14,
  panel: 0x161a23,
  panelHi: 0x1e2430,
  well: 0x0f1219,
  border: 0x3a4152,
  gold: 0xd9ae4a,
  red: 0x9c2f24,
  text: '#ece6d6',
  dim: '#9aa3b8',
  faint: '#6b7386',
  goldHex: '#e2b955',
  error: '#ff8a7a',
};

export const toHex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export interface TextOpts {
  bold?: boolean;
  title?: boolean;
  origin?: [number, number] | number;
  wrap?: number;
  align?: 'left' | 'center' | 'right';
  stroke?: string;
  strokeThickness?: number;
  depth?: number;
}

export function txt(scene: Phaser.Scene, x: number, y: number, s: string, size: number, color = C.text, o: TextOpts = {}) {
  const t = scene.add.text(x, y, s, {
    fontFamily: o.title ? TITLE_FONT : FONT,
    resolution: RES,
    fontSize: `${size}px`,
    fontStyle: o.bold ? 'bold' : 'normal',
    color,
    align: o.align ?? 'left',
    stroke: o.stroke,
    strokeThickness: o.strokeThickness ?? (o.stroke ? 4 : 0),
    // Advanced wrap also breaks inside long runs, which Chinese text needs (it has no spaces).
    wordWrap: o.wrap ? { width: o.wrap, useAdvancedWrap: true } : undefined,
  });
  if (o.origin !== undefined) {
    if (typeof o.origin === 'number') t.setOrigin(o.origin);
    else t.setOrigin(o.origin[0], o.origin[1]);
  }
  if (o.depth !== undefined) t.setDepth(o.depth);
  return t;
}

export interface FrameOpts {
  fill?: number;
  fillAlpha?: number;
  border?: number;
  radius?: number;
  /** Small gold diamonds on the corners. */
  ornate?: boolean;
}

/** Lacquer-panel frame: dark fill, double border, optional corner ornaments. */
export function drawFrame(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, o: FrameOpts = {}) {
  const r = o.radius ?? 10;
  const border = o.border ?? C.border;
  g.fillStyle(o.fill ?? C.panel, o.fillAlpha ?? 1).fillRoundedRect(x, y, w, h, r);
  g.lineStyle(2, border, 1).strokeRoundedRect(x, y, w, h, r);
  g.lineStyle(1, border, 0.35).strokeRoundedRect(x + 5, y + 5, w - 10, h - 10, Math.max(2, r - 4));
  if (o.ornate) {
    g.fillStyle(C.gold, 1);
    for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
      g.fillTriangle(cx - 6, cy, cx, cy - 6, cx + 6, cy);
      g.fillTriangle(cx - 6, cy, cx, cy + 6, cx + 6, cy);
    }
  }
}

export function setupCamera(scene: Phaser.Scene) {
  scene.cameras.main.setOrigin(0, 0).setZoom(RES);
}

/** The courtyard art, dimmed, as a menu background. */
export function addBackdrop(scene: Phaser.Scene, dim = 0.62) {
  const key = addArenaTexture(scene);
  scene.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(WIDTH, HEIGHT);
  scene.add.rectangle(0, 0, WIDTH, HEIGHT, C.bg, dim).setOrigin(0, 0);
}

// ---------- petals ----------

/** Drifting ambient particles: cherry petals, bamboo leaves or snow. Call update(dt) every frame. */
export class Petals {
  private items: { obj: Phaser.GameObjects.Ellipse; vx: number; vy: number; spin: number; phase: number }[] = [];
  /** Glowing kinds (fireflies, embers) pulse in brightness. */
  private flicker = false;

  constructor(
    scene: Phaser.Scene,
    private area: { x: number; y: number; w: number; h: number },
    count = 16,
    depth = 6,
    kind: AmbientKind = 'petals',
    /** Container to put the particles in (the battlefield layer), if any. */
    layer?: Phaser.GameObjects.Container,
  ) {
    for (let i = 0; i < count; i++) {
      const x = area.x + Math.random() * area.w;
      const y = area.y + Math.random() * area.h;
      let obj: Phaser.GameObjects.Ellipse;
      if (kind === 'mist') {
        obj = scene.add.ellipse(x, y, 90 + Math.random() * 80, 40 + Math.random() * 30, 0xffffff, 0.06);
        this.items.push({ obj, vx: 6 + Math.random() * 10, vy: (Math.random() - 0.5) * 4, spin: 0, phase: Math.random() * 6 });
      } else if (kind === 'fireflies' || kind === 'dust' || kind === 'wisps') {
        const size = kind === 'dust' ? 2.5 : kind === 'wisps' ? 7 : 4;
        const color = kind === 'dust' ? 0xfff2d0 : kind === 'wisps' ? 0x8fc8ff : 0xe8ff8a;
        obj = scene.add.ellipse(x, y, size, size, color, 0.9).setBlendMode(Phaser.BlendModes.ADD);
        this.items.push({ obj, vx: (Math.random() - 0.5) * 16, vy: (Math.random() - 0.5) * 16, spin: 0, phase: Math.random() * 6 });
        this.flicker = true;
      } else if (kind === 'embers') {
        const r = 1.5 + Math.random() * 1.5;
        obj = scene.add.ellipse(x, y, r * 2, r * 2, Math.random() < 0.5 ? 0xffb03a : 0xff6a2a, 0.9).setBlendMode(Phaser.BlendModes.ADD);
        this.items.push({ obj, vx: (Math.random() - 0.5) * 14, vy: -(18 + Math.random() * 30), spin: 0, phase: Math.random() * 6 });
        this.flicker = true;
      } else if (kind === 'rain') {
        obj = scene.add.ellipse(x, y, 1.5, 14, 0xb8c8e8, 0.45).setRotation(0.25);
        this.items.push({ obj, vx: -80, vy: 420 + Math.random() * 120, spin: 0, phase: Math.random() * 6 });
      } else if (kind === 'spores') {
        const r = 2 + Math.random() * 2.5;
        obj = scene.add.ellipse(x, y, r * 2, r * 2, Math.random() < 0.6 ? 0x9aff6a : 0xd0ff8a, 0.8).setBlendMode(Phaser.BlendModes.ADD);
        this.items.push({ obj, vx: (Math.random() - 0.5) * 10, vy: -(8 + Math.random() * 14), spin: 0, phase: Math.random() * 6 });
        this.flicker = true;
      } else if (kind === 'snow') {
        const r = 1.5 + Math.random() * 2;
        obj = scene.add.ellipse(x, y, r * 2, r * 2, 0xffffff, 0.9);
        this.items.push({ obj, vx: -6 + Math.random() * 12, vy: 22 + Math.random() * 26, spin: 0, phase: Math.random() * 6 });
      } else {
        const leaf = kind === 'leaves' || kind === 'maple';
        const leafColor = kind === 'maple' ? (Math.random() < 0.6 ? 0xd9402a : 0xe8902a) : Math.random() < 0.7 ? 0x8fbf5a : 0xc9b04a;
        obj = scene.add.ellipse(x, y, leaf ? 9 : 6, leaf ? 3.5 : 3.5, leaf ? leafColor : 0xffc4d4, 0.85);
        this.items.push({ obj, vx: 18 + Math.random() * 22, vy: 10 + Math.random() * 14, spin: (Math.random() - 0.5) * 4, phase: Math.random() * 6 });
      }
      obj.setDepth(depth);
      layer?.add(obj);
    }
  }

  update(dt: number) {
    const a = this.area;
    for (const p of this.items) {
      p.phase += dt;
      const o = p.obj;
      o.x += (p.vx + Math.sin(p.phase * 1.7) * (this.flicker ? 6 : 20)) * dt;
      o.y += p.vy * dt;
      o.rotation += p.spin * dt;
      if (this.flicker) o.setAlpha(0.35 + 0.6 * Math.abs(Math.sin(p.phase * 2.3)));
      // Wrap around on every side.
      if (o.x > a.x + a.w) o.x = a.x;
      if (o.x < a.x) o.x = a.x + a.w;
      if (o.y > a.y + a.h) o.y = a.y;
      if (o.y < a.y) o.y = a.y + a.h;
    }
  }
}

// ---------- skill icons ----------

const KIND_COLORS: Record<SkillEffect['kind'], number> = {
  channelHeal: 0x3f9b5a,
  instantHeal: 0x3f9b5a,
  projectile: 0xc8572a,
  speedBuff: 0x2f8fa8,
  dash: 0x2f8fa8,
  powerUp: 0xb8322a,
  revive: 0xc2417f,
  guard: 0xa8842c,
  stealth: 0x5a5a8a,
  substitute: 0x8a6a3a,
  caltrops: 0x6f7a88,
  teleport: 0x4a7ab8,
  teamHeal: 0x2f8a6a,
  teamPe: 0x3f7fd9,
  teamFury: 0xc0532a,
  soulThunder: 0x7a5ad9,
  soulReaper: 0x4a2a5a,
  soulFire: 0xd98a2a,
  soulTree: 0x3f9b4a,
  sacrifice: 0x9a1a2a,
};

export const skillColor = (s: Skill) => KIND_COLORS[s.effect.kind];

/** Round badge with the skill's first character; a dashed empty ring for an empty slot. */
export function drawSkillIcon(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, x: number, y: number, r: number, skill: Skill | null) {
  const g = scene.add.graphics();
  if (!skill) {
    g.lineStyle(2, C.border, 1);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      g.beginPath();
      g.arc(x, y, r - 1, a, a + Math.PI / 14);
      g.strokePath();
    }
    layer.add(g);
    return;
  }
  g.fillStyle(skillColor(skill), 1).fillCircle(x, y, r);
  g.fillStyle(0xffffff, 0.12).fillCircle(x - r * 0.25, y - r * 0.3, r * 0.55);
  g.lineStyle(2, C.gold, 1).strokeCircle(x, y, r);
  layer.add(g);
  layer.add(txt(scene, x, y + 1, skill.zh[0], Math.round(r * 1.05), '#ffffff', { title: true, bold: true, origin: 0.5 }));
}

// ---------- focus navigation ----------

export interface Focusable {
  id: string;
  /** Top-left and size, in game coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  onEnter?: () => void;
  /** If set, ←/→ change this item's value instead of moving focus. */
  onAdjust?: (d: number) => void;
  radius?: number;
}

/**
 * Keyboard + mouse focus for one screen or modal. Arrow keys move to the
 * nearest item in that direction; Enter/Space activate; Esc calls onBack.
 */
export class FocusNav {
  private items = new Map<string, Focusable>();
  private zones: Phaser.GameObjects.Zone[] = [];
  private zoneById = new Map<string, Phaser.GameObjects.Zone>();
  /** Items whose mouse zone is currently clipped away (e.g. scrolled out of view). */
  private hidden = new Set<string>();
  private hl: Phaser.GameObjects.Graphics;
  current: string | null = null;
  onBack?: () => void;
  onFocus?: (id: string) => void;
  enabled = true;

  constructor(private scene: Phaser.Scene, private depth = 50) {
    this.hl = scene.add.graphics().setDepth(depth + 1);
  }

  /** Forget all items (call before rebuilding a screen). Keeps the focused id if it comes back. */
  reset() {
    this.items.clear();
    this.zones.forEach((z) => z.destroy());
    this.zones = [];
    this.zoneById.clear();
    this.hidden.clear();
  }

  add(item: Focusable) {
    this.items.set(item.id, item);
    const z = this.scene.add.zone(item.x + item.w / 2, item.y + item.h / 2, item.w, item.h).setDepth(this.depth + 2);
    z.setInteractive({ useHandCursor: true });
    z.on('pointerover', () => {
      if (this.enabled && this.current !== item.id) this.focus(item.id, false);
    });
    z.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.enabled) return;
      this.focus(item.id, false);
      if (item.onAdjust) {
        sfx.menuChange();
        item.onAdjust(p.worldX < item.x + item.w / 2 ? -1 : 1);
      } else if (item.onEnter) {
        sfx.menuConfirm();
        item.onEnter();
      }
    });
    this.zones.push(z);
    this.zoneById.set(item.id, z);
  }

  /**
   * Moves an item (for scrolling lists). The mouse zone is clipped to `clip`'s
   * vertical band so hidden parts can't be hovered or clicked.
   */
  setRect(id: string, r: { x: number; y: number; w: number; h: number }, clip?: { top: number; bottom: number }) {
    const it = this.items.get(id);
    const z = this.zoneById.get(id);
    if (!it || !z) return;
    Object.assign(it, r);
    const top = Math.max(r.y, clip?.top ?? -Infinity);
    const bottom = Math.min(r.y + r.h, clip?.bottom ?? Infinity);
    if (bottom - top < 4) this.hidden.add(id);
    else {
      this.hidden.delete(id);
      z.setPosition(r.x + r.w / 2, (top + bottom) / 2).setSize(r.w, bottom - top, true);
    }
    z.input!.enabled = this.enabled && !this.hidden.has(id);
    if (id === this.current) this.draw();
  }

  /** Call after adding items: restores or picks a focus and draws the highlight. */
  done(preferred?: string) {
    if (!this.current || !this.items.has(this.current)) {
      this.current = preferred && this.items.has(preferred) ? preferred : this.items.keys().next().value ?? null;
    }
    this.draw();
    if (this.current) this.onFocus?.(this.current);
  }

  focus(id: string, sound = true) {
    if (!this.items.has(id)) return;
    if (sound && id !== this.current) sfx.menuMove();
    this.current = id;
    this.draw();
    this.onFocus?.(id);
  }

  draw() {
    this.hl.clear();
    const it = this.current ? this.items.get(this.current) : undefined;
    if (!it || !this.enabled) return;
    const r = it.radius ?? 8;
    this.hl.fillStyle(C.gold, 0.1).fillRoundedRect(it.x - 3, it.y - 3, it.w + 6, it.h + 6, r + 2);
    this.hl.lineStyle(2, C.gold, 1).strokeRoundedRect(it.x - 3, it.y - 3, it.w + 6, it.h + 6, r + 2);
    // Little marker on the left edge.
    this.hl.fillStyle(C.gold, 1).fillTriangle(it.x - 12, it.y + it.h / 2 - 6, it.x - 12, it.y + it.h / 2 + 6, it.x - 5, it.y + it.h / 2);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.zoneById.forEach((z, id) => (z.input!.enabled = on && !this.hidden.has(id)));
    this.draw();
  }

  destroy() {
    this.reset();
    this.hl.destroy();
  }

  /** Returns true if the key was handled. */
  key(e: KeyboardEvent): boolean {
    const K = Phaser.Input.Keyboard.KeyCodes;
    const it = this.current ? this.items.get(this.current) : undefined;
    switch (e.keyCode) {
      case K.LEFT:
      case K.RIGHT: {
        const d = e.keyCode === K.LEFT ? -1 : 1;
        if (it?.onAdjust) {
          sfx.menuChange();
          it.onAdjust(d);
        } else this.move(d, 0);
        return true;
      }
      case K.UP:
        this.move(0, -1);
        return true;
      case K.DOWN:
        this.move(0, 1);
        return true;
      case K.ENTER:
      case K.SPACE:
        if (it?.onEnter) {
          sfx.menuConfirm();
          it.onEnter();
        }
        return true;
      case K.ESC:
        if (this.onBack) {
          sfx.menuBack();
          this.onBack();
          return true;
        }
        return false;
    }
    return false;
  }

  /** Spatial navigation: nearest item whose centre lies in direction (dx, dy). */
  private move(dx: number, dy: number) {
    const cur = this.current ? this.items.get(this.current) : undefined;
    if (!cur) return;
    const cx = cur.x + cur.w / 2;
    const cy = cur.y + cur.h / 2;
    let best: Focusable | null = null;
    let bestScore = Infinity;
    for (const it of this.items.values()) {
      if (it === cur) continue;
      const ox = it.x + it.w / 2 - cx;
      const oy = it.y + it.h / 2 - cy;
      const along = ox * dx + oy * dy;
      if (along <= 4) continue;
      const across = Math.abs(ox * dy - oy * dx);
      const score = along + across * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    if (best) this.focus(best.id);
  }
}

// ---------- buttons, toast, modal ----------

export interface ButtonOpts {
  id: string;
  /** Centre. */
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  primary?: boolean;
  size?: number;
  onPress: () => void;
}

export function addButton(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, nav: FocusNav, o: ButtonOpts) {
  const g = scene.add.graphics();
  const x = o.x - o.w / 2;
  const y = o.y - o.h / 2;
  if (o.primary) {
    g.fillStyle(0x8f2a20, 1).fillRoundedRect(x, y, o.w, o.h, 8);
    g.fillStyle(0xffffff, 0.08).fillRoundedRect(x + 3, y + 3, o.w - 6, o.h / 2 - 3, 6);
    g.lineStyle(2, C.gold, 1).strokeRoundedRect(x, y, o.w, o.h, 8);
  } else {
    drawFrame(g, x, y, o.w, o.h, { fill: C.panelHi, radius: 8 });
  }
  layer.add(g);
  layer.add(txt(scene, o.x, o.y, o.label, o.size ?? 20, o.primary ? '#fff3d6' : C.text, { bold: true, origin: 0.5, title: o.primary }));
  nav.add({ id: o.id, x, y, w: o.w, h: o.h, onEnter: () => o.onPress() });
}

export function toast(scene: Phaser.Scene, msg: string, color = C.error) {
  const t = txt(scene, WIDTH / 2, HEIGHT - 70, msg, 16, color, { bold: true, origin: 0.5, depth: 501 });
  const bg = scene.add.graphics().setDepth(500);
  bg.fillStyle(0x000000, 0.85).fillRoundedRect(t.x - t.width / 2 - 18, t.y - 18, t.width + 36, 36, 18);
  bg.lineStyle(1, C.gold, 0.6).strokeRoundedRect(t.x - t.width / 2 - 18, t.y - 18, t.width + 36, 36, 18);
  scene.tweens.add({ targets: [t, bg], alpha: 0, delay: 1800, duration: 500, onComplete: () => { t.destroy(); bg.destroy(); } });
}

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
  private padPrev = new Map<number, { dir: string; confirm: boolean; back: boolean; start: boolean; repeatAt: number }>();

  /**
   * Turn gamepad input into the same key presses the keyboard sends: stick / d-pad =
   * arrows, bottom face button = Enter, right face button = Esc, +/− = Esc (pause).
   * During a fight (no menu open) only +/− does anything here.
   */
  private pollPads() {
    if (this.keyCapture) return;
    const inMenu = this.navs.length > 0;
    const K = Phaser.Input.Keyboard.KeyCodes;
    const now = performance.now();
    for (const pad of connectedPads()) {
      const st = readPad(pad);
      const dir = Math.abs(st.mx) > 0.6 || Math.abs(st.my) > 0.6
        ? Math.abs(st.mx) > Math.abs(st.my) ? (st.mx > 0 ? 'R' : 'L') : st.my > 0 ? 'D' : 'U'
        : '';
      const prev = this.padPrev.get(pad.index) ?? { dir: '', confirm: false, back: false, start: false, repeatAt: 0 };
      const press = (keyCode: number) => this.routeKey({ keyCode, preventDefault() {} } as KeyboardEvent);
      if (inMenu) {
        // A new direction moves at once; holding it repeats after a short pause.
        if (dir && (dir !== prev.dir || now >= prev.repeatAt)) {
          press({ L: K.LEFT, R: K.RIGHT, U: K.UP, D: K.DOWN }[dir]!);
          prev.repeatAt = now + (dir !== prev.dir ? 380 : 120);
        }
        if (st.confirm && !prev.confirm) press(K.ENTER);
        if (st.back && !prev.back) press(K.ESC);
      }
      if (st.start && !prev.start) press(K.ESC);
      this.padPrev.set(pad.index, { dir, confirm: st.confirm, back: st.back, start: st.start, repeatAt: prev.repeatAt });
    }
  }

  private routeKey(e: KeyboardEvent) {
    if (performance.now() < this.keysReadyAt) return;
    if (this.keyCapture) {
      e.preventDefault();
      this.keyCapture(e);
      return;
    }
    const nav = this.navs[this.navs.length - 1];
    if (nav && nav.key(e)) {
      e.preventDefault();
      return;
    }
    this.onUnhandledKey(e);
  }

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

export interface SelectorOpts {
  id: string;
  /** Top-left of the row and its width. */
  x: number;
  y: number;
  w: number;
  h?: number;
  label: string;
  value: string;
  valueColor?: string;
  /** Width reserved for the label on the left. */
  labelW?: number;
  onAdjust: (d: number) => void;
}

/** "Label   ◀ value ▶" row. ←/→ (or clicking either half) changes the value. */
export function addSelector(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, nav: FocusNav, o: SelectorOpts) {
  const h = o.h ?? 34;
  const labelW = o.labelW ?? 70;
  const bx = o.x + labelW;
  const bw = o.w - labelW;
  layer.add(txt(scene, o.x, o.y + h / 2, o.label, 14, C.dim, { origin: [0, 0.5] }));
  const g = scene.add.graphics();
  g.fillStyle(C.well, 1).fillRoundedRect(bx, o.y, bw, h, 6);
  g.lineStyle(1, C.border, 1).strokeRoundedRect(bx, o.y, bw, h, 6);
  layer.add(g);
  layer.add(txt(scene, bx + 14, o.y + h / 2, '◀', 14, C.goldHex, { origin: 0.5 }));
  layer.add(txt(scene, bx + bw - 14, o.y + h / 2, '▶', 14, C.goldHex, { origin: 0.5 }));
  layer.add(txt(scene, bx + bw / 2, o.y + h / 2, o.value, 16, o.valueColor ?? C.text, { bold: true, origin: 0.5 }));
  nav.add({ id: o.id, x: bx, y: o.y, w: bw, h, onAdjust: o.onAdjust, radius: 6 });
}
