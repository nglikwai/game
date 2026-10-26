import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle, type TerrainZone,
} from '@/maps/common';

/**
 * 風之谷 Wind Canyon: gusts blow through the canyon in bands, pushing anyone inside
 * them up, down or sideways. Ride a gust to close in fast, or fight against it.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });
/** Point-mirroring a wind zone also turns its push around. */
const pmWind = (z: TerrainZone): TerrainZone => ({ ...pm(z), push: z.push && { x: -z.push.x, y: -z.push.y } });

const LEFT_WINDS: TerrainZone[] = [
  { kind: 'wind', x: 400, y: MID, w: 100, h: ARENA.h, push: { x: 0, y: -140 } },
  { kind: 'wind', x: CX, y: 200, w: 300, h: 60, push: { x: 115, y: 0 } },
];
const WINDS: TerrainZone[] = [...LEFT_WINDS, ...LEFT_WINDS.map(pmWind)];

const LEFT: Obstacle[] = [
  { kind: 'cliff', x: 560, y: 300, w: 50, h: 40 },
  { kind: 'cliff', x: 250, y: 650, w: 60, h: 36 },
  { kind: 'cliff', x: 300, y: 140, w: 44, h: 34 },
];
const OBSTACLES: Obstacle[] = [
  { kind: 'cliff', x: CX, y: MID, w: 120, h: 80 },
  ...LEFT,
  ...LEFT.map(pm),
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  // In the gusts: easy to reach with the wind behind you, hard to hold.
  { x: 400, y: MID - 160, empty: 0.2 },
  pm({ x: 400, y: MID - 160, empty: 0.2 }),
  { x: 400, y: MID + 160, empty: 0.4 },
  pm({ x: 400, y: MID + 160, empty: 0.4 }),
  // Sheltered behind the mesa.
  { x: CX - 100, y: MID, big: true },
  { x: CX + 100, y: MID, big: true },
];

export const CANYON: GameMap = {
  id: 'canyon',
  name: 'Wind Canyon',
  zh: '風之谷',
  desc: 'Gusts blow through the canyon in bands and push you along. Ride them to close in fast, or fight against them.',
  descZh: '峽谷中一道道強風會把人推著走。順風可以快速逼近，逆風則寸步難行。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'dust',
  zones: WINDS,
  paint(ctx, rand) {
    paintRedRock(ctx, rand);
    for (const z of WINDS) paintWindBand(ctx, z);
    for (const o of OBSTACLES) paintShadow(ctx, o);
    for (const o of OBSTACLES) paintCliff(ctx, o, rand);
    paintCanyonWall(ctx, rand);
    paintVignette(ctx);
  },
};

function paintRedRock(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#a8603a';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  // Strata: long wavy bands of lighter and darker rock.
  for (let y = ARENA.y; y < ARENA.y + ARENA.h; y += 18) {
    ctx.strokeStyle = rand() < 0.5 ? 'rgba(200,130,80,0.25)' : 'rgba(110,50,30,0.25)';
    ctx.lineWidth = 6 + rand() * 6;
    ctx.beginPath();
    for (let x = ARENA.x; x <= ARENA.x + ARENA.w; x += 40) ctx.lineTo(x, y + Math.sin(x * 0.01 + y) * 6);
    ctx.stroke();
  }
  for (let i = 0; i < 40; i++) blob(ctx, ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 20 + rand() * 40, 'rgba(90,40,20,0.2)');
}

/** A faint swept band with chevrons pointing the way the wind blows. */
function paintWindBand(ctx: Ctx, z: TerrainZone) {
  const l = z.x - z.w / 2;
  const t = z.y - z.h / 2;
  ctx.fillStyle = 'rgba(255,240,220,0.08)';
  ctx.fillRect(l, t, z.w, z.h);
  const p = z.push!;
  const len = Math.hypot(p.x, p.y) || 1;
  const ux = p.x / len;
  const uy = p.y / len;
  ctx.strokeStyle = 'rgba(255,240,220,0.3)';
  ctx.lineWidth = 3;
  const step = 60;
  const along = ux !== 0 ? z.w : z.h;
  for (let d = step / 2; d < along; d += step) {
    const cx = ux !== 0 ? l + d : z.x;
    const cy = uy !== 0 ? t + d : z.y;
    ctx.beginPath();
    ctx.moveTo(cx - ux * 8 - uy * 14, cy - uy * 8 + ux * 14);
    ctx.lineTo(cx + ux * 8, cy + uy * 8);
    ctx.lineTo(cx - ux * 8 + uy * 14, cy - uy * 8 - ux * 14);
    ctx.stroke();
  }
}

/** A red sandstone outcrop, layered. */
function paintCliff(ctx: Ctx, o: Obstacle, rand: () => number) {
  const layers = 4;
  for (let k = 0; k < layers; k++) {
    const s = 1 - k * 0.18;
    ctx.fillStyle = ['#7a3a20', '#9a4e2a', '#b8663a', '#d0844e'][k];
    ctx.beginPath();
    ctx.ellipse(o.x - k * 2, o.y - k * 3, (o.w / 2) * s + rand() * 2, (o.h / 2) * s + rand() * 2, 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintCanyonWall(ctx: Ctx, rand: () => number) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#6a2e18';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  for (let i = 0; i < 120; i++) {
    const x = rand() * WIDTH;
    const y = top + rand() * (HEIGHT - top);
    if (x > WALL && x < WIDTH - WALL && y > top + WALL && y < HEIGHT - WALL) continue;
    blob(ctx, x, y, 6 + rand() * 6, 'rgba(160,80,40,0.5)');
  }
  ctx.strokeStyle = '#3a1a0c';
  ctx.lineWidth = 2;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
