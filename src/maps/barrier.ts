import { HEIGHT, HUD_HEIGHT, WIDTH } from '../config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from './common';

/**
 * 結界之原 Barrier Plain: an open plain inside a magic barrier. After 20 seconds the
 * barrier starts closing in until only the middle is left; outside it you lose HP.
 * Grab what you can early, then fight for the centre.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });

/** Standing stones in a loose ring, plus a few strays. */
const STONES: Obstacle[] = Array.from({ length: 4 }, (_, k) => {
  const a = Math.PI / 4 + (k * Math.PI) / 2;
  return { kind: 'rock' as const, x: CX + Math.cos(a) * 170, y: MID + Math.sin(a) * 120, w: 30, h: 40 };
});
const LEFT: Obstacle[] = [
  { kind: 'rock', x: 380, y: 230, w: 44, h: 32 },
  { kind: 'rock', x: 300, y: 600, w: 40, h: 30 },
];
const OBSTACLES: Obstacle[] = [...STONES, ...LEFT, ...LEFT.map(pm)];

const CHESTS: ChestSpot[] = [
  // Rich pickings out at the edges, before the barrier swallows them.
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  { x: 200, y: MID, empty: 0.1 },
  pm({ x: 200, y: MID, empty: 0.1 }),
  { x: CX, y: ARENA.y + 40, big: true },
  { x: CX, y: ARENA.y + ARENA.h - 40, big: true },
  { x: CX, y: MID, empty: 0.5 },
];

export const BARRIER: GameMap = {
  id: 'barrier',
  name: 'Barrier Plain',
  zh: '結界之原',
  desc: 'After 20 seconds the magic barrier starts closing in until only the middle is left. Outside it you lose HP.',
  descZh: '20秒後魔法結界開始縮小，最後只剩中央一小塊。待在結界外會持續扣血。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'wisps',
  barrier: { start: 720, end: 140, delay: 20, duration: 70, dps: 6 },
  paint(ctx, rand) {
    paintPlain(ctx, rand);
    paintSeal(ctx);
    for (const o of OBSTACLES) paintShadow(ctx, o);
    for (const o of OBSTACLES) paintStandingStone(ctx, o);
    paintBorder(ctx);
    paintVignette(ctx);
  },
};

function paintPlain(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#7a8a5a';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let i = 0; i < 60; i++) {
    blob(ctx, rand() * WIDTH, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT), 30 + rand() * 60, rand() < 0.5 ? 'rgba(150,170,100,0.35)' : 'rgba(90,100,60,0.3)');
  }
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(170,190,110,0.6)' : 'rgba(110,130,70,0.6)';
    ctx.fillRect(ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 1.5, 4);
  }
}

/** The seal at the heart of the barrier: concentric rune circles. */
function paintSeal(ctx: Ctx) {
  ctx.strokeStyle = 'rgba(181,123,255,0.45)';
  for (const [r, w] of [[140, 3], [120, 1.5], [60, 2]] as const) {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(CX, MID, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(a) * 60, MID + Math.sin(a) * 60);
    ctx.lineTo(CX + Math.cos(a) * 120, MID + Math.sin(a) * 120);
    ctx.stroke();
  }
}

function paintStandingStone(ctx: Ctx, o: Obstacle) {
  const g = ctx.createRadialGradient(o.x - 5, o.y - 6, 2, o.x, o.y, o.w * 0.7);
  g.addColorStop(0, '#a8a498');
  g.addColorStop(1, '#5a5850');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(181,123,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(o.x, o.y - o.h * 0.3);
  ctx.lineTo(o.x, o.y + o.h * 0.3);
  ctx.moveTo(o.x - o.w * 0.2, o.y);
  ctx.lineTo(o.x + o.w * 0.2, o.y);
  ctx.stroke();
}

function paintBorder(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#3a2a4a';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.strokeStyle = '#b57bff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
