import { DISPLAY_ACTIONS, SKILL_ACTIONS, skillAction } from '@/input/actions';
import * as Phaser from 'phaser';
import { connectedPads, halfLabels, halfName, labelsForPad, padKind, padLabels, padName } from '@/input/gamepads';
import { isSplit, resolvePad } from '@/input/padSettings';
import { directLabels, hidPad, hidPads, isProPad } from '@/input/nintendoHid';
import { isQuestMode, isStoredQuestRoute, prepareQuest, questStageNumber, rollQuestRoute, DIFFICULTIES, HEIGHT, MAX_PLAYERS, PLAYER_COLORS, QUEST, QUEST_BOSSES, QUEST_FIGHTS, QUEST_SEMIFINALS, QUEST_RULES, QUEST_TACTICS, TEAM_COLORS, WEAPON_AREA, WIDTH } from '@/config';
import { KEY_SETS, isKeySet, keyLabel } from '@/input/keyboard';
import { MAX_PAD_SLOTS, parsePad } from '@/input/controllerIds';
import { type ControlId } from '@/input/contracts';
import { applyQuestRule, questFactions, questRuleOf, questSideOf } from '@/battle/quest/factions';
import { T } from '@/localization';
import { getSettings, assignSkill, keysOf, randomizeTeams, saveSettings, setControl, toggleSkill, usesTeams, validate, type SlotConfig } from '@/state/gameSettings';
import { sfx } from '@/audio/sfx';
import { SKILLS, SKILL_CATEGORIES, SKILL_SLOTS, skillById, skillCooldownFor, type Skill } from '@/gameplay/skills';
import {
  C, FocusNav, Petals, UIScene, addBackdrop, addButton, addSelector, drawFrame, drawSkillIcon, toHex, toast, txt, type Modal,
} from '@/ui';
import { drawWeaponIcon } from '@/rendering/fighterArt';
import { drawLobbyCrest, drawLobbyDie, drawLobbyPortrait, drawRosterFrame } from '@/rendering/menuArt';
import { addArenaTexture, getMap } from '@/maps';
import { ROLES, roleById } from '@/gameplay/roles';
import { WEAPONS, drawShape, shapeArea, type Weapon } from '@/gameplay/weapons';
import type { QuestState } from '@/battle/types';

/** Free rule: the stage the run starts on (null = a normal run from the first stage). Kept while the game is open. */
let freeStage: number | null = null;

export interface LobbySceneData {
  /** The failed stage's starting checkpoint, preserved while editing the party. */
  retryQuest?: QuestState;
  slots?: SlotConfig[];
  /** The route shown in the lobby, so leaving for controller setup does not re-roll it. */
  questRoute?: number[];
}

// Two rows of four cards, below a separate header and settings bar.
const CARD_COLS = 4;
const CARD_GAP = 12;
const CARD_W = Math.floor((WIDTH - 60 - (CARD_COLS - 1) * CARD_GAP) / CARD_COLS);
const CARD_H = 226;
/** Loadout window: height of one row in the weapon list. */
const WEAPON_ROW = 34;
const CARD_Y = 154;
const cardX = (i: number) => 30 + (i % CARD_COLS) * (CARD_W + CARD_GAP);
const cardY = (i: number) => CARD_Y + Math.floor(i / CARD_COLS) * (CARD_H + CARD_GAP);

/** A small mark for one quest step: blades, a maze, or the final mask. */
function drawPhaseIcon(g: Phaser.GameObjects.Graphics, phase: number, x: number, y: number, color: number) {
  g.lineStyle(1, color, 0.35).strokeCircle(x, y, 34);
  if (phase === 0) {
    g.lineStyle(3, color, 0.9).lineBetween(x - 16, y + 14, x + 8, y - 16).lineBetween(x - 8, y + 16, x + 16, y - 14);
    g.lineStyle(2, color, 0.55).lineBetween(x - 18, y - 8, x - 8, y - 16).lineBetween(x + 10, y + 16, x + 18, y + 8);
  } else if (phase === 1) {
    g.lineStyle(2, color, 0.85);
    g.strokeRect(x - 16, y - 16, 32, 32);
    g.strokeRect(x - 8, y - 8, 16, 16);
    g.lineBetween(x - 16, y, x - 8, y);
    g.lineBetween(x, y - 16, x, y - 8);
    g.lineBetween(x + 8, y, x + 16, y);
  } else if (phase === 2) {
    // Three heads on three necks.
    g.lineStyle(4, color, 0.75);
    for (const dx of [-14, 0, 14]) g.lineBetween(x, y + 16, x + dx, y - 6 - (dx === 0 ? 6 : 0));
    g.fillStyle(color, 0.95);
    for (const dx of [-14, 0, 14]) g.fillCircle(x + dx, y - 8 - (dx === 0 ? 6 : 0), 6);
    g.fillCircle(x, y + 16, 8);
  } else {
    g.fillStyle(color, 0.9).fillCircle(x, y + 4, 12);
    g.fillTriangle(x - 14, y + 2, x - 8, y - 16, x - 2, y + 2);
    g.fillTriangle(x + 14, y + 2, x + 8, y - 16, x + 2, y + 2);
    g.fillStyle(0x1b140c, 1).fillCircle(x - 4, y + 2, 2).fillCircle(x + 4, y + 2, 2);
  }
}

const K = Phaser.Input.Keyboard.KeyCodes;
/** Keys the menus / battle already use, so they can't be bound. */
const RESERVED_KEYS = new Set<number>([K.ENTER, K.ESC]);

/**
 * The control choices to cycle through: keyboards, CPU and Off, plus only the gamepads and Joy-Cons that are connected
 * right now. A Joy-Con pair that the system joined into one controller also offers its left and right halves as two
 * separate players (listed right after that pad).
 */
export function controlOptions(current: ControlId): ControlId[] {
  const connected = new Set(connectedPads().map((p) => p.index + 1));
  const split = new Set(connectedPads().filter((p) => isSplit(p)).map((p) => p.index + 1));
  const out: ControlId[] = ['off', 'kb1', 'kb2', 'kb3', 'kb4'];
  for (let n = 1; n <= MAX_PAD_SLOTS; n++) {
    // Only controllers that are actually connected are offered (plus the one already chosen, so it can be seen and changed).
    const here = current.startsWith(`pad${n}`);
    if (connected.has(n) || here) out.push(`pad${n}` as ControlId);
    if (split.has(n) || (here && current.length === 5)) out.push(`pad${n}L` as ControlId, `pad${n}R` as ControlId);
  }
  // Joy-Cons connected directly (WebHID): the Nth one connected.
  const direct = hidPads().filter((p) => p.connected).length;
  for (let n = 1; n <= 4; n++) if (n <= direct || current === `hid${n}`) out.push(`hid${n}` as ControlId);
  out.push('cpu');
  return out;
}

export class LobbyScene extends UIScene {
  private layer!: Phaser.GameObjects.Container;
  private nav!: FocusNav;
  private petals!: Petals;
  /** Loadout window: which key box (0 = attack, 1–3 = skills, 4–5 = items) is waiting for a key press. */
  private bindingIdx: number | null = null;
  private loadout: { index: number; modal: Modal } | null = null;
  private retryQuest: QuestState | null = null;
  /** Stage ids for the quest run this lobby is preparing. */
  private questRoute: number[] = [];

  constructor() {
    super('Lobby');
  }

  init(data: LobbySceneData = {}) {
    this.loadout = null;
    this.retryQuest = data.retryQuest ? structuredClone(data.retryQuest) : null;
    if (this.retryQuest) {
      const settings = getSettings();
      settings.mode = 'quest';
      settings.questRule = questRuleOf(this.retryQuest);
      if (data.slots) settings.slots = structuredClone(data.slots);
      applyQuestRule(settings.slots, settings.questRule);
      saveSettings();
      const prepared = prepareQuest(this.retryQuest);
      this.retryQuest.route = prepared.route;
      this.retryQuest.stage = prepared.stage;
      this.retryQuest.campaign = 'quest';
      this.questRoute = prepared.route;
    } else if (isQuestMode(getSettings().mode)) {
      this.questRoute = isStoredQuestRoute(data.questRoute) ? [...data.questRoute!] : rollQuestRoute();
    } else {
      this.questRoute = [];
    }
    // Phaser reuses the last scene payload when the next start passes none. Drop it, or returning
    // home and opening the lobby again would reload this stage's old slots over the saved config.
    if (this.sys?.settings) this.sys.settings.data = {};
  }

  /** Player setup is global. Leaving this screen keeps whatever was changed. */
  private leaveLobby() {
    saveSettings();
    if (this.sys?.settings) this.sys.settings.data = {};
    this.scene.start('Mode');
  }

  create() {
    this.setupUI();
    this.bindingIdx = null;
    addBackdrop(this, 0.8);
    this.petals = new Petals(this, { x: 0, y: 0, w: WIDTH, h: HEIGHT }, 12);
    this.layer = this.add.container(0, 0);
    this.nav = new FocusNav(this);
    this.nav.onBack = () => this.leaveLobby();
    this.pushNav(this.nav);
    this.build();
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

    const active = (isQuestMode(s.mode) ? s.slots.slice(0, QUEST.partySlots) : s.slots).filter((slot) => slot.control !== 'off').length;
    const header = this.add.graphics();
    drawLobbyCrest(header, 55, 39, 25);
    header.fillStyle(0x172230, 1).fillRoundedRect(WIDTH - 236, 23, 206, 34, 17);
    header.fillStyle(validate(s) ? C.gold : 0x8ac79f, 1).fillCircle(WIDTH - 216, 40, 3);
    this.layer.add(header);
    this.layer.add(txt(this, 94, 30, this.retryQuest ? T().questEdit : T().lobbyTitle, 27, C.text, { title: true, bold: true, origin: [0, 0.5] }));
    const questHint = s.questRule === 'hell' ? T().hellHint : s.questRule === 'free' ? T().questFactionHint : T().questStandardHint;
    this.layer.add(txt(this, 96, 55, isQuestMode(s.mode) ? questHint : 'S H A D O W  &  S T E E L', 10, C.dim, { origin: [0, 0.5] }));
    this.layer.add(txt(this, WIDTH / 2, 39, this.retryQuest ? T().questRetrySetup(questStageNumber(this.questRoute, this.retryQuest.stage)) : T().lobbyTagline, 15, '#bba983', { title: true, origin: 0.5 }));
    this.layer.add(txt(this, WIDTH - 124, 40, T().lobbyCount(active, isQuestMode(s.mode) ? QUEST.partySlots : MAX_PLAYERS), 13, C.text, { bold: true, origin: 0.5 }));

    const chip = (id: string, x: number, w: number, label: string, value: string, action?: () => void, valueColor = C.text) => {
      const g = this.add.graphics();
      g.fillStyle(0x17202e, 0.98).fillRoundedRect(x, 91, w, 46, 8);
      g.lineStyle(1, 0x435069, 0.7).strokeRoundedRect(x, 91, w, 46, 8);
      this.layer.add(g);
      this.layer.add(txt(this, x + 14, 102, label, 10, C.dim, { origin: [0, 0.5] }));
      this.layer.add(txt(this, x + 14, 122, value, 17, valueColor, { bold: true, origin: [0, 0.5] }));
      if (action) {
        this.layer.add(txt(this, x + w - 18, 114, '›', 23, C.goldHex, { origin: 0.5 }));
        this.nav.add({ id, x, y: 91, w, h: 46, onEnter: action, radius: 8 });
      }
    };
    chip('mode', 30, 250, T().mode, T().modeNames(s.mode), this.retryQuest ? undefined : () => this.scene.start('Mode'));

    const cycleDifficulty = () => {
      s.difficulty = DIFFICULTIES[(DIFFICULTIES.indexOf(s.difficulty) + 1) % DIFFICULTIES.length];
      saveSettings();
      sfx.menuChange();
      this.build();
    };
    chip('difficulty', 292, 190, T().difficulty, T().difficultyNames[s.difficulty], cycleDifficulty, s.difficulty === 'hard' ? '#ef9b7b' : C.text);

    // Team modes: deal everyone into teams at random.
    if (usesTeams(s.mode)) {
      addButton(this, this.layer, this.nav, {
        id: 'shuffle', x: 598, y: 114, w: 200, h: 46, label: T().randomTeams, size: 15,
        onPress: () => {
          randomizeTeams(s.slots);
          saveSettings();
          this.build();
        },
      });
    }

    if (isQuestMode(s.mode)) {
      const cycleRule = () => {
        s.questRule = QUEST_RULES[(QUEST_RULES.indexOf(s.questRule) + 1) % QUEST_RULES.length];
        applyQuestRule(s.slots, s.questRule);
        saveSettings();
        sfx.menuChange();
        this.build();
      };
      const ruleColor = s.questRule === 'hell' ? '#eea08e' : s.questRule === 'free' ? '#e2c48b' : C.text;
      chip('quest-side', 496, 200, T().questSide, T().questRules[s.questRule], this.retryQuest ? undefined : cycleRule, ruleColor);
    }
    const mapX = usesTeams(s.mode) || isQuestMode(s.mode) ? 710 : 496;
    const mapW = WIDTH - 30 - mapX;
    const freePick = this.picksStage();
    const questMap = this.retryQuest ? getMap(QUEST.maps[this.retryQuest.stage]) : freePick && freeStage !== null ? getMap(QUEST.maps[freeStage]) : null;
    const mapLabel = isQuestMode(s.mode) ? questMap ? T().mapName(questMap) : freePick ? T().questStageAll : T().questMaps : s.mapId === 'random' ? T().randomShort : T().mapName(getMap(s.mapId));
    const mapAction = !isQuestMode(s.mode) ? () => this.scene.start('Map') : freePick ? () => this.openStagePicker() : undefined;
    chip('map', mapX, mapW, freePick ? T().questStagePickLabel : T().map, mapLabel, mapAction);
    const preview = isQuestMode(s.mode) ? questMap : getMap(s.mapId === 'random' ? undefined : s.mapId);
    if (preview) {
      this.layer.add(this.add.image(WIDTH - 105, 114, addArenaTexture(this, preview)).setDisplaySize(98, 42));
      const previewTrim = this.add.graphics();
      previewTrim.lineStyle(1, C.gold, 0.35).strokeRect(WIDTH - 154, 93, 98, 42);
      this.layer.add(previewTrim);
    }

    s.slots.forEach((slot, i) => {
      if (isQuestMode(s.mode) && i >= QUEST.partySlots) return;
      this.buildCard(slot, i);
    });
    if (isQuestMode(s.mode)) this.drawQuestStages();

    const footer = this.add.graphics();
    footer.fillStyle(0x121b29, 0.98).fillRoundedRect(30, 638, WIDTH - 60, 62, 10);
    footer.lineStyle(1, 0x9ba8bc, 0.1).lineBetween(48, 638, WIDTH - 48, 638);
    // A cut-corner battle banner and its crossed-blade seal anchor the action area.
    footer.fillStyle(0x81342e, 1).fillPoints([{ x: 1016, y: 645 }, { x: 1240, y: 645 }, { x: 1240, y: 680 }, { x: 1228, y: 692 }, { x: 1016, y: 692 }] as Phaser.Math.Vector2[], true);
    footer.lineStyle(1, C.gold, 0.6).lineBetween(1020, 645, 1236, 645);
    drawLobbyCrest(footer, 1043, 668, 17);
    this.layer.add(footer);
    const launchLabel = txt(this, 1150, 668, `${this.retryQuest ? T().questRetry : T().fightStart}  ›`, 25, '#ffe8c1', { title: true, bold: true, origin: 0.5 });
    launchLabel.setScale(Math.min(1, 168 / launchLabel.width));
    this.layer.add(launchLabel);
    this.nav.add({ id: 'fight', x: 1016, y: 645, w: 224, h: 47, onEnter: () => this.startBattle(), radius: 7 });
    addButton(this, this.layer, this.nav, { id: 'pads', x: 323, y: 668, w: 230, h: 36, label: T().padOpen, size: 15, onPress: () => this.scene.start('Pads', { from: 'Lobby', fromData: { ...(this.retryQuest ? { retryQuest: this.retryQuest } : {}), ...(this.questRoute.length ? { questRoute: this.questRoute } : {}) } }) });
    addButton(this, this.layer, this.nav, { id: 'back', x: 116, y: 668, w: 140, h: 36, label: `‹  ${T().back}`, size: 16, onPress: () => this.leaveLobby() });
    const connected = connectedPads().length + hidPads().filter((p) => p.connected).length;
    this.layer.add(txt(this, 482, 658, connected ? T().lobbyControllers(connected) : T().noPads, 12, C.dim, { origin: [0, 0.5] }));
    this.layer.add(txt(this, 482, 681, T().lobbyControllerHint, 11, C.faint, { origin: [0, 0.5] }));
    this.layer.add(txt(this, WIDTH / 2, 712, T().confirmHint, 10, C.faint, { origin: 0.5 }));
    this.nav.done('c0-control');
  }

  /** Four steps: one fight, two tactics, a dragon semi-final, the finale. The rolled maps stay hidden until each stage begins. */
  private drawQuestStages() {
    const phases = T().questPhases();
    const gap = 16;
    const n = phases.length;
    const y = cardY(QUEST.partySlots);
    const w = Math.floor((WIDTH - 60 - (n - 1) * gap) / n);
    const here = this.retryQuest ? this.questRoute.indexOf(this.retryQuest.stage) : -1;
    const stage = here >= 0 ? this.retryQuest?.stage : this.picksStage() ? freeStage ?? undefined : undefined;
    const current = stage === undefined ? -1
      : (QUEST_FIGHTS as readonly number[]).includes(stage) ? 0
      : QUEST_SEMIFINALS.includes(stage) ? 2
      : (QUEST_BOSSES as readonly number[]).includes(stage) ? 3
      : 1;
    const tones = [0xc45b52, 0xc4a36a, 0xe07a4a, 0xd2b15a];
    phases.forEach((phase, index) => {
      const x = 30 + index * (w + gap);
      const color = tones[index] ?? 0xb69d7b;
      const active = index === current;
      const eg = this.add.graphics();
      drawRosterFrame(eg, x, y, w, CARD_H, color, !active && current >= 0);
      drawPhaseIcon(eg, index, x + w / 2, y + 78, color);
      const dots = [1, 2, 1, 1][index] ?? 1;
      for (let k = 0; k < dots; k++) {
        const cx = x + w / 2 + (k - (dots - 1) / 2) * 16;
        eg.fillStyle(color, 0.85).fillCircle(cx, y + 198, 3.5);
      }
      this.layer.add(eg);
      this.layer.add(txt(this, x + 16, y + 20, T().questPhaseLabel(index + 1), 13, '#bba18b', { bold: true, origin: [0, 0.5] }));
      const name = txt(this, x + w / 2, y + 124, phase.name, 22, '#e6d7c4', { title: true, bold: true, origin: 0.5 });
      name.setScale(Math.min(1, (w - 36) / Math.max(1, name.width)));
      this.layer.add(name);
      const detail = txt(this, x + w / 2, y + 150, phase.detail, 13, C.dim, { wrap: w - 48, align: 'center', origin: [0.5, 0] });
      this.layer.add(detail);
      if (active) this.layer.add(txt(this, x + w - 16, y + 20, this.retryQuest ? T().questPhaseMark : T().questPhaseStart, 12, '#e2c48b', { bold: true, origin: [1, 0.5] }));
    });
  }

  private buildCard(slot: SlotConfig, i: number) {
    const s = getSettings();
    const x = cardX(i);
    const y = cardY(i);
    const color = PLAYER_COLORS[i];
    const off = slot.control === 'off';
    const cpu = slot.control === 'cpu';
    const L = this.layer;
    const inner = CARD_W - 24;

    const g = this.add.graphics();
    drawRosterFrame(g, x, y, CARD_W, CARD_H, color, off);
    L.add(g);
    L.add(txt(this, x + 15, y + 19, `P${i + 1}`, 19, off ? C.faint : toHex(color), { bold: true, origin: [0, 0.5] }));
    if (!off) {
      L.add(txt(this, x + 53, y + 19, cpu ? T().cpuTag : T().roleName(roleById(slot.role)), 13, '#c0b7a6', { bold: true, origin: [0, 0.5] }));
    }

    const rebuild = () => {
      saveSettings();
      this.build();
    };

    addSelector(this, L, this.nav, {
      id: `c${i}-control`, x: x + 12, y: y + 44, w: inner, h: 28, labelW: 0, label: '', value: T().controls(slot.control),
      onAdjust: (d) => {
        const options = controlOptions(slot.control);
        const ci = options.indexOf(slot.control);
        setControl(slot, options[(ci + d + options.length) % options.length]);
        rebuild();
      },
    });
    const padSel = parsePad(slot.control);
    if (padSel) {
      // Which controller is on this slot (or a hint to wake one up).
      const pad = resolvePad(padSel.index);
      const label = pad?.connected ? (padSel.side ? halfName(padSel.side) : padName(padKind(pad.id))) : T().pressPadButton;
      L.add(txt(this, x + CARD_W / 2, y + 79, label, 10, C.goldHex, { origin: 0.5 }));
    }
    const hidSel = /^hid(\d)$/.exec(slot.control);
    if (hidSel) {
      const j = hidPad(Number(hidSel[1]));
      const name = j ? (isProPad(j) ? T().hidProName : `Joy-Con (${j.side})`) : '';
      L.add(txt(this, x + CARD_W / 2, y + 79, j ? `${name} ⚡${j.slow ? ` ⚠ ${j.rate} Hz` : ''}` : T().hidMissing, 10, j?.slow ? '#ff8a8a' : C.goldHex, { origin: 0.5 }));
    }
    if (off) {
      g.lineStyle(1, 0x68788d, 0.24).strokeCircle(x + CARD_W / 2, y + 130, 29);
      g.lineStyle(1, 0x68788d, 0.12).strokeCircle(x + CARD_W / 2, y + 130, 36);
      g.lineStyle(2, 0x8091a6, 0.5).lineBetween(x + CARD_W / 2 - 10, y + 130, x + CARD_W / 2 + 10, y + 130);
      g.lineBetween(x + CARD_W / 2, y + 120, x + CARD_W / 2, y + 140);
      L.add(txt(this, x + CARD_W / 2, y + 180, T().notJoined, 18, C.faint, { title: true, origin: 0.5 }));
      L.add(txt(this, x + CARD_W / 2, y + 207, T().joinHint, 11, '#627187', { origin: 0.5 }));
      return;
    }

    if (isQuestMode(s.mode)) {
      const side = s.questRule === 'free' ? questSideOf(slot, 'heroes') : s.questRule;
      const bx = x + CARD_W - 112;
      const tint = side === 'hell' ? 0xe1877c : 0x82c9bc;
      const choosing = s.questRule === 'free' && !this.retryQuest;
      g.fillStyle(tint, 0.15).fillRoundedRect(bx, y + 8, 100, 22, 11);
      L.add(txt(this, bx + 50, y + 19, `${T().questSides[side]}${choosing ? ' ›' : ''}`, 10, toHex(tint), { bold: true, origin: 0.5 }));
      if (choosing) {
        const cycleSide = () => { slot.questSide = side === 'hell' ? 'heroes' : 'hell'; rebuild(); };
        this.nav.add({ id: `c${i}-faction`, x: bx, y: y + 8, w: 100, h: 22, onEnter: cycleSide, onAdjust: cycleSide, radius: 11 });
      }
    } else if (usesTeams(s.mode)) {
      const bx = x + CARD_W - 94;
      g.fillStyle(TEAM_COLORS[slot.team], 0.12).fillRoundedRect(bx, y + 8, 80, 22, 11);
      g.fillStyle(TEAM_COLORS[slot.team], 0.85).fillCircle(bx + 12, y + 19, 3);
      L.add(txt(this, bx + 45, y + 19, `${T().teamNames[slot.team]}  ›`, 11, toHex(TEAM_COLORS[slot.team]), { bold: true, origin: 0.5 }));
      const cycleTeam = () => { slot.team = 1 - slot.team; rebuild(); };
      this.nav.add({ id: `c${i}-team`, x: bx, y: y + 8, w: 80, h: 22, onEnter: cycleTeam, onAdjust: cycleTeam, radius: 11 });
    } else {
      L.add(txt(this, x + CARD_W - 16, y + 19, cpu ? 'AUTO' : T().lobbyPlayer, 10, C.faint, { bold: true, origin: [1, 0.5] }));
    }

    drawLobbyPortrait(g, x + 58, y + 124, 33, color, cpu ? 'shinobi' : slot.role);
    if (cpu) {
      // The weapon silhouettes and dice show a fresh random loadout each round.
      const weapons = this.add.graphics();
      for (let k = 0; k < 3; k++) {
        const cx = x + 133 + k * 56;
        weapons.fillStyle(0x0e1723, 1).fillRoundedRect(cx - 22, y + 91, 44, 43, 7);
        drawWeaponIcon(weapons, (['fan', 'ninjato', 'hammer'] as const)[k], cx, y + 112, 27, color);
      }
      drawLobbyDie(weapons, x + 125, y + 168, 24, color);
      L.add(weapons);
      L.add(txt(this, x + 150, y + 167, T().randomLoadout, 12, C.dim, { origin: [0, 0.5], wrap: CARD_W - 165 }));
      g.lineStyle(1, color, 0.12).lineBetween(x + 14, y + 198, x + CARD_W - 14, y + 198);
      L.add(txt(this, x + CARD_W / 2, y + 211, T().lobbyAutoGear, 10, C.faint, { origin: 0.5 }));
      return;
    }

    // Weapon showcase with role vitals, next to the illustrated portrait.
    const w = WEAPONS[slot.weapon];
    const icon = this.add.graphics();
    drawWeaponIcon(icon, w.id, x + 123, y + 112, 28, color);
    L.add(icon);
    L.add(txt(this, x + 147, y + 93, T().weaponSection, 9, C.faint, { origin: [0, 0.5] }));
    const weaponName = txt(this, x + 147, y + 112, T().weaponName(w), 16, C.text, { title: true, bold: true, origin: [0, 0.5] });
    weaponName.setScale(Math.min(1, (CARD_W - 160) / weaponName.width));
    L.add(weaponName);
    const role = roleById(slot.role);
    for (const [n, label, value, tint] of [
      [0, 'HP', Math.round(role.maxHp * (isQuestMode(s.mode) ? QUEST.partyHp : 1)), 0xce7b7b],
      [1, 'PE', role.maxPe, 0xc4aa6b],
    ] as const) {
      const bx = x + 107 + n * 90;
      L.add(txt(this, bx, y + 143, `${label} ${value}`, 10, n === 0 ? '#c68a8a' : '#c9b17e', { origin: [0, 0.5] }));
      g.fillStyle(tint, 0.15).fillRoundedRect(bx, y + 152, 78, 3, 1);
      g.fillStyle(tint, 0.65).fillRoundedRect(bx, y + 152, 78 * Math.min(1, value / 160), 3, 1);
    }

    // Equipped skill badges, rather than loose icons floating on the card.
    const step = inner / SKILL_SLOTS;
    for (let k = 0; k < SKILL_SLOTS; k++) {
      const sk = skillById(slot.skills[k]);
      const sx = x + 12 + step * k;
      g.fillStyle(0x0c1521, 0.7).fillRoundedRect(sx, y + 165, step - 4, 25, 5);
      drawSkillIcon(this, L, sx + 13, y + 177, 9, sk);
      const label = txt(this, sx + 27, y + 177, sk ? T().skillName(sk) : T().emptySkill, 11, sk ? '#c8ced6' : C.faint, { origin: [0, 0.5] });
      label.setScale(Math.min(1, (step - 35) / label.width));
      L.add(label);
    }

    addButton(this, L, this.nav, { id: `c${i}-edit`, x: x + CARD_W / 2, y: y + CARD_H - 20, w: inner, h: 27, label: `${T().editLoadout}  ›`, size: 13, onPress: () => this.openLoadout(i) });
  }

  private bindLabel(slot: SlotConfig, n: number) {
    if (isKeySet(slot.control)) return keyLabel(slot.binds[n]);
    const hid = /^hid(\d)$/.exec(slot.control);
    if (hid) return directLabels(hidPad(Number(hid[1])))[n];
    const sel = parsePad(slot.control);
    if (sel) {
      if (sel.side) return halfLabels(sel.side)[n];
      return labelsForPad(resolvePad(sel.index))[n];
    }
    return '';
  }

  /** Free rule (not a retry): the players may start the run on any stage. */
  private picksStage() {
    const s = getSettings();
    return isQuestMode(s.mode) && s.questRule === 'free' && !this.retryQuest;
  }

  /** Every stage, grouped by its step; the run starts on the chosen one and carries on from there. */
  private openStagePicker() {
    this.openModal({
      w: 1120,
      h: 520,
      title: T().questStagePick,
      onClose: () => this.build(),
      build: (m) => {
        const choose = (stage: number | null) => {
          freeStage = stage;
          sfx.menuChange();
          m.close();
        };
        addButton(this, m.content, m.nav, { id: 'stage-all', x: WIDTH / 2, y: m.y + 96, w: 320, h: 44, label: T().questStageAll, size: 17, primary: freeStage === null, onPress: () => choose(null) });
        const bands = [QUEST_FIGHTS, QUEST_TACTICS, QUEST_SEMIFINALS, QUEST_BOSSES];
        const phases = T().questPhases();
        const colW = (m.w - 80) / bands.length;
        bands.forEach((band, b) => {
          const cx = m.x + 40 + colW * b + colW / 2;
          m.content.add(txt(this, cx, m.y + 160, phases[b]?.name ?? '', 18, C.goldHex, { bold: true, origin: 0.5 }));
          band.forEach((stage, k) => addButton(this, m.content, m.nav, {
            id: `stage-${stage}`, x: cx, y: m.y + 210 + k * 54, w: colW - 24, h: 44, size: 16,
            label: T().mapName(getMap(QUEST.maps[stage])), primary: freeStage === stage, onPress: () => choose(stage),
          }));
        });
      },
    });
  }

  private startBattle() {
    const s = getSettings();
    // Every player on a gamepad needs it connected (press a button on it so the browser sees it).
    const active = isQuestMode(s.mode) ? s.slots.slice(0, QUEST.partySlots) : s.slots;
    const missing = active
      .map((sl, i) => ({ sel: parsePad(sl.control), hid: /^hid(\d)$/.exec(sl.control), i, off: sl.control === 'off' }))
      .filter((x) => !x.off && ((x.sel && !resolvePad(x.sel.index)) || (x.hid && !hidPad(Number(x.hid[1])))));
    const err = validate(s) ?? (missing.length ? T().padLost(missing.map((x) => `P${x.i + 1}`).join(' ')) : null);
    if (err) {
      sfx.menuError();
      toast(this, err);
      return;
    }
    if (isQuestMode(s.mode)) {
      const rule = this.retryQuest ? questRuleOf(this.retryQuest) : s.questRule;
      applyQuestRule(s.slots, rule);
      const side = questFactions(s.slots, rule === 'hell' ? 'hell' : 'heroes').side;
      saveSettings();
      sfx.start();
      const base = this.retryQuest
        ? structuredClone(this.retryQuest)
        : this.picksStage() && freeStage !== null ? { stage: freeStage }
        : (isStoredQuestRoute(this.questRoute) ? { stage: this.questRoute[0], route: [...this.questRoute], campaign: 'quest' as const } : undefined);
      this.scene.start('Loading', { slots: structuredClone(s.slots), mode: s.mode, mapId: s.mapId,
        quest: { ...base, ...prepareQuest(base), side, rule },
      });
      return;
    }
    saveSettings();
    sfx.start();
    this.scene.start('Loading', { slots: structuredClone(s.slots), mode: s.mode, mapId: s.mapId });
  }

  // ---------- loadout window ----------

  private openLoadout(i: number) {
    this.bindingIdx = null;
    const modal = this.openModal({
      w: 1220,
      h: 664,
      title: T().loadoutTitle(i + 1),
      titleColor: toHex(PLAYER_COLORS[i]),
      build: (m) => this.buildLoadout(m, i),
      onClose: () => {
        this.loadout = null;
        this.keyCapture = null;
        saveSettings();
        this.build();
      },
    });
    this.loadout = { index: i, modal };
  }

  /** Focus a skill and use the same button that will cast it during battle. */
  private assignFocusedSkill(slotIndex: number): boolean {
    if (!this.loadout || this.bindingIdx !== null) return false;
    const { index, modal } = this.loadout;
    const focus = modal.nav.current;
    if (!focus?.startsWith('s-')) return false;
    const slot = getSettings().slots[index];
    if (assignSkill(slot, focus.slice(2), slotIndex)) {
      saveSettings();
      sfx.menuChange();
      modal.rebuild();
    }
    return true;
  }

  protected onMenuPadAction(control: string, edges: readonly boolean[]): boolean {
    if (!this.loadout || getSettings().slots[this.loadout.index].control !== control) return false;
    const index = SKILL_ACTIONS.findIndex((action) => edges[action]);
    return index >= 0 && this.assignFocusedSkill(index);
  }

  protected onMenuKey(event: KeyboardEvent): boolean {
    if (!this.loadout || this.bindingIdx !== null) return false;
    const slot = getSettings().slots[this.loadout.index];
    if (!isKeySet(slot.control)) return false;
    const index = SKILL_ACTIONS.findIndex((action) => slot.binds[action] === event.keyCode);
    if (index < 0) return false;
    if (event.repeat) return !!this.loadout.modal.nav.current?.startsWith('s-');
    return this.assignFocusedSkill(index);
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
    const slotW = (SW - 12 * (SKILL_SLOTS - 1)) / SKILL_SLOTS;
    for (let k = 0; k < SKILL_SLOTS; k++) {
      const sk = skillById(slot.skills[k]);
      const ex = SX + k * (slotW + 12);
      const ey = top + 36;
      const g = this.add.graphics();
      drawFrame(g, ex, ey, slotW, 62, { fill: sk ? 0x2a2412 : C.well, border: sk ? C.gold : C.border, radius: 8 });
      c.add(g);
      drawSkillIcon(this, c, ex + 34, ey + 31, 21, sk);
      c.add(txt(this, ex + 66, ey + 22, sk ? T().skillName(sk) : T().emptySkill, 13, sk ? C.text : C.faint, { bold: true, origin: [0, 0.5] }));
      const key = this.bindLabel(slot, skillAction(k));
      if (key) c.add(txt(this, ex + 66, ey + 44, `${T().bindNames[skillAction(k)]}：${key}`, 12, C.dim, { origin: [0, 0.5] }));
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
        c.add(txt(this, tx + 42, ry + 27, T().skillCostShort(sk.peCost, skillCooldownFor(sk, role)), 10, C.dim, { origin: [0, 0.5] }));
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
      sk ? `${T().skillName(sk)}：${T().skillDesc(sk)}  ${T().skillCost(sk.peCost, skillCooldownFor(sk, role))}` : T().equipHint;

    // Keys (keyboard players only).
    const keysY = detailY + detailH + 8;
    c.add(txt(this, SX, keysY + 14, T().keysSection, 18, C.goldHex, { title: true, bold: true, origin: [0, 0.5] }));
    if (isKeySet(slot.control)) {
      const set = slot.control;
      // Movement keys under the heading, then one box per rebindable action.
      c.add(txt(this, SX, keysY + 34, `${T().moveLabel(set)}`, 11, C.dim, { origin: [0, 0.5] }));
      for (const [position, n] of DISPLAY_ACTIONS.entries()) {
        const bw = (SW - 70 - (slot.binds.length - 1) * 6) / slot.binds.length;
        const bx = SX + 70 + position * (bw + 6);
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
