import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from '@/maps/common';

/**
 * 水晶洞窟 Crystal Cave: glowing crystal clusters bounce shots off them instead of
 * stopping them, so arrows and fireballs can be banked around corners. Stalagmites
 * still stop shots as usual.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });

const LEFT: Obstacle[] = [
  { kind: 'crystal', x: 480, y: 300, w: 40, h: 40 },
  { kind: 'crystal', x: 480, y: 512, w: 40, h: 40 },
  { kind: 'crystal', x: 330, y: MID, w: 30, h: 70 },
  { kind: 'crystal', x: 600, y: 180, w: 36, h: 36 },
  { kind: 'rock', x: 560, y: 610, w: 40, h: 30 },
  { kind: 'rock', x: 250, y: 200, w: 36, h: 28 },
];
const OBSTACLES: Obstacle[] = [
  { kind: 'crystal', x: CX, y: MID, w: 60, h: 60 },
  ...LEFT,
  ...LEFT.map(pm),
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  { x: CX, y: MID - 90, big: true },
  { x: CX, y: MID + 90, big: true },
  { x: 400, y: MID, empty: 0.3 },
  pm({ x: 400, y: MID, empty: 0.3 }),
];

export const CRYSTAL: GameMap = {
  id: 'crystal',
  name: 'Crystal Cave',
  zh: '水晶洞窟',
  desc: 'Glowing crystals bounce shots off them instead of stopping them; bank your arrows around corners.',
  descZh: '發光的水晶會把飛行道具反彈回去，而不是擋下來。可以利用反彈繞過障礙攻擊。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'wisps',
  paint(ctx, rand) {
    paintCaveFloor(ctx, rand);
    for (const o of OBSTACLES) if (o.kind === 'crystal') paintCrystalGlow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'crystal') paintCrystal(ctx, o, rand);
      else if (o.kind === 'rock') paintStalagmite(ctx, o);
    }
    paintCaveBorder(ctx, rand);
    paintVignette(ctx);
  },
};

function paintCaveFloor(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#1e2030';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let i = 0; i < 70; i++) {
    blob(ctx, rand() * WIDTH, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT), 30 + rand() * 60, rand() < 0.5 ? 'rgba(50,56,80,0.4)' : 'rgba(10,12,20,0.4)');
  }
  // Glowing mushrooms and specks of crystal dust.
  for (let i = 0; i < 40; i++) {
    const x = ARENA.x + rand() * ARENA.w;
    const y = ARENA.y + rand() * ARENA.h;
    blob(ctx, x, y, 8, 'rgba(110,200,255,0.12)');
    ctx.fillStyle = rand() < 0.5 ? '#6ad8ff' : '#b88aff';
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintCrystalGlow(ctx: Ctx, o: Obstacle) {
  const r = Math.max(o.w, o.h) * 1.4;
  const g = ctx.createRadialGradient(o.x, o.y, 4, o.x, o.y, r);
  g.addColorStop(0, 'rgba(120,220,255,0.35)');
  g.addColorStop(1, 'rgba(120,220,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(o.x - r, o.y - r, r * 2, r * 2);
}

/** A cluster of faceted crystals, light on one face and dark on the other. */
function paintCrystal(ctx: Ctx, o: Obstacle, rand: () => number) {
  const n = 4 + Math.floor(rand() * 3);
  for (let k = 0; k < n; k++) {
    const cx = o.x + (rand() - 0.5) * o.w * 0.6;
    const cy = o.y + (rand() - 0.5) * o.h * 0.6;
    const a = rand() * Math.PI * 2;
    const len = Math.min(o.w, o.h) * (0.35 + rand() * 0.3);
    const wd = len * 0.35;
    const tipX = cx + Math.cos(a) * len;
    const tipY = cy + Math.sin(a) * len;
    const px = -Math.sin(a) * wd;
    const py = Math.cos(a) * wd;
    const purple = rand() < 0.35;
    ctx.fillStyle = purple ? '#b88aff' : '#7ad8ff';
    ctx.beginPath();
    ctx.moveTo(cx + px, cy + py);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(cx, cy);
    ctx.fill();
    ctx.fillStyle = purple ? '#6a4ab8' : '#2a8ab8';
    ctx.beginPath();
    ctx.moveTo(cx - px, cy - py);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(cx, cy);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(220,250,255,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
}

function paintStalagmite(ctx: Ctx, o: Obstacle) {
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = ['#2a2a34', '#3a3a46', '#4a4a58', '#5a5a6a'][k];
    ctx.beginPath();
    ctx.ellipse(o.x - k, o.y - k * 2, (o.w / 2) * (1 - k * 0.22), (o.h / 2) * (1 - k * 0.22), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintCaveBorder(ctx: Ctx, rand: () => number) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#12131c';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  for (let i = 0; i < 60; i++) {
    const x = rand() * WIDTH;
    const y = top + rand() * (HEIGHT - top);
    if (x > WALL && x < WIDTH - WALL && y > top + WALL && y < HEIGHT - WALL) continue;
    ctx.fillStyle = rand() < 0.5 ? 'rgba(110,200,255,0.5)' : 'rgba(180,140,255,0.5)';
    ctx.fillRect(x, y, 3, 3);
  }
  ctx.strokeStyle = 'rgba(120,200,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
