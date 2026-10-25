import { HEIGHT, HUD_HEIGHT, WIDTH } from '../config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from './common';

/**
 * 火藥庫 Powder Magazine: red powder kegs stand all over the storehouse. Hit one (with
 * a weapon or a shot) and it blows up, hurting everyone nearby and setting off any keg
 * close to it. They're rolled back in a while later.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });

const LEFT_KEGS = [
  { x: 380, y: 240 }, { x: 412, y: 262 },
  { x: 560, y: 470 }, { x: 590, y: 448 },
  { x: 300, y: 570 },
];
const KEGS = [{ x: CX, y: MID - 70 }, { x: CX, y: MID + 70 }, ...LEFT_KEGS, ...LEFT_KEGS.map(pm)];

const LEFT: Obstacle[] = [
  { kind: 'crate', x: 500, y: 160, w: 50, h: 40 },
  { kind: 'crate', x: 200, y: 580, w: 40, h: 40 },
  { kind: 'crate', x: 470, y: MID, w: 44, h: 44 },
];
const OBSTACLES: Obstacle[] = [...LEFT, ...LEFT.map(pm)];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  { x: CX, y: MID, big: true },
  { x: 350, y: 300, empty: 0.3 },
  pm({ x: 350, y: 300, empty: 0.3 }),
  { x: 500, y: 600, empty: 0.4 },
  pm({ x: 500, y: 600, empty: 0.4 }),
];

export const POWDER: GameMap = {
  id: 'powder',
  name: 'Powder Magazine',
  zh: '火藥庫',
  desc: 'Hit a red powder keg and it blows up, hurting everyone nearby and setting off kegs next to it. Lure enemies close.',
  descZh: '打中紅色火藥桶就會爆炸，傷害附近所有人，還會引爆旁邊的火藥桶。把敵人引過去吧。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'dust',
  kegs: { spots: KEGS, radius: 70, damage: 20, respawn: 14 },
  paint(ctx, rand) {
    paintStoreFloor(ctx, rand);
    for (const k of KEGS) blob(ctx, k.x, k.y, 26, 'rgba(30,20,10,0.35)');
    for (const o of OBSTACLES) paintShadow(ctx, o);
    for (const o of OBSTACLES) paintCrate(ctx, o);
    paintStoneWall(ctx);
    paintVignette(ctx);
  },
};

function paintStoreFloor(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#4a3a2a';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let x = ARENA.x; x < ARENA.x + ARENA.w; x += 24) {
    ctx.fillStyle = `hsl(28, 28%, ${22 + rand() * 6}%)`;
    ctx.fillRect(x + 1, ARENA.y, 22, ARENA.h);
  }
  // Spilled black powder trails.
  for (let i = 0; i < 30; i++) blob(ctx, ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 6 + rand() * 14, 'rgba(10,8,6,0.35)');
}

function paintCrate(ctx: Ctx, o: Obstacle) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  ctx.fillStyle = '#8a6a3a';
  ctx.fillRect(l, t, o.w, o.h);
  ctx.strokeStyle = '#4a3218';
  ctx.lineWidth = 2;
  ctx.strokeRect(l, t, o.w, o.h);
  ctx.beginPath();
  ctx.moveTo(l, t);
  ctx.lineTo(l + o.w, t + o.h);
  ctx.moveTo(l + o.w, t);
  ctx.lineTo(l, t + o.h);
  ctx.stroke();
  ctx.fillStyle = '#c0392b';
  ctx.font = 'bold 12px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('火', o.x, o.y);
}

function paintStoneWall(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#4a4440';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.strokeStyle = 'rgba(20,16,14,0.6)';
  ctx.lineWidth = 1;
  for (let x = 0; x < WIDTH; x += 28) {
    ctx.strokeRect(x, top, 28, WALL);
    ctx.strokeRect(x + 14, HEIGHT - WALL, 28, WALL);
  }
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
