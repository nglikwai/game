import { paintWaterSurface } from '@/maps/art/water';
import { paintScenery } from '@/maps/art/renderedProps';
import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from '@/maps/common';

/**
 * 港口碼頭 Harbor Docks: a wooden dock between the sea at the top and bottom.
 * Piers run out to dead ends with chests at their tips. Crates and barrels for cover.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
/** Sea bands span this x range; the dock corners on either side stay dry. */
const SEA_X0 = 260;
const SEA_X1 = WIDTH - 260;
const SEA_DEPTH = 130;
/** Piers: centre x and walkway width. */
const PIERS = [430, CX, WIDTH - 430];
const PIER_W = 50;

/** Sea colliders for one band, cut by the piers. */
function seaBand(y0: number, y1: number): Obstacle[] {
  const cuts = [SEA_X0, ...PIERS.flatMap((p) => [p - PIER_W / 2, p + PIER_W / 2]), SEA_X1];
  const out: Obstacle[] = [];
  for (let i = 0; i < cuts.length; i += 2) {
    out.push({ kind: 'sea', low: true, x: (cuts[i] + cuts[i + 1]) / 2, y: (y0 + y1) / 2, w: cuts[i + 1] - cuts[i], h: y1 - y0 });
  }
  return out;
}

const TOP_SEA = [ARENA.y, ARENA.y + SEA_DEPTH] as const;
const BOTTOM_SEA = [ARENA.y + ARENA.h - SEA_DEPTH, ARENA.y + ARENA.h] as const;

const OBSTACLES: Obstacle[] = [
  ...seaBand(...TOP_SEA),
  ...seaBand(...BOTTOM_SEA),
  { kind: 'crate', x: CX, y: MID, w: 70, h: 70 },
  { kind: 'crate', x: 480, y: MID - 60, w: 48, h: 48 },
  { kind: 'crate', x: WIDTH - 480, y: MID + 60, w: 48, h: 48 },
  { kind: 'barrel', x: 400, y: MID + 80, w: 36, h: 36 },
  { kind: 'barrel', x: WIDTH - 400, y: MID - 80, w: 36, h: 36 },
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1),
  ...cornerPile(-1, 1),
  ...cornerPile(1, -1),
  ...cornerPile(-1, -1),
  // At the tips of the outer piers: dead ends, so grabbing them is a risk.
  ...[PIERS[0], PIERS[2]].flatMap((x) => [{ x, y: ARENA.y + 26, empty: 0.3 }, { x, y: ARENA.y + ARENA.h - 26, empty: 0.3 }]),
  // Big ones at the end of the long middle pier.
  { x: CX, y: ARENA.y + 28, big: true },
  { x: CX, y: ARENA.y + ARENA.h - 28, big: true },
  // Among the cargo.
  { x: CX - 80, y: MID + 70 },
  { x: CX + 80, y: MID - 70 },
];

const onPier = (x: number, y: number) => (y < TOP_SEA[1] || y > BOTTOM_SEA[0]) && x > SEA_X0 && x < SEA_X1;

export const DOCKS: GameMap = {
  id: 'docks',
  name: 'Harbor Docks',
  zh: '港口碼頭',
  desc: 'A dock between the sea. Piers run out to dead ends with chests at the tips.',
  descZh: '海上的碼頭，棧橋延伸到盡頭，寶箱就放在棧橋末端。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'mist',
  route(fx, fy, tx, ty) {
    // Heading out onto a pier, or back off one: go via the pier's root on the dock.
    const pierOf = (x: number) => PIERS.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
    if (onPier(tx, ty) && Math.abs(fx - pierOf(tx)) > PIER_W / 2 - 6) {
      const root = ty < MID ? TOP_SEA[1] + 24 : BOTTOM_SEA[0] - 24;
      return { x: pierOf(tx), y: root };
    }
    if (onPier(fx, fy) && !onPier(tx, ty)) return { x: pierOf(fx), y: fy < MID ? TOP_SEA[1] + 30 : BOTTOM_SEA[0] - 30 };
    return null;
  },
  paint(ctx, rand) {
    paintSea(ctx, rand);
    paintDeck(ctx, rand);
    for (const x of PIERS) {
      paintPier(ctx, x, TOP_SEA[0] - WALL, TOP_SEA[1]);
      paintPier(ctx, x, BOTTOM_SEA[0], BOTTOM_SEA[1] + WALL);
    }
    paintBoat(ctx, (PIERS[0] + PIERS[1]) / 2, ARENA.y + 50);
    paintBoat(ctx, (PIERS[1] + PIERS[2]) / 2, ARENA.y + ARENA.h - 50);
    for (const o of OBSTACLES) if (o.kind === 'crate' || o.kind === 'barrel') paintShadow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'crate') paintCrate(ctx, o);
      else if (o.kind === 'barrel') paintBarrel(ctx, o);
    }
    paintBollards(ctx);
    paintDockEdge(ctx);
    paintVignette(ctx);
  },
};

function paintSea(ctx: Ctx, rand: () => number) {
  const g = ctx.createLinearGradient(0, HUD_HEIGHT, 0, HEIGHT);
  g.addColorStop(0, '#1d4a6e');
  g.addColorStop(0.5, '#2a6488');
  g.addColorStop(1, '#1d4a6e');
  ctx.fillStyle = g;
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  paintWaterSurface(ctx, { x: WIDTH / 2, y: (HUD_HEIGHT + HEIGHT) / 2, w: WIDTH, h: HEIGHT - HUD_HEIGHT }, 'rect', 'river', rand);
  // Wave crests.
  ctx.strokeStyle = 'rgba(220,240,255,0.3)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 160; i++) {
    const x = rand() * WIDTH;
    const y = HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 8, y - 4, x + 16, y);
    ctx.stroke();
  }
}

/** The main dock: everything that isn't sea, in horizontal planks. */
function paintDeck(ctx: Ctx, rand: () => number) {
  const areas = [
    [0, HUD_HEIGHT, SEA_X0, HEIGHT - HUD_HEIGHT],
    [SEA_X1, HUD_HEIGHT, WIDTH - SEA_X1, HEIGHT - HUD_HEIGHT],
    [SEA_X0, TOP_SEA[1], SEA_X1 - SEA_X0, BOTTOM_SEA[0] - TOP_SEA[1]],
  ];
  for (const [x, y, w, h] of areas) {
    // Foam where the dock meets the water.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
    ctx.fillStyle = '#8a6440';
    ctx.fillRect(x, y, w, h);
    for (let py = y; py < y + h; py += 14) {
      ctx.fillStyle = `hsl(28, 35%, ${30 + rand() * 8}%)`;
      ctx.fillRect(x, py + 1, w, 12);
      ctx.fillStyle = 'rgba(30,18,8,0.6)';
      ctx.fillRect(x, py, w, 1.5);
      // Staggered plank joints and nails.
      for (let px = x + ((py / 14) % 2) * 40; px < x + w; px += 80) {
        ctx.fillRect(px, py, 1.5, 14);
        ctx.fillStyle = 'rgba(200,200,210,0.5)';
        ctx.fillRect(px + 3, py + 6, 2, 2);
        ctx.fillStyle = 'rgba(30,18,8,0.6)';
      }
    }
  }
}

/** A pier running out over the water, planks laid across it. */
function paintPier(ctx: Ctx, x: number, y0: number, y1: number) {
  const l = x - PIER_W / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(l + 4, y0 + 6, PIER_W, y1 - y0);
  ctx.fillStyle = '#7a5434';
  ctx.fillRect(l, y0, PIER_W, y1 - y0);
  ctx.strokeStyle = 'rgba(30,18,8,0.7)';
  ctx.lineWidth = 1.2;
  for (let y = y0; y < y1; y += 9) {
    ctx.beginPath();
    ctx.moveTo(l, y);
    ctx.lineTo(l + PIER_W, y);
    ctx.stroke();
  }
  // Posts along the sides.
  for (let y = y0 + 8; y < y1; y += 32) {
    ctx.fillStyle = '#3a2410';
    ctx.beginPath();
    ctx.arc(l - 2, y, 4, 0, Math.PI * 2);
    ctx.arc(l + PIER_W + 2, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A small moored fishing boat (decoration, out on the water). */
function paintBoat(ctx: Ctx, x: number, y: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x + 4, y + 6, 46, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6b4224';
  ctx.beginPath();
  ctx.moveTo(x - 46, y);
  ctx.quadraticCurveTo(x - 20, y - 16, x + 46, y - 4);
  ctx.quadraticCurveTo(x + 50, y, x + 46, y + 4);
  ctx.quadraticCurveTo(x - 20, y + 16, x - 46, y);
  ctx.fill();
  ctx.fillStyle = '#a07a4a';
  ctx.beginPath();
  ctx.ellipse(x, y, 34, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#efe3c4';
  ctx.fillRect(x - 3, y - 18, 22, 14);
}

function paintCrate(ctx: Ctx, o: Obstacle) {
  if (paintScenery(ctx, o)) return;
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  ctx.fillStyle = '#a07040';
  ctx.fillRect(l, t, o.w, o.h);
  ctx.strokeStyle = '#4a2e18';
  ctx.lineWidth = 3;
  ctx.strokeRect(l + 1.5, t + 1.5, o.w - 3, o.h - 3);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(l + 3, t + 3);
  ctx.lineTo(l + o.w - 3, t + o.h - 3);
  ctx.moveTo(l + o.w - 3, t + 3);
  ctx.lineTo(l + 3, t + o.h - 3);
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(l + o.w / 2, t, o.w / 2, o.h);
}

function paintBarrel(ctx: Ctx, o: Obstacle) {
  if (paintScenery(ctx, o)) return;
  const g = ctx.createRadialGradient(o.x - 4, o.y - 4, 2, o.x, o.y, o.w / 2);
  g.addColorStop(0, '#9a6a3a');
  g.addColorStop(1, '#5a3a1e');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.w / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2a2a30';
  ctx.lineWidth = 2;
  for (const r of [o.w / 2 - 1, o.w / 2 - 7]) {
    ctx.beginPath();
    ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Iron mooring bollards with coiled rope along the dock edge (decoration). */
function paintBollards(ctx: Ctx) {
  for (const x of [330, 530, WIDTH - 530, WIDTH - 330]) {
    for (const y of [TOP_SEA[1] + 10, BOTTOM_SEA[0] - 10]) {
      ctx.fillStyle = '#2a2d33';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c9a86a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + 12, y, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

/** The harbour's stone edge around the outside. */
function paintDockEdge(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#5c5f66';
  ctx.fillRect(0, top, SEA_X0, WALL);
  ctx.fillRect(SEA_X1, top, WIDTH - SEA_X1, WALL);
  ctx.fillRect(0, HEIGHT - WALL, SEA_X0, WALL);
  ctx.fillRect(SEA_X1, HEIGHT - WALL, WIDTH - SEA_X1, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.strokeStyle = 'rgba(30,32,36,0.6)';
  ctx.lineWidth = 1;
  for (let y = top; y < HEIGHT; y += 12) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WALL, y);
    ctx.moveTo(WIDTH - WALL, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
  // Open sea beyond the edge at the top and bottom.
  blob(ctx, CX, top, 400, 'rgba(10,30,60,0.25)');
  blob(ctx, CX, HEIGHT, 400, 'rgba(10,30,60,0.25)');
}
