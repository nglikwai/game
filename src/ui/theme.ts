import * as Phaser from 'phaser';
import { RES } from '@/config';

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

/** Ink-blue panel with a soft shadow and short brass corner fittings. */
export function drawFrame(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, o: FrameOpts = {}) {
  const r = o.radius ?? 10;
  const border = o.border ?? C.border;
  g.fillStyle(0x000000, 0.22).fillRoundedRect(x + 2, y + 4, w, h, r);
  g.fillStyle(o.fill ?? C.panel, o.fillAlpha ?? 1).fillRoundedRect(x, y, w, h, r);
  g.lineStyle(1, border, 0.65).strokeRoundedRect(x, y, w, h, r);
  g.lineStyle(1, 0xb9c9dc, 0.06).lineBetween(x + r, y + 1, x + w - r, y + 1);
  if (o.ornate) {
    for (const sx of [x + 12, x + w - 12]) {
      const d = sx < x + w / 2 ? 1 : -1;
      g.lineStyle(2, border, 0.8).lineBetween(sx, y, sx + d * 24, y);
      g.lineStyle(1, border, 0.4).lineBetween(sx, y + h, sx + d * 16, y + h);
    }
  }
}
