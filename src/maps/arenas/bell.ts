import { paintScenery } from '@/maps/art/renderedProps';
import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintLantern, paintLanternGlow, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from '@/maps/common';

/**
 * 大鐘寺 Great Bell Temple: a giant bronze bell hangs in the middle of the courtyard.
 * Every few seconds golden rings close in on it, then it tolls: a shockwave that
 * blasts anyone near it outward, harder the closer they stand.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });

const LEFT: Obstacle[] = [
  { kind: 'lantern', x: 420, y: 250, w: 34, h: 34 },
  { kind: 'lantern', x: 420, y: 2 * MID - 250, w: 34, h: 34 },
  { kind: 'pine', x: 230, y: 180, w: 38, h: 38 },
  { kind: 'pine', x: 280, y: 640, w: 38, h: 38 },
];
const OBSTACLES: Obstacle[] = [
  { kind: 'bell', x: CX, y: MID, w: 70, h: 70 },
  ...LEFT,
  ...LEFT.map(pm),
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  // Right under the bell: grab between tolls.
  { x: CX - 70, y: MID, big: true },
  { x: CX + 70, y: MID, big: true },
  { x: 520, y: 180, empty: 0.3 },
  pm({ x: 520, y: 180, empty: 0.3 }),
];

export const BELL: GameMap = {
  id: 'bell',
  name: 'Great Bell Temple',
  zh: '大鐘寺',
  desc: 'The giant bell tolls every few seconds, blasting anyone near it outward. Golden rings warn you just before.',
  descZh: '大鐘每隔幾秒就會敲響，把附近的人震飛（越近越痛）。敲響前會有金色光環提示。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'petals',
  bell: { x: CX, y: MID, interval: 6, warn: 1.5, radius: 170, damage: 14 },
  paint(ctx, rand) {
    paintCourtyard(ctx, rand);
    for (const o of OBSTACLES) if (o.kind === 'lantern') paintLanternGlow(ctx, o);
    for (const o of OBSTACLES) paintShadow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'bell') paintBell(ctx, o);
      else if (o.kind === 'lantern') paintLantern(ctx, o);
      else if (o.kind === 'pine') paintPine(ctx, o, rand);
    }
    paintWall(ctx);
    paintVignette(ctx);
  },
};

function paintCourtyard(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#8a8478';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  // Raked gravel in rings around the bell.
  ctx.strokeStyle = 'rgba(70,64,56,0.35)';
  ctx.lineWidth = 1.5;
  for (let r = 70; r < 700; r += 12) {
    ctx.beginPath();
    ctx.arc(CX, MID, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 30; i++) blob(ctx, ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 20 + rand() * 30, 'rgba(60,56,50,0.15)');
}

/** The bell under its little roof, seen from above. */
function paintBell(ctx: Ctx, o: Obstacle) {
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(o.x - o.w / 2 - 10, o.y - o.h / 2 - 10, o.w + 20, o.h + 20);
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(o.x - o.w / 2 - 6, o.y - o.h / 2 - 6, o.w + 12, o.h + 12);
  const g = ctx.createRadialGradient(o.x - 8, o.y - 8, 4, o.x, o.y, o.w / 2);
  g.addColorStop(0, '#d9b86a');
  g.addColorStop(1, '#6a4a1e');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.w / 2 - 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a2a10';
  ctx.lineWidth = 2;
  for (const r of [o.w * 0.2, o.w * 0.34]) {
    ctx.beginPath();
    ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // The striking log hanging beside it.
  ctx.fillStyle = '#8a6a3a';
  ctx.fillRect(o.x + o.w / 2 + 2, o.y - 4, 26, 8);
}

function paintPine(ctx: Ctx, o: Obstacle, rand: () => number) {
  if (paintScenery(ctx, o)) return;
  for (let k = 3; k >= 0; k--) {
    ctx.fillStyle = ['#1e3a1e', '#2a4a24', '#36602e', '#4a7a3a'][k];
    ctx.beginPath();
    for (let j = 0; j < 9; j++) {
      const a = (j / 9) * Math.PI * 2;
      const r = (o.w / 2) * (1 - k * 0.2) * (j % 2 ? 0.75 : 1) + rand() * 2;
      ctx.lineTo(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r);
    }
    ctx.fill();
  }
}

function paintWall(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#e8e0cc';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.fillStyle = '#3a3a40';
  ctx.fillRect(0, top, WIDTH, 6);
  ctx.fillRect(0, HEIGHT - 6, WIDTH, 6);
  ctx.strokeStyle = '#8a1a1e';
  ctx.lineWidth = 2;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
