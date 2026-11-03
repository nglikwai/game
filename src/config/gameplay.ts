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

/**
 * Elemental conditions (the three-headed dragon's attacks). Burn: HP lost per second, and healing on a
 * burning fighter is cut to this share. Frost: slower movement and swings. A lightning hit on a frosted
 * fighter does `conduct` times the damage; fire on a frozen fighter melts the ice at once.
 */
export const ELEMENT = {
  burn: { dps: 2, healing: 0.5 },
  frost: { speed: 0.6, swing: 1.3 },
  conduct: 1.5,
};

export const MAX_HP = 100;

export const MAX_PE = 100;

/** PE only pays for skills (weapons are free), and comes back at this one steady rate whatever you're doing. */
export const PE_REGEN_PER_SEC = 12;

/** Seconds after spending PE before regen resumes. */
export const PE_REGEN_DELAY = 0.5;

// Weapon balance budgets. Hit area uses a common baseline (shuriken +25%, flail +15%).
// Swinging costs no PE. Knockback per second is equal for every weapon; damage per second is this base
// times each weapon's `power` (weapons.ts). Fast weapons therefore hit softly; slow weapons hit hard.
export const WEAPON_AREA = 9000;

// px²
/** Lowered from 16 when swings became free, since nobody runs out of PE mid-fight any more. */
export const DAMAGE_PER_SEC = 14;

export const KNOCKBACK_PER_SEC = 700;

export const HITSTUN_PER_CYCLE = 0.4;

/** On Hard, CPU fighters also have this much more max HP (in Quest only the enemies, never your party or the boss). */
export const HARD_CPU_HP = 1.3;

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
 * 暴走 Berserk: spends every full 魂 level for a short super state. Each list is indexed by `level - 1`,
 * so spending more 魂 lasts longer and buffs harder. PE refills at the start.
 * - damage: weapon damage and knockback dealt ×; taken: damage taken ×; knockbackTaken: how far hits push you ×
 * - speed: walking speed ×; swing: weapon swing time × (lower = faster); area: weapon hit area ×
 * - cooldown: skill cooldowns run this many times faster; peRegen: PE regen ×
 * - superArmorFrom: from this level, hits no longer interrupt you (no flinch / stun)
 * - lifestealFrom / lifesteal: from this level, that share of weapon damage dealt heals you
 */
export const SOUL_RAGE = {
  /** Seconds the next-item button must be held (with at least one full 魂 level) to trigger it. */
  hold: 0.4,
  duration: [8, 10, 12, 14],
  damage: [1.15, 1.3, 1.45, 1.6],
  taken: [0.85, 0.75, 0.65, 0.55],
  knockbackTaken: [0.8, 0.6, 0.45, 0.3],
  speed: [1.1, 1.17, 1.24, 1.32],
  swing: [0.9, 0.82, 0.75, 0.68],
  area: [1.2, 1.35, 1.5, 1.7],
  cooldown: [1.25, 1.5, 1.75, 2],
  peRegen: [1.5, 1.75, 2, 2.5],
  superArmorFrom: 3,
  lifestealFrom: 4,
  lifesteal: 0.2,
  /** The fire around a berserk player, [flame, hot core] per level: orange, crimson, violet, then blue (hottest). */
  colors: [[0xff8a2a, 0xffd27a], [0xff2a3a, 0xffa07a], [0xb04aff, 0xeab8ff], [0x3ab8ff, 0xeafaff]] as [number, number][],
};

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
 * target dies; otherwise they are left with `leaveHp`. A boss loses at most `bossMax` HP to one hit.
 * `damage` is only the tree spell's listed figure; the hit itself does not use it.
 */
export const SOUL_REAPER = { hitChance: [0.1, 0.15, 0.2, 0.25], damage: 80, executeBelow: 80, leaveHp: 20, bossMax: 200, paralyze: 2.5, stagger: 0.25 };

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

/** Keep big chests, then the ones most likely to hold loot, up to `cap`. */
export function chestsWithinCap<T extends { big?: boolean; empty?: number }>(spots: readonly T[], cap: number): T[] {
  const rank = (spot: T) => (spot.big ? 0 : 1 + (spot.empty ?? 0.4));
  return [...spots].sort((a, b) => rank(a) - rank(b)).slice(0, Math.max(0, cap));
}
