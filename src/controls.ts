import * as Phaser from 'phaser';
import { halfLabels, padKind, padLabels, type PadSide } from './gamepads';
import { readController, resolvePad } from './padconfig';
import type { Fighter } from './Fighter';
import type { Projectile } from './scenes/BattleScene';
import type { SkillEffect } from './skills';
import { shapeHits, shapeHitsRect, shapeReach } from './weapons';

export interface Intent {
  mx: number;
  my: number;
  /** Optional explicit aim direction (gamepad right stick / AI). */
  ax: number;
  ay: number;
  /** Edge-triggered: true only on the frame the button is pressed. */
  attack: boolean;
  skills: [boolean, boolean, boolean];
  /** Use the selected pocket item / move the selection to the next item (edge-triggered). */
  useItem: boolean;
  nextItem: boolean;
  /** CPU only: use this pocket slot directly. */
  useItemAt?: number;
}

export const emptyIntent = (): Intent => ({ mx: 0, my: 0, ax: 0, ay: 0, attack: false, skills: [false, false, false], useItem: false, nextItem: false });

export interface WorldView {
  fighters: Fighter[];
  projectiles: Projectile[];
  /** Save the Princess: each team's wall to break (centre + size) while still standing. */
  objectives: { team: number; x: number; y: number; w: number; h: number }[];
  /** Treasure chests on the field (centre + size). */
  chests: { x: number; y: number; w: number; h: number }[];
  /** Watchtowers (team modes). */
  towers?: { team: number; x: number; y: number; w: number; h: number; alive: boolean }[];
  /** Siege: towers are the main objective. */
  siege?: boolean;
  /** The map's routing hint for CPU fighters (e.g. which bridge to take), if any. */
  route?: (fx: number, fy: number, tx: number, ty: number) => { x: number; y: number } | null;
  /** Shrinking barrier: the safe circle right now, if the map has one. */
  safe?: () => { x: number; y: number; r: number } | null;
  /** Healing herbs that are grown and ready to pick. */
  herbs?: () => { x: number; y: number }[];
}

export interface Controller {
  read(self: Fighter, world: WorldView, dt: number): Intent;
  /** Short key labels for attack, 3 skills, use item, next item; shown in the HUD. */
  labels: Labels;
  /** Gamepads only: false while the controller is not connected (asleep, out of range). */
  readonly connected?: boolean;
}

// ---------- control options shown in the menu ----------

/** Chrome offers up to 8 gamepad slots. */
export const MAX_PAD_SLOTS = 8;
export type PadSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type ControlId =
  | 'off' | 'kb1' | 'kb2' | 'kb3' | 'kb4' | 'cpu'
  | `pad${PadSlot}`
  /** One half of a Joy-Con pair that the system joined into a single controller (so the two halves are two players). */
  | `pad${PadSlot}${'L' | 'R'}`;

/** 'pad2R' → { index: 1, side: 'R' }; 'pad3' → { index: 2 }; anything else → null. */
export function parsePad(id: string): { index: number; side?: PadSide } | null {
  const m = /^pad(\d)([LR])?$/.exec(id);
  return m ? { index: Number(m[1]) - 1, side: m[2] as PadSide | undefined } : null;
}

/** The usual choices; the lobby adds gamepads beyond the first four (and Joy-Con halves) as they show up. */
export const CONTROL_OPTIONS: ControlId[] = ['off', 'kb1', 'kb2', 'kb3', 'kb4', 'pad1', 'pad2', 'pad3', 'pad4', 'cpu'];

const K = Phaser.Input.Keyboard.KeyCodes;

/** Key codes for [attack, skill 1, skill 2, skill 3]. Rebindable in the menu. */
/** Key codes for [attack, skill 1, skill 2, skill 3, use item, next item]. */
export type Binds = [number, number, number, number, number, number];
type Labels = [string, string, string, string, string, string];

export type KeySetId = 'kb1' | 'kb2' | 'kb3' | 'kb4';

interface KeySet {
  /** Movement keys are fixed per set: up, down, left, right. */
  move: [number, number, number, number];
  defaultBinds: Binds;
}

export const KEY_SETS: Record<KeySetId, KeySet> = {
  kb1: { move: [K.W, K.S, K.A, K.D], defaultBinds: [K.F, K.Q, K.E, K.R, K.G, K.C] },
  kb2: { move: [K.UP, K.DOWN, K.LEFT, K.RIGHT], defaultBinds: [K.FORWARD_SLASH, K.PERIOD, K.SEMICOLON, K.QUOTES, K.CLOSED_BRACKET, K.OPEN_BRACKET] },
  kb3: { move: [K.I, K.K, K.J, K.L], defaultBinds: [K.H, K.Y, K.U, K.O, K.N, K.B] },
  kb4: { move: [K.NUMPAD_EIGHT, K.NUMPAD_FIVE, K.NUMPAD_FOUR, K.NUMPAD_SIX], defaultBinds: [K.NUMPAD_ZERO, K.NUMPAD_ONE, K.NUMPAD_TWO, K.NUMPAD_THREE, K.NUMPAD_ADD, K.NUMPAD_SUBTRACT] },
};

export const isKeySet = (id: ControlId): id is KeySetId => id in KEY_SETS;

const META_LABEL = /Mac|iPhone|iPad/.test(navigator.userAgent) ? 'Cmd' : 'Win';
const KEY_LABEL_OVERRIDES: Record<number, string> = {
  [K.FORWARD_SLASH]: '/', [K.BACK_SLASH]: '\\', [K.PERIOD]: '.', [K.COMMA]: ',', [K.SEMICOLON]: ';',
  [K.QUOTES]: "'", [K.OPEN_BRACKET]: '[', [K.CLOSED_BRACKET]: ']', [K.MINUS]: '-', [K.PLUS]: '=',
  [K.BACKTICK]: '`', [K.UP]: '↑', [K.DOWN]: '↓', [K.LEFT]: '←', [K.RIGHT]: '→', [K.SPACE]: 'Space',
  [K.SHIFT]: 'Shift', [K.CTRL]: 'Ctrl', [K.ALT]: 'Alt', [K.TAB]: 'Tab', [K.BACKSPACE]: 'Bksp',
  [K.NUMPAD_ADD]: 'Num+', [K.NUMPAD_SUBTRACT]: 'Num-',
  // OS keys (left / right Cmd on Mac, Windows key elsewhere) aren't in Phaser's KeyCodes.
  91: META_LABEL, 92: META_LABEL, 93: META_LABEL,
  [K.ZERO]: '0', [K.ONE]: '1', [K.TWO]: '2', [K.THREE]: '3', [K.FOUR]: '4',
  [K.FIVE]: '5', [K.SIX]: '6', [K.SEVEN]: '7', [K.EIGHT]: '8', [K.NINE]: '9',
};
const NUMPAD_DIGITS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
NUMPAD_DIGITS.forEach((d, n) => { KEY_LABEL_OVERRIDES[K[`NUMPAD_${d}` as keyof typeof K]] = `Num${n}`; });
const KEY_NAMES = new Map<number, string>();
for (const [name, code] of Object.entries(K)) if (!KEY_NAMES.has(code)) KEY_NAMES.set(code, name);

export function keyLabel(code: number): string {
  return KEY_LABEL_OVERRIDES[code] ?? KEY_NAMES.get(code) ?? `#${code}`;
}

export function createController(scene: Phaser.Scene, id: ControlId, binds: Binds): Controller | null {
  if (id === 'off') return null;
  if (id === 'cpu') return new AIController();
  const pad = parsePad(id);
  if (pad) return new GamepadController(pad.index, pad.side);
  return new KeyboardController(scene, KEY_SETS[id as KeySetId].move, binds);
}

// ---------- keyboard ----------

class KeyboardController implements Controller {
  private keys: Record<'up' | 'down' | 'left' | 'right' | 'attack' | 's1' | 's2' | 's3' | 'use' | 'next', Phaser.Input.Keyboard.Key>;
  labels: Labels;

  constructor(scene: Phaser.Scene, move: KeySet['move'], binds: Binds) {
    const kb = scene.input.keyboard!;
    const [up, down, left, right] = move.map((c) => kb.addKey(c));
    const [attack, s1, s2, s3, use, next] = binds.map((c) => kb.addKey(c));
    this.keys = { up, down, left, right, attack, s1, s2, s3, use, next };
    this.labels = binds.map(keyLabel) as Labels;
  }

  read(): Intent {
    const k = this.keys;
    const jd = Phaser.Input.Keyboard.JustDown;
    return {
      mx: (k.right.isDown ? 1 : 0) - (k.left.isDown ? 1 : 0),
      my: (k.down.isDown ? 1 : 0) - (k.up.isDown ? 1 : 0),
      ax: 0, ay: 0,
      attack: jd(k.attack),
      skills: [jd(k.s1), jd(k.s2), jd(k.s3)],
      useItem: jd(k.use),
      nextItem: jd(k.next),
    };
  }
}

// ---------- gamepad ----------

class GamepadController implements Controller {
  private prev = [false, false, false, false, false, false];

  constructor(private index: number, private side?: PadSide) {}

  private get pad(): Gamepad | null {
    return resolvePad(this.index);
  }

  get connected() {
    return !!this.pad;
  }

  /** Button names follow whatever is plugged in (Xbox-style, Switch, or a sideways Joy-Con). */
  get labels(): Labels {
    return this.side ? halfLabels(this.side) : padLabels(padKind(this.pad?.id ?? ''));
  }

  read(): Intent {
    const pad = this.pad;
    if (!pad) return emptyIntent();
    const st = readController(pad, this.side);
    const edge = st.actions.map((v, i) => v && !this.prev[i]);
    this.prev = [...st.actions];
    return {
      mx: st.mx, my: st.my,
      ax: st.ax, ay: st.ay,
      attack: edge[0],
      skills: [edge[1], edge[2], edge[3]],
      useItem: edge[4],
      nextItem: edge[5],
    };
  }
}

// ---------- CPU ----------

/** Index of the first equipped skill whose effect is one of `kinds`, or -1. */
function slotWith(f: Fighter, ...kinds: SkillEffect['kind'][]): number {
  return f.skills.findIndex((s) => !!s && kinds.includes(s.effect.kind));
}

export class AIController implements Controller {
  labels: Labels = ['', '', '', '', '', ''];
  private thinkT = 0;
  private held = emptyIntent();
  private strafe = Math.random() < 0.5 ? 1 : -1;
  private stuckT = 0;
  /** Committed sidestep around an obstacle: time left and direction. */
  private detourT = 0;
  private detour = { x: 0, y: 0 };
  private detourFlipped = false;

  read(self: Fighter, world: WorldView, dt: number): Intent {
    this.thinkT -= dt;
    if (this.thinkT > 0) {
      // Keep moving between decisions, but don't re-press buttons.
      return { ...this.held, attack: false, skills: [false, false, false], useItemAt: undefined };
    }
    this.thinkT = 0.09 + Math.random() * 0.08;
    this.held = this.decide(self, world);
    return this.held;
  }

  private decide(self: Fighter, world: WorldView): Intent {
    const out = emptyIntent();
    // Vanished enemies can't be seen, so they're ignored.
    const enemies = world.fighters.filter((f) => self.isEnemy(f) && f.alive && (!f.hidden || (f.inFog && self.distTo(f) < 90)) && !f.untouchable);
    const obj = world.objectives.find((o) => o.team === self.team) ?? null;
    const chest = world.chests.length > 0
      ? world.chests.reduce((a, b) => (Math.hypot(a.x - self.x, a.y - self.y) < Math.hypot(b.x - self.x, b.y - self.y) ? a : b))
      : null;
    const enemyTowers = (world.towers ?? []).filter((t) => t.alive && t.team !== self.team);
    const tower = enemyTowers.length > 0
      ? enemyTowers.reduce((a, b) => (Math.hypot(a.x - self.x, a.y - self.y) < Math.hypot(b.x - self.x, b.y - self.y) ? a : b))
      : null;
    const fallbackGoal = obj ?? tower ?? chest;
    if (enemies.length === 0 && !fallbackGoal) return out;

    // With no enemy around (Save the Princess, everyone else respawning), aim at the wall / a chest.
    const target = enemies.length > 0 ? enemies.reduce((a, b) => (self.distTo(a) < self.distTo(b) ? a : b)) : null;
    const tx = target ? target.x : fallbackGoal!.x;
    const ty = target ? target.y : fallbackGoal!.y;
    const dx = tx - self.x;
    const dy = ty - self.y;
    const dist = target ? Math.hypot(dx, dy) : Infinity;
    const ang = Math.atan2(dy, dx);
    const w = self.weapon;
    const reach = shapeReach(w.shape);
    const jitter = (Math.random() - 0.5) * 0.25;
    out.ax = Math.cos(ang + jitter);
    out.ay = Math.sin(ang + jitter);

    if (Math.random() < 0.02) this.strafe *= -1;
    const tired = self.pe < w.peCost + 8;

    // Thunder (spends soul): worth it at level 2+, or to finish off a weak enemy.
    const reaper = slotWith(self, 'soulReaper');
    // Reaper: a gamble per target, so wait for more soul (more rolls).
    if (reaper >= 0 && self.canUseSkill(reaper) && self.soulLevel >= 3) {
      out.skills[reaper] = true;
      return out;
    }
    // Holy Fire: reliable chip damage, so cast as soon as there's any soul.
    const fire = slotWith(self, 'soulFire');
    if (fire >= 0 && self.canUseSkill(fire) && (self.soulLevel >= 2 || enemies.some((e) => e.hp < 12))) {
      out.skills[fire] = true;
      return out;
    }
    // Sacred Tree: pins a crowd; worth it as soon as several enemies are about.
    const tree = slotWith(self, 'soulTree');
    if (tree >= 0 && self.canUseSkill(tree) && (enemies.length >= 3 || (self.soulLevel >= 2 && enemies.length >= 2))) {
      out.skills[tree] = true;
      return out;
    }
    const thunder = slotWith(self, 'soulThunder');
    if (thunder >= 0 && self.canUseSkill(thunder) && (self.soulLevel >= 2 || enemies.some((e) => e.hp < 20))) {
      out.skills[thunder] = true;
      return out;
    }

    const heal = slotWith(self, 'channelHeal', 'instantHeal');
    const shot = slotWith(self, 'projectile');
    const dash = slotWith(self, 'dash');
    const sprint = slotWith(self, 'speedBuff');
    const fury = slotWith(self, 'powerUp');
    const lifeline = slotWith(self, 'revive');
    const guard = slotWith(self, 'guard');
    const vanish = slotWith(self, 'stealth');
    const substitute = slotWith(self, 'substitute');
    const caltrops = slotWith(self, 'caltrops');
    // 捨身: worth it with several enemies in the blast, to finish someone, or as a last act when nearly dead.
    const sac = slotWith(self, 'sacrifice');
    if (sac >= 0 && self.canUseSkill(sac)) {
      const e = self.skills[sac]!.effect;
      if (e.kind === 'sacrifice') {
        const inBlast = enemies.filter((t) => self.distTo(t) < e.radius + t.radius - 6);
        const finisher = inBlast.some((t) => t.hp <= e.hpCost * 2);
        const healthy = self.hp > e.hpCost + 25;
        const lastAct = self.hp <= e.hpCost && (inBlast.length >= 2 || finisher);
        if ((healthy && (inBlast.length >= 2 || finisher)) || lastAct) {
          out.skills[sac] = true;
          return out;
        }
      }
    }
    const flicker = slotWith(self, 'teleport');
    const teamHeal = slotWith(self, 'teamHeal');
    const teamPe = slotWith(self, 'teamPe');
    const teamFury = slotWith(self, 'teamFury');

    // Lifeline works from anywhere: bring a fallen teammate back when there's HP to share
    // and nobody is right on top of us.
    const fallen = lifeline >= 0 && world.fighters.some((f) => f !== self && !f.alive && !self.isEnemy(f));
    if (fallen && self.hp >= 36 && dist > 160 && self.canUseSkill(lifeline)) {
      out.skills[lifeline] = true;
      return out;
    }

    // Healing Circle when we or a teammate are hurt.
    const hurtMate = world.fighters.some((f) => f.alive && !self.isEnemy(f) && f.hp < 55);
    if (teamHeal >= 0 && hurtMate && self.canUseSkill(teamHeal)) {
      out.skills[teamHeal] = true;
      return out;
    }

    // Spirit Circle when we or a teammate are low on PE; War Drum when a fight is on.
    const tiredMate = world.fighters.some((f) => f.alive && !self.isEnemy(f) && f.pe < 30);
    if (teamPe >= 0 && tiredMate && self.canUseSkill(teamPe)) {
      out.skills[teamPe] = true;
      return out;
    }
    if (teamFury >= 0 && dist < reach * 1.5 && self.canUseSkill(teamFury) && self.pe > w.peCost + self.skills[teamFury]!.peCost) {
      out.skills[teamFury] = true;
      return out;
    }

    // Body Flicker out of trouble when badly hurt with an enemy close.
    if (flicker >= 0 && self.hp < 35 && dist < 160 && self.canUseSkill(flicker)) {
      out.skills[flicker] = true;
      return out;
    }

    // Recovery when hurt and nobody is close.
    if (heal >= 0 && self.hp < 45 && dist > 280 && self.canUseSkill(heal)) {
      out.skills[heal] = true;
      return out;
    }
    // Hurt and not under pressure: go and pick a healing herb.
    const herbs = world.herbs?.() ?? [];
    if (herbs.length > 0 && self.hp < self.maxHp * 0.55 && dist > 200) {
      const h = herbs.reduce((a, b) => (Math.hypot(a.x - self.x, a.y - self.y) < Math.hypot(b.x - self.x, b.y - self.y) ? a : b));
      const d = Math.hypot(h.x - self.x, h.y - self.y) || 1;
      out.mx = (h.x - self.x) / d;
      out.my = (h.y - self.y) / d;
      return out;
    }

    // An enemy charging 捨身 nearby: get out of the blast.
    const blast = enemies.find((e) => e.sacrificeCharge && self.distTo(e) < e.sacrificeCharge.radius + self.radius + 30);
    if (blast) {
      const d = self.distTo(blast) || 1;
      out.mx = (self.x - blast.x) / d;
      out.my = (self.y - blast.y) / d;
      return out;
    }

    // Is an enemy about to swing at me?
    const threatened = enemies.some(
      (e) => e.state === 'windup' && shapeHits(e.weapon.shape, e.x, e.y, e.facing, self.x, self.y, self.radius + 12),
    );
    const incoming = world.projectiles.some((p) => {
      if (p.team === self.team) return false;
      const rx = self.x - p.x;
      const ry = self.y - p.y;
      const along = (rx * p.vx + ry * p.vy) / Math.hypot(p.vx, p.vy);
      const perp = Math.abs(rx * p.vy - ry * p.vx) / Math.hypot(p.vx, p.vy);
      return along > 0 && along < 260 && perp < self.radius + p.radius + 6;
    });

    // Use a pocket item when it suits the moment (items cost no PE).
    const fallenMate = world.fighters.some((f) => f !== self && !f.alive && !self.isEnemy(f));
    const itemAt = self.pocket.findIndex((it) => {
      const e = it.effect;
      switch (e.kind) {
        case 'instantHeal': return self.hp < 55;
        case 'restorePe': return self.pe < 30;
        case 'powerUp': return !!target && dist < reach * 1.3;
        case 'guard': return threatened || incoming || (self.hp < 60 && dist < 150);
        case 'speedBuff': return dist > 420;
        case 'projectile': return !!target && dist > 200 && dist < 600;
        case 'revive': return fallenMate;
        default: return false;
      }
    });
    if (itemAt >= 0 && self.state === 'idle') {
      out.useItemAt = itemAt;
      return out;
    }

    // Go for the princess wall, or a chest when no enemy is close.
    const chestDist = chest ? Math.hypot(chest.x - self.x, chest.y - self.y) : Infinity;
    // Towers: the main goal in Siege; otherwise only worth hitting when one is close and no enemy is.
    const towerDist = tower ? Math.hypot(tower.x - self.x, tower.y - self.y) : Infinity;
    const towerGoal = tower && (world.siege ? !target || dist > 160 : towerDist < 260 && (!target || dist > 200)) ? tower : null;
    const goal = obj ?? towerGoal ?? (chest && chestDist < 450 && (!target || dist > 220) ? chest : null);

    let mx = 0;
    let my = 0;
    /** Where we're trying to get to this decision (for map routing), if anywhere. */
    let heading: { x: number; y: number } | null = null;
    const perpX = -Math.sin(ang) * this.strafe;
    const perpY = Math.cos(ang) * this.strafe;

    if ((threatened || incoming || (self.hp < 60 && dist < 150)) && guard >= 0 && self.canUseSkill(guard)) {
      out.skills[guard] = true;
    } else if ((threatened || incoming) && substitute >= 0 && self.canUseSkill(substitute)) {
      out.skills[substitute] = true;
    } else if (vanish >= 0 && self.canUseSkill(vanish) && dist < 200 && (self.hp < 40 || tired)) {
      // Hurt or out of breath with an enemy close: disappear and slip away.
      out.skills[vanish] = true;
    } else if (caltrops >= 0 && self.canUseSkill(caltrops) && dist < 110) {
      out.skills[caltrops] = true;
    }
    if (threatened || incoming) {
      mx = perpX - Math.cos(ang) * (threatened ? 0.8 : 0);
      my = perpY - Math.sin(ang) * (threatened ? 0.8 : 0);
      if (dash >= 0 && self.canUseSkill(dash) && Math.random() < 0.45) out.skills[dash] = true;
    } else if (tired) {
      // Out of PE: stand still to recover fastest if nobody is close, otherwise back off.
      if (dist < 220) {
        mx = -Math.cos(ang) + perpX * 0.6;
        my = -Math.sin(ang) + perpY * 0.6;
      }
    } else if (goal && (!target || dist > 130 || Math.random() < 0.3)) {
      const obj = goal;
      heading = { x: obj.x, y: obj.y };
      // Head for the closest point of the wall and hit it.
      const px = Phaser.Math.Clamp(self.x, obj.x - obj.w / 2, obj.x + obj.w / 2);
      const py = Phaser.Math.Clamp(self.y, obj.y - obj.h / 2, obj.y + obj.h / 2);
      const od = Math.hypot(px - self.x, py - self.y);
      const oang = Math.atan2(py - self.y, px - self.x);
      const s = w.shape;
      const ideal = s.kind === 'ring' || s.kind === 'arc' ? (s.inner + s.outer) / 2 : s.kind === 'circle' ? s.offset : reach * 0.6;
      const approach = od > ideal + 8 ? 1 : od < ideal - 20 ? -0.6 : 0;
      mx = Math.cos(oang) * approach - Math.sin(oang) * this.strafe * 0.25;
      my = Math.sin(oang) * approach + Math.cos(oang) * this.strafe * 0.25;
      if (shapeHitsRect(s, self.x, self.y, oang, obj.x, obj.y, obj.w, obj.h)) {
        out.attack = true;
        out.ax = Math.cos(oang);
        out.ay = Math.sin(oang);
      }
    } else if (target) {
      heading = { x: target.x, y: target.y };
      const s = w.shape;
      // Stand where the weapon hits best: inside the band for ring / arc, on the circle for hammer / bomb.
      const ideal = s.kind === 'ring' || s.kind === 'arc' ? (s.inner + s.outer) / 2 : s.kind === 'circle' ? s.offset : reach * 0.7;
      const approach = dist > ideal + 12 ? 1 : dist < ideal - 25 ? -0.7 : 0;
      mx = Math.cos(ang) * approach + perpX * 0.45;
      my = Math.sin(ang) * approach + perpY * 0.45;

      if (fury >= 0 && dist < reach * 1.3 && self.canUseSkill(fury) && self.pe > w.peCost + self.skills[fury]!.peCost) {
        out.skills[fury] = true;
      } else if (shapeHits(w.shape, self.x, self.y, ang, target.x, target.y, target.radius - 4) && Math.random() < 0.8) {
        out.attack = true;
        out.ax = Math.cos(ang);
        out.ay = Math.sin(ang);
      } else if (shot >= 0 && dist > 260 && dist < 640 && self.canUseSkill(shot) && self.pe > self.skills[shot]!.peCost + w.peCost && Math.random() < 0.35) {
        // Lead the target a little.
        const p = self.skills[shot]!.effect;
        const t = p.kind === 'projectile' ? dist / p.speed : 0;
        const lx = target.x + target.vx * t * 0.7 - self.x;
        const ly = target.y + target.vy * t * 0.7 - self.y;
        const l = Math.hypot(lx, ly) || 1;
        out.ax = lx / l;
        out.ay = ly / l;
        out.skills[shot] = true;
      } else if (sprint >= 0 && dist > 420 && self.canUseSkill(sprint) && self.pe > 60) {
        out.skills[sprint] = true;
      }
    }

    // Impassable terrain (a river): head for the waypoint the map suggests, e.g. a bridge.
    if (heading && world.route && !threatened && !incoming) {
      const wp = world.route(self.x, self.y, heading.x, heading.y);
      if (wp) {
        const d = Math.hypot(wp.x - self.x, wp.y - self.y) || 1;
        mx = (wp.x - self.x) / d;
        my = (wp.y - self.y) / d;
      }
    }

    // Outside the barrier: get back in before anything else.
    const safe = world.safe?.();
    if (safe) {
      const d = Math.hypot(safe.x - self.x, safe.y - self.y);
      if (d > safe.r - 40) {
        mx = (safe.x - self.x) / (d || 1);
        my = (safe.y - self.y) / (d || 1);
      }
    }

    // Obstacle escape: if we're making no headway where we want to go (stopped, or just
    // sliding along a wall), sidestep at 90° for a moment; if that's blocked too, try the other way.
    const len = Math.hypot(mx, my);
    if (this.detourT > 0) {
      this.detourT -= 0.13;
      if (Math.hypot(self.vx, self.vy) < 40 && self.state === 'idle' && !this.detourFlipped) {
        this.detourFlipped = true;
        this.strafe *= -1;
        this.detour = { x: -this.detour.x, y: -this.detour.y };
      }
      mx = this.detour.x;
      my = this.detour.y;
    } else {
      const progress = len > 0.2 ? (self.vx * mx + self.vy * my) / len : Infinity;
      if (progress < 40 && self.state === 'idle') this.stuckT += 0.13;
      else this.stuckT = Math.max(0, this.stuckT - 0.13);
      if (this.stuckT > 0.4) {
        this.stuckT = 0;
        this.detourT = 0.9;
        this.detourFlipped = false;
        this.detour = { x: (-my / len) * this.strafe, y: (mx / len) * this.strafe };
        mx = this.detour.x;
        my = this.detour.y;
      }
    }

    out.mx = mx;
    out.my = my;
    return out;
  }
}
