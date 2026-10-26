import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, mirrored,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from '@/maps/common';

/**
 * 熔岩洞窟 Lava Cave: the middle is an island ringed by a lava moat, reachable by
 * four stone bridges (north, south, east, west). Shots fly over the lava.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
/** Moat: outer half-size, thickness, and the bridge gap in the middle of each side. */
const OW = 200;
const OH = 140;
const M = 36;
const GAP = 76;

function moat(): Obstacle[] {
  const lava = (x: number, y: number, w: number, h: number): Obstacle => ({ kind: 'lava', low: true, x, y, w, h });
  const sideW = OW - GAP / 2;
  const sideH = OH - M - GAP / 2;
  return [
    // Top and bottom, each split by a bridge gap.
    lava(CX - GAP / 2 - sideW / 2, MID - OH + M / 2, sideW, M),
    lava(CX + GAP / 2 + sideW / 2, MID - OH + M / 2, sideW, M),
    lava(CX - GAP / 2 - sideW / 2, MID + OH - M / 2, sideW, M),
    lava(CX + GAP / 2 + sideW / 2, MID + OH - M / 2, sideW, M),
    // Left and right, between the corners, each split by a bridge gap.
    lava(CX - OW + M / 2, MID - GAP / 2 - sideH / 2, M, sideH),
    lava(CX - OW + M / 2, MID + GAP / 2 + sideH / 2, M, sideH),
    lava(CX + OW - M / 2, MID - GAP / 2 - sideH / 2, M, sideH),
    lava(CX + OW - M / 2, MID + GAP / 2 + sideH / 2, M, sideH),
  ];
}

const OBSTACLES: Obstacle[] = [
  ...moat(),
  { kind: 'obsidian', x: CX, y: MID, w: 50, h: 50 },
  // Lava pools and obsidian rocks out in the cave, placed point-symmetrically.
  { kind: 'lava', low: true, x: 270, y: 236, w: 90, h: 60 },
  { kind: 'lava', low: true, x: WIDTH - 270, y: 2 * MID - 236, w: 90, h: 60 },
  { kind: 'obsidian', x: 300, y: 2 * MID - 216, w: 54, h: 44 },
  { kind: 'obsidian', x: WIDTH - 300, y: 216, w: 54, h: 44 },
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1),
  ...cornerPile(-1, 1),
  ...cornerPile(1, -1),
  ...cornerPile(-1, -1),
  // The prize: both big chests sit on the island.
  { x: CX - 90, y: MID, big: true },
  { x: CX + 90, y: MID, big: true },
  // Outside the north and south bridges.
  { x: CX, y: ARENA.y + 50, empty: 0.3 },
  { x: CX, y: ARENA.y + ARENA.h - 50, empty: 0.3 },
  ...mirrored([{ x: 410, y: MID - 200 }], true),
];

/** The four bridge crossings: a point just outside and just inside the island. */
const CROSSINGS = [
  { out: { x: CX, y: MID - OH - 24 }, in: { x: CX, y: MID - OH + M + 24 } },
  { out: { x: CX, y: MID + OH + 24 }, in: { x: CX, y: MID + OH - M - 24 } },
  { out: { x: CX - OW - 24, y: MID }, in: { x: CX - OW + M + 24, y: MID } },
  { out: { x: CX + OW + 24, y: MID }, in: { x: CX + OW - M - 24, y: MID } },
];

const onIsland = (x: number, y: number) => Math.abs(x - CX) < OW - M + 4 && Math.abs(y - MID) < OH - M + 4;

export const LAVA: GameMap = {
  id: 'lava',
  name: 'Lava Cave',
  zh: '熔岩洞窟',
  desc: 'An island in a lava moat holds the big chests. Four bridges in; shots fly over the lava.',
  descZh: '熔岩護城河圍住的小島上放著大寶箱。只有四座橋可以進出，飛行道具可越過熔岩。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'embers',
  route(fx, fy, tx, ty) {
    const fromIn = onIsland(fx, fy);
    const toIn = onIsland(tx, ty);
    if (fromIn === toIn) return null;
    // Use the crossing closest to where we are; step through it once at its mouth.
    const best = CROSSINGS.reduce((a, c) => {
      const pa = fromIn ? a.in : a.out;
      const pc = fromIn ? c.in : c.out;
      return Math.hypot(pc.x - fx, pc.y - fy) + Math.hypot(pc.x - tx, pc.y - ty) < Math.hypot(pa.x - fx, pa.y - fy) + Math.hypot(pa.x - tx, pa.y - ty) ? c : a;
    });
    const mouth = fromIn ? best.in : best.out;
    const exit = fromIn ? best.out : best.in;
    return Math.hypot(mouth.x - fx, mouth.y - fy) < 26 ? exit : mouth;
  },
  paint(ctx, rand) {
    paintBasalt(ctx, rand);
    paintIsland(ctx);
    for (const o of OBSTACLES) if (o.kind === 'lava') paintLava(ctx, o, rand);
    paintBridges(ctx);
    for (const o of OBSTACLES) if (o.kind === 'obsidian') paintObsidian(ctx, o);
    paintCaveWall(ctx, rand);
    const v = ctx.createRadialGradient(CX, MID, 220, CX, MID, 760);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(10,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  },
};

function paintBasalt(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#2b2523';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let i = 0; i < 40; i++) {
    blob(ctx, rand() * WIDTH, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT), 40 + rand() * 80, rand() < 0.5 ? 'rgba(70,58,52,0.4)' : 'rgba(10,8,8,0.35)');
  }
  // Hexagonal basalt cracks.
  ctx.strokeStyle = 'rgba(10,6,6,0.6)';
  ctx.lineWidth = 1.5;
  const s = 34;
  for (let row = 0; row * s * 0.86 < HEIGHT; row++) {
    for (let col = 0; col * s < WIDTH + s; col++) {
      const x = col * s + (row % 2 ? s / 2 : 0);
      const y = HUD_HEIGHT + row * s * 0.86;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        const px = x + Math.cos(a) * s * 0.55 + (rand() - 0.5) * 3;
        const py = y + Math.sin(a) * s * 0.55 + (rand() - 0.5) * 3;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  // A few cracks glowing with heat.
  ctx.strokeStyle = 'rgba(255,110,40,0.35)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 18; i++) {
    let x = ARENA.x + rand() * ARENA.w;
    let y = ARENA.y + rand() * ARENA.h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (rand() - 0.5) * 30;
      y += (rand() - 0.5) * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function paintIsland(ctx: Ctx) {
  const g = ctx.createRadialGradient(CX, MID, 20, CX, MID, OW);
  g.addColorStop(0, '#5a4a40');
  g.addColorStop(1, '#3d322c');
  ctx.fillStyle = g;
  ctx.fillRect(CX - OW + M, MID - OH + M, (OW - M) * 2, (OH - M) * 2);
}

function paintLava(ctx: Ctx, o: Obstacle, rand: () => number) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  // Heat glow around the pool.
  blob(ctx, o.x, o.y, Math.max(o.w, o.h) * 0.9, 'rgba(255,90,20,0.25)');
  const g = ctx.createLinearGradient(l, t, l + o.w, t + o.h);
  g.addColorStop(0, '#ff7a1a');
  g.addColorStop(0.5, '#ffc94a');
  g.addColorStop(1, '#ff5a14');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(l, t, o.w, o.h, 6);
  ctx.fill();
  // Dark crust floating on top.
  for (let i = 0; i < Math.max(2, (o.w * o.h) / 900); i++) {
    ctx.fillStyle = 'rgba(60,20,10,0.55)';
    ctx.beginPath();
    ctx.ellipse(l + rand() * o.w, t + rand() * o.h, 4 + rand() * 8, 2 + rand() * 4, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#3a1a10';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(l, t, o.w, o.h, 6);
  ctx.stroke();
}

/** Stone slabs across the four gaps in the moat. */
function paintBridges(ctx: Ctx) {
  const slab = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = '#6b5f57';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#2a2220';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
  };
  for (const sy of [-1, 1]) {
    const y0 = MID + sy * (OH - M / 2) - M / 2;
    for (let k = 0; k < 3; k++) slab(CX - GAP / 2 + 2 + k * ((GAP - 4) / 3), y0 - 4, (GAP - 4) / 3 - 2, M + 8);
  }
  for (const sx of [-1, 1]) {
    const x0 = CX + sx * (OW - M / 2) - M / 2;
    for (let k = 0; k < 3; k++) slab(x0 - 4, MID - GAP / 2 + 2 + k * ((GAP - 4) / 3), M + 8, (GAP - 4) / 3 - 2);
  }
}

function paintObsidian(ctx: Ctx, o: Obstacle) {
  blob(ctx, o.x + 5, o.y + 7, o.w * 0.75, 'rgba(0,0,0,0.5)');
  const pts = [[0, -0.55], [0.45, -0.25], [0.5, 0.3], [0.05, 0.55], [-0.45, 0.35], [-0.5, -0.2]];
  ctx.fillStyle = '#1a1620';
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    const x = o.x + px * o.w;
    const y = o.y + py * o.h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  // Glassy facets.
  ctx.fillStyle = 'rgba(160,140,200,0.25)';
  ctx.beginPath();
  ctx.moveTo(o.x, o.y - o.h * 0.55);
  ctx.lineTo(o.x + o.w * 0.45, o.y - o.h * 0.25);
  ctx.lineTo(o.x, o.y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,110,40,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Rough cave rock around the edge. */
function paintCaveWall(ctx: Ctx, rand: () => number) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#171313';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  for (let i = 0; i < 260; i++) {
    const side = Math.floor(rand() * 4);
    const t = rand();
    const x = side < 2 ? t * WIDTH : side === 2 ? rand() * WALL : WIDTH - rand() * WALL;
    const y = side >= 2 ? top + t * (HEIGHT - top) : side === 0 ? top + rand() * WALL : HEIGHT - rand() * WALL;
    ctx.fillStyle = rand() < 0.5 ? '#2e2624' : '#0e0b0b';
    ctx.beginPath();
    ctx.arc(x, y, 4 + rand() * 7, 0, Math.PI * 2);
    ctx.fill();
  }
}
