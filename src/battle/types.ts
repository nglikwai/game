import * as Phaser from 'phaser';
import { type QuestMode, type QuestRule, type QuestSide, type GameMode, type GroveRole } from '@/config';
import { Fighter } from '@/gameplay/Fighter';
import { type Item, type ItemEffect } from '@/gameplay/items';
import { type MapId, type Obstacle } from '@/maps';
import { type MatchStats } from '@/battle/results/stats';
import { type TreeSummon } from '@/battle/quest/treeRules';
import { type SlotConfig } from '@/state/gameSettings';
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
  /** A dragon's shot: hitting a fighter applies its element instead of plain damage. */
  element?: DragonElement;
  /** Burst radius (design px) for an element shot, instead of its element's usual one. */
  blast?: number;
  dead: boolean;
}

/** A team's watchtower: shoots enemies in range, buffs teammates in its aura, can be destroyed. */
export interface Tower {
  team: number;
  /** A living tree uses main-tower HP, aura and respawns, but casts summons instead of arrows. */
  tree?: boolean;
  /** Cursed grove: which of the three jobs this tree drew. */
  grove?: GroveRole;
  /** One head of the three-headed dragon, by element. Heads never shoot arrows or bring anyone back. */
  dragon?: DragonElement;
  /** One of the Sun & Moon Wyverns: the tower is its whole body. */
  wyvern?: WyvernKind;
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
  /** Towers are static; a dragon's head is a moving body that follows the dragon. */
  body: Phaser.Physics.Arcade.StaticBody | Phaser.Physics.Arcade.Body;
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
  /** Stable across stages and retries; each stage salts this seed to generate its terrain. */
  layoutSeed?: number;
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

/** The three-headed dragon's elements. */
export type DragonElement = 'fire' | 'ice' | 'thunder';

/** 日月雙龍: the Sun Wyvern (fire) and the Moon Wyvern (ice). */
export type WyvernKind = 'sun' | 'moon';

/** What a wyvern is winding up: sun bombs on marked spots, a charge down a lane, a frost ring, or a fan of ice shards. */
export type WyvernCast =
  | { kind: 'sunfall'; elapsed: number; warn: number; marks: { x: number; y: number }[] }
  | { kind: 'charge'; elapsed: number; warn: number; angle: number; from: { x: number; y: number }; to: { x: number; y: number } }
  | { kind: 'ring'; elapsed: number; warn: number; gaps: number[] }
  | { kind: 'shards'; elapsed: number; warn: number; target: Fighter; angle: number };

/** One of the two wyverns. Its body is `tower`, which moves with it and can be knocked down and raised again. */
export interface Wyvern {
  kind: WyvernKind;
  tower: Tower;
  facing: number;
  vx: number;
  vy: number;
  stride: number;
  /** Seconds until its next attack. */
  t: number;
  cast: WyvernCast | null;
  /** Rushing down a lane: where from and to, how far along (0–1), and who it has already hit. */
  charge: { from: { x: number; y: number }; to: { x: number; y: number }; k: number; hit: Fighter[] } | null;
  /** Seconds until it rises again, or −1 while it stands (or is gone for good). */
  reviveT: number;
}

/** A frost ring spreading out from the Moon Wyvern; its gaps are safe. */
export interface WyvernRing {
  x: number;
  y: number;
  r: number;
  gaps: number[];
  hit: Fighter[];
}

/**
 * One head taking aim. The aim line follows `target` until the last `lock` seconds of the warning,
 * then holds still, and the head fires along it.
 */
export interface DragonCast {
  /** A sustained breath instead of this head's usual projectile attack. */
  beam?: boolean;
  element: DragonElement;
  head: Tower;
  target: Fighter;
  elapsed: number;
  warn: number;
  lock: number;
  angle: number;
}

/** One head breathing along a gradually sweeping angle, with periodic damage. */
export interface DragonBeam {
  element: DragonElement;
  head: Tower;
  startAngle: number;
  angle: number;
  direction: number;
  elapsed: number;
  tick: number;
}

/** A physical spirit collectible, separate from the fighter's summon-soul meter. */
export interface WanderingSpirit {
  x: number;
  y: number;
  carrier: Fighter | null;
}

export interface SpiritRelay {
  team: number;
  sources: { x: number; y: number }[];
  destination: { x: number; y: number; radius: number };
  spirits: WanderingSpirit[];
  delivered: number;
  spawnT: number;
  nextSpawn: number;
  guardT: number;
}

/** The dragon's body: it walks the cave, keeps its distance and carries the three heads. */
export interface DragonBody {
  x: number;
  y: number;
  w: number;
  h: number;
  body: Phaser.Physics.Arcade.Body;
  collider: Phaser.Physics.Arcade.Collider;
  alive: boolean;
  /** Which way it faces (radians; π = facing left), how it is walking, and how far along its stride is. */
  facing: number;
  vx: number;
  vy: number;
  stride: number;
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
