import { HEIGHT, HUD_HEIGHT, WIDTH } from '../config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintLantern, paintLanternGlow, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from './common';

/**
 * 藥草園 Herb Garden: healing herbs grow in beds all over the garden. Walk over a
 * glowing herb to heal; it regrows a while later. Hurt CPUs go looking for them too.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });

const LEFT_HERBS = [{ x: 330, y: 230 }, { x: 330, y: 2 * MID - 230 }, { x: 540, y: MID }, { x: 560, y: 170 }];
const HERBS = [...LEFT_HERBS, ...LEFT_HERBS.map(pm)];

const LEFT: Obstacle[] = [
  { kind: 'hedge', x: 450, y: 300, w: 120, h: 22 },
  { kind: 'hedge', x: 450, y: 2 * MID - 300, w: 120, h: 22 },
  { kind: 'lantern', x: 230, y: MID, w: 32, h: 32 },
];
const OBSTACLES: Obstacle[] = [
  { kind: 'pond', low: true, x: CX, y: MID, w: 110, h: 70 },
  ...LEFT,
  ...LEFT.map(pm),
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  { x: CX, y: MID - 80, big: true },
  { x: CX, y: MID + 80, big: true },
  { x: 450, y: 250, empty: 0.3 },
  pm({ x: 450, y: 250, empty: 0.3 }),
];

export const HERB_GARDEN: GameMap = {
  id: 'herbs',
  name: 'Herb Garden',
  zh: '藥草園',
  desc: 'Healing herbs grow in beds all over the garden. Walk over a glowing herb to heal (+15); it regrows later.',
  descZh: '花園裡長滿療傷藥草。走過發光的藥草就能回復生命（+15），之後會重新長出來。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'leaves',
  herbs: { spots: HERBS, heal: 15, regrow: 12 },
  paint(ctx, rand) {
    paintLawn(ctx, rand);
    for (const h of HERBS) paintBed(ctx, h, rand);
    paintPond(ctx, OBSTACLES[0], rand);
    for (const o of OBSTACLES) if (o.kind === 'lantern') paintLanternGlow(ctx, o);
    for (const o of OBSTACLES) if (!o.low) paintShadow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'hedge') paintHedge(ctx, o, rand);
      else if (o.kind === 'lantern') paintLantern(ctx, o);
    }
    paintBambooFence(ctx);
    paintVignette(ctx);
  },
};

function paintLawn(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#5a8a44';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let i = 0; i < 60; i++) {
    blob(ctx, rand() * WIDTH, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT), 30 + rand() * 60, rand() < 0.5 ? 'rgba(120,170,80,0.35)' : 'rgba(60,100,40,0.3)');
  }
  // Stepping-stone paths.
  for (let x = ARENA.x + 20; x < ARENA.x + ARENA.w; x += 34) {
    blob(ctx, x, MID + Math.sin(x * 0.02) * 30 + (x > CX - 80 && x < CX + 80 ? 70 : 0), 10, '#a8a090');
  }
  // Little flowers.
  for (let i = 0; i < 120; i++) blob(ctx, ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 2, ['#f2e6d0', '#ffb0c8', '#ffd27a'][Math.floor(rand() * 3)]);
}

/** A tilled bed of dark soil where an herb grows (the herb itself is drawn live). */
function paintBed(ctx: Ctx, h: { x: number; y: number }, rand: () => number) {
  ctx.fillStyle = '#4a3420';
  ctx.beginPath();
  ctx.ellipse(h.x, h.y, 24, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a7a5a';
  ctx.lineWidth = 2;
  ctx.stroke();
  for (let k = 0; k < 6; k++) blob(ctx, h.x + (rand() - 0.5) * 30, h.y + (rand() - 0.5) * 20, 1.5, '#6a4a2a');
}

function paintPond(ctx: Ctx, o: Obstacle, rand: () => number) {
  ctx.fillStyle = '#8a8070';
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2 + 6, o.h / 2 + 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a9ab8';
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    const x = o.x + (rand() - 0.5) * o.w * 0.6;
    const y = o.y + (rand() - 0.5) * o.h * 0.5;
    ctx.fillStyle = '#3a7a3a';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0.4, Math.PI * 2 - 0.1);
    ctx.lineTo(x, y);
    ctx.fill();
  }
}

function paintHedge(ctx: Ctx, o: Obstacle, rand: () => number) {
  ctx.fillStyle = '#2a5a2a';
  ctx.beginPath();
  ctx.roundRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h, 8);
  ctx.fill();
  for (let k = 0; k < o.w / 8; k++) blob(ctx, o.x - o.w / 2 + 6 + rand() * (o.w - 12), o.y + (rand() - 0.5) * o.h * 0.6, 5, rand() < 0.5 ? '#3a7a3a' : '#4a8a40');
}

function paintBambooFence(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#8aa050';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.strokeStyle = '#5a6a2a';
  ctx.lineWidth = 1.5;
  for (let x = 0; x < WIDTH; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + WALL);
    ctx.moveTo(x, HEIGHT - WALL);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  ctx.strokeStyle = '#4a3218';
  ctx.lineWidth = 2;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
