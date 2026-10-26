import * as Phaser from 'phaser';
import { type QuestMode, type QuestRule, type QuestSide, type GameMode, type GroveRole } from '@/config';
import { Fighter } from '@/Fighter';
import { type Item, type ItemEffect } from '@/items';
import { type MapId, type Obstacle } from '@/maps';
import { type MatchStats } from '@/matchStats';
import { type TreeSummon } from '@/battle/quest/treeRules';
import { type SlotConfig } from '@/settings';
import { TOWER_ARROW } from '@/battle/objectives/towerConfig';

export interface Projectile {
  /** Who threw it; undefined for a watchtower's arrow. */
  owner?: Fighter;
  team: number;
  /** Flies over obstacles, chests and towers (watchtower arrows). */
  ignoreObstacles?: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  traveled: number;
  effect: Extract<ItemEffect, { kind: 'projectile' }>;
  dead: boolean;
}

/** A team's watchtower: shoots enemies in range, buffs teammates in its aura, can be destroyed. */
export interface Tower {
  team: number;
  /** A living tree uses main-tower HP, aura and respawns, but casts summons instead of arrows. */
  tree?: boolean;
  /** Cursed grove: which of the three jobs this tree drew. */
  grove?: GroveRole;
  /** Small snare tree. `prisoner` is the ally sealed inside, if any. */
  snare?: boolean;
  prisoner?: Fighter;
  /** The big main tower (本陣) at the back. */
  main: boolean;
  range: number;
  fireInterval: number;
  aura: number;
  arrow: typeof TOWER_ARROW;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Seconds until it can shoot again. */
  reload: number;
  shakeT: number;
  body: Phaser.Physics.Arcade.StaticBody;
  collider: Phaser.Physics.Arcade.Collider;
  rect: Phaser.Geom.Rectangle;
}

/** A breakable treasure chest; whoever breaks it gets a random item. */
export interface Chest {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  shakeT: number;
  /** Seconds since it dropped in (for the landing animation). */
  age: number;
  /** Nothing inside (nobody can tell until it's broken). */
  empty: boolean;
  /** Big chest: larger, tougher, never empty, several items. */
  big: boolean;
  /** Dropped in at a random spot during the fight (rather than placed at the start). */
  random: boolean;
  maxHp: number;
  body: Phaser.Physics.Arcade.StaticBody;
  collider: Phaser.Physics.Arcade.Collider;
}

/** 闖關 Quest: which stage (0-based) and what the party brought along from the stage before. */
export interface QuestState {
  stage: number;
  /** Six stage ids for this run: five trials, then one boss. */
  route?: number[];
  campaign?: QuestMode;
  side?: QuestSide;
  /** heroes: everyone is a hero. hell: everyone plays Hell. free: each player chose. */
  rule?: QuestRule;
  carry?: {
    /** Per party slot: pocket items and soul. */
    players: Record<number, { pocket: Item[]; soul: number }>;
    /** Running totals for the results screen. */
    stats: MatchStats[];
  };
}

export interface BattleStartData {
  slots: SlotConfig[];
  mode: GameMode;
  mapId?: MapId | 'random';
  quest?: QuestState;
}

/** Save the Princess: the breakable wall around her. */
export interface PrincessWall {
  o: Obstacle;
  team: number;
  hp: number;
  maxHp: number;
  lastHitter: Fighter | null;
  shakeT: number;
  rescued: boolean;
  body?: Phaser.Physics.Arcade.StaticBody;
  rect?: Phaser.Geom.Rectangle;
  /** Crack lines, revealed one by one as the wall takes damage. */
  cracks: { x: number; y: number }[][];
}

export interface QuestTreeCast {
  spell: TreeSummon;
  target: Fighter;
  x: number;
  y: number;
  elapsed: number;
}

/** A night-alley lantern. Lit candles flare; a hero's swing blows one out until the flame returns. */
export interface NightCandle {
  x: number;
  y: number;
  lit: boolean;
  /** Seconds until the next flare, or until the flame returns when dark. */
  timer: number;
  /** Seconds the warning ring has been showing, when a flare is coming. */
  warn: number | null;
}
