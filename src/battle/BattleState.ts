import * as Phaser from 'phaser';
import { type Track } from '@/audio/music';
import { QUEST, type GameMode, type GroveIllusion } from '@/config';
import { type WorldView } from '@/input/contracts';
import { Fighter } from '@/gameplay/Fighter';
import { type GameMap, type MapId } from '@/maps';
import { type MatchStats } from '@/battle/results/stats';
import { type SealPoint } from '@/battle/quest/sealRules';
import { type SpiritLantern } from '@/battle/quest/escortRules';
import { Fx } from '@/rendering/effects';
import type { FighterState } from '@/gameplay/Fighter';
import { type SlotConfig } from '@/state/gameSettings';
import { Petals, UIScene } from '@/ui';
import { type Projectile, type Tower, type Chest, type QuestState, type PrincessWall, type QuestTreeCast, type NightCandle, type DragonCast, type DragonBeam, type DragonElement, type DragonBody, type Wyvern, type WyvernRing } from '@/battle/types';
import { ARENA } from '@/battle/coordinates';
import type { SpiritRelay } from '@/battle/types';

/** Shared per-round state. Systems use narrow typed views; BattleScene owns initialization and lifecycle. */
export abstract class BattleState extends UIScene {
  protected bgm: Track = 'battle';
  slots: SlotConfig[] = [];
  /** The lobby's slots, as given (Quest rebuilds `slots` from them each stage). */
  lobbySlots: SlotConfig[] = [];
  mode: GameMode = 'ffa';
  /** Quest progress; null in other modes. */
  quest: QuestState | null = null;
  spiritRelay: SpiritRelay | null = null;
  /** Quest stage 1: which wave is on, and the countdown to the next one (-1 = none coming). */
  wave = 1;
  waveT = -1;
  questText?: Phaser.GameObjects.Text;
  /** Lightning-storm maps: seconds to the next volley, and the marked spots waiting to be struck. */
  stormT = 0;
  stormMarks: { x: number; y: number; t: number }[] = [];
  /** Fire vents: seconds to the next eruption, and the vents about to blow. */
  ventT = 0;
  /** When the fight started (after the countdown), in scene time (s). */
  fightStart = 0;
  ventMarks: { x: number; y: number; t: number }[] = [];
  /** Ground fire: a warning ring, then a patch that burns anyone standing in it. */
  flameT = 0;
  flameMarks: { x: number; y: number; r: number; dps: number; life: number; t: number }[] = [];
  flamePatches: { x: number; y: number; r: number; t: number; life: number; dps: number; tick: number }[] = [];
  /** Portals: a fighter who just came out of one can't use it again until they step off. */
  portalLock = new Map<Fighter, { x: number; y: number }>();
  /** Rolling boulders: time to the next one, the warning, and the boulders on their way. */
  rollT = 0;
  rollWarn: { y: number; dir: number; t: number } | null = null;
  boulders: { x: number; y: number; dir: number; spin: number; hit: Set<Fighter> }[] = [];
  /** Spike traps: per fighter, time until the next tick of damage. */
  spikeTick = new Map<Fighter, number>();
  /** Crystal obstacles that bounce shots instead of stopping them. */
  bouncers: Phaser.Geom.Rectangle[] = [];
  /** Launch pads: a fighter who was just flung can't be flung again until they step off. */
  padLock = new Set<Fighter>();
  /** Soul Altar: which team holds it right now (-1 = nobody / contested). */
  altarTeam = -1;
  /** Sliding doors and whether each is shut. */
  doors: { rect: Phaser.Geom.Rectangle; body: Phaser.Physics.Arcade.StaticBody; group: number; closed: boolean }[] = [];
  /** Explosive kegs; dead ones count down to coming back. */
  kegs: { x: number; y: number; size: number; alive: boolean; t: number; rect: Phaser.Geom.Rectangle; body: Phaser.Physics.Arcade.StaticBody }[] = [];
  /** The great bell: seconds to the next toll. */
  bellT = 0;
  /** Barrier: per fighter, time to the next tick of damage outside it. */
  barrierTick = new Map<Fighter, number>();
  barrierAnnounced = false;
  /** Healing herbs: grown, or regrowing (t = seconds left). */
  herbs: { x: number; y: number; grown: boolean; t: number }[] = [];
  bossName?: Phaser.GameObjects.Text;
  bossBar?: Phaser.GameObjects.Graphics;
  map!: GameMap;
  mapChoice: MapId | 'random' = 'courtyard';
  /** Obstacles that stop projectiles (everything except low terrain like water). */
  shotBlockers: Phaser.Geom.Rectangle[] = [];
  walls: PrincessWall[] = [];
  princessText?: Phaser.GameObjects.Text;
  questTreeT = QUEST.rescue.tree.initialDelay;
  questTreeCast: QuestTreeCast | null = null;
  questTree: Tower | null = null;
  /** Rescue seal, in world x. Closed until both princess walls break. */
  rescueGateX = 0;
  rescueGateOpen = false;
  /** Cursed grove: the three trees, in spot order, after their jobs are shuffled. */
  groveTrees: Tower[] = [];
  groveLabels: Phaser.GameObjects.Text[] = [];
  groveVeil?: Phaser.GameObjects.Graphics;
  groveT = 0;
  groveIllusion: GroveIllusion = 'sand';
  groveCast: QuestTreeCast | null = null;
  groveSummonT = 0;
  groveRespawnT = 0;
  /** Which effect window has already been announced, so the banner plays once. */
  groveAnnounced = '';
  /** Small summon and illusion trees, and the allies sealed inside them. */
  snareTrees: Tower[] = [];
  snareLabels: Phaser.GameObjects.Text[] = [];
  snareVeil?: Phaser.GameObjects.Graphics;
  snareCast: QuestTreeCast | null = null;
  snareSummonT = 0;
  snareIllusion: GroveIllusion = 'sand';
  /** Screen-space darkness for the night alley, with holes cut around lights. */
  nightShade?: Phaser.GameObjects.RenderTexture;
  nightLights?: Phaser.GameObjects.Graphics;
  nightFlames?: Phaser.GameObjects.Graphics;
  nightCandles: NightCandle[] = [];
  /** The three-headed dragon: its walking body, its heads, the aim being taken, when the next comes, and which head went last. */
  dragonBody: DragonBody | null = null;
  dragonHeads: Tower[] = [];
  /** Seconds until the dragon calls back a fallen guard. */
  dragonGuardT = 0;
  /** Where shots just burst (drawn briefly as fading rings). */
  dragonBursts: { x: number; y: number; r: number; element: DragonElement; t: number }[] = [];
  /** Follow-up shots waiting to fire (the ice head's second shard). */
  dragonShots: { t: number; element: DragonElement; head: Tower; target: Fighter }[] = [];
  dragonCast: DragonCast | null = null;
  dragonBeam: DragonBeam | null = null;
  dragonT = 0;
  dragonLast: DragonElement | null = null;
  /** Lightning jumping between teammates (drawn briefly), and the timer for burning embers. */
  dragonChains: { x1: number; y1: number; x2: number; y2: number; t: number }[] = [];
  dragonEmberT = 0;
  /** 日月雙龍: the two wyverns, their frost rings and bursts, the chain's damage tick, and the guard return timer. */
  wyverns: Wyvern[] = [];
  wyvernRings: WyvernRing[] = [];
  wyvernBursts: { x: number; y: number; r: number; color: number; t: number }[] = [];
  wyvernTetherT = 0;
  wyvernGuardT = 0;
  /** Seconds until the Dirge bell starts its warning, and the warning itself. */
  dirgeTollT = QUEST.dirge.tollEvery;
  dirgeWarn: { elapsed: number } | null = null;
  seals: SealPoint[] = [];
  sealRespawnT = QUEST.seals.respawnEvery;
  lantern: SpiritLantern | null = null;
  escortRespawnT = QUEST.escort.respawnEvery;
  wardenReviveT = -1;
  wardenGruntT = QUEST.wardens.gruntRespawn;
  bossRespawnT = QUEST.boss.respawnInterval;
  bossReserves = new Set<Fighter>();
  chests: Chest[] = [];
  towers: Tower[] = [];
  /** Who each main tower is healing this frame (for the beams). */
  towerHeals: { tower: Tower; f: Fighter }[] = [];
  /** Seconds of fighting so far (after the countdown); respawn waits grow with it. */
  elapsed = 0;
  /** Per team: seconds until its next fallen player comes back (-1 = nobody waiting). */
  teamRespawnT = [-1, -1];
  /** When each fallen fighter went down, so they come back in order. */
  deathTime = new Map<Fighter, number>();
  /** Caltrops on the ground. */
  caltrops: { x: number; y: number; r: number; t: number; life: number; team: number; owner: Fighter; dps: number; slow: number; spikes: { x: number; y: number; a: number }[]; tick: number }[] = [];
  /** Seconds until the next random chest drops in. */
  chestTimer = 0;
  /** Render layers: floor (under fighters), over (on top), glow (additive), plus HUD icons. */
  gOver!: Phaser.GameObjects.Graphics;
  /** The battlefield, drawn at 1 / MAP_SCALE below the HUD, in back-to-front layers. */
  lFloor!: Phaser.GameObjects.Container;
  lSprites!: Phaser.GameObjects.Container;
  lOver!: Phaser.GameObjects.Container;
  lTop!: Phaser.GameObjects.Container;
  gGlow!: Phaser.GameObjects.Graphics;
  hudIcons!: Phaser.GameObjects.Graphics;
  fx = new Fx();
  sprites: Phaser.GameObjects.Image[] = [];
  /** Last frame's state per fighter, to spot transitions (strike, death, dash…). */
  prevStates: FighterState[] = [];
  /** Where (and at what angle) each fallen fighter's log lies. */
  logs = new Map<Fighter, { x: number; y: number; a: number }>();
  /** Where each fighter (re)spawns, by slot index. */
  spawns: { x: number; y: number }[] = [];
  respawnTimers = new Map<Fighter, number>();
  tagTexts: string[] = [];
  helpTexts: Phaser.GameObjects.Text[] = [];
  fighters: Fighter[] = [];
  projectiles: Projectile[] = [];
  world!: WorldView;
  obstacleRects: Phaser.Geom.Rectangle[] = [];
  readonly arenaRect = new Phaser.Geom.Rectangle(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  petals!: Petals;
  paused = false;
  /** Per fighter (by slot index): damage dealt to fighters, KOs, damage dealt to their princess's wall. */
  stats: MatchStats[] = [];
  g!: Phaser.GameObjects.Graphics;
  hud!: Phaser.GameObjects.Graphics;
  nameTags: Phaser.GameObjects.Text[] = [];
  hudNames: Phaser.GameObjects.Text[] = [];
  hudSkillGlyphs: Phaser.GameObjects.Text[][] = [];
  keyLabels: Phaser.GameObjects.Text[][] = [];
  over = false;
  winningTeam: number | null = null;
  questBossSeats: number[] = [];
  /** Seconds left in the battlefield preview plus the pre-round countdown. */
  countdown = 0;
  overT = 0;

  // ---------- pause & results ----------

  /** A player's controller dropped out (Joy-Cons fall asleep): freeze the fight and say so until it's back. */
  padHold = false;
  padHoldPaused = false;
  padOverlay: Phaser.GameObjects.Container | null = null;

  /** Throttle for the "can't summon" notices, per fighter. */
  summonNoticeAt = new Map<Fighter, number>();
}
