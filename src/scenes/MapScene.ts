import * as Phaser from 'phaser';
import { HEIGHT, WIDTH } from '../config';
import { T } from '../i18n';
import { MAPS, addArenaTexture } from '../maps';
import { getSettings, saveSettings } from '../settings';
import { sfx } from '../sfx';
import { C, FocusNav, Petals, UIScene, addBackdrop, addButton, addMenuHeader, txt } from '../ui';
import { drawRosterFrame } from '../lobbyArt';

// Six maps per page (3 × 2); ◀ ▶ buttons (or the mouse wheel) flip pages.
const COLS = 3;
const PER_PAGE = 6;
const SIDE = 96;
const CARD_GAP = 22;
const CARD_W = Math.floor((WIDTH - SIDE * 2 - (COLS - 1) * CARD_GAP) / COLS);
const PREVIEW_H = Math.round((CARD_W - 48) * ((HEIGHT - 92) / WIDTH));
const CARD_H = PREVIEW_H + 104;
const ROW_Y = [100, 100 + CARD_H + 20];
const PAGES = Math.ceil(MAPS.length / PER_PAGE);

/** Map select: one card per map with a preview of its painted arena. */
export class MapScene extends UIScene {
  private petals!: Petals;
  private nav!: FocusNav;
  private layer!: Phaser.GameObjects.Container;
  private page = 0;

  constructor() {
    super('Map');
  }

  create() {
    this.setupUI();
    addBackdrop(this, 0.75);
    this.petals = new Petals(this, { x: 0, y: 0, w: WIDTH, h: HEIGHT }, 14);
    addMenuHeader(this, T().selectMap);
    txt(this, WIDTH - 40, 40, T().mapCount(MAPS.length), 13, '#bba983', { bold: true, origin: [1, 0.5] });
    const footer = this.add.graphics();
    footer.fillStyle(0x121b29, 0.98).fillRoundedRect(30, 652, WIDTH - 60, 49, 10);
    txt(this, WIDTH / 2, 712, T().confirmHint, 10, C.faint, { origin: 0.5 });

    this.nav = new FocusNav(this);
    this.pushNav(this.nav);
    this.nav.onBack = () => this.scene.start('Lobby');
    this.layer = this.add.container(0, 0);

    const chosen = getSettings().mapId;
    const idx = MAPS.findIndex((m) => m.id === chosen);
    this.page = idx >= 0 ? Math.floor(idx / PER_PAGE) : 0;
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (Math.abs(dy) > 20) this.flip(dy > 0 ? 1 : -1, null);
    });
    this.build(chosen);
  }

  /** Change page; `focus` is what to focus afterwards (null keeps the current item if it's still there). */
  private flip(d: number, focus: string | null) {
    const p = Phaser.Math.Clamp(this.page + d, 0, PAGES - 1);
    if (p === this.page) return;
    this.page = p;
    sfx.menuChange();
    this.build(focus ?? MAPS[p * PER_PAGE].id);
  }

  private build(focus: string) {
    this.layer.removeAll(true);
    const nav = this.nav;
    nav.reset();
    const layer = this.layer;

    MAPS.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE).forEach((map, i) => {
      const cx = WIDTH / 2 + ((i % COLS) - (COLS - 1) / 2) * (CARD_W + CARD_GAP);
      const x = cx - CARD_W / 2;
      const y = ROW_Y[Math.floor(i / COLS)];
      const g = this.add.graphics();
      const selected = getSettings().mapId === map.id;
      drawRosterFrame(g, x, y, CARD_W, CARD_H, selected ? C.gold : 0x677f95);
      if (selected) g.lineStyle(1, C.gold, 0.7).strokeRoundedRect(x, y, CARD_W, CARD_H, 12);
      layer.add(g);
      // Preview: the map's own painted arena, scaled down.
      const pw = CARD_W - 48;
      layer.add(this.add.image(cx, y + 12 + PREVIEW_H / 2, addArenaTexture(this, map)).setDisplaySize(pw, PREVIEW_H));
      const frame = this.add.graphics();
      frame.lineStyle(1, 0xb9c9dc, 0.16).strokeRect(cx - pw / 2, y + 12, pw, PREVIEW_H);
      frame.fillStyle(0x0b1019, 0.85).fillRoundedRect(cx - pw / 2 + 6, y + 18, 34, 19, 4);
      layer.add(frame);
      layer.add(txt(this, cx - pw / 2 + 23, y + 28, String(this.page * PER_PAGE + i + 1).padStart(2, '0'), 11, '#dfd6c4', { bold: true, origin: 0.5 }));
      if (selected) {
        frame.fillStyle(0x0b1019, 0.9).fillRoundedRect(cx + pw / 2 - 84, y + 18, 78, 19, 4);
        layer.add(txt(this, cx + pw / 2 - 45, y + 28, `✓ ${T().mapSelected}`, 10, C.goldHex, { bold: true, origin: 0.5 }));
      }
      const name = txt(this, cx, y + PREVIEW_H + 31, T().mapName(map), 22, C.text, { title: true, bold: true, origin: 0.5 });
      name.setScale(Math.min(1, (CARD_W - 40) / name.width));
      layer.add(name);
      layer.add(txt(this, cx, y + PREVIEW_H + 52, T().mapDesc(map), 12, C.dim, { origin: [0.5, 0], wrap: CARD_W - 42, align: 'center' }));
      nav.add({
        id: map.id, x, y, w: CARD_W, h: CARD_H, radius: 14,
        onEnter: () => {
          getSettings().mapId = map.id;
          saveSettings();
          this.scene.start('Lobby');
        },
      });
    });

    // Page buttons on either side, and page dots under the cards.
    const midY = (ROW_Y[0] + ROW_Y[1] + CARD_H) / 2;
    const arrow = (id: string, x: number, d: number, on: boolean) => {
      const g = this.add.graphics();
      g.fillStyle(C.panel, on ? 0.95 : 0.4).fillRoundedRect(x - 30, midY - 50, 60, 100, 12);
      g.lineStyle(1, C.gold, on ? 0.65 : 0.15).strokeRoundedRect(x - 30, midY - 50, 60, 100, 12);
      layer.add(g);
      layer.add(txt(this, x, midY, d < 0 ? '‹' : '›', 36, on ? C.goldHex : C.faint, { origin: 0.5 }));
      if (on) nav.add({ id, x: x - 30, y: midY - 50, w: 60, h: 100, radius: 12, onEnter: () => this.flip(d, id) });
    };
    arrow('prev', SIDE / 2, -1, this.page > 0);
    arrow('next', WIDTH - SIDE / 2, 1, this.page < PAGES - 1);
    const dotsY = ROW_Y[1] + CARD_H + 18;
    for (let p = 0; p < PAGES; p++) {
      const g = this.add.graphics();
      g.fillStyle(p === this.page ? C.gold : C.border, 1).fillCircle(WIDTH / 2 + (p - (PAGES - 1) / 2) * 22, dotsY, p === this.page ? 6 : 4);
      layer.add(g);
    }
    layer.add(txt(this, WIDTH / 2 + PAGES * 11 + 16, dotsY, `${this.page + 1} / ${PAGES}`, 13, C.dim, { origin: [0, 0.5] }));

    addButton(this, layer, nav, { id: 'back', x: 100, y: HEIGHT - 32, w: 130, h: 40, label: T().back, onPress: () => this.scene.start('Lobby') });
    // A different map every round.
    addButton(this, layer, nav, {
      id: 'random', x: WIDTH / 2, y: HEIGHT - 32, w: 260, h: 44, label: `🎲  ${T().randomMap}`, primary: getSettings().mapId === 'random',
      onPress: () => {
        getSettings().mapId = 'random';
        saveSettings();
        this.scene.start('Lobby');
      },
    });
    nav.done(focus);
  }

  update(_t: number, dms: number) {
    this.petals.update(dms / 1000);
  }
}
