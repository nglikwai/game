import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from '@/maps/common';

/**
 * 開合神殿 Sliding Door Temple: shoji doors slide open and shut in two sets that take
 * turns, so the rooms and corridors keep changing. An open door's track flashes red
 * just before it slides shut (anyone in the way is pushed out).
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });

const LEFT_DOORS = [
  { x: 430, y: 200, w: 16, h: 120, group: 0 },
  { x: 430, y: MID, w: 16, h: 100, group: 1 },
  { x: 430, y: 2 * MID - 200, w: 16, h: 120, group: 0 },
  { x: 560, y: 300, w: 120, h: 16, group: 1 },
  { x: 720, y: 300, w: 120, h: 16, group: 0 },
];
const DOORS = [...LEFT_DOORS, ...LEFT_DOORS.map(pm)];

const LEFT: Obstacle[] = [
  { kind: 'post', x: 430, y: 275, w: 20, h: 20 },
  { kind: 'post', x: 430, y: 2 * MID - 275, w: 20, h: 20 },
  { kind: 'post', x: 640 - 160, y: 300, w: 20, h: 20 },
];
const OBSTACLES: Obstacle[] = [
  { kind: 'shrine', x: CX, y: MID, w: 80, h: 60 },
  ...LEFT,
  ...LEFT.map(pm),
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  { x: CX - 80, y: MID, big: true },
  { x: CX + 80, y: MID, big: true },
  { x: 500, y: 200, empty: 0.3 },
  pm({ x: 500, y: 200, empty: 0.3 }),
];

export const DOORS_MAP: GameMap = {
  id: 'doors',
  name: 'Sliding Door Temple',
  zh: '開合神殿',
  desc: 'Shoji doors slide open and shut in two sets that take turns, so the paths keep changing. Red tracks are about to close.',
  descZh: '紙拉門分成兩組輪流開關，路線不斷改變。軌道閃紅光代表門即將關上。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'petals',
  doors: { rects: DOORS, period: 4, warn: 1 },
  paint(ctx, rand) {
    paintTatami(ctx, rand);
    for (const o of OBSTACLES) paintShadow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'post') paintPost(ctx, o);
      else if (o.kind === 'shrine') paintAltarBox(ctx, o);
    }
    paintTempleWall(ctx);
    paintVignette(ctx);
  },
};

function paintTatami(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#b8a86a';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  const TW = 96;
  const TH = 48;
  for (let row = 0, y = ARENA.y; y < ARENA.y + ARENA.h; row++, y += TH) {
    for (let x = ARENA.x - (row % 2 ? TW / 2 : 0); x < ARENA.x + ARENA.w; x += TW) {
      ctx.fillStyle = `hsl(55, 30%, ${52 + rand() * 6}%)`;
      ctx.fillRect(x + 1, y + 1, TW - 2, TH - 2);
      ctx.strokeStyle = '#3a4a2a';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, TW - 2, TH - 2);
    }
  }
  for (let i = 0; i < 20; i++) blob(ctx, ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 30, 'rgba(255,240,200,0.08)');
}

function paintPost(ctx: Ctx, o: Obstacle) {
  ctx.fillStyle = '#4a2e18';
  ctx.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
  ctx.fillStyle = '#6a4424';
  ctx.fillRect(o.x - o.w / 2 + 3, o.y - o.h / 2 + 3, o.w - 6, o.h - 6);
}

function paintAltarBox(ctx: Ctx, o: Obstacle) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  ctx.fillStyle = '#2a1a10';
  ctx.fillRect(l - 4, t - 4, o.w + 8, o.h + 8);
  ctx.fillStyle = '#8a1a1e';
  ctx.fillRect(l, t, o.w, o.h);
  ctx.fillStyle = '#d9ae4a';
  ctx.fillRect(l + 6, o.y - 3, o.w - 12, 6);
  ctx.beginPath();
  ctx.arc(o.x, o.y, 9, 0, Math.PI * 2);
  ctx.fill();
}

function paintTempleWall(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#4a2e18';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.fillStyle = '#f2ead8';
  for (let x = 6; x < WIDTH - 20; x += 40) {
    ctx.fillRect(x, top + 4, 34, WALL - 8);
    ctx.fillRect(x, HEIGHT - WALL + 4, 34, WALL - 8);
  }
  ctx.strokeStyle = '#d9ae4a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
