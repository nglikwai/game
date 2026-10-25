import { HEIGHT, HUD_HEIGHT, WIDTH } from '../config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, mirrored, paintLantern, paintLanternGlow, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle, type TerrainZone,
} from './common';

/**
 * 溫泉鄉 Hot Spring Village: steaming hot springs you can wade into: slower going,
 * but you slowly heal while standing in the water. Rocks, bamboo fences, lanterns.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;

const POOLS: TerrainZone[] = [
  { kind: 'spring', x: CX, y: MID, w: 280, h: 160 },
  { kind: 'spring', x: 330, y: 230, w: 130, h: 90 },
  { kind: 'spring', x: WIDTH - 330, y: 2 * MID - 230, w: 130, h: 90 },
];

const OBSTACLES: Obstacle[] = [
  { kind: 'rock', x: CX - 170, y: MID + 70, w: 52, h: 40 },
  { kind: 'rock', x: CX + 170, y: MID - 70, w: 52, h: 40 },
  { kind: 'fence', x: CX, y: ARENA.y + 140, w: 220, h: 14 },
  { kind: 'fence', x: CX, y: ARENA.y + ARENA.h - 140, w: 220, h: 14 },
  { kind: 'lantern', x: CX - 230, y: MID - 110, w: 36, h: 36 },
  { kind: 'lantern', x: CX + 230, y: MID + 110, w: 36, h: 36 },
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1),
  ...cornerPile(-1, 1),
  ...cornerPile(1, -1),
  ...cornerPile(-1, -1),
  // Both big chests sit in the middle pool: you heal while you break them, but you're slow.
  { x: CX - 70, y: MID, big: true },
  { x: CX + 70, y: MID, big: true },
  // On the pool's edge.
  { x: CX, y: MID - 104, empty: 0.2 },
  { x: CX, y: MID + 104, empty: 0.2 },
  // Up against the top and bottom walls.
  ...mirrored([{ x: 420, y: ARENA.y + 50 }], true),
];

export const ONSEN: GameMap = {
  id: 'onsen',
  name: 'Hot Spring Village',
  zh: '溫泉鄉',
  desc: 'Wade into the hot springs to slowly heal, but the water slows you. Big chests in the middle pool.',
  descZh: '走進溫泉可以慢慢回復生命，但會減速。大寶箱在中央溫泉裡。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'maple',
  zones: POOLS,
  paint(ctx, rand) {
    paintSlate(ctx, rand);
    for (const p of POOLS) paintPool(ctx, p, rand);
    for (const o of OBSTACLES) if (o.kind === 'lantern') paintLanternGlow(ctx, o);
    for (const o of OBSTACLES) if (o.kind !== 'fence') paintShadow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'rock') paintRock(ctx, o);
      else if (o.kind === 'fence') paintFence(ctx, o);
      else if (o.kind === 'lantern') paintLantern(ctx, o);
    }
    paintMapleLeaves(ctx, rand);
    paintWoodWall(ctx);
    paintVignette(ctx);
  },
};

/** Grey slate paving with wooden boardwalks. */
function paintSlate(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#4a4f55';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  const S = 38;
  for (let y = HUD_HEIGHT; y < HEIGHT; y += S) {
    for (let x = ((y - HUD_HEIGHT) / S) % 2 ? -S / 2 : 0; x < WIDTH; x += S) {
      ctx.fillStyle = `hsl(210, 6%, ${30 + rand() * 9}%)`;
      ctx.beginPath();
      ctx.roundRect(x + 1.5, y + 1.5, S - 3, S - 3, 4);
      ctx.fill();
    }
  }
  // Boardwalks leading to the middle pool.
  ctx.fillStyle = '#7a5a3a';
  ctx.fillRect(ARENA.x, MID - 22, CX - 140 - ARENA.x, 44);
  ctx.fillRect(CX + 140, MID - 22, ARENA.x + ARENA.w - CX - 140, 44);
  ctx.strokeStyle = 'rgba(40,24,12,0.6)';
  ctx.lineWidth = 1;
  for (let x = ARENA.x; x < ARENA.x + ARENA.w; x += 10) {
    if (x > CX - 140 && x < CX + 140) continue;
    ctx.beginPath();
    ctx.moveTo(x, MID - 22);
    ctx.lineTo(x, MID + 22);
    ctx.stroke();
  }
}

function paintPool(ctx: Ctx, p: TerrainZone, rand: () => number) {
  const l = p.x - p.w / 2;
  const t = p.y - p.h / 2;
  // Ring of rounded rocks, then milky turquoise water and drifting steam.
  for (let a = 0; a < Math.PI * 2; a += 0.18) {
    const rx = p.x + Math.cos(a) * (p.w / 2 + 4);
    const ry = p.y + Math.sin(a) * (p.h / 2 + 4);
    ctx.fillStyle = rand() < 0.5 ? '#6f6a62' : '#5a5650';
    ctx.beginPath();
    ctx.ellipse(rx, ry, 9 + rand() * 4, 7 + rand() * 3, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(p.x, p.y, 10, p.x, p.y, Math.max(p.w, p.h) * 0.6);
  g.addColorStop(0, '#9fe0d8');
  g.addColorStop(1, '#4fa8a8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 10; i++) blob(ctx, l + rand() * p.w, t + rand() * p.h, 20 + rand() * 30, 'rgba(255,255,255,0.3)');
  ctx.restore();
}

function paintRock(ctx: Ctx, o: Obstacle) {
  const g = ctx.createRadialGradient(o.x - 6, o.y - 6, 2, o.x, o.y, o.w * 0.6);
  g.addColorStop(0, '#9a958a');
  g.addColorStop(1, '#55524c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a3834';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  blob(ctx, o.x - 5, o.y - 8, 12, 'rgba(90,130,60,0.55)');
}

/** A short bamboo fence screen. */
function paintFence(ctx: Ctx, o: Obstacle) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(o.x - o.w / 2 + 4, o.y - o.h / 2 + 6, o.w, o.h);
  for (let x = o.x - o.w / 2; x < o.x + o.w / 2; x += 8) {
    const g = ctx.createLinearGradient(x, 0, x + 7, 0);
    g.addColorStop(0, '#c9d98a');
    g.addColorStop(1, '#8aa050');
    ctx.fillStyle = g;
    ctx.fillRect(x, o.y - o.h / 2, 7, o.h);
  }
  ctx.strokeStyle = '#5a3a1e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(o.x - o.w / 2, o.y);
  ctx.lineTo(o.x + o.w / 2, o.y);
  ctx.stroke();
}

function paintMapleLeaves(ctx: Ctx, rand: () => number) {
  for (let i = 0; i < 120; i++) {
    const x = ARENA.x + rand() * ARENA.w;
    const y = ARENA.y + rand() * ARENA.h;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand() * Math.PI * 2);
    ctx.fillStyle = rand() < 0.6 ? 'rgba(210,60,40,0.85)' : 'rgba(232,140,40,0.85)';
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * 5, Math.sin(a) * 5);
      ctx.lineTo(Math.cos(a + 0.6) * 2, Math.sin(a + 0.6) * 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** Dark wooden wall of the bath-house grounds. */
function paintWoodWall(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#3a2618';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.strokeStyle = 'rgba(200,160,110,0.25)';
  ctx.lineWidth = 1;
  for (let x = 0; x < WIDTH; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + WALL);
    ctx.moveTo(x, HEIGHT - WALL);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  ctx.strokeStyle = '#d9ae4a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(WALL - 0.75, top + WALL - 0.75, WIDTH - WALL * 2 + 1.5, HEIGHT - top - WALL * 2 + 1.5);
}
