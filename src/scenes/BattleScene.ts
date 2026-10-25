import * as Phaser from 'phaser';
import { playMusic, type Track } from '../music';
import { SOUL_CAST_TIME, MAIN_TOWER, MAIN_TOWER_HEAL, SMALL_TOWER, RESPAWN_TOWER_COST, TOWER_RESPAWN_HP, TOWER_RESPAWN_SOUL_KEEP, SOUL_REAPER, SOUL_FIRE, SOUL_TREE, SOUL_MISS_PARALYZE, SOUL_LEVELS, SOUL_PER_LEVEL, SOUL_FROM_HURT, SOUL_THUNDER, TEAM_RESPAWN, TOWER_AURA, TOWER_FIRE_INTERVAL, TOWER_HP, TOWER_RANGE, MAP_SCALE, MAX_PLAYERS, BIG_CHEST_HP, BIG_CHEST_ITEMS, CHEST_HP, maxRandomChests, randomChestInterval, startRandomChests, COUNTDOWN, QUEST, ALTAR, EMPTY_CHEST_CHANCE, HEIGHT, HUD_HEIGHT, MAX_HP, MAX_PE, PLAYER_COLORS, PRINCESS_WALL_HP, RES, RESPAWN_DELAY, TEAM_COLORS, WIDTH, type GameMode } from '../config';
import { createController, type WorldView } from '../controls';
import { Fighter, type Arena } from '../Fighter';
import { POCKET_SIZE, rollItem, type Item, type ItemEffect } from '../items';
import { skillById, type SkillEffect } from '../skills';
import { roleById, type Role } from '../roles';
import { randomCpuLoadout } from '../cpuLoadout';
import { WEAPONS, drawShape, rayAngles, shapeHits, shapeHitsRect } from '../weapons';
import { T } from '../i18n';
import { sfx } from '../sfx';
import { ARENA as SCREEN_ARENA, ARENA_MID_Y as SCREEN_MID_Y, MAPS, MAP_RES, addArenaTexture, chestsFor, getMap, obstaclesFor, sideOf, spawnPoint, towerSpots, type GameMap, type MapId, type Obstacle, type TerrainKind } from '../maps';
import { drawHeldWeapon, drawItemIcon, drawLog, kunai, ninjaTexture, type Pose } from '../art';
import { Fx, REAPER_SWING } from '../fx';
import type { FighterState } from '../Fighter';
import type { SlotConfig } from '../settings';
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
  carry?: {
    /** Per party slot: pocket items and soul. */
    players: Record<number, { pocket: Item[]; soul: number }>;
    /** Running totals for the results screen. */
    stats: { dealt: number; kos: number; wall: number }[];
  };
}

/** The boss: crimson, with a fixed loadout. */
const BOSS_COLOR = 0xb3202e;
const BOSS_GEAR = { weapon: Math.max(0, WEAPONS.findIndex((w) => w.id === 'hammer')), skills: ['fury', 'fireball', 'golden-bell'], role: 'samurai' as const };

function bossRole(partySize: number): Role {
  const b = QUEST.boss;
  return {
    ...roleById('samurai'), name: 'Boss', zh: '頭目',
    maxHp: b.hpBase + b.hpPerPlayer * partySize, speed: b.speed, poise: 1, knockbackTaken: b.knockbackTaken, healReceived: 1,
  };
}

/** Quest slots: the party (P1–P4, all on team 0) plus the stage's enemies (P5–P8, team 1). */
function questSlots(lobby: SlotConfig[], stage: number): SlotConfig[] {
  const party = lobby.slice(0, QUEST.partySlots).map((sl) => ({ ...sl, team: 0 }));
  const n = party.filter((sl) => sl.control !== 'off').length;
  // Stage 3 is the boss plus up to 3 grunts; otherwise one more enemy than the party (max 4).
  const enemies = stage === 2 ? 1 + Math.min(3, n) : Math.min(MAX_PLAYERS - QUEST.partySlots, n + 1);
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
  /** Crack lines, revealed one by one as the wall takes damage. */
  cracks: { x: number; y: number }[][];
}




/** A summon strike's hit chance for the soul level spent (1–4). */
const soulHitChance = (byLevel: number[], level: number) => byLevel[Math.min(byLevel.length, Math.max(1, level)) - 1];

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
  private stats: { dealt: number; kos: number; wall: number }[] = [];
  private g!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private nameTags: Phaser.GameObjects.Text[] = [];
  private keyLabels: Phaser.GameObjects.Text[][] = [];
  private over = false;
  /** Seconds left in the pre-round countdown. */
  private countdown = 0;
  private overT = 0;

  constructor() {
    super('Battle');
  }

  init(data: { slots: SlotConfig[]; mode: GameMode; mapId?: MapId | 'random'; quest?: QuestState }) {
    this.lobbySlots = data.slots;
    this.mode = data.mode ?? 'ffa';
    this.quest = this.mode === 'quest' ? data.quest ?? { stage: 0 } : null;
    // The underworld has its own music; the last stage gets the boss theme.
    this.bgm = this.quest ? (this.quest.stage === 2 ? 'boss' : 'hell') : 'battle';
    this.slots = this.quest ? questSlots(data.slots, this.quest.stage) : data.slots;
    // 'random' picks a new map each round (and rematches keep it random). Quest stages have their own maps.
    this.mapChoice = this.quest ? QUEST.maps[this.quest.stage] : data.mapId ?? 'courtyard';
    this.wave = 1;
    this.waveT = -1;
    this.stormMarks = [];
    this.ventMarks = [];
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
    this.stats = PLAYER_COLORS.map((_, i) => ({ ...(this.quest?.carry?.stats[i] ?? { dealt: 0, kos: 0, wall: 0 }) }));
    this.nameTags = [];
    this.keyLabels = [];
    this.over = false;
    this.overT = 0;
    this.countdown = COUNTDOWN;
  }

  create() {
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
    const obstacles = obstaclesFor(this.map, this.mode, flip).map(toWorldRect);
    const walls = obstacles.map((o) => {
      if (o.kind === 'cage') this.walls.push(this.makeWall(o));
      const rect = new Phaser.Geom.Rectangle(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
      this.obstacleRects.push(rect);
      // Crystals bounce shots off instead of stopping them.
      if (o.kind === 'crystal') this.bouncers.push(rect);
      else if (!o.low) this.shotBlockers.push(rect);
      return this.physics.add.staticBody(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
    });
    this.startAmbience();
    this.stormT = this.map.lightning?.interval ?? 0;
    this.ventT = this.map.vents?.interval ?? 0;
    this.fightStart = this.time.now / 1000 + COUNTDOWN;
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
    this.slots.forEach((slot, i) => {
      const controller = createController(this, slot.control, slot.binds);
      if (!controller) return;
      // Quest stage 3: the first enemy is the boss, waiting in front of his throne.
      const isBoss = this.quest?.stage === 2 && i === QUEST.partySlots;
      const sp = isBoss ? this.freeSpot(toWorld({ x: WIDTH - 140, y: SCREEN_MID_Y }), [], QUEST.boss.radius + 4) : startAt[i];
      this.spawns[i] = sp;
      const r = isBoss ? QUEST.boss.radius : 18;
      const body = this.physics.add.body(sp.x - r, sp.y - r, r * 2, r * 2);
      body.setCircle(r);
      body.setCollideWorldBounds(true);
      // CPUs roll a fresh, sensible loadout every round (the lobby settings aren't touched).
      const gear = isBoss ? BOSS_GEAR : slot.control === 'cpu' ? randomCpuLoadout(this.mode) : slot;
      const skills = gear.skills.map(skillById);
      const role = isBoss ? bossRole(partySize) : roleById(gear.role);
      const color = isBoss ? BOSS_COLOR : PLAYER_COLORS[i];
      const f = new Fighter(i, color, WEAPONS[gear.weapon], skills, role, controller, body, this);
      if (teams) f.team = slot.team;
      if (isBoss) {
        f.boss = true;
        f.radius = r;
        f.damageScale = QUEST.boss.damage;
      }
      // Quest: items and soul carry over from the last stage.
      const carried = this.quest?.carry?.players[i];
      if (carried) {
        f.pocket.push(...carried.pocket);
        f.soul = carried.soul;
      }
      this.sprites[i] = this.add.image(sp.x, sp.y, ninjaTexture(this, color)).setScale(r / 18 / RES);
      this.lSprites.add(this.sprites[i]);
      this.prevStates[i] = 'idle';
      f.facing = Math.atan2(WORLD_CENTER.y - sp.y, WORLD_CENTER.x - sp.x);
      this.fighters.push(f);
      this.tagTexts[i] = this.quest && i >= QUEST.partySlots
        ? isBoss ? `${T().bossTag}・${T().bossName}` : T().enemyTag
        : slot.control === 'cpu' ? `P${i + 1} ${T().cpuTag}` : `P${i + 1}`;
      const tagColor = teams ? toHex(TEAM_COLORS[slot.team]) : '#ffffff';
      this.nameTags[i] = this.add
        .text(0, 0, this.tagTexts[i], { fontFamily: FONT, resolution: RES, fontSize: '16px', fontStyle: 'bold', color: tagColor, stroke: '#000000', strokeThickness: 3 })
        .setOrigin(0.5, 1);
      this.lTop.add(this.nameTags[i]);
    });

    const bodies = this.fighters.map((f) => f.body);
    this.physics.add.collider(bodies, walls);
    this.physics.add.collider(bodies, bodies);
    // Each team's wall gets HP in proportion to its team size, so 1-vs-2 stays fair.
    for (const w of this.walls) {
      const members = this.fighters.filter((f) => f.team === w.team).length;
      w.maxHp = w.hp = PRINCESS_WALL_HP * Math.max(1, members) / 2;
    }
    // The round's chests are all there from the start; they drop in one by one during the countdown.
    // Stagger the drop-ins so they all land within the 3-2-1 countdown.
    if (this.quest) {
      if (this.quest.stage === 1) this.placeQuestTowers(partySize);
    } else if (teams) this.placeTowers(flip);
    this.setupMapFeatures();
    const spots = chestsFor(this.map, this.mode)
      .map((p) => ({ ...p, ...toWorld(p) }))
      .filter((p) => !this.towers.some((tw) => Math.abs(p.x - tw.x) < 60 && Math.abs(p.y - tw.y) < 55));
    spots.forEach((p, n) => this.addChest(p.x, p.y, -0.3 - (n * 2.4) / spots.length, !!p.big, p.empty ?? EMPTY_CHEST_CHANCE));
    // More fighters, more chests: a few random extras from the start, and more often during the fight.
    const n = this.fighters.length;
    for (let k = 0; k < startRandomChests(n); k++) this.dropRandomChest(-0.5 - k * 0.3);
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
      towers: this.towers,
      siege: this.mode === 'siege' || this.quest?.stage === 1,
      safe: this.map.barrier ? () => this.barrierCircle() : undefined,
      herbs: this.map.herbs ? () => this.herbs.filter((h) => h.grown) : undefined,
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
    if (this.paused) return;

    // Frozen during the pre-round countdown and on the end-of-round screen.
    if (this.countdown > 0 || this.over) {
      this.countdown -= dt;
      for (const f of this.fighters) f.body.setVelocity(0, 0);
    } else {
      for (const f of this.fighters) f.update(dt, f.controller.read(f, this.world, dt));
    }
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
      this.updatePortals();
      this.updateRollers(dt);
      this.updateSpikes(dt);
      this.updatePads();
      this.updateAltar(dt);
      this.updateKegs(dt);
      this.updateBell(dt);
      this.updateBarrier(dt);
      this.updateHerbs(dt);
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
    // Save the Princess ends when a wall breaks; Siege when a team has no towers left.
    if (!this.over && this.mode === 'siege') {
      for (const team of [0, 1]) {
        if (this.towers.some((tw) => tw.team === team && tw.alive)) continue;
        const winner = this.fighters.find((f) => f.team === 1 - team);
        this.endRound(winner, T().siegeWin(T().teamNames[1 - team]), TEAM_COLORS[1 - team]);
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
      this.dealDamage(f, t, w.damage * f.damageMult, dx / d, dy / d, w.knockback * f.damageMult, w.hitstun);
    }

    for (const k of this.kegs) {
      if (!k.alive || f.swingHits.has(k) || !shapeHitsRect(w.shape, f.x, f.y, f.facing, k.x, k.y, k.size, k.size)) continue;
      f.swingHits.add(k);
      this.explodeKeg(k);
    }

    for (const c of [...this.chests]) {
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

    // You can only break your own team's princess out.
    const wall = this.walls.find((w) => w.team === f.team);
    if (wall && wall.hp > 0 && !this.over && !f.swingHits.has(wall)) {
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
    const before = to.hp;
    to.takeHit(dmg, dx, dy, knockback, hitstun);
    this.fx.hitSpark(to.x - dx * to.radius * 0.6, to.y - dy * to.radius * 0.6, from?.color ?? 0xffffff);
    if (!from) return; // tower arrows don't count towards anyone's stats
    // Hurting enemies fills your soul (lightning itself doesn't, so it can't chain); being hurt fills a little too.
    if (soulGain) {
      from.addSoul(before - to.hp);
      to.addSoul((before - to.hp) * SOUL_FROM_HURT);
    }
    this.stats[from.index].dealt += before - to.hp;
    if (before > 0 && !to.alive) this.stats[from.index].kos++;
  }

  // ---------- pause & results ----------

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
    const princess = this.mode === 'princess' || this.mode === 'siege' || this.mode === 'quest';
    // In Quest only the party is listed.
    const listed = this.quest ? this.fighters.filter((f) => f.team === 0) : this.fighters;
    this.openModal({
      w: 780,
      // Grows with the number of fighters (up to 6 rows).
      h: 290 + listed.length * 42,
      title: T().results,
      depth: 400,
      closable: false,
      build: (m) => {
        m.content.add(txt(this, WIDTH / 2, m.y + 92, msg, 40, color, { title: true, bold: true, origin: 0.5, stroke: '#000000', strokeThickness: 5 }));
        const cols = [m.x + 70, m.x + 330, m.x + 470, m.x + 600];
        const headY = m.y + 150;
        const heads = [T().weapon, T().dealt, T().kos, ...(princess ? [this.mode === 'princess' ? T().wallDmg : T().towerDmg] : [])];
        heads.forEach((h, n) => m.content.add(txt(this, cols[n] + (n === 0 ? 0 : 40), headY, h, 14, C.dim, { origin: [n === 0 ? 0 : 0.5, 0.5] })));
        const g = this.add.graphics();
        g.lineStyle(1, C.border, 1).lineBetween(m.x + 50, headY + 16, m.x + m.w - 50, headY + 16);
        m.content.add(g);
        // Best players first.
        const rows = [...listed].sort((a, b) => this.stats[b.index].dealt + this.stats[b.index].wall - (this.stats[a.index].dealt + this.stats[a.index].wall));
        rows.forEach((f, r) => {
          const y = headY + 40 + r * 42;
          const st = this.stats[f.index];
          const rg = this.add.graphics();
          rg.fillStyle(r % 2 ? 0x1a1f2a : 0x161a23, 1).fillRoundedRect(m.x + 50, y - 18, m.w - 100, 36, 6);
          rg.fillStyle(f.color, 1).fillCircle(cols[0] - 2, y, 9);
          if (this.mode !== 'ffa') rg.lineStyle(2, TEAM_COLORS[f.team], 1).strokeCircle(cols[0] - 2, y, 13);
          m.content.add(rg);
          m.content.add(txt(this, cols[0] + 22, y, `P${f.index + 1}  ${T().weaponName(f.weapon)}`, 18, C.text, { bold: true, origin: [0, 0.5] }));
          const vals = [Math.round(st.dealt), st.kos, ...(princess ? [Math.round(st.wall)] : [])];
          vals.forEach((v, n) => m.content.add(txt(this, cols[n + 1] + 40, y, String(v), 20, C.text, { bold: true, origin: 0.5 })));
        });
        const by = m.y + m.h - 46;
        // A finished game goes back to the fighter setup (no instant rematch); Quest keeps its own retry.
        const buttons: { id: string; label: string; onPress: () => void }[] = [
          ...(this.quest ? [{ id: 'again', label: T().questRestart, onPress: () => this.scene.restart({ slots: this.lobbySlots, mode: this.mode, mapId: this.mapChoice }) }] : []),
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
      const wall =
        this.shotBlockers.some((r) => Phaser.Geom.Rectangle.Contains(r, p.x, p.y)) ||
        this.chests.some((c) => Math.abs(p.x - c.x) < c.w / 2 && Math.abs(p.y - c.y) < c.h / 2);
      const tower = p.ignoreObstacles ? undefined : this.towers.find((tw) => tw.alive && Phaser.Geom.Rectangle.Contains(tw.rect, p.x, p.y));
      if (tower) {
        // Enemy shots damage the tower; friendly ones just stop.
        if (tower.team !== p.team) this.damageTower(tower, e.damage, p.owner);
        p.dead = true;
        continue;
      }
      const keg = p.ignoreObstacles ? undefined : this.kegs.find((k) => k.alive && Phaser.Geom.Rectangle.Contains(k.rect, p.x, p.y));
      if (keg) {
        this.explodeKeg(keg);
        p.dead = true;
        continue;
      }
      if (out || (wall && !p.ignoreObstacles) || p.traveled > e.range) { p.dead = true; continue; }
      for (const t of this.fighters) {
        if (t.team === p.team || !t.alive || t.untouchable) continue;
        if (Math.hypot(t.x - p.x, t.y - p.y) > t.radius + p.radius) continue;
        const s = Math.hypot(p.vx, p.vy);
        this.dealDamage(p.owner, t, e.damage, p.vx / s, p.vy / s, e.knockback, e.hitstun);
        p.dead = true;
        break;
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) if (this.projectiles[i].dead) this.projectiles.splice(i, 1);
  }

  /** Big 3, 2, 1, FIGHT! in the middle of the arena. */
  private startCountdown() {
    const labels = [...Array.from({ length: COUNTDOWN }, (_, i) => String(COUNTDOWN - i)), T().fight];
    labels.forEach((label, i) => {
      this.time.delayedCall(i * 1000, () => {
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

  thunderStrike(f: Fighter, count: number) {
    // The nearest `count` enemies, struck one after another from closest to farthest.
    const targets = this.summonTargets(f, count);
    const tally = this.summonTally(f, '⚡', 0xc9d6ff, targets.length);
    targets.forEach((t, k) => {
      this.time.delayedCall(k * SOUL_THUNDER.stagger * 1000, () => {
        if (!t.alive || t.untouchable || this.over) return tally(null);
        sfx.skyThunder();
        this.fx.skyBolt(t.x, t.y);
        this.screenFlash(0xffffff, 0.35);
        // Every bolt paralyses; one that hits also hurts and paralyses longer.
        if (Math.random() >= soulHitChance(SOUL_THUNDER.hitChance, count)) {
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

  holyFireStrike(f: Fighter, count: number) {
    const targets = this.summonTargets(f, count);
    const tally = this.summonTally(f, '🔥', 0xffd27a, targets.length);
    targets.forEach((t, k) => {
      this.time.delayedCall(k * SOUL_FIRE.stagger * 1000, () => {
        if (!t.alive || t.untouchable || this.over) return tally(null);
        sfx.holyFire();
        this.fx.holyFlame(t.x, t.y);
        this.screenFlash(0xffc04a, 0.15);
        if (Math.random() >= soulHitChance(SOUL_FIRE.hitChance, count)) {
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

  treeStrike(f: Fighter, count: number) {
    const targets = this.summonTargets(f, count * SOUL_TREE.perLevel);
    const tally = this.summonTally(f, '🌳', 0x9fe89a, targets.length);
    targets.forEach((t, k) => {
      this.time.delayedCall(k * SOUL_TREE.stagger * 1000, () => {
        if (!t.alive || t.untouchable || this.over) return tally(null);
        sfx.sacredTree();
        this.fx.treeRoots(t.x, t.y);
        if (Math.random() >= SOUL_TREE.hitChance) {
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
    this.screenFlash(0x6adf7a, 0.15);
  }

  reaperStrike(f: Fighter, count: number) {
    const targets = this.summonTargets(f, count);
    const tally = this.summonTally(f, '☠', 0xc9a6ff, targets.length);
    targets.forEach((t, k) => {
      this.time.delayedCall(k * SOUL_REAPER.stagger * 1000, () => {
        if (!t.alive || t.untouchable || this.over) return tally(null);
        // The reaper rises behind them; whether he catches them is decided now and shown in the effect.
        const hit = Math.random() < soulHitChance(SOUL_REAPER.hitChance, count);
        sfx.reaper();
        this.fx.reaperCatch(() => ({ x: t.x, y: t.y }), hit);
        this.screenFlash(0x5a1a8a, 0.3);
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
    // Caught. (Substitution can still cheat it.)
    this.summonResult(t, true, 0xff6a8a);
    this.screenFlash(0xff2a4a, 0.3);
    this.dealDamage(f, t, SOUL_REAPER.damage, 0, 0, 0, 0, false);
    if (t.alive) {
      t.paralyze(SOUL_REAPER.paralyze);
      return true;
    }
    this.popText(t.x, t.y - 36, T().reaperKill, '#ff4a6a');
    this.screenFlash(0xff2a4a, 0.4);
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
      if (!tw.alive) continue;
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
    tw.collider.destroy();
    tw.body.destroy();
    this.obstacleRects.splice(this.obstacleRects.indexOf(tw.rect), 1);
    sfx.wallBreak();
    this.fx.smoke(tw.x, tw.y, 24, 1.4);
    this.fx.hammerSmash(tw.x, tw.y, 50);
    this.showBanner((tw.main ? T().mainTowerDown : T().towerDown)(T().teamNames[tw.team]), TEAM_COLORS[tw.team]);
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
    }
    this.ventMarks = this.ventMarks.filter((m) => m.t < V.warn);
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
    const color = held ? (this.mode === 'ffa' ? PLAYER_COLORS[this.altarTeam] ?? 0xb57bff : TEAM_COLORS[this.altarTeam]) : 0xb57bff;
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
  }

  private restartRound() {
    this.scene.restart({ slots: this.lobbySlots, mode: this.mode, mapId: this.mapChoice, quest: this.quest ?? undefined });
  }

  private createQuestHud() {
    const q = this.quest!;
    this.showBanner(T().questStageTitle(q.stage + 1, T().questGoals[q.stage]), 0xf2c94c);
    this.questText = txt(this, SCREEN_ARENA.x + 12, HEIGHT - 14, '', 15, '#ffe9b0', { bold: true, origin: [0, 1], stroke: '#000000', strokeThickness: 4, depth: 15 });
    if (this.fighters.some((f) => f.boss)) {
      this.bossBar = this.add.graphics().setDepth(15);
      this.bossName = txt(this, WIDTH / 2, HEIGHT - 40, `${T().bossTag}・${T().bossName}`, 16, '#ff8a8a', { title: true, bold: true, origin: [0.5, 1], stroke: '#000000', strokeThickness: 4, depth: 16 });
    }
  }

  /** Goal line in the corner, and the boss's big HP bar. */
  private renderQuestHud() {
    const q = this.quest!;
    const foes = this.fighters.filter((f) => f.team === 1);
    const left = foes.filter((f) => f.alive).length;
    const status = q.stage === 0
      ? `${T().questStage(1)}  ${T().questWaveOf(this.wave, QUEST.waves)} · ${T().questLeft(left)}`
      : q.stage === 1
        ? `${T().questStage(2)}  ${T().questTowersLeft(this.towers.filter((tw) => tw.team === 1 && tw.alive).length)}`
        : `${T().questStage(3)}  ${T().questBossHint}`;
    if (this.questText && this.questText.text !== status) this.questText.setText(status);
    const boss = foes.find((f) => f.boss);
    if (boss && this.bossBar) {
      const w = 460;
      const x = WIDTH / 2 - w / 2;
      const y = HEIGHT - 36;
      const g = this.bossBar;
      g.clear();
      g.fillStyle(0x000000, 0.6).fillRoundedRect(x - 4, y - 4, w + 8, 18, 5);
      g.fillStyle(0x3a0c10, 1).fillRect(x, y, w, 10);
      g.fillStyle(0xe5484d, 1).fillRect(x, y, w * Math.max(0, boss.hp) / boss.maxHp, 10);
      g.lineStyle(1.5, 0xd9ae4a, 1).strokeRect(x, y, w, 10);
    }
  }

  private updateQuest(dt: number) {
    const q = this.quest!;
    const party = this.fighters.filter((f) => f.team === 0);
    const foes = this.fighters.filter((f) => f.team === 1);
    if (!party.some((f) => f.alive)) {
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
          this.showBanner(T().questWave(this.wave + 1), TEAM_COLORS[1]);
        } else this.questClear();
      }
    } else if (q.stage === 1) {
      if (!this.towers.some((tw) => tw.team === 1 && tw.alive)) this.questClear();
    } else if (!foes.some((f) => f.boss && f.alive)) this.questClear();
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
    for (const f of this.fighters) if (f.team === 0) players[f.index] = { pocket: [...f.pocket], soul: f.soul };
    return { players, stats: this.stats.map((st) => ({ ...st })) };
  }

  private questClear() {
    const q = this.quest!;
    if (q.stage >= QUEST.maps.length - 1) {
      this.endRound(undefined, T().questComplete, 0xf2c94c);
      return;
    }
    this.over = true;
    this.time.delayedCall(500, () => sfx.win());
    this.time.delayedCall(1300, () => playMusic('victory'));
    const msg = T().questClear(q.stage + 1);
    this.showEndBanner(msg, '#f2c94c', () => {
      this.openModal({
        w: 620, h: 300, title: msg, titleColor: C.goldHex, depth: 400, closable: false,
        build: (m) => {
          m.content.add(txt(this, WIDTH / 2, m.y + 110, T().questStageTitle(q.stage + 2, T().questGoals[q.stage + 1]), 22, C.text, { title: true, bold: true, origin: 0.5 }));
          m.content.add(txt(this, WIDTH / 2, m.y + 150, T().questCarry, 14, C.dim, { origin: 0.5, wrap: m.w - 80, align: 'center' }));
          const by = m.y + m.h - 50;
          addButton(this, m.content, m.nav, {
            id: 'next', x: WIDTH / 2 - 150, y: by, w: 240, h: 50, label: `${T().questNext}  ▶`, primary: true,
            onPress: () => this.scene.restart({ slots: this.lobbySlots, mode: 'quest', quest: { stage: q.stage + 1, carry: this.questCarry() } }),
          });
          addButton(this, m.content, m.nav, { id: 'lobby', x: WIDTH / 2 + 150, y: by, w: 200, h: 50, label: T().toLobby, onPress: () => this.scene.start('Lobby') });
        },
      });
    });
  }

  private questFail() {
    const q = this.quest!;
    this.over = true;
    this.time.delayedCall(300, () => sfx.deathGong());
    this.time.delayedCall(1500, () => playMusic('defeat'));
    this.showEndBanner(T().questFailed, '#ff5a5a', () => {
      this.openModal({
        w: 620, h: 280, title: T().questFailed, titleColor: '#ff7a7a', depth: 400, closable: false,
        build: (m) => {
          m.content.add(txt(this, WIDTH / 2, m.y + 110, T().questFailedAt(q.stage + 1), 22, C.text, { title: true, bold: true, origin: 0.5 }));
          const by = m.y + m.h - 50;
          addButton(this, m.content, m.nav, { id: 'retry', x: WIDTH / 2 - 200, y: by, w: 180, h: 50, label: T().questRetry, primary: true, onPress: () => this.restartRound() });
          addButton(this, m.content, m.nav, {
            id: 'over', x: WIDTH / 2, y: by, w: 180, h: 50, label: T().questRestart,
            onPress: () => this.scene.restart({ slots: this.lobbySlots, mode: 'quest' }),
          });
          addButton(this, m.content, m.nav, { id: 'lobby', x: WIDTH / 2 + 200, y: by, w: 180, h: 50, label: T().toLobby, onPress: () => this.scene.start('Lobby') });
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
    // Dim the battlefield while the call builds.
    const dim = this.add.rectangle(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT, s.kind === 'soulReaper' ? 0x14001e : s.kind === 'soulFire' ? 0x1e0e00 : s.kind === 'soulTree' ? 0x021408 : 0x000814, 0).setOrigin(0, 0).setDepth(13);
    this.tweens.add({ targets: dim, fillAlpha: 0.35, duration: 300, yoyo: true, hold: 500, onComplete: () => dim.destroy() });
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
    const color = TEAM_COLORS[tw.team];
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

  // ---------- treasure chests ----------

  private addChest(x: number, y: number, age: number, big: boolean, emptyChance: number, random = false) {
    const w = big ? 52 : 34;
    const h = big ? 40 : 28;
    const maxHp = big ? BIG_CHEST_HP : CHEST_HP;
    const body = this.physics.add.staticBody(x - w / 2, y - h / 2, w, h);
    const collider = this.physics.add.collider(this.fighters.map((f) => f.body), body);
    this.chests.push({ x, y, w, h, hp: maxHp, maxHp, shakeT: 0, age, body, collider, big, empty: !big && Math.random() < emptyChance, random });
  }

  /** Every so often a chest drops into a random open spot (the more fighters, the more often). */
  private updateRandomChests(dt: number) {
    const n = this.fighters.length;
    this.chestTimer -= dt;
    if (this.chestTimer > 0) return;
    this.chestTimer = randomChestInterval(n);
    if (this.chests.filter((c) => c.random).length >= maxRandomChests(n)) return;
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
      if (blocked || crowded || nearChest) continue;
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
    return { o, team: o.team ?? 0, hp: PRINCESS_WALL_HP, maxHp: PRINCESS_WALL_HP, lastHitter: null, shakeT: 0, cracks };
  }

  private showPrincessIntro() {
    const banner = this.add
      .text(WIDTH / 2, SCREEN_ARENA.y + 30, T().princessGoal, { fontFamily: FONT, resolution: RES, fontSize: '26px', fontStyle: 'bold', color: '#ffd6ea', stroke: '#000000', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(15);
    this.tweens.add({ targets: banner, alpha: 0, delay: 2600, duration: 800, onComplete: () => banner.destroy() });
    this.helpTexts = this.walls.map((w) => {
      const t = this.add
        .text(w.o.x, w.o.y - w.o.h / 2 - 34, T().help, {
          fontFamily: FONT, resolution: RES, fontSize: '14px', fontStyle: 'bold', color: '#ffffff', backgroundColor: toHex(TEAM_COLORS[w.team]), padding: { x: 6, y: 2 },
        })
        .setOrigin(0.5);
      this.lTop.add(t);
      this.tweens.add({ targets: t, y: t.y - 5, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
      return t;
    });
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
        f.takeChip(c.dps * 0.5);
        c.owner.addSoul(before - f.hp);
        this.stats[c.owner.index].dealt += before - f.hp;
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

  onRevived(target: Fighter) {
    this.respawnTimers.delete(target);
    this.deathTime.delete(target);
  }

  /**
   * While a team still has a tower, its fallen players come back one at a time at its
   * main tower, and only the main tower: the small towers can't. The wait starts short and grows as the battle goes on.
   */
  private updateTeamRespawns(dt: number) {
    this.elapsed += dt;
    const wait = Math.min(TEAM_RESPAWN.max, TEAM_RESPAWN.base + this.elapsed * TEAM_RESPAWN.growthPerSec);
    for (const f of this.fighters) if (!f.alive && !this.deathTime.has(f)) this.deathTime.set(f, this.elapsed);
    for (const team of [0, 1]) {
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
      if (this.teamRespawnT[team] < 0) this.teamRespawnT[team] = wait;
      this.teamRespawnT[team] -= dt;
      // Countdown on the next one in line; the rest are waiting their turn.
      dead.forEach((f, k) => this.respawnTimers.set(f, k === 0 ? Math.max(0, this.teamRespawnT[team]) : Infinity));
      if (this.teamRespawnT[team] > 0) continue;
      const f = dead[0];
      const taken = this.fighters.filter((o) => o.alive).map((o) => ({ x: o.x, y: o.y }));
      const spot = this.freeSpot({ x: home.x + (home.x < WORLD_CENTER.x ? 1 : -1) * (home.w / 2 + 30), y: home.y }, taken);
      this.respawnTimers.delete(f);
      this.deathTime.delete(f);
      f.revive(spot.x, spot.y, f.maxHp * TOWER_RESPAWN_HP);
      // Coming back through a tower costs you everything you were carrying, and half your soul.
      f.pocket.length = 0;
      f.selectedItem = 0;
      f.soul *= TOWER_RESPAWN_SOUL_KEEP;
      sfx.respawn();
      // Bringing someone back costs the tower some of its HP.
      const cost = Math.min(home.hp - 1, home.maxHp * RESPAWN_TOWER_COST);
      if (cost > 0) {
        home.hp -= cost;
        home.shakeT = 0.15;
        this.popText(home.x, home.y - home.h / 2 - 12, `-${Math.round(cost)}`, '#9fd8ff');
      }
      this.fx.respawnBeam(home.x, home.y, spot.x, spot.y, TEAM_COLORS[team]);
      this.teamRespawnT[team] = dead.length > 1 ? wait : -1;
    }
  }


  private breakWall(wall: PrincessWall) {
    this.world.objectives = [];
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
    this.endRound(wall.lastHitter ?? undefined, T().rescued(T().teamNames[wall.team]), TEAM_COLORS[wall.team]);
  }

  private renderWallAndPrincess(g: Phaser.GameObjects.Graphics, wall: PrincessWall) {
    const o = wall.o;
    const broken = wall.hp <= 0;
    const sx = wall.shakeT > 0 ? Phaser.Math.Between(-2, 2) : 0;
    const sy = wall.shakeT > 0 ? Phaser.Math.Between(-2, 2) : 0;
    const l = o.x - o.w / 2 + sx;
    const t = o.y - o.h / 2 + sy;
    const th = 26; // thick brick walls

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
      g.lineStyle(3, TEAM_COLORS[wall.team], 1).strokeRect(l - 2, t - 2, o.w + 4, o.h + 4);

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
      g.fillStyle(TEAM_COLORS[wall.team], 1).fillRect(bx, by, bw * (wall.hp / wall.maxHp), 6);
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
      case 'talisman':
        if (s.kind === 'cross') this.fx.lightningCross(f.x, f.y, f.facing, s.arm, s.width);
        sfx.thunder();
        break;
      case 'staff':
        if (s.kind === 'twin') this.fx.staffSweep(() => ({ x: f.x, y: f.y }), f.facing, s.length, s.width);
        break;
      case 'kunai':
        if (s.kind === 'rays') this.fx.kunaiVolley(f.x, f.y, rayAngles(s, f.facing), s.offset, s.offset + s.length, f.color);
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
    this.renderRollers(now);
    this.renderTide(now);
    this.renderDoors(now);
    this.renderKegs(now);
    this.renderBell(now);
    this.renderHerbs(now);
    this.renderBarrier(now);
    this.renderPads(now);
    this.renderAltar(now);
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
      if (this.mode !== 'ffa') g.lineStyle(3, TEAM_COLORS[f.team], 0.9).strokeCircle(f.x, f.y, f.radius + 5);
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
      else if (f.paralyzed) sprite.setTint(0x9fc0ff).setTintMode(Phaser.TintModes.MULTIPLY);
      else sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      const summon = f.summoning;
      if (summon) {
        const color = this.summonColor(f);
        this.fx.summonCircle(g, this.gGlow, f.x, f.y, f.stateProgress, color, now);
        for (const t of this.summonTargets(f, summon.kind === 'soulTree' ? summon.level * SOUL_TREE.perLevel : summon.level)) this.fx.targetMark(over, t.x, t.y, f.stateProgress, color, now);
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
        // Calling a soul skill: a purple glow, rising.
        const k = 0.5 + 0.5 * Math.sin(now * 20);
        this.gGlow.fillStyle(0xb57bff, 0.25 + k * 0.2).fillCircle(f.x, f.y, f.radius + 10);
        this.gGlow.lineStyle(2, 0xe2c8ff, 0.8).strokeCircle(f.x, f.y, f.radius + 12 + k * 4);
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
        over.fillStyle(0xf2c94c, 0.14).fillCircle(f.x, f.y, f.radius + 11);
        over.lineStyle(2, 0xf2c94c, 0.75 + 0.25 * Math.sin(now * 7)).strokeCircle(f.x, f.y, f.radius + 11);
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
  private static readonly HUD = { cols: 4, pad: 8, barW: 122, skillX: 140, skill: 22, skillGap: 3, pocketX: 226, pocket: 20, pocketGap: 3 };

  private hudPanel(i: number) {
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
      const color = toHex(PLAYER_COLORS[i]);
      if (!f) {
        this.add.text(x0 + L.pad, y0 + 16, `P${i + 1} — ${T().emptySlot}`, { fontFamily: FONT, resolution: RES, fontSize: '11px', color: '#4a5060' });
        return;
      }
      const who = this.quest && i >= QUEST.partySlots ? (f.boss ? T().bossName : `${T().enemyTag} ${roleGlyph(f)}`) : `P${i + 1} ${roleGlyph(f)}`;
      const name = this.add.text(x0 + L.pad, y0 + 2, `${who}·${T().weaponName(f.weapon)}`, { fontFamily: FONT, resolution: RES, fontSize: '11px', color, fontStyle: 'bold' });
      if (this.mode !== 'ffa' && !this.quest) {
        this.add.text(name.x + name.width + 5, y0 + 3, T().teamNames[f.team], {
          fontFamily: FONT, resolution: RES, fontSize: '9px', fontStyle: 'bold', color: '#ffffff', backgroundColor: toHex(TEAM_COLORS[f.team]), padding: { x: 3, y: 0 },
        });
      }
      this.keyLabels[i] = f.skills.map((s, k) => {
        const cx = x0 + L.skillX + k * (L.skill + L.skillGap) + L.skill / 2;
        this.add.text(cx, y0 + 12 + L.skill / 2, s ? s.zh[0] : '—', { fontFamily: FONT, resolution: RES, fontSize: '12px', color: '#ffffff' }).setOrigin(0.5).setDepth(2);
        // Key label tucked into the box's corner.
        return this.add.text(cx + L.skill / 2 - 1, y0 + 12 + L.skill - 1, f.controller.labels[k + 1], { fontFamily: FONT, resolution: RES, fontSize: '7px', color: '#c9ced8' }).setOrigin(1, 1);
      });
    });
  }

  private renderHud() {
    const L = BattleScene.HUD;
    const h = this.hud;
    h.clear();
    this.hudIcons.clear();
    h.fillStyle(0x0d0f14, 1).fillRect(0, 0, WIDTH, HUD_HEIGHT);
    for (let i = 0; i < this.slots.length; i++) {
      const { x0, y0, pw, ph } = this.hudPanel(i);
      if (i % L.cols > 0) h.lineStyle(1, 0x2a2f3c, 1).lineBetween(x0, y0 + 4, x0, y0 + ph - 4);
      if (y0 > 0 && i % L.cols === 0) h.lineStyle(1, 0x2a2f3c, 1).lineBetween(6, y0, WIDTH - 6, y0);
      const f = this.fighters.find((ff) => ff.index === i);
      if (!f) continue;
      const alpha = f.alive ? 1 : 0.35;
      // Team tint behind the panel in team modes.
      if (this.mode !== 'ffa') h.fillStyle(TEAM_COLORS[f.team], 0.08).fillRect(x0 + 1, y0 + 1, pw - 2, ph - 2);
      // HP and PE (體力) bars.
      h.fillStyle(0x2a1416, 1).fillRect(x0 + L.pad, y0 + 18, L.barW, 9);
      h.fillStyle(0xe5484d, alpha).fillRect(x0 + L.pad, y0 + 18, L.barW * (f.hp / f.maxHp), 9);
      h.fillStyle(0x2a2614, 1).fillRect(x0 + L.pad, y0 + 30, L.barW, 5);
      const peColor = f.peDeniedT > 0 ? 0xffffff : f.resting && f.pe < f.maxPe ? 0xfff0a0 : 0xf2c94c;
      h.fillStyle(peColor, alpha).fillRect(x0 + L.pad, y0 + 30, L.barW * (f.pe / f.maxPe), 5);
      // Skill boxes with cooldown sweep.
      f.skills.forEach((s, k) => {
        const bx = x0 + L.skillX + k * (L.skill + L.skillGap);
        const by = y0 + 12;
        const sz = L.skill;
        if (!s) {
          h.fillStyle(0x14171f, alpha).fillRect(bx, by, sz, sz);
          h.lineStyle(1, 0x2a2f3c, alpha).strokeRect(bx, by, sz, sz);
          return;
        }
        const ready = f.cooldowns[k] <= 0;
        const affordable = f.pe >= s.peCost;
        h.fillStyle(ready && affordable ? 0x2f3a52 : 0x1b2030, alpha).fillRect(bx, by, sz, sz);
        if (!ready) {
          const frac = f.cooldowns[k] / s.cooldown;
          h.fillStyle(0x000000, 0.6).fillRect(bx, by + sz * (1 - frac), sz, sz * frac);
        }
        h.lineStyle(1, ready ? f.color : 0x3a4152, alpha).strokeRect(bx, by, sz, sz);
      });
      // Pocket: item slots, the selected one outlined in gold.
      for (let k = 0; k < POCKET_SIZE; k++) {
        const item: Item | undefined = f.pocket[k];
        const px = x0 + L.pocketX + k * (L.pocket + L.pocketGap);
        const py = y0 + 13;
        h.fillStyle(item ? 0x2a2f3c : 0x14171f, 1).fillRoundedRect(px, py, L.pocket, L.pocket, 4);
        const selected = item && k === f.selectedItem;
        h.lineStyle(selected ? 2 : 1, selected ? 0xf2c94c : 0x2a2f3c, 1).strokeRoundedRect(px, py, L.pocket, L.pocket, 4);
        if (item) drawItemIcon(this.hudIcons, item.id, px + L.pocket / 2, py + L.pocket / 2, 16);
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
      color = toHex(TEAM_COLORS[winner.team]);
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
