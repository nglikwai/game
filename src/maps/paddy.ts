import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle, type TerrainZone,
} from '@/maps/common';

/**
 * 稻田村莊 Rice Paddy Village: flooded paddies (mud, slow going) between raised
 * dirt paths, a thatched farmhouse in the middle, scarecrows in the fields.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const COLS = [[220, 400], [470, 590], [690, 810], [880, 1060]];
const ROWS = [[150, 370], [442, 662]];

const PADDIES: TerrainZone[] = COLS.flatMap(([x0, x1]) =>
  ROWS.map(([y0, y1]) => ({ kind: 'mud' as const, x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 })),
);

const OBSTACLES: Obstacle[] = [
  { kind: 'farmhouse', x: CX, y: MID, w: 100, h: 70 },
  { kind: 'scarecrow', x: 530, y: 260, w: 18, h: 18 },
  { kind: 'scarecrow', x: WIDTH - 530, y: 2 * MID - 260, w: 18, h: 18 },
  { kind: 'scarecrow', x: 310, y: 2 * MID - 230, w: 18, h: 18 },
  { kind: 'scarecrow', x: WIDTH - 310, y: 230, w: 18, h: 18 },
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1),
  ...cornerPile(-1, 1),
  ...cornerPile(1, -1),
  ...cornerPile(-1, -1),
  // Out in the mud: rich, but slow to reach and slow to escape from.
  { x: 310, y: 290, empty: 0.15 },
  { x: WIDTH - 310, y: 2 * MID - 290, empty: 0.15 },
  { x: 530, y: 2 * MID - 220, empty: 0.15 },
  { x: WIDTH - 530, y: 220, empty: 0.15 },
  // Where the paths cross.
  { x: 435, y: MID },
  { x: WIDTH - 435, y: MID },
  // Big ones on the central path.
  { x: CX, y: ARENA.y + 40, big: true },
  { x: CX, y: ARENA.y + ARENA.h - 40, big: true },
];

export const PADDY: GameMap = {
  id: 'paddy',
  name: 'Rice Paddy Village',
  zh: '稻田村莊',
  desc: 'Muddy paddies slow you to half speed; stick to the dirt paths. Rich chests sit in the mud.',
  descZh: '泥濘的稻田會讓速度減半，走田埂比較快。泥田裡的寶箱較豐富。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'leaves',
  zones: PADDIES,
  paint(ctx, rand) {
    paintPaths(ctx, rand);
    for (const z of PADDIES) paintPaddy(ctx, z, rand);
    for (const o of OBSTACLES) paintShadow(ctx, o);
    paintFarmhouse(ctx, OBSTACLES[0]);
    for (const o of OBSTACLES) if (o.kind === 'scarecrow') paintScarecrow(ctx, o);
    paintStrawFence(ctx);
    // Late-afternoon warmth.
    ctx.fillStyle = 'rgba(255,190,90,0.08)';
    ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
    paintVignette(ctx);
  },
};

function paintPaths(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#9a7a4e';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let i = 0; i < 50; i++) {
    blob(ctx, rand() * WIDTH, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT), 30 + rand() * 60, rand() < 0.5 ? 'rgba(170,140,95,0.35)' : 'rgba(110,85,55,0.3)');
  }
  // Pebbles and grass on the path edges.
  for (let i = 0; i < 700; i++) {
    const x = rand() * WIDTH;
    const y = HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT);
    ctx.fillStyle = rand() < 0.6 ? 'rgba(80,60,40,0.4)' : 'rgba(110,150,70,0.6)';
    ctx.fillRect(x, y, 2, 2);
  }
}

function paintPaddy(ctx: Ctx, z: TerrainZone, rand: () => number) {
  const l = z.x - z.w / 2;
  const t = z.y - z.h / 2;
  // Raised grassy bank, then muddy water.
  ctx.fillStyle = '#6f8a44';
  ctx.beginPath();
  ctx.roundRect(l - 4, t - 4, z.w + 8, z.h + 8, 8);
  ctx.fill();
  const g = ctx.createLinearGradient(l, t, l + z.w, t + z.h);
  g.addColorStop(0, '#5b5a3c');
  g.addColorStop(1, '#4a4a32');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(l, t, z.w, z.h, 6);
  ctx.fill();
  // Sky reflections on the water.
  for (let i = 0; i < 4; i++) blob(ctx, l + rand() * z.w, t + rand() * z.h, 20 + rand() * 30, 'rgba(170,200,220,0.18)');
  // Rows of rice seedlings.
  for (let y = t + 10; y < t + z.h - 6; y += 14) {
    for (let x = l + 8 + ((y / 14) % 2) * 6; x < l + z.w - 6; x += 12) {
      ctx.strokeStyle = rand() < 0.5 ? '#8fc04a' : '#6fa03a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y + 3);
      ctx.lineTo(x - 2, y - 3);
      ctx.moveTo(x, y + 3);
      ctx.lineTo(x + 2, y - 3);
      ctx.stroke();
    }
  }
}

/** Thatched-roof farmhouse seen from above. */
function paintFarmhouse(ctx: Ctx, o: Obstacle) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  ctx.fillStyle = '#6b4a24';
  ctx.beginPath();
  ctx.roundRect(l - 8, t - 8, o.w + 16, o.h + 16, 10);
  ctx.fill();
  const g = ctx.createLinearGradient(0, t, 0, t + o.h);
  g.addColorStop(0, '#d9b86a');
  g.addColorStop(0.5, '#b8964a');
  g.addColorStop(1, '#d9b86a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(l - 2, t - 2, o.w + 4, o.h + 4, 8);
  ctx.fill();
  // Straw texture and the ridge.
  ctx.strokeStyle = 'rgba(110,80,30,0.45)';
  ctx.lineWidth = 1;
  for (let x = l + 3; x < l + o.w; x += 4) {
    ctx.beginPath();
    ctx.moveTo(x, t);
    ctx.lineTo(x + 2, o.y - 3);
    ctx.moveTo(x, o.y + 3);
    ctx.lineTo(x + 2, t + o.h);
    ctx.stroke();
  }
  ctx.fillStyle = '#4a3218';
  ctx.fillRect(l - 4, o.y - 4, o.w + 8, 8);
  // Smoke hole.
  ctx.fillStyle = '#2a1a0c';
  ctx.fillRect(o.x - 6, o.y - 4, 12, 8);
}

function paintScarecrow(ctx: Ctx, o: Obstacle) {
  blob(ctx, o.x + 4, o.y + 6, 16, 'rgba(0,0,0,0.4)');
  // Crossed arms with a ragged coat, straw hat on top.
  ctx.strokeStyle = '#6b4224';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(o.x - 16, o.y);
  ctx.lineTo(o.x + 16, o.y);
  ctx.stroke();
  ctx.fillStyle = '#8f2a20';
  ctx.fillRect(o.x - 8, o.y - 5, 16, 10);
  ctx.fillStyle = '#d9b86a';
  ctx.beginPath();
  ctx.arc(o.x, o.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a6a2a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(o.x, o.y, 5, 0, Math.PI * 2);
  ctx.stroke();
}

/** Woven straw fence around the village fields. */
function paintStrawFence(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#8a6a32';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.strokeStyle = 'rgba(60,40,15,0.6)';
  ctx.lineWidth = 1.5;
  for (let x = 0; x < WIDTH; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, top + 2);
    ctx.lineTo(x + 4, top + WALL - 2);
    ctx.moveTo(x, HEIGHT - WALL + 2);
    ctx.lineTo(x + 4, HEIGHT - 2);
    ctx.stroke();
  }
  for (let y = top; y < HEIGHT; y += 6) {
    ctx.beginPath();
    ctx.moveTo(2, y);
    ctx.lineTo(WALL - 2, y + 4);
    ctx.moveTo(WIDTH - WALL + 2, y);
    ctx.lineTo(WIDTH - 2, y + 4);
    ctx.stroke();
  }
  ctx.strokeStyle = '#4a3218';
  ctx.lineWidth = 3;
  ctx.strokeRect(WALL - 1.5, top + WALL - 1.5, WIDTH - WALL * 2 + 3, HEIGHT - top - WALL * 2 + 3);
}
