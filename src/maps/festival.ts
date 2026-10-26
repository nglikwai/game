import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintLantern, paintLanternGlow, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle, type TerrainZone,
} from '@/maps/common';

/**
 * 夜市祭典 Night Festival: a lantern-lit market street with a golden lane down the
 * middle that speeds you up. Food stalls line it, taiko stages stand at either end,
 * and fireworks burst overhead.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });

const LANE: TerrainZone = { kind: 'boost', x: CX, y: MID, w: ARENA.w, h: 50 };

const LEFT: Obstacle[] = [
  { kind: 'stall', x: 330, y: MID - 62, w: 80, h: 40 },
  { kind: 'stall', x: 560, y: MID - 62, w: 80, h: 40 },
  { kind: 'stall', x: 450, y: MID + 62, w: 80, h: 40 },
  { kind: 'stage', x: CX, y: 230, w: 110, h: 56 },
  { kind: 'lantern', x: 420, y: 165, w: 32, h: 32 },
];
const OBSTACLES: Obstacle[] = [...LEFT, ...LEFT.map(pm)];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  // The festival prize, right in the middle of the golden lane.
  { x: CX, y: MID, big: true },
  { x: 450, y: MID - 112, empty: 0.3 },
  pm({ x: 450, y: MID - 112, empty: 0.3 }),
  { x: 330, y: MID + 112, empty: 0.4 },
  pm({ x: 330, y: MID + 112, empty: 0.4 }),
];

export const FESTIVAL: GameMap = {
  id: 'festival',
  name: 'Night Festival',
  zh: '夜市祭典',
  desc: 'A lantern-lit market street. The golden lane down the middle speeds you up; fireworks burst overhead.',
  descZh: '燈籠高掛的夜市街道。中央的金色大道可以加速，天上煙火不斷。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'fireflies',
  zones: [LANE],
  fireworks: true,
  paint(ctx, rand) {
    paintStreet(ctx, rand);
    paintGoldenLane(ctx);
    for (const o of OBSTACLES) if (o.kind === 'lantern') paintLanternGlow(ctx, o);
    for (const o of OBSTACLES) paintShadow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'stall') paintStall(ctx, o, rand);
      else if (o.kind === 'stage') paintStage(ctx, o);
      else if (o.kind === 'lantern') paintLantern(ctx, o);
    }
    paintLanternStrings(ctx);
    paintFestivalFence(ctx);
    ctx.fillStyle = 'rgba(20,10,40,0.2)';
    ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
    paintVignette(ctx);
  },
};

function paintStreet(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#2a2830';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let y = ARENA.y; y < ARENA.y + ARENA.h; y += 26) {
    for (let x = ARENA.x + ((y / 26) % 2 ? 13 : 0); x < ARENA.x + ARENA.w; x += 26) {
      ctx.fillStyle = `hsl(250, 8%, ${18 + rand() * 7}%)`;
      ctx.fillRect(x + 1, y + 1, 24, 24);
    }
  }
  // Warm pools of light from the stalls.
  for (let i = 0; i < 14; i++) blob(ctx, ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 50, 'rgba(255,170,80,0.08)');
}

/** The golden lane: a glowing strip with chevrons both ways. */
function paintGoldenLane(ctx: Ctx) {
  const t = MID - LANE.h / 2;
  const g = ctx.createLinearGradient(0, t, 0, t + LANE.h);
  g.addColorStop(0, 'rgba(255,200,80,0.25)');
  g.addColorStop(0.5, 'rgba(255,220,120,0.5)');
  g.addColorStop(1, 'rgba(255,200,80,0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(ARENA.x, t, ARENA.w, LANE.h);
  ctx.strokeStyle = '#ffd27a';
  ctx.lineWidth = 2;
  ctx.strokeRect(ARENA.x, t, ARENA.w, LANE.h);
  ctx.strokeStyle = 'rgba(255,240,200,0.6)';
  ctx.lineWidth = 3;
  for (let x = ARENA.x + 40; x < ARENA.x + ARENA.w; x += 80) {
    const d = x < CX ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(x - d * 6, MID - 10);
    ctx.lineTo(x + d * 6, MID);
    ctx.lineTo(x - d * 6, MID + 10);
    ctx.stroke();
  }
}

/** A food stall: a striped awning seen from above, with a glowing paper sign. */
function paintStall(ctx: Ctx, o: Obstacle, rand: () => number) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  const colors = [['#c0392b', '#f2e6d0'], ['#2a5aa8', '#f2e6d0'], ['#2a8a4a', '#f2e6d0']][Math.floor(rand() * 3)];
  for (let x = l, k = 0; x < l + o.w; x += 10, k++) {
    ctx.fillStyle = colors[k % 2];
    ctx.fillRect(x, t, Math.min(10, l + o.w - x), o.h);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(l, o.y, o.w, o.h / 2);
  ctx.strokeStyle = '#3a2a1a';
  ctx.lineWidth = 2;
  ctx.strokeRect(l, t, o.w, o.h);
  ctx.fillStyle = '#ffe9b0';
  ctx.fillRect(o.x - 10, t - 6, 20, 10);
  blob(ctx, o.x, t - 1, 16, 'rgba(255,200,100,0.3)');
}

/** A wooden stage with a big taiko drum. */
function paintStage(ctx: Ctx, o: Obstacle) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  ctx.fillStyle = '#6a4424';
  ctx.fillRect(l, t, o.w, o.h);
  ctx.strokeStyle = 'rgba(30,18,8,0.6)';
  ctx.lineWidth = 1;
  for (let x = l; x < l + o.w; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x, t);
    ctx.lineTo(x, t + o.h);
    ctx.stroke();
  }
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 3;
  ctx.strokeRect(l, t, o.w, o.h);
  ctx.fillStyle = '#7a3a1a';
  ctx.beginPath();
  ctx.arc(o.x, o.y, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8d8b0';
  ctx.beginPath();
  ctx.arc(o.x, o.y, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.arc(o.x, o.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

/** Strings of red paper lanterns across the street. */
function paintLanternStrings(ctx: Ctx) {
  for (const x0 of [200, 450, 700, 950, 1150]) {
    ctx.strokeStyle = 'rgba(40,30,20,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, ARENA.y);
    ctx.quadraticCurveTo(x0 + 60, MID, x0, ARENA.y + ARENA.h);
    ctx.stroke();
    for (let k = 1; k < 9; k++) {
      const u = k / 9;
      const x = (1 - u) * (1 - u) * x0 + 2 * u * (1 - u) * (x0 + 60) + u * u * x0;
      const y = ARENA.y + u * ARENA.h;
      blob(ctx, x, y, 12, 'rgba(255,90,60,0.25)');
      ctx.fillStyle = '#e8402a';
      ctx.beginPath();
      ctx.ellipse(x, y, 5, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function paintFestivalFence(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#3a2418';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  for (let x = 12; x < WIDTH; x += 40) {
    for (const y of [top + WALL / 2, HEIGHT - WALL / 2]) {
      blob(ctx, x, y, 9, 'rgba(255,120,60,0.35)');
      ctx.fillStyle = '#ffb03a';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = '#ffd27a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
