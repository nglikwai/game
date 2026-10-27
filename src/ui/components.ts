import * as Phaser from 'phaser';
import { HEIGHT, WIDTH } from '@/config';
import { C, txt, drawFrame } from '@/ui/theme';
import { FocusNav } from '@/ui/FocusNav';

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
    g.fillStyle(0x000000, 0.25).fillRoundedRect(x + 2, y + 4, o.w, o.h, 8);
    g.fillStyle(0x81342e, 1).fillRoundedRect(x, y, o.w, o.h, 8);
    g.fillStyle(0xffffff, 0.035).fillRoundedRect(x + 2, y + 2, o.w - 4, o.h / 2 - 2, 6);
    g.lineStyle(1, C.gold, 0.65).strokeRoundedRect(x, y, o.w, o.h, 8);
    g.fillStyle(C.gold, 0.6).fillRoundedRect(x + 7, y + 10, 2, o.h - 20, 1);
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

/** "Label   ◀ value ▶" row. Keyboard arrows / mouse halves adjust; confirm cycles forward. */
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
