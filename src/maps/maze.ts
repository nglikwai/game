import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from '@/maps/common';

/**
 * 竹林迷宮 Bamboo Maze: corridors of dense bamboo. Short sight lines, ambushes at
 * every corner, and shots stop at the walls. The richest chest sits in the central room.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });
const wall = (x: number, y: number, w: number, h: number): Obstacle => ({ kind: 'bamboo', x, y, w, h });

const LEFT: Obstacle[] = [
  wall(330, 205, 18, 150),
  wall(395, 288, 146, 18),
  wall(560, 170, 18, 112),
  wall(560, MID, 18, 140),
  wall(400, 470, 18, 120),
  wall(330, 600, 140, 18),
  wall(230, MID, 18, 60),
  // The central room's top wall (its bottom wall is this one mirrored).
  wall(CX, 300, 120, 18),
  wall(170, 520, 18, 70),
];
const OBSTACLES: Obstacle[] = [...LEFT, ...LEFT.map(pm)];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  // Dead ends and pockets.
  { x: 365, y: 240, empty: 0.3 },
  pm({ x: 365, y: 240, empty: 0.3 }),
  { x: 450, y: 520, empty: 0.4 },
  pm({ x: 450, y: 520, empty: 0.4 }),
  // The central room.
  { x: CX, y: MID, big: true },
];

export const MAZE: GameMap = {
  id: 'maze',
  name: 'Bamboo Maze',
  zh: '竹林迷宮',
  desc: 'Corridors of dense bamboo: short sight lines, ambushes at every corner. The big chest waits in the central room.',
  descZh: '茂密竹林形成的迷宮，視野短，轉角處處是埋伏。大寶箱在中央的房間裡。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'leaves',
  paint(ctx, rand) {
    paintPath(ctx, rand);
    for (const o of OBSTACLES) paintShadow(ctx, o);
    for (const o of OBSTACLES) paintBambooWall(ctx, o, rand);
    paintBambooBorder(ctx, rand);
    paintVignette(ctx);
  },
};

function paintPath(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#5a5a34';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let i = 0; i < 60; i++) {
    blob(ctx, rand() * WIDTH, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT), 30 + rand() * 50, rand() < 0.5 ? 'rgba(90,110,50,0.4)' : 'rgba(110,90,50,0.35)');
  }
  // Fallen bamboo leaves.
  for (let i = 0; i < 500; i++) {
    const x = ARENA.x + rand() * ARENA.w;
    const y = ARENA.y + rand() * ARENA.h;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand() * Math.PI);
    ctx.fillStyle = rand() < 0.6 ? 'rgba(160,170,80,0.55)' : 'rgba(120,150,60,0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** A hedge of bamboo stalks seen from above: green rings packed tight, leaves on top. */
function paintBambooWall(ctx: Ctx, o: Obstacle, rand: () => number) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  ctx.fillStyle = '#1e3a1a';
  ctx.fillRect(l - 2, t - 2, o.w + 4, o.h + 4);
  const n = Math.max(3, Math.round((o.w * o.h) / 60));
  for (let k = 0; k < n; k++) {
    const x = l + 4 + rand() * (o.w - 8);
    const y = t + 4 + rand() * (o.h - 8);
    const r = 3 + rand() * 2;
    ctx.fillStyle = rand() < 0.5 ? '#6aa84a' : '#4a8a3a';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d9e89a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(x, y, r - 1, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let k = 0; k < n / 2; k++) {
    ctx.save();
    ctx.translate(l + rand() * o.w, t + rand() * o.h);
    ctx.rotate(rand() * Math.PI);
    ctx.fillStyle = 'rgba(120,180,80,0.8)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function paintBambooBorder(ctx: Ctx, rand: () => number) {
  const top = HUD_HEIGHT;
  for (const [x, y, w, h] of [[0, top, WIDTH, WALL], [0, HEIGHT - WALL, WIDTH, WALL], [0, top, WALL, HEIGHT - top], [WIDTH - WALL, top, WALL, HEIGHT - top]]) {
    paintBambooWall(ctx, { kind: 'bamboo', x: x + w / 2, y: y + h / 2, w, h }, rand);
  }
  ctx.strokeStyle = '#2a4a1e';
  ctx.lineWidth = 2;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
