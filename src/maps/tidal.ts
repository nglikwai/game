import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle, type TerrainZone,
} from '@/maps/common';

/**
 * 潮汐海岸 Tidal Flats: the tide comes in and goes out. When it rises, the flats along
 * the top and bottom flood and slow everyone down; the sandbar in the middle stays dry.
 * The water shimmers just before it comes in.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const TOP = ARENA.y;
const BOTTOM = ARENA.y + ARENA.h;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });
const SEA = 36;
const FLAT = 120;

const TIDES: TerrainZone[] = [
  { kind: 'tide', x: CX, y: TOP + SEA + FLAT / 2, w: ARENA.w, h: FLAT },
  { kind: 'tide', x: CX, y: BOTTOM - SEA - FLAT / 2, w: ARENA.w, h: FLAT },
];

const LEFT: Obstacle[] = [
  { kind: 'rock', x: 420, y: MID, w: 50, h: 36 },
  { kind: 'rock', x: 330, y: 210, w: 44, h: 30 },
  { kind: 'pond', low: true, x: 560, y: 480, w: 70, h: 40 },
  { kind: 'reed', x: 250, y: 330, w: 28, h: 28 },
];
const OBSTACLES: Obstacle[] = [
  { kind: 'sea', low: true, x: CX, y: TOP + SEA / 2, w: ARENA.w, h: SEA },
  { kind: 'sea', low: true, x: CX, y: BOTTOM - SEA / 2, w: ARENA.w, h: SEA },
  { kind: 'rock', x: CX, y: MID, w: 70, h: 44 },
  ...LEFT,
  ...LEFT.map(pm),
];

const corner = (x: number, y: number): ChestSpot[] => [{ x, y, empty: 0.6 }, { x: x + (x < CX ? 40 : -40), y, empty: 0.6 }];
const CHESTS: ChestSpot[] = [
  // Corner piles out on the flats: easy at low tide, slow to reach at high tide.
  ...corner(ARENA.x + 26, TOP + SEA + 30), ...corner(ARENA.x + ARENA.w - 26, TOP + SEA + 30),
  ...corner(ARENA.x + 26, BOTTOM - SEA - 30), ...corner(ARENA.x + ARENA.w - 26, BOTTOM - SEA - 30),
  { x: CX, y: TOP + SEA + 40, big: true },
  { x: CX, y: BOTTOM - SEA - 40, big: true },
  { x: 500, y: MID, empty: 0.3 },
  pm({ x: 500, y: MID, empty: 0.3 }),
];

export const TIDAL: GameMap = {
  id: 'tidal',
  name: 'Tidal Flats',
  zh: '潮汐海岸',
  desc: 'The tide comes and goes: the flats at the top and bottom flood and slow you; the middle sandbar stays dry.',
  descZh: '潮水漲漲退退：漲潮時上下兩側的灘地會淹水減速，中間的沙洲始終乾燥。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'mist',
  zones: TIDES,
  tideCycle: { period: 7, warn: 2 },
  paint(ctx, rand) {
    paintFlats(ctx, rand);
    paintSeaEdge(ctx);
    for (const o of OBSTACLES) if (o.kind === 'pond') paintPool(ctx, o);
    for (const o of OBSTACLES) if (o.kind === 'rock') blob(ctx, o.x + 5, o.y + 7, o.w * 0.55, 'rgba(0,0,0,0.25)');
    for (const o of OBSTACLES) {
      if (o.kind === 'rock') paintRock(ctx, o);
      else if (o.kind === 'reed') paintSeaweed(ctx, o, rand);
    }
    paintSeawall(ctx);
    paintVignette(ctx);
  },
};

function paintFlats(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#d8c49a';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  // Wet, darker sand on the flats; dry sandbar in the middle.
  for (const z of TIDES) {
    ctx.fillStyle = '#b8a47a';
    ctx.fillRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h);
    ctx.strokeStyle = 'rgba(120,100,70,0.35)';
    ctx.lineWidth = 1;
    for (let y = z.y - z.h / 2 + 8; y < z.y + z.h / 2; y += 10) {
      ctx.beginPath();
      for (let x = ARENA.x; x <= ARENA.x + ARENA.w; x += 20) ctx.lineTo(x, y + Math.sin(x * 0.04 + y) * 2);
      ctx.stroke();
    }
  }
  for (let i = 0; i < 40; i++) blob(ctx, ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 3, rand() < 0.5 ? '#fff4e0' : '#e8a090');
}

function paintSeaEdge(ctx: Ctx) {
  for (const [y0, dir] of [[TOP, 1], [BOTTOM, -1]] as const) {
    const g = ctx.createLinearGradient(0, y0, 0, y0 + dir * SEA);
    g.addColorStop(0, '#1e6a9a');
    g.addColorStop(1, '#3aa8c8');
    ctx.fillStyle = g;
    ctx.fillRect(ARENA.x, dir > 0 ? y0 : y0 - SEA, ARENA.w, SEA);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = ARENA.x; x <= ARENA.x + ARENA.w; x += 12) ctx.lineTo(x, y0 + dir * (SEA + Math.sin(x * 0.05) * 3));
    ctx.stroke();
  }
}

function paintPool(ctx: Ctx, o: Obstacle) {
  ctx.fillStyle = '#8a8070';
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2 + 6, o.h / 2 + 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4ab8c8';
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

function paintRock(ctx: Ctx, o: Obstacle) {
  ctx.fillStyle = '#5a5a54';
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Barnacles.
  for (let k = 0; k < 6; k++) blob(ctx, o.x + Math.cos(k) * o.w * 0.3, o.y + Math.sin(k * 1.7) * o.h * 0.3, 2.5, '#d8d0c0');
}

function paintSeaweed(ctx: Ctx, o: Obstacle, rand: () => number) {
  for (let k = 0; k < 10; k++) {
    const x = o.x + (rand() - 0.5) * o.w;
    const y = o.y + (rand() - 0.5) * o.h;
    ctx.strokeStyle = rand() < 0.5 ? '#3a6a3a' : '#5a7a2a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 6, y - 6, x + (rand() - 0.5) * 8, y - 14);
    ctx.stroke();
  }
}

function paintSeawall(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#1e5a8a';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillStyle = '#6a6a64';
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.strokeStyle = 'rgba(30,30,28,0.5)';
  ctx.lineWidth = 1;
  for (let y = top; y < HEIGHT; y += 20) {
    ctx.strokeRect(0, y, WALL, 20);
    ctx.strokeRect(WIDTH - WALL, y + 10, WALL, 20);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
