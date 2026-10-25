import { HEIGHT, HUD_HEIGHT, WIDTH } from '../config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle, type TerrainZone,
} from './common';

/**
 * 機關城 Trap Castle: the hall floor is full of spike traps in two sets that take
 * turns. A set blinks red just before it springs up; step off or get stabbed.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });
const TILE = 60;

/** A 5 × 3 checkerboard of trap plates in the middle, plus a pair out on each side. */
const GRID: TerrainZone[] = [];
for (let i = 0; i < 5; i++) {
  for (let j = 0; j < 3; j++) {
    GRID.push({ kind: 'spikes', x: CX + (i - 2) * (TILE + 10), y: MID + (j - 1) * (TILE + 10), w: TILE, h: TILE, group: (i + j) % 2 });
  }
}
const SIDES: TerrainZone[] = [
  { kind: 'spikes', x: 330, y: 260, w: TILE, h: TILE, group: 0 },
  { kind: 'spikes', x: 330, y: 2 * MID - 260, w: TILE, h: TILE, group: 1 },
];
const TRAPS: TerrainZone[] = [...GRID, ...SIDES, ...SIDES.map(pm)];

const LEFT: Obstacle[] = [
  { kind: 'pillar', x: 380, y: MID, w: 36, h: 36 },
  { kind: 'statue', x: 560, y: 190, w: 38, h: 38 },
  { kind: 'pillar', x: 230, y: 640, w: 34, h: 34 },
];
const OBSTACLES: Obstacle[] = [...LEFT, ...LEFT.map(pm)];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  // The prize sits right on the traps.
  { x: CX, y: MID, big: true },
  { x: 330, y: 260, empty: 0.2 },
  pm({ x: 330, y: 260, empty: 0.2 }),
  { x: 460, y: 600, empty: 0.4 },
  pm({ x: 460, y: 600, empty: 0.4 }),
];

export const TRAPS_MAP: GameMap = {
  id: 'traps',
  name: 'Trap Castle',
  zh: '機關城',
  desc: 'Spike traps in two sets take turns springing up. A set blinks red just before it rises; step off in time.',
  descZh: '地上的尖刺機關分成兩組輪流升起。即將升起的那組會閃紅光，要及時離開。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'dust',
  zones: TRAPS,
  spikeCycle: { period: 3, warn: 0.7, dps: 14 },
  paint(ctx, rand) {
    paintHall(ctx, rand);
    for (const z of TRAPS) paintTrapPlate(ctx, z);
    for (const o of OBSTACLES) paintShadow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'pillar') paintPillar(ctx, o);
      else if (o.kind === 'statue') paintGuardian(ctx, o);
    }
    paintCastleWall(ctx);
    paintVignette(ctx);
  },
};

function paintHall(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#3a3634';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  const S = 40;
  for (let y = ARENA.y; y < ARENA.y + ARENA.h; y += S) {
    for (let x = ARENA.x; x < ARENA.x + ARENA.w; x += S) {
      ctx.fillStyle = `hsl(20, 6%, ${22 + rand() * 8}%)`;
      ctx.fillRect(x + 1, y + 1, S - 2, S - 2);
    }
  }
  // A long red carpet edged in gold, down the hall.
  ctx.fillStyle = 'rgba(120,20,24,0.55)';
  ctx.fillRect(ARENA.x, MID - 130, ARENA.w, 260);
  ctx.strokeStyle = 'rgba(217,174,74,0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(ARENA.x - 2, MID - 130, ARENA.w + 4, 260);
  for (let i = 0; i < 20; i++) blob(ctx, ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 20 + rand() * 30, 'rgba(0,0,0,0.15)');
}

/** An iron plate full of holes (the spikes themselves are drawn live by the scene). */
function paintTrapPlate(ctx: Ctx, z: TerrainZone) {
  const l = z.x - z.w / 2;
  const t = z.y - z.h / 2;
  ctx.fillStyle = '#4a4e56';
  ctx.fillRect(l, t, z.w, z.h);
  ctx.strokeStyle = z.group ? '#8a5a2a' : '#5a6a8a';
  ctx.lineWidth = 2;
  ctx.strokeRect(l + 1, t + 1, z.w - 2, z.h - 2);
  ctx.fillStyle = '#2a2c30';
  for (const [x, y] of [[l + 4, t + 4], [l + z.w - 4, t + 4], [l + 4, t + z.h - 4], [l + z.w - 4, t + z.h - 4]]) {
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintPillar(ctx: Ctx, o: Obstacle) {
  const r = o.w / 2;
  ctx.fillStyle = '#2a2624';
  ctx.fillRect(o.x - r - 4, o.y - r - 4, o.w + 8, o.h + 8);
  const g = ctx.createRadialGradient(o.x - r * 0.3, o.y - r * 0.3, 2, o.x, o.y, r);
  g.addColorStop(0, '#9a9490');
  g.addColorStop(1, '#4a4644');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** A stone guardian dog (komainu). */
function paintGuardian(ctx: Ctx, o: Obstacle) {
  ctx.fillStyle = '#5a5654';
  ctx.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
  ctx.fillStyle = '#8a8682';
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.w * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5a5654';
  ctx.lineWidth = 2;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(o.x + Math.cos(a) * 9, o.y + Math.sin(a) * 9, 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.arc(o.x - 4, o.y - 2, 2, 0, Math.PI * 2);
  ctx.arc(o.x + 4, o.y - 2, 2, 0, Math.PI * 2);
  ctx.fill();
}

function paintCastleWall(ctx: Ctx) {
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
  for (let y = top; y < HEIGHT; y += 28) {
    ctx.strokeRect(0, y, WALL, 28);
    ctx.strokeRect(WIDTH - WALL, y + 14, WALL, 28);
  }
  // Hanging banners.
  for (const x of [160, 480, 800, 1120]) {
    ctx.fillStyle = '#8a1a1e';
    ctx.fillRect(x - 10, top, 20, WALL + 10);
    ctx.fillStyle = '#d9ae4a';
    ctx.beginPath();
    ctx.arc(x, top + WALL - 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#d9ae4a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
