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

// Weapon balance budgets. Every weapon has the same hit area, and the same
// damage / knockback / PE spent per second when swinging nonstop.
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

export type GameMode = 'ffa' | 'team' | 'princess' | 'siege' | 'quest';
export const GAME_MODES: GameMode[] = ['ffa', 'team', 'princess', 'siege', 'quest'];

/**
 * 闖關 Quest: up to 4 players (P1–P4, humans or CPU allies) on one side against
 * enemies set by the stage. Three stages in a row; enemy numbers scale with the party.
 */
export const QUEST = {
  /** Lobby slots that make up the party. */
  partySlots: 4,
  /** The party fights with this much more max HP than usual. */
  partyHp: 1.2,
  /** Map for each stage. */
  maps: ['sanzu', 'yama', 'onihall'] as const,
  /** Stage 1 (殲滅): enemies per wave = party + 1 (max 4), this many waves. */
  waves: 2,
  /** Stage 2 (破塔): two big enemy towers; HP each = base + perPlayer × party size. */
  tower: { base: 300, perPlayer: 150, size: 64 },
  /** Stage 3 (討伐): the boss. HP = base + perPlayer × party size. */
  boss: { hpBase: 300, hpPerPlayer: 150, damage: 1.6, radius: 27, speed: 0.9, knockbackTaken: 0.25 },
  /** Seconds before the next wave walks in. */
  waveDelay: 2,
};

/** Team mode: index 0 = red team, 1 = blue team. */
export const TEAM_COLORS = [0xe8473c, 0x3b82f6];

/** Save the Princess: wall HP for a 2-player team (scaled by team size), and how long fallen players wait to come back. */
export const PRINCESS_WALL_HP = 340;
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
export const SOUL_PER_LEVEL = 24;
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
/** Every summon strike paralyses its target for at least this long, even when it misses (hits paralyse longer). */
export const SOUL_MISS_PARALYZE = 0.8;
/** 死神 Reaper: rarely lands, but when it does it's a huge blow (most wounded fighters die). */
export const SOUL_REAPER = { hitChance: [0.1, 0.15, 0.2, 0.25], damage: 80, paralyze: 2.5, stagger: 0.25 };
/** 聖火 Holy Fire: almost always lands, but only a small burn. */
export const SOUL_FIRE = { hitChance: [0.85, 0.9, 0.95, 1], minDamage: 5, maxDamage: 12, paralyze: 1.2, stagger: 0.12 };
/** 神樹 Sacred Tree: hits `perLevel` enemies per soul level, 75% to land on each target (whatever the soul level), 5 damage, the longest paralysis. */
export const SOUL_TREE = { perLevel: 3, hitChance: 0.75, damage: 5, paralyze: 3.5, stagger: 0.08 };
/**
 * Summoning skills (天雷, 死神) take this long to call: the caster is frozen and can't be
 * hurt meanwhile, and the strikes land when the call finishes.
 */
export const SOUL_CAST_TIME = 1;
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
/** Each respawn costs the tower that does it this share of its max HP (it can't drop below 1 this way). */
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

/** Seconds of 3-2-1 before a round starts; nobody can move until it ends. */
export const COUNTDOWN = 3;

/**
 * Render scale. Game logic always uses WIDTH x HEIGHT units, but the canvas is
 * rendered at roughly the number of physical pixels it will cover on screen
 * (window size x devicePixelRatio), so it stays sharp on large / Retina displays.
 */
export const RES = Math.min(
  3,
  Math.max(1, Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT) * (window.devicePixelRatio || 1)),
);
