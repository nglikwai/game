import { HEIGHT, HUD_HEIGHT, WIDTH } from '../config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from './common';

/**
 * 落石山道 Rockslide Pass: two mountain roads cross the pass. Every few seconds one
 * lights up with warning arrows, then a boulder thunders down it, flattening anyone
 * still on the road.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });
const LANES = [320, 2 * MID - 320];

const LEFT: Obstacle[] = [
  { kind: 'rock', x: 420, y: MID, w: 50, h: 36 },
  { kind: 'pine', x: 300, y: 190, w: 40, h: 40 },
  { kind: 'rock', x: 560, y: 200, w: 44, h: 36 },
  { kind: 'pine', x: 200, y: 620, w: 40, h: 40 },
];
const OBSTACLES: Obstacle[] = [
  { kind: 'rock', x: CX, y: MID, w: 70, h: 44 },
  ...LEFT,
  ...LEFT.map(pm),
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  // Out on the roads: grab them between boulders.
  { x: CX, y: LANES[0], big: true },
  { x: CX, y: LANES[1], big: true },
  { x: 300, y: MID, empty: 0.3 },
  pm({ x: 300, y: MID, empty: 0.3 }),
  { x: 480, y: 160, empty: 0.4 },
  pm({ x: 480, y: 160, empty: 0.4 }),
];

export const ROCKSLIDE: GameMap = {
  id: 'rockslide',
  name: 'Rockslide Pass',
  zh: '落石山道',
  desc: 'Two roads cross the pass. When one lights up with warning arrows, a boulder is about to thunder down it.',
  descZh: '兩條山路橫越山道。路面亮起警示箭頭時，巨石就要滾下來了。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'dust',
  rollers: { lanes: LANES, interval: 3.2, warn: 1.2, speed: 520, radius: 24, damage: 18 },
  paint(ctx, rand) {
    paintMountain(ctx, rand);
    for (const y of LANES) paintRoad(ctx, y, rand);
    for (const o of OBSTACLES) paintShadow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'rock') paintRock(ctx, o, rand);
      else if (o.kind === 'pine') paintPine(ctx, o, rand);
    }
    paintScree(ctx, rand);
    paintCliffBorder(ctx, rand);
    paintVignette(ctx);
  },
};

function paintMountain(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#5a6a44';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let i = 0; i < 60; i++) {
    blob(ctx, rand() * WIDTH, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT), 30 + rand() * 60, rand() < 0.5 ? 'rgba(110,120,80,0.35)' : 'rgba(70,70,60,0.35)');
  }
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(130,150,90,0.6)' : 'rgba(90,100,70,0.6)';
    ctx.fillRect(ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 1.5, 4);
  }
}

/** A rutted dirt road from one side to the other. */
function paintRoad(ctx: Ctx, y: number, rand: () => number) {
  ctx.fillStyle = '#8a7050';
  ctx.fillRect(ARENA.x, y - 22, ARENA.w, 44);
  ctx.fillStyle = '#7a6044';
  ctx.fillRect(ARENA.x, y - 12, ARENA.w, 5);
  ctx.fillRect(ARENA.x, y + 7, ARENA.w, 5);
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = 'rgba(60,45,30,0.5)';
    ctx.fillRect(ARENA.x + rand() * ARENA.w, y - 22 + rand() * 44, 2, 2);
  }
  ctx.strokeStyle = 'rgba(40,30,20,0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(ARENA.x, y - 22, ARENA.w, 44);
}

function paintRock(ctx: Ctx, o: Obstacle, rand: () => number) {
  const g = ctx.createRadialGradient(o.x - 6, o.y - 6, 2, o.x, o.y, o.w * 0.6);
  g.addColorStop(0, '#a89a88');
  g.addColorStop(1, '#5a4e44');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, rand() * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a3028';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function paintPine(ctx: Ctx, o: Obstacle, rand: () => number) {
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

/** Piles of loose rock where the roads meet the slopes. */
function paintScree(ctx: Ctx, rand: () => number) {
  for (const y of LANES) {
    for (const x of [ARENA.x + 20, ARENA.x + ARENA.w - 20]) {
      for (let i = 0; i < 12; i++) blob(ctx, x + (rand() - 0.5) * 30, y + (rand() - 0.5) * 70, 5 + rand() * 6, rand() < 0.5 ? '#7a6a5a' : '#5a4e44');
    }
  }
}

function paintCliffBorder(ctx: Ctx, rand: () => number) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#4a4038';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  for (let i = 0; i < 120; i++) {
    const x = rand() * WIDTH;
    const y = top + rand() * (HEIGHT - top);
    if (x > WALL && x < WIDTH - WALL && y > top + WALL && y < HEIGHT - WALL) continue;
    blob(ctx, x, y, 5 + rand() * 6, 'rgba(120,108,96,0.6)');
  }
  ctx.strokeStyle = '#2a241e';
  ctx.lineWidth = 2;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
