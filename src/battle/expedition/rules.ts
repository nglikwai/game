import { EXPEDITION } from '@/config/expedition';

export type CampId = typeof EXPEDITION.camps[number]['id'];
export interface ExpeditionCheckpoint {
  cleared: CampId[];
  checkpoint: 'entrance' | 'fortress';
  seed: number;
}
export interface ExpeditionState extends ExpeditionCheckpoint {
  active: CampId | null;
  explored: Set<string>;
  revive: Map<number, number>;
  healingUsed: boolean;
  chargeT: number;
  charge: { x: number; y: number; warn: number; left: number; hits: Set<number> } | null;
  thornT: number;
  rallyT: number;
  rallied: boolean;
}

export const gateIsOpen = (state: Pick<ExpeditionCheckpoint, 'cleared'>) => state.cleared.includes('village') && state.cleared.includes('river');

/** Accept only valid progress; starting a retry can never import an active encounter or timers. */
export function createExpedition(saved?: ExpeditionCheckpoint): ExpeditionState {
  const ids = new Set<string>(EXPEDITION.camps.map((c) => c.id));
  const cleared = [...new Set(saved?.cleared ?? [])].filter((id) => ids.has(id) && id !== 'fortress');
  return { cleared, checkpoint: saved?.checkpoint === 'fortress' && gateIsOpen({ cleared }) ? 'fortress' : 'entrance',
    seed: saved?.seed ?? Math.floor(Math.random() * 0x100000000), active: null, explored: new Set(), revive: new Map(), healingUsed: false,
    chargeT: EXPEDITION.boss.chargeEvery, charge: null, thornT: EXPEDITION.boss.thornsEvery, rallyT: EXPEDITION.boss.rallyEvery, rallied: false };
}

export function expeditionCheckpoint(state: ExpeditionState): ExpeditionCheckpoint {
  return { cleared: [...state.cleared], checkpoint: state.checkpoint, seed: state.seed };
}

/** Clamp follow/zoom to the world. Smooth these targets at the presentation boundary. */
export function expeditionCamera(points: { x: number; y: number; vx?: number; vy?: number }[], bounds: { x: number; y: number; w: number; h: number }, view: { w: number; h: number }) {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const zoom = Math.max(0.72, Math.min(1.12, view.w / (maxX - minX + 360), view.h / (maxY - minY + 260)));
  const look = points.length === 1 ? { x: (points[0].vx ?? 0) * 0.18, y: (points[0].vy ?? 0) * 0.18 } : { x: 0, y: 0 };
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return { x: clamp((minX + maxX) / 2 + look.x, bounds.x + view.w / zoom / 2, bounds.x + bounds.w - view.w / zoom / 2),
    y: clamp((minY + maxY) / 2 + look.y, bounds.y + view.h / zoom / 2, bounds.y + bounds.h - view.h / zoom / 2), zoom };
}
