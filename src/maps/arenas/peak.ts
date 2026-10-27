import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from '@/maps/common';

/**
 * 雷鳴山頂 Thunder Peak: a storm rages over the summit. Every few seconds glowing
 * marks appear on the ground (one near somebody) and lightning strikes them a moment
 * later, hurting anyone still standing there, friend or foe.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });

const LEFT: Obstacle[] = [
  { kind: 'rod', x: 420, y: 300, w: 18, h: 18 },
  { kind: 'rod', x: 540, y: 540, w: 18, h: 18 },
  { kind: 'rock', x: 300, y: 450, w: 54, h: 40 },
  { kind: 'rock', x: 560, y: 190, w: 46, h: 34 },
  { kind: 'rock', x: 200, y: 640, w: 44, h: 30 },
];
const OBSTACLES: Obstacle[] = [
  { kind: 'shrine', x: CX, y: MID, w: 90, h: 70 },
  ...LEFT,
  ...LEFT.map(pm),
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  { x: CX - 90, y: MID, empty: 0.2 },
  { x: CX + 90, y: MID, empty: 0.2 },
  { x: CX, y: ARENA.y + 40, big: true },
  { x: CX, y: ARENA.y + ARENA.h - 40, big: true },
  { x: 420, y: 360, empty: 0.4 },
  pm({ x: 420, y: 360, empty: 0.4 }),
];

export const PEAK: GameMap = {
  id: 'peak',
  name: 'Thunder Peak',
  zh: '雷鳴山頂',
  desc: 'A storm rages over the summit: glowing marks appear and lightning strikes them a moment later, hurting anyone there.',
  descZh: '山頂雷雨交加：地上出現發光的標記，片刻後落雷，站在那裡的人都會受傷（不分敵我）。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'rain',
  lightning: { interval: 5, strikes: 3, radius: 46, damage: 14, warn: 1.4 },
  paint(ctx, rand) {
    paintWetRock(ctx, rand);
    for (const o of OBSTACLES) paintShadow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'shrine') paintSummitShrine(ctx, o);
      else if (o.kind === 'rod') paintRod(ctx, o);
      else if (o.kind === 'rock') paintBoulder(ctx, o, rand);
    }
    paintRopeFence(ctx);
    ctx.fillStyle = 'rgba(20,30,60,0.22)';
    ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
    paintVignette(ctx);
  },
};

function paintWetRock(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#4a5058';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let i = 0; i < 70; i++) {
    blob(ctx, rand() * WIDTH, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT), 30 + rand() * 60, rand() < 0.5 ? 'rgba(100,108,118,0.35)' : 'rgba(30,34,40,0.35)');
  }
  // Puddles catching the sky.
  for (let i = 0; i < 18; i++) {
    const x = ARENA.x + rand() * ARENA.w;
    const y = ARENA.y + rand() * ARENA.h;
    ctx.fillStyle = 'rgba(150,170,200,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y, 14 + rand() * 20, 6 + rand() * 8, rand(), 0, Math.PI * 2);
    ctx.fill();
  }
  // Tough mountain grass.
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(110,130,80,0.6)' : 'rgba(80,100,60,0.6)';
    ctx.fillRect(ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 1.5, 4);
  }
  // A stone path to the shrine.
  ctx.fillStyle = 'rgba(120,124,130,0.55)';
  for (let x = ARENA.x; x < ARENA.x + ARENA.w; x += 26) {
    ctx.beginPath();
    ctx.roundRect(x + 2, MID - 16 + Math.sin(x) * 3, 22, 32, 5);
    ctx.fill();
  }
}

function paintSummitShrine(ctx: Ctx, o: Obstacle) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  ctx.fillStyle = '#2a2a30';
  ctx.fillRect(l - 6, t - 6, o.w + 12, o.h + 12);
  ctx.fillStyle = '#3a3e48';
  ctx.fillRect(l, t, o.w, o.h);
  ctx.strokeStyle = 'rgba(200,210,230,0.3)';
  ctx.lineWidth = 1;
  for (let x = l + 6; x < l + o.w; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, t);
    ctx.lineTo(x, t + o.h);
    ctx.stroke();
  }
  ctx.fillStyle = '#1a1a20';
  ctx.fillRect(l - 4, o.y - 3, o.w + 8, 6);
  // Shimenawa rope and paper streamers.
  ctx.strokeStyle = '#d9c08a';
  ctx.lineWidth = 3;
  ctx.strokeRect(l - 2, t - 2, o.w + 4, o.h + 4);
  ctx.fillStyle = '#f2f0e8';
  for (const x of [l + 14, o.x, l + o.w - 14]) {
    ctx.beginPath();
    ctx.moveTo(x - 4, t + o.h + 2);
    ctx.lineTo(x + 4, t + o.h + 2);
    ctx.lineTo(x - 2, t + o.h + 10);
    ctx.lineTo(x + 3, t + o.h + 16);
    ctx.lineTo(x - 4, t + o.h + 16);
    ctx.fill();
  }
}

/** An iron lightning rod with a glowing tip. */
function paintRod(ctx: Ctx, o: Obstacle) {
  ctx.fillStyle = '#2a2a30';
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.w / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a92a0';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#dfe8ff';
  ctx.beginPath();
  ctx.arc(o.x, o.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  blob(ctx, o.x, o.y, 14, 'rgba(140,170,255,0.3)');
}

function paintBoulder(ctx: Ctx, o: Obstacle, rand: () => number) {
  const g = ctx.createRadialGradient(o.x - 6, o.y - 6, 2, o.x, o.y, o.w * 0.6);
  g.addColorStop(0, '#8a909a');
  g.addColorStop(1, '#3a3e46');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, rand() * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(200,220,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(o.x - o.w * 0.15, o.y - o.h * 0.2, o.w * 0.15, o.h * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Stone posts strung with a straw rope around the summit. */
function paintRopeFence(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#2a2e34';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.fillStyle = '#6a6e76';
  for (let x = 10; x < WIDTH; x += 60) {
    ctx.fillRect(x, top + 4, 10, WALL - 8);
    ctx.fillRect(x, HEIGHT - WALL + 4, 10, WALL - 8);
  }
  for (let y = top + 30; y < HEIGHT; y += 60) {
    ctx.fillRect(4, y, WALL - 8, 10);
    ctx.fillRect(WIDTH - WALL + 4, y, WALL - 8, 10);
  }
  ctx.strokeStyle = '#d9c08a';
  ctx.lineWidth = 3;
  ctx.strokeRect(WALL / 2, top + WALL / 2, WIDTH - WALL, HEIGHT - top - WALL);
}
