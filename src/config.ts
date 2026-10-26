// Global tuning values. Weapon balance rules live in weapons.ts and derive from these.

export const WIDTH = 1280;
export const HEIGHT = 720;
export const HUD_HEIGHT = 92;
/**
 * The battlefield is this much larger than the screen area it's shown in (maps are
 * designed in screen coordinates and scaled up; the whole battlefield is drawn at
 * 1 / MAP_SCALE). Fighters, weapon reach and speeds are unchanged, so there's more room.
 */
export const MAP_SCALE = 1.4;

export const BODY_RADIUS = 18;
export const MOVE_SPEED = 200;
/** Terrain: mud slows you; on ice your speed only changes gradually (higher = grippier). */
export const MUD_SPEED = 0.55;
export const ICE_GRIP = 2.2;
/** Hot springs: you wade (slower) but slowly heal while standing in the water. */
/** 隱身術 Vanish: while hidden you also move this much faster. */
export const STEALTH_SPEED = 1.25;
export const SPRING = { speed: 0.75, healPerSec: 3 };
/** Loose sand and shallow surf: a little slower. */
export const SAND_SPEED = 0.8;
export const SHALLOWS_SPEED = 0.7;
/** Festival boost lane: faster. */
export const BOOST_SPEED = 1.45;
/** Soul Altar: what holding it (with no enemy on it) gives per second. */
export const ALTAR = { soulPerSec: 6, pePerSec: 12 };
/** Poison bog: slow, and it saps HP (but can't take you below 1). */
export const POISON = { speed: 0.7, dps: 3 };

export const MAX_HP = 100;
export const MAX_PE = 100;
export const PE_REGEN_PER_SEC = 18;
/** PE regen multipliers: standing still to catch your breath vs moving. */
export const PE_REGEN_STILL = 1.7;
export const PE_REGEN_MOVING = 0.6;
/** Seconds after spending PE before regen resumes. */
export const PE_REGEN_DELAY = 0.5;

// Weapon balance budgets. Hit area uses a common baseline (shuriken +25%, flail +15%).
// Damage / knockback / PE spent per second are equal when swinging nonstop.
// Fast weapons therefore hit softly; slow weapons hit hard.
export const WEAPON_AREA = 9000; // px²
export const DAMAGE_PER_SEC = 16;
export const KNOCKBACK_PER_SEC = 700;
export const PE_COST_PER_SEC = 35;
export const HITSTUN_PER_CYCLE = 0.4;

/** One colour per player slot; the number of slots is the player cap. */
export const PLAYER_COLORS = [0xff5a5a, 0x4fa3ff, 0x5ad46a, 0xffc93c, 0xb57bff, 0x3fd8d0, 0xff8f3a, 0xe6e6e6];
export const MAX_PLAYERS = PLAYER_COLORS.length;
/** At most this many of the slots can be real people (the rest are CPU or empty). */
export const MAX_HUMANS = 4;

export type QuestMode = 'quest';
export type QuestSide = 'heroes' | 'hell';
/** Standard puts every player on the hero side, Hell puts every player on Hell's side, and Free lets each player choose. */
export type QuestRule = 'heroes' | 'hell' | 'free';
export const QUEST_RULES: QuestRule[] = ['heroes', 'hell', 'free'];
export type GameMode = 'ffa' | 'team' | 'princess' | 'siege' | QuestMode;
export const GAME_MODES: GameMode[] = ['ffa', 'team', 'princess', 'siege', 'quest'];
export const isQuestMode = (mode: GameMode): mode is QuestMode => mode === 'quest';

/**
 * 闖關 Quest: up to 4 players (P1–P4, humans or CPU allies) on one side against
 * enemies set by the stage. Each run is six stages; enemy numbers scale with the party,
 * except the grove, which always starts with four enemies.
 */
export type GroveRole = 'respawn' | 'summon' | 'illusion';
export type GroveIllusion = 'sand' | 'heat' | 'ice';

export const QUEST = {
  /** Lobby slots that make up the party. */
  partySlots: 4,
  /** The party fights with this much more max HP than usual. */
  partyHp: 1.2,
  /** Natural PE recovery is 10% faster for the party, including CPU allies; enemies use normal rates. */
  partyPeRegen: 1.1,
  /** Party movement is 5% faster, including CPU allies; enemies keep their normal speed. */
  partySpeed: 1.05,
  /** Map for each stage. */
  maps: ['sanzu', 'yama', 'prison', 'grove', 'seals', 'lantern', 'onihall', 'wardens', 'snare', 'night', 'dirge'] as const,
  rescueStage: 2,
  /** Quest 2 stage 1 (妖樹): three trees, one effect at a time. */
  groveStage: 3,
  sealStage: 4,
  escortStage: 5,
  bossStage: 6,
  wardenStage: 7,
  /** Two allies start sealed in small summon and illusion trees. */
  snareStage: 8,
  /** Dark alley: one tougher enemy squad, no waves and no towers. */
  nightStage: 9,
  /** Finale: one Bell Oni. A toll from the center bell hits everyone on the other side. */
  dirgeStage: 10,
  wardens: {
    hpBase: 420, hpPerPlayer: 150, reviveAfter: 12, reviveHp: 0.6, damage: 1.45,
    /** Two bosses plus one ordinary guard, who returns throughout the fight. */
    enemies: 3, gruntRespawn: 12,
    /** Summon tree behind the wardens. Destroying it is optional; it only stops the casts. */
    tree: {
      x: WIDTH - 150, y: (HUD_HEIGHT + HEIGHT) / 2,
      hpBase: 900, hpPerPlayer: 160, aura: 0,
      interval: 3, initialDelay: 1.5, radius: 110, warnScale: 1,
    },
  },
  /** Stage 1 (殲滅): enemies per wave = party + 1 (max 4), this many waves. */
  waves: 2,
  /** Stage 2 (破塔): two big enemy towers; HP each = base + perPlayer × party size. */
  tower: { base: 300, perPlayer: 150, size: 64 },
  /** Stage 3 (救援): two reinforced princess walls and a hostile summoning tree. */
  rescue: {
    wallBase: 900, wallPerPlayer: 250,
    /** The tree keeps four guards in the fight and never brings the count past four. */
    enemies: 4,
    tree: {
      x: WIDTH - 150, y: (HUD_HEIGHT + HEIGHT) / 2, initialDelay: 3, interval: 5,
      lightWarn: 0.8, thunderWarn: 1.1, warn: 1.6, radius: 120, damage: 1.25,
      /** Prison-tree warnings close this much sooner than the shared summon timing. */
      warnScale: 0.75,
      hpBase: 900, hpPerPlayer: 300, aura: 170, respawnFactor: 2,
      /** Design x of the seal. Rescuers cannot cross it until both princess walls are broken. */
      gateX: 1050,
    },
  },
  /**
   * Quest grove: destroy three trees. Their jobs are shuffled across the spots.
   * Two trees work at once: summon with illusion, then illusion with respawn, then respawn with summon.
   * Each window lasts `interval - rest` seconds, then both rest. The respawn skill is not in the opening pair.
   * Each enemy the respawn tree brings back costs it 10% of its max HP.
   * The illusion is sand, hot air or ice, chosen once per stage.
   */
  grove: {
    enemies: 4,
    /** Summon and illusion open together. Respawn replaces summon, then summon replaces illusion. */
    order: ['summon', 'illusion', 'respawn'] as const,
    interval: 30,
    rest: 5,
    respawnEvery: 3,
    maxEnemies: 4,
    summonInterval: 2,
    /** Added to each grove summon's hit chance, and never past a sure hit. */
    summonHitBonus: 0.2,
    heatSlow: 0.62,
    radius: 150,
    hpBase: 380,
    hpPerPlayer: 100,
    /** The summoning tree is 50% tougher than the other two. */
    summonHp: 1.5,
    aura: 120,
    spots: [
      { x: WIDTH / 2, y: HUD_HEIGHT + 150 },
      { x: 300, y: HEIGHT - 150 },
      { x: WIDTH - 300, y: HEIGHT - 150 },
    ],
  },
  /** The three altars need 1, then 2, then 3 allies. Lightning keeps striking like Thunder Peak. */
  seals: {
    allies: [1, 2, 3] as const,
    chargeTime: 40, radius: 68, respawnEvery: 8, enemies: 4, guardHp: 1.6,
    spots: [
      { x: WIDTH / 2, y: HUD_HEIGHT + 140 },
      { x: 340, y: HEIGHT - 150 },
      { x: WIDTH - 340, y: HEIGHT - 150 },
    ],
  },
  /**
   * Quest 2 stage 3: a tug-of-war lantern. It starts at the center of a straight lane.
   * Two allies and no enemies push it to the enemy side (clear). Enemies alone push it
   * back to the party side (fail). Anyone from both sides inside the circle stops it.
   */
  escort: {
    hpBase: 600, hpPerPlayer: 180, radius: 100, speed: 5, respawnEvery: 8, allies: 2, enemies: 4, guardHp: 1.6,
    path: [
      { x: 180, y: 406 }, { x: 645, y: 406 }, { x: 1110, y: 406 },
    ],
  },
  /** Quest stage 4 (討伐): the boss. HP = base + perPlayer × party size. */
  boss: {
    hpBase: 300, hpPerPlayer: 150, damage: 1.6, radius: 27, speed: 1.05, knockbackTaken: 0.25,
    skillCooldown: 0.75, maxParalysis: 1,
    /** Add ten percentage points to this boss's summon hit chances, capped at 100%. */
    summonHitBonus: 0.1,
    /** Includes the boss; each reinforcement costs 8% of the boss's max HP. */
    maxEnemies: 4, respawnInterval: 10, respawnHpCost: 0.08,
  },
  /** Stage 2 enemy towers use this multiplier on the normal respawn wait. */
  towerRespawnFactor: 2.5,
  /** Recovery time in seconds after clearing a wave in stage 1. */
  waveDelay: 5,
  /**
   * Snare: two small trees, one summoning and one casting an illusion.
   * Up to two allies start trapped inside them. Destroy a tree to free its prisoner, then defeat the enemies together.
   */
  snare: {
    enemies: 3,
    hpBase: 200,
    hpPerPlayer: 55,
    /** The summon sapling is a little tougher than the illusion sapling. */
    summonHp: 1.25,
    aura: 72,
    summonInterval: 3.5,
    summonHitBonus: 0.1,
    radius: 100,
    heatSlow: 0.75,
    spots: [
      { x: 880, y: HUD_HEIGHT + 170 },
      { x: 1040, y: HEIGHT - 170 },
    ],
  },
  /**
   * Night alley: a small boss leads four enemies. They do not return.
   * Each lantern's candle flares and scorches the heroes standing in its light.
   * A weapon hit blows that candle out until it climbs back.
   */
  night: {
    enemies: 4,
    hp: 1.35,
    /** The Night Oni. Sturdier than the squad, well short of a finale boss. */
    captain: {
      hpBase: 240, hpPerPlayer: 55, damage: 1.2, radius: 22, speed: 1.02, knockbackTaken: 0.6, skillCooldown: 0.9,
    },
    veil: 0.72,
    light: 168,
    lantern: 124,
    /** Seconds a lit candle waits between flares, then the warning before it strikes. */
    flareEvery: 6.5,
    flareWarn: 1.15,
    flareDamage: 18,
    /** How long a blown-out candle stays dark before the flame returns. */
    relight: 8,
  },
  /** The Bell Oni. The center bell tolls on a timer and strikes the opposing side. */
  dirge: {
    hpBase: 480, hpPerPlayer: 180, damage: 1.55, radius: 26, speed: 1.02, knockbackTaken: 0.3,
    skillCooldown: 0.8,
    tollEvery: 9, tollWarn: 1.6, tollRadius: 210, tollDamage: 16, tollParalyze: 1.1,
    bell: { x: WIDTH / 2, y: (HUD_HEIGHT + HEIGHT) / 2 },
  },
};

/** Opening trials. Two of these three are drawn. */
export const QUEST_FIGHTS: readonly number[] = [0, 1, QUEST.nightStage];
/** Middle trials. Two of these are drawn. The snare is one of the choices, not a fixed stop. */
export const QUEST_TACTICS: readonly number[] = [QUEST.rescueStage, QUEST.groveStage, QUEST.sealStage, QUEST.escortStage, QUEST.snareStage];
/** The finale is exactly one of these. */
export const QUEST_BOSSES: readonly number[] = [QUEST.bossStage, QUEST.wardenStage, QUEST.dirgeStage];

/** How many stages each band contributes to a new run. */
const QUEST_FIGHT_DRAW = 2;
const QUEST_TACTIC_DRAW = 2;

function shuffleStages(stages: readonly number[], random: () => number): number[] {
  const pool = [...stages];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool;
}

/** Two of three enemy fights, two tactic trials, then one boss. */
export function rollQuestRoute(random: () => number = Math.random): number[] {
  const fights = shuffleStages(QUEST_FIGHTS, random).slice(0, QUEST_FIGHT_DRAW);
  const tactics = shuffleStages(QUEST_TACTICS, random).slice(0, QUEST_TACTIC_DRAW);
  const boss = QUEST_BOSSES[Math.floor(random() * QUEST_BOSSES.length)]!;
  return [...fights, ...tactics, boss];
}

/** A route that still contains `stage`, kept in its fight, tactic, or boss band. */
export function routeWithStage(stage?: number, random: () => number = Math.random): number[] {
  const route = rollQuestRoute(random);
  if (stage === undefined || route.includes(stage)) return route;
  if ((QUEST_BOSSES as readonly number[]).includes(stage)) route[route.length - 1] = stage;
  else if ((QUEST_FIGHTS as readonly number[]).includes(stage)) route[Math.floor(random() * QUEST_FIGHT_DRAW)] = stage;
  else route[QUEST_FIGHT_DRAW + Math.floor(random() * QUEST_TACTIC_DRAW)] = stage;
  return route;
}

/** Older runs stay valid. A new run is five stages. */
export function isStoredQuestRoute(route?: readonly number[]) {
  return route?.length === 5 || route?.length === 6 || route?.length === 7 || route?.length === 8;
}

/** Fill in the route and the stage this run actually starts on. A stored route is kept. */
export function prepareQuest(quest?: { stage?: number; route?: readonly number[] }): { stage: number; route: number[]; campaign: QuestMode } {
  const given = isStoredQuestRoute(quest?.route) ? [...quest!.route!] : routeWithStage(quest?.stage);
  const route = quest?.stage !== undefined && !given.includes(quest.stage) ? routeWithStage(quest.stage) : given;
  const stage = quest?.stage !== undefined && route.includes(quest.stage) ? quest.stage : route[0]!;
  return { stage, route, campaign: 'quest' };
}

/** 1-based position of a stage inside this run. */
export const questStageNumber = (route: readonly number[], stage: number) => {
  const index = route.indexOf(stage);
  return index < 0 ? 1 : index + 1;
};
export const nextQuestStage = (route: readonly number[], stage: number): number | undefined => {
  const index = route.indexOf(stage);
  return index < 0 ? undefined : route[index + 1];
};

/**
 * How smart the CPU fighters are. Standard is the original behaviour; Hard reacts faster, picks its
 * targets and distances more cleverly, punishes openings and dodges better.
 */
export type Difficulty = 'standard' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['standard', 'hard'];
/** On Hard, CPU fighters also have this much more max HP (in Quest only the enemies, never your party or the boss). */
export const HARD_CPU_HP = 1.3;

/** Team mode: index 0 = red team, 1 = blue team. */
export const TEAM_COLORS = [0xe8473c, 0x3b82f6];

/** Save the Princess: HP per princess wall for a 2-player team (scaled by team size). */
export const PRINCESS_WALL_HP = 680;
export const RESPAWN_DELAY = 3;

/**
 * Watchtowers (team modes): each team has two. A tower shoots the nearest enemy in
 * range; teammates inside its aura recover PE faster and take less damage. Destroying
 * one gives the attacking team a short War Drum. In Siege, destroy them all to win.
 */
export const TOWER_HP = 300;
export const TOWER_RANGE = 230;
export const TOWER_FIRE_INTERVAL = 1.1;
export const TOWER_AURA = 130;
export const TOWER_AURA_PE_REGEN = 2;
export const TOWER_AURA_DAMAGE_TAKEN = 0.8;
export const SIEGE_RESPAWN_DELAY = 5;

/**
 * 魂 Soul: damage dealt to enemy fighters fills a 4-level meter. The soul skill spends
 * it to call lightning on the nearest enemies (level N = the N nearest), anywhere on the field.
 */
export const SOUL_PER_LEVEL = 30;
/** Share of damage you take that also fills your own soul (so getting hurt builds towards a comeback). */
export const SOUL_FROM_HURT = 0.4;
export const SOUL_LEVELS = 4;
/**
 * Summon strikes: `hitChance[level - 1]` is each strike's chance to land, so spending more
 * soul makes every strike more likely to hit (as well as striking more enemies).
 * 天雷 Thunder: a hit deals minDamage–maxDamage and paralyses for `paralyze` seconds
 * (paralysed fighters can't act, and nothing can hurt them).
 */
export const SOUL_THUNDER = { hitChance: [0.55, 0.65, 0.75, 0.85], minDamage: 5, maxDamage: 30, paralyze: 2, stagger: 0.15 };
/** A paralysed fighter can't act or move, but is still hurt, for this share of the damage. */
export const PARALYZED_DAMAGE_TAKEN = 0.4;
/** Every summon strike paralyses its target for at least this long, even when it misses (hits paralyse longer). */
export const SOUL_MISS_PARALYZE = 0.8;
/**
 * 死神 Reaper: rarely lands. A hit ignores damage reduction. Under `executeBelow` HP the
 * target dies; otherwise they are left with `leaveHp`. `damage` is only the tree spell's
 * listed figure; the hit itself does not use it.
 */
export const SOUL_REAPER = { hitChance: [0.1, 0.15, 0.2, 0.25], damage: 80, executeBelow: 80, leaveHp: 20, paralyze: 2.5, stagger: 0.25 };
/** 聖火 Holy Fire: almost always lands, but only a small burn. */
export const SOUL_FIRE = { hitChance: [0.85, 0.9, 0.95, 1], minDamage: 5, maxDamage: 12, paralyze: 1.2, stagger: 0.12 };
/** 神樹 Sacred Tree: hits `perLevel` enemies per soul level, 75% to land on each target (whatever the soul level), 5 damage, a 2.5s paralysis. */
export const SOUL_TREE = { perLevel: 2, hitChance: 0.75, damage: 5, paralyze: 2.5, stagger: 0.08 };
/**
 * Summoning skills (天雷, 死神) take this long to call: the caster is frozen and can't be
 * hurt meanwhile, and the strikes land when the call finishes.
 */
export const SOUL_CAST_TIME = 1;
/** Visual radius around a summon caster; lighting never covers the entire battlefield. */
export const SUMMON_LIGHT_RADIUS = 300;
/** The main tower (本陣) at the back of each side: bigger, tougher, longer reach. */
export const MAIN_TOWER = { hp: 600, size: 64, range: 280, fireInterval: 0.8, damage: 7, aura: 170 };
/** The small front tower (one of the two front ones): weaker and shorter-ranged. */
/**
 * Teammates inside their main tower's aura draw HP from it: they gain `perSec` HP per
 * second and the tower loses the same, never dropping below `floor` of its max HP this way.
 */
export const MAIN_TOWER_HEAL = { perSec: 4, floor: 0.1 };
export const SMALL_TOWER = { hp: 180, size: 26, range: 190, fireInterval: 1.1, damage: 3, aura: 100 };
/**
 * While a team still has a tower, its fallen players come back one at a time. The wait
 * starts short and grows as the battle goes on: base + elapsed seconds × growth, capped.
 */
export const TEAM_RESPAWN = { base: 4, growthPerSec: 1 / 15, max: 14 };
/** Each respawn costs this share of tower max HP. Normal modes retain 1 HP; Quest enemy towers/tree can be exhausted. */
export const RESPAWN_TOWER_COST = 0.1;
/** Players brought back by a tower return with this share of their max HP. */
export const TOWER_RESPAWN_HP = 0.75;
/** …and keep only this share of their 魂 (soul). */
export const TOWER_RESPAWN_SOUL_KEEP = 0.5;

/** Treasure chest HP (where they go: CHEST_SPOTS in map.ts). */
export const CHEST_HP = 22;
/** Default chance that a chest is empty (decided each round, hidden until opened). Some spots override it, see CHEST_SPOTS. */
export const EMPTY_CHEST_CHANCE = 0.4;
/** Big chests: tougher, never empty, and hold more than one item. */
export const BIG_CHEST_HP = 58;
export const BIG_CHEST_ITEMS = 2;
/**
 * Extra chests at random open spots, scaled by the number of fighters (n):
 * n − 2 drop in at the start, then one every (16 − 1.5n) s, up to ⌈n/2⌉ + 1 at once.
 */
export const randomChestInterval = (n: number) => 16 - 1.5 * n;
export const maxRandomChests = (n: number) => Math.ceil(n / 2) + 1;
export const startRandomChests = (n: number) => Math.max(0, n - 2);
/** Quest: players are the only ones who open chests, so the field never holds more than this. */
export const QUEST_MAX_CHESTS = 6;

/** Keep big chests, then the ones most likely to hold loot, up to `cap`. */
export function chestsWithinCap<T extends { big?: boolean; empty?: number }>(spots: readonly T[], cap: number): T[] {
  const rank = (spot: T) => (spot.big ? 0 : 1 + (spot.empty ?? 0.4));
  return [...spots].sort((a, b) => rank(a) - rank(b)).slice(0, Math.max(0, cap));
}

/** Loading screen shown between fighter setup and the battle countdown. */
export const BATTLE_LOADING_MS = 5000;
/** After the bar fills, the loading screen stays up this long before the battle. */
export const BATTLE_LOADING_HOLD_MS = 2000;
/** Time to view the frozen battlefield before the numbered countdown begins. */
export const BATTLE_READY_SECONDS = 3;
/** Seconds of 5-4-3-2-1 before a round starts; nobody can move until it ends. */
export const COUNTDOWN = 5;

/**
 * Render scale. Game logic always uses WIDTH x HEIGHT units, but the canvas is
 * rendered at roughly the number of physical pixels it will cover on screen
 * (window size x devicePixelRatio), so it stays sharp on large / Retina displays.
 */
export const RES = Math.min(
  3,
  Math.max(1, Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT) * (window.devicePixelRatio || 1)),
);
