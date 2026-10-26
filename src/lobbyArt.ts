import type * as Phaser from 'phaser';
import { HEIGHT, WIDTH } from './config';

type Graphics = Phaser.GameObjects.Graphics;

/** A quiet ink-and-brass background; the roster remains the brightest part of the screen. */
export function drawLobbyBackdrop(g: Graphics) {
  g.fillStyle(0x0b1019, 0.94).fillRect(0, 0, WIDTH, HEIGHT);
  for (let k = 0; k < 6; k++) {
    g.fillStyle(0x26334a, 0.035).fillCircle(960, 260, 180 + k * 45);
  }
  for (let k = 0; k < 8; k++) {
    g.lineStyle(1, 0x8c9bb7, 0.025).lineBetween(200 + k * 175, 0, k * 175 - 400, HEIGHT);
  }
  g.fillStyle(0x9e3130, 0.12).fillPoints([{ x: 0, y: 0 }, { x: 180, y: 0 }, { x: 85, y: 82 }, { x: 0, y: 102 }] as Phaser.Math.Vector2[], true);
  g.lineStyle(1, 0xb59457, 0.16).lineBetween(30, 78, WIDTH - 30, 78);
  for (const x of [16, WIDTH - 16]) {
    g.lineStyle(1, 0xd9ae4a, 0.2).lineBetween(x, 92, x, HEIGHT - 42);
    g.fillStyle(0xd9ae4a, 0.5).fillCircle(x, 86, 2);
  }
}

/** A circular crossed-blade crest, also used on the ready-to-fight banner. */
export function drawLobbyCrest(g: Graphics, x: number, y: number, r: number, color = 0xd9ae4a) {
  g.fillStyle(0x111a27, 1).fillCircle(x, y, r);
  g.lineStyle(1, color, 0.65).strokeCircle(x, y, r);
  g.lineStyle(1, color, 0.2).strokeCircle(x, y, r - 4);
  for (const side of [-1, 1]) {
    const at = (a: number, b: number) => ({ x: x + (a + b * side) * r * 0.62, y: y + (-a * side + b) * r * 0.62 } as Phaser.Math.Vector2);
    g.fillStyle(0xcbd3dc, 0.9).fillPoints([at(-0.55, -0.07), at(0.72, -0.07), at(0.95, 0), at(0.72, 0.07), at(-0.55, 0.07)], true);
    g.lineStyle(3, color, 1).lineBetween(at(-0.6, -0.25).x, at(-0.6, -0.25).y, at(-0.6, 0.25).x, at(-0.6, 0.25).y);
    g.lineStyle(3, 0x89594c, 1).lineBetween(at(-0.95, 0).x, at(-0.95, 0).y, at(-0.62, 0).x, at(-0.62, 0).y);
  }
  g.fillStyle(color, 1).fillCircle(x, y, 2);
}

export function drawRosterFrame(g: Graphics, x: number, y: number, w: number, h: number, color: number, muted = false) {
  g.fillStyle(0x000000, 0.25).fillRoundedRect(x + 3, y + 6, w, h, 12);
  g.fillStyle(muted ? 0x111925 : 0x17202e, 0.98).fillRoundedRect(x, y, w, h, 12);
  g.fillStyle(color, muted ? 0.025 : 0.07).fillRoundedRect(x + 1, y + 1, w - 2, 76, { tl: 11, tr: 11, bl: 0, br: 0 });
  g.lineStyle(1, muted ? 0x303b4c : 0x465268, 0.7).strokeRoundedRect(x, y, w, h, 12);
  // Short metal fittings replace the old full, bright player-colour outline.
  for (const sx of [x + 10, x + w - 10]) {
    const d = sx < x + w / 2 ? 1 : -1;
    g.lineStyle(2, color, muted ? 0.25 : 0.8).lineBetween(sx, y + 1, sx + d * 22, y + 1);
    g.lineStyle(1, color, 0.35).lineBetween(sx, y + h - 1, sx + d * 12, y + h - 1);
  }
  g.lineStyle(1, 0x9aacbd, 0.09).lineBetween(x + 14, y + 36, x + w - 14, y + 36);
}

/** Front-facing portrait art, drawn in the same palette as the in-game ninjas. */
export function drawLobbyPortrait(g: Graphics, x: number, y: number, r: number, color: number, role: string) {
  const p = (a: number, b: number) => ({ x: x + a * r, y: y + b * r } as Phaser.Math.Vector2);
  g.fillStyle(color, 0.06).fillCircle(x, y, r + 7);
  g.lineStyle(1, color, 0.3).strokeCircle(x, y, r + 4);
  g.fillStyle(0x0d1522, 1).fillCircle(x, y, r);
  g.fillStyle(color, 0.14).fillCircle(x, y - r * 0.1, r * 0.82);
  // Shoulders, lapels, scarf tails and layered armour.
  g.fillStyle(color, 0.7).fillPoints([p(-0.16, 0.18), p(-0.93, 0.53), p(-0.6, 0.8), p(0.17, 0.35)], true);
  g.fillStyle(0x263243, 1).fillPoints([p(-0.74, 0.8), p(-0.67, 0.43), p(-0.25, 0.18), p(0.25, 0.18), p(0.67, 0.43), p(0.74, 0.8)], true);
  g.fillStyle(0x405066, 1).fillPoints([p(-0.5, 0.47), p(-0.24, 0.25), p(0, 0.57), p(-0.2, 0.82)], true);
  g.fillStyle(0x182331, 1).fillPoints([p(0.5, 0.47), p(0.24, 0.25), p(-0.2, 0.82), p(0.18, 0.82)], true);
  g.lineStyle(2, color, 0.7).lineBetween(x - r * 0.4, y + r * 0.49, x + r * 0.08, y + r * 0.81);
  for (const side of [-1, 1]) {
    g.fillStyle(color, 0.4).fillRoundedRect(x + side * r * 0.56 - r * 0.14, y + r * 0.44, r * 0.28, r * 0.16, 3);
  }
  // Hood and eyes; the mask deliberately leaves a narrow, bright eye slit.
  g.fillStyle(0x080e17, 1).fillEllipse(x, y - r * 0.16, r * 1.13, r * 1.35);
  g.fillStyle(0x273446, 1).fillEllipse(x - r * 0.06, y - r * 0.23, r * 0.95, r * 1.15);
  g.fillStyle(0xd5b59b, 1).fillRoundedRect(x - r * 0.4, y - r * 0.25, r * 0.8, r * 0.25, 3);
  g.fillStyle(0x101722, 1).fillPoints([p(-0.43, 0), p(0, -0.07), p(0.43, 0), p(0.3, 0.36), p(-0.3, 0.36)], true);
  for (const side of [-1, 1]) {
    g.fillStyle(0xe7eff4, 1).fillTriangle(x + side * r * 0.12, y - r * 0.12, x + side * r * 0.31, y - r * 0.16, x + side * r * 0.27, y - r * 0.08);
  }
  g.fillStyle(color, 0.9).fillRoundedRect(x - r * 0.5, y - r * 0.43, r, r * 0.16, 3);
  g.fillStyle(0xb5c1c9, 1).fillRoundedRect(x - r * 0.2, y - r * 0.44, r * 0.4, r * 0.17, 2);
  g.lineStyle(1, 0x405367, 1).lineBetween(x - r * 0.08, y - r * 0.36, x + r * 0.08, y - r * 0.36);
  if (role === 'samurai') {
    g.fillStyle(0xb9975c, 1).fillPoints([p(-0.42, -0.48), p(-0.8, -0.76), p(-0.65, -0.27), p(-0.4, -0.22)], true);
    g.fillPoints([p(0.42, -0.48), p(0.8, -0.76), p(0.65, -0.27), p(0.4, -0.22)], true);
  } else if (role === 'mystic') {
    g.fillStyle(color, 1).fillPoints([p(0, -0.84), p(-0.13, -0.64), p(0, -0.48), p(0.13, -0.64)], true);
    g.lineStyle(1, 0xe5d39b, 0.7).strokeCircle(x, y - r * 0.63, r * 0.1);
  }
}

export function drawLobbyDie(g: Graphics, x: number, y: number, size: number, color = 0xd9ae4a) {
  g.fillStyle(color, 0.12).fillRoundedRect(x - size / 2, y - size / 2, size, size, 7);
  g.lineStyle(1, color, 0.65).strokeRoundedRect(x - size / 2, y - size / 2, size, size, 7);
  for (const [dx, dy] of [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]) {
    g.fillStyle(color, 0.9).fillCircle(x + dx * size * 0.23, y + dy * size * 0.23, size * 0.055);
  }
}

/** Controller silhouette for connection and calibration cards. */
export function drawControllerIcon(g: Graphics, x: number, y: number, size: number, color: number) {
  const s = size / 60;
  const p = (a: number, b: number) => ({ x: x + a * s, y: y + b * s } as Phaser.Math.Vector2);
  g.fillStyle(color, 0.06).fillCircle(x, y, size * 0.65);
  g.fillStyle(0x263447, 1).fillPoints([p(-24, -12), p(24, -12), p(33, 13), p(29, 20), p(21, 20), p(12, 9), p(-12, 9), p(-21, 20), p(-29, 20), p(-33, 13)], true);
  g.lineStyle(1, color, 0.6).strokePoints([p(-24, -12), p(24, -12), p(33, 13), p(29, 20), p(21, 20), p(12, 9), p(-12, 9), p(-21, 20), p(-29, 20), p(-33, 13)], true);
  g.fillStyle(color, 0.8).fillRoundedRect(x - 23 * s, y - 2 * s, 14 * s, 4 * s, s);
  g.fillRoundedRect(x - 18 * s, y - 7 * s, 4 * s, 14 * s, s);
  for (const [dx, dy] of [[17, -6], [23, 0], [17, 6], [11, 0]]) g.fillCircle(x + dx * s, y + dy * s, 2 * s);
  g.fillStyle(0xc1ccda, 0.7).fillCircle(x - 4 * s, y + 7 * s, 3 * s).fillCircle(x + 5 * s, y + 7 * s, 3 * s);
}

/** Stage previews give the locked Quest row a purpose rather than identical placeholders. */
export function drawQuestEmblem(g: Graphics, x: number, y: number, stage: number) {
  const color = [0xae665f, 0xb69a71, 0x9b86bb, 0x6a9a62, 0xd9b572, 0x90d9be, 0xc96965, 0x99c9b7][stage];
  g.fillStyle(color, 0.07).fillCircle(x, y, 41);
  g.lineStyle(1, color, 0.35).strokeCircle(x, y, 37);
  if (stage === 0) {
    for (let k = 0; k < 3; k++) {
      g.lineStyle(3, color, 0.8).lineBetween(x - 24, y - 14 + k * 14, x - 7, y - 9 + k * 14);
      g.lineBetween(x - 7, y - 9 + k * 14, x + 10, y - 16 + k * 14).lineBetween(x + 10, y - 16 + k * 14, x + 25, y - 10 + k * 14);
    }
  } else if (stage === 1) {
    g.fillStyle(color, 0.7).fillRect(x - 25, y - 12, 18, 35).fillRect(x + 7, y - 12, 18, 35).fillRect(x - 8, y, 16, 23);
    for (const dx of [-25, -13, 7, 19]) g.fillRect(x + dx, y - 20, 6, 10);
    g.fillStyle(0x17202e, 1).fillRect(x - 3, y + 9, 6, 14);
  } else if (stage === 2) {
    g.lineStyle(5, color, 0.75).lineBetween(x, y + 24, x, y - 21);
    for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
      g.lineStyle(3 - k * 0.5, color, 0.8).lineBetween(x, y + 6 - k * 10, x + side * (24 - k * 5), y - 12 - k * 8);
    }
    g.lineStyle(2, color, 0.5).lineBetween(x, y + 18, x - 18, y + 28).lineBetween(x, y + 18, x + 18, y + 28);
  } else if (stage === 3) {
    for (const [dx, dy] of [[0, -16], [-16, 14], [16, 14]]) {
      g.lineStyle(3, color, 0.85).lineBetween(x + dx, y + dy + 12, x + dx, y + dy - 8);
      g.lineStyle(2, color, 0.75).lineBetween(x + dx, y + dy - 2, x + dx - 9, y + dy - 10).lineBetween(x + dx, y + dy - 2, x + dx + 9, y + dy - 10);
    }
  } else if (stage === 4) {
    for (const [dx, dy] of [[0, -17], [-19, 16], [19, 16]]) {
      g.lineStyle(2, color, 0.85).strokeCircle(x + dx, y + dy, 11);
      g.lineStyle(2, color, 0.6).strokeCircle(x + dx, y + dy, 6);
      g.fillStyle(color, 0.8).fillCircle(x + dx, y + dy, 2);
    }
  } else if (stage === 5) {
    g.fillStyle(color, 0.12).fillCircle(x, y, 27);
    g.lineStyle(2, color, 0.9).strokeRoundedRect(x - 15, y - 18, 30, 36, 5);
    g.lineBetween(x - 20, y - 22, x + 20, y - 22).lineBetween(x - 20, y + 22, x + 20, y + 22);
    g.lineBetween(x, y - 29, x, y - 22).lineBetween(x, y + 22, x, y + 30);
    g.fillStyle(0xffdf9a, 0.9).fillEllipse(x, y, 10, 22);
  } else if (stage === 7) {
    g.lineStyle(2, 0xd6bd89, 0.8).lineBetween(x - 20, y - 10, x + 20, y + 10);
    drawLobbyPortrait(g, x - 17, y - 9, 22, 0xc85957, 'samurai');
    drawLobbyPortrait(g, x + 17, y + 9, 22, 0x70bcad, 'mystic');
  } else drawLobbyPortrait(g, x, y, 32, color, 'samurai');
}
