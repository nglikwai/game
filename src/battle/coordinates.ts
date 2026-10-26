import { MAP_SCALE, HUD_HEIGHT } from '@/config';
import { T } from '@/i18n';
import { ARENA as SCREEN_ARENA } from '@/maps';

// ---------- battlefield coordinates ----------
// Maps are designed in screen coordinates (below the HUD). The battlefield is the same
// layout scaled up by MAP_SCALE, with (0, 0) at the top-left of the map area.
export const S = MAP_SCALE;

export const toWorld = (p: { x: number; y: number }) => ({ x: p.x * S, y: (p.y - HUD_HEIGHT) * S });

export const toWorldRect = <T extends { x: number; y: number; w: number; h: number }>(o: T): T => ({ ...o, ...toWorld(o), w: o.w * S, h: o.h * S });

export const toDesign = (x: number, y: number) => ({ x: x / S, y: y / S + HUD_HEIGHT });

/** The playable area, in battlefield coordinates. */
export const ARENA = { x: SCREEN_ARENA.x * S, y: (SCREEN_ARENA.y - HUD_HEIGHT) * S, w: SCREEN_ARENA.w * S, h: SCREEN_ARENA.h * S };

export const WORLD_CENTER = { x: ARENA.x + ARENA.w / 2, y: ARENA.y + ARENA.h / 2 };
