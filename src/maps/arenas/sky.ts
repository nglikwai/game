import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle, type TerrainZone,
} from '@/maps/common';

/**
 * 雲上跳台 Sky Pads: a marble temple floating above the clouds. Glowing launch pads
 * fling you across the platform the way their arrows point; gaps in the floor open
 * onto the sky far below (you can't walk over them, but shots fly across).
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });
const PAD = 48;
/** How hard a pad throws you (battlefield px/s at the start of the fling). */
const FLING = 2300;
const pad = (x: number, y: number, dx: number, dy: number): TerrainZone => {
  const l = Math.hypot(dx, dy) || 1;
  return { kind: 'pad', x, y, w: PAD, h: PAD, push: { x: (dx / l) * FLING, y: (dy / l) * FLING } };
};
const pmPad = (z: TerrainZone): TerrainZone => ({ ...pm(z), push: z.push && { x: -z.push.x, y: -z.push.y } });

const LEFT_PADS: TerrainZone[] = [
  pad(250, 240, 1, 0.55),
  pad(250, 2 * MID - 240, 1, -0.55),
  pad(CX - 70, 165, 0, 1),
];
const PADS: TerrainZone[] = [...LEFT_PADS, ...LEFT_PADS.map(pmPad)];

const LEFT: Obstacle[] = [
  { kind: 'cloud', low: true, x: 450, y: 300, w: 90, h: 60 },
  { kind: 'cloud', low: true, x: 480, y: 530, w: 100, h: 54 },
  { kind: 'pillar', x: 330, y: MID, w: 34, h: 34 },
  { kind: 'pillar', x: 600, y: 600, w: 30, h: 30 },
];
const OBSTACLES: Obstacle[] = [
  { kind: 'cloud', low: true, x: CX, y: MID, w: 110, h: 70 },
  ...LEFT,
  ...LEFT.map(pm),
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  { x: CX - 100, y: MID, big: true },
  { x: CX + 100, y: MID, big: true },
  { x: 560, y: 400, empty: 0.3 },
  pm({ x: 560, y: 400, empty: 0.3 }),
];

export const SKY: GameMap = {
  id: 'sky',
  name: 'Sky Pads',
  zh: '雲上跳台',
  desc: 'A marble temple above the clouds. Launch pads fling you the way their arrows point; gaps open onto the sky.',
  descZh: '雲上的大理石神殿。踩上跳台會被彈向箭頭的方向；地上的缺口通往天空，無法走過。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'mist',
  zones: PADS,
  paint(ctx, rand) {
    paintMarble(ctx, rand);
    for (const o of OBSTACLES) if (o.kind === 'cloud') paintSkyHole(ctx, o, rand);
    for (const z of PADS) paintPadBase(ctx, z);
    for (const o of OBSTACLES) if (!o.low) paintShadow(ctx, o);
    for (const o of OBSTACLES) if (o.kind === 'pillar') paintGoldPillar(ctx, o);
    paintCloudBorder(ctx, rand);
    paintVignette(ctx);
  },
};

function paintMarble(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#e8e4dc';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  const S = 48;
  for (let y = ARENA.y; y < ARENA.y + ARENA.h; y += S) {
    for (let x = ARENA.x; x < ARENA.x + ARENA.w; x += S) {
      ctx.fillStyle = (x / S + y / S) % 2 < 1 ? '#f2eee6' : '#dcd6ca';
      ctx.fillRect(x, y, S, S);
    }
  }
  // Grey veins.
  ctx.strokeStyle = 'rgba(140,130,120,0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    let x = ARENA.x + rand() * ARENA.w;
    let y = ARENA.y + rand() * ARENA.h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += (rand() - 0.5) * 50;
      y += (rand() - 0.5) * 50;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Gold inlay circle in the middle.
  ctx.strokeStyle = 'rgba(217,174,74,0.6)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(CX, MID, 150, 0, Math.PI * 2);
  ctx.stroke();
}

/** A hole in the floor: blue sky far below, clouds drifting under. */
function paintSkyHole(ctx: Ctx, o: Obstacle, rand: () => number) {
  const g = ctx.createRadialGradient(o.x, o.y, 4, o.x, o.y, o.w * 0.6);
  g.addColorStop(0, '#9fd0f2');
  g.addColorStop(1, '#5aa0d8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 4; i++) blob(ctx, o.x + (rand() - 0.5) * o.w, o.y + (rand() - 0.5) * o.h, 14 + rand() * 10, 'rgba(255,255,255,0.7)');
  ctx.restore();
  ctx.strokeStyle = '#b8a888';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
}

/** The carved base each pad sits on (the glow and arrows are drawn live). */
function paintPadBase(ctx: Ctx, z: TerrainZone) {
  ctx.fillStyle = '#7a8a9a';
  ctx.beginPath();
  ctx.arc(z.x, z.y, z.w / 2 + 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a5a8a';
  ctx.beginPath();
  ctx.arc(z.x, z.y, z.w / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
}

function paintGoldPillar(ctx: Ctx, o: Obstacle) {
  const r = o.w / 2;
  ctx.fillStyle = '#c9c2ae';
  ctx.fillRect(o.x - r - 4, o.y - r - 4, o.w + 8, o.h + 8);
  const g = ctx.createRadialGradient(o.x - r * 0.3, o.y - r * 0.3, 2, o.x, o.y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#b8b0a0');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d9ae4a';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function paintCloudBorder(ctx: Ctx, rand: () => number) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#9fd0f2';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  for (let i = 0; i < 140; i++) {
    const x = rand() * WIDTH;
    const y = top + rand() * (HEIGHT - top);
    if (x > WALL && x < WIDTH - WALL && y > top + WALL && y < HEIGHT - WALL) continue;
    blob(ctx, x, y, 8 + rand() * 8, 'rgba(255,255,255,0.8)');
  }
  ctx.strokeStyle = '#d9ae4a';
  ctx.lineWidth = 3;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
