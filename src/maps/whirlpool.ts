import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle, type TerrainZone,
} from '@/maps/common';

/**
 * 漩渦海峽 Whirlpool Strait: a shallow strait runs down the middle between two rocky
 * shores. The surf slows you, and three whirlpools drag anyone nearby into their
 * centre and spin them round.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });
const STRAIT_W = 320;

const ZONES: TerrainZone[] = [
  // Whirlpools come first so they take over from the shallows they sit in.
  { kind: 'vortex', x: CX, y: 280, w: 120, h: 120, pull: 130 },
  { kind: 'vortex', x: CX, y: 2 * MID - 280, w: 120, h: 120, pull: 130 },
  { kind: 'vortex', x: CX, y: MID, w: 100, h: 100, pull: 110 },
  { kind: 'shallows', x: CX, y: MID, w: STRAIT_W, h: ARENA.h },
];

const LEFT: Obstacle[] = [
  { kind: 'rock', x: 380, y: 230, w: 50, h: 36 },
  { kind: 'rock', x: 320, y: 560, w: 46, h: 34 },
  { kind: 'rock', x: CX - STRAIT_W / 2 - 10, y: 160, w: 40, h: 30 },
];
const OBSTACLES: Obstacle[] = [...LEFT, ...LEFT.map(pm)];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  // Spinning in the whirlpools' pull.
  { x: CX - 100, y: MID, big: true },
  { x: CX + 100, y: MID, big: true },
  { x: 400, y: MID, empty: 0.3 },
  pm({ x: 400, y: MID, empty: 0.3 }),
];

export const WHIRLPOOL: GameMap = {
  id: 'whirlpool',
  name: 'Whirlpool Strait',
  zh: '漩渦海峽',
  desc: 'A shallow strait runs down the middle; three whirlpools drag anyone nearby into their centre and spin them round.',
  descZh: '中央是一道淺海峽，三個漩渦會把附近的人捲向中心並旋轉。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'mist',
  zones: ZONES,
  paint(ctx, rand) {
    paintShores(ctx, rand);
    paintStrait(ctx, rand);
    for (const z of ZONES) if (z.kind === 'vortex') paintWhirlpool(ctx, z);
    for (const o of OBSTACLES) blob(ctx, o.x + 5, o.y + 7, o.w * 0.55, 'rgba(0,0,0,0.25)');
    for (const o of OBSTACLES) paintShoreRock(ctx, o);
    paintCliffs(ctx);
    paintVignette(ctx);
  },
};

function paintShores(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#6a6458';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let i = 0; i < 70; i++) {
    blob(ctx, rand() * WIDTH, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT), 20 + rand() * 50, rand() < 0.5 ? 'rgba(130,124,110,0.4)' : 'rgba(60,56,50,0.35)');
  }
}

function paintStrait(ctx: Ctx, rand: () => number) {
  const l = CX - STRAIT_W / 2;
  const g = ctx.createLinearGradient(l, 0, l + STRAIT_W, 0);
  g.addColorStop(0, '#5ac0d0');
  g.addColorStop(0.5, '#2a8ab0');
  g.addColorStop(1, '#5ac0d0');
  ctx.fillStyle = g;
  ctx.fillRect(l, ARENA.y, STRAIT_W, ARENA.h);
  // Foam along both shores.
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  for (const x0 of [l, l + STRAIT_W]) {
    ctx.beginPath();
    for (let y = ARENA.y; y <= ARENA.y + ARENA.h; y += 10) ctx.lineTo(x0 + Math.sin(y * 0.06) * 4, y);
    ctx.stroke();
  }
  for (let i = 0; i < 30; i++) blob(ctx, l + rand() * STRAIT_W, ARENA.y + rand() * ARENA.h, 8 + rand() * 10, 'rgba(255,255,255,0.12)');
}

/** A whirlpool's dark eye and foam rings (the turning arms are drawn live). */
function paintWhirlpool(ctx: Ctx, z: TerrainZone) {
  const r = z.w / 2;
  const g = ctx.createRadialGradient(z.x, z.y, 2, z.x, z.y, r);
  g.addColorStop(0, '#0a2a4a');
  g.addColorStop(0.6, '#1a5a8a');
  g.addColorStop(1, 'rgba(42,138,176,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(z.x, z.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.5;
  for (const k of [0.35, 0.6, 0.85]) {
    ctx.beginPath();
    ctx.arc(z.x, z.y, r * k, k * 3, k * 3 + Math.PI * 1.4);
    ctx.stroke();
  }
}

function paintShoreRock(ctx: Ctx, o: Obstacle) {
  const g = ctx.createRadialGradient(o.x - 6, o.y - 6, 2, o.x, o.y, o.w * 0.6);
  g.addColorStop(0, '#9a948a');
  g.addColorStop(1, '#4a4640');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function paintCliffs(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#3a3630';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.fillStyle = '#2a8ab0';
  ctx.fillRect(CX - STRAIT_W / 2, top, STRAIT_W, WALL);
  ctx.fillRect(CX - STRAIT_W / 2, HEIGHT - WALL, STRAIT_W, WALL);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
