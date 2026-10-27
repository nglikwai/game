import { WIDTH, HEIGHT, HUD_HEIGHT } from '@/config/display';
import { type QuestMode } from '@/config/modes';

/**
 * 闖關 Quest: up to 4 players (P1–P4, humans or CPU allies) on one side against
 * enemies set by the stage. Each run follows a randomized route; enemy numbers scale with the party,
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
  maps: ['sanzu', 'yama', 'prison', 'grove', 'seals', 'lantern', 'onihall', 'wardens', 'snare', 'night', 'dirge', 'dragon', 'beacons', 'ambush', 'eclipse'] as const,
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
  /** 第一程: three guards and a three-headed dragon (fire, ice, thunder). Kill them all to pass. */
  dragonStage: 11,
  /** A tactical trial: carry six wandering spirits back to the guiding lantern. */
  beaconStage: 12,
  /** Opening enemy fight: heroes start in the center, enemies attack from both flanks. */
  ambushStage: 13,
  /** Semi-final: the Sun & Moon Wyverns, joined by a chain of lightning. Both must fall within `reviveAfter` s. */
  wyvernStage: 14,
  ambush: {
    enemyHp: 1.25,
    heroes: [
      { x: WIDTH / 2 - 32, y: (HUD_HEIGHT + HEIGHT) / 2 - 48 },
      { x: WIDTH / 2 + 32, y: (HUD_HEIGHT + HEIGHT) / 2 + 48 },
      { x: WIDTH / 2 + 32, y: (HUD_HEIGHT + HEIGHT) / 2 - 48 },
      { x: WIDTH / 2 - 32, y: (HUD_HEIGHT + HEIGHT) / 2 + 48 },
    ],
    enemies: [
      { x: 220, y: (HUD_HEIGHT + HEIGHT) / 2 - 90 },
      { x: WIDTH - 220, y: (HUD_HEIGHT + HEIGHT) / 2 + 90 },
      { x: 220, y: (HUD_HEIGHT + HEIGHT) / 2 + 90 },
      { x: WIDTH - 220, y: (HUD_HEIGHT + HEIGHT) / 2 - 90 },
    ],
  },
  beacons: {
    required: 6, maxSpirits: 3, spawnEvery: 8, pickupRadius: 22,
    destination: { x: 190, y: (HUD_HEIGHT + HEIGHT) / 2, radius: 52 },
    respawnEvery: 10, enemies: 3, guardHp: 1.2,
    spots: [
      { x: 330, y: HUD_HEIGHT + 180 },
      { x: WIDTH / 2, y: HEIGHT - 185 },
      { x: WIDTH - 330, y: HUD_HEIGHT + 180 },
    ],
  },
  wardens: {
    hpBase: 420, hpPerPlayer: 150, reviveAfter: 12, reviveHp: 0.6, damage: 1.45,
    /** The two wardens only. No extra guard. */
    enemies: 2, gruntRespawn: 12,
    /** Summon tree behind the wardens. Destroying it is optional; it only stops the casts. */
    tree: {
      x: WIDTH - 150, y: (HUD_HEIGHT + HEIGHT) / 2,
      hpBase: 900, hpPerPlayer: 160, aura: 0,
      interval: 8, initialDelay: 4, radius: 110, warnScale: 1,
    },
  },
  /** Stage 1 (殲滅): enemies per wave = party + 1 (max 4), this many waves. */
  waves: 2,
  /** Stage 2 (破塔): two big enemy towers; HP each = base + perPlayer × party size. */
  tower: { base: 300, perPlayer: 150, size: 64 },
  /** Stage 3 (救援): two reinforced princess walls and a hostile summoning tree. */
  rescue: {
    wallBase: 900, wallPerPlayer: 250,
    /** Two guards hold the prison until both princesses are free, then four stand and do not return. */
    held: 2,
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
    respawnEvery: 8,
    maxEnemies: 4,
    summonInterval: 5,
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
    chargeTime: 40, radius: 68,
    /** A fallen guard returns this many seconds later, one at a time, until every altar is broken. */
    respawnEvery: 16, enemies: 4, guardHp: 1.6,
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
   * The lantern cannot be broken.
   */
  escort: {
    hpBase: 600, hpPerPlayer: 180, radius: 100, speed: 5,
    /** A fallen guard returns this many seconds later, one at a time, ahead of the lantern. */
    respawnEvery: 16, allies: 2, enemies: 4, guardHp: 1.6,
    path: [
      { x: 180, y: 406 }, { x: 645, y: 406 }, { x: 1110, y: 406 },
    ],
  },
  /** Quest stage 4 (討伐): the boss. HP = base + perPlayer × party size. */
  boss: {
    hpBase: 300, hpPerPlayer: 150, damage: 1.6, radius: 27, speed: 1.05, knockbackTaken: 0.25,
    skillCooldown: 0.75, maxParalysis: 1,
    /** Finale bosses collect 20% less soul from all sources. */
    soulGainScale: 0.8,
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
   * Night alley: the Night Oni plus two enemies. They do not return.
   * Each lantern's candle flares and scorches the heroes standing in its light.
   * A weapon hit blows that candle out until it climbs back.
   */
  night: {
    /** Regular fighters beside the Night Oni. */
    enemies: 2,
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
  /**
   * The three-headed dragon. It walks the right half of the cave and keeps its distance from the party;
   * each of its heads is its own target with its own HP, and they take turns shooting long-range,
   * dodgeable shots that carry their element. Lose a head and that element stops, but the others shoot
   * faster. Tuned so the stage takes about 5–7 minutes.
   */
  dragon: {
    enemies: 3,
    /** The three guards are cave cultists: less HP and softer hits than a normal enemy. */
    guardHp: 0.7, guardDamage: 0.85,
    /** While any head lives, a fallen guard comes back beside the dragon every `guardRespawn` s, up to `maxGuards` standing. */
    guardRespawn: 12, maxGuards: 3,
    /** Each head's HP = hpBase + hpPerPlayer × party size (each player adds about the same damage). */
    hpBase: 120, hpPerPlayer: 650,
    /** Where it starts, how big its body is, and how its heads sit on the front of it (design px). */
    start: { x: WIDTH - 200, y: (HUD_HEIGHT + HEIGHT) / 2 },
    body: { w: 150, h: 110 },
    heads: [
      { element: 'fire' as const, dx: -92, dy: -72 },
      { element: 'thunder' as const, dx: -118, dy: 0 },
      { element: 'ice' as const, dx: -92, dy: 72 },
    ],
    headSize: 60,
    /**
     * Walking speed (world px/s), how fast it turns to face its target (radians/s), the distance it tries to keep from
     * the nearest fighter, and where it may roam (design px). Head offsets above are for facing left.
     */
    speed: 85, turnRate: 1.5, keepRange: 380,
    roam: { minX: 760, maxX: WIDTH - 130, minY: HUD_HEIGHT + 140, maxY: HEIGHT - 140 },
    /** Where the three guards start, in front of the dragon. */
    guards: [
      { x: WIDTH - 470, y: (HUD_HEIGHT + HEIGHT) / 2 - 150 },
      { x: WIDTH - 490, y: (HUD_HEIGHT + HEIGHT) / 2 },
      { x: WIDTH - 470, y: (HUD_HEIGHT + HEIGHT) / 2 + 150 },
    ],
    /**
     * Seconds between shots (heads take turns), the first shot's delay, and the speed-up per lost head.
     * While any guard still stands, the dragon lets them fight and shoots `guardPhaseSlow` times more slowly.
     */
    interval: 3.2, initialDelay: 5, speedUpPerLostHead: 1.2, guardPhaseSlow: 1.8,
    /** Each head independently rolls a beam or projectile attack. Only the head glows before breath. */
    beam: { chance: 0.5, warn: 0.5, duration: 3, sweep: Math.PI / 2, range: 2400, width: 26, tick: 0.5,
      damageScale: 0.5, maxControl: 0.15, peDrain: 3 },
    /** Each shot: aim time (`warn`), the last part of it where the aim no longer follows (`lock`), and the shot itself. */
    /**
     * Each shot: aim time (`warn`), the last part of it where the aim no longer follows (`lock`), then a fast shot that
     * reaches across the whole cave and bursts where it lands (on a fighter, a stone or the wall), hitting everyone on
     * the other side within `blast` (design px) with its element.
     */
    fire: { warn: 0.8, lock: 0.3, shots: 3, spread: 0.45, speed: 760, radius: 18, range: 2400, blast: 185, damage: 5, burn: 3 },
    ice: { warn: 0.7, lock: 0.25, shots: 2, gap: 0.3, speed: 980, radius: 15, range: 2400, blast: 165, damage: 4, frost: 2.5, freeze: 1 },
    thunder: { warn: 0.9, lock: 0.3, speed: 1400, radius: 16, range: 2400, blast: 155, damage: 5, paralyze: 0.8, peDrain: 15, chainRange: 110, chainShare: 0.5, chainParalyze: 0.5 },
  },
  /**
   * Touching any dragon hurts: the three-headed dragon's body and heads, and both wyverns. Whoever is within `reach`
   * (design px) of one takes `damage` and is knocked back, at most once every `cooldown` s.
   */
  dragonTouch: { damage: 4, knockback: 280, hitstun: 0.15, cooldown: 1, reach: 8 },
  /**
   * 日月雙龍 Sun & Moon Wyverns. Two single-headed wyverns walk the gorge, keeping their distance from the party and
   * from each other, with a chain of lightning between them that shocks anyone it touches. The Sun Wyvern drops sun
   * bombs on marked spots or charges down a lane; the Moon Wyvern sends out a frost ring with safe gaps or a fan of
   * ice shards. When one falls, the other attacks faster and raises it again `reviveAfter` s later at `reviveHp`,
   * unless the second falls first. Tuned so the stage takes about 5–7 minutes.
   */
  wyverns: {
    enemies: 2,
    /** The two guards are gorge bandits: less HP and softer hits. While both wyverns stand, a fallen guard returns. */
    guardHp: 0.8, guardDamage: 0.85, guardRespawn: 18, maxGuards: 2,
    /** Each wyvern's HP = hpBase + hpPerPlayer × party size. */
    hpBase: 250, hpPerPlayer: 900,
    reviveAfter: 15, reviveHp: 0.5,
    /** Attack speed-up while its partner is down. */
    enrage: 1.6,
    /** The body's solid box (design px). */
    size: 92,
    /** Walking speed (world px/s), turning (radians/s), distance kept from the nearest fighter and from each other (design px). */
    speed: 95, turnRate: 1.8, keepRange: 340, minGap: 280, maxGap: 620,
    sun: { start: { x: WIDTH - 250, y: HUD_HEIGHT + 190 }, roam: { minX: 560, maxX: WIDTH - 120, minY: HUD_HEIGHT + 110, maxY: (HUD_HEIGHT + HEIGHT) / 2 + 40 } },
    moon: { start: { x: WIDTH - 250, y: HEIGHT - 190 }, roam: { minX: 560, maxX: WIDTH - 120, minY: (HUD_HEIGHT + HEIGHT) / 2 - 40, maxY: HEIGHT - 110 } },
    guards: [
      { x: WIDTH - 520, y: (HUD_HEIGHT + HEIGHT) / 2 - 90 },
      { x: WIDTH - 520, y: (HUD_HEIGHT + HEIGHT) / 2 + 90 },
    ],
    /** Seconds between each wyvern's attacks (the Moon starts half a beat later), and the first one's delay. */
    interval: 3.6, initialDelay: 4, guardPhaseSlow: 1.5,
    /** The chain: its thickness (design px) and how often it shocks whoever touches it. */
    tether: { width: 16, tick: 0.5, scale: 1 },
    /** Sun bombs: one marked spot per target (up to `bombs`), landing after `warn`. `scale` multiplies the fire hit. */
    sunfall: { chance: 0.6, bombs: 3, scatter: 50, warn: 1.3, radius: 95, scale: 2 },
    /** A charge: the lane shows for `warn`, then the Sun Wyvern rushes down it, knocking aside everyone in the way. */
    charge: { warn: 1.0, width: 90, length: 640, speed: 900, scale: 2.4 },
    /** A frost ring spreading from the Moon Wyvern, with `gaps` safe openings each `gapWidth` radians wide. */
    ring: { chance: 0.5, warn: 0.9, speed: 430, maxRadius: 950, thickness: 26, gaps: 3, gapWidth: 0.9, scale: 2 },
    /** A fan of ice shards that burst small. */
    shards: { warn: 0.6, shots: 5, spread: 0.22, speed: 820, radius: 12, blast: 60, scale: 1 },
  },
  /** The Bell Oni. The center bell tolls on a timer and strikes the opposing side. */
  dirge: {
    hpBase: 480, hpPerPlayer: 180, damage: 1.55, radius: 26, speed: 1.02, knockbackTaken: 0.3,
    skillCooldown: 0.8,
    tollEvery: 9, tollWarn: 1.6, tollRadius: 300, tollDamage: 16, tollParalyze: 1.1,
    bell: { x: WIDTH / 2, y: (HUD_HEIGHT + HEIGHT) / 2 },
    /** Three toll rings. Anyone on the other side standing in one is struck. */
    tolls: [
      { x: WIDTH / 2, y: (HUD_HEIGHT + HEIGHT) / 2 },
      { x: WIDTH / 2 - 240, y: (HUD_HEIGHT + HEIGHT) / 2 + 120 },
      { x: WIDTH / 2 + 240, y: (HUD_HEIGHT + HEIGHT) / 2 - 120 },
    ],
  },
};

/** Opening trials. One of these four is drawn. */
export const QUEST_FIGHTS: readonly number[] = [0, 1, QUEST.nightStage, QUEST.ambushStage];

/** Middle trials. Two of these are drawn. The snare is one of the choices, not a fixed stop. */
export const QUEST_TACTICS: readonly number[] = [QUEST.rescueStage, QUEST.groveStage, QUEST.sealStage, QUEST.escortStage, QUEST.snareStage, QUEST.beaconStage];

/** Every run's semi-final, right before the finale, is one of the two dragon stages. */
export const QUEST_SEMIFINALS: readonly number[] = [QUEST.dragonStage, QUEST.wyvernStage];

/** The finale is exactly one of these. */
export const QUEST_BOSSES: readonly number[] = [QUEST.bossStage, QUEST.wardenStage, QUEST.dirgeStage];

/** How many stages each band contributes to a new run. */
const QUEST_FIGHT_DRAW = 1;

const QUEST_TACTIC_DRAW = 2;

function shuffleStages(stages: readonly number[], random: () => number): number[] {
  const pool = [...stages];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool;
}

/** One of four enemy fights, two tactic trials, one of the two dragon semi-finals, then one boss. */
export function rollQuestRoute(random: () => number = Math.random): number[] {
  const fights = shuffleStages(QUEST_FIGHTS, random).slice(0, QUEST_FIGHT_DRAW);
  const tactics = shuffleStages(QUEST_TACTICS, random).slice(0, QUEST_TACTIC_DRAW);
  const boss = QUEST_BOSSES[Math.floor(random() * QUEST_BOSSES.length)]!;
  const semifinal = QUEST_SEMIFINALS[Math.floor(random() * QUEST_SEMIFINALS.length)]!;
  return [...fights, ...tactics, semifinal, boss];
}

/** A route that still contains `stage`, kept in its fight, tactic, semi-final or boss band. */
export function routeWithStage(stage?: number, random: () => number = Math.random): number[] {
  const route = rollQuestRoute(random);
  if (stage === undefined || route.includes(stage)) return route;
  if ((QUEST_BOSSES as readonly number[]).includes(stage)) route[route.length - 1] = stage;
  else if (QUEST_SEMIFINALS.includes(stage)) route[route.length - 2] = stage;
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

/** Quest: players are the only ones who open chests, so the field never holds more than this. */
export const QUEST_MAX_CHESTS = 6;
