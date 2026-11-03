import type { Ctx, GameMap, Obstacle } from '@/maps/common';
import type { MapProp, MapPropSources } from '@/rendering/mapProps';

/** Map landmarks remain authored rectangles; only their visible materials are upgraded. */
export function renderedProp(o: Obstacle, map: GameMap): { kind: MapProp; w: number; h: number } | null {
  if (o.kind === 'cage') return null;
  if (o.kind === 'shrine' && o.w <= 200 && o.h <= 160) {
    const size = Math.max(o.w, o.h) * 1.45;
    return { kind: 'shrine', w: size, h: size };
  }
  if (o.w > 145 || o.h > 145) return null;
  if (o.kind === 'deadtree') {
    if (['prison', 'grove', 'snare', 'wardens'].includes(map.id)) return null;
    return { kind: 'cursed-tree', w: o.w * 2.1, h: o.h * 2.1 };
  }
  const scale = { pine: 2.25, sakura: 1.8, bamboo: 2.0, rock: 1.7, pillar: 2.7, ruin: 1.75, lantern: 2.7, crate: 2.8, barrel: 3.4 };
  if (o.kind in scale) {
    // Cedar columns are a defining feature of these maps, rather than stone monuments.
    if (o.kind === 'pillar' && ['courtyard', 'town', 'dojo'].includes(map.id)) return null;
    const kind = o.kind as keyof typeof scale;
    const size = Math.max(o.w, o.h) * scale[kind];
    return { kind, w: size, h: size };
  }
  if (o.kind === 'obsidian') return { kind: 'rock', w: o.w * 1.7, h: o.h * 1.7 };
  return null;
}

interface PaintKit { map: GameMap; sources: MapPropSources; filter: string }
const paintKits = new WeakMap<Ctx, PaintKit>();

/** Scope loaded art to one canvas paint, including the transforms used by seeded layouts. */
export function withMapProps(ctx: Ctx, map: GameMap, sources: MapPropSources, filter: string, paint: () => void) {
  const previous = paintKits.get(ctx);
  paintKits.set(ctx, { map, sources, filter });
  try { paint(); } finally {
    if (previous) paintKits.set(ctx, previous); else paintKits.delete(ctx);
  }
}

/** A prop painter can replace its body while retaining its original shadow and lighting passes. */
export function paintScenery(ctx: Ctx, o: Obstacle): boolean {
  const kit = paintKits.get(ctx);
  if (!kit) return false;
  const prop = renderedProp(o, kit.map), image = prop && kit.sources[prop.kind];
  if (!prop || !image) return false;
  ctx.save();
  ctx.filter = kit.filter;
  ctx.drawImage(image, o.x - prop.w / 2, o.y - prop.h / 2, prop.w, prop.h);
  ctx.restore();
  return true;
}
