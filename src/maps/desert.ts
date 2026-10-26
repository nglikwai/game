import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle, type TerrainZone,
} from '@/maps/common';

/**
 * 沙漠遺跡 Desert Ruins: loose sand slows you a little everywhere except on the old
 * stone floors. Quicksand pits hold rich chests; an oasis pool sits in the middle.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
/** Point-mirror (the map is the same for both sides, rotated 180°). */
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });

const FLOORS: TerrainZone[] = [
  { kind: 'floor', x: CX, y: MID, w: 320, h: 210 },
  { kind: 'floor', x: CX, y: MID, w: ARENA.w, h: 44 },
  { kind: 'floor', x: 300, y: 560, w: 150, h: 110 },
  pm({ kind: 'floor', x: 300, y: 560, w: 150, h: 110 }),
];
const QUICKSAND: TerrainZone[] = [
  { kind: 'mud', x: 340, y: 230, w: 110, h: 80 },
  pm({ kind: 'mud', x: 340, y: 230, w: 110, h: 80 }),
];
const ZONES: TerrainZone[] = [...FLOORS, ...QUICKSAND, { kind: 'sand', x: CX, y: MID, w: ARENA.w, h: ARENA.h }];

const LEFT: Obstacle[] = [
  { kind: 'palm', x: CX - 95, y: MID - 62, w: 26, h: 26 },
  { kind: 'ruin', x: 520, y: MID - 92, w: 70, h: 18 },
  { kind: 'ruin', x: 560, y: 250, w: 26, h: 26 },
  { kind: 'ruin', x: 720, y: 250, w: 26, h: 26 },
  { kind: 'statue', x: 380, y: 160, w: 40, h: 40 },
  { kind: 'ruin', x: 200, y: MID + 140, w: 18, h: 60 },
];
const OBSTACLES: Obstacle[] = [
  { kind: 'pond', low: true, x: CX, y: MID, w: 120, h: 70 },
  ...LEFT,
  ...LEFT.map(pm),
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  // Out in the quicksand: rich, but slow to reach and leave.
  { x: 340, y: 230, empty: 0.1 },
  pm({ x: 340, y: 230, empty: 0.1 }),
  // By the oasis.
  { x: CX, y: MID - 78, big: true },
  { x: CX, y: MID + 78, big: true },
  { x: 300, y: 560, empty: 0.4 },
  pm({ x: 300, y: 560, empty: 0.4 }),
];

export const DESERT: GameMap = {
  id: 'desert',
  name: 'Desert Ruins',
  zh: '沙漠遺跡',
  desc: 'Loose sand slows you a little except on the old stone floors. Quicksand pits hold rich chests.',
  descZh: '鬆軟的沙地會稍微減速，石板地除外。流沙坑裡有豐富的寶箱。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'dust',
  zones: ZONES,
  paint(ctx, rand) {
    paintSand(ctx, rand);
    for (const z of FLOORS) paintStoneFloor(ctx, z, rand);
    for (const z of QUICKSAND) paintQuicksand(ctx, z);
    paintOasis(ctx, OBSTACLES[0], rand);
    for (const o of OBSTACLES) if (o.kind !== 'pond') paintShadow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'palm') paintPalm(ctx, o, rand);
      else if (o.kind === 'ruin') paintRuin(ctx, o, rand);
      else if (o.kind === 'statue') paintStatue(ctx, o);
    }
    paintSandstoneWall(ctx);
    ctx.fillStyle = 'rgba(255,200,120,0.07)';
    ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
    paintVignette(ctx);
  },
};

function paintSand(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#d9b679';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let i = 0; i < 40; i++) {
    blob(ctx, rand() * WIDTH, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT), 50 + rand() * 80, rand() < 0.5 ? 'rgba(240,210,150,0.35)' : 'rgba(180,140,80,0.25)');
  }
  // Wind ripples.
  ctx.strokeStyle = 'rgba(150,110,60,0.25)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 160; i++) {
    const x = ARENA.x + rand() * ARENA.w;
    const y = ARENA.y + rand() * ARENA.h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 12, y - 4, x + 26, y);
    ctx.stroke();
  }
}

function paintStoneFloor(ctx: Ctx, z: TerrainZone, rand: () => number) {
  const l = z.x - z.w / 2;
  const t = z.y - z.h / 2;
  const S = 22;
  for (let y = t; y < t + z.h; y += S) {
    for (let x = l; x < l + z.w; x += S) {
      // Half-buried: some slabs are missing, swallowed by sand.
      if (rand() < 0.12) continue;
      ctx.fillStyle = `hsl(36, 30%, ${55 + rand() * 12}%)`;
      ctx.fillRect(x + 1, y + 1, Math.min(S, l + z.w - x) - 2, Math.min(S, t + z.h - y) - 2);
    }
  }
}

function paintQuicksand(ctx: Ctx, z: TerrainZone) {
  const g = ctx.createRadialGradient(z.x, z.y, 4, z.x, z.y, z.w / 2);
  g.addColorStop(0, '#8a6a3a');
  g.addColorStop(1, '#c9a26a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(z.x, z.y, z.w / 2, z.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,60,30,0.45)';
  ctx.lineWidth = 1.5;
  for (let r = 8; r < z.w / 2; r += 10) {
    ctx.beginPath();
    ctx.ellipse(z.x, z.y, r, r * (z.h / z.w), r * 0.08, 0.3, Math.PI * 1.7);
    ctx.stroke();
  }
}

function paintOasis(ctx: Ctx, o: Obstacle, rand: () => number) {
  ctx.fillStyle = '#7a9a4a';
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2 + 14, o.h / 2 + 12, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(o.x, o.y, 4, o.x, o.y, o.w / 2);
  g.addColorStop(0, '#5ec8d8');
  g.addColorStop(1, '#2a7a9a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 4; i++) blob(ctx, o.x + (rand() - 0.5) * o.w * 0.6, o.y + (rand() - 0.5) * o.h * 0.5, 10, 'rgba(255,255,255,0.2)');
}

/** A palm tree from above: a ring of long fronds around a trunk top. */
export function paintPalm(ctx: Ctx, o: Obstacle, rand: () => number) {
  ctx.fillStyle = '#7a5a34';
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.w * 0.3, 0, Math.PI * 2);
  ctx.fill();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + rand() * 0.3;
    const len = o.w * 1.3 + rand() * 8;
    ctx.strokeStyle = k % 2 ? '#3f8a3a' : '#2f6e2c';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.quadraticCurveTo(o.x + Math.cos(a) * len * 0.6, o.y + Math.sin(a) * len * 0.6 - 6, o.x + Math.cos(a) * len, o.y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#5a3a1e';
  ctx.beginPath();
  ctx.arc(o.x, o.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

function paintRuin(ctx: Ctx, o: Obstacle, rand: () => number) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  ctx.fillStyle = '#b8935a';
  ctx.fillRect(l, t, o.w, o.h);
  ctx.fillStyle = '#d9b679';
  ctx.fillRect(l + 2, t + 2, o.w - 4, o.h * 0.4);
  ctx.strokeStyle = 'rgba(90,60,30,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(l, t, o.w, o.h);
  // Cracks and a broken corner.
  ctx.beginPath();
  ctx.moveTo(l + rand() * o.w, t);
  ctx.lineTo(o.x, o.y);
  ctx.lineTo(l + rand() * o.w, t + o.h);
  ctx.stroke();
  blob(ctx, l + o.w, t, 6, '#d9b679');
}

/** A weathered stone lion guarding the ruins. */
function paintStatue(ctx: Ctx, o: Obstacle) {
  ctx.fillStyle = '#9a7a4a';
  ctx.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
  ctx.fillStyle = '#c9a26a';
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.w * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a6a3a';
  ctx.lineWidth = 2;
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(o.x + Math.cos(a) * 8, o.y + Math.sin(a) * 8);
    ctx.lineTo(o.x + Math.cos(a) * 14, o.y + Math.sin(a) * 14);
    ctx.stroke();
  }
  ctx.fillStyle = '#5a3a1e';
  ctx.beginPath();
  ctx.arc(o.x - 4, o.y - 2, 2, 0, Math.PI * 2);
  ctx.arc(o.x + 4, o.y - 2, 2, 0, Math.PI * 2);
  ctx.fill();
}

function paintSandstoneWall(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#a8804a';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.strokeStyle = 'rgba(90,60,30,0.5)';
  ctx.lineWidth = 1;
  for (let x = 0; x < WIDTH; x += 30) {
    ctx.strokeRect(x, top, 30, WALL);
    ctx.strokeRect(x + 15, HEIGHT - WALL, 30, WALL);
  }
  for (let y = top; y < HEIGHT; y += 30) {
    ctx.strokeRect(0, y, WALL, 30);
    ctx.strokeRect(WIDTH - WALL, y + 15, WALL, 30);
  }
  ctx.strokeStyle = '#6a4a24';
  ctx.lineWidth = 2;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
