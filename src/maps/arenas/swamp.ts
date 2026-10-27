import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle, type TerrainZone,
} from '@/maps/common';

/**
 * 毒沼 Poison Swamp: toxic bog slows you and saps your HP (never below 1), so the
 * fight runs along the dry banks and the log path across the middle.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });

const LEFT_BOGS: TerrainZone[] = [
  { kind: 'poison', x: 380, y: 250, w: 160, h: 130 },
  { kind: 'poison', x: 520, y: 565, w: 170, h: 110 },
  // The middle bog, split by a dry log path down the centre.
  { kind: 'poison', x: CX - 75, y: MID, w: 90, h: 130 },
];
const BOGS: TerrainZone[] = [...LEFT_BOGS, ...LEFT_BOGS.map(pm)];

const LEFT: Obstacle[] = [
  { kind: 'stump', x: 300, y: 450, w: 34, h: 34 },
  { kind: 'stump', x: 560, y: 175, w: 30, h: 30 },
  { kind: 'reed', x: 455, y: 395, w: 26, h: 26 },
  { kind: 'reed', x: 700, y: 290, w: 24, h: 24 },
  { kind: 'rock', x: 200, y: 600, w: 40, h: 30 },
];
const OBSTACLES: Obstacle[] = [...LEFT, ...LEFT.map(pm)];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  // Deep in the bogs: worth a little poison?
  { x: 380, y: 250, empty: 0.1 },
  pm({ x: 380, y: 250, empty: 0.1 }),
  { x: 520, y: 565, empty: 0.2 },
  pm({ x: 520, y: 565, empty: 0.2 }),
  { x: CX, y: ARENA.y + 40, big: true },
  { x: CX, y: ARENA.y + ARENA.h - 40, big: true },
];

export const SWAMP: GameMap = {
  id: 'swamp',
  name: 'Poison Swamp',
  zh: '毒沼',
  desc: 'Toxic bog slows you and saps HP (never below 1). Fight on the dry banks and the log path.',
  descZh: '毒沼會減速並持續扣血（最多扣到剩1點）。在乾地和中間的木頭小徑上作戰。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'spores',
  zones: BOGS,
  paint(ctx, rand) {
    paintMoss(ctx, rand);
    for (const z of BOGS) paintBog(ctx, z, rand);
    paintLogPath(ctx);
    for (const o of OBSTACLES) paintShadow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'stump') paintStump(ctx, o, rand);
      else if (o.kind === 'reed') paintReeds(ctx, o, rand);
      else if (o.kind === 'rock') paintMossRock(ctx, o);
    }
    paintRottenFence(ctx);
    ctx.fillStyle = 'rgba(60,90,30,0.12)';
    ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
    paintVignette(ctx);
  },
};

function paintMoss(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#3a4a26';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let i = 0; i < 60; i++) {
    blob(ctx, rand() * WIDTH, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT), 30 + rand() * 60, rand() < 0.5 ? 'rgba(80,100,40,0.35)' : 'rgba(30,36,18,0.35)');
  }
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(110,140,60,0.5)' : 'rgba(60,70,30,0.5)';
    ctx.fillRect(ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 1.5, 3);
  }
}

function paintBog(ctx: Ctx, z: TerrainZone, rand: () => number) {
  const l = z.x - z.w / 2;
  const t = z.y - z.h / 2;
  // Glowing toxic water with a muddy rim.
  ctx.fillStyle = '#2a2a14';
  ctx.beginPath();
  ctx.roundRect(l - 5, t - 5, z.w + 10, z.h + 10, 16);
  ctx.fill();
  const g = ctx.createRadialGradient(z.x, z.y, 6, z.x, z.y, Math.max(z.w, z.h) * 0.6);
  g.addColorStop(0, '#7ac83a');
  g.addColorStop(1, '#3a6a1e');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(l, t, z.w, z.h, 14);
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 6; i++) blob(ctx, l + rand() * z.w, t + rand() * z.h, 12 + rand() * 18, 'rgba(30,50,10,0.35)');
  // Bubbles and lily pads.
  for (let i = 0; i < (z.w * z.h) / 700; i++) {
    ctx.strokeStyle = 'rgba(200,255,140,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(l + rand() * z.w, t + rand() * z.h, 1.5 + rand() * 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const x = l + rand() * z.w;
    const y = t + rand() * z.h;
    ctx.fillStyle = '#2f5a1e';
    ctx.beginPath();
    ctx.arc(x, y, 7, 0.4, Math.PI * 2 - 0.1);
    ctx.lineTo(x, y);
    ctx.fill();
  }
  ctx.restore();
}

/** Logs laid down the middle, between the two halves of the centre bog. */
function paintLogPath(ctx: Ctx) {
  for (let y = MID - 70; y < MID + 70; y += 12) {
    ctx.fillStyle = '#6a4a28';
    ctx.beginPath();
    ctx.roundRect(CX - 28, y, 56, 10, 4);
    ctx.fill();
    ctx.fillStyle = '#8a6a3a';
    ctx.beginPath();
    ctx.arc(CX - 28, y + 5, 5, 0, Math.PI * 2);
    ctx.arc(CX + 28, y + 5, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A rotting tree stump with roots. */
function paintStump(ctx: Ctx, o: Obstacle, rand: () => number) {
  ctx.strokeStyle = '#3a2a18';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + rand();
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(o.x + Math.cos(a) * o.w * 0.8, o.y + Math.sin(a) * o.w * 0.8);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#5a3e22';
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.w / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a2a18';
  ctx.lineWidth = 1;
  for (let r = 4; r < o.w / 2; r += 4) {
    ctx.beginPath();
    ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Glowing mushrooms.
  for (let k = 0; k < 3; k++) blob(ctx, o.x + (rand() - 0.5) * o.w, o.y + (rand() - 0.5) * o.w, 3, '#b8ff6a');
}

function paintReeds(ctx: Ctx, o: Obstacle, rand: () => number) {
  for (let k = 0; k < 14; k++) {
    const x = o.x + (rand() - 0.5) * o.w;
    const y = o.y + (rand() - 0.5) * o.h;
    ctx.strokeStyle = rand() < 0.5 ? '#6a8a3a' : '#8aa04a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 10, y - 12);
    ctx.stroke();
    if (rand() < 0.4) {
      ctx.fillStyle = '#5a3a1e';
      ctx.fillRect(x - 1.5, y - 14, 3, 6);
    }
  }
}

function paintMossRock(ctx: Ctx, o: Obstacle) {
  ctx.fillStyle = '#4a4e44';
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0.2, 0, Math.PI * 2);
  ctx.fill();
  blob(ctx, o.x - 4, o.y - 4, o.w * 0.35, 'rgba(90,130,50,0.7)');
}

function paintRottenFence(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#2a2014';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.fillStyle = '#4a3a24';
  for (let x = 2; x < WIDTH; x += 11) {
    ctx.fillRect(x, top + 3, 7, WALL - 6);
    ctx.fillRect(x, HEIGHT - WALL + 3, 7, WALL - 6);
  }
  for (let y = top + 2; y < HEIGHT; y += 11) {
    ctx.fillRect(3, y, WALL - 6, 7);
    ctx.fillRect(WIDTH - WALL + 3, y, WALL - 6, 7);
  }
  ctx.strokeStyle = '#7a9a3a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
