import * as Phaser from 'phaser';
import { GAME_MODES, HEIGHT, TEAM_COLORS, WIDTH, type GameMode } from '../config';
import { T } from '../i18n';
import { getSettings, saveSettings } from '../settings';
import { C, FocusNav, Petals, UIScene, addBackdrop, addButton, drawFrame, txt } from '../ui';

const CARD_GAP = 24;
const CARD_W = Math.floor((WIDTH - 80 - (GAME_MODES.length - 1) * CARD_GAP) / GAME_MODES.length);
const CARD_H = 430;
const CARD_Y = 128;

export class ModeScene extends UIScene {
  private petals!: Petals;

  constructor() {
    super('Mode');
  }

  create() {
    this.setupUI();
    addBackdrop(this, 0.72);
    this.petals = new Petals(this, { x: 0, y: 0, w: WIDTH, h: HEIGHT }, 18);
    txt(this, WIDTH / 2, 66, T().selectMode, 46, C.goldHex, { title: true, bold: true, origin: 0.5, stroke: '#2a0a06', strokeThickness: 6 });

    const layer = this.add.container(0, 0);
    const nav = new FocusNav(this);
    this.pushNav(nav);
    nav.onBack = () => this.scene.start('Title');

    GAME_MODES.forEach((mode, i) => {
      const cx = WIDTH / 2 + (i - (GAME_MODES.length - 1) / 2) * (CARD_W + CARD_GAP);
      const x = cx - CARD_W / 2;
      const g = this.add.graphics();
      drawFrame(g, x, CARD_Y, CARD_W, CARD_H, { fill: C.panel, fillAlpha: 0.94, border: C.gold, radius: 14, ornate: true });
      g.fillStyle(C.well, 1).fillRoundedRect(x + 20, CARD_Y + 20, CARD_W - 40, 190, 10);
      layer.add(g);
      const icon = this.add.graphics();
      drawModeIcon(icon, mode, cx, CARD_Y + 115);
      layer.add(icon);
      layer.add(txt(this, cx, CARD_Y + 254, T().modeNames(mode), 34, C.text, { title: true, bold: true, origin: 0.5 }));
      layer.add(txt(this, cx, CARD_Y + 296, T().modeDesc(mode), 15, C.dim, { origin: [0.5, 0], wrap: CARD_W - 60, align: 'center' }));
      nav.add({
        id: mode, x, y: CARD_Y, w: CARD_W, h: CARD_H, radius: 14,
        onEnter: () => {
          getSettings().mode = mode;
          saveSettings();
          // The map is picked in the lobby (Quest stages have their own).
          this.scene.start('Lobby');
        },
      });
    });
    addButton(this, layer, nav, { id: 'back', x: 110, y: HEIGHT - 60, w: 150, h: 44, label: T().back, onPress: () => this.scene.start('Title') });
    nav.done(getSettings().mode);

    txt(this, WIDTH / 2, HEIGHT - 26, T().confirmHint, 13, C.faint, { origin: 0.5 });
  }

  update(_t: number, dms: number) {
    this.petals.update(dms / 1000);
  }
}

function drawSword(g: Phaser.GameObjects.Graphics, cx: number, cy: number, angle: number, len: number) {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const px = -uy;
  const py = ux;
  const tipX = cx + ux * len * 0.55;
  const tipY = cy + uy * len * 0.55;
  const guardX = cx - ux * len * 0.25;
  const guardY = cy - uy * len * 0.25;
  // Blade.
  g.fillStyle(0xd8dde6, 1).fillTriangle(tipX, tipY, guardX + px * 7, guardY + py * 7, guardX - px * 7, guardY - py * 7);
  g.lineStyle(1.5, 0x8a93a3, 1).lineBetween(tipX, tipY, guardX, guardY);
  // Guard and grip.
  g.lineStyle(7, 0xd9ae4a, 1).lineBetween(guardX + px * 18, guardY + py * 18, guardX - px * 18, guardY - py * 18);
  g.lineStyle(7, 0x6b3f1f, 1).lineBetween(guardX, guardY, guardX - ux * 34, guardY - uy * 34);
  g.fillStyle(0xd9ae4a, 1).fillCircle(guardX - ux * 38, guardY - uy * 38, 6);
}

function drawBanner(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, flip: boolean) {
  g.lineStyle(5, 0x6b3f1f, 1).lineBetween(x, y - 70, x, y + 70);
  g.fillStyle(0xd9ae4a, 1).fillCircle(x, y - 72, 6);
  const d = flip ? -1 : 1;
  g.fillStyle(color, 1).fillPoints([
    { x, y: y - 62 }, { x: x + d * 70, y: y - 56 }, { x: x + d * 58, y: y - 26 }, { x: x + d * 70, y: y + 4 }, { x, y: y + 6 },
  ] as Phaser.Math.Vector2[], true);
  g.lineStyle(2, 0xd9ae4a, 1).strokePoints([
    { x, y: y - 62 }, { x: x + d * 70, y: y - 56 }, { x: x + d * 58, y: y - 26 }, { x: x + d * 70, y: y + 4 }, { x, y: y + 6 },
  ] as Phaser.Math.Vector2[], true);
}

function drawModeIcon(g: Phaser.GameObjects.Graphics, mode: GameMode, cx: number, cy: number) {
  if (mode === 'ffa') {
    drawSword(g, cx, cy, -Math.PI / 4, 170);
    drawSword(g, cx, cy, (-3 * Math.PI) / 4, 170);
  } else if (mode === 'team') {
    drawBanner(g, cx - 20, cy + 10, TEAM_COLORS[0], true);
    drawBanner(g, cx + 20, cy + 10, TEAM_COLORS[1], false);
  } else if (mode === 'siege') {
    // A watchtower flying both team banners.
    g.fillStyle(0x8d877a, 1).fillRect(cx - 44, cy - 10, 88, 76);
    g.lineStyle(2, 0x4f4a42, 1).strokeRect(cx - 44, cy - 10, 88, 76);
    g.fillStyle(0x5a3a1e, 1).fillRect(cx - 30, cy - 40, 60, 40);
    g.fillStyle(0x2b2f36, 1).fillTriangle(cx - 52, cy - 36, cx + 52, cy - 36, cx, cy - 78);
    g.fillStyle(0x1e1e22, 1).fillRect(cx - 8, cy - 24, 16, 18);
    g.lineStyle(3, 0x6b3f1f, 1).lineBetween(cx - 60, cy - 70, cx - 60, cy + 66).lineBetween(cx + 60, cy - 70, cx + 60, cy + 66);
    g.fillStyle(TEAM_COLORS[0], 1).fillTriangle(cx - 60, cy - 70, cx - 60, cy - 40, cx - 30, cy - 55);
    g.fillStyle(TEAM_COLORS[1], 1).fillTriangle(cx + 60, cy - 70, cx + 60, cy - 40, cx + 30, cy - 55);
  } else if (mode === 'quest') {
    // A torii gate with three stage lanterns, and the boss's horned mask beyond it.
    g.fillStyle(0x8a1a14, 1).fillRect(cx - 62, cy - 48, 124, 12);
    g.fillStyle(0x1e1e22, 1).fillRect(cx - 72, cy - 60, 144, 10);
    g.fillStyle(0x8a1a14, 1).fillRect(cx - 50, cy - 36, 12, 110).fillRect(cx + 38, cy - 36, 12, 110);
    g.fillStyle(0x8a1a14, 1).fillRect(cx - 56, cy - 22, 112, 8);
    // Oni mask.
    g.fillStyle(0xc0392b, 1).fillCircle(cx, cy + 22, 26);
    g.fillStyle(0xf2e6d0, 1).fillTriangle(cx - 20, cy + 2, cx - 14, cy - 18, cx - 8, cy + 2).fillTriangle(cx + 20, cy + 2, cx + 14, cy - 18, cx + 8, cy + 2);
    g.fillStyle(0xffd23a, 1).fillCircle(cx - 9, cy + 16, 4).fillCircle(cx + 9, cy + 16, 4);
    g.fillStyle(0x1e1e22, 1).fillRect(cx - 12, cy + 32, 24, 5);
    for (const [k, lit] of [[-1, 1], [0, 1], [1, 1]] as const) {
      g.fillStyle(0xf2c94c, lit).fillCircle(cx + k * 30, cy + 84, 8);
      g.lineStyle(2, 0x6b3f1f, 1).strokeCircle(cx + k * 30, cy + 84, 8);
    }
  } else {
    // Crown over a walled-in heart.
    g.fillStyle(0x8d877a, 1).fillRect(cx - 62, cy - 20, 124, 82);
    g.lineStyle(2, 0x4f4a42, 1).strokeRect(cx - 62, cy - 20, 124, 82);
    for (let row = 0; row < 4; row++) {
      const yy = cy - 20 + row * 20.5;
      g.lineBetween(cx - 62, yy, cx + 62, yy);
      for (let col = row % 2 ? -52 : -62; col < 62; col += 20) g.lineBetween(cx + col, yy, cx + col, yy + 20.5);
    }
    g.fillStyle(0xff6fae, 1).fillCircle(cx - 12, cy + 16, 15).fillCircle(cx + 12, cy + 16, 15);
    g.fillTriangle(cx - 26, cy + 22, cx + 26, cy + 22, cx, cy + 50);
    g.fillStyle(0xd9ae4a, 1).fillPoints([
      { x: cx - 50, y: cy - 30 }, { x: cx - 50, y: cy - 72 }, { x: cx - 25, y: cy - 50 }, { x: cx, y: cy - 82 },
      { x: cx + 25, y: cy - 50 }, { x: cx + 50, y: cy - 72 }, { x: cx + 50, y: cy - 30 },
    ] as Phaser.Math.Vector2[], true);
    g.fillStyle(0xc0392b, 1).fillCircle(cx, cy - 46, 6);
  }
}
