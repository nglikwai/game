import { ARENA, mulberry32, type Ctx, type GameMap } from '@/maps/common';

type Point = { x: number; y: number };
type Rect = Point & { w: number; h: number };
/** Boundary → movable center → boundary. Increasing anchors preserve the map's paths. */
type Axis = readonly [number, number, number];
export interface MapLayout {
  seed: number;
  x: Axis;
  y: Axis;
}

const X: Axis = [ARENA.x, ARENA.x + ARENA.w / 2, ARENA.x + ARENA.w];
const Y: Axis = [ARENA.y, ARENA.y + ARENA.h / 2, ARENA.y + ARENA.h];

function axis(value: number, from: Axis, to: Axis): number {
  if (value <= from[0] || value >= from[2]) return value;
  const i = value <= from[1] ? 0 : 1;
  return to[i] + (value - from[i]) * (to[i + 1] - to[i]) / (from[i + 1] - from[i]);
}

/** Convert a stage's authored position into this run's layout. Non-Quest maps are unchanged. */
export function layoutPoint(map: GameMap | undefined, point: Point): Point {
  const layout = map?.layout;
  return layout ? { x: axis(point.x, X, layout.x), y: axis(point.y, Y, layout.y) } : { ...point };
}

function originalPoint(layout: MapLayout, point: Point): Point {
  return { x: axis(point.x, layout.x, X), y: axis(point.y, layout.y, Y) };
}

/** Mapping all four edges keeps artwork, collision rectangles and gaps in agreement. */
export function layoutRect<T extends Rect>(map: GameMap | undefined, rect: T): T {
  const a = layoutPoint(map, { x: rect.x - rect.w / 2, y: rect.y - rect.h / 2 });
  const b = layoutPoint(map, { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
  return { ...rect, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: b.x - a.x, h: b.y - a.y };
}

/** Stable per-stage salt: one run seed produces a different layout for each stage. */
function stageSeed(id: string, seed: number): number {
  let value = seed >>> 0;
  for (const char of id) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  return value;
}

/** Paint each affine section with the same art seed, including matching bridge and tree details. */
function paintLayout(ctx: Ctx, base: GameMap, layout: MapLayout): void {
  const paint = () => base.paint(ctx, mulberry32(layout.seed));
  // The original outer border stays fixed; the four clips replace the whole playable interior.
  paint();
  for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
    const sx = (layout.x[col + 1] - layout.x[col]) / (X[col + 1] - X[col]);
    const sy = (layout.y[row + 1] - layout.y[row]) / (Y[row + 1] - Y[row]);
    ctx.save();
    ctx.beginPath();
    ctx.rect(layout.x[col], layout.y[row], layout.x[col + 1] - layout.x[col], layout.y[row + 1] - layout.y[row]);
    ctx.clip();
    ctx.translate(layout.x[col] - X[col] * sx, layout.y[row] - Y[row] * sy);
    ctx.scale(sx, sy);
    paint();
    ctx.restore();
  }
}

/**
 * Move the river, trees, gates, cover and objectives without disconnecting any passage.
 * Maximum compression is 18% horizontally and 15% vertically; the arena border is fixed.
 * This produces a fresh map object and never mutates authored maps or global quest settings.
 */
export function createQuestLayout(base: GameMap, runSeed: number): GameMap {
  const seed = stageSeed(base.id, runSeed);
  const random = mulberry32(seed);
  const offset = (max: number) => (random() < 0.5 ? -1 : 1) * max * (0.35 + random() * 0.65);
  const layout: MapLayout = { seed, x: [X[0], X[1] + offset(110), X[2]], y: [Y[0], Y[1] + offset(42), Y[2]] };
  const map: GameMap = { ...base, layout, paint: (ctx) => paintLayout(ctx, base, layout) };
  const point = (p: Point) => layoutPoint(map, p);
  const rect = <T extends Rect>(r: T) => layoutRect(map, r);
  map.obstacles = base.obstacles.map(rect);
  map.chests = base.chests.map((p) => ({ ...p, ...point(p) }));
  map.zones = base.zones?.map(rect);
  map.smokeFrom = base.smokeFrom && point(base.smokeFrom);
  if (base.flames) map.flames = { ...base.flames, spots: base.flames.spots.map(point) };
  if (base.vents) map.vents = { ...base.vents, spots: base.vents.spots.map(point) };
  map.portals = base.portals?.map((p) => ({ ...p, a: point(p.a), b: point(p.b) }));
  if (base.rollers) map.rollers = { ...base.rollers, lanes: base.rollers.lanes.map((y) => point({ x: 0, y }).y) };
  if (base.doors) map.doors = { ...base.doors, rects: base.doors.rects.map(rect) };
  if (base.kegs) map.kegs = { ...base.kegs, spots: base.kegs.spots.map(point) };
  if (base.bell) map.bell = { ...base.bell, ...point(base.bell) };
  if (base.herbs) map.herbs = { ...base.herbs, spots: base.herbs.spots.map(point) };
  if (base.route) map.route = (fx, fy, tx, ty) => {
    const from = originalPoint(layout, { x: fx, y: fy });
    const to = originalPoint(layout, { x: tx, y: ty });
    const waypoint = base.route!(from.x, from.y, to.x, to.y);
    return waypoint && point(waypoint);
  };
  return map;
}
