import type { MapLayout } from '@/maps/layout';
import { HEIGHT, HUD_HEIGHT, WIDTH, type GameMode } from '@/config';

/**
 * Shared map pieces: the playfield rectangle, map/obstacle types, spawn points and
 * painting helpers used by more than one map. Each map's art is painted once with
 * the Canvas 2D API into a texture (at RES scale so it stays sharp); colliders are
 * plain rectangles.
 */

/** Thickness of the border (wall / fence) around the playfield. */
export const WALL = 22;

/** Playable rectangle inside the border. */
export const ARENA = {
  x: WALL,
  y: HUD_HEIGHT + WALL,
  w: WIDTH - WALL * 2,
  h: HEIGHT - HUD_HEIGHT - WALL * 2,
};

export const ARENA_MID_Y = (HUD_HEIGHT + HEIGHT) / 2;

export type ObstacleKind =
  | 'pillar' | 'cauldron' | 'lantern' | 'cage'
  | 'water' | 'bamboo' | 'rock'
  | 'torii' | 'shrine' | 'pine'
  | 'house' | 'well' | 'barrel'
  | 'lava' | 'obsidian'
  | 'pond' | 'sakura' | 'hedge'
  | 'shoji' | 'post' | 'dummy'
  | 'farmhouse' | 'scarecrow'
  | 'hole' | 'sea' | 'crate'
  | 'fence' | 'tomb' | 'grave' | 'deadtree'
  | 'blood' | 'bones' | 'brazier' | 'hellwall' | 'throne'
  | 'palm' | 'ruin' | 'statue' | 'reed' | 'wreck' | 'cliff' | 'rod' | 'stump'
  | 'stall' | 'stage' | 'crystal'
  | 'chasm' | 'gear' | 'machine' | 'cloud'
  | 'bell' | 'herbbed';

export interface Obstacle {
  kind: ObstacleKind;
  /** Save the Princess: which team's princess this wall holds. */
  team?: number;
  /** Centre and size of the collision rectangle. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Low terrain (water): blocks walking, but projectiles fly over it. */
  low?: boolean;
}

/** `empty` overrides EMPTY_CHEST_CHANCE for that spot. */
export interface ChestSpot {
  x: number;
  y: number;
  big?: boolean;
  empty?: number;
}

export type MapId = 'courtyard' | 'river' | 'snow' | 'town' | 'lava' | 'garden' | 'dojo' | 'paddy' | 'ice' | 'docks' | 'onsen' | 'graveyard'
  | 'desert' | 'swamp' | 'maze' | 'canyon' | 'peak' | 'beach'
  | 'volcano' | 'portal' | 'festival' | 'rockslide' | 'traps' | 'crystal'
  | 'chasm' | 'workshop' | 'fog' | 'sky' | 'altar' | 'tidal'
  | 'doors' | 'powder' | 'bell' | 'barrier' | 'whirlpool' | 'herbs'
  | 'tea' | 'storm' | 'sunken' | 'frostfire' | 'orchard' | 'astral'
  /** 闖關 Quest stages only. */
  | 'sanzu' | 'yama' | 'prison' | 'grove' | 'seals' | 'lantern' | 'onihall' | 'wardens' | 'snare' | 'night' | 'dirge' | 'dragon' | 'beacons' | 'ambush' | 'eclipse';

export interface GameMap {
  /** Seeded Quest variation; source maps and menu thumbnails have no layout. */
  layout?: MapLayout;
  id: MapId;
  name: string;
  zh: string;
  desc: string;
  descZh: string;
  obstacles: Obstacle[];
  chests: ChestSpot[];
  /** Ambient particles drifting over the arena. */
  particles: AmbientKind;
  /** Mud / ice areas, if any. */
  zones?: TerrainZone[];
  /** Incense smoke source, if the map has one. */
  smokeFrom?: { x: number; y: number };
  /** Paints the whole arena (ground, obstacles, border) in game coordinates. */
  paint(ctx: Ctx, rand: () => number): void;
  /**
   * Optional waypoint for CPU fighters heading from (fx, fy) to (tx, ty) across
   * impassable terrain (e.g. the bridge to use over a river). null = go straight.
   */
  route?(fx: number, fy: number, tx: number, ty: number): { x: number; y: number } | null;
  /** Lightning storm: every `interval` s, `strikes` spots are marked and struck `warn` s later. */
  lightning?: { interval: number; strikes: number; radius: number; damage: number; warn: number };
  /** Fire vents at fixed spots: every `interval` s, `count` of them are marked and erupt `warn` s later. The flame stays on the ground. */
  vents?: { spots: { x: number; y: number }[]; interval: number; count: number; radius: number; damage: number; warn: number };
  /** Braziers and such: every `interval` s, `count` spots are marked, then they burst and leave fire for `life` s. Standing in it burns. */
  flames?: { spots: { x: number; y: number }[]; interval: number; count: number; warn: number; radius: number; dps: number; life: number };
  /** Portal pairs (design coords): walk into one, come out of the other. */
  portals?: { a: { x: number; y: number }; b: { x: number; y: number }; color: number }[];
  /** Rolling boulders: every `interval` s one rolls along a random lane (design y), after a `warn` s warning. */
  rollers?: { lanes: number[]; interval: number; warn: number; speed: number; radius: number; damage: number };
  /** Spike traps ('spikes' zones): the two sets swap every `period` s; up spikes hurt `dps`. */
  spikeCycle?: { period: number; warn: number; dps: number };
  /** Fireworks bursting over the arena (decoration). */
  fireworks?: boolean;
  /** Tide flats ('tide' zones) flood for `period` s, then drain for `period` s; `warn` s of notice before the water comes in. */
  tideCycle?: { period: number; warn: number };
  /** Sliding doors (design coords): set 0 is shut while set 1 is open, swapping every `period` s. */
  doors?: { rects: { x: number; y: number; w: number; h: number; group: number }[]; period: number; warn: number };
  /** Explosive kegs: hit one and it blows up (chaining to others nearby); they come back after `respawn` s. */
  kegs?: { spots: { x: number; y: number }[]; radius: number; damage: number; respawn: number };
  /** A great bell: every `interval` s it tolls, blasting everyone within `radius` outward. */
  bell?: { x: number; y: number; interval: number; warn: number; radius: number; damage: number };
  /** A shrinking barrier: the safe circle (design px, centred) shrinks from `start` to `end`; outside it costs `dps`. */
  barrier?: { start: number; end: number; delay: number; duration: number; dps: number };
  /** Healing herbs at fixed spots: walk over one to heal; it regrows after `regrow` s. */
  herbs?: { spots: { x: number; y: number }[]; heal: number; regrow: number };
}

export type Ctx = CanvasRenderingContext2D;

export type AmbientKind = 'petals' | 'leaves' | 'snow' | 'fireflies' | 'embers' | 'dust' | 'mist' | 'wisps' | 'maple' | 'rain' | 'spores';

/**
 * Ground that changes how you move: mud slows you down, ice makes you slide, hot springs
 * slow you but heal, sand and shallows slow you a little, poison slows and saps HP,
 * wind pushes you along. 'floor' is plain ground (to cut a hole in a bigger zone listed after it).
 */
export type TerrainKind =
  | 'mud' | 'ice' | 'spring' | 'sand' | 'shallows' | 'poison' | 'wind' | 'boost' | 'spikes'
  /** Fog hides you; a launch pad flings you along `push`; the altar charges whoever holds it; tide flats flood on a cycle. */
  | 'fog' | 'pad' | 'altar' | 'tide'
  /** Whirlpool: drags you towards its centre (`pull` px/s) and swirls you round. */
  | 'vortex'
  /** A sinking sand funnel: inward pull, damage inside, and a fatal central opening. */
  | 'sandpit'
  | 'floor';

export interface TerrainZone {
  kind: TerrainKind;
  /** Wind: which way it pushes, in battlefield px/s. */
  push?: { x: number; y: number };
  /** Spike traps / doors: which set (0 or 1) this belongs to; the two sets take turns. */
  group?: number;
  /** Whirlpool strength (battlefield px/s at the edge, stronger towards the middle). */
  pull?: number;
  /** Sand-pit damage per second. */
  dps?: number;
  /** Fatal core size as a fraction of the pit's elliptical radii (0–1). */
  core?: number;
  /** Centre and size. */
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------- spawns ----------

/**
 * Start positions. Free-for-all uses one corner per player; team modes put each
 * team on its own side (red left, blue right), filling corners first.
 */
export const CORNERS = [
  { x: 150, y: HUD_HEIGHT + 110 },
  { x: WIDTH - 150, y: HEIGHT - 110 },
  { x: WIDTH - 150, y: HUD_HEIGHT + 110 },
  { x: 150, y: HEIGHT - 110 },
];
/** Free-for-all starts: the four corners, the middle of the left and right sides, then top and bottom centre. */
const FFA_SPAWNS = [
  ...CORNERS,
  { x: 260, y: ARENA_MID_Y }, { x: WIDTH - 260, y: ARENA_MID_Y },
  { x: WIDTH / 2, y: HUD_HEIGHT + 110 }, { x: WIDTH / 2, y: HEIGHT - 110 },
];
const TEAM_SPAWNS = [
  [CORNERS[0], CORNERS[3], { x: 260, y: ARENA_MID_Y - 95 }, { x: 260, y: ARENA_MID_Y + 95 }, { x: 80, y: ARENA_MID_Y - 60 }, { x: 80, y: ARENA_MID_Y + 60 }],
  [CORNERS[2], CORNERS[1], { x: WIDTH - 260, y: ARENA_MID_Y - 95 }, { x: WIDTH - 260, y: ARENA_MID_Y + 95 }, { x: WIDTH - 80, y: ARENA_MID_Y - 60 }, { x: WIDTH - 80, y: ARENA_MID_Y + 60 }],
];

export function spawnPoint(index: number, team: number | null, slotInTeam: number) {
  return team === null ? FFA_SPAWNS[index % FFA_SPAWNS.length] : TEAM_SPAWNS[team][slotInTeam % TEAM_SPAWNS[team].length];
}

/**
 * Save the Princess: four enclosures, one in each corner, with room to approach the walls.
 */
export const CAGE_SIZE = 112;

/**
 * Which side (0 = left, 1 = right) a team starts on. `flip` is decided at random
 * each round, so red isn't always on the left.
 */
export const sideOf = (team: number, flip: boolean) => (flip ? 1 - team : team);

/** Each team's two princesses occupy the upper and lower corners on the ENEMY's side. */
export function cagesFor(flip: boolean): Obstacle[] {
  return [0, 1].flatMap((team) => {
    const side = sideOf(1 - team, flip);
    const x = side === 0 ? ARENA.x + 100 : ARENA.x + ARENA.w - 100;
    return [ARENA.y + 100, ARENA.y + ARENA.h - 100].map((y) => ({
      kind: 'cage' as const, team, x, y, w: CAGE_SIZE, h: CAGE_SIZE,
    }));
  });
}

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, pad = 0) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + pad;

export type TowerKind = 'main' | 'front' | 'small';

/**
 * Watchtower positions for one side (0 = left, 1 = right): two front towers and the main
 * tower at the very back. One front tower is smaller and weaker; the two small towers sit
 * diagonally (left side upper, right side lower), so each weak lane faces a strong one.
 */
export function towerSpots(side: number): { x: number; y: number; kind: TowerKind }[] {
  const front = side === 0 ? 470 : WIDTH - 470;
  // The main tower stands at the very back, against the side wall.
  const back = side === 0 ? 95 : WIDTH - 95;
  return [
    { x: front, y: ARENA_MID_Y - 170, kind: side === 0 ? 'small' : 'front' },
    { x: front, y: ARENA_MID_Y + 170, kind: side === 0 ? 'front' : 'small' },
    { x: back, y: ARENA_MID_Y, kind: 'main' },
  ];
}

/** Four princess walls, clearing solid and low obstacles so each enclosure can be reached. */
export function obstaclesFor(map: GameMap, mode: GameMode, flip = false): Obstacle[] {
  if (mode !== 'princess') return map.obstacles;
  const cages = cagesFor(flip);
  return [...map.obstacles.filter((o) => !cages.some((c) => overlaps(o, c, 28))), ...cages];
}

/** Chest spots, minus any that would sit inside a princess wall. */
export function chestsFor(map: GameMap, mode: GameMode): ChestSpot[] {
  if (mode !== 'princess') return map.chests;
  const cages = cagesFor(false);
  return map.chests.filter((s) => !cages.some((c) => overlaps({ x: s.x, y: s.y, w: 52, h: 40 }, c, 20)));
}

// ---------- chest layout helpers ----------

const SMALL = 34; // small chest width (see BattleScene)

/** Two chests tucked into a corner: a quick gamble right by a start. */
export function cornerPile(sx: 1 | -1, sy: 1 | -1): ChestSpot[] {
  const x0 = sx > 0 ? ARENA.x + 26 : ARENA.x + ARENA.w - 26;
  const y0 = sy > 0 ? ARENA.y + 22 : ARENA.y + ARENA.h - 22;
  return [
    { x: x0, y: y0, empty: 0.6 },
    { x: x0 + sx * (SMALL + 6), y: y0, empty: 0.6 },
  ];
}

/** Mirror a list of spots left/right (and optionally top/bottom), keeping the originals. */
export function mirrored(spots: ChestSpot[], vertical = false): ChestSpot[] {
  const out = [...spots, ...spots.map((s) => ({ ...s, x: WIDTH - s.x }))];
  if (vertical) out.push(...out.map((s) => ({ ...s, y: 2 * ARENA_MID_Y - s.y })));
  return out;
}

// ---------- painting helpers ----------

/** Small seeded PRNG so a map looks the same every time. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Soft radial blob, for moss, dirt, snow drifts, lantern light… */
export function blob(ctx: Ctx, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function paintShadow(ctx: Ctx, o: Obstacle) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetX = 7;
  ctx.shadowOffsetY = 9;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
  ctx.restore();
}

export function stoneBlock(ctx: Ctx, x: number, y: number, w: number, h: number, base: string, light: string, dark: string) {
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  const b = Math.min(6, w * 0.12, h * 0.12);
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - b, y + b);
  ctx.lineTo(x + b, y + b); ctx.lineTo(x + b, y + h - b); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
  ctx.lineTo(x + b, y + h - b); ctx.lineTo(x + w - b, y + h - b); ctx.lineTo(x + w - b, y + b); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,247,225,0.1)';
  ctx.fillRect(x + b, y + b, Math.max(0, w - b * 2), 1);
}

export function paintLanternGlow(ctx: Ctx, o: Obstacle) {
  const g = ctx.createRadialGradient(o.x, o.y, 10, o.x, o.y, 120);
  g.addColorStop(0, 'rgba(255,200,110,0.35)');
  g.addColorStop(1, 'rgba(255,200,110,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(o.x, o.y, 120, 0, Math.PI * 2);
  ctx.fill();
}

export function paintLantern(ctx: Ctx, o: Obstacle) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  stoneBlock(ctx, l, t, o.w, o.h, '#7d786d', '#9b968a', '#524e46');
  // Octagonal roof.
  const r = 17;
  ctx.fillStyle = '#6b665c';
  ctx.strokeStyle = '#46423b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const px = o.x + Math.cos(a) * r;
    const py = o.y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Ridges to the finial.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r);
    ctx.stroke();
  }
  // Warm light leaking out under the roof.
  const glow = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, 8);
  glow.addColorStop(0, '#fff1c4');
  glow.addColorStop(1, '#e09a3c');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(o.x, o.y, 6, 0, Math.PI * 2);
  ctx.fill();
}

export function paintVignette(ctx: Ctx) {
  const cx = WIDTH / 2;
  const cy = ARENA_MID_Y;
  const g = ctx.createRadialGradient(cx, cy, 250, cx, cy, 780);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = g;
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
}
