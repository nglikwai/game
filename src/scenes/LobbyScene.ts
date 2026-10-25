import * as Phaser from 'phaser';
import { connectedPads, padKind, padLabels, padName } from '../gamepads';
import { HEIGHT, MAX_PLAYERS, PLAYER_COLORS, QUEST, RES, TEAM_COLORS, WEAPON_AREA, WIDTH } from '../config';
import { CONTROL_OPTIONS, KEY_SETS, isKeySet, keyLabel, type ControlId } from '../controls';
import { T } from '../i18n';
import { getSettings, keysOf, saveSettings, setControl, toggleSkill, usesTeams, validate, type SlotConfig } from '../settings';
import { sfx } from '../sfx';
import { SKILLS, SKILL_CATEGORIES, SKILL_SLOTS, skillById, type Skill } from '../skills';
import {
  C, FocusNav, Petals, UIScene, addBackdrop, addButton, addSelector, drawFrame, drawSkillIcon, toHex, toast, txt, type Modal,
} from '../ui';
import { drawWeaponIcon, ninjaTexture } from '../art';
import { getMap } from '../maps';
import { ROLES, roleById } from '../roles';
import { WEAPONS, drawShape, shapeArea, type Weapon } from '../weapons';

// Six cards across the screen.
// Two rows of four cards.
const CARD_COLS = 4;
const CARD_GAP = 10;
const CARD_W = Math.floor((WIDTH - 60 - (CARD_COLS - 1) * CARD_GAP) / CARD_COLS);
const CARD_H = 254;
/** Loadout window: height of one row in the weapon list. */
const WEAPON_ROW = 34;
const CARD_Y = 78;
const cardX = (i: number) => 30 + (i % CARD_COLS) * (CARD_W + CARD_GAP);
const cardY = (i: number) => CARD_Y + Math.floor(i / CARD_COLS) * (CARD_H + CARD_GAP);

const K = Phaser.Input.Keyboard.KeyCodes;
/** Keys the menus / battle already use, so they can't be bound. */
const RESERVED_KEYS = new Set<number>([K.ENTER, K.ESC]);

export class LobbyScene extends UIScene {
  private layer!: Phaser.GameObjects.Container;
  private nav!: FocusNav;
  private petals!: Petals;
  /** Loadout window: which key box (0 = attack, 1–3 = skills, 4–5 = items) is waiting for a key press. */
  private bindingIdx: number | null = null;

  constructor() {
    super('Lobby');
  }

  create() {
    this.setupUI();
    this.bindingIdx = null;
    addBackdrop(this, 0.8);
    this.petals = new Petals(this, { x: 0, y: 0, w: WIDTH, h: HEIGHT }, 12);
    txt(this, WIDTH / 2, 44, T().lobbyTitle, 40, C.goldHex, { title: true, bold: true, origin: 0.5, stroke: '#2a0a06', strokeThickness: 6 });
    this.layer = this.add.container(0, 0);
    this.nav = new FocusNav(this);
    this.nav.onBack = () => this.scene.start('Mode');
    this.pushNav(this.nav);
    this.build();
    txt(this, WIDTH / 2, HEIGHT - 20, T().confirmHint, 13, C.faint, { origin: 0.5 });
    // Plugging in (or waking up) a controller updates the cards straight away.
    const refresh = () => {
      if (this.navs.length === 1) this.build();
    };
    window.addEventListener('gamepadconnected', refresh);
    window.addEventListener('gamepaddisconnected', refresh);
    this.events.once('shutdown', () => {
      window.removeEventListener('gamepadconnected', refresh);
      window.removeEventListener('gamepaddisconnected', refresh);
    });
  }

  update(_t: number, dms: number) {
    this.petals.update(dms / 1000);
  }

  // ---------- lobby ----------

  private build() {
    const s = getSettings();
    this.layer.removeAll(true);
    this.nav.reset();

    // Mode chip (click to change mode).
    const chip = this.add.graphics();
    drawFrame(chip, 30, 24, 250, 40, { fill: C.panel, border: C.gold, radius: 8 });
    this.layer.add(chip);
    this.layer.add(txt(this, 46, 44, `${T().mode}：`, 14, C.dim, { origin: [0, 0.5] }));
    this.layer.add(txt(this, 100, 44, T().modeNames(s.mode), 20, C.text, { title: true, bold: true, origin: [0, 0.5] }));
    this.nav.add({ id: 'mode', x: 30, y: 24, w: 250, h: 40, onEnter: () => this.scene.start('Mode') });

    // Map chip: opens the map selection screen (Quest stages have fixed maps, so there's nothing to pick).
    const mapChip = this.add.graphics();
    drawFrame(mapChip, WIDTH - 280, 24, 250, 40, { fill: C.panel, border: C.gold, radius: 8 });
    this.layer.add(mapChip);
    this.layer.add(txt(this, WIDTH - 264, 44, `${T().map}：`, 14, C.dim, { origin: [0, 0.5] }));
    const mapLabel = s.mode === 'quest' ? T().questMaps : s.mapId === 'random' ? `🎲 ${T().randomShort}` : T().mapName(getMap(s.mapId));
    this.layer.add(txt(this, WIDTH - 210, 44, mapLabel, 20, C.text, { title: true, bold: true, origin: [0, 0.5] }));
    if (s.mode !== 'quest') {
      this.layer.add(txt(this, WIDTH - 46, 44, '▶', 12, C.goldHex, { origin: 0.5 }));
      this.nav.add({ id: 'map', x: WIDTH - 280, y: 24, w: 250, h: 40, onEnter: () => this.scene.start('Map') });
    }

    s.slots.forEach((slot, i) => this.buildCard(slot, i));

    // Every controller the browser can see, by slot number (handy when Joy-Cons get combined or swapped).
    const pads = connectedPads();
    const list = pads.length
      ? pads.map((p) => `${T().controls(`pad${p.index + 1}` as ControlId)}: ${padKind(p.id) === 'standard' ? p.id.slice(0, 28) : p.id.replace(/\s*\(.*?vendor.*$/i, '').slice(0, 28)}`).join('　·　')
      : T().noPads;
    this.layer.add(txt(this, WIDTH / 2, 640, `🎮 ${list}`, 12, C.dim, { origin: 0.5, wrap: 760, align: 'center' }));

    addButton(this, this.layer, this.nav, { id: 'back', x: 110, y: 640, w: 150, h: 46, label: T().back, onPress: () => this.scene.start('Mode') });
    addButton(this, this.layer, this.nav, { id: 'fight', x: WIDTH - 160, y: 640, w: 240, h: 58, label: `${T().fightStart}  ▶`, primary: true, size: 30, onPress: () => this.startBattle() });
    this.nav.done('c0-control');
  }

  private buildCard(slot: SlotConfig, i: number) {
    const s = getSettings();
    const x = cardX(i);
    const y = cardY(i);
    const color = PLAYER_COLORS[i];
    const off = slot.control === 'off';
    const cpu = slot.control === 'cpu';
    const L = this.layer;
    const inner = CARD_W - 20;

    // Quest: P5–P8 are the stage's enemies.
    if (s.mode === 'quest' && i >= QUEST.partySlots) {
      const eg = this.add.graphics();
      drawFrame(eg, x, y, CARD_W, CARD_H, { fill: C.panel, fillAlpha: 0.6, border: C.border, radius: 10 });
      eg.fillStyle(TEAM_COLORS[1], 0.12).fillRoundedRect(x + 2, y + 2, CARD_W - 4, CARD_H - 4, 8);
      L.add(eg);
      L.add(txt(this, x + CARD_W / 2, y + CARD_H / 2 - 22, T().questEnemyCard, 26, C.dim, { title: true, bold: true, origin: 0.5 }));
      L.add(txt(this, x + CARD_W / 2, y + CARD_H / 2 + 14, T().questEnemyDesc, 13, C.faint, { origin: 0.5 }));
      return;
    }

    const g = this.add.graphics();
    drawFrame(g, x, y, CARD_W, CARD_H, { fill: C.panel, fillAlpha: 0.95, border: off ? C.border : color, radius: 10 });
    g.fillStyle(off ? C.border : color, off ? 0.15 : 0.22).fillRoundedRect(x + 2, y + 2, CARD_W - 4, 34, { tl: 8, tr: 8, bl: 0, br: 0 });
    L.add(g);
    L.add(txt(this, x + 12, y + 19, `P${i + 1}`, 21, off ? C.faint : toHex(color), { bold: true, origin: [0, 0.5] }));
    if (!off) {
      // Role (random for CPUs) and a ninja portrait in the header.
      L.add(txt(this, x + 56, y + 19, cpu ? '？' : T().roleName(roleById(slot.role)), 15, C.goldHex, { title: true, bold: true, origin: [0, 0.5] }));
      L.add(this.add.image(x + CARD_W - 22, y + 19, ninjaTexture(this, color)).setScale(0.48 / RES).setRotation(Math.PI / 2 + 0.3));
    }

    const rebuild = () => {
      saveSettings();
      this.build();
    };

    addSelector(this, L, this.nav, {
      id: `c${i}-control`, x: x + 10, y: y + 44, w: inner, h: 30, labelW: 0, label: '', value: T().controls(slot.control),
      onAdjust: (d) => {
        const ci = CONTROL_OPTIONS.indexOf(slot.control);
        setControl(slot, CONTROL_OPTIONS[(ci + d + CONTROL_OPTIONS.length) % CONTROL_OPTIONS.length]);
        rebuild();
      },
    });
    if (slot.control.startsWith('pad')) {
      // Which controller is on this slot (or a hint to wake one up).
      const pad = navigator.getGamepads?.()[Number(slot.control.slice(3)) - 1];
      const label = pad?.connected ? padName(padKind(pad.id)) : T().pressPadButton;
      L.add(txt(this, x + CARD_W / 2, y + 79, label, 10, C.goldHex, { origin: 0.5 }));
    }
    if (off) {
      L.add(txt(this, x + CARD_W / 2, y + 150, T().notJoined, 24, C.faint, { title: true, origin: 0.5 }));
      return;
    }

    let cy = y + 84;
    if (usesTeams(s.mode)) {
      addSelector(this, L, this.nav, {
        id: `c${i}-team`, x: x + 10, y: cy, w: inner, h: 30, labelW: 0, label: '', value: T().teamNames[slot.team], valueColor: toHex(TEAM_COLORS[slot.team]),
        onAdjust: () => {
          slot.team = 1 - slot.team;
          rebuild();
        },
      });
      cy += 38;
    }

    if (cpu) {
      // CPUs roll a fresh role, weapon and skill set every round.
      L.add(txt(this, x + CARD_W / 2, cy + 50, '🎲', 30, C.text, { origin: 0.5 }));
      L.add(txt(this, x + CARD_W / 2, cy + 86, T().randomLoadout, 14, C.dim, { origin: 0.5 }));
      return;
    }

    // Weapon.
    const w = WEAPONS[slot.weapon];
    const wg = this.add.graphics();
    wg.fillStyle(C.well, 1).fillRoundedRect(x + 10, cy, inner, 40, 6);
    L.add(wg);
    const icon = this.add.graphics();
    drawWeaponIcon(icon, w.id, x + 32, cy + 20, 30, color);
    L.add(icon);
    L.add(txt(this, x + 58, cy + 20, T().weaponName(w), 18, C.text, { title: true, bold: true, origin: [0, 0.5] }));
    L.add(txt(this, x + CARD_W - 16, cy + 20, T().perSec((1 / w.cycle).toFixed(1)), 11, C.dim, { origin: [1, 0.5] }));

    // Skills: icon + name, three across.
    cy += 48;
    const step = inner / SKILL_SLOTS;
    for (let k = 0; k < SKILL_SLOTS; k++) {
      const sk = skillById(slot.skills[k]);
      const sx = x + 10 + step * k;
      drawSkillIcon(this, L, sx + 15, cy + 16, 13, sk);
      L.add(txt(this, sx + 32, cy + 16, sk ? T().skillName(sk) : T().emptySkill, 12, sk ? C.text : C.faint, { origin: [0, 0.5] }));
    }

    addButton(this, L, this.nav, { id: `c${i}-edit`, x: x + CARD_W / 2, y: y + CARD_H - 24, w: inner - 4, h: 32, label: T().editLoadout, size: 15, onPress: () => this.openLoadout(i) });
  }

  private bindLabel(slot: SlotConfig, n: number) {
    if (isKeySet(slot.control)) return keyLabel(slot.binds[n]);
    if (slot.control.startsWith('pad')) {
      const pad = navigator.getGamepads?.()[Number(slot.control.slice(3)) - 1];
      return padLabels(padKind(pad?.id ?? ''))[n];
    }
    return '';
  }

  private startBattle() {
    const s = getSettings();
    const err = validate(s);
    if (err) {
      sfx.menuError();
      toast(this, err);
      return;
    }
    saveSettings();
    sfx.start();
    this.scene.start('Battle', { slots: structuredClone(s.slots), mode: s.mode, mapId: s.mapId });
  }

  // ---------- loadout window ----------

  private openLoadout(i: number) {
    this.bindingIdx = null;
    this.openModal({
      w: 1220,
      h: 664,
      title: T().loadoutTitle(i + 1),
      titleColor: toHex(PLAYER_COLORS[i]),
      build: (m) => this.buildLoadout(m, i),
      onClose: () => {
        this.keyCapture = null;
        saveSettings();
        this.build();
      },
    });
  }

  private buildLoadout(m: Modal, i: number) {
    const slot = getSettings().slots[i];
    const color = PLAYER_COLORS[i];
    const c = m.content;
    const L = m.x + 34;
    const top = m.y + 70;

    // --- weapons column ---
    // Role: ◀ name ▶ plus a one-line summary.
    const role = roleById(slot.role);
    addSelector(this, c, m.nav, {
      id: 'role', x: L, y: top - 6, w: 380, h: 30, labelW: 64, label: T().role, value: T().roleName(role), valueColor: C.goldHex,
      onAdjust: (d) => {
        const ri = ROLES.findIndex((r) => r.id === slot.role);
        slot.role = ROLES[(ri + d + ROLES.length) % ROLES.length].id;
        saveSettings();
        m.rebuild();
      },
    });
    c.add(txt(this, L, top + 32, T().roleDesc(role), 11, C.dim, { wrap: 380 }));
    const wTop = top + 52;
    c.add(txt(this, L, wTop, T().weaponSection, 20, C.goldHex, { title: true, bold: true }));
    // Two columns, so the list stays short however many weapons there are.
    const colW = 186;
    WEAPONS.forEach((w, k) => {
      const rx = L + (k % 2) * (colW + 8);
      const ry = wTop + 30 + Math.floor(k / 2) * WEAPON_ROW;
      const mid = ry + (WEAPON_ROW - 4) / 2;
      const selected = slot.weapon === k;
      const g = this.add.graphics();
      drawFrame(g, rx, ry, colW, WEAPON_ROW - 4, { fill: selected ? 0x2a2412 : C.panelHi, border: selected ? C.gold : C.border, radius: 6 });
      c.add(g);
      const icon = this.add.graphics();
      drawWeaponIcon(icon, w.id, rx + 20, mid, 22, color);
      c.add(icon);
      c.add(txt(this, rx + 40, mid, T().weaponName(w), 15, selected ? C.goldHex : C.text, { bold: true, origin: [0, 0.5] }));
      c.add(txt(this, rx + colW - 8, mid, T().perSec((1 / w.cycle).toFixed(1)), 10, C.dim, { origin: [1, 0.5] }));
      m.nav.add({
        id: `w${k}`, x: rx, y: ry, w: colW, h: WEAPON_ROW - 4, radius: 6,
        onEnter: () => {
          sfx.menuChange();
          slot.weapon = k;
          saveSettings();
          m.rebuild();
        },
      });
    });
    const preview = this.add.container(0, 0);
    c.add(preview);
    // The preview sits right under however many weapons there are.
    const previewY = wTop + 30 + Math.ceil(WEAPONS.length / 2) * WEAPON_ROW + 4;
    const drawPreview = (w: Weapon) => {
      preview.removeAll(true);
      const g = this.add.graphics();
      g.fillStyle(C.well, 1).fillRoundedRect(L, previewY, 380, 172, 10);
      preview.add(g);
      const sg = this.add.graphics({ x: L + 60, y: previewY + 50 }).setScale(0.38);
      drawShape(sg, w.shape, 0, 0, 0, color, 0.5);
      sg.fillStyle(color, 1).fillCircle(0, 0, 18);
      preview.add(sg);
      const bars: [string, number, string][] = [
        [T().area, shapeArea(w.shape) / WEAPON_AREA, `${Math.round(shapeArea(w.shape))}`],
        [T().speed, 0.32 / w.cycle, T().perSec((1 / w.cycle).toFixed(1))],
        [T().force, w.damage / 25, T().dmg(w.damage.toFixed(0))],
        [T().peCost, w.peCost / 40, `${w.peCost.toFixed(0)}`],
      ];
      bars.forEach(([label, frac, value], n) => {
        const by = previewY + 102 + n * 18;
        preview.add(txt(this, L + 16, by, label, 12, C.dim, { origin: [0, 0.5] }));
        const bg = this.add.graphics();
        bg.fillStyle(0x262b38, 1).fillRect(L + 100, by - 4, 180, 8);
        bg.fillStyle(color, 1).fillRect(L + 100, by - 4, 180 * Phaser.Math.Clamp(frac, 0, 1), 8);
        preview.add(bg);
        preview.add(txt(this, L + 290, by, value, 12, C.text, { origin: [0, 0.5] }));
      });
    };

    // --- skills column ---
    const SX = L + 420;
    const SW = m.w - (SX - m.x) - 34;
    const equippedCount = slot.skills.filter(Boolean).length;
    c.add(txt(this, SX, top, T().skillSection, 22, C.goldHex, { title: true, bold: true }));
    c.add(txt(this, SX + SW, top + 4, T().equipped(equippedCount), 15, C.dim, { origin: [1, 0] }));

    // Equipped slots.
    const slotW = (SW - 24) / 3;
    for (let k = 0; k < SKILL_SLOTS; k++) {
      const sk = skillById(slot.skills[k]);
      const ex = SX + k * (slotW + 12);
      const ey = top + 36;
      const g = this.add.graphics();
      drawFrame(g, ex, ey, slotW, 62, { fill: sk ? 0x2a2412 : C.well, border: sk ? C.gold : C.border, radius: 8 });
      c.add(g);
      drawSkillIcon(this, c, ex + 34, ey + 31, 21, sk);
      c.add(txt(this, ex + 66, ey + 22, sk ? T().skillName(sk) : T().emptySkill, 17, sk ? C.text : C.faint, { bold: true, origin: [0, 0.5] }));
      const key = this.bindLabel(slot, k + 1);
      if (key) c.add(txt(this, ex + 66, ey + 44, `${T().bindNames[k + 1]}：${key}`, 12, C.dim, { origin: [0, 0.5] }));
      m.nav.add({
        id: `e${k}`, x: ex, y: ey, w: slotW, h: 62,
        onEnter: () => {
          if (!slot.skills[k]) return;
          sfx.menuChange();
          slot.skills[k] = null;
          saveSettings();
          m.rebuild();
        },
      });
    }

    // Skill pool, one labelled row per category.
    const labelW = 64;
    const perRow = Math.max(...SKILL_CATEGORIES.map((cat) => SKILLS.filter((sk) => sk.category === cat).length));
    const tileW = (SW - labelW - (perRow - 1) * 10) / perRow;
    const tileH = 38;
    const rowStep = tileH + 4;
    const gridY = top + 106;
    SKILL_CATEGORIES.forEach((cat, row) => {
      const ry = gridY + row * rowStep;
      c.add(txt(this, SX, ry + tileH / 2, T().skillCategory(cat), 16, C.goldHex, { title: true, bold: true, origin: [0, 0.5] }));
      SKILLS.filter((sk) => sk.category === cat).forEach((sk, col) => {
        const tx = SX + labelW + col * (tileW + 10);
        const on = slot.skills.includes(sk.id);
        const g = this.add.graphics();
        drawFrame(g, tx, ry, tileW, tileH, { fill: on ? 0x2a2412 : C.panelHi, border: on ? C.gold : C.border, radius: 8 });
        c.add(g);
        drawSkillIcon(this, c, tx + 22, ry + tileH / 2, 14, sk);
        c.add(txt(this, tx + 42, ry + 12, T().skillName(sk), 13, C.text, { bold: true, origin: [0, 0.5] }));
        c.add(txt(this, tx + 42, ry + 27, T().skillCostShort(sk.peCost, sk.cooldown), 10, C.dim, { origin: [0, 0.5] }));
        if (on) c.add(txt(this, tx + tileW - 12, ry + 12, '✔', 13, C.goldHex, { origin: 0.5 }));
        m.nav.add({
          id: `s-${sk.id}`, x: tx, y: ry, w: tileW, h: tileH,
          onEnter: () => {
            const r = toggleSkill(slot, sk.id);
            if (r === 'full') {
              sfx.menuError();
              toast(this, T().skillsFull);
              return;
            }
            sfx.menuChange();
            saveSettings();
            m.rebuild();
          },
        });
      });
    });

    // Detail line for whatever is focused.
    const detailY = gridY + SKILL_CATEGORIES.length * rowStep + 2;
    const dg = this.add.graphics();
    // Room for three lines: the summon skills' descriptions are the longest.
    const detailH = 62;
    dg.fillStyle(C.well, 1).fillRoundedRect(SX, detailY, SW, detailH, 8);
    c.add(dg);
    const detail = txt(this, SX + 14, detailY + detailH / 2, '', 12, C.text, { origin: [0, 0.5], wrap: SW - 28 });
    c.add(detail);
    const describe = (sk: Skill | null) =>
      sk ? `${T().skillName(sk)}：${T().skillDesc(sk)}  ${T().skillCost(sk.peCost, sk.cooldown)}` : T().equipHint;

    // Keys (keyboard players only).
    const keysY = detailY + detailH + 8;
    c.add(txt(this, SX, keysY + 14, T().keysSection, 18, C.goldHex, { title: true, bold: true, origin: [0, 0.5] }));
    if (isKeySet(slot.control)) {
      const set = slot.control;
      // Movement keys under the heading, then one box per rebindable action.
      c.add(txt(this, SX, keysY + 34, `${T().moveLabel(set)}`, 11, C.dim, { origin: [0, 0.5] }));
      for (let n = 0; n < slot.binds.length; n++) {
        const bw = (SW - 70 - (slot.binds.length - 1) * 6) / slot.binds.length;
        const bx = SX + 70 + n * (bw + 6);
        const waiting = this.bindingIdx === n;
        const g = this.add.graphics();
        drawFrame(g, bx, keysY, bw, 44, { fill: waiting ? 0x4a3f12 : C.panelHi, border: waiting ? C.gold : C.border, radius: 6 });
        c.add(g);
        c.add(txt(this, bx + bw / 2, keysY + 12, T().bindNames[n], 11, C.dim, { origin: 0.5 }));
        c.add(txt(this, bx + bw / 2, keysY + 30, waiting ? T().pressKey : keyLabel(slot.binds[n]), waiting ? 13 : 17, waiting ? C.goldHex : C.text, { bold: true, origin: 0.5 }));
        m.nav.add({ id: `k${n}`, x: bx, y: keysY, w: bw, h: 44, onEnter: () => this.beginBinding(m, i, n) });
      }
    } else {
      c.add(txt(this, SX + 60, keysY + 22, slot.control === 'cpu' ? T().cpuHelp : T().padHelp, 13, C.dim, { origin: [0, 0.5] }));
    }

    addButton(this, c, m.nav, { id: 'done', x: m.x + m.w - 120, y: m.y + m.h - 44, w: 180, h: 46, label: T().done, primary: true, onPress: () => m.close() });

    m.nav.onFocus = (id) => {
      if (id.startsWith('w')) drawPreview(WEAPONS[Number(id.slice(1))]);
      else drawPreview(WEAPONS[slot.weapon]);
      if (id.startsWith('s-')) detail.setText(describe(skillById(id.slice(2))));
      else if (id.startsWith('e')) detail.setText(describe(skillById(slot.skills[Number(id.slice(1))])));
      else detail.setText(T().equipHint);
    };
    drawPreview(WEAPONS[slot.weapon]);
    if (!m.nav.current) m.nav.current = `w${slot.weapon}`;
  }

  /** Wait for the next key press and bind it to action n (0 = attack, 1–3 = skills, 4 = use item, 5 = next item). */
  private beginBinding(m: Modal, i: number, n: number) {
    sfx.menuChange();
    const slot = getSettings().slots[i];
    this.bindingIdx = n;
    m.rebuild();
    this.keyCapture = (e) => {
      const code = e.keyCode;
      const finish = () => {
        this.keyCapture = null;
        this.bindingIdx = null;
        m.rebuild();
      };
      if (code === K.ESC) return finish();
      if (RESERVED_KEYS.has(code)) return void toast(this, T().reservedKey);
      if (isKeySet(slot.control) && KEY_SETS[slot.control].move.includes(code)) return void toast(this, T().isMoveKey(keyLabel(code), i + 1));
      const other = getSettings().slots.findIndex((s, j) => j !== i && keysOf(s).includes(code));
      if (other >= 0) return void toast(this, T().usedBy(keyLabel(code), other + 1));
      // Picking a key this player already uses for another action swaps the two.
      const own = slot.binds.indexOf(code);
      if (own >= 0) slot.binds[own] = slot.binds[n];
      slot.binds[n] = code;
      sfx.menuChange();
      saveSettings();
      finish();
    };
  }
}
