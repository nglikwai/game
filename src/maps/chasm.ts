import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from '@/maps/common';
import { crossing } from '@/maps/hell';

/**
 * 斷崖吊橋 Chasm Bridges: two deep chasms split the highlands into three strips,
 * crossed only by narrow rope bridges. Shots fly over the drop.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const TOP = ARENA.y;
const BOTTOM = ARENA.y + ARENA.h;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });

const CW = 56;
const HALF = 32;
const LX = 420;
const RX = WIDTH - LX;
const L_BRIDGES = [230, 560];
const R_BRIDGES = L_BRIDGES.map((y) => 2 * MID - y);

/** A chasm from top to bottom, leaving gaps where the bridges go. */
function chasm(x: number, bridges: number[]): Obstacle[] {
  const out: Obstacle[] = [];
  let y = TOP;
  for (const b of [...[...bridges].sort((a, c) => a - c), Infinity]) {
    const end = Math.min(BOTTOM, b - HALF);
    if (end - y > 4) out.push({ kind: 'chasm', low: true, x, y: (y + end) / 2, w: CW, h: end - y });
    y = b + HALF;
  }
  return out;
}

const LEFT: Obstacle[] = [
  { kind: 'pine', x: 260, y: 160, w: 36, h: 36 },
  { kind: 'rock', x: 300, y: 650, w: 44, h: 30 },
  { kind: 'rock', x: 560, y: 300, w: 40, h: 32 },
];
const OBSTACLES: Obstacle[] = [
  ...chasm(LX, L_BRIDGES),
  ...chasm(RX, R_BRIDGES),
  { kind: 'statue', x: CX, y: MID, w: 64, h: 64 },
  ...LEFT,
  ...LEFT.map(pm),
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  { x: CX, y: 250, big: true },
  { x: CX, y: 2 * MID - 250, big: true },
  // At the bridgeheads.
  { x: LX + 60, y: L_BRIDGES[0], empty: 0.3 },
  pm({ x: LX + 60, y: L_BRIDGES[0], empty: 0.3 }),
  { x: LX - 60, y: L_BRIDGES[1], empty: 0.4 },
  pm({ x: LX - 60, y: L_BRIDGES[1], empty: 0.4 }),
];

const routeL = crossing(LX - CW / 2, LX + CW / 2, L_BRIDGES, HALF);
const routeR = crossing(RX - CW / 2, RX + CW / 2, R_BRIDGES, HALF);

export const CHASM: GameMap = {
  id: 'chasm',
  name: 'Chasm Bridges',
  zh: '斷崖吊橋',
  desc: 'Two deep chasms split the highlands; only narrow rope bridges lead across. Shots fly over the drop.',
  descZh: '兩道深谷把高原分成三段，只能走狹窄的吊橋過去。飛行道具可以越過深谷。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'leaves',
  // Cross whichever chasm lies between you and where you're going, nearest first.
  route: (fx, fy, tx, ty) => (fx < CX ? routeL(fx, fy, tx, ty) ?? routeR(fx, fy, tx, ty) : routeR(fx, fy, tx, ty) ?? routeL(fx, fy, tx, ty)),
  paint(ctx, rand) {
    paintHighland(ctx, rand);
    for (const o of OBSTACLES) if (o.kind === 'chasm') paintChasm(ctx, o, rand);
    for (const y of L_BRIDGES) paintRopeBridge(ctx, LX, y);
    for (const y of R_BRIDGES) paintRopeBridge(ctx, RX, y);
    for (const o of OBSTACLES) if (!o.low) paintShadow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'pine') paintPine(ctx, o, rand);
      else if (o.kind === 'rock') paintRock(ctx, o);
      else if (o.kind === 'statue') paintStupa(ctx, o);
    }
    paintStoneBorder(ctx);
    paintVignette(ctx);
  },
};

function paintHighland(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#6a8a4a';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let i = 0; i < 60; i++) {
    blob(ctx, rand() * WIDTH, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT), 30 + rand() * 60, rand() < 0.5 ? 'rgba(130,160,90,0.35)' : 'rgba(70,90,50,0.3)');
  }
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(150,180,100,0.6)' : 'rgba(90,120,60,0.6)';
    ctx.fillRect(ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 1.5, 4);
  }
}

/** A sheer drop: rocky lips, darkness and mist far below. */
function paintChasm(ctx: Ctx, o: Obstacle, rand: () => number) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  const g = ctx.createLinearGradient(l, 0, l + o.w, 0);
  g.addColorStop(0, '#1a1814');
  g.addColorStop(0.5, '#05060a');
  g.addColorStop(1, '#1a1814');
  ctx.fillStyle = g;
  ctx.fillRect(l, t, o.w, o.h);
  for (let y = t; y < t + o.h; y += 10) {
    blob(ctx, l + rand() * 5, y, 5 + rand() * 4, '#5a5448');
    blob(ctx, l + o.w - rand() * 5, y, 5 + rand() * 4, '#5a5448');
  }
  for (let i = 0; i < o.h / 40; i++) blob(ctx, o.x + (rand() - 0.5) * 20, t + rand() * o.h, 12, 'rgba(200,210,220,0.12)');
}

function paintRopeBridge(ctx: Ctx, x: number, y: number) {
  const w = CW + 30;
  const h = HALF * 2 - 8;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x - w / 2 + 3, y - h / 2 + 5, w, h);
  for (let px = x - w / 2; px < x + w / 2; px += 8) {
    ctx.fillStyle = '#8a6a44';
    ctx.fillRect(px + 1, y - h / 2, 6, h);
  }
  ctx.strokeStyle = '#c9a86a';
  ctx.lineWidth = 2.5;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2 - 4, y + side * (h / 2 + 2));
    ctx.quadraticCurveTo(x, y + side * (h / 2 - 2), x + w / 2 + 4, y + side * (h / 2 + 2));
    ctx.stroke();
    for (const ex of [x - w / 2 - 4, x + w / 2 + 4]) {
      ctx.fillStyle = '#5a3a1e';
      ctx.beginPath();
      ctx.arc(ex, y + side * (h / 2 + 2), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
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

function paintRock(ctx: Ctx, o: Obstacle) {
  const g = ctx.createRadialGradient(o.x - 6, o.y - 6, 2, o.x, o.y, o.w * 0.6);
  g.addColorStop(0, '#a8a090');
  g.addColorStop(1, '#5a5448');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0.2, 0, Math.PI * 2);
  ctx.fill();
}

/** A stone stupa in the middle strip. */
function paintStupa(ctx: Ctx, o: Obstacle) {
  for (let k = 0; k < 4; k++) {
    const s = o.w / 2 - k * 7;
    ctx.fillStyle = ['#6a6458', '#8a8474', '#a8a290', '#c9c2ae'][k];
    ctx.fillRect(o.x - s, o.y - s, s * 2, s * 2);
  }
  ctx.fillStyle = '#d9ae4a';
  ctx.beginPath();
  ctx.arc(o.x, o.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

function paintStoneBorder(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#5a5448';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.strokeStyle = 'rgba(30,26,20,0.5)';
  ctx.lineWidth = 1;
  for (let x = 0; x < WIDTH; x += 24) {
    ctx.strokeRect(x, top, 24, WALL);
    ctx.strokeRect(x + 12, HEIGHT - WALL, 24, WALL);
  }
  ctx.strokeStyle = '#2a261e';
  ctx.lineWidth = 2;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
