import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle, type TerrainZone,
} from '@/maps/common';
import { paintPalm } from '@/maps/arenas/desert';

/**
 * 沉船海灘 Shipwreck Beach: the sea laps along the top and bottom (the surf slows you),
 * and a wrecked ship lies broken in two across the middle, its treasure in the gap.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const TOP = ARENA.y;
const BOTTOM = ARENA.y + ARENA.h;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });

const SEA_H = 42;
const SURF_H = 44;
const SURF: TerrainZone[] = [
  { kind: 'shallows', x: CX, y: TOP + SEA_H + SURF_H / 2, w: ARENA.w, h: SURF_H },
  { kind: 'shallows', x: CX, y: BOTTOM - SEA_H - SURF_H / 2, w: ARENA.w, h: SURF_H },
];

const LEFT: Obstacle[] = [
  { kind: 'wreck', x: CX - 85, y: MID, w: 100, h: 70 },
  { kind: 'palm', x: 230, y: 300, w: 26, h: 26 },
  { kind: 'palm', x: 470, y: 520, w: 26, h: 26 },
  { kind: 'barrel', x: 520, y: 300, w: 22, h: 22 },
  { kind: 'rock', x: 360, y: 230, w: 48, h: 34 },
  { kind: 'pond', low: true, x: 330, y: 470, w: 70, h: 40 },
];
const OBSTACLES: Obstacle[] = [
  { kind: 'sea', low: true, x: CX, y: TOP + SEA_H / 2, w: ARENA.w, h: SEA_H },
  { kind: 'sea', low: true, x: CX, y: BOTTOM - SEA_H / 2, w: ARENA.w, h: SEA_H },
  ...LEFT,
  ...LEFT.map(pm),
];

/** Corner piles sit up the beach, clear of the sea. */
const corner = (x: number, y: number): ChestSpot[] => [{ x, y, empty: 0.6 }, { x: x + (x < CX ? 40 : -40), y, empty: 0.6 }];
const CHESTS: ChestSpot[] = [
  ...corner(ARENA.x + 26, TOP + 120), ...corner(ARENA.x + ARENA.w - 26, TOP + 120),
  ...corner(ARENA.x + 26, BOTTOM - 120), ...corner(ARENA.x + ARENA.w - 26, BOTTOM - 120),
  // The ship's treasure, right in the gap between the two halves of the hull.
  { x: CX, y: MID, big: true },
  // Washed up in the surf.
  { x: 420, y: TOP + SEA_H + SURF_H / 2 },
  pm({ x: 420, y: TOP + SEA_H + SURF_H / 2 }),
  { x: 360, y: 300, empty: 0.4 },
  pm({ x: 360, y: 300, empty: 0.4 }),
];

export const BEACH: GameMap = {
  id: 'beach',
  name: 'Shipwreck Beach',
  zh: '沉船海灘',
  desc: 'The sea laps along the top and bottom (the surf slows you). A wreck lies broken in two, its treasure in the gap.',
  descZh: '上下兩側是大海，淺灘會減速。沉船斷成兩截橫在中央，寶藏就在裂縫中。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'mist',
  zones: SURF,
  paint(ctx, rand) {
    paintBeachSand(ctx, rand);
    paintSea(ctx, rand);
    for (const o of OBSTACLES) if (o.kind === 'pond') paintTidePool(ctx, o, rand);
    // Round things cast soft round shadows; only the hull gets a hard one.
    for (const o of OBSTACLES) if (o.kind === 'wreck') paintShadow(ctx, o);
    for (const o of OBSTACLES) if (o.kind === 'rock' || o.kind === 'barrel') blob(ctx, o.x + 5, o.y + 7, o.w * 0.55, 'rgba(0,0,0,0.25)');
    for (const o of OBSTACLES) {
      if (o.kind === 'wreck') paintHull(ctx, o, o.x < CX ? 1 : -1);
      else if (o.kind === 'palm') paintPalm(ctx, o, rand);
      else if (o.kind === 'barrel') paintBarrel(ctx, o);
      else if (o.kind === 'rock') paintBeachRock(ctx, o);
    }
    paintMast(ctx);
    paintShells(ctx, rand);
    paintDriftwoodBorder(ctx);
    paintVignette(ctx);
  },
};

function paintBeachSand(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#e8d0a0';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let i = 0; i < 50; i++) {
    blob(ctx, rand() * WIDTH, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT), 40 + rand() * 60, rand() < 0.5 ? 'rgba(250,230,190,0.4)' : 'rgba(200,170,120,0.25)');
  }
}

function paintSea(ctx: Ctx, rand: () => number) {
  for (const [top, dir] of [[TOP, 1], [BOTTOM, -1]] as const) {
    const y0 = dir > 0 ? top : top - SEA_H - SURF_H;
    // Wet sand / surf, then deep water at the edge.
    const g = ctx.createLinearGradient(0, dir > 0 ? top : top, 0, dir > 0 ? top + SEA_H + SURF_H : top - SEA_H - SURF_H);
    g.addColorStop(0, '#1e6a9a');
    g.addColorStop(SEA_H / (SEA_H + SURF_H), '#3aa8c8');
    g.addColorStop(1, 'rgba(120,210,220,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(ARENA.x, y0, ARENA.w, SEA_H + SURF_H);
    // Foam lines along the shore.
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    for (const off of [SEA_H, SEA_H + 16, SEA_H + 30]) {
      ctx.beginPath();
      for (let x = ARENA.x; x <= ARENA.x + ARENA.w; x += 12) {
        const y = top + dir * (off + Math.sin(x * 0.05 + off + rand() * 0.3) * 4);
        if (x === ARENA.x) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    }
  }
}

function paintTidePool(ctx: Ctx, o: Obstacle, rand: () => number) {
  ctx.fillStyle = '#8a8070';
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2 + 6, o.h / 2 + 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4ab8c8';
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 2; i++) paintStar(ctx, o.x + (rand() - 0.5) * o.w * 0.5, o.y + (rand() - 0.5) * o.h * 0.4, '#e8603a');
}

/** Half of the broken hull: planked deck inside a curved hull, the broken end jagged. */
function paintHull(ctx: Ctx, o: Obstacle, dir: number) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  const bow = dir > 0 ? l : l + o.w;
  const broken = dir > 0 ? l + o.w : l;
  ctx.fillStyle = '#4a2e18';
  ctx.beginPath();
  ctx.moveTo(bow - dir * 24, o.y);
  ctx.quadraticCurveTo(bow, t - 6, broken, t - 4);
  for (let k = 0; k <= 6; k++) ctx.lineTo(broken + dir * (k % 2 ? 8 : 0), t - 4 + ((o.h + 8) * k) / 6);
  ctx.quadraticCurveTo(bow, t + o.h + 6, bow - dir * 24, o.y);
  ctx.fill();
  ctx.fillStyle = '#8a6a44';
  ctx.fillRect(l + 6, t + 4, o.w - 12, o.h - 8);
  ctx.strokeStyle = 'rgba(40,24,10,0.6)';
  ctx.lineWidth = 1;
  for (let y = t + 4; y < t + o.h - 4; y += 8) {
    ctx.beginPath();
    ctx.moveTo(l + 6, y);
    ctx.lineTo(l + o.w - 6, y);
    ctx.stroke();
  }
  // A hole in the deck.
  ctx.fillStyle = '#1a0e06';
  ctx.beginPath();
  ctx.ellipse(o.x + dir * 10, o.y + 6, 10, 7, 0.4, 0, Math.PI * 2);
  ctx.fill();
}

/** The fallen mast lying across the sand by the wreck (decoration only). */
function paintMast(ctx: Ctx) {
  ctx.strokeStyle = '#5a3a1e';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(CX - 40, MID - 70);
  ctx.lineTo(CX + 120, MID - 120);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = 'rgba(240,230,210,0.85)';
  ctx.beginPath();
  ctx.moveTo(CX + 20, MID - 82);
  ctx.lineTo(CX + 90, MID - 108);
  ctx.lineTo(CX + 70, MID - 70);
  ctx.closePath();
  ctx.fill();
}

function paintBarrel(ctx: Ctx, o: Obstacle) {
  ctx.fillStyle = '#7a4e28';
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.w / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a2a1a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.w / 2 - 3, 0, Math.PI * 2);
  ctx.stroke();
}

function paintBeachRock(ctx: Ctx, o: Obstacle) {
  ctx.fillStyle = '#6a645a';
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0.3, 0, Math.PI * 2);
  ctx.fill();
  blob(ctx, o.x + 6, o.y + 4, 8, 'rgba(40,90,60,0.5)');
}

function paintStar(ctx: Ctx, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
    const r = k % 2 ? 2.5 : 6;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.fill();
}

function paintShells(ctx: Ctx, rand: () => number) {
  for (let i = 0; i < 40; i++) {
    const x = ARENA.x + rand() * ARENA.w;
    const y = TOP + SEA_H + SURF_H + rand() * (ARENA.h - 2 * (SEA_H + SURF_H));
    if (rand() < 0.25) paintStar(ctx, x, y, rand() < 0.5 ? '#e8803a' : '#d85a6a');
    else blob(ctx, x, y, 2.5, rand() < 0.5 ? '#fff4e0' : '#f0c8b0');
  }
}

function paintDriftwoodBorder(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#1e5a8a';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillStyle = '#8a7050';
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.strokeStyle = 'rgba(60,40,20,0.5)';
  ctx.lineWidth = 1;
  for (let y = top; y < HEIGHT; y += 14) {
    ctx.beginPath();
    ctx.moveTo(2, y);
    ctx.lineTo(WALL - 2, y + 6);
    ctx.moveTo(WIDTH - WALL + 2, y);
    ctx.lineTo(WIDTH - 2, y + 6);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
