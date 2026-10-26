import * as Phaser from 'phaser';
import { playMusic, type Track } from '../music';
import { isQuestMode, prepareQuest, questStageNumber, nextQuestStage, type QuestMode, type QuestRule, type QuestSide, HARD_CPU_HP, SOUL_CAST_TIME, MAIN_TOWER, MAIN_TOWER_HEAL, SMALL_TOWER, RESPAWN_TOWER_COST, TOWER_RESPAWN_HP, TOWER_RESPAWN_SOUL_KEEP, SOUL_REAPER, SOUL_FIRE, SOUL_TREE, SOUL_MISS_PARALYZE, SOUL_LEVELS, SOUL_PER_LEVEL, SOUL_FROM_HURT, SOUL_THUNDER, TEAM_RESPAWN, TOWER_AURA, TOWER_FIRE_INTERVAL, TOWER_HP, TOWER_RANGE, MAP_SCALE, MAX_PLAYERS, BIG_CHEST_HP, BIG_CHEST_ITEMS, CHEST_HP, QUEST_MAX_CHESTS, chestsWithinCap, maxRandomChests, randomChestInterval, startRandomChests, BATTLE_READY_SECONDS, COUNTDOWN, QUEST, QUEST_TACTICS, QUEST_BOSSES, ALTAR, EMPTY_CHEST_CHANCE, HEIGHT, HUD_HEIGHT, MAX_HP, MAX_PE, PLAYER_COLORS, PRINCESS_WALL_HP, RES, RESPAWN_DELAY, TEAM_COLORS, WIDTH, type GameMode, type GroveIllusion, type GroveRole } from '../config';
import { AIController, createController, type WorldView } from '../controls';
import { Fighter, type Arena } from '../Fighter';
import { hellSlots, hellBossSlots, questFactions, questSideOf } from '../questHell';
import { POCKET_SIZE, rollItem, type Item, type ItemEffect } from '../items';
import { SKILL_SLOTS, skillById, skillCooldownFor, summonStrikeCount, type SkillEffect } from '../skills';
import { roleById, type Role } from '../roles';
import { CPU_ENEMY_SKILLS, questFoeSkills, randomCpuEquipment, rollCpuLoadouts } from '../cpuLoadout';
import { WEAPONS, drawShape, rayAngles, rollOniWeapon, shapeHits, shapeHitsRect } from '../weapons';
import { T } from '../i18n';
import { sfx } from '../sfx';
import { ARENA as SCREEN_ARENA, ARENA_MID_Y as SCREEN_MID_Y, MAPS, MAP_RES, addArenaTexture, chestsFor, getMap, obstaclesFor, sideOf, spawnPoint, towerSpots, type GameMap, type MapId, type Obstacle, type TerrainKind } from '../maps';
import { drawHeldWeapon, drawWeaponIcon, drawItemIcon, drawLog, kunai, ninjaTexture, type Pose } from '../art';
import { createMatchStats, type MatchStats } from '../matchStats';
import { performanceScore, rankMatchResults, selectMatchAwards } from '../matchAwards';
import { groveSummonHitChance, pickTreeSummon, type TreeSummon } from '../questTree';
import { chargeSeal, type SealPoint } from '../questSeals';
import { advanceLantern, createLantern, distanceToEscortPath, type SpiritLantern } from '../questEscort';
import { Fx, REAPER_SWING } from '../fx';
import type { FighterState } from '../Fighter';
import { getSettings, type SlotConfig } from '../settings';
import { C, FONT, Petals, UIScene, addButton, toHex, txt } from '../ui';

// ---------- battlefield coordinates ----------
// Maps are designed in screen coordinates (below the HUD). The battlefield is the same
// layout scaled up by MAP_SCALE, with (0, 0) at the top-left of the map area.
const S = MAP_SCALE;
const toWorld = (p: { x: number; y: number }) => ({ x: p.x * S, y: (p.y - HUD_HEIGHT) * S });
const toWorldRect = <T extends { x: number; y: number; w: number; h: number }>(o: T): T => ({ ...o, ...toWorld(o), w: o.w * S, h: o.h * S });
const toDesign = (x: number, y: number) => ({ x: x / S, y: y / S + HUD_HEIGHT });
/** The playable area, in battlefield coordinates. */
const ARENA = { x: SCREEN_ARENA.x * S, y: (SCREEN_ARENA.y - HUD_HEIGHT) * S, w: SCREEN_ARENA.w * S, h: SCREEN_ARENA.h * S };
const WORLD_CENTER = { x: ARENA.x + ARENA.w / 2, y: ARENA.y + ARENA.h / 2 };

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
interface Tower {
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

/** The arrow a tower fires (the main tower's hits harder and flies further). */
const TOWER_ARROW = { kind: 'projectile' as const, speed: 720, radius: 5, damage: 5, knockback: 110, hitstun: 0.1, range: TOWER_RANGE + 60, color: 0xe8e8e8 };
const MAIN_TOWER_ARROW = { ...TOWER_ARROW, damage: MAIN_TOWER.damage, range: MAIN_TOWER.range + 60 };
const SMALL_TOWER_ARROW = { ...TOWER_ARROW, damage: SMALL_TOWER.damage, range: SMALL_TOWER.range + 60 };
/** Stats for each kind of tower (HP is per 2 team members). */
const TOWER_STATS = {
  main: { ...MAIN_TOWER, arrow: MAIN_TOWER_ARROW },
  front: { hp: TOWER_HP, size: 44, range: TOWER_RANGE, fireInterval: TOWER_FIRE_INTERVAL, aura: TOWER_AURA, arrow: TOWER_ARROW },
  small: { ...SMALL_TOWER, arrow: SMALL_TOWER_ARROW },
};

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

/** The boss: crimson, with a fixed loadout. */
const BOSS_COLOR = 0xb3202e;
const BOSS_GEAR = { weapon: Math.max(0, WEAPONS.findIndex((w) => w.id === 'hammer')), skills: ['fury', 'thunder', 'golden-bell', 'blink'], role: 'samurai' as const };
const DIRGE_COLOR = 0xd7a15a;
const DIRGE_GEAR = { weapon: Math.max(0, WEAPONS.findIndex((w) => w.id === 'flail')), skills: ['golden-bell', 'fury', 'thunder', 'blink'], role: 'samurai' as const };
const NIGHT_BOSS_GEAR = { weapon: Math.max(0, WEAPONS.findIndex((w) => w.id === 'ninjato')), skills: ['fury', 'blink', 'thunder', 'second-wind'] as const };
export const WARDEN_GEAR = [
  { weapon: WEAPONS.findIndex((w) => w.id === 'hammer'), skills: ['fury', 'golden-bell', 'blink', 'thunder'], role: 'samurai' as const },
  { weapon: WEAPONS.findIndex((w) => w.id === 'talisman'), skills: ['fireball', 'holy-fire', 'sprint', 'second-wind'], role: 'mystic' as const },
];

export function wardenRole(partySize: number, index: number): Role {
  return { ...roleById(WARDEN_GEAR[index].role), maxHp: QUEST.wardens.hpBase + QUEST.wardens.hpPerPlayer * partySize,
    speed: 1.05, skillCooldown: 0.85, poise: 1, knockbackTaken: 0.4, healReceived: 1 };
}

export function bossRole(partySize: number): Role {
  const b = QUEST.boss;
  return {
    ...roleById('samurai'), name: 'Boss', zh: '頭目',
    maxHp: b.hpBase + b.hpPerPlayer * partySize, speed: b.speed, skillCooldown: b.skillCooldown, poise: 1, knockbackTaken: b.knockbackTaken, healReceived: 1,
  };
}

export function nightBossRole(partySize: number): Role {
  const b = QUEST.night.captain;
  return {
    ...roleById('ronin'), name: 'Night Oni', zh: '夜叉',
    maxHp: b.hpBase + b.hpPerPlayer * partySize, speed: b.speed, skillCooldown: b.skillCooldown, poise: 1, knockbackTaken: b.knockbackTaken, healReceived: 1,
  };
}

export function dirgeRole(partySize: number): Role {
  const b = QUEST.dirge;
  return {
    ...roleById('samurai'), name: 'Bell Oni', zh: '鐘鬼',
    maxHp: b.hpBase + b.hpPerPlayer * partySize, speed: b.speed, skillCooldown: b.skillCooldown, poise: 1, knockbackTaken: b.knockbackTaken, healReceived: 1,
  };
}

/** Quest slots: the party (P1–P4, all on team 0) plus the stage's enemies (P5–P8, team 1). */
function questSlots(lobby: SlotConfig[], stage: number): SlotConfig[] {
  const party = lobby.slice(0, QUEST.partySlots).map((sl) => ({ ...sl, team: 0 }));
  const n = party.filter((sl) => sl.control !== 'off').length;
  // Final stage prepares all guard slots; excess guards wait off-field for the boss to summon.
  const enemies = stage === QUEST.wardenStage ? QUEST.wardens.enemies
    : stage === QUEST.bossStage ? Math.min(QUEST.boss.maxEnemies, MAX_PLAYERS - QUEST.partySlots)
      : stage === QUEST.dirgeStage ? 1
      : stage === QUEST.groveStage ? QUEST.grove.enemies
        : stage === QUEST.rescueStage ? QUEST.rescue.enemies
          : stage === QUEST.sealStage ? QUEST.seals.enemies
        : stage === QUEST.escortStage ? QUEST.escort.enemies
          : stage === QUEST.snareStage ? QUEST.snare.enemies
            : stage === QUEST.nightStage ? QUEST.night.enemies
            : Math.min(MAX_PLAYERS - QUEST.partySlots, n + 1);
  const base = lobby[QUEST.partySlots] ?? lobby[0];
  const foes = Array.from({ length: MAX_PLAYERS - QUEST.partySlots }, (_, k): SlotConfig => ({ ...base, control: k < enemies ? 'cpu' : 'off', team: 1 }));
  return [...party, ...foes];
}

/** Save the Princess: the breakable wall around her. */
interface PrincessWall {
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

interface QuestTreeCast {
  spell: TreeSummon;
  target: Fighter;
  x: number;
  y: number;
  elapsed: number;
}

/** A night-alley lantern. Lit candles flare; a hero's swing blows one out until the flame returns. */
interface NightCandle {
  x: number;
  y: number;
  lit: boolean;
  /** Seconds until the next flare, or until the flame returns when dark. */
  timer: number;
  /** Seconds the warning ring has been showing, when a flare is coming. */
  warn: number | null;
}




/** A summon strike's hit chance for the soul level spent (1–4). */
const soulHitChance = (byLevel: number[], level: number) => byLevel[Math.min(byLevel.length, Math.max(1, level)) - 1];
export const summonHitChance = (base: number, boss = false) => Math.min(1, base + (boss ? QUEST.boss.summonHitBonus : 0));

export class BattleScene extends UIScene implements Arena {
  protected bgm: Track = 'battle';
  private slots: SlotConfig[] = [];
  /** The lobby's slots, as given (Quest rebuilds `slots` from them each stage). */
  private lobbySlots: SlotConfig[] = [];
  private mode: GameMode = 'ffa';
  /** Quest progress; null in other modes. */
  private quest: QuestState | null = null;
  /** Quest stage 1: which wave is on, and the countdown to the next one (-1 = none coming). */
  private wave = 1;
  private waveT = -1;
  private questText?: Phaser.GameObjects.Text;
  /** Lightning-storm maps: seconds to the next volley, and the marked spots waiting to be struck. */
  private stormT = 0;
  private stormMarks: { x: number; y: number; t: number }[] = [];
  /** Fire vents: seconds to the next eruption, and the vents about to blow. */
  private ventT = 0;
  /** When the fight started (after the countdown), in scene time (s). */
  private fightStart = 0;
  private ventMarks: { x: number; y: number; t: number }[] = [];
  /** Ground fire: a warning ring, then a patch that burns anyone standing in it. */
  private flameT = 0;
  private flameMarks: { x: number; y: number; r: number; dps: number; life: number; t: number }[] = [];
  private flamePatches: { x: number; y: number; r: number; t: number; life: number; dps: number; tick: number }[] = [];
  /** Portals: a fighter who just came out of one can't use it again until they step off. */
  private portalLock = new Map<Fighter, { x: number; y: number }>();
  /** Rolling boulders: time to the next one, the warning, and the boulders on their way. */
  private rollT = 0;
  private rollWarn: { y: number; dir: number; t: number } | null = null;
  private boulders: { x: number; y: number; dir: number; spin: number; hit: Set<Fighter> }[] = [];
  /** Spike traps: per fighter, time until the next tick of damage. */
  private spikeTick = new Map<Fighter, number>();
  /** Crystal obstacles that bounce shots instead of stopping them. */
  private bouncers: Phaser.Geom.Rectangle[] = [];
  /** Launch pads: a fighter who was just flung can't be flung again until they step off. */
  private padLock = new Set<Fighter>();
  /** Soul Altar: which team holds it right now (-1 = nobody / contested). */
  private altarTeam = -1;
  /** Sliding doors and whether each is shut. */
  private doors: { rect: Phaser.Geom.Rectangle; body: Phaser.Physics.Arcade.StaticBody; group: number; closed: boolean }[] = [];
  /** Explosive kegs; dead ones count down to coming back. */
  private kegs: { x: number; y: number; size: number; alive: boolean; t: number; rect: Phaser.Geom.Rectangle; body: Phaser.Physics.Arcade.StaticBody }[] = [];
  /** The great bell: seconds to the next toll. */
  private bellT = 0;
  /** Barrier: per fighter, time to the next tick of damage outside it. */
  private barrierTick = new Map<Fighter, number>();
  private barrierAnnounced = false;
  /** Healing herbs: grown, or regrowing (t = seconds left). */
  private herbs: { x: number; y: number; grown: boolean; t: number }[] = [];
  private bossName?: Phaser.GameObjects.Text;
  private bossBar?: Phaser.GameObjects.Graphics;
  private map!: GameMap;
  private mapChoice: MapId | 'random' = 'courtyard';
  /** Obstacles that stop projectiles (everything except low terrain like water). */
  private shotBlockers: Phaser.Geom.Rectangle[] = [];
  private walls: PrincessWall[] = [];
  private princessText?: Phaser.GameObjects.Text;
  private questTreeT = QUEST.rescue.tree.initialDelay;
  private questTreeCast: QuestTreeCast | null = null;
  private questTree: Tower | null = null;
  /** Rescue seal, in world x. Closed until both princess walls break. */
  private rescueGateX = 0;
  private rescueGateOpen = false;
  /** Cursed grove: the three trees, in spot order, after their jobs are shuffled. */
  private groveTrees: Tower[] = [];
  private groveLabels: Phaser.GameObjects.Text[] = [];
  private groveVeil?: Phaser.GameObjects.Graphics;
  private groveT = 0;
  private groveIllusion: GroveIllusion = 'sand';
  private groveCast: QuestTreeCast | null = null;
  private groveSummonT = 0;
  private groveRespawnT = 0;
  /** Which effect window has already been announced, so the banner plays once. */
  private groveAnnounced = '';
  /** Small summon and illusion trees, and the allies sealed inside them. */
  private snareTrees: Tower[] = [];
  private snareLabels: Phaser.GameObjects.Text[] = [];
  private snareVeil?: Phaser.GameObjects.Graphics;
  private snareCast: QuestTreeCast | null = null;
  private snareSummonT = 0;
  private snareIllusion: GroveIllusion = 'sand';
  /** Screen-space darkness for the night alley, with holes cut around lights. */
  private nightShade?: Phaser.GameObjects.RenderTexture;
  private nightLights?: Phaser.GameObjects.Graphics;
  private nightFlames?: Phaser.GameObjects.Graphics;
  private nightCandles: NightCandle[] = [];
  /** Seconds until the Dirge bell starts its warning, and the warning itself. */
  private dirgeTollT = QUEST.dirge.tollEvery;
  private dirgeWarn: { elapsed: number } | null = null;
  private seals: SealPoint[] = [];
  private sealRespawnT = QUEST.seals.respawnEvery;
  private lantern: SpiritLantern | null = null;
  private escortRespawnT = QUEST.escort.respawnEvery;
  private wardenReviveT = -1;
  private wardenGruntT = QUEST.wardens.gruntRespawn;
  private bossRespawnT = QUEST.boss.respawnInterval;
  private bossReserves = new Set<Fighter>();
  private chests: Chest[] = [];
  private towers: Tower[] = [];
  /** Who each main tower is healing this frame (for the beams). */
  private towerHeals: { tower: Tower; f: Fighter }[] = [];
  /** Seconds of fighting so far (after the countdown); respawn waits grow with it. */
  private elapsed = 0;
  /** Per team: seconds until its next fallen player comes back (-1 = nobody waiting). */
  private teamRespawnT = [-1, -1];
  /** When each fallen fighter went down, so they come back in order. */
  private deathTime = new Map<Fighter, number>();
  /** Caltrops on the ground. */
  private caltrops: { x: number; y: number; r: number; t: number; life: number; team: number; owner: Fighter; dps: number; slow: number; spikes: { x: number; y: number; a: number }[]; tick: number }[] = [];
  /** Seconds until the next random chest drops in. */
  private chestTimer = 0;
  /** Render layers: floor (under fighters), over (on top), glow (additive), plus HUD icons. */
  private gOver!: Phaser.GameObjects.Graphics;
  /** The battlefield, drawn at 1 / MAP_SCALE below the HUD, in back-to-front layers. */
  private lFloor!: Phaser.GameObjects.Container;
  private lSprites!: Phaser.GameObjects.Container;
  private lOver!: Phaser.GameObjects.Container;
  private lTop!: Phaser.GameObjects.Container;
  private gGlow!: Phaser.GameObjects.Graphics;
  private hudIcons!: Phaser.GameObjects.Graphics;
  private fx = new Fx();
  private sprites: Phaser.GameObjects.Image[] = [];
  /** Last frame's state per fighter, to spot transitions (strike, death, dash…). */
  private prevStates: FighterState[] = [];
  /** Where (and at what angle) each fallen fighter's log lies. */
  private logs = new Map<Fighter, { x: number; y: number; a: number }>();
  /** Where each fighter (re)spawns, by slot index. */
  private spawns: { x: number; y: number }[] = [];
  private respawnTimers = new Map<Fighter, number>();
  private tagTexts: string[] = [];
  private helpTexts: Phaser.GameObjects.Text[] = [];
  private fighters: Fighter[] = [];
  private projectiles: Projectile[] = [];
  private world!: WorldView;
  private obstacleRects: Phaser.Geom.Rectangle[] = [];
  private readonly arenaRect = new Phaser.Geom.Rectangle(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  private petals!: Petals;
  private paused = false;
  /** Per fighter (by slot index): damage dealt to fighters, KOs, damage dealt to their princess's wall. */
  private stats: MatchStats[] = [];
  private g!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private nameTags: Phaser.GameObjects.Text[] = [];
  private hudNames: Phaser.GameObjects.Text[] = [];
  private hudSkillGlyphs: Phaser.GameObjects.Text[][] = [];
  private keyLabels: Phaser.GameObjects.Text[][] = [];
  private over = false;
  private winningTeam: number | null = null;
  private questBossSeats: number[] = [];
  /** Seconds left in the battlefield preview plus the pre-round countdown. */
  private countdown = 0;
  private overT = 0;

  constructor() {
    super('Battle');
  }

  private get hasHellPlayers() { return !!this.quest && questFactions(this.lobbySlots, this.quest.side).hell; }
  private get isMixedQuest() { return !!this.quest && questFactions(this.lobbySlots, this.quest.side).mixed; }
  private get isHell() { return !!this.quest && questFactions(this.lobbySlots, this.quest.side).side === 'hell'; }

  /** Stable lobby identity even when P2, for example, plays battlefield seat 6. */
  private questPlayerSlot(index: number): number | null {
    const slot = index % QUEST.partySlots;
    const config = this.lobbySlots[slot];
    if (!config || config.control === 'off') return null;
    const team = questSideOf(config, this.quest?.side) === 'hell' ? 1 : 0;
    return Math.floor(index / QUEST.partySlots) === team ? slot : null;
  }
  private get questTeam() { return this.isHell ? 1 : 0; }

  /** Versus keeps red then blue. In a quest the heroes are blue and the other side is red. */
  private sideColor(team: number) {
    if (!this.quest) return TEAM_COLORS[team] ?? TEAM_COLORS[0];
    return team === 0 ? TEAM_COLORS[1] : TEAM_COLORS[0];
  }

  /** Four readable shades so teammates stay distinct inside the blue or red side. */
  private questOutfit(team: number, nth: number) {
    const blues = [0x3b82f6, 0x60a5fa, 0x1d4ed8, 0xbfdbfe];
    const reds = [0xe8473c, 0xff6b63, 0xb42318, 0xffc1bb];
    return (team === 0 ? blues : reds)[nth % 4]!;
  }

  private questGoal(stage: number) {
    return this.isMixedQuest ? `${T().questVersus} · ${T().questGoals[stage]}` : (this.isHell ? T().hellGoals : T().questGoals)[stage];
  }

  private fighterLabel(f: Fighter): string {
    if (!this.hasHellPlayers) return `P${f.index + 1}`;
    const slot = this.questPlayerSlot(f.index);
    if (slot !== null) return `P${slot + 1}`;
    return f.team === 0 ? `${T().heroTag} ${f.index + 1}` : T().hellGuard;
  }

  init(data: BattleStartData) {
    this.lobbySlots = data.slots;
    this.mode = data.mode ?? 'ffa';
    this.quest = isQuestMode(this.mode) ? { ...data.quest, ...prepareQuest(data.quest) } : null;
    // The underworld has its own music; the last stage gets the boss theme.
    this.bgm = this.quest ? (this.quest.stage === QUEST.bossStage || this.quest.stage === QUEST.wardenStage || this.quest.stage === QUEST.dirgeStage ? 'boss' : 'hell') : 'battle';
    this.slots = this.hasHellPlayers ? hellSlots(data.slots, this.quest?.side ?? 'heroes') : this.quest ? questSlots(data.slots, this.quest.stage) : data.slots;
    this.questBossSeats = this.hasHellPlayers ? hellBossSlots(data.slots, this.quest!.stage, this.quest?.side ?? 'heroes')
      : this.quest?.stage === QUEST.bossStage || this.quest?.stage === QUEST.dirgeStage ? [QUEST.partySlots] : this.quest?.stage === QUEST.wardenStage ? [QUEST.partySlots, QUEST.partySlots + 1] : [];
    // 'random' picks a new map each round (and rematches keep it random). Quest stages have their own maps.
    this.mapChoice = this.quest ? QUEST.maps[this.quest.stage] : data.mapId ?? 'courtyard';
    this.wave = 1;
    this.waveT = -1;
    this.stormMarks = [];
    this.ventMarks = [];
    this.flameMarks = [];
    this.flamePatches = [];
    this.flameT = 0;
    this.portalLock = new Map();
    this.rollWarn = null;
    this.boulders = [];
    this.spikeTick = new Map();
    this.bouncers = [];
    this.padLock = new Set();
    this.altarTeam = -1;
    this.doors = [];
    this.kegs = [];
    this.barrierTick = new Map();
    this.barrierAnnounced = false;
    this.herbs = [];
    this.map = this.mapChoice === 'random' ? MAPS[Math.floor(Math.random() * MAPS.length)] : getMap(this.mapChoice);
    this.shotBlockers = [];
    this.walls = [];
    this.princessText = undefined;
    this.questTreeT = QUEST.rescue.tree.initialDelay;
    this.questTreeCast = null;
    this.questTree = null;
    this.rescueGateOpen = false;
    this.rescueGateX = this.quest?.stage === QUEST.rescueStage ? QUEST.rescue.tree.gateX * S : 0;
    this.groveTrees = [];
    this.groveLabels = [];
    this.groveVeil = undefined;
    this.groveT = 0;
    this.groveIllusion = 'sand';
    this.groveCast = null;
    this.groveSummonT = QUEST.grove.summonInterval;
    this.groveRespawnT = QUEST.grove.respawnEvery;
    this.groveAnnounced = '';
    this.snareTrees = [];
    this.snareLabels = [];
    this.snareVeil = undefined;
    this.snareCast = null;
    this.snareSummonT = QUEST.snare.summonInterval;
    this.snareIllusion = 'sand';
    this.nightShade = undefined;
    this.nightLights = undefined;
    this.nightFlames = undefined;
    this.nightCandles = this.quest?.stage === QUEST.nightStage
      ? this.map.obstacles.filter((o) => o.kind === 'lantern').map((o, i) => ({
        ...toWorld(o), lit: true, timer: QUEST.night.flareEvery * (0.45 + i * 0.22), warn: null,
      }))
      : [];
    this.dirgeTollT = QUEST.dirge.tollEvery;
    this.dirgeWarn = null;
    this.seals = this.quest?.stage === QUEST.sealStage ? QUEST.seals.spots.map((p, i) => ({
      ...toWorld(p), team: 0, radius: QUEST.seals.radius * S, allies: QUEST.seals.allies[i] ?? 1, progress: 0, sealed: false, contested: false,
    })) : [];
    this.sealRespawnT = QUEST.seals.respawnEvery;
    this.lantern = this.quest?.stage === QUEST.escortStage
      ? createLantern(data.slots.slice(0, QUEST.partySlots).filter((sl) => sl.control !== 'off').length, S, HUD_HEIGHT) : null;
    this.escortRespawnT = QUEST.escort.respawnEvery;
    this.wardenReviveT = -1;
    this.wardenGruntT = QUEST.wardens.gruntRespawn;
    this.bossRespawnT = QUEST.boss.respawnInterval;
    this.bossReserves.clear();
    this.spawns = [];
    this.chests = [];
    this.caltrops = [];
    this.towers = [];
    this.towerHeals = [];
    this.elapsed = 0;
    this.teamRespawnT = [-1, -1];
    this.deathTime = new Map();
    this.chestTimer = 0; // set once we know how many fighters there are
    this.fx = new Fx();
    this.sprites = [];
    this.prevStates = [];
    this.logs = new Map();
    this.respawnTimers = new Map();
    this.tagTexts = [];
    this.helpTexts = [];
    this.fighters = [];
    this.projectiles = [];
    this.obstacleRects = [];
    this.paused = false;
    this.stats = PLAYER_COLORS.map((_, i) => createMatchStats(this.quest?.carry?.stats[i]));
    this.nameTags = [];
    this.hudNames = [];
    this.hudSkillGlyphs = [];
    this.keyLabels = [];
    this.over = false;
    this.winningTeam = null;
    this.overT = 0;
    this.countdown = BATTLE_READY_SECONDS + COUNTDOWN;
  }

  /** Party bonuses use a copy so enemies and later versus matches retain their role stats. */
  private roleForSlot(base: Role, index: number): Role {
    return this.quest && (index < QUEST.partySlots || this.hasHellPlayers && !this.questBossSeats.includes(index))
      ? { ...base, peRegen: base.peRegen * QUEST.partyPeRegen, speed: base.speed * QUEST.partySpeed }
      : base;
  }

  create() {
    // The pause menu freezes the clock, tweens and physics. Leaving it by Restart / Back skips the unpause,
    // and the clock outlives the scene, so a frozen clock would carry into the next round
    // (timed things like summon strikes then never fire). Always start unfrozen.
    this.paused = false;
    this.padHold = false;
    this.padOverlay = null;
    this.time.paused = false;
    this.tweens.resumeAll();
    // (The physics world is rebuilt for every round, so it never starts frozen.)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.time.paused = false;
    });
    this.setupUI();
    this.physics.world.setBounds(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
    const world = this.add.container(0, HUD_HEIGHT).setScale(1 / S).setDepth(1);
    this.lFloor = this.add.container();
    this.lSprites = this.add.container();
    this.lOver = this.add.container();
    this.lTop = this.add.container();
    world.add([this.lFloor, this.lSprites, this.lOver, this.lTop]);
    this.lFloor.add(this.add.image(0, 0, addArenaTexture(this, this.map)).setOrigin(0, 0).setScale(S / MAP_RES));

    // Random each round: which side red starts on (team modes) and who starts where.
    const flip = this.mode !== 'ffa' && !this.quest && Math.random() < 0.5;
    const obstacles = obstaclesFor(this.map, this.mode, flip)
      .filter((o) => !(o.kind === 'deadtree' && (
        (this.quest?.stage === QUEST.rescueStage && o.x === QUEST.rescue.tree.x && o.y === QUEST.rescue.tree.y) ||
        this.quest?.stage === QUEST.groveStage)))
      .map(toWorldRect);
    const walls = obstacles.map((o) => {
      const wall = o.kind === 'cage' ? this.makeWall(o) : undefined;
      if (wall) this.walls.push(wall);
      const rect = new Phaser.Geom.Rectangle(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
      this.obstacleRects.push(rect);
      // Crystals bounce shots off instead of stopping them.
      if (o.kind === 'crystal') this.bouncers.push(rect);
      else if (!o.low) this.shotBlockers.push(rect);
      const body = this.physics.add.staticBody(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
      if (wall) { wall.body = body; wall.rect = rect; }
      return body;
    });
    this.startAmbience();
    this.stormT = this.map.lightning?.interval ?? 0;
    this.ventT = this.map.vents?.interval ?? 0;
    this.flameT = this.map.flames ? this.map.flames.interval * 0.55 : 0;
    this.fightStart = this.time.now / 1000 + BATTLE_READY_SECONDS + COUNTDOWN;
    this.rollT = this.map.rollers?.interval ?? 0;

    this.g = this.add.graphics();
    this.gOver = this.add.graphics();
    this.gGlow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.lFloor.add(this.g);
    this.lOver.add([this.gOver, this.gGlow]);
    this.hud = this.add.graphics().setDepth(40);
    this.hudIcons = this.add.graphics().setDepth(42);

    const teams = this.mode !== 'ffa';
    const startAt = this.assignStarts(flip);
    const partySize = this.slots.slice(0, QUEST.partySlots).filter((sl) => sl.control !== 'off').length;
    const fixedRoles = new Map<number, Role['id']>();
    if (this.quest?.stage === QUEST.bossStage) fixedRoles.set(this.questBossSeats[0], BOSS_GEAR.role);
    if (this.quest?.stage === QUEST.dirgeStage) fixedRoles.set(this.questBossSeats[0], DIRGE_GEAR.role);
    if (this.quest?.stage === QUEST.wardenStage) WARDEN_GEAR.forEach((gear, k) => fixedRoles.set(this.questBossSeats[k], gear.role));
    const cpuGear = rollCpuLoadouts(this.mode, this.slots, fixedRoles);
    const oniWeapon = this.quest?.stage === QUEST.bossStage ? rollOniWeapon() : null;
    this.slots.forEach((slot, i) => {
      const controller = createController(this, slot.control, slot.binds, getSettings().difficulty);
      if (!controller) return;
      // The final Quest stage: the first enemy is the boss, waiting by his throne.
      const warden = this.quest?.stage === QUEST.wardenStage ? this.questBossSeats.indexOf(i) : -1;
      const isBoss = this.questBossSeats.includes(i);
      const dirge = this.quest?.stage === QUEST.dirgeStage && isBoss;
      const sp = isBoss ? this.freeSpot(toWorld(warden >= 0 ? { x: 900, y: warden === 0 ? 265 : 547 } : dirge ? { x: QUEST.dirge.bell.x + 90, y: QUEST.dirge.bell.y } : { x: WIDTH - 140, y: SCREEN_MID_Y }), [], (dirge ? QUEST.dirge.radius : QUEST.boss.radius) + 4) : startAt[i];
      this.spawns[i] = sp;
      const r = isBoss ? (dirge ? QUEST.dirge.radius : QUEST.boss.radius) : 18;
      const body = this.physics.add.body(sp.x - r, sp.y - r, r * 2, r * 2);
      body.setCircle(r);
      body.setCollideWorldBounds(true);
      // CPUs roll a fresh, sensible loadout every round (the lobby settings aren't touched).
      const gear = warden >= 0 ? WARDEN_GEAR[warden] : dirge ? DIRGE_GEAR : isBoss ? BOSS_GEAR : cpuGear.get(i) ?? slot;
      const finaleBoss = isBoss && slot.control === 'cpu' && QUEST_BOSSES.includes(this.quest?.stage ?? -1);
      const middleFoe = !!this.quest && QUEST_TACTICS.includes(this.quest.stage) && slot.control === 'cpu' && !isBoss
        && (this.isHell ? slot.team === 0 : i >= QUEST.partySlots);
      const skillIds = finaleBoss ? questFoeSkills('boss')
        : middleFoe ? questFoeSkills('middle')
          : isBoss && slot.control !== 'cpu' ? gear.skills.slice(0, SKILL_SLOTS) : gear.skills;
      const skills = skillIds.map(skillById);
      const weapon = oniWeapon && isBoss ? oniWeapon : WEAPONS[gear.weapon];
      const baseRole = warden >= 0 ? wardenRole(partySize, warden) : dirge ? dirgeRole(partySize) : isBoss ? bossRole(partySize) : roleById(gear.role);
      const role = this.roleForSlot(baseRole, i);
      const dyed = this.quest
        ? this.questOutfit(slot.team, (this.hasHellPlayers ? this.questPlayerSlot(i) ?? i : i) % QUEST.partySlots)
        : PLAYER_COLORS[this.hasHellPlayers ? this.questPlayerSlot(i) ?? i : i];
      const color = warden >= 0 ? [0xe8473c, 0xff8f7a][warden] : dirge ? 0xc4453c : isBoss ? BOSS_COLOR : dyed;
      const f = new Fighter(i, color, weapon, skills, role, controller, body, this);
      Object.assign(f.stats, this.stats[i]);
      this.stats[i] = f.stats;
      if (teams) f.team = slot.team;
      const nightFoe = this.quest?.stage === QUEST.nightStage && f.team === (this.isHell ? 0 : 1);
      // Quest: the party is sturdier than usual. The night squad is tougher than a normal wave.
      if (nightFoe) {
        const hard = slot.control === 'cpu' && getSettings().difficulty === 'hard' ? HARD_CPU_HP : 1;
        f.maxHp = f.hp = Math.round(role.maxHp * QUEST.night.hp * hard);
      } else if (this.quest && i < QUEST.partySlots) f.maxHp = f.hp = Math.round(role.maxHp * QUEST.partyHp * (this.isHell && getSettings().difficulty === 'hard' ? HARD_CPU_HP : 1));
      else if (this.quest && i >= QUEST.partySlots && (this.quest.stage === QUEST.sealStage || this.quest.stage === QUEST.escortStage)) {
        const tougher = this.quest.stage === QUEST.sealStage ? QUEST.seals.guardHp : QUEST.escort.guardHp;
        const hard = !this.isHell && slot.control === 'cpu' && getSettings().difficulty === 'hard' ? HARD_CPU_HP : 1;
        f.maxHp = f.hp = Math.round(role.maxHp * tougher * hard);
      }
      // Hard: the CPU fighters on the other side are tougher too.
      else if (this.isHell && !isBoss && i >= QUEST.partySlots) f.maxHp = f.hp = Math.round(role.maxHp * QUEST.partyHp);
      else if (!this.isHell && slot.control === 'cpu' && !isBoss && getSettings().difficulty === 'hard') f.maxHp = f.hp = Math.round(role.maxHp * HARD_CPU_HP);
      if (isBoss) {
        f.boss = true;
        f.radius = r;
        f.damageScale = warden >= 0 ? QUEST.wardens.damage : dirge ? QUEST.dirge.damage : QUEST.boss.damage;
      }
      this.prepareBossReserve(f, partySize);
      // Quest: items and soul carry over from the last stage.
      const carried = this.quest?.carry?.players[i];
      if (carried) {
        f.pocket.push(...carried.pocket);
        f.soul = carried.soul;
      }
      this.sprites[i] = this.add.image(sp.x, sp.y, ninjaTexture(this, color)).setScale(r / 18 / RES);
      this.lSprites.add(this.sprites[i]);
      this.prevStates[i] = f.state;
      f.facing = Math.atan2(WORLD_CENTER.y - sp.y, WORLD_CENTER.x - sp.x);
      this.fighters.push(f);
      this.tagTexts[i] = this.hasHellPlayers ? `${this.fighterLabel(f)}${f.boss ? `・${this.bossTitle(f)}` : ''}` : this.quest && i >= QUEST.partySlots
        ? isBoss ? `${T().bossTag}・${this.bossTitle(f)}` : T().enemyTag
        : slot.control === 'cpu' ? `P${i + 1} ${T().cpuTag}` : `P${i + 1}`;
      const tagColor = teams ? toHex(this.sideColor(slot.team)) : '#ffffff';
      this.nameTags[i] = this.add
        .text(0, 0, this.tagTexts[i], { fontFamily: FONT, resolution: RES, fontSize: '16px', fontStyle: 'bold', color: tagColor, stroke: '#000000', strokeThickness: 3 })
        .setOrigin(0.5, 1);
      this.lTop.add(this.nameTags[i]);
    });
    this.spawnNightBoss(partySize);

    const bodies = this.fighters.map((f) => f.body);
    this.physics.add.collider(bodies, walls);
    this.physics.add.collider(bodies, bodies);
    this.configurePrincessWalls();
    // The round's chests are all there from the start; they drop in one by one during the countdown.
    // Stagger the drop-ins so they all land during the countdown.
    if (this.quest) {
      if (this.quest.stage === 1) this.placeQuestTowers(partySize);
      if (this.quest.stage === QUEST.rescueStage) this.placeQuestTree(partySize);
      if (this.quest.stage === QUEST.groveStage) this.placeGroveTrees(partySize);
      if (this.quest.stage === QUEST.wardenStage) this.placeWardenTree(partySize);
      if (this.quest.stage === QUEST.snareStage) this.placeSnareTrees(partySize);
      if (this.quest.stage === QUEST.nightStage) {
        this.nightShade = this.add.renderTexture(0, 0, WIDTH, HEIGHT).setOrigin(0, 0).setDepth(3);
        this.nightLights = this.add.graphics().setVisible(false);
        this.nightFlames = this.add.graphics().setDepth(4);
      }
    } else if (teams) this.placeTowers(flip);
    this.setupMapFeatures();
    const spots = chestsFor(this.map, this.mode)
      .map((p) => ({ ...p, ...toWorld(p) }))
      .filter((p) => !this.towers.some((tw) => Math.abs(p.x - tw.x) < 60 && Math.abs(p.y - tw.y) < 55));
    const placed = this.quest ? chestsWithinCap(spots, QUEST_MAX_CHESTS) : spots;
    placed.forEach((p, n) => this.addChest(p.x, p.y, -0.3 - (n * 2.4) / Math.max(1, placed.length), !!p.big, p.empty ?? EMPTY_CHEST_CHANCE));
    // More fighters, more chests: a few random extras from the start, and more often during the fight.
    // Quest stops at QUEST_MAX_CHESTS, counting the map chests already placed.
    const n = this.fighters.length;
    const extras = this.quest ? Math.max(0, QUEST_MAX_CHESTS - this.chests.length) : startRandomChests(n);
    for (let k = 0; k < extras; k++) this.dropRandomChest(-0.5 - k * 0.3);
    this.chestTimer = randomChestInterval(n);

    this.world = {
      fighters: this.fighters,
      projectiles: this.projectiles,
      objectives: this.walls.map((w) => ({ team: w.team, x: w.o.x, y: w.o.y, w: w.o.w, h: w.o.h })),
      route: this.map.route
        ? (fx: number, fy: number, tx: number, ty: number) => {
            const a = toDesign(fx, fy);
            const b = toDesign(tx, ty);
            const wp = this.map.route!(a.x, a.y, b.x, b.y);
            return wp && toWorld(wp);
          }
        : undefined,
      chests: this.chests,
      lootChests: !this.quest,
      towers: this.towers,
      capturePoints: this.seals,
      escort: this.lantern ?? undefined,
      siege: this.mode === 'siege' || this.quest?.stage === 1 || this.quest?.stage === QUEST.rescueStage || this.quest?.stage === QUEST.groveStage || this.quest?.stage === QUEST.snareStage,
      coordinateCaptures: this.hasHellPlayers,
      defendTeam: this.isHell ? 1 : this.quest?.stage === 1 || this.quest?.stage === QUEST.rescueStage || this.quest?.stage === QUEST.groveStage || this.quest?.stage === QUEST.sealStage || this.quest?.stage === QUEST.escortStage || this.quest?.stage === QUEST.snareStage ? 0 : undefined,
      safe: this.map.barrier ? () => this.barrierCircle() : undefined,
      herbs: this.map.herbs ? () => this.herbs.filter((h) => h.grown) : undefined,
      fires: () => [
        ...this.flameMarks.map((m) => ({ x: m.x, y: m.y, r: m.r })),
        ...this.flamePatches.map((p) => ({ x: p.x, y: p.y, r: p.r })),
        ...(this.map.vents ? this.ventMarks.map((m) => ({ x: m.x, y: m.y, r: this.map.vents!.radius })) : []),
      ],
    };
    if (this.walls.length > 0) this.showPrincessIntro();
    if (this.mode === 'siege') this.showBanner(T().siegeGoal);
    if (this.quest) this.createQuestHud();
    this.startCountdown();

    // Everything the HUD creates sits above the arena.
    const before = this.children.list.length;
    this.createHudText();
    this.children.list.slice(before).forEach((o) => (o as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(41));

  }

  /**
   * Start positions for this round: the positions themselves are fixed, but who gets
   * which is shuffled, and in team modes each team uses its side (random via `flip`).
   * Anything overlapping an obstacle (e.g. a princess wall) is nudged to a free spot.
   */
  private assignStarts(flip: boolean): { x: number; y: number }[] {
    const shuffle = <T,>(a: T[]) => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const active = this.slots.map((s, i) => ({ s, i })).filter(({ s }) => s.control !== 'off');
    const out: { x: number; y: number }[] = [];
    if (this.mode === 'ffa') {
      const order = shuffle(active.map((_, k) => k));
      active.forEach(({ i }, k) => (out[i] = toWorld(spawnPoint(order[k], null, 0))));
    } else {
      for (const team of [0, 1]) {
        const members = shuffle(active.filter(({ s }) => s.team === team));
        members.forEach(({ i }, k) => (out[i] = toWorld(spawnPoint(0, sideOf(team, flip), k))));
      }
    }
    const taken: { x: number; y: number }[] = [];
    for (const { i } of active) {
      out[i] = this.freeSpot(out[i], taken);
      taken.push(out[i]);
    }
    return out;
  }

  /** The alley captain stands with the four enemies. The eight HUD seats stay the squad. */
  private spawnNightBoss(partySize: number) {
    if (this.quest?.stage !== QUEST.nightStage) return;
    const index = MAX_PLAYERS;
    const team = this.isHell ? 0 : 1;
    const b = QUEST.night.captain;
    const role = nightBossRole(partySize);
    const r = b.radius;
    const screen = { x: this.isHell ? 220 : WIDTH - 220, y: SCREEN_MID_Y };
    const sp = this.freeSpot(toWorld(screen), this.fighters.map((f) => ({ x: f.x, y: f.y })), r + 4);
    this.spawns[index] = sp;
    const body = this.physics.add.body(sp.x - r, sp.y - r, r * 2, r * 2);
    body.setCircle(r);
    body.setCollideWorldBounds(true);
    const skills = NIGHT_BOSS_GEAR.skills.map((id) => skillById(id));
    const controller = createController(this, 'cpu', this.slots[0]?.binds ?? [], getSettings().difficulty)!;
    const color = this.sideColor(team);
    const f = new Fighter(index, color, WEAPONS[NIGHT_BOSS_GEAR.weapon], skills, this.roleForSlot(role, index), controller, body, this);
    const hard = getSettings().difficulty === 'hard' ? HARD_CPU_HP : 1;
    f.maxHp = f.hp = Math.round(role.maxHp * hard);
    f.team = team;
    f.boss = true;
    f.radius = r;
    f.damageScale = b.damage;
    this.stats[index] = f.stats;
    this.sprites[index] = this.add.image(sp.x, sp.y, ninjaTexture(this, color)).setScale(r / 18 / RES);
    this.lSprites.add(this.sprites[index]);
    this.prevStates[index] = f.state;
    f.facing = Math.atan2(WORLD_CENTER.y - sp.y, WORLD_CENTER.x - sp.x);
    this.fighters.push(f);
    this.tagTexts[index] = `${T().bossTag}・${T().nightBossName}`;
    const tagColor = toHex(this.sideColor(team));
    this.nameTags[index] = this.add
      .text(0, 0, this.tagTexts[index], { fontFamily: FONT, resolution: RES, fontSize: '16px', fontStyle: 'bold', color: tagColor, stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5, 1);
    this.lTop.add(this.nameTags[index]);
  }

  /** The nearest point to `p` that's clear of obstacles and other fighters' starts. */
  private freeSpot(p: { x: number; y: number }, taken: { x: number; y: number }[], r = 20) {
    const clear = (x: number, y: number) =>
      x > ARENA.x + r && x < ARENA.x + ARENA.w - r && y > ARENA.y + r && y < ARENA.y + ARENA.h - r &&
      !this.obstacleRects.some((o) => x > o.x - r && x < o.right + r && y > o.y - r && y < o.bottom + r) &&
      !taken.some((t) => Math.hypot(t.x - x, t.y - y) < r * 2.2);
    if (clear(p.x, p.y)) return p;
    for (let d = 20; d < 300; d += 20) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const x = p.x + Math.cos(a) * d;
        const y = p.y + Math.sin(a) * d;
        if (clear(x, y)) return { x, y };
      }
    }
    return p;
  }

  protected onUnhandledKey(e: KeyboardEvent) {
    if (e.keyCode === Phaser.Input.Keyboard.KeyCodes.ESC && !this.over) this.openPause();
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 0.05);
    if (this.holdForLostPads()) return;
    if (this.paused) return;

    // Frozen during the pre-round countdown and on the end-of-round screen.
    if (this.countdown > 0 || this.over) {
      this.countdown -= dt;
      for (const f of this.fighters) f.body.setVelocity(0, 0);
    } else {
      for (const f of this.fighters) f.update(dt, f.controller.read(f, this.world, dt));
    }
    if (!this.over) this.updateRescueGate();
    this.updateProjectiles(dt);
    this.updateCaltrops(dt);
    this.petals.update(dt);
    this.updateFx(dt);
    if (this.mode !== 'ffa' && !this.over && this.countdown <= 0) this.updateTeamRespawns(dt);
    if (this.countdown <= 0 && !this.over) {
      this.updateTowers(dt);
      this.updateTowerHealing(dt);
    }
    for (const tw of this.towers) tw.shakeT = Math.max(0, tw.shakeT - dt);
    for (const w of this.walls) w.shakeT = Math.max(0, w.shakeT - dt);
    if (this.countdown <= 0 && !this.over) this.updateRandomChests(dt);
    if (this.countdown <= 0 && !this.over) {
      this.updateStorm(dt);
      this.updateVents(dt);
      this.updateFlames(dt);
      this.updatePortals();
      this.updateRollers(dt);
      this.updateSpikes(dt);
      this.updatePads();
      this.updateAltar(dt);
      this.updateKegs(dt);
      this.updateBell(dt);
      this.updateBarrier(dt);
      this.updateHerbs(dt);
      this.updateQuestTree(dt);
    }
    this.updateDoors();
    for (const f of this.fighters) f.inFog = f.alive && this.terrainAt(f.x, f.y) === 'fog';
    for (const c of this.chests) {
      c.shakeT = Math.max(0, c.shakeT - dt);
      const before = c.age;
      c.age += dt;
      if (before < 0 && c.age >= 0) sfx.chestDrop();
    }

    this.render();
    this.renderHud();

    // Free-for-all / Team: last team standing (in free-for-all every fighter is their own team).
    // Save the Princess ends when both of a team's princesses are free; Siege when its towers fall.
    if (!this.over && this.mode === 'siege') {
      for (const team of [0, 1]) {
        if (this.towers.some((tw) => tw.team === team && tw.alive)) continue;
        const winner = this.fighters.find((f) => f.team === 1 - team);
        this.endRound(winner, T().siegeWin(T().teamNames[1 - team]), this.sideColor(1 - team));
        break;
      }
    }
    if (!this.over && this.quest) this.updateQuest(dt);
    if (this.quest) this.renderQuestHud();
    if (!this.over && this.mode === 'ffa') {
      const alive = this.fighters.filter((f) => f.alive);
      if (alive.length <= 1) this.endRound(alive[0]);
    }
    // Team Battle: a team is out once it has nobody standing and no main tower left to bring anyone back.
    if (!this.over && this.mode === 'team') {
      for (const team of [0, 1]) {
        const out = !this.fighters.some((f) => f.team === team && f.alive) && !this.towers.some((tw) => tw.team === team && tw.main && tw.alive);
        if (!out) continue;
        this.endRound(this.fighters.find((f) => f.team === 1 - team && f.alive) ?? this.fighters.find((f) => f.team === 1 - team));
        break;
      }
    }
    if (this.over) this.overT += dt;
  }

  // ---------- Arena interface ----------

  onSwingActive(f: Fighter) {
    const w = f.weapon;
    for (const t of this.fighters) {
      if (!f.isEnemy(t) || !t.alive || t.untouchable || f.swingHits.has(t)) continue;
      if (!shapeHits(w.shape, f.x, f.y, f.facing, t.x, t.y, t.radius)) continue;
      f.swingHits.add(t);
      const dx = t.x - f.x;
      const dy = t.y - f.y;
      const d = Math.hypot(dx, dy) || 1;
      const taken = t.stats.taken;
      this.dealDamage(f, t, w.damage * f.damageMult, dx / d, dy / d, w.knockback * f.damageMult, w.hitstun);
      if (t.stats.taken > taken) this.fx.weaponImpact(w.id, t.x - dx / d * t.radius * 0.5, t.y - dy / d * t.radius * 0.5, f.facing, f.color);
      if (w.id === 'staff') {
        // The Ice Staff leaves its victim frosted.
        this.fx.frostBurst(t.x, t.y);
        sfx.iceCrack();
        t.chillT = 0.9;
      }
    }

    for (const k of this.kegs) {
      if (!k.alive || f.swingHits.has(k) || !shapeHitsRect(w.shape, f.x, f.y, f.facing, k.x, k.y, k.size, k.size)) continue;
      f.swingHits.add(k);
      this.explodeKeg(k);
    }

    for (const c of [...this.chests]) {
      // Quest allies leave every chest for the players. An enemy can break one a swing happens to hit.
      if (this.quest && f.controller instanceof AIController && (f.team ?? this.questTeam) === this.questTeam) break;
      if (f.swingHits.has(c) || !shapeHitsRect(w.shape, f.x, f.y, f.facing, c.x, c.y, c.w, c.h)) continue;
      f.swingHits.add(c);
      const dmg = w.damage * f.damageMult;
      c.hp -= dmg;
      c.shakeT = 0.12;
      sfx.chestHit();
      this.fx.hitSpark(c.x, c.y - 4, 0xe0b070);
      if (c.hp <= 0) this.openChest(c, f);
    }

    for (const tw of this.towers) {
      if (!tw.alive || tw.team === f.team || f.swingHits.has(tw)) continue;
      if (!shapeHitsRect(w.shape, f.x, f.y, f.facing, tw.x, tw.y, tw.w, tw.h)) continue;
      f.swingHits.add(tw);
      this.damageTower(tw, w.damage * f.damageMult, f);
    }

    if (this.quest?.stage === QUEST.nightStage && f.team === 0) {
      const hit = 40 * S;
      for (const candle of this.nightCandles) {
        if (!candle.lit || f.swingHits.has(candle)) continue;
        if (!shapeHitsRect(w.shape, f.x, f.y, f.facing, candle.x, candle.y, hit, hit)) continue;
        f.swingHits.add(candle);
        this.snuffCandle(candle);
      }
    }

    const lantern = this.lantern;
    if (lantern?.alive && f.team !== lantern.team && !f.swingHits.has(lantern) &&
      shapeHitsRect(w.shape, f.x, f.y, f.facing, lantern.x, lantern.y, lantern.w, lantern.h)) {
      f.swingHits.add(lantern);
      this.damageLantern(w.damage * f.damageMult, f);
    }

    // You can only break your own team's princess out.
    for (const wall of this.walls) {
      if (wall.team !== f.team || wall.hp <= 0 || this.over || f.swingHits.has(wall)) continue;
      const o = wall.o;
      if (shapeHitsRect(w.shape, f.x, f.y, f.facing, o.x, o.y, o.w, o.h)) {
        f.swingHits.add(wall);
        const dmg = w.damage * f.damageMult;
        this.stats[f.index].wall += Math.min(wall.hp, dmg);
        wall.hp = Math.max(0, wall.hp - dmg);
        wall.lastHitter = f;
        wall.shakeT = 0.12;
        sfx.wallHit();
        this.fx.hitSpark(o.x + Phaser.Math.Between(-30, 30), o.y + Phaser.Math.Between(-30, 30), 0xd8d0c0);
        this.popText(o.x + Phaser.Math.Between(-30, 30), o.y - o.h / 2 - 10, `-${Math.round(dmg)}`, '#f2c94c');
        if (wall.hp <= 0) this.breakWall(wall);
      }
    }
  }

  spawnProjectile(f: Fighter, e: Extract<ItemEffect, { kind: 'projectile' }>) {
    const fx = Math.cos(f.facing);
    const fy = Math.sin(f.facing);
    this.projectiles.push({
      owner: f, team: f.team, effect: e, dead: false, traveled: 0, radius: e.radius,
      x: f.x + fx * (f.radius + e.radius + 2),
      y: f.y + fy * (f.radius + e.radius + 2),
      vx: fx * e.speed,
      vy: fy * e.speed,
    });
  }

  onSkillCast(f: Fighter, e: SkillEffect, mx: number, my: number) {
    const facing = Math.hypot(mx, my) > 0.1 && e.kind === 'dash' ? Math.atan2(my, mx) : f.facing;
    this.fx.skillCast(() => ({ x: f.x, y: f.y }), e, facing);
    if (e.kind.startsWith('team')) {
      for (const ally of this.fighters) {
        if (ally !== f && ally.alive && !f.isEnemy(ally)) this.fx.skillCast(() => ({ x: ally.x, y: ally.y }), e, ally.facing);
      }
    }
  }

  popText(x: number, y: number, text: string, color: string) {
    const t = this.add
      .text(x, y, text, { fontFamily: FONT, resolution: RES, fontSize: '21px', fontStyle: 'bold', color, stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5);
    this.lTop.add(t);
    this.tweens.add({ targets: t, y: y - 32, alpha: 0, duration: 650, onComplete: () => t.destroy() });
  }

  // ---------- internals ----------

  /** Apply a hit and record it in the round stats. */
  private dealDamage(from: Fighter | undefined, to: Fighter, dmg: number, dx: number, dy: number, knockback: number, hitstun: number, soulGain = true) {
    if (to.trapped) return;
    const before = to.hp;
    const taken = to.stats.taken;
    to.takeHit(dmg, dx, dy, knockback, hitstun);
    // Measure damage before any automatic revival restores the target's HP.
    const actual = to.stats.taken - taken;
    this.fx.hitSpark(to.x - dx * to.radius * 0.6, to.y - dy * to.radius * 0.6, from?.color ?? 0xffffff);
    if (!from) return; // tower arrows don't count towards anyone's stats
    // Hurting enemies fills your soul (lightning itself doesn't, so it can't chain); being hurt fills a little too.
    if (soulGain) {
      from.addSoul(actual);
      to.addSoul(actual * SOUL_FROM_HURT);
    }
    this.stats[from.index].dealt += actual;
    if (before > 0 && !to.alive) this.stats[from.index].kos++;
  }

  // ---------- pause & results ----------

  /** A player's controller dropped out (Joy-Cons fall asleep): freeze the fight and say so until it's back. */
  private padHold = false;
  private padHoldPaused = false;
  private padOverlay: Phaser.GameObjects.Container | null = null;

  private holdForLostPads(): boolean {
    const lost = this.over ? [] : this.fighters.filter((f) => f.controller.connected === false);
    if (lost.length === 0) {
      if (this.padHold) {
        this.padHold = false;
        this.padOverlay?.destroy();
        this.padOverlay = null;
        if (this.padHoldPaused) this.setPaused(false);
      }
      return false;
    }
    if (!this.padHold) {
      this.padHold = true;
      this.padHoldPaused = !this.paused;
      if (this.padHoldPaused) this.setPaused(true);
    }
    const who = lost.map((f) => this.fighterLabel(f)).join(' ');
    if (!this.padOverlay) {
      const dim = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, 0.55).setOrigin(0, 0);
      const msg = txt(this, WIDTH / 2, HEIGHT / 2, T().padLost(who), 28, '#ffd27a', { title: true, bold: true, origin: 0.5, stroke: '#000000', strokeThickness: 5, wrap: 900, align: 'center' });
      this.padOverlay = this.add.container(0, 0, [dim, msg]).setDepth(900);
    } else {
      (this.padOverlay.list[1] as Phaser.GameObjects.Text).setText(T().padLost(who));
    }
    return true;
  }

  private setPaused(on: boolean) {
    this.paused = on;
    if (on) {
      this.physics.pause();
      this.tweens.pauseAll();
    } else {
      this.physics.resume();
      this.tweens.resumeAll();
    }
    this.time.paused = on;
  }

  private openPause() {
    this.setPaused(true);
    this.openModal({
      w: 440,
      h: 420,
      title: T().pauseTitle,
      depth: 400,
      onClose: () => this.setPaused(false),
      build: (m) => {
        const items: [string, () => void][] = [
          [T().resume, () => m.close()],
          [this.quest ? T().questRetry : T().restart, () => this.restartRound()],
          [T().toLobby, () => this.scene.start('Lobby')],
          [T().toTitle, () => this.scene.start('Title')],
        ];
        items.forEach(([label, onPress], i) => {
          addButton(this, m.content, m.nav, { id: `p${i}`, x: WIDTH / 2, y: m.y + 110 + i * 66, w: 280, h: 50, label, primary: i === 0, size: 20, onPress });
        });
      },
    });
  }

  private openResults(msg: string, color: string) {
    // Extra column: wall damage (Save the Princess) or tower damage (Siege).
    const objective = this.mode === 'princess' || this.mode === 'siege' || isQuestMode(this.mode);
    // In Quest only the party is listed.
    const listed = this.quest && !this.isMixedQuest ? this.fighters.filter((f) => f.team === this.questTeam) : this.fighters;
    const awards = selectMatchAwards(listed, this.winningTeam, !!this.quest && !this.isMixedQuest);
    this.openModal({
      w: 1160,
      // Grows with the number of fighters (up to 8 rows).
      h: 350 + listed.length * 42,
      title: T().results,
      depth: 400,
      closable: false,
      build: (m) => {
        m.content.add(txt(this, WIDTH / 2, m.y + 92, msg, 40, color, { title: true, bold: true, origin: 0.5, stroke: '#000000', strokeThickness: 5 }));
        const awardW = (m.w - 80) / 2;
        ([{ label: 'MVP', fighter: awards.mvp, color: C.gold, textColor: C.goldHex },
          { label: 'SVP', fighter: awards.svp, color: 0xa8a4e8, textColor: '#c1bdff' }]).forEach((award, n) => {
          const x = m.x + 32 + n * (awardW + 16);
          const y = m.y + 122;
          const ag = this.add.graphics();
          ag.fillStyle(award.color, 0.1).fillRoundedRect(x, y, awardW, 52, 8);
          ag.lineStyle(1, award.color, 0.7).strokeRoundedRect(x, y, awardW, 52, 8);
          ag.fillStyle(award.color, 0.08).fillCircle(x + 28, y + 27, 19);
          // Small laurel sprigs frame the winner's weapon like a medal.
          for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {
            ag.lineStyle(1, award.color, 0.45).lineBetween(x + 28 + side * (16 + k), y + 40 - k * 7, x + 28 + side * (22 + k), y + 37 - k * 7);
          }
          const f = award.fighter;
          if (f) drawWeaponIcon(ag, f.weapon.id, x + 28, y + 28, 27, f.color);
          m.content.add(ag);
          m.content.add(txt(this, x + 52, y + 14, award.label, 13, award.textColor, { bold: true, origin: [0, 0.5] }));
          m.content.add(txt(this, x + 52, y + 35, f ? `${this.fighterLabel(f)}  ${T().weaponName(f.weapon)}` : T().noAward, 17, C.text, { bold: true, origin: [0, 0.5] }));
          if (f) m.content.add(txt(this, x + awardW - 18, y + 28, T().awardScore(Math.round(performanceScore(f.stats))), 18, award.textColor, { bold: true, origin: [1, 0.5] }));
        });
        const left = m.x + 32;
        const playerW = 200;
        const columns: { label: string; key: keyof MatchStats | 'score' }[] = [
          { label: T().score, key: 'score' },
          { label: T().dealt, key: 'dealt' },
          { label: T().kos, key: 'kos' },
          { label: T().deaths, key: 'deaths' },
          { label: T().taken, key: 'taken' },
          { label: T().recovered, key: 'recovered' },
          { label: T().skillsUsed, key: 'skills' },
          { label: T().itemsUsed, key: 'items' },
          { label: T().revives, key: 'revives' },
          ...(objective ? [{ label: this.quest ? T().objectiveDmg : this.mode === 'princess' ? T().wallDmg : T().towerDmg, key: 'wall' as const }] : []),
        ];
        const colW = (m.w - 64 - playerW) / columns.length;
        const colX = (n: number) => left + playerW + (n + 0.5) * colW;
        const headY = m.y + 210;
        m.content.add(txt(this, left + 12, headY, T().weapon, 14, C.dim, { origin: [0, 0.5] }));
        columns.forEach((c, n) => m.content.add(txt(this, colX(n), headY, c.label, 14, C.dim, { origin: 0.5, align: 'center' })));
        const g = this.add.graphics();
        g.lineStyle(1, C.border, 1).lineBetween(left, headY + 20, m.x + m.w - 32, headY + 20);
        m.content.add(g);
        const rows = rankMatchResults(listed, this.winningTeam, this.mode !== 'ffa');
        rows.forEach((f, r) => {
          const y = headY + 40 + r * 42;
          const st = this.stats[f.index];
          const award = f === awards.mvp ? 'MVP' : f === awards.svp ? 'SVP' : null;
          const awardColor = award === 'MVP' ? C.gold : 0xa8a4e8;
          const rg = this.add.graphics();
          rg.fillStyle(r % 2 ? 0x1a1f2a : 0x161a23, 1).fillRoundedRect(left, y - 18, m.w - 64, 36, 6);
          if (award) rg.lineStyle(1, awardColor, 0.7).strokeRoundedRect(left, y - 18, m.w - 64, 36, 6);
          rg.fillStyle(f.color, 1).fillCircle(left + 14, y, 7);
          if (this.mode !== 'ffa') rg.lineStyle(2, this.sideColor(f.team), 1).strokeCircle(left + 14, y, 10);
          m.content.add(rg);
          const player = txt(this, left + 30, y - (award ? 5 : 0), `${this.fighterLabel(f)}  ${T().weaponName(f.weapon)}`, 16, C.text, { bold: true, origin: [0, 0.5] });
          player.setScale(Math.min(1, (playerW - 38) / player.width));
          m.content.add(player);
          if (award) m.content.add(txt(this, left + 30, y + 11, award, 10, toHex(awardColor), { bold: true, origin: [0, 0.5] }));
          columns.forEach((c, n) => m.content.add(txt(this, colX(n), y, String(Math.round(c.key === 'score' ? performanceScore(st) : st[c.key])), 20, C.text, { bold: true, origin: 0.5 })));
        });
        m.content.add(txt(this, WIDTH / 2, m.y + m.h - 106, T().resultsHint, 12, C.dim, { origin: 0.5, align: 'center', wrap: m.w - 80 }));
        m.content.add(txt(this, WIDTH / 2, m.y + m.h - 82, T().awardHint, 11, C.dim, { origin: 0.5, align: 'center', wrap: m.w - 80 }));
        const by = m.y + m.h - 46;
        // A finished game goes back to the fighter setup (no instant rematch); Quest keeps its own retry.
        const buttons: { id: string; label: string; onPress: () => void }[] = [
          ...(this.quest ? [{ id: 'again', label: T().questRestart, onPress: () => this.enterRound({ slots: this.lobbySlots, mode: this.mode, mapId: this.mapChoice, quest: { ...prepareQuest(), side: this.quest?.side, rule: this.quest?.rule } }) }] : []),
          { id: 'lobby', label: T().toLobby, onPress: () => this.scene.start('Lobby') },
          { id: 'title', label: T().toTitle, onPress: () => this.scene.start('Title') },
        ];
        buttons.forEach((b, i) => addButton(this, m.content, m.nav, {
          id: b.id, x: WIDTH / 2 + (i - (buttons.length - 1) / 2) * 220, y: by, w: 200, h: 48, label: b.label, primary: i === 0, onPress: b.onPress,
        }));
      },
    });
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      const e = p.effect;
      const px = p.x;
      const py = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.traveled += Math.hypot(p.vx, p.vy) * dt;
      // Off a crystal: flip whichever way it came in through, and go back to where it was.
      const crystal = p.ignoreObstacles ? undefined : this.bouncers.find((r) => Phaser.Geom.Rectangle.Contains(r, p.x, p.y));
      if (crystal) {
        if (px < crystal.x || px > crystal.right) p.vx = -p.vx;
        else p.vy = -p.vy;
        p.x = px;
        p.y = py;
        this.fx.sparks(p.x, p.y, 0x9fe8ff, 5);
        sfx.crystal();
      }
      const out = !Phaser.Geom.Rectangle.Contains(this.arenaRect, p.x, p.y);
      const sealed = this.quest?.stage === QUEST.rescueStage && !this.rescueGateOpen && p.team === 0 && p.x > this.rescueGateX;
      const wall =
        this.shotBlockers.some((r) => Phaser.Geom.Rectangle.Contains(r, p.x, p.y)) ||
        this.chests.some((c) => Math.abs(p.x - c.x) < c.w / 2 && Math.abs(p.y - c.y) < c.h / 2);
      const tower = p.ignoreObstacles ? undefined : this.towers.find((tw) => tw.alive && Phaser.Geom.Rectangle.Contains(tw.rect, p.x, p.y));
      if (tower) {
        // Enemy shots damage the tower; friendly ones just stop.
        if (tower.team !== p.team) this.damageTower(tower, e.damage * (p.owner?.role.attack ?? 1), p.owner);
        p.dead = true;
        continue;
      }
      const keg = p.ignoreObstacles ? undefined : this.kegs.find((k) => k.alive && Phaser.Geom.Rectangle.Contains(k.rect, p.x, p.y));
      if (keg) {
        this.explodeKeg(keg);
        p.dead = true;
        continue;
      }
      if (out || sealed || (wall && !p.ignoreObstacles) || p.traveled > e.range) {
        if (sealed) this.fx.sparks(this.rescueGateX, p.y, 0xd4a9ef, 4);
        p.dead = true;
        continue;
      }
      const lantern = this.lantern;
      if (lantern?.alive && p.team !== lantern.team && Math.abs(p.x - lantern.x) <= lantern.w / 2 + p.radius && Math.abs(p.y - lantern.y) <= lantern.h / 2 + p.radius) {
        this.damageLantern(e.damage * (p.owner?.role.attack ?? 1), p.owner);
        p.dead = true;
        continue;
      }
      for (const t of this.fighters) {
        if (t.team === p.team || !t.alive || t.untouchable) continue;
        if (Math.hypot(t.x - p.x, t.y - p.y) > t.radius + p.radius) continue;
        const s = Math.hypot(p.vx, p.vy);
        this.dealDamage(p.owner, t, e.damage * (p.owner?.role.attack ?? 1), p.vx / s, p.vy / s, e.knockback, e.hitstun);
        p.dead = true;
        break;
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) if (this.projectiles[i].dead) this.projectiles.splice(i, 1);
  }

  /** Big 5, 4, 3, 2, 1, FIGHT! in the middle of the arena. */
  private startCountdown() {
    const labels = [...Array.from({ length: COUNTDOWN }, (_, i) => String(COUNTDOWN - i)), T().fight];
    labels.forEach((label, i) => {
      this.time.delayedCall((BATTLE_READY_SECONDS + i) * 1000, () => {
        const go = i === labels.length - 1;
        if (go) sfx.countdownGo();
        else sfx.countdownTick();
        const t = this.add
          .text(WIDTH / 2, SCREEN_MID_Y, label, {
            fontFamily: FONT, resolution: RES, fontSize: go ? '96px' : '120px', fontStyle: 'bold',
            color: go ? '#f2c94c' : '#ffffff', stroke: '#000000', strokeThickness: 10,
          })
          .setOrigin(0.5)
          .setDepth(30)
          .setScale(1.6)
          .setAlpha(0);
        this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 180, ease: 'Back.easeOut' });
        this.tweens.add({ targets: t, alpha: 0, scale: 0.8, delay: go ? 650 : 700, duration: 250, onComplete: () => t.destroy() });
      });
    });
  }

  // ---------- watchtowers ----------

  /** Two towers per team on its own half (sides follow `flip`), nudged clear of map obstacles. */
  private placeTowers(flip: boolean) {
    const bodies = this.fighters.map((f) => f.body);
    for (const team of [0, 1]) {
      for (const spot of towerSpots(sideOf(team, flip))) {
        const st = TOWER_STATS[spot.kind];
        const size = st.size;
        const p = this.freeSpot(toWorld(spot), [], size / 2 + 10);
        const body = this.physics.add.staticBody(p.x - size / 2, p.y - size / 2, size, size);
        const collider = this.physics.add.collider(bodies, body);
        const rect = new Phaser.Geom.Rectangle(p.x - size / 2, p.y - size / 2, size, size);
        this.obstacleRects.push(rect);
        const members = this.fighters.filter((f) => f.team === team).length;
        const hp = (st.hp * Math.max(2, members)) / 2;
        this.towers.push({
          team, main: spot.kind === 'main', x: p.x, y: p.y, w: size, h: size, hp, maxHp: hp, alive: true, shakeT: 0, body, collider, rect,
          range: st.range, fireInterval: st.fireInterval, reload: st.fireInterval, aura: st.aura, arrow: st.arrow,
        });
      }
    }
  }

  thunderStrike(f: Fighter, level: number) {
    // The nearest enemies, struck one after another from closest to farthest.
    const count = summonStrikeCount('soulThunder', level, f.boss);
    const targets = this.summonTargets(f, count);
    const tally = this.summonTally(f, '⚡', 0xc9d6ff, targets.length);
    targets.forEach((t, k) => {
      this.time.delayedCall(k * SOUL_THUNDER.stagger * 1000, () => {
        if (!t.alive || t.untouchable || this.over) return tally(null);
        sfx.skyThunder();
        this.fx.skyBolt(t.x, t.y);
        this.fx.summonPulse(() => ({ x: f.x, y: f.y }), 0xffffff, 0.35);
        // Every bolt paralyses; one that hits also hurts and paralyses longer.
        // Hit chance follows soul spent, with a small boss-only bonus.
        if (Math.random() >= summonHitChance(soulHitChance(SOUL_THUNDER.hitChance, level), f.boss)) {
          this.summonResult(t, false, 0xc9d6ff);
          t.paralyze(SOUL_MISS_PARALYZE);
          return tally(false);
        }
        this.summonResult(t, true, 0xc9d6ff);
        this.dealDamage(f, t, Phaser.Math.Between(SOUL_THUNDER.minDamage, SOUL_THUNDER.maxDamage), 0, 0, 0, 0, false);
        if (t.alive) t.paralyze(SOUL_THUNDER.paralyze);
        tally(true);
      });
    });
  }

  /** A summon strike's verdict, big and clear over the target. */
  private summonResult(t: Fighter, hit: boolean, color: number) {
    const label = txt(this, t.x, t.y - 52, hit ? T().summonHit : T().summonMiss, hit ? 26 : 22, hit ? toHex(color) : '#9aa0ab', {
      title: true, bold: true, origin: 0.5, stroke: '#000000', strokeThickness: 5,
    });
    this.lTop.add(label);
    label.setScale(1.6).setAlpha(0);
    this.tweens.add({ targets: label, scale: 1, alpha: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: label, y: label.y - 26, alpha: 0, delay: 700, duration: 450, onComplete: () => label.destroy() });
  }

  /**
   * Counts a summon's strikes as they land; once all are in, shows "hit 2 / 3" over the
   * caster. Call the returned function once per target with true (hit), false (miss) or
   * null (the target was gone by then).
   */
  private summonTally(f: Fighter, icon: string, color: number, total: number) {
    let done = 0;
    let hits = 0;
    return (hit: boolean | null) => {
      done++;
      if (hit) hits++;
      if (done < total || !f.alive) return;
      const msg = txt(this, f.x, f.y - 44, `${icon} ${T().summonTally(hits, total)}`, 18, hits > 0 ? toHex(color) : '#9aa0ab', {
        bold: true, origin: 0.5, stroke: '#000000', strokeThickness: 4,
      });
      this.lTop.add(msg);
      this.tweens.add({ targets: msg, y: msg.y - 30, alpha: 0, delay: 900, duration: 500, onComplete: () => msg.destroy() });
    };
  }

  /** Throttle for the "can't summon" notices, per fighter. */
  private summonNoticeAt = new Map<Fighter, number>();

  summonBlocked(f: Fighter, reason: 'soul' | 'target') {
    const now = this.time.now;
    if ((this.summonNoticeAt.get(f) ?? 0) > now) return;
    this.summonNoticeAt.set(f, now + 700);
    this.popText(f.x, f.y - 40, reason === 'soul' ? T().needSoul : T().noTarget, reason === 'soul' ? '#c9a6ff' : '#9aa0ab');
  }

  hasSummonTarget(f: Fighter) {
    return this.summonTargets(f, 1).length > 0;
  }

  sacrifice(f: Fighter, e: Extract<SkillEffect, { kind: 'sacrifice' }>) {
    sfx.sacrifice();
    this.fx.sacrificeBlast(f.x, f.y, e.radius);
    this.screenFlash(0xff2a2a, 0.2);
    for (const t of this.fighters) {
      if (!t.alive || !f.isEnemy(t) || t.untouchable) continue;
      const dx = t.x - f.x;
      const dy = t.y - f.y;
      const d = Math.hypot(dx, dy);
      if (d > e.radius + t.radius) continue;
      this.dealDamage(f, t, e.hpCost * 2, dx / (d || 1), dy / (d || 1), e.knockback, 0.35);
    }
  }

  holyFireStrike(f: Fighter, level: number) {
    const count = summonStrikeCount('soulFire', level, f.boss);
    const targets = this.summonTargets(f, count);
    const tally = this.summonTally(f, '🔥', 0xffd27a, targets.length);
    targets.forEach((t, k) => {
      this.time.delayedCall(k * SOUL_FIRE.stagger * 1000, () => {
        if (!t.alive || t.untouchable || this.over) return tally(null);
        sfx.holyFire();
        this.fx.holyFlame(t.x, t.y);
        this.fx.summonPulse(() => ({ x: f.x, y: f.y }), 0xffc04a, 0.15);
        if (Math.random() >= summonHitChance(soulHitChance(SOUL_FIRE.hitChance, level), f.boss)) {
          this.summonResult(t, false, 0xffd27a);
          t.paralyze(SOUL_MISS_PARALYZE);
          return tally(false);
        }
        this.summonResult(t, true, 0xffd27a);
        this.dealDamage(f, t, Phaser.Math.Between(SOUL_FIRE.minDamage, SOUL_FIRE.maxDamage), 0, 0, 0, 0, false);
        if (t.alive) t.paralyze(SOUL_FIRE.paralyze);
        tally(true);
      });
    });
  }

  treeStrike(f: Fighter, level: number) {
    const count = summonStrikeCount('soulTree', level, f.boss);
    const targets = this.summonTargets(f, count);
    const tally = this.summonTally(f, '🌳', 0x9fe89a, targets.length);
    targets.forEach((t, k) => {
      this.time.delayedCall(k * SOUL_TREE.stagger * 1000, () => {
        if (!t.alive || t.untouchable || this.over) return tally(null);
        sfx.sacredTree();
        this.fx.treeRoots(t.x, t.y);
        if (Math.random() >= summonHitChance(SOUL_TREE.hitChance, f.boss)) {
          this.summonResult(t, false, 0x9fe89a);
          t.paralyze(SOUL_MISS_PARALYZE);
          return tally(false);
        }
        this.summonResult(t, true, 0x9fe89a);
        this.dealDamage(f, t, SOUL_TREE.damage, 0, 0, 0, 0, false);
        if (t.alive) t.paralyze(SOUL_TREE.paralyze);
        tally(true);
      });
    });
    this.fx.summonPulse(() => ({ x: f.x, y: f.y }), 0x6adf7a, 0.15);
  }

  reaperStrike(f: Fighter, level: number) {
    const count = summonStrikeCount('soulReaper', level, f.boss);
    const targets = this.summonTargets(f, count);
    const tally = this.summonTally(f, '☠', 0xc9a6ff, targets.length);
    targets.forEach((t, k) => {
      this.time.delayedCall(k * SOUL_REAPER.stagger * 1000, () => {
        if (!t.alive || t.untouchable || this.over) return tally(null);
        // The reaper rises behind them; whether he catches them is decided now and shown in the effect.
        const hit = Math.random() < summonHitChance(soulHitChance(SOUL_REAPER.hitChance, level), f.boss);
        sfx.reaper();
        this.fx.reaperCatch(() => ({ x: t.x, y: t.y }), hit);
        this.fx.summonPulse(() => ({ x: f.x, y: f.y }), 0x5a1a8a, 0.3);
        this.time.delayedCall(REAPER_SWING * 1000, () => tally(this.reaperSwing(f, t, hit)));
      });
    });
  }

  /** The reaper's scythe lands: a miss just stuns; a hit is a crushing blow, often fatal. */
  private reaperSwing(f: Fighter, t: Fighter, hit: boolean): boolean | null {
    if (!t.alive || this.over) return null;
    sfx.scythe();
    if (!hit) {
      this.summonResult(t, false, 0xc9a6ff);
      t.paralyze(SOUL_MISS_PARALYZE);
      return false;
    }
    // Caught. Substitution can still step aside; damage reduction cannot.
    this.summonResult(t, true, 0xff6a8a);
    this.fx.summonPulse(() => ({ x: f.x, y: f.y }), 0xff2a4a, 0.3);
    if (!this.reap(f, t)) return false;
    if (t.alive) {
      t.paralyze(SOUL_REAPER.paralyze);
      return true;
    }
    this.popText(t.x, t.y - 36, T().reaperKill, '#ff4a6a');
    this.fx.summonPulse(() => ({ x: f.x, y: f.y }), 0xff2a4a, 0.4);
    sfx.deathGong();
    // A big 死 stamped over the fallen.
    const stamp = txt(this, t.x, t.y, T().deathStamp, 72, '#ff3a5a', { title: true, bold: true, origin: 0.5, stroke: '#1a0008', strokeThickness: 8 });
    this.lTop.add(stamp);
    stamp.setScale(2.2).setAlpha(0);
    this.tweens.add({ targets: stamp, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: stamp, alpha: 0, delay: 1000, duration: 500, onComplete: () => stamp.destroy() });
    return true;
  }

  /** Main towers slowly transfer their own HP to wounded teammates inside their aura. */
  private updateTowerHealing(dt: number) {
    this.towerHeals = [];
    for (const tw of this.towers) {
      if (!tw.alive || !tw.main) continue;
      for (const f of this.fighters) {
        if (!f.alive || f.team !== tw.team || f.hp >= f.maxHp || Math.hypot(f.x - tw.x, f.y - tw.y) >= tw.aura) continue;
        const spare = tw.hp - tw.maxHp * MAIN_TOWER_HEAL.floor;
        const give = Math.min(MAIN_TOWER_HEAL.perSec * dt, f.maxHp - f.hp, spare);
        if (give <= 0) continue;
        f.hp += give;
        f.stats.recovered += give;
        tw.hp -= give;
        this.towerHeals.push({ tower: tw, f });
      }
    }
  }

  inTowerAura(f: Fighter): boolean {
    return this.towers.some((tw) => tw.alive && tw.team === f.team && Math.hypot(f.x - tw.x, f.y - tw.y) < tw.aura);
  }

  /** Towers shoot the nearest visible enemy in range. */
  private updateTowers(dt: number) {
    for (const tw of this.towers) {
      if (!tw.alive || tw.tree) continue;
      tw.reload -= dt;
      if (tw.reload > 0) continue;
      const targets = this.fighters.filter((f) => f.alive && f.team !== tw.team && !f.hidden && !f.untouchable && Math.hypot(f.x - tw.x, f.y - tw.y) < tw.range);
      if (targets.length === 0) continue;
      const t = targets.reduce((a, b) => (Math.hypot(a.x - tw.x, a.y - tw.y) < Math.hypot(b.x - tw.x, b.y - tw.y) ? a : b));
      tw.reload = tw.fireInterval;
      const a = Math.atan2(t.y - tw.y, t.x - tw.x);
      const start = tw.w / 2 + 10;
      this.projectiles.push({
        team: tw.team, effect: tw.arrow, dead: false, traveled: 0, radius: tw.arrow.radius, ignoreObstacles: true,
        x: tw.x + Math.cos(a) * start, y: tw.y + Math.sin(a) * start,
        vx: Math.cos(a) * tw.arrow.speed, vy: Math.sin(a) * tw.arrow.speed,
      });
      sfx.arrow();
    }
  }

  private damageTower(tw: Tower, dmg: number, by: Fighter | undefined) {
    if (!tw.alive || this.over) return;
    if (by && tw === this.questTree && this.rescueTreeSealed()) {
      this.popText(tw.x, tw.y - tw.h / 2 - 16, T().rescueSealed, '#d4a9ef');
      return;
    }
    const real = Math.min(tw.hp, dmg);
    tw.hp -= real;
    tw.shakeT = 0.12;
    if (by) this.stats[by.index].wall += real;
    sfx.wallHit();
    this.fx.hitSpark(tw.x + Phaser.Math.Between(-14, 14), tw.y + Phaser.Math.Between(-14, 14), 0xd8d0c0);
    this.popText(tw.x + Phaser.Math.Between(-16, 16), tw.y - tw.h / 2 - 10, `-${Math.round(real)}`, '#f2c94c');
    if (tw.hp <= 0) this.destroyTower(tw);
  }

  private destroyTower(tw: Tower) {
    tw.alive = false;
    if (tw.snare) this.releaseSnarePrisoner(tw);
    if (tw.tree) this.questTreeCast = null;
    if (tw.grove === 'summon') this.groveCast = null;
    tw.collider.destroy();
    tw.body.destroy();
    this.obstacleRects.splice(this.obstacleRects.indexOf(tw.rect), 1);
    sfx.wallBreak();
    this.fx.smoke(tw.x, tw.y, 24, 1.4);
    this.fx.hammerSmash(tw.x, tw.y, 50);
    this.showBanner(tw.grove ? T().groveTreeDown(tw.grove) : tw.tree ? T().questTreeDestroyed : (tw.main ? T().mainTowerDown : T().towerDown)(T().teamNames[tw.team]), this.sideColor(tw.team));
    // The attackers get a short War Drum.
    for (const f of this.fighters) if (f.alive && f.team !== tw.team) f.empower(1.3, 5);
  }

  // ---------- weather ----------

  /** Lightning storm: mark a few spots (one near a random fighter), strike them a moment later. */
  private updateStorm(dt: number) {
    const L = this.map.lightning;
    if (!L) return;
    this.stormT -= dt;
    if (this.stormT <= 0) {
      this.stormT = L.interval;
      const alive = this.fighters.filter((f) => f.alive);
      for (let k = 0; k < L.strikes; k++) {
        const near = k === 0 && alive.length > 0 ? alive[Math.floor(Math.random() * alive.length)] : null;
        const x = near ? near.x + (Math.random() - 0.5) * 120 : ARENA.x + 40 + Math.random() * (ARENA.w - 80);
        const y = near ? near.y + (Math.random() - 0.5) * 120 : ARENA.y + 40 + Math.random() * (ARENA.h - 80);
        this.stormMarks.push({ x: Phaser.Math.Clamp(x, ARENA.x + 20, ARENA.x + ARENA.w - 20), y: Phaser.Math.Clamp(y, ARENA.y + 20, ARENA.y + ARENA.h - 20), t: 0 });
      }
      sfx.thunder();
    }
    for (const m of this.stormMarks) {
      m.t += dt;
      if (m.t < L.warn) continue;
      sfx.skyThunder();
      this.fx.skyBolt(m.x, m.y);
      this.screenFlash(0xffffff, 0.2);
      for (const f of this.fighters) {
        if (!f.alive || f.untouchable) continue;
        const dx = f.x - m.x;
        const dy = f.y - m.y;
        const d = Math.hypot(dx, dy);
        if (d < L.radius + f.radius) this.dealDamage(undefined, f, L.damage, dx / (d || 1), dy / (d || 1), 320, 0.4);
      }
    }
    this.stormMarks = this.stormMarks.filter((m) => m.t < L.warn);
  }

  /** Fire vents: pick a few, mark them, then they erupt and burn anyone standing on them. */
  private updateVents(dt: number) {
    const V = this.map.vents;
    if (!V) return;
    this.ventT -= dt;
    if (this.ventT <= 0) {
      this.ventT = V.interval;
      const spots = [...V.spots].sort(() => Math.random() - 0.5).slice(0, V.count);
      for (const s of spots) this.ventMarks.push({ ...toWorld(s), t: 0 });
      sfx.rumble();
    }
    for (const m of this.ventMarks) {
      m.t += dt;
      if (m.t < V.warn) continue;
      sfx.eruption();
      this.fx.eruption(m.x, m.y, V.radius);
      for (const f of this.fighters) {
        if (!f.alive || f.untouchable) continue;
        const dx = f.x - m.x;
        const dy = f.y - m.y;
        const d = Math.hypot(dx, dy);
        if (d < V.radius + f.radius) this.dealDamage(undefined, f, V.damage, dx / (d || 1), dy / (d || 1), 380, 0.35);
      }
      this.ignite(m.x, m.y, V.radius, 3.4, 14);
    }
    this.ventMarks = this.ventMarks.filter((m) => m.t < V.warn);
  }

  /** Leave a patch of fire. A fresh burst on the same spot keeps the old one burning. */
  private ignite(x: number, y: number, r: number, life: number, dps: number) {
    const existing = this.flamePatches.find((p) => Math.hypot(p.x - x, p.y - y) < 24);
    if (existing) {
      existing.t = 0;
      existing.life = life;
      existing.r = Math.max(existing.r, r);
      existing.dps = Math.max(existing.dps, dps);
      return;
    }
    this.flamePatches.push({ x, y, r, t: 0, life, dps, tick: 0 });
  }

  /** Braziers mark a spot, burst, and leave fire that burns anyone standing in it. */
  private updateFlames(dt: number) {
    const F = this.map.flames;
    if (F) {
      this.flameT -= dt;
      if (this.flameT <= 0) {
        this.flameT = F.interval;
        const busy = [...this.flameMarks, ...this.flamePatches];
        const free = F.spots.filter((s) => {
          const p = toWorld(s);
          return !busy.some((b) => Math.hypot(b.x - p.x, b.y - p.y) < 24);
        });
        const spots = [...(free.length ? free : F.spots)].sort(() => Math.random() - 0.5).slice(0, F.count);
        for (const s of spots) this.flameMarks.push({ ...toWorld(s), r: F.radius, dps: F.dps, life: F.life, t: 0 });
        if (spots.length) sfx.rumble();
      }
    }
    const warn = F?.warn ?? 1.2;
    for (const m of this.flameMarks) {
      m.t += dt;
      if (m.t < warn) continue;
      sfx.eruption();
      this.fx.eruption(m.x, m.y, m.r);
      this.ignite(m.x, m.y, m.r, m.life, m.dps);
    }
    this.flameMarks = this.flameMarks.filter((m) => m.t < warn);
    for (const p of this.flamePatches) {
      p.t += dt;
      p.tick += dt;
      if (p.tick < 0.5) continue;
      p.tick -= 0.5;
      for (const f of this.fighters) {
        if (!f.alive || f.untouchable || f.trapped) continue;
        if (Math.hypot(f.x - p.x, f.y - p.y) >= p.r) continue;
        f.takeChip(p.dps * 0.5);
      }
    }
    this.flamePatches = this.flamePatches.filter((p) => p.t < p.life);
  }

  private renderFlames(now: number) {
    const warn = this.map.flames?.warn ?? 1.2;
    for (const m of this.flameMarks) {
      const k = Math.min(1, m.t / warn);
      const pulse = 0.5 + 0.5 * Math.sin(now * (12 + k * 28));
      this.g.fillStyle(0xff5a1a, 0.1 + 0.24 * k).fillCircle(m.x, m.y, m.r * (0.4 + 0.6 * k));
      this.g.lineStyle(3, 0xffb03a, 0.4 + 0.5 * pulse).strokeCircle(m.x, m.y, m.r);
      if (Math.random() < 0.3) this.fx.ember(m.x + (Math.random() - 0.5) * 20, m.y + (Math.random() - 0.5) * 20);
    }
    for (const p of this.flamePatches) {
      const fade = Math.max(0.35, 1 - p.t / p.life);
      const flick = 0.8 + 0.2 * Math.sin(now * 9 + p.x);
      this.g.fillStyle(0x2a1006, 0.5 * fade).fillCircle(p.x, p.y, p.r);
      this.gGlow.fillStyle(0xff6a1a, 0.28 * flick).fillCircle(p.x, p.y, p.r * 0.9);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + now * 0.4;
        const px = p.x + Math.cos(a) * p.r * 0.42;
        const py = p.y + Math.sin(a) * p.r * 0.42;
        const h = (12 + 10 * Math.sin(now * 8 + k)) * flick;
        const sway = Math.sin(now * 6 + k) * 3;
        this.g.fillStyle(k % 2 ? 0xffe08a : 0xff6a1a, 0.85 * fade).fillTriangle(px - 6, py, px + 6, py, px + sway, py - h);
      }
    }
  }

  private renderVents(now: number) {
    const V = this.map.vents;
    if (!V) return;
    // Every vent smoulders; the ones about to blow glow brighter and shake out sparks.
    for (const s of V.spots) {
      const p = toWorld(s);
      const flick = 0.5 + 0.5 * Math.sin(now * 5 + p.x);
      this.gGlow.fillStyle(0xff6a1a, 0.12 + 0.08 * flick).fillCircle(p.x, p.y, 16);
    }
    for (const m of this.ventMarks) {
      const k = m.t / V.warn;
      const pulse = 0.5 + 0.5 * Math.sin(now * (12 + k * 30));
      this.g.fillStyle(0xff5a1a, 0.12 + 0.28 * k).fillCircle(m.x, m.y, V.radius * k);
      this.g.lineStyle(3, 0xffb03a, 0.4 + 0.5 * pulse).strokeCircle(m.x, m.y, V.radius);
      if (Math.random() < 0.3) this.fx.ember(m.x + (Math.random() - 0.5) * 20, m.y + (Math.random() - 0.5) * 20);
    }
  }

  /** Portals: step into one, come out of its partner (once you step off, you can use it again). */
  private updatePortals() {
    const P = this.map.portals;
    if (!P) return;
    const R = 24;
    for (const f of this.fighters) {
      if (!f.alive) continue;
      const lock = this.portalLock.get(f);
      if (lock) {
        if (Math.hypot(f.x - lock.x, f.y - lock.y) > R + f.radius + 6) this.portalLock.delete(f);
        continue;
      }
      for (const pair of P) {
        const a = toWorld(pair.a);
        const b = toWorld(pair.b);
        const from = Math.hypot(f.x - a.x, f.y - a.y) < R ? a : Math.hypot(f.x - b.x, f.y - b.y) < R ? b : null;
        if (!from) continue;
        const to = from === a ? b : a;
        this.fx.portalBurst(from.x, from.y, pair.color);
        f.warp(to.x, to.y);
        this.fx.portalBurst(to.x, to.y, pair.color);
        this.portalLock.set(f, to);
        sfx.portal();
        break;
      }
    }
  }

  private renderPortals(now: number) {
    for (const pair of this.map.portals ?? []) {
      for (const [k, s] of [pair.a, pair.b].entries()) {
        const p = toWorld(s);
        const spin = now * (k ? -2 : 2);
        this.g.fillStyle(0x000000, 0.4).fillCircle(p.x, p.y, 26);
        this.gGlow.fillStyle(pair.color, 0.25).fillCircle(p.x, p.y, 24);
        for (let r = 0; r < 3; r++) {
          const rr = 8 + r * 7;
          this.gGlow.lineStyle(2.5, pair.color, 0.8 - r * 0.2);
          this.gGlow.beginPath();
          this.gGlow.arc(p.x, p.y, rr, spin + r, spin + r + Math.PI * 1.3);
          this.gGlow.strokePath();
        }
      }
    }
  }

  /** Rolling boulders: warn which lane, then one rolls all the way across, flattening anyone in the way. */
  private updateRollers(dt: number) {
    const R = this.map.rollers;
    if (!R) return;
    this.rollT -= dt;
    if (this.rollT <= 0 && !this.rollWarn) {
      this.rollT = R.interval;
      const lane = R.lanes[Math.floor(Math.random() * R.lanes.length)];
      this.rollWarn = { y: toWorld({ x: 0, y: lane }).y, dir: Math.random() < 0.5 ? 1 : -1, t: 0 };
      sfx.rumble();
    }
    if (this.rollWarn) {
      this.rollWarn.t += dt;
      if (this.rollWarn.t >= R.warn) {
        const w = this.rollWarn;
        this.boulders.push({ x: w.dir > 0 ? ARENA.x - R.radius : ARENA.x + ARENA.w + R.radius, y: w.y, dir: w.dir, spin: 0, hit: new Set() });
        this.rollWarn = null;
        sfx.boulder();
      }
    }
    for (const b of this.boulders) {
      b.x += b.dir * R.speed * dt;
      b.spin += (b.dir * R.speed * dt) / R.radius;
      if (Math.random() < 0.3) this.fx.smoke(b.x - b.dir * R.radius, b.y + R.radius * 0.6, 1, 0.5);
      for (const f of this.fighters) {
        if (!f.alive || f.untouchable || b.hit.has(f)) continue;
        if (Math.hypot(f.x - b.x, f.y - b.y) > R.radius + f.radius) continue;
        b.hit.add(f);
        // Thrown forward and off to the side the fighter was on.
        const side = f.y < b.y ? -1 : 1;
        this.dealDamage(undefined, f, R.damage, b.dir * 0.6, side * 0.8, 560, 0.5);
      }
    }
    this.boulders = this.boulders.filter((b) => {
      const gone = b.x < ARENA.x - R.radius * 2 || b.x > ARENA.x + ARENA.w + R.radius * 2;
      if (gone) this.fx.smoke(Phaser.Math.Clamp(b.x, ARENA.x, ARENA.x + ARENA.w), b.y, 10, 1);
      return !gone;
    });
  }

  private renderRollers(now: number) {
    const R = this.map.rollers;
    if (!R) return;
    const w = this.rollWarn;
    if (w) {
      // The lane lights up, with arrows racing the way the boulder will come.
      const pulse = 0.5 + 0.5 * Math.sin(now * 16);
      this.g.fillStyle(0xff5a3a, 0.08 + 0.1 * pulse).fillRect(ARENA.x, w.y - R.radius, ARENA.w, R.radius * 2);
      for (let k = 0; k < 8; k++) {
        const x = ARENA.x + (((k / 8 + now * 0.8 * w.dir) % 1) + 1) % 1 * ARENA.w;
        this.gOver.lineStyle(4, 0xffd0a0, 0.5 + 0.4 * pulse);
        this.gOver.lineBetween(x - w.dir * 14, w.y - 12, x, w.y).lineBetween(x, w.y, x - w.dir * 14, w.y + 12);
      }
    }
    for (const b of this.boulders) {
      this.g.fillStyle(0x000000, 0.35).fillEllipse(b.x + 6, b.y + R.radius * 0.7, R.radius * 2.2, R.radius * 0.9);
      this.gOver.fillStyle(0x7a6a5a, 1).fillCircle(b.x, b.y, R.radius);
      this.gOver.lineStyle(3, 0x4a3e34, 1).strokeCircle(b.x, b.y, R.radius);
      // Cracks that turn as it rolls.
      for (let k = 0; k < 3; k++) {
        const a = b.spin + (k * Math.PI * 2) / 3;
        this.gOver.lineStyle(2, 0x4a3e34, 0.9).lineBetween(b.x + Math.cos(a) * 4, b.y + Math.sin(a) * 4, b.x + Math.cos(a) * R.radius * 0.8, b.y + Math.sin(a) * R.radius * 0.8);
      }
      this.gOver.fillStyle(0xa89a88, 0.6).fillCircle(b.x - R.radius * 0.3, b.y - R.radius * 0.35, R.radius * 0.3);
    }
  }

  /** Which spike set is up right now (0 or 1), and whether the other is about to rise. */
  private spikeState() {
    const C = this.map.spikeCycle!;
    const t = this.elapsedFight();
    const phase = Math.floor(t / C.period);
    return { up: phase % 2, rising: t - phase * C.period > C.period - C.warn };
  }

  /** Seconds of fighting so far (works in every mode, unlike the respawn clock). */
  private elapsedFight() {
    return Math.max(0, this.time.now / 1000 - this.fightStart);
  }

  private updateSpikes(dt: number) {
    const C = this.map.spikeCycle;
    if (!C) return;
    const { up } = this.spikeState();
    for (const f of this.fighters) {
      if (!f.alive || f.untouchable) continue;
      const z = this.zoneAt(f.x, f.y);
      if (z?.kind !== 'spikes' || z.group !== up) {
        this.spikeTick.delete(f);
        continue;
      }
      // Up spikes bite every half second you stand on them.
      const t = (this.spikeTick.get(f) ?? 0) - dt;
      if (t <= 0) {
        this.dealDamage(undefined, f, C.dps / 2, 0, 0, 0, 0.1);
        sfx.spikes();
        this.spikeTick.set(f, 0.5);
      } else this.spikeTick.set(f, t);
    }
  }

  private renderSpikes(now: number) {
    const C = this.map.spikeCycle;
    if (!C) return;
    const live = this.countdown <= 0;
    const { up, rising } = live ? this.spikeState() : { up: -1, rising: false };
    for (const z of this.map.zones ?? []) {
      if (z.kind !== 'spikes') continue;
      const r = toWorldRect(z);
      const isUp = z.group === up;
      const warn = rising && !isUp && Math.floor(now * 10) % 2 === 0;
      for (let y = r.y - r.h / 2 + 10; y < r.y + r.h / 2; y += 20) {
        for (let x = r.x - r.w / 2 + 10; x < r.x + r.w / 2; x += 20) {
          if (isUp) {
            this.g.fillStyle(0xd8dce8, 1).fillTriangle(x - 5, y + 5, x + 5, y + 5, x, y - 7);
            this.g.fillStyle(0x8a90a0, 1).fillTriangle(x, y - 7, x + 5, y + 5, x + 2, y + 5);
          } else {
            this.g.fillStyle(warn ? 0xff5a3a : 0x1a1a20, warn ? 0.9 : 0.8).fillCircle(x, y, 2.5);
          }
        }
      }
    }
  }

  // ---------- doors, kegs, bell, barrier, herbs ----------

  /** Physical bits some maps add: sliding doors, kegs, herb spots. */
  private setupMapFeatures() {
    const bodies = this.fighters.map((f) => f.body);
    const solid = (x: number, y: number, w: number, h: number) => {
      const body = this.physics.add.staticBody(x - w / 2, y - h / 2, w, h);
      this.physics.add.collider(bodies, body);
      return { rect: new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h), body };
    };
    for (const d of this.map.doors?.rects ?? []) {
      const r = toWorldRect(d);
      const { rect, body } = solid(r.x, r.y, r.w, r.h);
      body.enable = false;
      this.doors.push({ rect, body, group: d.group, closed: false });
    }
    this.updateDoors();
    for (const s of this.map.kegs?.spots ?? []) {
      const p = toWorld(s);
      const size = 30;
      const { rect, body } = solid(p.x, p.y, size, size);
      this.obstacleRects.push(rect);
      this.kegs.push({ x: p.x, y: p.y, size, alive: true, t: 0, rect, body });
    }
    this.herbs = (this.map.herbs?.spots ?? []).map((s) => ({ ...toWorld(s), grown: true, t: 0 }));
    this.bellT = this.map.bell?.interval ?? 0;
  }

  /** Doors: set 0 shut / set 1 open, swapping every period. Anyone caught in a closing door is nudged out. */
  private updateDoors() {
    const D = this.map.doors;
    if (!D) return;
    const shutGroup = Math.floor(this.elapsedFight() / D.period) % 2;
    for (const d of this.doors) {
      const shut = d.group === shutGroup;
      if (shut === d.closed) continue;
      d.closed = shut;
      d.body.enable = shut;
      if (shut) {
        this.obstacleRects.push(d.rect);
        this.shotBlockers.push(d.rect);
        for (const f of this.fighters) {
          if (!f.alive || !Phaser.Geom.Rectangle.Overlaps(d.rect, new Phaser.Geom.Rectangle(f.x - f.radius, f.y - f.radius, f.radius * 2, f.radius * 2))) continue;
          const spot = this.freeSpot({ x: f.x, y: f.y }, []);
          f.warp(spot.x, spot.y);
        }
        sfx.door();
      } else {
        this.obstacleRects.splice(this.obstacleRects.indexOf(d.rect), 1);
        this.shotBlockers.splice(this.shotBlockers.indexOf(d.rect), 1);
      }
    }
  }

  private renderDoors(now: number) {
    const D = this.map.doors;
    if (!D) return;
    const t = this.elapsedFight();
    const closingSoon = this.countdown <= 0 && t % D.period > D.period - D.warn;
    for (const d of this.doors) {
      const r = d.rect;
      if (d.closed) {
        // A shoji panel: wooden frame, paper squares.
        this.gOver.fillStyle(0x6a4424, 1).fillRect(r.x, r.y, r.width, r.height);
        this.gOver.fillStyle(0xf2ead8, 1).fillRect(r.x + 3, r.y + 3, r.width - 6, r.height - 6);
        this.gOver.lineStyle(1.5, 0x6a4424, 1);
        for (let x = r.x + 14; x < r.right - 4; x += 14) this.gOver.lineBetween(x, r.y, x, r.bottom);
        for (let y = r.y + 14; y < r.bottom - 4; y += 14) this.gOver.lineBetween(r.x, y, r.right, y);
      } else {
        // Open: just the track, flashing red when it's about to slide shut.
        const warn = closingSoon && Math.floor(now * 10) % 2 === 0;
        this.g.lineStyle(2, warn ? 0xff5a3a : 0x4a3424, warn ? 0.9 : 0.6).strokeRect(r.x, r.y, r.width, r.height);
      }
    }
  }

  private explodeKeg(k: (typeof this.kegs)[number]) {
    const K = this.map.kegs;
    if (!K || !k.alive) return;
    k.alive = false;
    k.t = K.respawn;
    k.body.enable = false;
    this.obstacleRects.splice(this.obstacleRects.indexOf(k.rect), 1);
    sfx.explosion();
    this.fx.bombBlast(k.x, k.y, K.radius);
    this.screenFlash(0xffa040, 0.25);
    for (const f of this.fighters) {
      if (!f.alive || f.untouchable) continue;
      const dx = f.x - k.x;
      const dy = f.y - k.y;
      const d = Math.hypot(dx, dy);
      if (d < K.radius + f.radius) this.dealDamage(undefined, f, K.damage, dx / (d || 1), dy / (d || 1), 600, 0.45);
    }
    // Chain reaction.
    for (const o of this.kegs) if (o.alive && Math.hypot(o.x - k.x, o.y - k.y) < K.radius * 1.3) this.time.delayedCall(160, () => this.explodeKeg(o));
  }

  private updateKegs(dt: number) {
    for (const k of this.kegs) {
      if (k.alive) continue;
      k.t -= dt;
      if (k.t > 0) continue;
      // Rolls back in once nobody's standing on the spot.
      if (this.fighters.some((f) => f.alive && Math.hypot(f.x - k.x, f.y - k.y) < k.size + f.radius)) continue;
      k.alive = true;
      k.body.enable = true;
      this.obstacleRects.push(k.rect);
      this.fx.smoke(k.x, k.y, 5, 0.6);
    }
  }

  private renderKegs(now: number) {
    for (const k of this.kegs) {
      if (!k.alive) continue;
      const r = k.size / 2;
      this.g.fillStyle(0x000000, 0.3).fillEllipse(k.x + 4, k.y + 6, k.size * 1.1, k.size * 0.6);
      this.gOver.fillStyle(0x8a1e1a, 1).fillCircle(k.x, k.y, r);
      this.gOver.lineStyle(3, 0x3a2a1a, 1).strokeCircle(k.x, k.y, r);
      this.gOver.lineStyle(2, 0x3a2a1a, 1).strokeCircle(k.x, k.y, r * 0.55);
      this.gOver.fillStyle(0xf2e6d0, 1).fillCircle(k.x, k.y, r * 0.35);
      this.gOver.fillStyle(0x1a1a1a, 1).fillCircle(k.x, k.y, r * 0.18);
      // The fuse fizzing.
      if (Math.random() < 0.3) this.gGlow.fillStyle(0xffd27a, 0.9).fillCircle(k.x + r * 0.7, k.y - r * 0.7, 2 + Math.sin(now * 30));
    }
  }

  /** The bell tolls: everyone near it is blasted outward, harder the closer they are. */
  private updateBell(dt: number) {
    const B = this.map.bell;
    if (!B) return;
    this.bellT -= dt;
    if (this.bellT > 0) return;
    this.bellT = B.interval;
    const c = toWorld(B);
    sfx.bell();
    this.fx.bellWave(c.x, c.y, B.radius);
    for (const f of this.fighters) {
      if (!f.alive || f.untouchable) continue;
      const dx = f.x - c.x;
      const dy = f.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d > B.radius) continue;
      const k = 1 - d / B.radius;
      this.dealDamage(undefined, f, Math.max(3, B.damage * k), dx / (d || 1), dy / (d || 1), 500 + 700 * k, 0.4);
    }
  }

  private renderBell(now: number) {
    const B = this.map.bell;
    if (!B) return;
    const c = toWorld(B);
    if (this.countdown <= 0 && this.bellT < B.warn) {
      // Rings closing in on the bell as it winds up.
      const k = 1 - this.bellT / B.warn;
      for (let i = 0; i < 3; i++) {
        const r = B.radius * (1 - ((k + i / 3) % 1));
        this.gGlow.lineStyle(3, 0xffd27a, 0.15 + 0.5 * k).strokeCircle(c.x, c.y, r);
      }
      this.gGlow.fillStyle(0xffd27a, 0.15 + 0.25 * k * (0.5 + 0.5 * Math.sin(now * 20))).fillCircle(c.x, c.y, 40);
    } else {
      this.g.lineStyle(1.5, 0xd9ae4a, 0.25).strokeCircle(c.x, c.y, B.radius);
    }
  }

  /** The safe circle right now (battlefield coords). */
  private barrierCircle() {
    const B = this.map.barrier!;
    const t = Phaser.Math.Clamp((this.elapsedFight() - B.delay) / B.duration, 0, 1);
    const c = toWorld({ x: WIDTH / 2, y: SCREEN_MID_Y });
    return { x: c.x, y: c.y, r: (B.start + (B.end - B.start) * t) * S };
  }

  private updateBarrier(dt: number) {
    const B = this.map.barrier;
    if (!B) return;
    if (!this.barrierAnnounced && this.elapsedFight() >= B.delay) {
      this.barrierAnnounced = true;
      this.showBanner(T().barrierShrink, 0xb57bff);
      sfx.rumble();
    }
    const c = this.barrierCircle();
    for (const f of this.fighters) {
      if (!f.alive || f.untouchable || Math.hypot(f.x - c.x, f.y - c.y) < c.r) {
        this.barrierTick.delete(f);
        continue;
      }
      const t = (this.barrierTick.get(f) ?? 0) - dt;
      if (t <= 0) {
        this.dealDamage(undefined, f, B.dps / 2, 0, 0, 0, 0);
        this.barrierTick.set(f, 0.5);
      } else this.barrierTick.set(f, t);
    }
  }

  private renderBarrier(now: number) {
    if (!this.map.barrier) return;
    const c = this.barrierCircle();
    // Everything outside the circle is tinted by drawing one enormous ring around it.
    const W = 2400;
    this.gOver.lineStyle(W, 0x6a2aaa, 0.28).strokeCircle(c.x, c.y, c.r + W / 2);
    const pulse = 0.5 + 0.5 * Math.sin(now * 4);
    this.gGlow.lineStyle(4, 0xc89aff, 0.5 + 0.4 * pulse).strokeCircle(c.x, c.y, c.r);
  }

  private updateHerbs(dt: number) {
    const H = this.map.herbs;
    if (!H) return;
    for (const h of this.herbs) {
      if (!h.grown) {
        h.t -= dt;
        if (h.t <= 0) h.grown = true;
        continue;
      }
      const f = this.fighters.find((o) => o.alive && o.hp < o.maxHp && Math.hypot(o.x - h.x, o.y - h.y) < o.radius + 16);
      if (!f) continue;
      const gained = f.heal(H.heal);
      this.popText(f.x, f.y - 30, `+${Math.round(gained)}`, '#7dff8a');
      sfx.heal();
      for (let k = 0; k < 6; k++) this.fx.leaf(h.x, h.y);
      h.grown = false;
      h.t = H.regrow;
    }
  }

  private renderHerbs(now: number) {
    const H = this.map.herbs;
    if (!H) return;
    for (const h of this.herbs) {
      const k = h.grown ? 1 : 1 - h.t / H.regrow;
      const size = 4 + 10 * k;
      if (h.grown) this.gGlow.fillStyle(0x7dff8a, 0.18 + 0.1 * Math.sin(now * 3 + h.x)).fillCircle(h.x, h.y, 20);
      for (let j = 0; j < 5; j++) {
        const a = (j / 5) * Math.PI * 2 + now * 0.3;
        this.gOver.fillStyle(h.grown ? 0x4ac85a : 0x6a8a4a, 1).fillEllipse(h.x + Math.cos(a) * size * 0.5, h.y + Math.sin(a) * size * 0.5, size * 0.9, size * 0.45);
      }
      if (h.grown) this.gOver.fillStyle(0xffe08a, 1).fillCircle(h.x, h.y, 3);
    }
  }

  /** Whirlpools: spiral arms turning towards the middle. */
  private renderVortex(now: number) {
    for (const z of this.map.zones ?? []) {
      if (z.kind !== 'vortex') continue;
      const c = toWorld(z);
      const R = (z.w * S) / 2;
      for (let arm = 0; arm < 4; arm++) {
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i <= 20; i++) {
          const u = i / 20;
          const a = now * 2 + arm * (Math.PI / 2) + u * 4;
          pts.push({ x: c.x + Math.cos(a) * R * (1 - u), y: c.y + Math.sin(a) * R * (1 - u) });
        }
        this.gOver.lineStyle(2, 0xdff6ff, 0.35).strokePoints(pts as Phaser.Math.Vector2[], false);
      }
    }
  }

  /** Launch pads: step on one and you're flung the way its arrow points. */
  private updatePads() {
    for (const f of this.fighters) {
      if (!f.alive) continue;
      const z = this.zoneAt(f.x, f.y);
      if (z?.kind !== 'pad' || !z.push) {
        this.padLock.delete(f);
        continue;
      }
      if (this.padLock.has(f)) continue;
      this.padLock.add(f);
      f.launch(z.push.x, z.push.y);
      sfx.dash();
      this.fx.smoke(f.x, f.y, 6, 0.6);
    }
  }

  private renderPads(now: number) {
    for (const z of this.map.zones ?? []) {
      if (z.kind !== 'pad' || !z.push) continue;
      const r = toWorldRect(z);
      const a = Math.atan2(z.push.y, z.push.x);
      const pulse = 0.5 + 0.5 * Math.sin(now * 5 + r.x);
      this.gGlow.fillStyle(0x6ad8ff, 0.18 + 0.15 * pulse).fillCircle(r.x, r.y, r.w / 2);
      // Chevrons running the way it throws you.
      for (let k = 0; k < 3; k++) {
        const d = ((now * 1.5 + k / 3) % 1) * r.w * 0.6 - r.w * 0.3;
        const cx = r.x + Math.cos(a) * d;
        const cy = r.y + Math.sin(a) * d;
        const px = -Math.sin(a) * 9;
        const py = Math.cos(a) * 9;
        this.gGlow.lineStyle(3, 0xdff6ff, 0.8).lineBetween(cx - Math.cos(a) * 7 + px, cy - Math.sin(a) * 7 + py, cx, cy).lineBetween(cx, cy, cx - Math.cos(a) * 7 - px, cy - Math.sin(a) * 7 - py);
      }
    }
  }

  /** Soul Altar: a team standing on it alone charges soul and PE fast. */
  private updateAltar(dt: number) {
    const z = this.map.zones?.find((zone) => zone.kind === 'altar');
    if (!z) return;
    const on = this.fighters.filter((f) => f.alive && this.zoneAt(f.x, f.y) === z);
    const teams = new Set(on.map((f) => f.team));
    this.altarTeam = teams.size === 1 ? [...teams][0] : -1;
    if (this.altarTeam < 0) return;
    for (const f of on) {
      f.addSoul(ALTAR.soulPerSec * dt);
      f.restorePe(ALTAR.pePerSec * dt);
    }
  }

  private renderAltar(now: number) {
    const z = this.map.zones?.find((zone) => zone.kind === 'altar');
    if (!z) return;
    const r = toWorldRect(z);
    const held = this.altarTeam >= 0;
    const color = held ? (this.mode === 'ffa' ? PLAYER_COLORS[this.altarTeam] ?? 0xb57bff : this.sideColor(this.altarTeam)) : 0xb57bff;
    const pulse = 0.5 + 0.5 * Math.sin(now * (held ? 8 : 2));
    this.gGlow.lineStyle(3, color, 0.4 + 0.4 * pulse).strokeCircle(r.x, r.y, r.w / 2);
    this.gGlow.fillStyle(color, (held ? 0.14 : 0.06) + 0.06 * pulse).fillCircle(r.x, r.y, r.w / 2);
    if (held) {
      // Soul rising off the altar.
      for (let k = 0; k < 6; k++) {
        const a = now * 1.5 + (k * Math.PI) / 3;
        const rise = (now * 40 + k * 20) % 50;
        this.gGlow.fillStyle(0xe2c8ff, 0.7 * (1 - rise / 50)).fillCircle(r.x + Math.cos(a) * r.w * 0.3, r.y + Math.sin(a) * r.w * 0.3 - rise, 3);
      }
    }
  }

  /** Fog banks: soft drifting clouds drawn over the fighters inside them. */
  private renderFog(now: number) {
    for (const [zi, z] of (this.map.zones ?? []).entries()) {
      if (z.kind !== 'fog') continue;
      const r = toWorldRect(z);
      for (let k = 0; k < 9; k++) {
        const fx = r.x - r.w / 2 + ((k * 0.37 + zi * 0.21) % 1) * r.w + Math.sin(now * 0.4 + k) * 14;
        const fy = r.y - r.h / 2 + ((k * 0.61 + zi * 0.13) % 1) * r.h + Math.cos(now * 0.3 + k) * 10;
        this.gOver.fillStyle(0xdde4ea, 0.16).fillEllipse(fx, fy, r.w * 0.55, r.h * 0.5);
      }
    }
  }

  /** Tide flats: water creeps in (warning), stays a while, then drains away. */
  private renderTide(now: number) {
    if (!this.map.tideCycle) return;
    const { flooded, rising, k } = this.tideState();
    if (!flooded && !rising) return;
    for (const z of this.map.zones ?? []) {
      if (z.kind !== 'tide') continue;
      const r = toWorldRect(z);
      const a = flooded ? 0.45 : 0.15 + 0.15 * k * (0.5 + 0.5 * Math.sin(now * 10));
      this.g.fillStyle(0x3aa8c8, a).fillRect(r.x - r.w / 2, r.y - r.h / 2, r.w, r.h);
      if (flooded) for (let y = r.y - r.h / 2 + 12; y < r.y + r.h / 2; y += 24) {
        this.g.lineStyle(1.5, 0xffffff, 0.3).lineBetween(r.x - r.w / 2, y + Math.sin(now * 2 + y) * 3, r.x + r.w / 2, y + Math.sin(now * 2 + y + 1) * 3);
      }
    }
  }

  /** Warning marks on the ground: a ring that tightens and a fill that grows until the strike. */
  private renderStorm(now: number) {
    const L = this.map.lightning;
    if (!L) return;
    for (const m of this.stormMarks) {
      const k = m.t / L.warn;
      const pulse = 0.5 + 0.5 * Math.sin(now * (10 + k * 30));
      this.g.fillStyle(0x9fb8ff, 0.1 + 0.25 * k).fillCircle(m.x, m.y, L.radius * k);
      this.g.lineStyle(2.5, 0xdfe8ff, 0.4 + 0.5 * pulse).strokeCircle(m.x, m.y, L.radius);
      this.gGlow.lineStyle(2, 0x8fb4ff, 0.3 * pulse).strokeCircle(m.x, m.y, L.radius * (1.4 - 0.4 * k));
    }
  }

  /** Streaks blowing through wind zones, so you can see which way they push. */
  private renderWind(now: number) {
    for (const [zi, z] of (this.map.zones ?? []).entries()) {
      if (z.kind !== 'wind' || !z.push) continue;
      const r = toWorldRect(z);
      const len = Math.hypot(z.push.x, z.push.y) || 1;
      const ux = z.push.x / len;
      const uy = z.push.y / len;
      for (let k = 0; k < 16; k++) {
        // Each streak loops along the push direction at its own speed and lane.
        const lane = ((k * 0.618 + zi * 0.3) % 1);
        const prog = (now * (0.35 + (k % 4) * 0.08) + k * 0.37) % 1;
        const x = r.x - r.w / 2 + (ux !== 0 ? (ux > 0 ? prog : 1 - prog) : lane) * r.w;
        const y = r.y - r.h / 2 + (uy !== 0 ? (uy > 0 ? prog : 1 - prog) : lane) * r.h;
        const a = Math.sin(prog * Math.PI) * 0.35;
        this.gOver.lineStyle(2, 0xffffff, a).lineBetween(x, y, x - ux * 26, y - uy * 26);
      }
    }
  }

  // ---------- 闖關 Quest ----------

  /** Prison tree or the warden-stage tree at the back. Null on every other stage. */
  private summonTreeConfig() {
    if (this.quest?.stage === QUEST.rescueStage) return QUEST.rescue.tree;
    if (this.quest?.stage === QUEST.wardenStage) return QUEST.wardens.tree;
    return null;
  }

  /** The summon tree marks one random living party member, then strikes that fixed spot. */
  private updateQuestTree(dt: number) {
    const config = this.summonTreeConfig();
    if (!config || this.over || !this.questTree?.alive) {
      this.questTreeCast = null;
      return;
    }
    if (this.paused || this.countdown > 0) return;
    if (this.questTreeCast) {
      const cast = this.questTreeCast;
      cast.elapsed += dt;
      if (cast.elapsed < cast.spell.warn * config.warnScale) return;
      this.questTreeCast = null;
      this.questTreeT = config.interval;
      this.strikeQuestTree(cast);
      return;
    }
    this.questTreeT -= dt;
    if (this.questTreeT > 0) return;
    const targets = this.fighters.filter((f) => f.team === 0 && f.alive && !f.untouchable);
    if (!targets.length) return;
    const target = targets[Math.floor(Math.random() * targets.length)];
    const spell = pickTreeSummon();
    this.questTreeCast = { spell, target, x: target.x, y: target.y, elapsed: 0 };
    const tree = toWorld(config);
    this.popText(tree.x, tree.y - 75, T().questTreeCast(T().skillName(skillById(spell.skillId)!), target.index + 1), toHex(spell.color));
    sfx.summonCharge(spell.kind, spell.warn);
  }

  private strikeQuestTree(cast: QuestTreeCast) {
    const { spell, x, y } = cast;
    const tree = this.questTree;
    if (tree?.alive) this.fx.summonPulse(() => ({ x: tree.x, y: tree.y }), spell.color, 0.12);
    if (spell.kind === 'soulReaper') {
      const hit = Math.random() < spell.hitChance;
      sfx.reaper();
      this.fx.reaperCatch(() => ({ x, y }), hit);
      this.time.delayedCall(REAPER_SWING * 1000, () => {
        if (this.over || !this.summonTreeConfig() || !this.questTree?.alive) return;
        sfx.scythe();
        this.applyQuestTreeHit(cast, hit);
      });
      return;
    }
    if (spell.kind === 'soulFire') { sfx.holyFire(); this.fx.holyFlame(x, y); }
    else if (spell.kind === 'soulThunder') { sfx.skyThunder(); this.fx.skyBolt(x, y); }
    else { sfx.sacredTree(); this.fx.treeRoots(x, y); }
    this.applyQuestTreeHit(cast);
  }

  private applyQuestTreeHit(cast: QuestTreeCast, hit = Math.random() < cast.spell.hitChance) {
    const config = this.summonTreeConfig();
    if (this.over || !config || !this.questTree?.alive) return;
    const { target, spell } = cast;
    if (target.team !== 0 || !target.alive || target.untouchable) return;
    // Moving out of the warning circle avoids damage and paralysis entirely.
    if (Math.hypot(target.x - cast.x, target.y - cast.y) > config.radius + target.radius) {
      this.summonResult(target, false, spell.color);
      return;
    }
    this.summonResult(target, hit, spell.color);
    if (!hit) { target.paralyze(SOUL_MISS_PARALYZE); return; }
    if (spell.kind === 'soulReaper') {
      if (this.reap(undefined, target) && target.alive) target.paralyze(spell.paralyze);
      return;
    }
    this.dealDamage(undefined, target, Phaser.Math.Between(spell.minDamage, spell.maxDamage), 0, 0, 0, 0, false);
    if (target.alive) target.paralyze(spell.paralyze);
  }

  /** Reaper hit: protection does not reduce it. Under 80 HP dies; otherwise left at 20. */
  private reap(from: Fighter | undefined, target: Fighter): boolean {
    const before = target.hp;
    const taken = target.stats.taken;
    if (!target.sufferReaper()) return false;
    this.fx.hitSpark(target.x, target.y, from?.color ?? 0xff4a6a);
    if (!from) return true;
    this.stats[from.index].dealt += target.stats.taken - taken;
    if (before > 0 && !target.alive) this.stats[from.index].kos++;
    return true;
  }

  private renderQuestTree(now: number) {
    const config = this.summonTreeConfig();
    if (!config || this.over || !this.questTree?.alive) return;
    const cast = this.questTreeCast;
    const tree = this.questTree;
    const color = cast?.spell.color ?? 0xa86aff;
    this.gGlow.fillStyle(color, 0.12 + 0.06 * Math.sin(now * 3)).fillCircle(tree.x, tree.y, 90);
    if (!cast) return;
    const progress = Math.min(1, cast.elapsed / (cast.spell.warn * config.warnScale));
    this.fx.summonCircle(this.g, this.gGlow, tree.x, tree.y, progress, color, now, cast.spell.kind);
    this.fx.targetMark(this.gOver, cast.x, cast.y, progress, color, now, cast.spell.kind);
    this.g.fillStyle(color, 0.08 + progress * 0.2).fillCircle(cast.x, cast.y, config.radius);
    this.g.lineStyle(3, color, 0.7).strokeCircle(cast.x, cast.y, config.radius);
    this.gGlow.lineStyle(2, color, 0.25 + progress * 0.35).lineBetween(tree.x, tree.y, cast.x, cast.y);
  }

  /** Stage 2: two great towers on the enemy side. They shoot, heal and keep sending enemies back in. */
  private placeQuestTowers(partySize: number) {
    const bodies = this.fighters.map((f) => f.body);
    const st = TOWER_STATS.main;
    const size = QUEST.tower.size;
    const hp = QUEST.tower.base + QUEST.tower.perPlayer * partySize;
    for (const dy of [-150, 150]) {
      const p = this.freeSpot(toWorld({ x: WIDTH - 230, y: SCREEN_MID_Y + dy }), [], size / 2 + 10);
      const body = this.physics.add.staticBody(p.x - size / 2, p.y - size / 2, size, size);
      const collider = this.physics.add.collider(bodies, body);
      const rect = new Phaser.Geom.Rectangle(p.x - size / 2, p.y - size / 2, size, size);
      this.obstacleRects.push(rect);
      this.towers.push({
        team: 1, main: true, x: p.x, y: p.y, w: size, h: size, hp, maxHp: hp, alive: true, shakeT: 0, body, collider, rect,
        range: st.range, fireInterval: st.fireInterval, reload: st.fireInterval, aura: st.aura, arrow: st.arrow,
      });
    }
    // The party gets a small tower of its own: it shoots enemies and buffs allies in its aura (it can be destroyed,
    // but it doesn't bring anyone back, only a main tower does that).
    const mine = TOWER_STATS.small;
    const msize = mine.size;
    const mhp = (mine.hp * Math.max(2, partySize)) / 2;
    const q = this.freeSpot(toWorld({ x: 380, y: SCREEN_MID_Y }), [], msize / 2 + 10);
    const mbody = this.physics.add.staticBody(q.x - msize / 2, q.y - msize / 2, msize, msize);
    const mcollider = this.physics.add.collider(bodies, mbody);
    const mrect = new Phaser.Geom.Rectangle(q.x - msize / 2, q.y - msize / 2, msize, msize);
    this.obstacleRects.push(mrect);
    this.towers.push({
      team: 0, main: false, x: q.x, y: q.y, w: msize, h: msize, hp: mhp, maxHp: mhp, alive: true, shakeT: 0, body: mbody, collider: mcollider, rect: mrect,
      range: mine.range, fireInterval: mine.fireInterval, reload: mine.fireInterval, aura: mine.aura, arrow: mine.arrow,
    });
  }

  /** Keep the prison tree as a tree: destructible, able to revive guards, and never shooting arrows. */
  private placeQuestTree(partySize: number) {
    const config = QUEST.rescue.tree;
    const p = toWorld(config);
    const w = 88 * S, h = 100 * S;
    const hp = config.hpBase + config.hpPerPlayer * partySize;
    const body = this.physics.add.staticBody(p.x - w / 2, p.y - h / 2, w, h);
    const collider = this.physics.add.collider(this.fighters.map((f) => f.body), body);
    const rect = new Phaser.Geom.Rectangle(p.x - w / 2, p.y - h / 2, w, h);
    this.obstacleRects.push(rect);
    this.questTree = {
      team: 1, main: true, tree: true, x: p.x, y: p.y, w, h, hp, maxHp: hp, alive: true, shakeT: 0,
      body, collider, rect, range: 0, fireInterval: 1, reload: 0, aura: config.aura, arrow: TOWER_ARROW,
    };
    this.towers.push(this.questTree);
  }

  /** A summon tree behind the twin wardens. It does not revive them. */
  private placeWardenTree(partySize: number) {
    const config = QUEST.wardens.tree;
    const p = toWorld(config);
    const w = 88 * S, h = 100 * S;
    const hp = config.hpBase + config.hpPerPlayer * partySize;
    const body = this.physics.add.staticBody(p.x - w / 2, p.y - h / 2, w, h);
    const collider = this.physics.add.collider(this.fighters.map((f) => f.body), body);
    const rect = new Phaser.Geom.Rectangle(p.x - w / 2, p.y - h / 2, w, h);
    this.obstacleRects.push(rect);
    this.questTree = {
      team: 1, main: false, tree: true, x: p.x, y: p.y, w, h, hp, maxHp: hp, alive: true, shakeT: 0,
      body, collider, rect, range: 0, fireInterval: 1, reload: 0, aura: config.aura, arrow: TOWER_ARROW,
    };
    this.towers.push(this.questTree);
    this.questTreeT = config.initialDelay;
  }

  /** Three live trees. Their jobs are dealt onto the fixed spots at random. */
  private placeGroveTrees(partySize: number) {
    const roles: GroveRole[] = ['respawn', 'summon', 'illusion'];
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }
    const illusions: GroveIllusion[] = ['sand', 'heat', 'ice'];
    this.groveIllusion = illusions[Math.floor(Math.random() * illusions.length)];
    this.groveVeil = this.add.graphics().setDepth(12);
    const baseHp = QUEST.grove.hpBase + QUEST.grove.hpPerPlayer * partySize;
    QUEST.grove.spots.forEach((spot, i) => {
      const hp = baseHp * (roles[i] === 'summon' ? QUEST.grove.summonHp : 1);
      const p = toWorld(spot);
      const w = 88 * S, h = 100 * S;
      const body = this.physics.add.staticBody(p.x - w / 2, p.y - h / 2, w, h);
      const collider = this.physics.add.collider(this.fighters.map((f) => f.body), body);
      const rect = new Phaser.Geom.Rectangle(p.x - w / 2, p.y - h / 2, w, h);
      this.obstacleRects.push(rect);
      const tree: Tower = {
        team: 1, main: false, tree: true, grove: roles[i], x: p.x, y: p.y, w, h, hp, maxHp: hp, alive: true, shakeT: 0,
        body, collider, rect, range: 0, fireInterval: 1, reload: 0, aura: QUEST.grove.aura, arrow: TOWER_ARROW,
      };
      this.groveTrees.push(tree);
      this.towers.push(tree);
      const label = this.add.text(p.x, p.y - h / 2 - 28, T().groveRole(roles[i]), {
        fontFamily: FONT, resolution: RES, fontSize: '15px', fontStyle: 'bold', color: '#ffe9b0', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5);
      this.lTop.add(label);
      this.groveLabels.push(label);
    });
  }

  /** Which two trees are on duty. Effects last `interval - rest` seconds, then both rest. */
  private grovePhase(): { index: number; roles: GroveRole[]; active: boolean; restLeft: number } {
    const order = QUEST.grove.order;
    if (this.countdown > 0) return { index: 0, roles: [], active: false, restLeft: 0 };
    const { interval, rest } = QUEST.grove;
    const index = Math.floor(this.groveT / interval) % order.length;
    const into = this.groveT % interval;
    const scheduled: GroveRole[] = [order[index]!, order[(index + 1) % order.length]!];
    const roles = scheduled.filter((role) => this.groveTrees.some((tree) => tree.grove === role && tree.alive));
    return { index, roles, active: into < interval - rest && roles.length > 0, restLeft: Math.max(0, interval - into) };
  }

  private paintGroveVeil(phase: { roles: readonly GroveRole[]; active: boolean }) {
    const veil = this.groveVeil;
    if (!veil) return;
    veil.clear();
    if (!(phase.active && phase.roles.includes('illusion'))) return;
    const [color, alpha] = this.groveIllusion === 'sand' ? [0xc4a36a, 0.34] as const
      : this.groveIllusion === 'heat' ? [0xff7a3a, 0.14] as const
      : [0xb9dcff, 0.18] as const;
    veil.fillStyle(color, alpha).fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  }

  /** Two trees work at once. Destroying a tree silences only that one. */
  private updateGrove(dt: number) {
    if (this.countdown > 0 || this.paused) return;
    this.groveT += dt;
    const phase = this.grovePhase();
    this.paintGroveVeil(phase);
    this.groveTrees.forEach((tree, i) => this.groveLabels[i]?.setAlpha(tree.alive ? 1 : 0.35));
    if (phase.active && this.groveAnnounced !== String(phase.index)) {
      this.groveAnnounced = String(phase.index);
      this.showBanner(T().groveDuty(phase.roles, this.groveIllusion), 0xe2c56a);
    }
    if (!phase.active) this.groveAnnounced = '';
    if (phase.active && phase.roles.includes('respawn')) this.updateGroveRespawn(dt);
    else this.groveRespawnT = QUEST.grove.respawnEvery;
    if (phase.active && phase.roles.includes('summon')) this.updateGroveSummon(dt);
    else {
      this.groveCast = null;
      this.groveSummonT = 1.2;
    }
  }

  /** While the respawn tree works, fallen enemies come back one at a time, never past four alive. */
  private updateGroveRespawn(dt: number) {
    const tree = this.groveTrees.find((t) => t.grove === 'respawn' && t.alive);
    if (!tree) return;
    const enemies = this.fighters.filter((f) => f.team === 1);
    const dead = enemies.filter((f) => !f.alive);
    if (!dead.length || enemies.filter((f) => f.alive).length >= QUEST.grove.maxEnemies) {
      this.groveRespawnT = QUEST.grove.respawnEvery;
      return;
    }
    this.groveRespawnT -= dt;
    if (this.groveRespawnT > 0) return;
    const guard = dead[0];
    const spot = this.freeSpot({ x: tree.x + (guard.index % 2 ? 80 : -80), y: tree.y + 70 }, this.fighters.filter((f) => f.alive).map((f) => ({ x: f.x, y: f.y })));
    guard.revive(spot.x, spot.y, guard.maxHp * TOWER_RESPAWN_HP);
    guard.pocket.length = 0;
    guard.selectedItem = 0;
    guard.soul *= TOWER_RESPAWN_SOUL_KEEP;
    this.nameTags[guard.index]?.setVisible(true);
    this.onRevived(guard);
    this.fx.respawnBeam(tree.x, tree.y, spot.x, spot.y, 0xc45a4a);
    sfx.respawn();
    this.popText(tree.x, tree.y - 70, T().groveRole('respawn'), '#e7a090');
    // The same price as a Quest tower: 10% of max HP, and the last revive can fell the tree.
    this.damageTower(tree, tree.maxHp * RESPAWN_TOWER_COST, undefined);
    this.groveRespawnT = QUEST.grove.respawnEvery;
  }

  /** While the summon tree works, it marks one living party member and casts a summon there. */
  private updateGroveSummon(dt: number) {
    const tree = this.groveTrees.find((t) => t.grove === 'summon' && t.alive);
    if (!tree) { this.groveCast = null; return; }
    if (this.groveCast) {
      this.groveCast.elapsed += dt;
      if (this.groveCast.elapsed < this.groveCast.spell.warn) return;
      const cast = this.groveCast;
      this.groveCast = null;
      this.groveSummonT = QUEST.grove.summonInterval;
      this.strikeGroveSummon(cast);
      return;
    }
    this.groveSummonT -= dt;
    if (this.groveSummonT > 0) return;
    const targets = this.fighters.filter((f) => f.team === 0 && f.alive && !f.untouchable);
    if (!targets.length) return;
    const target = targets[Math.floor(Math.random() * targets.length)];
    const spell = pickTreeSummon();
    this.groveCast = { spell, target, x: target.x, y: target.y, elapsed: 0 };
    this.popText(tree.x, tree.y - 75, T().groveTreeCast(T().skillName(skillById(spell.skillId)!), target.index + 1), toHex(spell.color));
    sfx.summonCharge(spell.kind, spell.warn);
  }

  private strikeGroveSummon(cast: QuestTreeCast) {
    const { spell, x, y } = cast;
    const tree = this.groveTrees.find((t) => t.grove === 'summon' && t.alive);
    if (tree) this.fx.summonPulse(() => ({ x: tree.x, y: tree.y }), spell.color, 0.12);
    const treeAlive = () => !!this.groveTrees.find((t) => t.grove === 'summon' && t.alive);
    if (spell.kind === 'soulReaper') {
      const hit = Math.random() < groveSummonHitChance(spell);
      sfx.reaper();
      this.fx.reaperCatch(() => ({ x, y }), hit);
      this.time.delayedCall(REAPER_SWING * 1000, () => {
        if (this.over || !treeAlive()) return;
        sfx.scythe();
        this.applyGroveHit(cast, hit);
      });
      return;
    }
    if (spell.kind === 'soulFire') { sfx.holyFire(); this.fx.holyFlame(x, y); }
    else if (spell.kind === 'soulThunder') { sfx.skyThunder(); this.fx.skyBolt(x, y); }
    else { sfx.sacredTree(); this.fx.treeRoots(x, y); }
    this.applyGroveHit(cast);
  }

  private applyGroveHit(cast: QuestTreeCast, hit = Math.random() < groveSummonHitChance(cast.spell)) {
    if (this.over || !this.groveTrees.find((t) => t.grove === 'summon' && t.alive)) return;
    const { target, spell } = cast;
    if (target.team !== 0 || !target.alive || target.untouchable) return;
    if (Math.hypot(target.x - cast.x, target.y - cast.y) > QUEST.grove.radius + target.radius) {
      this.summonResult(target, false, spell.color);
      return;
    }
    this.summonResult(target, hit, spell.color);
    if (!hit) { target.paralyze(SOUL_MISS_PARALYZE); return; }
    if (spell.kind === 'soulReaper') {
      if (this.reap(undefined, target) && target.alive) target.paralyze(spell.paralyze);
      return;
    }
    this.dealDamage(undefined, target, Phaser.Math.Between(spell.minDamage, spell.maxDamage), 0, 0, 0, 0, false);
    if (target.alive) target.paralyze(spell.paralyze);
  }

  /** The side whose allies can be sealed in the saplings. */
  private snareSide() {
    return this.isHell ? 1 : 0;
  }

  /** Two small trees. Jobs are shuffled, and the last allies on that side start inside them. */
  private placeSnareTrees(partySize: number) {
    const roles: GroveRole[] = Math.random() < 0.5 ? ['summon', 'illusion'] : ['illusion', 'summon'];
    const illusions: GroveIllusion[] = ['sand', 'heat', 'ice'];
    this.snareIllusion = illusions[Math.floor(Math.random() * illusions.length)]!;
    this.snareVeil = this.add.graphics().setDepth(12);
    const base = QUEST.snare.hpBase + QUEST.snare.hpPerPlayer * partySize;
    const side = this.snareSide();
    QUEST.snare.spots.forEach((spot, i) => {
      const role = roles[i]!;
      const hp = base * (role === 'summon' ? QUEST.snare.summonHp : 1);
      const p = toWorld(spot);
      const w = 56 * S;
      const h = 66 * S;
      const body = this.physics.add.staticBody(p.x - w / 2, p.y - h / 2, w, h);
      const collider = this.physics.add.collider(this.fighters.map((f) => f.body), body);
      const rect = new Phaser.Geom.Rectangle(p.x - w / 2, p.y - h / 2, w, h);
      this.obstacleRects.push(rect);
      const tree: Tower = {
        team: side === 0 ? 1 : 0, main: false, tree: true, snare: true, grove: role,
        x: p.x, y: p.y, w, h, hp, maxHp: hp, alive: true, shakeT: 0,
        body, collider, rect, range: 0, fireInterval: 1, reload: 0, aura: QUEST.snare.aura, arrow: TOWER_ARROW,
      };
      this.snareTrees.push(tree);
      this.towers.push(tree);
      const label = this.add.text(p.x, p.y - h / 2 - 22, T().groveRole(role), {
        fontFamily: FONT, resolution: RES, fontSize: '13px', fontStyle: 'bold', color: '#e7f0c8', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5);
      this.lTop.add(label);
      this.snareLabels.push(label);
    });
    const allies = this.fighters.filter((f) => f.team === side && f.alive);
    const prisoners = allies.slice(Math.max(1, allies.length - 2));
    prisoners.forEach((f, i) => {
      const tree = this.snareTrees[i];
      if (!tree) return;
      tree.prisoner = f;
      f.trapped = true;
      f.body.enable = false;
      f.body.reset(tree.x - f.radius, tree.y - f.radius);
    });
  }

  private releaseSnarePrisoner(tree: Tower) {
    const f = tree.prisoner;
    if (!f?.trapped) return;
    f.trapped = false;
    const spot = this.freeSpot({ x: tree.x, y: tree.y + 48 }, this.fighters.filter((o) => o.alive && !o.trapped).map((o) => ({ x: o.x, y: o.y })));
    f.body.enable = true;
    f.revive(spot.x, spot.y);
    this.sprites[f.index]?.setVisible(true);
    this.showBanner(T().snareFreed(f.index + 1), 0x9ddeb0);
    this.fx.respawnBeam(tree.x, tree.y, spot.x, spot.y, f.color);
  }

  private paintSnareVeil() {
    const veil = this.snareVeil;
    if (!veil) return;
    veil.clear();
    const illusion = this.snareTrees.some((t) => t.grove === 'illusion' && t.alive) && this.snareIllusion === 'sand';
    if (!illusion) return;
    veil.fillStyle(0xc4a36a, 0.28).fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  }

  /** Both saplings work until they fall. The summon one marks someone on the trapped side. */
  private updateSnare(dt: number) {
    if (this.countdown > 0 || this.paused) return;
    this.paintSnareVeil();
    this.snareTrees.forEach((tree, i) => this.snareLabels[i]?.setAlpha(tree.alive ? 1 : 0.35));
    const tree = this.snareTrees.find((t) => t.grove === 'summon' && t.alive);
    if (!tree) { this.snareCast = null; return; }
    if (this.snareCast) {
      this.snareCast.elapsed += dt;
      if (this.snareCast.elapsed < this.snareCast.spell.warn) return;
      const cast = this.snareCast;
      this.snareCast = null;
      this.snareSummonT = QUEST.snare.summonInterval;
      this.strikeSnare(cast);
      return;
    }
    this.snareSummonT -= dt;
    if (this.snareSummonT > 0) return;
    const side = this.snareSide();
    const targets = this.fighters.filter((f) => f.team === side && f.alive && !f.trapped && !f.untouchable);
    if (!targets.length) return;
    const target = targets[Math.floor(Math.random() * targets.length)]!;
    const spell = pickTreeSummon();
    this.snareCast = { spell, target, x: target.x, y: target.y, elapsed: 0 };
    this.popText(tree.x, tree.y - 46, T().groveTreeCast(T().skillName(skillById(spell.skillId)!), target.index + 1), toHex(spell.color));
    sfx.summonCharge(spell.kind, spell.warn);
  }

  private strikeSnare(cast: QuestTreeCast) {
    const { spell, x, y } = cast;
    const tree = this.snareTrees.find((t) => t.grove === 'summon' && t.alive);
    if (tree) this.fx.summonPulse(() => ({ x: tree.x, y: tree.y }), spell.color, 0.12);
    const chance = Math.min(1, spell.hitChance + QUEST.snare.summonHitBonus);
    if (spell.kind === 'soulReaper') {
      const hit = Math.random() < chance;
      sfx.reaper();
      this.fx.reaperCatch(() => ({ x, y }), hit);
      this.time.delayedCall(REAPER_SWING * 1000, () => {
        if (this.over || !this.snareTrees.some((t) => t.grove === 'summon' && t.alive)) return;
        sfx.scythe();
        this.applySnareHit(cast, hit);
      });
      return;
    }
    if (spell.kind === 'soulFire') { sfx.holyFire(); this.fx.holyFlame(x, y); }
    else if (spell.kind === 'soulThunder') { sfx.skyThunder(); this.fx.skyBolt(x, y); }
    else { sfx.sacredTree(); this.fx.treeRoots(x, y); }
    this.applySnareHit(cast, Math.random() < chance);
  }

  private applySnareHit(cast: QuestTreeCast, hit: boolean) {
    if (this.over || !this.snareTrees.some((t) => t.grove === 'summon' && t.alive)) return;
    const { target, spell } = cast;
    const side = this.snareSide();
    if (target.team !== side || !target.alive || target.trapped || target.untouchable) return;
    if (Math.hypot(target.x - cast.x, target.y - cast.y) > QUEST.snare.radius + target.radius) {
      this.summonResult(target, false, spell.color);
      return;
    }
    this.summonResult(target, hit, spell.color);
    if (!hit) { target.paralyze(SOUL_MISS_PARALYZE); return; }
    if (spell.kind === 'soulReaper') {
      if (this.reap(undefined, target) && target.alive) target.paralyze(spell.paralyze);
      return;
    }
    this.dealDamage(undefined, target, Phaser.Math.Between(spell.minDamage, spell.maxDamage), 0, 0, 0, 0, false);
    if (target.alive) target.paralyze(spell.paralyze);
  }

  /** The center bell warns, then strikes everyone who is not on the Bell Oni's side. */
  private updateDirge(dt: number) {
    if (this.countdown > 0 || this.paused || this.over) return;
    const boss = this.fighters.find((f) => f.boss && f.alive);
    if (!boss) { this.dirgeWarn = null; return; }
    if (this.dirgeWarn) {
      this.dirgeWarn.elapsed += dt;
      if (this.dirgeWarn.elapsed < QUEST.dirge.tollWarn) return;
      this.dirgeWarn = null;
      this.dirgeTollT = QUEST.dirge.tollEvery;
      const bell = toWorld(QUEST.dirge.bell);
      let struck = false;
      for (const f of this.fighters) {
        if (!f.alive || f.trapped || f.team === boss.team) continue;
        if (Math.hypot(f.x - bell.x, f.y - bell.y) > QUEST.dirge.tollRadius + f.radius) continue;
        this.dealDamage(undefined, f, QUEST.dirge.tollDamage, 0, 0, 40, 0.2, false);
        if (f.alive) f.paralyze(QUEST.dirge.tollParalyze);
        struck = true;
      }
      if (struck) this.showBanner(T().dirgeToll, DIRGE_COLOR);
      sfx.bell();
      return;
    }
    this.dirgeTollT = Math.max(0, this.dirgeTollT - dt);
    if (this.dirgeTollT > 0) return;
    this.dirgeWarn = { elapsed: 0 };
  }

  private renderDirge() {
    if (this.quest?.stage !== QUEST.dirgeStage) return;
    const bell = toWorld(QUEST.dirge.bell);
    const warn = this.dirgeWarn;
    const r = QUEST.dirge.tollRadius;
    this.g.lineStyle(2, DIRGE_COLOR, 0.35).strokeCircle(bell.x, bell.y, r);
    if (!warn) return;
    const progress = Math.min(1, warn.elapsed / QUEST.dirge.tollWarn);
    this.g.fillStyle(DIRGE_COLOR, 0.05 + progress * 0.12).fillCircle(bell.x, bell.y, r * progress);
    this.g.lineStyle(3, DIRGE_COLOR, 0.85).strokeCircle(bell.x, bell.y, r);
  }

  /** Darken the alley, then cut a light around every burning candle and living fighter. */
  private renderNight(now: number) {
    const shade = this.nightShade;
    const lights = this.nightLights;
    if (!shade || !lights || this.quest?.stage !== QUEST.nightStage) return;
    shade.clear();
    shade.fill(0x02030a, QUEST.night.veil, 0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
    lights.clear();
    lights.fillStyle(0xffffff, 1);
    const add = (x: number, y: number, r: number) => {
      lights.fillCircle(x, y, r);
      lights.fillStyle(0xffffff, 0.35);
      lights.fillCircle(x, y, r * 1.45);
      lights.fillStyle(0xffffff, 1);
    };
    for (const candle of this.nightCandles) if (candle.lit) add(candle.x / S, candle.y / S + HUD_HEIGHT, QUEST.night.lantern);
    for (const f of this.fighters) if (f.alive && !f.trapped) add(f.x / S, f.y / S + HUD_HEIGHT, QUEST.night.light);
    shade.erase(lights);
    this.renderNightFlames(now);
  }

  /** A lit candle warns, then scorches heroes inside its light. A dark one climbs back onto the wick. */
  private updateNight(dt: number) {
    if (this.countdown > 0 || this.paused || this.over) return;
    for (const candle of this.nightCandles) {
      if (!candle.lit) {
        candle.timer -= dt;
        if (candle.timer > 0) continue;
        candle.lit = true;
        candle.timer = QUEST.night.flareEvery;
        candle.warn = null;
        this.popText(candle.x, candle.y - 36, T().nightRelight, '#ffb45a');
        continue;
      }
      if (candle.warn !== null) {
        candle.warn += dt;
        if (candle.warn < QUEST.night.flareWarn) continue;
        this.flareCandle(candle);
        continue;
      }
      candle.timer -= dt;
      if (candle.timer <= 0) candle.warn = 0;
    }
  }

  private flareCandle(candle: NightCandle) {
    candle.warn = null;
    candle.timer = QUEST.night.flareEvery;
    const radius = QUEST.night.lantern * S;
    let struck = false;
    for (const f of this.fighters) {
      if (!f.alive || f.trapped || f.team !== 0) continue;
      const dx = f.x - candle.x;
      const dy = f.y - candle.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist > radius + f.radius) continue;
      this.dealDamage(undefined, f, QUEST.night.flareDamage, dx / dist, dy / dist, 90, 0.2, false);
      struck = true;
    }
    this.fx.holyFlame(candle.x, candle.y);
    if (struck) this.popText(candle.x, candle.y - 36, T().nightFlare, '#ffb45a');
    sfx.holyFire();
  }

  private snuffCandle(candle: NightCandle) {
    candle.lit = false;
    candle.warn = null;
    candle.timer = QUEST.night.relight;
    this.fx.smoke(candle.x, candle.y, 10, 1);
    this.popText(candle.x, candle.y - 36, T().nightSnuff, '#f3d7a1');
    sfx.vanish();
  }

  private renderNightFlames(now: number) {
    const g = this.nightFlames;
    if (!g) return;
    g.clear();
    const radius = QUEST.night.lantern * S;
    for (const candle of this.nightCandles) {
      const bob = Math.sin(now * 6 + candle.x) * 3;
      g.fillStyle(0x3a2a22, 1).fillRect(candle.x - 4, candle.y - 18, 8, 28);
      if (!candle.lit) {
        const back = 1 - Math.max(0, candle.timer) / QUEST.night.relight;
        g.fillStyle(0x6a5a48, 0.9).fillCircle(candle.x, candle.y - 20, 3);
        g.lineStyle(2, 0xf3d7a1, 0.55);
        g.beginPath();
        g.arc(candle.x, candle.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * back, false);
        g.strokePath();
        continue;
      }
      const h = 18 + bob;
      g.fillStyle(0xffb45a, 0.95).fillTriangle(candle.x - 8, candle.y - 16, candle.x + 8, candle.y - 16, candle.x, candle.y - 16 - h);
      g.fillStyle(0xfff1c9, 1).fillCircle(candle.x, candle.y - 18 - h * 0.4, 4);
      if (candle.warn === null) continue;
      const progress = Math.min(1, candle.warn / QUEST.night.flareWarn);
      g.lineStyle(3, 0xffb45a, 0.45 + progress * 0.5).strokeCircle(candle.x, candle.y, radius);
      g.fillStyle(0xff8a3a, 0.06 + progress * 0.14).fillCircle(candle.x, candle.y, radius * progress);
    }
  }

  private renderSnareCast(now: number) {
    const cast = this.snareCast;
    const tree = this.snareTrees.find((t) => t.grove === 'summon' && t.alive);
    if (!cast || !tree) return;
    const color = cast.spell.color;
    const progress = Math.min(1, cast.elapsed / cast.spell.warn);
    this.fx.summonCircle(this.g, this.gGlow, tree.x, tree.y, progress, color, now, cast.spell.kind);
    this.fx.targetMark(this.gOver, cast.x, cast.y, progress, color, now, cast.spell.kind);
    this.g.fillStyle(color, 0.1 + progress * 0.16).fillCircle(cast.x, cast.y, QUEST.snare.radius);
    this.g.lineStyle(2, color, 0.7).strokeCircle(cast.x, cast.y, QUEST.snare.radius);
  }

  private renderSnareTree(g: Phaser.GameObjects.Graphics, over: Phaser.GameObjects.Graphics, tree: Tower, now: number) {
    const x = tree.x + (tree.shakeT > 0 ? Math.sin(now * 80) * 2 : 0);
    const y = tree.y;
    const tint = tree.grove === 'illusion' ? 0xe2c56a : 0x945bc2;
    const wood = tree.grove === 'illusion' ? 0x6e6240 : 0x554631;
    if (!tree.alive) {
      g.fillStyle(0x24231f, 1).fillEllipse(x, y, 36, 24);
      g.lineStyle(3, 0x514536, 1).lineBetween(x - 16, y + 6, x + 14, y - 10);
      return;
    }
    g.fillStyle(tint, 0.08).fillCircle(x, y, tree.aura);
    g.lineStyle(2, tint, 0.45).strokeCircle(x, y, tree.aura);
    for (let k = 0; k < 7; k++) {
      const a = k * Math.PI * 2 / 7;
      g.lineStyle(5, wood, 1).lineBetween(x, y, x + Math.cos(a) * 28, y + Math.sin(a) * 22);
    }
    over.fillStyle(0x5a4534, 1).fillEllipse(x, y, 28, 40);
    over.lineStyle(2, tint, 1).strokeEllipse(x, y, 28, 40);
    over.fillStyle(tint, 0.9).fillCircle(x - 5, y - 4, 2.4).fillCircle(x + 5, y - 4, 2.4);
    if (tree.prisoner?.trapped) over.fillStyle(tree.prisoner.color, 1).fillCircle(x, y + 8, 6);
    const bw = tree.w;
    over.fillStyle(0x080b10, 0.9).fillRoundedRect(x - bw / 2, y - tree.h / 2 - 12, bw, 7, 2);
    over.fillStyle(tint, 1).fillRoundedRect(x - bw / 2 + 1, y - tree.h / 2 - 11, (bw - 2) * Math.max(0, tree.hp / tree.maxHp), 5, 2);
  }

  private renderGroveCast(now: number) {
    const cast = this.groveCast;
    const tree = this.groveTrees.find((t) => t.grove === 'summon' && t.alive);
    if (!cast || !tree) return;
    const color = cast.spell.color;
    const progress = Math.min(1, cast.elapsed / cast.spell.warn);
    this.fx.summonCircle(this.g, this.gGlow, tree.x, tree.y, progress, color, now, cast.spell.kind);
    this.fx.targetMark(this.gOver, cast.x, cast.y, progress, color, now, cast.spell.kind);
    this.g.fillStyle(color, 0.08 + progress * 0.2).fillCircle(cast.x, cast.y, QUEST.grove.radius);
    this.g.lineStyle(3, color, 0.7).strokeCircle(cast.x, cast.y, QUEST.grove.radius);
  }

  /** Every Quest stage entry, including retries, goes through the shared loading screen. */
  private enterRound(data: BattleStartData) {
    if (isQuestMode(data.mode)) {
      const next = structuredClone(data);
      next.quest = { ...next.quest, ...prepareQuest(next.quest) };
      this.scene.start('Loading', next);
    } else this.scene.restart(data);
  }

  private restartRound() {
    this.enterRound({ slots: this.lobbySlots, mode: this.mode, mapId: this.mapChoice, quest: this.quest ?? undefined });
  }

  private createQuestHud() {
    const q = this.quest!;
    this.showBanner(T().questStageTitle(questStageNumber(q.route ?? [], q.stage), this.questGoal(q.stage)), 0xf2c94c);
    this.questText = txt(this, SCREEN_ARENA.x + 12, HEIGHT - 14, '', 15, '#ffe9b0', { bold: true, origin: [0, 1], stroke: '#000000', strokeThickness: 4, depth: 15 });
    if (this.fighters.some((f) => f.boss)) {
      this.bossBar = this.add.graphics().setDepth(15);
      this.bossName = txt(this, WIDTH / 2, HEIGHT - 40, `${T().bossTag}・${q.stage === QUEST.wardenStage ? T().wardensTitle : q.stage === QUEST.dirgeStage ? T().dirgeName : q.stage === QUEST.nightStage ? T().nightBossName : T().bossName}`, 16, '#ff8a8a', { title: true, bold: true, origin: [0.5, 1], stroke: '#000000', strokeThickness: 4, depth: 16 });
    }
  }

  /** Goal line in the corner, and the boss's big HP bar. */
  private renderQuestHud() {
    const q = this.quest!;
    const foes = this.fighters.filter((f) => f.team === 1);
    const left = foes.filter((f) => f.alive).length;
    const stageNo = T().questStage(questStageNumber(q.route ?? [], q.stage));
    const grove = q.stage === QUEST.groveStage ? this.grovePhase() : null;
    const candles = q.stage === QUEST.nightStage ? ` · ${T().nightCandles(this.nightCandles.filter((c) => c.lit).length)}` : '';
    const status = this.isHell
      ? `${stageNo}  ${T().hellStatus(this.fighters.filter((f) => f.team === 0 && f.alive).length)}${q.stage === 0 ? ` · ${T().questWaveOf(this.wave, QUEST.waves)}` : q.stage === QUEST.wardenStage && this.wardenReviveT >= 0 ? ` · ${Math.ceil(this.wardenReviveT)}s` : ''}${candles}`
      : q.stage === 0
      ? `${stageNo}  ${T().questWaveOf(this.wave, QUEST.waves)} · ${T().questLeft(left)}`
      : q.stage === 1
        ? `${stageNo}  ${T().questTowersLeft(this.towers.filter((tw) => tw.team === 1 && tw.alive).length)}`
        : q.stage === QUEST.nightStage
          ? `${stageNo}  ${T().questLeft(left)}${candles}`
        : q.stage === QUEST.rescueStage
          ? `${stageNo}  ${T().questRescueProgress(this.walls.filter((w) => w.rescued).length, this.walls.length)} · ${T().questLeft(left)} · ${T().questTreeState(!!this.questTree?.alive)}`
          : q.stage === QUEST.groveStage
            ? `${stageNo}  ${T().groveTreesLeft(this.groveTrees.filter((t) => t.alive).length)} · ${T().questLeft(left)}${this.countdown > 0 || !grove ? '' : ` · ${grove.active ? T().groveDuty(grove.roles, this.groveIllusion) : T().groveRest(Math.ceil(grove.restLeft))}`}`
            : q.stage === QUEST.snareStage
              ? `${stageNo}  ${T().snareStatus(this.snareTrees.filter((t) => t.alive).length, this.fighters.filter((f) => f.trapped).length)} · ${T().questLeft(left)}`
            : q.stage === QUEST.sealStage
              ? `${stageNo}  ${T().sealProgress(this.seals.filter((s) => s.sealed).length, this.seals.length)}`
              : q.stage === QUEST.escortStage && this.lantern
                ? `${stageNo}  ${T().escortProgress(Math.floor(this.lantern.progress * 100), this.lantern.push)}`
                : q.stage === QUEST.wardenStage
                  ? `${stageNo}  ${T().wardenStatus(this.wardenReviveT < 0 ? -1 : Math.ceil(this.wardenReviveT))}`
                  : q.stage === QUEST.dirgeStage
                    ? `${stageNo}  ${T().dirgeStatus(this.dirgeWarn ? -1 : Math.ceil(this.dirgeTollT))}`
                  : `${stageNo}  ${T().questBossHint}`;
    if (this.questText && this.questText.text !== status) this.questText.setText(status);
    const boss = (q.stage === QUEST.nightStage ? this.fighters : foes).find((f) => f.boss);
    if (boss && this.bossBar) {
      const w = 460;
      const x = WIDTH / 2 - w / 2;
      const y = HEIGHT - 36;
      const g = this.bossBar;
      g.clear();
      g.fillStyle(0x000000, 0.6).fillRoundedRect(x - 4, y - 4, w + 8, 18, 5);
      g.fillStyle(0x3a0c10, 1).fillRect(x, y, w, 10);
      if (q.stage === QUEST.wardenStage) {
        const wardens = foes.filter((f) => f.boss);
        wardens.forEach((f, i) => {
          const bx = x + i * (w / 2 + 3), bw = w / 2 - 3;
          g.fillStyle(f.color, 1).fillRect(bx, y, bw * Math.max(0, f.hp) / f.maxHp, 10);
          g.lineStyle(1, f.color, 0.8).strokeRect(bx, y, bw, 10);
        });
      } else g.fillStyle(0xe5484d, 1).fillRect(x, y, w * Math.max(0, boss.hp) / boss.maxHp, 10);
      g.lineStyle(1.5, 0xd9ae4a, 1).strokeRect(x, y, w, 10);
    }
  }

  /** Hell defends the same world objectives while the invading heroes use their normal AI. */
  private updateHellQuest(dt: number) {
    if (!this.quest || this.over || this.paused || this.countdown > 0) return;
    const stage = this.quest.stage;
    const heroes = this.fighters.filter((f) => f.team === 0);
    const hell = this.fighters.filter((f) => f.team === 1);
    const bosses = hell.filter((f) => f.boss);
    const lost = stage === 1 ? !this.towers.some((t) => t.team === 1 && t.alive)
      : stage === QUEST.rescueStage ? this.walls.length === 2 && this.walls.every((w) => w.rescued)
      : stage === QUEST.groveStage ? this.groveTrees.length === 3 && this.groveTrees.every((t) => !t.alive)
      : stage === QUEST.snareStage ? !hell.some((f) => f.alive && !f.trapped)
      : stage === QUEST.sealStage ? this.seals.length > 0 && this.seals.every((s) => s.sealed)
      : stage === QUEST.escortStage ? !!this.lantern?.arrived
      : stage === QUEST.bossStage || stage === QUEST.dirgeStage ? bosses.length > 0 && !bosses.some((f) => f.alive)
      : stage === QUEST.wardenStage ? bosses.length === 2 && !bosses.some((f) => f.alive) : false;
    if (lost) { this.questFail(); return; }

    // Existing tower/tree reinforcements are now the player's reinforcements.
    const canReturn = this.towers.some((t) => t.team === 1 && t.main && t.alive)
      || stage === QUEST.groveStage && this.groveTrees.some((t) => t.grove === 'respawn' && t.alive)
      || stage === QUEST.sealStage || stage === QUEST.escortStage;
    if (!hell.some((f) => f.alive) && !canReturn) { this.questFail(); return; }
    if (stage === QUEST.escortStage && this.lantern?.lost) { this.questClear(); return; }

    if (!heroes.some((f) => f.alive)) {
      if (stage === 0 && this.wave < QUEST.waves) {
        if (this.waveT < 0) {
          this.waveT = QUEST.waveDelay;
          this.showBanner(T().questWave(this.wave + 1), this.sideColor(0));
        } else {
          this.waveT -= dt;
          if (this.waveT <= 0) this.nextWave(heroes);
        }
      } else this.questClear();
      return;
    }
    if (stage === QUEST.groveStage) this.updateGrove(dt);
    else if (stage === QUEST.snareStage) this.updateSnare(dt);
    else if (stage === QUEST.sealStage) this.updateSeals(dt);
    else if (stage === QUEST.escortStage) this.updateEscort(dt);
    else if (stage === QUEST.bossStage) this.updateBossReinforcements(dt);
    else if (stage === QUEST.dirgeStage) this.updateDirge(dt);
    else if (stage === QUEST.nightStage) this.updateNight(dt);
    else if (stage === QUEST.wardenStage) { this.updateQuestTree(dt); this.updateWardens(dt); }
  }

  private updateQuest(dt: number) {
    if (this.isHell) { this.updateHellQuest(dt); return; }
    const q = this.quest!;
    const party = this.fighters.filter((f) => f.team === 0);
    const foes = this.fighters.filter((f) => f.team === 1);
    if (!party.some((f) => f.alive && !f.trapped)) {
      this.questFail();
      return;
    }
    if (q.stage === 0) {
      if (this.waveT >= 0) {
        this.waveT -= dt;
        if (this.waveT <= 0) this.nextWave(foes);
      } else if (!foes.some((f) => f.alive)) {
        if (this.wave < QUEST.waves) {
          this.waveT = QUEST.waveDelay;
          this.showBanner(T().questWave(this.wave + 1), this.sideColor(1));
        } else this.questClear();
      }
    } else if (q.stage === 1) {
      if (!this.towers.some((tw) => tw.team === 1 && tw.alive)) this.questClear();
    } else if (q.stage === QUEST.rescueStage) {
      if (this.walls.length === 2 && this.walls.every((w) => w.rescued) && this.questTree && !this.questTree.alive && !foes.some((f) => f.alive)) this.questClear();
    } else if (q.stage === QUEST.groveStage) {
      this.updateGrove(dt);
      if (this.groveTrees.length === 3 && this.groveTrees.every((t) => !t.alive)) this.questClear();
    } else if (q.stage === QUEST.snareStage) {
      this.updateSnare(dt);
      if (this.snareTrees.length === 2 && this.snareTrees.every((t) => !t.alive) && !foes.some((f) => f.alive)) this.questClear();
    } else if (q.stage === QUEST.sealStage) {
      this.updateSeals(dt);
      if (this.seals.length === QUEST.seals.spots.length && this.seals.every((s) => s.sealed) && !foes.some((f) => f.alive)) this.questClear();
    } else if (q.stage === QUEST.escortStage) {
      this.updateEscort(dt);
      if (this.lantern && (!this.lantern.alive || this.lantern.lost)) this.questFail();
      else if (this.lantern?.arrived) this.questClear();
    } else if (q.stage === QUEST.wardenStage) {
      this.updateQuestTree(dt);
      this.updateWardens(dt);
    } else if (q.stage === QUEST.nightStage) {
      if (!foes.some((f) => f.alive)) this.questClear();
      else this.updateNight(dt);
    } else if (q.stage === QUEST.dirgeStage) {
      this.updateDirge(dt);
      if (!foes.some((f) => f.boss && f.alive)) this.questClear();
    } else if (!foes.some((f) => f.boss && f.alive)) this.questClear();
    else this.updateBossReinforcements(dt);
  }

  private bossTitle(f: Fighter) {
    if (this.quest?.stage === QUEST.wardenStage) return T().wardenName(this.questBossSeats.indexOf(f.index));
    if (this.quest?.stage === QUEST.dirgeStage) return T().dirgeName;
    if (this.quest?.stage === QUEST.nightStage) return T().nightBossName;
    return T().bossName;
  }

  private renderWardenBond(now: number) {
    if (this.quest?.stage !== QUEST.wardenStage) return;
    const wardens = this.fighters.filter((f) => f.boss && f.team === 1);
    if (wardens.length !== 2) return;
    const [a, b] = wardens;
    if (a.alive && b.alive) {
      this.g.lineStyle(2, 0xd4b985, 0.25).lineBetween(a.x, a.y, b.x, b.y);
      for (const offset of [0, 0.5]) {
        const t = (now * 0.35 + offset) % 1;
        this.gGlow.fillStyle(0xe5d4a0, 0.65).fillCircle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 3);
      }
    } else if (this.wardenReviveT >= 0) {
      const fallen = wardens.find((f) => !f.alive)!;
      const spot = this.spawns[fallen.index];
      const progress = 1 - this.wardenReviveT / QUEST.wardens.reviveAfter;
      this.g.lineStyle(2, fallen.color, 0.6).strokeCircle(spot.x, spot.y, 48);
      this.g.fillStyle(fallen.color, 0.05 + progress * 0.1).fillCircle(spot.x, spot.y, 44);
      for (let i = 0; i < 12; i++) {
        const angle = -Math.PI / 2 + i * Math.PI / 6;
        this.g.lineStyle(5, fallen.color, i / 12 < progress ? 0.9 : 0.15);
        this.g.lineBetween(spot.x + Math.cos(angle) * 43, spot.y + Math.sin(angle) * 43, spot.x + Math.cos(angle) * 53, spot.y + Math.sin(angle) * 53);
      }
    }
  }

  /** The soul bond breaks only when both wardens fall before the revival window expires. */
  private updateWardens(dt: number) {
    if (this.quest?.stage !== QUEST.wardenStage || this.over || this.paused || this.countdown > 0) return;
    const wardens = this.fighters.filter((f) => f.boss && f.team === 1);
    if (wardens.length !== 2) return;
    const fallen = wardens.filter((f) => !f.alive);
    if (fallen.length === 2) { if (this.isHell) this.questFail(); else this.questClear(); return; }
    this.updateWardenGrunt(dt);
    if (!fallen.length) { this.wardenReviveT = -1; return; }
    if (this.wardenReviveT < 0) this.wardenReviveT = QUEST.wardens.reviveAfter;
    this.wardenReviveT = Math.max(0, this.wardenReviveT - dt);
    if (this.wardenReviveT > 0) return;
    const warden = fallen[0];
    const spot = this.freeSpot(this.spawns[warden.index], this.fighters.filter((f) => f.alive).map((f) => ({ x: f.x, y: f.y })));
    warden.revive(spot.x, spot.y, warden.maxHp * QUEST.wardens.reviveHp);
    warden.pocket.length = 0;
    warden.selectedItem = 0;
    warden.soul *= TOWER_RESPAWN_SOUL_KEEP;
    this.onRevived(warden);
    this.nameTags[warden.index]?.setVisible(true);
    this.fx.smoke(spot.x, spot.y, 18, 1);
    this.showBanner(T().wardenRevived, 0x93d8bf);
    sfx.respawn();
    this.wardenReviveT = -1;
  }

  /** The extra guard on the warden stage keeps walking back in, so the bosses are never fought alone. */
  private updateWardenGrunt(dt: number) {
    const grunt = this.fighters.find((f) => f.team === 1 && !f.boss);
    if (!grunt || grunt.alive) { this.wardenGruntT = QUEST.wardens.gruntRespawn; return; }
    this.wardenGruntT -= dt;
    if (this.wardenGruntT > 0) return;
    const spot = this.freeSpot(this.spawns[grunt.index] ?? { x: grunt.x, y: grunt.y },
      this.fighters.filter((f) => f.alive).map((f) => ({ x: f.x, y: f.y })));
    grunt.revive(spot.x, spot.y, grunt.maxHp * TOWER_RESPAWN_HP);
    grunt.pocket.length = 0;
    grunt.selectedItem = 0;
    grunt.soul *= TOWER_RESPAWN_SOUL_KEEP;
    this.onRevived(grunt);
    this.nameTags[grunt.index]?.setVisible(true);
    this.fx.smoke(spot.x, spot.y, 12, 1);
    sfx.respawn();
    this.wardenGruntT = QUEST.wardens.gruntRespawn;
  }

  private damageLantern(damage: number, attacker?: Fighter) {
    const lantern = this.lantern;
    if (!lantern?.alive || lantern.arrived || lantern.lost || this.over || this.paused || this.countdown > 0) return;
    const taken = Math.min(lantern.hp, damage);
    lantern.hp = Math.max(0, lantern.hp - damage);
    lantern.alive = lantern.hp > 0;
    if (attacker) attacker.stats.wall += taken;
    this.fx.hitSpark(lantern.x, lantern.y, 0xffcc80);
    sfx.wallHit();
    if (!lantern.alive) this.fx.sparks(lantern.x, lantern.y, 0x90dfc3, 24);
  }

  private updateEscort(dt: number) {
    const lantern = this.lantern;
    if (!lantern || this.over || this.paused || this.countdown > 0) return;
    advanceLantern(lantern, this.fighters, dt);
    if (!lantern.alive || lantern.arrived || lantern.lost) return;
    const guard = this.fighters.find((f) => f.team === 1 && !f.alive);
    if (!guard) { this.escortRespawnT = QUEST.escort.respawnEvery; return; }
    this.escortRespawnT -= dt;
    if (this.escortRespawnT > 0) return;
    // Alternate northern/southern ambushes ahead of the lantern, with room to react.
    const side = guard.index % 2;
    const spot = this.freeSpot({ x: Math.min(ARENA.x + ARENA.w - 90, lantern.x + 240 * S), y: side ? ARENA.y + ARENA.h - 70 : ARENA.y + 70 },
      this.fighters.filter((f) => f.alive).map((f) => ({ x: f.x, y: f.y })));
    guard.revive(spot.x, spot.y, guard.maxHp * TOWER_RESPAWN_HP);
    guard.pocket.length = 0;
    guard.selectedItem = 0;
    guard.soul *= TOWER_RESPAWN_SOUL_KEEP;
    this.onRevived(guard);
    this.nameTags[guard.index]?.setVisible(true);
    this.fx.smoke(spot.x, spot.y, 12, 1);
    sfx.respawn();
    this.escortRespawnT = QUEST.escort.respawnEvery;
  }

  private renderLantern(now: number) {
    const lantern = this.lantern;
    if (!lantern) return;
    const { x, y, radius: r } = lantern;
    const g = this.g;
    const color = !lantern.alive || lantern.lost ? 0x647b78 : lantern.push < 0 || lantern.hp < lantern.maxHp * 0.3 ? 0xff967a : 0x99e7c6;
    g.fillStyle(color, 0.04).fillCircle(x, y, r);
    g.lineStyle(2, color, 0.5).strokeCircle(x, y, r);
    // The ring fills with journey progress; the bar directly above is lantern HP.
    for (let i = 0; i < 40; i++) {
      const angle = -Math.PI / 2 + i * Math.PI / 20;
      g.lineStyle(4, color, i / 40 < lantern.progress ? 0.9 : 0.12);
      g.lineBetween(x + Math.cos(angle) * (r - 5), y + Math.sin(angle) * (r - 5), x + Math.cos(angle) * (r + 2), y + Math.sin(angle) * (r + 2));
    }
    g.fillStyle(0x000000, 0.25).fillEllipse(x, y + 22, 62, 22);
    const bob = lantern.alive ? Math.sin(now * 3) * 3 : 8;
    const ly = y + bob;
    g.fillStyle(0x243d3c, 1).fillRoundedRect(x - 25, ly - 32, 50, 57, 7);
    g.fillStyle(color, lantern.alive ? 0.55 : 0.12).fillRoundedRect(x - 20, ly - 27, 40, 47, 5);
    g.lineStyle(3, 0xc1ae7b, 1).strokeRoundedRect(x - 25, ly - 32, 50, 57, 7);
    for (const dx of [-12, 12]) g.lineBetween(x + dx, ly - 31, x + dx, ly + 25);
    g.fillStyle(0xbfa570, 1).fillRect(x - 31, ly - 38, 62, 7).fillRect(x - 31, ly + 25, 62, 7);
    g.lineStyle(3, 0xbfa570, 1).lineBetween(x, ly - 45, x, ly - 38).lineBetween(x, ly + 32, x, ly + 44);
    if (lantern.alive) {
      this.gGlow.fillStyle(0x86e9ba, 0.07).fillCircle(x, ly - 3, 47);
      this.gGlow.fillStyle(0xffe5a1, 0.9).fillEllipse(x, ly - 4, 12 + Math.sin(now * 7) * 2, 26);
    }
    g.fillStyle(0x102025, 0.95).fillRoundedRect(x - 43, y - 66, 86, 12, 3);
    g.fillStyle(color, 1).fillRect(x - 40, y - 63, 80 * lantern.hp / lantern.maxHp, 6);
  }

  /** Seals charge only during play. Guards keep returning until all three are broken. */
  private updateSeals(dt: number) {
    if (this.quest?.stage !== QUEST.sealStage || this.over || this.paused || this.countdown > 0) return;
    this.seals.forEach((seal, i) => {
      if (chargeSeal(seal, this.fighters, dt)) {
        this.showBanner(T().sealBroken(i + 1), 0x83dfd4);
        this.fx.sparks(seal.x, seal.y, 0x83dfd4, 24);
      }
    });
    if (this.seals.every((s) => s.sealed)) return;
    const guard = this.fighters.find((f) => f.team === 1 && !f.alive);
    if (!guard) { this.sealRespawnT = QUEST.seals.respawnEvery; return; }
    this.sealRespawnT -= dt;
    if (this.sealRespawnT > 0) return;
    const spot = this.freeSpot(this.spawns[guard.index], this.fighters.filter((f) => f.alive).map((f) => ({ x: f.x, y: f.y })));
    guard.revive(spot.x, spot.y, guard.maxHp * TOWER_RESPAWN_HP);
    guard.pocket.length = 0;
    guard.selectedItem = 0;
    guard.soul *= TOWER_RESPAWN_SOUL_KEEP;
    this.onRevived(guard);
    this.nameTags[guard.index]?.setVisible(true);
    this.fx.smoke(spot.x, spot.y, 12, 1);
    sfx.respawn();
    this.sealRespawnT = QUEST.seals.respawnEvery;
  }

  private renderSeals(now: number) {
    for (const seal of this.seals) {
      const { x, y, radius: r } = seal;
      const color = seal.sealed ? 0x83dfd4 : seal.contested ? 0xf28b65 : 0xe5bb6d;
      const g = this.g;
      g.fillStyle(0x151221, 0.45).fillCircle(x, y, r);
      g.fillStyle(color, seal.sealed ? 0.12 : 0.05 + Math.sin(now * 3) * 0.02).fillCircle(x, y, r - 6);
      g.lineStyle(2, color, 0.55).strokeCircle(x, y, r);
      g.lineStyle(1, color, 0.3).strokeCircle(x, y, r - 12);
      // Segments show charge without covering fighters.
      for (let k = 0; k < 32; k++) {
        const a = -Math.PI / 2 + k * Math.PI / 16;
        g.lineStyle(5, color, k / 32 < seal.progress ? 0.95 : 0.1);
        g.lineBetween(x + Math.cos(a) * (r - 5), y + Math.sin(a) * (r - 5), x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3));
      }
      if (seal.sealed) {
        g.lineStyle(5, color, 0.9).lineBetween(x - 16, y, x - 4, y + 12).lineBetween(x - 4, y + 12, x + 21, y - 16);
      } else {
        const n = seal.allies;
        for (let i = 0; i < n; i++) {
          const cx = x + (i - (n - 1) / 2) * 16;
          g.fillStyle(color, 0.95).fillCircle(cx, y, 5);
        }
      }
    }
  }

  /** Preserve the initial party-scaled enemy count, preparing extra guards off-field for later summons. */
  private prepareBossReserve(f: Fighter, partySize: number) {
    if (this.hasHellPlayers || this.quest?.stage !== QUEST.bossStage || f.index < QUEST.partySlots + 1 + Math.min(QUEST.boss.maxEnemies - 1, partySize)) return;
    this.bossReserves.add(f);
    f.hp = 0;
    f.state = 'dead';
    f.body.enable = false;
  }

  /** The boss trades its own HP for one guard, up to four living enemies including itself. */
  private updateBossReinforcements(dt: number) {
    if (this.quest?.stage !== QUEST.bossStage || this.over || this.paused || this.countdown > 0) return;
    const boss = this.fighters.find((f) => f.boss && f.alive);
    if (!boss) return;
    const enemies = this.fighters.filter((f) => f.team === boss.team);
    const fallen = enemies.filter((f) => !f.boss && !f.alive)
      .sort((a, b) => Number(this.bossReserves.has(a)) - Number(this.bossReserves.has(b)) || (this.deathTime.get(a) ?? 0) - (this.deathTime.get(b) ?? 0));
    if (!fallen.length || enemies.filter((f) => f.alive).length >= QUEST.boss.maxEnemies) {
      this.bossRespawnT = QUEST.boss.respawnInterval;
      return;
    }
    this.bossRespawnT = Math.max(0, this.bossRespawnT - dt);
    if (this.bossRespawnT > 0) return;
    const cost = Math.max(1, Math.round(boss.maxHp * QUEST.boss.respawnHpCost));
    if (boss.hp <= cost) return;
    const guard = fallen[0];
    const spot = this.freeSpot({ x: boss.x - 80, y: boss.y + (guard.index % 2 ? -60 : 60) }, this.fighters.filter((f) => f.alive).map((f) => ({ x: f.x, y: f.y })));
    boss.hp -= cost;
    boss.flashT = 0.15;
    if (!this.hasHellPlayers || this.slots[guard.index].control === 'cpu') {
      const gear = randomCpuEquipment('quest', guard.role.id, ['lifeline'], CPU_ENEMY_SKILLS);
      guard.weapon = WEAPONS[gear.weapon];
      guard.skills.splice(0, guard.skills.length, ...gear.skills.map(skillById));
      guard.cooldowns.length = guard.skills.length;
      this.refreshHudLoadout(guard);
    }
    guard.revive(spot.x, spot.y, guard.maxHp * TOWER_RESPAWN_HP);
    guard.pocket.length = 0;
    guard.selectedItem = 0;
    guard.soul *= TOWER_RESPAWN_SOUL_KEEP;
    this.bossReserves.delete(guard);
    this.nameTags[guard.index]?.setVisible(true);
    this.onRevived(guard);
    this.popText(boss.x, boss.y - boss.radius - 16, `-${cost} HP`, '#ff8a8a');
    this.showBanner(T().bossReinforcement, BOSS_COLOR);
    this.fx.respawnBeam(boss.x, boss.y, spot.x, spot.y, BOSS_COLOR);
    sfx.respawn();
    this.bossRespawnT = QUEST.boss.respawnInterval;
  }

  /** Stage 1: the beaten enemies come back in as the next wave, from their side. */
  private nextWave(foes: Fighter[]) {
    this.wave++;
    this.waveT = -1;
    const taken = this.fighters.filter((o) => o.alive).map((o) => ({ x: o.x, y: o.y }));
    for (const f of foes) {
      const spot = this.freeSpot(this.spawns[f.index], taken);
      taken.push(spot);
      f.revive(spot.x, spot.y);
      this.deathTime.delete(f);
      this.fx.smoke(spot.x, spot.y, 12, 1);
    }
    sfx.respawn();
  }

  /** What the party takes into the next stage. */
  private questCarry(): QuestState['carry'] {
    const players: Record<number, { pocket: Item[]; soul: number }> = {};
    for (const f of this.fighters) if (this.isMixedQuest || f.team === this.questTeam) players[f.index] = { pocket: [...f.pocket], soul: f.soul };
    return { players, stats: this.stats.map((st) => ({ ...st })) };
  }

  private questClear(winningTeam = this.questTeam) {
    if (this.over) return;
    const q = this.quest!;
    this.winningTeam = winningTeam;
    const factionWin = T().teamWins(T().questSides[winningTeam === 1 ? 'hell' : 'heroes']);
    this.questTreeCast = null;
    const next = nextQuestStage(q.route ?? [], q.stage);
    if (next === undefined) {
      this.endRound(undefined, this.isMixedQuest ? factionWin : this.isHell ? T().hellComplete : T().questComplete, 0xf2c94c);
      return;
    }
    this.over = true;
    this.time.delayedCall(500, () => sfx.win());
    this.time.delayedCall(1300, () => playMusic('victory'));
    const msg = this.isMixedQuest ? factionWin : T().questClear(questStageNumber(q.route ?? [], q.stage));
    this.showEndBanner(msg, '#f2c94c', () => {
      this.openModal({
        w: 620, h: 300, title: msg, titleColor: C.goldHex, depth: 400, closable: false,
        build: (m) => {
          m.content.add(txt(this, WIDTH / 2, m.y + 128, T().questCarry, 16, C.text, { origin: 0.5, wrap: m.w - 80, align: 'center' }));
          const by = m.y + m.h - 50;
          addButton(this, m.content, m.nav, {
            id: 'next', x: WIDTH / 2 - 150, y: by, w: 240, h: 50, label: `${T().questNext}  ▶`, primary: true,
            onPress: () => this.enterRound({ slots: this.lobbySlots, mode: this.mode, quest: { stage: next, route: q.route, campaign: 'quest', side: q.side, rule: q.rule, carry: this.questCarry() } }),
          });
          addButton(this, m.content, m.nav, { id: 'lobby', x: WIDTH / 2 + 150, y: by, w: 200, h: 50, label: T().toLobby, onPress: () => this.scene.start('Lobby') });
        },
      });
    });
  }

  private questFail() {
    if (this.over) return;
    if (this.isMixedQuest) { this.questClear(1); return; }
    const q = this.quest!;
    this.over = true;
    this.time.delayedCall(300, () => sfx.deathGong());
    this.time.delayedCall(1500, () => playMusic('defeat'));
    this.showEndBanner(T().questFailed, '#ff5a5a', () => {
      this.openModal({
        w: 900, h: 300, title: T().questFailed, titleColor: '#ff7a7a', depth: 400, closable: false,
        build: (m) => {
          const lanternWhy = this.isHell ? T().hellLost : this.lantern && !this.lantern.alive ? T().lanternDestroyed : this.lantern?.lost ? T().lanternLost : '';
          m.content.add(txt(this, WIDTH / 2, m.y + 110, `${T().questFailedAt(questStageNumber(q.route ?? [], q.stage))}${lanternWhy ? ` · ${lanternWhy}` : ''}`, 22, C.text, { title: true, bold: true, origin: 0.5 }));
          const by = m.y + m.h - 50;
          addButton(this, m.content, m.nav, {
            id: 'edit', x: WIDTH / 2 - 315, y: by, w: 190, h: 50, label: T().questEdit, primary: true, size: 17,
            onPress: () => this.scene.start('Lobby', { retryQuest: structuredClone(q), slots: structuredClone(this.lobbySlots) }),
          });
          addButton(this, m.content, m.nav, { id: 'retry', x: WIDTH / 2 - 105, y: by, w: 190, h: 50, label: T().questRetry, size: 17, onPress: () => this.restartRound() });
          addButton(this, m.content, m.nav, {
            id: 'over', x: WIDTH / 2 + 105, y: by, w: 190, h: 50, label: T().questRestart, size: 17,
            onPress: () => this.enterRound({ slots: this.lobbySlots, mode: this.mode, quest: { ...prepareQuest(), side: this.quest?.side, rule: this.quest?.rule } }),
          });
          addButton(this, m.content, m.nav, { id: 'lobby', x: WIDTH / 2 + 315, y: by, w: 190, h: 50, label: T().toLobby, size: 17, onPress: () => this.scene.start('Lobby') });
        },
      });
    });
  }

  // ---------- summoning effects ----------

  private summonColor(f: Fighter) {
    const kind = f.summoning?.kind;
    return kind === 'soulReaper' ? 0xa86aff : kind === 'soulFire' ? 0xffb03a : kind === 'soulTree' ? 0x6adf7a : 0x8fb4ff;
  }

  /** The nearest enemies a summon would hit right now (they get target marks while it's called). */
  private summonTargets(f: Fighter, count: number) {
    return this.fighters
      .filter((t) => t.alive && f.isEnemy(t) && !t.untouchable)
      .sort((a, b) => f.distTo(a) - f.distTo(b))
      .slice(0, count);
  }

  private onSummonStart(f: Fighter) {
    const s = f.summoning!;
    sfx.summonCharge(s.kind, SOUL_CAST_TIME);
    // The caster's circular lighting is drawn by Fx.summonCircle during the call.
  }

  /** A quick full-battlefield colour flash. */
  private screenFlash(color: number, alpha: number) {
    const fl = this.add.rectangle(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT, color, alpha).setOrigin(0, 0).setDepth(14);
    this.tweens.add({ targets: fl, alpha: 0, duration: 260, onComplete: () => fl.destroy() });
  }

  /** Short message across the top of the arena. */
  private showBanner(msg: string, color?: number) {
    const banner = txt(this, WIDTH / 2, SCREEN_ARENA.y + 34, msg, 26, color !== undefined ? toHex(color) : '#ffd6ea', {
      title: true, bold: true, origin: 0.5, stroke: '#000000', strokeThickness: 5, depth: 15,
    });
    this.tweens.add({ targets: banner, alpha: 0, delay: 2200, duration: 700, onComplete: () => banner.destroy() });
  }

  private renderTower(g: Phaser.GameObjects.Graphics, over: Phaser.GameObjects.Graphics, tw: Tower, now: number) {
    if (tw.tree) {
      if (tw.snare) this.renderSnareTree(g, over, tw, now);
      else this.renderTreeTower(g, over, tw, now);
      return;
    }
    const color = this.sideColor(tw.team);
    if (!tw.alive) {
      // Rubble where it stood.
      const k = tw.w / 44;
      g.fillStyle(0x4f4a42, 1).fillRect(tw.x - 18 * k, tw.y - 14 * k, 14 * k, 10 * k).fillRect(tw.x + 2 * k, tw.y - 4 * k, 16 * k, 12 * k).fillRect(tw.x - 12 * k, tw.y + 6 * k, 12 * k, 9 * k);
      return;
    }
    // Aura on the ground, then range ring.
    const pulse = 0.5 + 0.5 * Math.sin(now * 2);
    g.fillStyle(color, 0.06 + pulse * 0.03).fillCircle(tw.x, tw.y, tw.aura);
    g.lineStyle(2, color, 0.3).strokeCircle(tw.x, tw.y, tw.aura);
    g.lineStyle(1, color, 0.15).strokeCircle(tw.x, tw.y, tw.range);
    const sx = tw.shakeT > 0 ? Phaser.Math.Between(-2, 2) : 0;
    const x = tw.x + sx;
    const h = tw.w / 2;
    // Stone base, wooden walls, tiled roof in team colour, gold finial.
    g.fillStyle(0x000000, 0.35).fillRect(x - h + 6, tw.y - h + 8, tw.w, tw.h);
    g.fillStyle(0x8d877a, 1).fillRect(x - h, tw.y - h, tw.w, tw.h);
    g.lineStyle(2, 0x4f4a42, 1).strokeRect(x - h, tw.y - h, tw.w, tw.h);
    over.fillStyle(0x5a3a1e, 1).fillRect(x - h + 6, tw.y - h + 6, tw.w - 12, tw.h - 12);
    const roof = [{ x: x - h - 4, y: tw.y - h - 4 }, { x: x + h + 4, y: tw.y - h - 4 }, { x: x + h + 4, y: tw.y + h + 4 }, { x: x - h - 4, y: tw.y + h + 4 }];
    over.fillStyle(color, 0.85).fillPoints(roof.map((p) => ({ x: x + (p.x - x) * 0.75, y: tw.y + (p.y - tw.y) * 0.75 })) as Phaser.Math.Vector2[], true);
    over.lineStyle(2, 0x1e1e22, 1).lineBetween(x - h * 0.8, tw.y - h * 0.8, x + h * 0.8, tw.y + h * 0.8).lineBetween(x + h * 0.8, tw.y - h * 0.8, x - h * 0.8, tw.y + h * 0.8);
    over.fillStyle(0xd9ae4a, 1).fillCircle(x, tw.y, tw.main ? 7 : 4);
    if (tw.main) {
      // Main tower: a second, smaller roof tier and gold trim.
      const r2 = h * 0.45;
      over.fillStyle(color, 1).fillRect(x - r2, tw.y - r2, r2 * 2, r2 * 2);
      over.lineStyle(2, 0xd9ae4a, 1).strokeRect(x - r2, tw.y - r2, r2 * 2, r2 * 2).strokeRect(x - h, tw.y - h, tw.w, tw.h);
      over.fillStyle(0xd9ae4a, 1).fillCircle(x, tw.y, 6);
    }
    // Health bar.
    const bw = tw.w + 10;
    over.fillStyle(0x000000, 0.65).fillRect(x - bw / 2 - 1, tw.y - h - 14, bw + 2, 7);
    over.fillStyle(color, 1).fillRect(x - bw / 2, tw.y - h - 13, bw * (tw.hp / tw.maxHp), 5);
  }

  private renderTreeTower(g: Phaser.GameObjects.Graphics, over: Phaser.GameObjects.Graphics, tree: Tower, now: number) {
    const x = tree.x + (tree.shakeT > 0 ? Math.sin(now * 80) * 3 : 0), y = tree.y;
    if (!tree.alive) {
      g.fillStyle(0x24231f, 1).fillEllipse(x, y, 72 * S, 54 * S);
      g.lineStyle(5, 0x514536, 1).lineBetween(x - 38 * S, y + 12 * S, x + 26 * S, y - 18 * S);
      g.fillStyle(0x695442, 1).fillEllipse(x, y, 34 * S, 26 * S);
      return;
    }
    const tint = tree.grove === 'respawn' ? 0xc45a4a : tree.grove === 'illusion' ? 0xe2c56a : 0x945bc2;
    const wood = tree.grove === 'respawn' ? 0x5c3a32 : tree.grove === 'illusion' ? 0x6e6240 : 0x554631;
    const eye = tree.grove === 'respawn' ? 0xffb0a0 : tree.grove === 'illusion' ? 0xffe7a8 : 0xcf95ff;
    const bar = tree.grove === 'respawn' ? 0xe07a68 : tree.grove === 'illusion' ? 0xe2c56a : 0xb57bff;
    const phase = this.grovePhase();
    const on = !!tree.grove && phase.active && phase.roles.includes(tree.grove);
    const pulse = 0.5 + 0.5 * Math.sin(now * 2);
    g.fillStyle(tint, (on ? 0.08 : 0.04) + pulse * 0.03).fillCircle(x, y, tree.aura);
    g.lineStyle(on ? 2 : 1, tint, on ? 0.55 : 0.2).strokeCircle(x, y, tree.aura);
    for (let k = 0; k < 11; k++) {
      const a = k * Math.PI * 2 / 11;
      const length = (58 + (k % 3) * 10) * S;
      const ex = x + Math.cos(a) * length, ey = y + Math.sin(a) * length;
      const limb = Array.from({ length: 9 }, (_, n) => {
        const t = n / 8, u = 1 - t;
        return { x: u * u * x + 2 * u * t * (ex + 15 * S) + t * t * ex,
          y: u * u * y + 2 * u * t * (y + Math.sin(a) * 20 * S) + t * t * ey };
      });
      g.lineStyle(9 * S, wood, 1).strokePoints(limb as Phaser.Math.Vector2[], false);
      g.lineStyle(1.5 * S, tint, 0.8).strokePoints(limb as Phaser.Math.Vector2[], false);
      const fork = limb[5], side = a + (k % 2 ? 0.65 : -0.65);
      g.lineStyle(4 * S, wood, 1).lineBetween(fork.x, fork.y, fork.x + Math.cos(side) * 28 * S, fork.y + Math.sin(side) * 28 * S);
    }
    over.fillStyle(0x5a4534, 1).fillEllipse(x, y, 58 * S, 76 * S);
    over.lineStyle(2, tint, 1).strokeEllipse(x, y, 58 * S, 76 * S);
    over.lineStyle(2 * S, 0x382e27, 0.8).lineBetween(x - 8 * S, y + 10 * S, x - 4 * S, y + 30 * S).lineBetween(x + 11 * S, y + 13 * S, x + 8 * S, y + 33 * S);
    over.fillStyle(eye, 0.7 + pulse * 0.3).fillEllipse(x - 11 * S, y - 6 * S, 8 * S, 14 * S).fillEllipse(x + 11 * S, y - 6 * S, 8 * S, 14 * S);
    const bw = tree.w + 20;
    over.fillStyle(0x080b10, 0.9).fillRoundedRect(x - bw / 2, y - tree.h / 2 - 19, bw, 9, 3);
    over.fillStyle(bar, 1).fillRoundedRect(x - bw / 2 + 1, y - tree.h / 2 - 18, (bw - 2) * Math.max(0, tree.hp / tree.maxHp), 7, 2);
  }

  // ---------- treasure chests ----------

  private addChest(x: number, y: number, age: number, big: boolean, emptyChance: number, random = false) {
    const w = big ? 52 : 34;
    const h = big ? 40 : 28;
    const maxHp = big ? BIG_CHEST_HP : CHEST_HP;
    const body = this.physics.add.staticBody(x - w / 2, y - h / 2, w, h);
    // Quest CPUs walk through chests. Players still have to go around or break them.
    const collider = this.physics.add.collider(this.fighters.map((f) => f.body), body, undefined, (a, b) => {
      if (!this.quest) return true;
      return !this.fighters.some((f) => (f.body === a || f.body === b) && f.controller instanceof AIController);
    });
    this.chests.push({ x, y, w, h, hp: maxHp, maxHp, shakeT: 0, age, body, collider, big, empty: !big && Math.random() < emptyChance, random });
  }

  /** Every so often a chest drops into a random open spot (the more fighters, the more often). */
  private updateRandomChests(dt: number) {
    const n = this.fighters.length;
    this.chestTimer -= dt;
    if (this.chestTimer > 0) return;
    this.chestTimer = randomChestInterval(n);
    if (this.quest ? this.chests.length >= QUEST_MAX_CHESTS : this.chests.filter((c) => c.random).length >= maxRandomChests(n)) return;
    // Starts just below zero so the landing sound plays as it touches down.
    this.dropRandomChest(-0.01);
  }

  private dropRandomChest(age: number) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = Phaser.Math.Between(ARENA.x + 50, ARENA.x + ARENA.w - 50);
      const y = Phaser.Math.Between(ARENA.y + 50, ARENA.y + ARENA.h - 50);
      const blocked = this.obstacleRects.some((o) => x > o.x - 40 && x < o.right + 40 && y > o.y - 40 && y < o.bottom + 40);
      const crowded = this.fighters.some((f) => f.alive && Math.hypot(f.x - x, f.y - y) < 80);
      const nearChest = this.chests.some((c) => Math.hypot(c.x - x, c.y - y) < 80);
      const nearSeal = this.seals.some((s) => Math.hypot(s.x - x, s.y - y) < s.radius + 40);
      const onEscortRoad = this.lantern && distanceToEscortPath({ x, y }, this.lantern.path) < this.lantern.radius + 40;
      if (blocked || crowded || nearChest || nearSeal || onEscortRoad) continue;
      this.addChest(x, y, age, false, EMPTY_CHEST_CHANCE, true);
      this.fx.sparks(x, y, 0xffd86b, 8);
      return;
    }
  }

  private openChest(c: Chest, f: Fighter) {
    this.chests.splice(this.chests.indexOf(c), 1);
    c.collider.destroy();
    c.body.destroy();
    if (c.empty) {
      sfx.chestEmpty();
      this.fx.smoke(c.x, c.y, 10, 0.8);
      this.popText(c.x, c.y - 28, T().emptyChest, '#b8b2a6');
      return;
    }
    sfx.chestOpen();
    // A second, overlapping chime so a big chest sounds richer.
    if (c.big) this.time.delayedCall(160, () => sfx.chestOpen());
    const count = c.big ? BIG_CHEST_ITEMS : 1;
    for (let n = 0; n < count; n++) {
      const item = rollItem(this.mode !== 'ffa');
      const kept = f.receiveItem(item);
      this.popText(c.x, c.y - 28 - n * 20, `${T().itemName(item)}${kept ? '' : `  ${T().usedNow}`}`, '#f2c94c');
      // Item icon pops out of the chest, then flies to whoever opened it.
      const icon = this.add.container(c.x, c.y);
      this.lTop.add(icon);
      const ig = this.add.graphics();
      ig.fillStyle(0x000000, 0.45).fillCircle(0, 0, 16);
      ig.lineStyle(2, 0xd9ae4a, 1).strokeCircle(0, 0, 16);
      drawItemIcon(ig, item.id, 0, 0, 24);
      icon.add(ig);
      const spread = count > 1 ? (n - (count - 1) / 2) * 34 : 0;
      this.tweens.add({ targets: icon, x: c.x + spread, y: c.y - 40, duration: 260, ease: 'Quad.easeOut' });
      this.tweens.add({ targets: icon, x: f.x, y: f.y, scale: 0.4, alpha: 0, delay: 380 + n * 160, duration: 320, ease: 'Quad.easeIn', onComplete: () => icon.destroy() });
    }
    this.fx.sparks(c.x, c.y, 0xffd86b, c.big ? 16 : 6);
    this.fx.smoke(c.x, c.y, c.big ? 14 : 8, c.big ? 1 : 0.7);
    for (let i = 0; i < (c.big ? 18 : 10); i++) {
      const spark = this.add.circle(c.x, c.y, 2.5, 0xffd86b);
      this.lTop.add(spark);
      const a = Math.random() * Math.PI * 2;
      this.tweens.add({ targets: spark, x: c.x + Math.cos(a) * 40, y: c.y + Math.sin(a) * 40, alpha: 0, duration: 500, onComplete: () => spark.destroy() });
    }
  }

  private renderChest(g: Phaser.GameObjects.Graphics, c: Chest) {
    // Drops in from above during its first 0.3s (age starts negative while it waits its turn).
    if (c.age < 0) return;
    const drop = Math.max(0, 1 - c.age / 0.3);
    const sx = c.shakeT > 0 ? Phaser.Math.Between(-2, 2) : 0;
    const x = c.x - c.w / 2 + sx;
    const y = c.y - c.h / 2 - drop * drop * 60;
    g.fillStyle(0x000000, 0.3 * (1 - drop)).fillEllipse(c.x + 3, c.y + c.h / 2, c.w + 6, 10);
    // Body and lid: plain wood, or red lacquer for a big chest.
    const [body, lid, edge] = c.big ? [0x7d1f17, 0xa8302a, 0x3a0d08] : [0x7a4a22, 0x9a6230, 0x3d2410];
    const band = c.big ? 6 : 4;
    g.fillStyle(body, 1).fillRect(x, y, c.w, c.h);
    g.fillStyle(lid, 1).fillRect(x, y, c.w, c.h * 0.42);
    g.lineStyle(c.big ? 2 : 1, edge, 1).strokeRect(x, y, c.w, c.h).lineBetween(x, y + c.h * 0.42, x + c.w, y + c.h * 0.42);
    // Gold bands and lock.
    g.fillStyle(0xd9ae4a, 1).fillRect(x + 5, y, band, c.h).fillRect(x + c.w - 5 - band, y, band, c.h);
    const lock = c.big ? 12 : 8;
    g.fillRect(c.x + sx - lock / 2, y + c.h * 0.42 - lock / 2, lock, lock + 1);
    g.fillStyle(edge, 1).fillRect(c.x + sx - 1, y + c.h * 0.42, 2, 3);
    if (c.big) {
      // Gold corner caps and a soft golden glow.
      g.fillStyle(0xd9ae4a, 1);
      for (const [cx, cy] of [[x, y], [x + c.w - 7, y], [x, y + c.h - 7], [x + c.w - 7, y + c.h - 7]]) g.fillRect(cx, cy, 7, 7);
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 300);
      this.gGlow.fillStyle(0xffc04a, 0.08 + pulse * 0.08).fillCircle(c.x, c.y, c.w * 0.9);
    }
    // Twinkle so chests catch the eye.
    const tw = (this.time.now / 700 + c.x) % 1;
    if (tw < 0.25) g.fillStyle(0xfff3c4, 1 - tw * 4).fillCircle(x + c.w - 4, y + 3, 2.5);
    if (c.hp < c.maxHp) {
      const bw = c.w + 2;
      g.fillStyle(0x000000, 0.6).fillRect(c.x - bw / 2, y - 9, bw, 5);
      g.fillStyle(0xd9ae4a, 1).fillRect(c.x - bw / 2 + 1, y - 8, (bw - 2) * Math.max(0, c.hp / c.maxHp), 3);
    }
  }

  // ---------- Save the Princess ----------

  private configurePrincessWalls() {
    for (const wall of this.walls) {
      const members = this.fighters.filter((f) => f.team === wall.team).length;
      wall.maxHp = wall.hp = this.quest?.stage === QUEST.rescueStage
        ? QUEST.rescue.wallBase + QUEST.rescue.wallPerPlayer * members
        : PRINCESS_WALL_HP * Math.max(1, members) / 2;
    }
  }

  private makeWall(o: Obstacle): PrincessWall {
    // Fixed crack pattern, spread around the wall ring.
    const rand = new Phaser.Math.RandomDataGenerator(['princess-wall']);
    const cracks: { x: number; y: number }[][] = [];
    for (let i = 0; i < 10; i++) {
      const side = i % 4;
      const t = rand.frac();
      let x = side < 2 ? o.x - o.w / 2 + t * o.w : side === 2 ? o.x - o.w / 2 + 6 : o.x + o.w / 2 - 6;
      let y = side >= 2 ? o.y - o.h / 2 + t * o.h : side === 0 ? o.y - o.h / 2 + 6 : o.y + o.h / 2 - 6;
      const line = [{ x, y }];
      for (let k = 0; k < 4; k++) {
        x += rand.between(-9, 9);
        y += rand.between(-9, 9);
        line.push({ x, y });
      }
      cracks.push(line);
    }
    return { o, team: o.team ?? 0, hp: PRINCESS_WALL_HP, maxHp: PRINCESS_WALL_HP, lastHitter: null, shakeT: 0, rescued: false, cracks };
  }

  private showPrincessIntro() {
    this.princessText = this.add.text(WIDTH / 2, HUD_HEIGHT + 12, '', {
      fontFamily: FONT, resolution: RES, fontSize: '17px', fontStyle: 'bold', color: '#ffd6ea',
      backgroundColor: '#141821', padding: { x: 12, y: 4 },
    }).setOrigin(0.5).setDepth(15);
    this.updatePrincessProgress();
    // The quest stage banner already states this goal, so a second copy would sit on the same line.
    if (!this.quest) {
      const banner = this.add
        .text(WIDTH / 2, SCREEN_ARENA.y + 30, T().princessGoal, { fontFamily: FONT, resolution: RES, fontSize: '26px', fontStyle: 'bold', color: '#ffd6ea', stroke: '#000000', strokeThickness: 5 })
        .setOrigin(0.5)
        .setDepth(15);
      this.tweens.add({ targets: banner, alpha: 0, delay: 2600, duration: 800, onComplete: () => banner.destroy() });
    }
    this.helpTexts = this.walls.map((w) => {
      const spot = this.helpCalloutSpot(w.o);
      const t = this.add
        .text(spot.x, spot.y, T().help, {
          fontFamily: FONT, resolution: RES, fontSize: '14px', fontStyle: 'bold', color: '#ffffff', backgroundColor: toHex(this.sideColor(w.team)), padding: { x: 6, y: 2 },
        })
        .setOrigin(0.5);
      this.lTop.add(t);
      this.tweens.add({ targets: t, y: t.y - 5, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
      return t;
    });
  }

  /**
   * "Help!" floats above the wall. On the rescue stage the upper cage sits in the
   * stage-title band, so that callout moves to the inner side of the wall instead.
   */
  private helpCalloutSpot(o: Obstacle) {
    const above = { x: o.x, y: o.y - o.h / 2 - 34 };
    if (!this.quest) return above;
    const screenY = HUD_HEIGHT + above.y / S;
    if (screenY > SCREEN_ARENA.y + 62) return above;
    const inward = o.x / S < WIDTH / 2 ? 1 : -1;
    const screenX = o.x / S + inward * (o.w / S / 2 + 46);
    const beside = Math.max(SCREEN_ARENA.y + 78, HUD_HEIGHT + (o.y - o.h / 2) / S + 22);
    return { x: screenX * S, y: (beside - HUD_HEIGHT) * S };
  }

  private updatePrincessProgress() {
    if (this.quest) {
      this.princessText?.setText(T().questRescueProgress(this.walls.filter((w) => w.rescued).length, this.walls.length));
      return;
    }
    this.princessText?.setText([0, 1].map((team) => {
      const walls = this.walls.filter((w) => w.team === team);
      return T().princessProgress(T().teamNames[team], walls.filter((w) => w.rescued).length, walls.length);
    }).join('   ·   '));
  }

  findReviveTarget(f: Fighter): Fighter | null {
    return this.fighters.find((t) => t !== f && !t.alive && !f.isEnemy(t)) ?? null;
  }

  reviveSpot(f: Fighter): { x: number; y: number } {
    const r = f.radius;
    const d = r * 2.4;
    // Try behind the caster first, then sweep around them.
    for (let i = 0; i < 8; i++) {
      const a = f.facing + Math.PI + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 4);
      const x = f.x + Math.cos(a) * d;
      const y = f.y + Math.sin(a) * d;
      const inside = x > ARENA.x + r && x < ARENA.x + ARENA.w - r && y > ARENA.y + r && y < ARENA.y + ARENA.h - r;
      const blocked = this.obstacleRects.some((o) => x > o.x - r && x < o.right + r && y > o.y - r && y < o.bottom + r);
      const crowded = this.fighters.some((o) => o.alive && Math.hypot(o.x - x, o.y - y) < r * 2);
      if (inside && !blocked && !crowded) return { x, y };
    }
    return { x: f.x, y: f.y };
  }

  hazardSlow(f: Fighter): number {
    let mult = 1;
    for (const c of this.caltrops) if (f.team !== c.team && Math.hypot(f.x - c.x, f.y - c.y) < c.r) mult = Math.min(mult, c.slow);
    const phase = this.quest?.stage === QUEST.groveStage ? this.grovePhase() : null;
    if (phase?.active && phase.roles.includes('illusion') && this.groveIllusion === 'heat' && f.team === 0) mult = Math.min(mult, QUEST.grove.heatSlow);
    const snareHeat = this.snareTrees.some((t) => t.grove === 'illusion' && t.alive) && this.snareIllusion === 'heat' && f.team === (this.isHell ? 1 : 0);
    if (snareHeat) mult = Math.min(mult, QUEST.snare.heatSlow);
    return mult;
  }

  dropCaltrops(f: Fighter, e: { radius: number; duration: number; dps: number; slow: number }) {
    const spikes = Array.from({ length: 26 }, () => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * e.radius;
      return { x: f.x + Math.cos(a) * r, y: f.y + Math.sin(a) * r, a: Math.random() * Math.PI };
    });
    this.caltrops.push({ x: f.x, y: f.y, r: e.radius, t: 0, life: e.duration, team: f.team, owner: f, dps: e.dps, slow: e.slow, spikes, tick: 0 });
  }

  /** Damage ticks every half second for enemies standing in caltrops. */
  private updateCaltrops(dt: number) {
    if (this.countdown > 0 || this.over) return;
    for (const c of this.caltrops) {
      c.t += dt;
      c.tick += dt;
      if (c.tick < 0.5) continue;
      c.tick -= 0.5;
      for (const f of this.fighters) {
        if (!f.alive || f.team === c.team || Math.hypot(f.x - c.x, f.y - c.y) >= c.r) continue;
        const before = f.hp;
        const taken = f.stats.taken;
        f.takeChip(c.dps * 0.5);
        const actual = f.stats.taken - taken;
        c.owner.addSoul(actual);
        this.stats[c.owner.index].dealt += actual;
        if (before > 0 && !f.alive) this.stats[c.owner.index].kos++;
      }
    }
    this.caltrops = this.caltrops.filter((c) => c.t < c.life);
  }

  onSubstitute(f: Fighter, dirx: number, diry: number) {
    // Leave a log (and smoke) where we were, reappear ~100px away from the attacker.
    const from = { x: f.x, y: f.y };
    const base = Math.atan2(diry, dirx);
    let spot = from;
    for (let i = 0; i < 8; i++) {
      const a = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 5);
      const x = from.x + Math.cos(a) * 100;
      const y = from.y + Math.sin(a) * 100;
      const r = f.radius;
      const inside = x > ARENA.x + r && x < ARENA.x + ARENA.w - r && y > ARENA.y + r && y < ARENA.y + ARENA.h - r;
      const blocked = this.obstacleRects.some((o) => x > o.x - r && x < o.right + r && y > o.y - r && y < o.bottom + r);
      if (inside && !blocked) {
        spot = { x, y };
        break;
      }
    }
    f.body.reset(spot.x - f.radius, spot.y - f.radius);
    this.fx.smoke(from.x, from.y, 16, 1.1);
    this.fx.smoke(spot.x, spot.y, 10, 0.8);
    this.fx.substituteLog(from.x, from.y);
    this.popText(from.x, from.y - 26, T().substituted, '#d9c9a0');
  }

  teleportSafe(f: Fighter) {
    const enemies = this.fighters.filter((o) => o.alive && f.isEnemy(o));
    const r = f.radius;
    let best: { x: number; y: number } | null = null;
    let bestScore = -1;
    for (let k = 0; k < 60; k++) {
      const x = Phaser.Math.Between(ARENA.x + 40, ARENA.x + ARENA.w - 40);
      const y = Phaser.Math.Between(ARENA.y + 40, ARENA.y + ARENA.h - 40);
      const blocked =
        this.obstacleRects.some((o) => x > o.x - r && x < o.right + r && y > o.y - r && y < o.bottom + r) ||
        this.chests.some((c) => Math.abs(x - c.x) < c.w / 2 + r && Math.abs(y - c.y) < c.h / 2 + r);
      if (blocked) continue;
      // Score = distance to the nearest enemy (anywhere is fine if there are none).
      const score = enemies.length ? Math.min(...enemies.map((e) => Math.hypot(e.x - x, e.y - y))) : Math.random();
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
    if (!best) return;
    this.fx.smoke(f.x, f.y, 16, 1.1);
    f.body.reset(best.x - r, best.y - r);
    this.fx.smoke(best.x, best.y, 12, 0.9);
  }

  forTeam(f: Fighter, apply: (t: Fighter) => void) {
    for (const t of this.fighters) {
      if (!t.alive || t.isEnemy(f)) continue;
      apply(t);
      this.fx.sparks(t.x, t.y, 0xffd86b, 6);
    }
  }

  healTeam(f: Fighter, amount: number) {
    for (const t of this.fighters) {
      if (!t.alive || t.isEnemy(f)) continue;
      const gained = t.heal(amount);
      if (gained > 0) this.popText(t.x, t.y - 30, `+${Math.round(gained)}`, '#7dff8a');
      for (let k = 0; k < 6; k++) this.fx.leaf(t.x, t.y);
    }
  }

  /** The first zone under a battlefield point (zones are in map / design coordinates). */
  private zoneAt(wx: number, wy: number) {
    const { x, y } = toDesign(wx, wy);
    return this.map.zones?.find((zone) => Math.abs(x - zone.x) < zone.w / 2 && Math.abs(y - zone.y) < zone.h / 2);
  }

  terrainAt(wx: number, wy: number): TerrainKind | null {
    if (this.quest?.stage === QUEST.groveStage) {
      const phase = this.grovePhase();
      if (phase.active && phase.roles.includes('illusion') && this.groveIllusion === 'ice') return 'ice';
    }
    if (this.quest?.stage === QUEST.snareStage && this.snareIllusion === 'ice' && this.snareTrees.some((t) => t.grove === 'illusion' && t.alive)) return 'ice';
    const z = this.zoneAt(wx, wy);
    if (!z || z.kind === 'floor') return null;
    // Tide flats are plain ground at low tide and slow shallows when flooded.
    if (z.kind === 'tide') return this.tideState().flooded ? 'shallows' : null;
    return z.kind;
  }

  /** Whether the tide is in, and whether it's about to come in (for the warning). */
  private tideState() {
    const C = this.map.tideCycle;
    if (!C || this.countdown > 0) return { flooded: false, rising: false, k: 0 };
    const t = this.elapsedFight();
    const phase = Math.floor(t / C.period);
    const into = t - phase * C.period;
    // Odd phases are high tide; the water creeps in over the last `warn` seconds of low tide.
    const flooded = phase % 2 === 1;
    const rising = !flooded && into > C.period - C.warn;
    return { flooded, rising, k: rising ? (into - (C.period - C.warn)) / C.warn : flooded ? 1 : 0 };
  }

  windAt(wx: number, wy: number) {
    const z = this.zoneAt(wx, wy);
    if (z?.kind === 'wind' && z.push) return z.push;
    if (z?.kind === 'vortex' && z.pull) {
      // Drag towards the middle (harder near it) and swirl round.
      const c = toWorld(z);
      const dx = c.x - wx;
      const dy = c.y - wy;
      const d = Math.hypot(dx, dy) || 1;
      const k = z.pull * (0.6 + 0.6 * (1 - Math.min(1, d / ((z.w * S) / 2))));
      return { x: (dx / d) * k - (dy / d) * k * 0.7, y: (dy / d) * k + (dx / d) * k * 0.7 };
    }
    return null;
  }

  onPillRevived(f: Fighter) {
    sfx.respawn();
    this.fx.smoke(f.x, f.y, 12, 1);
    this.fx.sparks(f.x, f.y, 0xff7ac0, 14);
    this.screenFlash(0xff7ac0, 0.18);
    this.popText(f.x, f.y - 40, T().pillRevived, '#ff9ad0');
  }

  onRevived(target: Fighter, by?: Fighter) {
    this.respawnTimers.delete(target);
    this.deathTime.delete(target);
    if (by) {
      this.fx.lifeline(() => ({ x: by.x, y: by.y }), () => ({ x: target.x, y: target.y }));
      this.fx.skillCast(() => ({ x: target.x, y: target.y }), { kind: 'revive' }, target.facing);
    }
  }

  /**
   * While a team still has a tower, its fallen players come back at its main tower,
   * and only the main tower: the small towers can't. The wait starts short and grows
   * as the battle goes on. The prison tree may return several guards at once, never past four alive.
   */
  private updateTeamRespawns(dt: number) {
    this.elapsed += dt;
    const baseWait = Math.min(TEAM_RESPAWN.max, TEAM_RESPAWN.base + this.elapsed * TEAM_RESPAWN.growthPerSec);
    for (const f of this.fighters) if (!f.alive && !this.deathTime.has(f)) this.deathTime.set(f, this.elapsed);
    for (const team of [0, 1]) {
      // Quest enemy towers and the prison tree are slow to bring their fallen back.
      const questEnemyRespawn = (this.quest?.stage === 1 || this.quest?.stage === QUEST.rescueStage) && team === 1;
      const respawnFactor = this.quest?.stage === QUEST.rescueStage ? QUEST.rescue.tree.respawnFactor : QUEST.towerRespawnFactor;
      const wait = questEnemyRespawn ? baseWait * respawnFactor : baseWait;
      const dead = this.fighters
        .filter((f) => !f.alive && f.team === team)
        .sort((a, b) => (this.deathTime.get(a) ?? 0) - (this.deathTime.get(b) ?? 0));
      // Only the main tower can bring anyone back; the small towers can't.
      const home = this.towers.find((tw) => tw.alive && tw.main && tw.team === team);
      for (const f of dead) this.respawnTimers.delete(f);
      if (dead.length === 0 || !home) {
        this.teamRespawnT[team] = -1;
        continue;
      }
      const room = this.quest?.stage === QUEST.rescueStage
        ? QUEST.rescue.enemies - this.fighters.filter((f) => f.alive && f.team === team).length
        : 1;
      if (room <= 0) {
        this.teamRespawnT[team] = -1;
        continue;
      }
      if (this.teamRespawnT[team] < 0) this.teamRespawnT[team] = wait;
      this.teamRespawnT[team] -= dt;
      // Countdown on the next one in line; the rest are waiting their turn.
      dead.forEach((f, k) => this.respawnTimers.set(f, k === 0 ? Math.max(0, this.teamRespawnT[team]) : Infinity));
      if (this.teamRespawnT[team] > 0) continue;
      // The prison tree can return several fallen guards at once, from one up to a full set of four.
      const bringing = this.quest?.stage === QUEST.rescueStage
        ? 1 + Math.floor(Math.random() * Math.min(room, dead.length))
        : 1;
      const taken = this.fighters.filter((o) => o.alive).map((o) => ({ x: o.x, y: o.y }));
      for (let n = 0; n < bringing && home.alive; n++) {
        const f = dead[n];
        const spot = this.freeSpot({ x: home.x + (home.x < WORLD_CENTER.x ? 1 : -1) * (home.w / 2 + 30), y: home.y }, taken);
        taken.push(spot);
        this.respawnTimers.delete(f);
        this.deathTime.delete(f);
        f.revive(spot.x, spot.y, f.maxHp * TOWER_RESPAWN_HP);
        // Coming back through a tower costs you everything you were carrying, and half your soul.
        f.pocket.length = 0;
        f.selectedItem = 0;
        f.soul *= TOWER_RESPAWN_SOUL_KEEP;
        sfx.respawn();
        // Bringing someone back costs the tower some of its HP.
        // Quest guards consume their tower's remaining HP too: repeated defeats can exhaust it.
        const cost = Math.min(questEnemyRespawn ? home.hp : home.hp - 1, home.maxHp * RESPAWN_TOWER_COST);
        if (cost > 0) {
          if (questEnemyRespawn) this.damageTower(home, cost, undefined);
          else {
            home.hp -= cost;
            home.shakeT = 0.15;
            this.popText(home.x, home.y - home.h / 2 - 12, `-${Math.round(cost)}`, '#9fd8ff');
          }
        }
        this.fx.respawnBeam(home.x, home.y, spot.x, spot.y, this.sideColor(team));
      }
      this.teamRespawnT[team] = dead.length > bringing ? wait : -1;
    }
  }


  private breakWall(wall: PrincessWall) {
    if (wall.rescued || this.over) return;
    wall.hp = 0;
    wall.rescued = true;
    this.world.objectives = this.walls.filter((w) => !w.rescued).map((w) => ({ team: w.team, x: w.o.x, y: w.o.y, w: w.o.w, h: w.o.h }));
    // A rescued enclosure stops blocking movement, projectiles and future spawn placement.
    wall.body?.destroy();
    if (wall.rect) {
      this.obstacleRects = this.obstacleRects.filter((r) => r !== wall.rect);
      this.shotBlockers = this.shotBlockers.filter((r) => r !== wall.rect);
    }
    this.updatePrincessProgress();
    sfx.wallBreak();
    const o = wall.o;
    this.helpTexts[this.walls.indexOf(wall)]?.destroy();
    // Rubble flying out.
    for (let i = 0; i < 26; i++) {
      const chunk = this.add
        .rectangle(o.x + Phaser.Math.Between(-40, 40), o.y + Phaser.Math.Between(-40, 40), Phaser.Math.Between(6, 13), Phaser.Math.Between(5, 10), 0x8d877a)
        .setStrokeStyle(1, 0x4f4a42)
        .setAngle(Phaser.Math.Between(0, 90));
      this.lTop.add(chunk);
      const a = Math.atan2(chunk.y - o.y, chunk.x - o.x);
      this.tweens.add({
        targets: chunk,
        x: chunk.x + Math.cos(a) * Phaser.Math.Between(40, 110),
        y: chunk.y + Math.sin(a) * Phaser.Math.Between(40, 110),
        angle: chunk.angle + Phaser.Math.Between(-180, 180),
        duration: 600,
        ease: 'Cubic.easeOut',
      });
    }
    // Hearts for the rescued princess.
    for (let i = 0; i < 8; i++) {
      const heart = this.add.text(o.x, o.y, '♥', { fontFamily: FONT, resolution: RES, fontSize: '22px', color: '#ff6fae' }).setOrigin(0.5);
      this.lTop.add(heart);
      this.tweens.add({
        targets: heart,
        x: o.x + Phaser.Math.Between(-70, 70),
        y: o.y - Phaser.Math.Between(40, 110),
        alpha: 0,
        delay: i * 120,
        duration: 1400,
      });
    }
    const teamWalls = this.walls.filter((w) => w.team === wall.team);
    if (teamWalls.every((w) => w.rescued)) {
      if (this.quest?.stage === QUEST.rescueStage) {
        this.rescueGateOpen = true;
        if (this.isHell) this.questFail();
        else if (this.questTree && !this.questTree.alive && !this.fighters.some((f) => f.team === 1 && f.alive)) this.questClear();
        else this.showBanner(T().questRescuedFight, this.sideColor(wall.team));
      }
      else this.endRound(wall.lastHitter ?? undefined, T().rescued(T().teamNames[wall.team]), this.sideColor(wall.team));
    } else {
      this.showBanner(T().princessProgress(T().teamNames[wall.team], teamWalls.filter((w) => w.rescued).length, teamWalls.length), this.sideColor(wall.team));
    }
  }

  /** True while the prison tree is still shut behind the princess seal. */
  private rescueTreeSealed() {
    return this.quest?.stage === QUEST.rescueStage && !this.rescueGateOpen
      && !(this.walls.length === 2 && this.walls.every((w) => w.rescued));
  }

  /** Rescuers stop at the seal. Guards on the far side can still cross it to fight. */
  private updateRescueGate() {
    if (this.quest?.stage !== QUEST.rescueStage || this.rescueGateOpen) return;
    const gate = this.rescueGateX;
    for (const f of this.fighters) {
      if (f.team !== 0 || !f.alive || f.trapped || f.x <= gate - f.radius) continue;
      if (f.body.velocity.x > 0) f.body.setVelocity(0, f.body.velocity.y);
      f.warp(gate - f.radius - 2, f.y);
    }
  }

  private renderRescueGate(now: number) {
    if (this.quest?.stage !== QUEST.rescueStage || this.rescueGateOpen) return;
    const x = this.rescueGateX;
    const top = ARENA.y;
    const h = ARENA.h;
    const pulse = 0.55 + 0.45 * Math.sin(now * 3);
    this.g.fillStyle(0x2a1838, 0.55).fillRect(x - 16, top, 32, h);
    this.g.lineStyle(3, 0xc9a0e8, 0.45 + 0.35 * pulse);
    this.g.lineBetween(x - 14, top, x - 14, top + h);
    this.g.lineBetween(x + 14, top, x + 14, top + h);
    this.gGlow.fillStyle(0xb46bdc, 0.12 + 0.08 * pulse).fillRect(x - 22, top, 44, h);
    for (let i = 0; i < 8; i++) {
      const y = top + ((i + 0.5) / 8) * h;
      const sway = Math.sin(now * 2 + i) * 6;
      this.g.lineStyle(4, 0x6a4a88, 0.9).lineBetween(x - 10, y - 28, x + sway, y);
      this.g.lineStyle(2, 0xe4c6ff, 0.8).lineBetween(x + sway, y, x + 10, y + 28);
      this.g.fillStyle(0xf0d8ff, 0.7).fillCircle(x + sway, y, 4);
    }
  }

  private renderWallAndPrincess(g: Phaser.GameObjects.Graphics, wall: PrincessWall) {
    const o = wall.o;
    const broken = wall.hp <= 0;
    const sx = wall.shakeT > 0 ? Phaser.Math.Between(-2, 2) : 0;
    const sy = wall.shakeT > 0 ? Phaser.Math.Between(-2, 2) : 0;
    const l = o.x - o.w / 2 + sx;
    const t = o.y - o.h / 2 + sy;
    const th = this.quest?.stage === QUEST.rescueStage ? 50 : 38;

    if (!broken) {
      // Shadow, inner floor, then the brick ring.
      g.fillStyle(0x000000, 0.35).fillRect(l + 7, t + 9, o.w, o.h);
      g.fillStyle(0x4a443b, 1).fillRect(l, t, o.w, o.h);
      g.fillStyle(0x8d877a, 1);
      g.fillRect(l, t, o.w, th).fillRect(l, t + o.h - th, o.w, th).fillRect(l, t, th, o.h).fillRect(l + o.w - th, t, th, o.h);
      // Brick joints.
      g.lineStyle(1, 0x5a554c, 1);
      for (let x = l; x <= l + o.w; x += 16) {
        g.lineBetween(x, t, x, t + th / 2);
        g.lineBetween(x + 8, t + th / 2, x + 8, t + th);
        g.lineBetween(x, t + o.h - th, x, t + o.h - th / 2);
        g.lineBetween(x + 8, t + o.h - th / 2, x + 8, t + o.h);
      }
      for (let y = t; y <= t + o.h; y += 16) {
        g.lineBetween(l, y, l + th / 2, y);
        g.lineBetween(l + th / 2, y + 8, l + th, y + 8);
        g.lineBetween(l + o.w - th, y, l + o.w - th / 2, y);
        g.lineBetween(l + o.w - th / 2, y + 8, l + o.w, y + 8);
      }
      g.lineBetween(l, t + th / 2, l + o.w, t + th / 2).lineBetween(l, t + o.h - th / 2, l + o.w, t + o.h - th / 2);
      g.lineBetween(l + th / 2, t, l + th / 2, t + o.h).lineBetween(l + o.w - th / 2, t, l + o.w - th / 2, t + o.h);
      g.lineStyle(2, 0x4f4a42, 1).strokeRect(l, t, o.w, o.h).strokeRect(l + th, t + th, o.w - th * 2, o.h - th * 2);
      // Team-coloured trim so everyone can tell whose princess this is.
      g.lineStyle(3, this.sideColor(wall.team), 1).strokeRect(l - 2, t - 2, o.w + 4, o.h + 4);

      // Cracks appear as the wall loses HP.
      const shown = Math.floor((1 - wall.hp / wall.maxHp) * (wall.cracks.length + 1));
      g.lineStyle(2, 0x2a2622, 0.9);
      wall.cracks.slice(0, shown).forEach((line) => {
        g.beginPath();
        g.moveTo(line[0].x + sx, line[0].y + sy);
        for (const p of line.slice(1)) g.lineTo(p.x + sx, p.y + sy);
        g.strokePath();
      });
    }

    // The princess.
    const bob = Math.sin(this.time.now / 300) * 1.5;
    const px = o.x;
    const py = o.y + bob;
    g.fillStyle(0x000000, 0.3).fillEllipse(px + 3, o.y + 8, 30, 14);
    g.fillStyle(0xd94f8e, 1).fillCircle(px, py, 15);
    g.fillStyle(0xff8fc4, 1).fillCircle(px, py, 12);
    g.fillStyle(0x6b3f1f, 1).fillCircle(px, py - 1, 8.5);
    g.fillStyle(0xffe0c4, 1).fillCircle(px, py + 1.5, 6);
    g.fillStyle(0xf2c94c, 1).fillTriangle(px - 6, py - 6, px - 3, py - 13, px, py - 6);
    g.fillTriangle(px - 2, py - 6, px + 1, py - 14, px + 4, py - 6);
    g.fillTriangle(px + 2, py - 6, px + 5, py - 13, px + 7, py - 6);

    if (!broken) {
      // Wall HP bar.
      const bw = 110;
      const bx = o.x - bw / 2;
      const by = o.y - o.h / 2 - 16;
      g.fillStyle(0x000000, 0.65).fillRect(bx - 2, by - 2, bw + 4, 10);
      g.fillStyle(this.sideColor(wall.team), 1).fillRect(bx, by, bw * (wall.hp / wall.maxHp), 6);
    }
  }

  /** The map's ambient particles (petals, leaves, snow) and, on the courtyard, incense smoke. */
  private startAmbience() {
    if (this.map.fireworks) this.time.addEvent({
      delay: 1400,
      loop: true,
      callback: () => {
        const x = ARENA.x + 60 + Math.random() * (ARENA.w - 120);
        const y = ARENA.y + 40 + Math.random() * (ARENA.h - 80);
        this.fx.firework(x, y, [0xff6a8a, 0xffd23a, 0x6ad8ff, 0xa8ff6a, 0xc88aff][Math.floor(Math.random() * 5)]);
        sfx.firework();
      },
    });
    const smoke = this.map.smokeFrom && toWorld(this.map.smokeFrom);
    if (smoke) this.time.addEvent({
      delay: 260,
      loop: true,
      callback: () => {
        const puff = this.add
          .circle(smoke.x + Phaser.Math.Between(-8, 8), smoke.y + Phaser.Math.Between(-6, 6), 5, 0xd8d4cc, 0.28);
        this.lTop.add(puff);
        this.tweens.add({
          targets: puff,
          x: puff.x + Phaser.Math.Between(-30, 30),
          y: puff.y - Phaser.Math.Between(50, 80),
          scale: 4,
          alpha: 0,
          duration: 2600,
          onComplete: () => puff.destroy(),
        });
      },
    });
    const counts = { petals: 16, leaves: 16, snow: 40, fireflies: 24, embers: 30, dust: 30, mist: 10, wisps: 14, maple: 16, rain: 70, spores: 26 };
    this.petals = new Petals(this, ARENA, Math.round(counts[this.map.particles] * S * S), 6, this.map.particles, this.lTop);
  }

  /** Spot state changes (strike, death, revive, dash) to fire effects, and tick particles. */
  private updateFx(dt: number) {
    for (const f of this.fighters) {
      const prev = this.prevStates[f.index];
      const now = f.state;
      if (prev !== now) {
        if (now === 'active') this.weaponFx(f);
        if (now === 'dead') {
          this.fx.smoke(f.x, f.y, 22, 1.3);
          this.logs.set(f, { x: f.x, y: f.y, a: Math.random() * Math.PI });
        }
        if (prev === 'dead') {
          this.fx.smoke(f.x, f.y, 18, 1.1);
          this.logs.delete(f);
        }
        if (now === 'dash') this.fx.smoke(f.x, f.y, 6, 0.6);
        if (now === 'casting' && f.summoning) this.onSummonStart(f);
      }
      this.prevStates[f.index] = now;
      if (f.alive && f.powered && Math.random() < 0.5) this.fx.ember(f.x, f.y);
      if (f.state === 'channel' && Math.random() < 0.3) this.fx.leaf(f.x, f.y);
      if (f.alive && f.hp < f.maxHp && this.terrainAt(f.x, f.y) === 'spring' && Math.random() < 0.08) this.fx.leaf(f.x, f.y);
      if (f.alive && this.terrainAt(f.x, f.y) === 'poison' && Math.random() < 0.12) this.fx.sparks(f.x, f.y, 0x9aff6a, 1);
    }
    for (const p of this.projectiles) if (p.effect.radius > 8) this.fx.fireTrail(p.x, p.y, p.effect.radius);
    this.fx.update(dt);
  }

  /** The strike effect for each weapon, matching its hit shape. */
  private weaponFx(f: Fighter) {
    const s = f.weapon.shape;
    switch (f.weapon.id) {
      case 'fan':
        if (s.kind === 'sector') this.fx.flameFan(f.x, f.y, f.facing, s.radius, s.angle);
        break;
      case 'thunder-fan':
        if (s.kind === 'sector') this.fx.thunderFan(f.x, f.y, f.facing, s.radius, s.angle);
        sfx.thunderFan();
        break;
      case 'shuriken':
        if (s.kind === 'rect') this.fx.shurikenThrow(f.x, f.y, f.facing, s.offset, s.offset + s.length, f.color);
        break;
      case 'hammer':
        if (s.kind === 'circle') this.fx.hammerSmash(f.x + Math.cos(f.facing) * s.offset, f.y + Math.sin(f.facing) * s.offset, s.radius);
        break;
      case 'daggers':
        if (s.kind === 'rect') this.fx.daggerSlash(f.x, f.y, f.facing, s.offset + s.length, s.width, f.color);
        break;
      case 'flail':
        if (s.kind === 'ring') this.fx.chainSpin(() => ({ x: f.x, y: f.y }), f.facing, s.inner, s.outer);
        break;
      case 'kusarigama':
        if (s.kind === 'arc') this.fx.sickleSweep(() => ({ x: f.x, y: f.y }), f.facing, s.inner, s.outer, s.angle);
        break;
      case 'ninjato':
        if (s.kind === 'rect') this.fx.lungeSlash(() => ({ x: f.x, y: f.y }), f.facing, s.offset + s.length, s.width);
        break;
      case 'yari':
        if (s.kind === 'rect') this.fx.spearThrust(f.x, f.y, f.facing, s.offset, s.length, s.width, f.color);
        break;
      case 'talisman':
        if (s.kind === 'cross') this.fx.lightningCross(f.x, f.y, f.facing, s.arm, s.width);
        sfx.thunder();
        break;
      case 'staff':
        if (s.kind === 'twin') this.fx.staffSweep(() => ({ x: f.x, y: f.y }), f.facing, s.length, s.width);
        sfx.iceStaff();
        break;
      case 'kunai':
        if (s.kind === 'rays') this.fx.kunaiVolley(f.x, f.y, rayAngles(s, f.facing), s.offset, s.offset + s.length, f.color);
        break;
      case 'fire-kunai':
        if (s.kind === 'rays') this.fx.fireKunai(f.x, f.y, rayAngles(s, f.facing), s.offset, s.offset + s.length);
        break;
      case 'bomb':
        if (s.kind === 'circle') this.fx.bombBlast(f.x + Math.cos(f.facing) * s.offset, f.y + Math.sin(f.facing) * s.offset, s.radius);
        break;
    }
  }

  private poseOf(f: Fighter): Pose {
    let phase: Pose['phase'] = 'idle';
    let t = 0;
    if (f.state === 'windup') {
      phase = 'windup';
      t = f.stateProgress;
    } else if (f.state === 'active') {
      phase = 'strike';
      t = f.stateProgress * 0.25;
    } else if (f.state === 'recovery') {
      phase = 'strike';
      t = 0.25 + f.stateProgress * 0.75;
    }
    const sh = f.weapon.shape;
    const reach = sh.kind === 'circle' ? sh.offset : undefined;
    return { x: f.x, y: f.y, facing: f.facing, phase, t, color: f.color, time: this.time.now / 1000, reach };
  }

  private render() {
    const g = this.g;
    const over = this.gOver;
    g.clear();
    over.clear();
    this.gGlow.clear();
    const now = this.time.now / 1000;

    for (const w of this.walls) this.renderWallAndPrincess(g, w);
    this.renderRescueGate(now);
    for (const c of this.chests) this.renderChest(g, c);
    for (const tw of this.towers) this.renderTower(g, over, tw, now);
    // Healing beams from main towers to the teammates drawing on them.
    for (const { tower, f } of this.towerHeals) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 8 + f.index);
      this.gGlow.lineStyle(3, 0x7dff8a, 0.25 + pulse * 0.25).lineBetween(tower.x, tower.y, f.x, f.y);
      const k = (now * 1.5 + f.index * 0.3) % 1;
      this.gGlow.fillStyle(0xb8ffc4, 0.8).fillCircle(tower.x + (f.x - tower.x) * k, tower.y + (f.y - tower.y) * k, 3);
    }
    for (const log of this.logs.values()) drawLog(g, log.x, log.y, log.a);
    this.renderWind(now);
    this.renderVortex(now);
    this.renderFog(now);
    this.renderSpikes(now);
    this.renderPortals(now);
    this.renderStorm(now);
    this.renderVents(now);
    this.renderFlames(now);
    this.renderRollers(now);
    this.renderTide(now);
    this.renderDoors(now);
    this.renderKegs(now);
    this.renderBell(now);
    this.renderHerbs(now);
    this.renderBarrier(now);
    this.renderPads(now);
    this.renderAltar(now);
    this.renderQuestTree(now);
    this.renderGroveCast(now);
    this.renderSnareCast(now);
    this.renderNight(now);
    this.renderDirge();
    this.renderSeals(now);
    this.renderLantern(now);
    this.renderWardenBond(now);
    for (const c of this.caltrops) {
      // Fade in quickly, fade out over the last second.
      const a = Math.min(1, c.t * 6, c.life - c.t);
      g.fillStyle(0x000000, 0.12 * a).fillCircle(c.x, c.y, c.r);
      for (const sp of c.spikes) {
        g.lineStyle(2, 0x8a93a3, a);
        for (let k = 0; k < 2; k++) {
          const ang = sp.a + (k * Math.PI) / 2;
          g.lineBetween(sp.x - Math.cos(ang) * 4, sp.y - Math.sin(ang) * 4, sp.x + Math.cos(ang) * 4, sp.y + Math.sin(ang) * 4);
        }
      }
    }

    for (const p of this.projectiles) {
      const e = p.effect;
      const a = Math.atan2(p.vy, p.vx);
      if (e.radius > 8) {
        // Fire jutsu: hot core over the flame trail.
        this.gGlow.fillStyle(0xff7a2a, 0.5).fillCircle(p.x, p.y, e.radius * 1.4);
        this.gGlow.fillStyle(0xffe08a, 0.9).fillCircle(p.x, p.y, e.radius * 0.7);
      } else {
        // Thrown kunai with a faint streak.
        over.lineStyle(2, 0xffffff, 0.35).lineBetween(p.x - Math.cos(a) * 26, p.y - Math.sin(a) * 26, p.x, p.y);
        kunai(over, p.x - Math.cos(a) * 6, p.y - Math.sin(a) * 6, a, 14);
      }
    }

    for (const f of this.fighters) {
      const sprite = this.sprites[f.index];
      const tag = this.nameTags[f.index];
      if (f.trapped) {
        sprite.setVisible(false);
        tag.setPosition(f.x, f.y - 54);
        tag.setVisible(true);
        continue;
      }
      if (this.bossReserves.has(f)) {
        sprite.setVisible(false);
        tag.setVisible(false);
        continue;
      }
      const respawn = this.respawnTimers.get(f);
      const respawnText = f.paralyzed ? T().paralyzedTag : respawn === undefined ? '' : respawn === Infinity ? T().waitingRespawn : T().respawning(Math.ceil(respawn));
      tag.setText(respawnText ? `${this.tagTexts[f.index]}  ${respawnText}` : this.tagTexts[f.index]);
      if (!f.alive) {
        sprite.setVisible(false);
        const log = this.logs.get(f);
        tag.setPosition(log?.x ?? f.x, (log?.y ?? f.y) - 18).setAlpha(0.5);
        continue;
      }

      if (f.stealthed) {
        // Vanished: no shadow, scarf, weapon, bars or name, just a barely-there shimmer so the player can find themselves.
        sprite.setVisible(true).setPosition(f.x, f.y).setRotation(f.facing).setAlpha(0.05).clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
        const pulse = 0.5 + 0.5 * Math.sin(now * 6);
        over.lineStyle(1, f.color, 0.07 + 0.06 * pulse).strokeCircle(f.x, f.y, f.radius + 3);
        tag.setPosition(f.x, f.y - f.radius - 6).setAlpha(0);
        continue;
      }

      if (f.inFog) {
        // Lost in the fog: only a faint silhouette, no name, bars or weapon.
        sprite.setVisible(true).setPosition(f.x, f.y).setRotation(f.facing).setAlpha(0.3).clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
        tag.setPosition(f.x, f.y - f.radius - 6).setAlpha(0);
        continue;
      }

      // --- under the ninja ---
      g.fillStyle(0x000000, 0.3).fillEllipse(f.x + 4, f.y + 9, f.radius * 2.3, f.radius * 1.2);
      if (this.mode !== 'ffa') g.lineStyle(3, this.sideColor(f.team), 0.9).strokeCircle(f.x, f.y, f.radius + 5);
      if (f.boss) {
        // A dark, pulsing aura so everyone knows who the boss is.
        const pulse = 0.5 + 0.5 * Math.sin(now * 4);
        g.fillStyle(0x8a1020, 0.16 + pulse * 0.1).fillCircle(f.x, f.y, f.radius + 16 + pulse * 4);
        g.lineStyle(2, 0xff4a4a, 0.5 + pulse * 0.3).strokeCircle(f.x, f.y, f.radius + 12);
      }
      if (f.state === 'windup') {
        // Faint telegraph of the hit area, so opponents can react.
        drawShape(g, f.weapon.shape, f.x, f.y, f.facing, f.color, 0.05 + 0.13 * f.stateProgress);
      }
      if (f.powered) {
        const pulse = 0.5 + 0.5 * Math.sin(now * 11);
        g.fillStyle(0xff7a1a, 0.14 + pulse * 0.1).fillCircle(f.x, f.y, f.radius + 9 + pulse * 3);
      }
      if (f.sprinting || f.state === 'dash') {
        // Afterimages.
        for (const k of [1, 2]) {
          g.fillStyle(f.color, 0.14 / k).fillCircle(f.x - f.vx * 0.05 * k, f.y - f.vy * 0.05 * k, f.radius * 0.95);
        }
      }
      this.drawScarf(g, f, now);

      // --- the ninja ---
      sprite.setVisible(true).setPosition(f.x, f.y).setRotation(f.facing);
      const stunned = f.state === 'stun';
      sprite.setAlpha(stunned && Math.floor(now * 20) % 2 === 0 ? 0.55 : 1);
      if (f.flashT > 0) sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else if (f.chillT > 0) sprite.setTint(0xa8dcff).setTintMode(Phaser.TintModes.MULTIPLY);
      else if (f.paralyzed) sprite.setTint(0x9fc0ff).setTintMode(Phaser.TintModes.MULTIPLY);
      else sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      const summon = f.summoning;
      if (summon) {
        const color = this.summonColor(f);
        this.fx.summonCircle(g, this.gGlow, f.x, f.y, f.stateProgress, color, now, summon.kind);
        for (const t of this.summonTargets(f, summonStrikeCount(summon.kind, summon.level, f.boss))) this.fx.targetMark(over, t.x, t.y, f.stateProgress, color, now, summon.kind);
      }
      const charge = f.sacrificeCharge;
      if (charge) {
        // 捨身 telegraph: the blast area on the ground, filling up as the charge builds.
        const pulse = 0.5 + 0.5 * Math.sin(now * (8 + charge.t * 20));
        g.fillStyle(0xff2a2a, 0.08 + 0.12 * charge.t).fillCircle(f.x, f.y, charge.radius * charge.t);
        g.lineStyle(3, 0xff4a3a, 0.5 + 0.4 * pulse).strokeCircle(f.x, f.y, charge.radius);
        this.gGlow.fillStyle(0xff3a2a, 0.25 + 0.3 * pulse * charge.t).fillCircle(f.x, f.y, f.radius + 8 + charge.t * 8);
      }
      if (f.casting) {
        // The caster's aura matches the ritual's element.
        const k = 0.5 + 0.5 * Math.sin(now * 20);
        this.gGlow.fillStyle(this.summonColor(f), 0.14 + k * 0.1).fillCircle(f.x, f.y, f.radius + 10);
        this.gGlow.lineStyle(2, this.summonColor(f), 0.8).strokeCircle(f.x, f.y, f.radius + 12 + k * 4);
      }
      if (f.paralyzed) {
        // Crackling sparks while paralysed.
        for (let k = 0; k < 3; k++) {
          const a = Math.random() * Math.PI * 2;
          const r0 = f.radius - 4;
          const r1 = f.radius + 10;
          const mid = a + (Math.random() - 0.5) * 0.6;
          this.gGlow.lineStyle(2, 0xbfd4ff, 0.9).lineBetween(f.x + Math.cos(a) * r0, f.y + Math.sin(a) * r0, f.x + Math.cos(mid) * r1, f.y + Math.sin(mid) * r1);
        }
      }

      // --- on top ---
      drawHeldWeapon(over, f.weapon.id, this.poseOf(f));
      if (f.usesSoul && f.soulLevel > 0) {
        // One purple orb circling per soul level.
        for (let k = 0; k < f.soulLevel; k++) {
          const a = now * 3 + (k * Math.PI * 2) / f.soulLevel;
          this.gGlow.fillStyle(0xb57bff, 0.85).fillCircle(f.x + Math.cos(a) * (f.radius + 12), f.y + Math.sin(a) * (f.radius + 12), 3);
        }
      }
      if (f.substituting) {
        // A ghostly log hovering beside you while Substitution is ready.
        drawLog(over, f.x - Math.cos(f.facing) * 26, f.y - Math.sin(f.facing) * 26, f.facing + Math.PI / 2, 0.35);
      }
      if (f.guarded) {
        this.fx.guardAura(over, f.x, f.y, f.radius + 12, 0.6 + 0.2 * Math.sin(now * 7), now);
      }
      if (f.state === 'channel') {
        over.lineStyle(3, 0x7dff8a, 0.9);
        over.beginPath();
        over.arc(f.x, f.y, f.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f.stateProgress, false);
        over.strokePath();
      }
      if (stunned) {
        // Little stars circling the head.
        for (let k = 0; k < 3; k++) {
          const a = now * 8 + (k * Math.PI * 2) / 3;
          this.gGlow.fillStyle(0xffe08a, 0.9).fillCircle(f.x + Math.cos(a) * 12, f.y - 4 + Math.sin(a) * 5, 2.2);
        }
      }
      const reviveReady = f.skills.some((sk, k) => sk?.effect.kind === 'revive' && f.cooldowns[k] <= 0 && f.pe >= sk.peCost);
      if (reviveReady && this.findReviveTarget(f)) {
        // Lifeline hint: a green pulse when a fallen teammate can be revived right now.
        const pulse = (now / 0.9) % 1;
        over.lineStyle(2, 0x7dff8a, 0.8 * (1 - pulse)).strokeCircle(f.x, f.y, f.radius + 6 + pulse * 14);
      }

      // Overhead HP / PE.
      const bw = 40;
      const bx = f.x - bw / 2;
      const by = f.y - f.radius - 14;
      over.fillStyle(0x000000, 0.6).fillRect(bx - 1, by - 1, bw + 2, 8);
      over.fillStyle(0xe5484d, 1).fillRect(bx, by, bw * (f.hp / f.maxHp), 3);
      // PE bar glows a little while resting (recovering at the boosted rate).
      const peColor = f.peDeniedT > 0 ? 0xffffff : f.resting && f.pe < f.maxPe ? 0xfff0a0 : 0xf2c94c;
      over.fillStyle(peColor, 1).fillRect(bx, by + 4, bw * (f.pe / f.maxPe), 2);
      tag.setPosition(f.x, by - 2).setAlpha(1);
    }

    this.fx.draw(g, over, this.gGlow);
  }

  /** Two headband tails streaming from the knot at the back of the head. */
  private drawScarf(g: Phaser.GameObjects.Graphics, f: Fighter, now: number) {
    const speed = Math.hypot(f.vx, f.vy);
    const back = speed > 20 ? Math.atan2(-f.vy, -f.vx) : f.facing + Math.PI;
    const kx = f.x + Math.cos(f.facing + Math.PI) * 6;
    const ky = f.y + Math.sin(f.facing + Math.PI) * 6;
    const len = 14 + Math.min(14, speed * 0.05);
    for (const side of [-1, 1]) {
      const pts: { x: number; y: number }[] = [];
      for (let k = 0; k <= 5; k++) {
        const d = (len * k) / 5;
        const wave = Math.sin(now * 14 + k * 0.9 + side) * (1 + k * 0.7) + side * k * 0.9;
        pts.push({
          x: kx + Math.cos(back) * d - Math.sin(back) * wave,
          y: ky + Math.sin(back) * d + Math.cos(back) * wave,
        });
      }
      g.lineStyle(4, 0x000000, 0.35).strokePoints(pts as Phaser.Math.Vector2[], false);
      g.lineStyle(2.6, f.color, 1).strokePoints(pts as Phaser.Math.Vector2[], false);
    }
  }

  // HUD: a compact panel per player slot, in two rows of four across the top.
  private static readonly HUD = { cols: 4, pad: 42, barW: 88, skillX: 140, skill: 22, skillGap: 3, pocketX: 226, pocket: 20, pocketGap: 3 };

  /** Three or four skills stay on one row, clear of the item pocket. Larger kits wrap onto two rows. */
  private skillLayout(count: number) {
    const L = BattleScene.HUD;
    if (count <= 3) return { size: L.skill, gap: L.skillGap, cols: Math.max(1, count), originY: 12 };
    if (count === 4) {
      const gap = 2;
      const room = L.pocketX - L.skillX - 8;
      return { size: Math.floor((room - 3 * gap) / 4), gap, cols: 4, originY: 12 };
    }
    const cols = Math.ceil(count / 2);
    const gap = 1;
    const room = WIDTH / L.cols - L.skillX - 8;
    const size = Math.min(13, Math.max(8, Math.floor((room - (cols - 1) * gap) / cols)));
    return { size, gap, cols, originY: 16 };
  }

  private skillAt(count: number, k: number) {
    const lay = this.skillLayout(count);
    const col = k % lay.cols;
    const row = Math.floor(k / lay.cols);
    return {
      x: BattleScene.HUD.skillX + col * (lay.size + lay.gap),
      y: lay.originY + row * (lay.size + lay.gap),
      size: lay.size,
    };
  }

  private hudPanel(i: number) {
    if (this.hasHellPlayers) {
      const slot = i % QUEST.partySlots;
      const side = questSideOf(this.lobbySlots[slot], this.quest?.side);
      i = slot + (Math.floor(i / QUEST.partySlots) === (side === 'hell' ? 1 : 0) ? 0 : QUEST.partySlots);
    }
    const L = BattleScene.HUD;
    const pw = WIDTH / L.cols;
    const ph = HUD_HEIGHT / Math.ceil(MAX_PLAYERS / L.cols);
    return { x0: (i % L.cols) * pw, y0: Math.floor(i / L.cols) * ph, pw, ph };
  }

  private createHudText() {
    const L = BattleScene.HUD;
    const roleGlyph = (f: Fighter) => T().roleName(f.role)[0];
    this.slots.forEach((slot, i) => {
      const { x0, y0 } = this.hudPanel(i);
      const f = this.fighters.find((ff) => ff.index === i);
      if (!f) {
        this.add.text(x0 + L.pad, y0 + 16, `P${i + 1} — ${T().emptySlot}`, { fontFamily: FONT, resolution: RES, fontSize: '11px', color: '#4a5060' });
        return;
      }
      const color = toHex(this.quest ? this.sideColor(f.team) : PLAYER_COLORS[i]);
      const who = this.hasHellPlayers ? `${this.fighterLabel(f)} ${this.isMixedQuest ? T().questSides[f.team === 0 ? 'heroes' : 'hell'] : f.boss ? this.bossTitle(f) : roleGlyph(f)}` : this.quest && i >= QUEST.partySlots ? (f.boss ? this.bossTitle(f) : `${T().enemyTag} ${roleGlyph(f)}`) : `P${i + 1} ${roleGlyph(f)}`;
      const name = this.add.text(x0 + L.pad, y0 + 2, `${who}·${T().weaponName(f.weapon)}`, { fontFamily: FONT, resolution: RES, fontSize: '11px', color, fontStyle: 'bold' });
      this.hudNames[i] = name;
      this.hudSkillGlyphs[i] = [];
      if (this.mode !== 'ffa' && !this.quest) {
        this.add.text(name.x + name.width + 5, y0 + 3, T().teamNames[f.team], {
          fontFamily: FONT, resolution: RES, fontSize: '9px', fontStyle: 'bold', color: '#ffffff', backgroundColor: toHex(this.sideColor(f.team)), padding: { x: 3, y: 0 },
        });
      }
      this.keyLabels[i] = f.skills.map((s, k) => {
        const box = this.skillAt(f.skills.length, k);
        const cx = x0 + box.x + box.size / 2;
        const cy = y0 + box.y + box.size / 2;
        this.hudSkillGlyphs[i][k] = this.add.text(cx, cy, s ? s.zh[0] : '—', { fontFamily: FONT, resolution: RES, fontSize: box.size >= 20 ? '12px' : box.size >= 14 ? '11px' : '8px', color: '#ffffff' }).setOrigin(0.5).setDepth(2);
        // Key label tucked into the box's corner. CPU enemies have no key for a fourth skill.
        return this.add.text(cx + box.size / 2 - 1, y0 + box.y + box.size - 1, f.controller.labels[k + 1] ?? '', { fontFamily: FONT, resolution: RES, fontSize: '7px', color: '#c9ced8' }).setOrigin(1, 1);
      });
    });
  }

  private refreshHudLoadout(f: Fighter) {
    const who = this.hasHellPlayers ? this.fighterLabel(f) : f.boss ? this.bossTitle(f) : `${T().enemyTag} ${T().roleName(f.role)[0]}`;
    this.hudNames[f.index]?.setText(`${who}·${T().weaponName(f.weapon)}`);
    f.skills.forEach((s, k) => this.hudSkillGlyphs[f.index]?.[k]?.setText(s ? s.zh[0] : '—'));
  }

  private renderHud() {
    const L = BattleScene.HUD;
    const h = this.hud;
    h.clear();
    this.hudIcons.clear();
    h.fillStyle(0x0d0f14, 1).fillRect(0, 0, WIDTH, HUD_HEIGHT);
    for (let i = 0; i < this.slots.length; i++) {
      const { x0, y0, pw, ph } = this.hudPanel(i);
      const f = this.fighters.find((ff) => ff.index === i);
      h.fillStyle(f ? 0x151e2b : 0x101722, 1).fillRoundedRect(x0 + 3, y0 + 2, pw - 6, ph - 4, 5);
      h.lineStyle(1, f?.color ?? 0x344052, f ? 0.2 : 0.12).strokeRoundedRect(x0 + 3, y0 + 2, pw - 6, ph - 4, 5);
      if (!f) continue;
      const alpha = f.alive ? 1 : 0.35;
      h.fillStyle(f.color, alpha * 0.65).fillRoundedRect(x0 + 3, y0 + 9, 2, ph - 18, 1);
      // Team tint behind the panel in team modes.
      if (this.mode !== 'ffa') h.fillStyle(this.sideColor(f.team), 0.035).fillRoundedRect(x0 + 4, y0 + 3, pw - 8, ph - 6, 4);
      // Use the same weapon artwork as the loadout screen, with room beside the bars.
      h.fillStyle(0x1b2030, 1).fillRoundedRect(x0 + 6, y0 + 6, 30, 34, 5);
      h.lineStyle(1, f.color, alpha).strokeRoundedRect(x0 + 6, y0 + 6, 30, 34, 5);
      drawWeaponIcon(this.hudIcons, f.weapon.id, x0 + 21, y0 + 23, 25, f.color);
      // HP and PE (體力) bars.
      h.fillStyle(0x2a1416, 1).fillRect(x0 + L.pad, y0 + 18, L.barW, 9);
      h.fillStyle(0xe5484d, alpha).fillRect(x0 + L.pad, y0 + 18, L.barW * (f.hp / f.maxHp), 9);
      h.fillStyle(0x2a2614, 1).fillRect(x0 + L.pad, y0 + 30, L.barW, 5);
      const peColor = f.peDeniedT > 0 ? 0xffffff : f.resting && f.pe < f.maxPe ? 0xfff0a0 : 0xf2c94c;
      h.fillStyle(peColor, alpha).fillRect(x0 + L.pad, y0 + 30, L.barW * (f.pe / f.maxPe), 5);
      // Skill boxes with cooldown sweep. Large kits wrap so they stay clear of the bars.
      f.skills.forEach((s, k) => {
        const box = this.skillAt(f.skills.length, k);
        const bx = x0 + box.x;
        const by = y0 + box.y;
        const sz = box.size;
        if (!s) {
          h.fillStyle(0x14171f, alpha).fillRect(bx, by, sz, sz);
          h.lineStyle(1, 0x2a2f3c, alpha).strokeRect(bx, by, sz, sz);
          return;
        }
        const ready = f.cooldowns[k] <= 0;
        const affordable = f.pe >= s.peCost;
        h.fillStyle(ready && affordable ? 0x2f3a52 : 0x1b2030, alpha).fillRect(bx, by, sz, sz);
        if (!ready) {
          const frac = f.cooldowns[k] / skillCooldownFor(s, f.role);
          h.fillStyle(0x000000, 0.6).fillRect(bx, by + sz * (1 - frac), sz, sz * frac);
        }
        h.lineStyle(1, ready ? f.color : 0x3a4152, alpha).strokeRect(bx, by, sz, sz);
      });
      // Pocket: item slots, the selected one outlined in gold. A full kit claims that row, so the pocket moves up.
      const many = f.skills.length > 4;
      const pocketSize = many ? 14 : L.pocket;
      const pocketGap = many ? 2 : L.pocketGap;
      const soulW = many && f.usesSoul ? 52 : 0;
      const pocketX0 = many ? x0 + pw - 4 - soulW - POCKET_SIZE * (pocketSize + pocketGap) + pocketGap : x0 + L.pocketX;
      const pocketY = many ? y0 + 1 : y0 + 13;
      for (let k = 0; k < POCKET_SIZE; k++) {
        const item: Item | undefined = f.pocket[k];
        const px = pocketX0 + k * (pocketSize + pocketGap);
        const py = pocketY;
        h.fillStyle(item ? 0x2a2f3c : 0x14171f, 1).fillRoundedRect(px, py, pocketSize, pocketSize, 4);
        const selected = item && k === f.selectedItem;
        h.lineStyle(selected ? 2 : 1, selected ? 0xf2c94c : 0x2a2f3c, 1).strokeRoundedRect(px, py, pocketSize, pocketSize, 4);
        if (item) drawItemIcon(this.hudIcons, item.id, px + pocketSize / 2, py + pocketSize / 2, many ? 11 : 16);
      }
      // 魂 Soul (only for Thunder users): four diamonds; full levels lit, the one filling shows its progress.
      for (let k = 0; k < (f.usesSoul ? SOUL_LEVELS : 0); k++) {
        const cx = x0 + pw - 50 + k * 12;
        const cy = y0 + 7;
        const fill = Phaser.Math.Clamp(f.soul / SOUL_PER_LEVEL - k, 0, 1);
        const pts = [{ x: cx, y: cy - 5 }, { x: cx + 4, y: cy }, { x: cx, y: cy + 5 }, { x: cx - 4, y: cy }] as Phaser.Math.Vector2[];
        h.fillStyle(0x24202e, 1).fillPoints(pts, true);
        if (fill > 0) h.fillStyle(0xb57bff, fill >= 1 ? 1 : 0.25 + fill * 0.4).fillPoints(pts, true);
        // Blink red when a summon was just refused for lack of soul.
        const warn = f.soulDeniedT > 0 && Math.floor(f.soulDeniedT * 12) % 2 === 0;
        h.lineStyle(warn ? 2 : 1, warn ? 0xff4a5a : fill >= 1 ? 0xe2c8ff : 0x4a4058, 1).strokePoints(pts, true);
      }
    }
  }

  private endRound(winner: Fighter | undefined, message?: string, messageColor?: number) {
    this.over = true;
    this.winningTeam = winner?.team ?? this.winningTeam ?? (this.quest ? this.questTeam : null);
    // Let the final hit / wall crash ring out before the fanfare.
    this.time.delayedCall(message ? 700 : 350, () => sfx.win());
    // Someone always wins a versus round; only a draw gets the sad music.
    const won = !!winner || !!message;
    this.time.delayedCall(message ? 1500 : 1150, () => playMusic(won ? 'victory' : 'defeat'));
    let msg = winner ? T().wins(winner.index + 1) : T().draw;
    let color = winner ? toHex(winner.color) : '#ffffff';
    if (message) {
      msg = message;
      if (messageColor !== undefined) color = toHex(messageColor);
    }
    else if (winner && this.mode === 'team') {
      msg = T().teamWins(T().teamNames[winner.team]);
      color = toHex(this.sideColor(winner.team));
    }
    this.showEndBanner(msg, color, () => this.openResults(msg, color));
  }

  /** A big banner across the arena; `then` runs when it goes away. */
  private showEndBanner(msg: string, color: string, then: () => void) {
    const band = this.add.rectangle(WIDTH / 2, SCREEN_MID_Y, WIDTH, 150, 0x000000, 0.6).setDepth(20);
    const banner = txt(this, WIDTH / 2, SCREEN_MID_Y, msg, 68, color, { title: true, bold: true, origin: 0.5, stroke: '#000000', strokeThickness: 7, depth: 21 });
    banner.setScale(1.4).setAlpha(0);
    this.tweens.add({ targets: banner, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
    this.time.delayedCall(1700, () => {
      band.destroy();
      banner.destroy();
      then();
    });
  }
}
