import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, mirrored,
  type ChestSpot, type Ctx, type GameMap, type Obstacle, type TerrainZone,
} from '@/maps/common';
import { paintPine, paintSnowGround } from '@/maps/snow';

/**
 * 冰湖 Frozen Lake: a slippery frozen lake fills the middle (you slide and can't stop
 * on the spot), with ice-fishing holes you can't walk into, ringed by a snowy shore.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const LAKE: TerrainZone = { kind: 'ice', x: CX, y: MID, w: 680, h: 360 };

const OBSTACLES: Obstacle[] = [
  // Ice-fishing holes: water, so you can't walk in but shots fly over.
  ...[[CX - 160, MID - 80], [CX + 160, MID + 80], [CX, MID]].map(([x, y]) => ({ kind: 'hole' as const, low: true, x, y, w: 44, h: 44 })),
  { kind: 'pine', x: 230, y: 2 * MID - 230, w: 46, h: 46 },
  { kind: 'pine', x: WIDTH - 230, y: 230, w: 46, h: 46 },
  { kind: 'rock', x: 230, y: 230 + 22, w: 54, h: 40 },
  { kind: 'rock', x: WIDTH - 230, y: 2 * MID - 252, w: 54, h: 40 },
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1),
  ...cornerPile(-1, 1),
  ...cornerPile(1, -1),
  ...cornerPile(-1, -1),
  // Out on the ice next to the middle hole: easy to overshoot.
  { x: CX - 80, y: MID, empty: 0.2 },
  { x: CX + 80, y: MID, empty: 0.2 },
  // Big ones on the north and south shore.
  { x: CX, y: ARENA.y + 48, big: true },
  { x: CX, y: ARENA.y + ARENA.h - 48, big: true },
  ...mirrored([{ x: 420, y: ARENA.y + 50 }], true),
];

export const ICE: GameMap = {
  id: 'ice',
  name: 'Frozen Lake',
  zh: '冰湖',
  desc: "Slippery ice in the middle: you slide and can't stop on the spot. Mind the fishing holes.",
  descZh: '中央是滑溜的冰面，會滑行而且無法立即停下。小心冰洞。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'snow',
  zones: [LAKE],
  paint(ctx, rand) {
    paintSnowGround(ctx, rand);
    paintLake(ctx, rand);
    for (const o of OBSTACLES) {
      if (o.kind === 'hole') paintHole(ctx, o);
      else if (o.kind === 'pine') paintPine(ctx, o, rand);
      else if (o.kind === 'rock') paintSnowyRock(ctx, o);
    }
    paintLogFence(ctx);
    const v = ctx.createRadialGradient(CX, MID, 260, CX, MID, 780);
    v.addColorStop(0, 'rgba(20,40,70,0)');
    v.addColorStop(1, 'rgba(20,40,70,0.4)');
    ctx.fillStyle = v;
    ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  },
};

function paintLake(ctx: Ctx, rand: () => number) {
  const l = LAKE.x - LAKE.w / 2;
  const t = LAKE.y - LAKE.h / 2;
  // Snowy rim, then the ice.
  ctx.fillStyle = '#f6f9fc';
  ctx.beginPath();
  ctx.roundRect(l - 10, t - 10, LAKE.w + 20, LAKE.h + 20, 60);
  ctx.fill();
  const g = ctx.createRadialGradient(LAKE.x, LAKE.y, 40, LAKE.x, LAKE.y, LAKE.w * 0.6);
  g.addColorStop(0, '#9fd0ea');
  g.addColorStop(0.7, '#7fb8d8');
  g.addColorStop(1, '#a8d4ea');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(l, t, LAKE.w, LAKE.h, 50);
  ctx.fill();
  // Skate scratches and shine.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(l, t, LAKE.w, LAKE.h, 50);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const x = l + rand() * LAKE.w;
    const y = t + rand() * LAKE.h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 30, y + (rand() - 0.5) * 20, x + 60 + rand() * 40, y + (rand() - 0.5) * 30);
    ctx.stroke();
  }
  for (let i = 0; i < 6; i++) blob(ctx, l + rand() * LAKE.w, t + rand() * LAKE.h, 40 + rand() * 50, 'rgba(255,255,255,0.25)');
  // Cracks.
  ctx.strokeStyle = 'rgba(40,90,130,0.45)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 8; i++) {
    let x = l + rand() * LAKE.w;
    let y = t + rand() * LAKE.h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rand() - 0.5) * 40;
      y += (rand() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function paintHole(ctx: Ctx, o: Obstacle) {
  ctx.fillStyle = '#e8f2fa';
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.w / 2 + 5, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(o.x, o.y, 2, o.x, o.y, o.w / 2);
  g.addColorStop(0, '#1a3c5a');
  g.addColorStop(1, '#0e2236');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.w / 2, 0, Math.PI * 2);
  ctx.fill();
  // Floating ice chips.
  ctx.fillStyle = 'rgba(220,240,255,0.8)';
  ctx.fillRect(o.x - 8, o.y - 4, 6, 4);
  ctx.fillRect(o.x + 4, o.y + 5, 5, 3);
}

function paintSnowyRock(ctx: Ctx, o: Obstacle) {
  blob(ctx, o.x + 5, o.y + 7, o.w * 0.7, 'rgba(60,80,110,0.45)');
  ctx.fillStyle = '#6b7380';
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3e444e';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  blob(ctx, o.x - 4, o.y - 6, o.w * 0.4, 'rgba(255,255,255,0.95)');
}

/** Log fence with snow on top. */
function paintLogFence(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#5a3a22';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  for (let x = 6; x < WIDTH; x += 40) {
    for (const y of [top + WALL / 2, HEIGHT - WALL / 2]) {
      ctx.fillStyle = '#8a6040';
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x - 1, y - 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = '#f4f7fb';
  ctx.fillRect(WALL - 6, top + WALL - 6, WIDTH - 2 * (WALL - 6), 6);
  ctx.fillRect(WALL - 6, HEIGHT - WALL, WIDTH - 2 * (WALL - 6), 6);
  ctx.fillRect(WALL - 6, top + WALL - 6, 6, HEIGHT - top - 2 * (WALL - 6));
  ctx.fillRect(WIDTH - WALL, top + WALL - 6, 6, HEIGHT - top - 2 * (WALL - 6));
}
