import { HEIGHT, HUD_HEIGHT, WIDTH } from '../config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle, type TerrainZone,
} from './common';

/**
 * 機關工房 Clockwork Workshop: conveyor belts carry anyone standing on them, among
 * spinning gears and clanking machines. Ride a belt to cross fast, or fight against it.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });
const pmBelt = (z: TerrainZone): TerrainZone => ({ ...pm(z), push: z.push && { x: -z.push.x, y: -z.push.y } });

const LEFT_BELTS: TerrainZone[] = [
  { kind: 'wind', x: 640, y: 250, w: 680, h: 46, push: { x: 120, y: 0 } },
  { kind: 'wind', x: 520, y: MID, w: 46, h: 150, push: { x: 0, y: 120 } },
];
const BELTS: TerrainZone[] = [...LEFT_BELTS, ...LEFT_BELTS.map(pmBelt)];

const LEFT: Obstacle[] = [
  { kind: 'gear', x: 380, y: MID, w: 50, h: 50 },
  { kind: 'machine', x: 250, y: 170, w: 70, h: 40 },
  { kind: 'machine', x: 300, y: 640, w: 60, h: 36 },
  { kind: 'gear', x: 620, y: 160, w: 36, h: 36 },
];
const OBSTACLES: Obstacle[] = [
  { kind: 'gear', x: CX, y: MID, w: 70, h: 70 },
  ...LEFT,
  ...LEFT.map(pm),
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  // Riding the belts.
  { x: 470, y: 250, empty: 0.3 },
  pm({ x: 470, y: 250, empty: 0.3 }),
  { x: CX, y: MID - 90, big: true },
  { x: CX, y: MID + 90, big: true },
  { x: 440, y: 560, empty: 0.4 },
  pm({ x: 440, y: 560, empty: 0.4 }),
];

export const WORKSHOP: GameMap = {
  id: 'workshop',
  name: 'Clockwork Workshop',
  zh: '機關工房',
  desc: 'Conveyor belts carry anyone standing on them, among spinning gears and machines. Ride them or fight them.',
  descZh: '輸送帶會把站在上面的人帶走，四周是齒輪與機關。可以順著走，也可以逆著走。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'dust',
  zones: BELTS,
  paint(ctx, rand) {
    paintPlanks(ctx, rand);
    for (const z of BELTS) paintBelt(ctx, z);
    for (const o of OBSTACLES) paintShadow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'gear') paintGear(ctx, o);
      else if (o.kind === 'machine') paintMachine(ctx, o, rand);
    }
    paintIronBorder(ctx);
    paintVignette(ctx);
  },
};

function paintPlanks(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#5a4430';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let y = ARENA.y; y < ARENA.y + ARENA.h; y += 16) {
    let x = ARENA.x - rand() * 80;
    while (x < ARENA.x + ARENA.w) {
      const len = 60 + rand() * 80;
      ctx.fillStyle = `hsl(28, 32%, ${24 + rand() * 8}%)`;
      ctx.fillRect(x + 1, y + 1, len - 2, 14);
      x += len;
    }
  }
  for (let i = 0; i < 20; i++) blob(ctx, ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 20 + rand() * 20, 'rgba(20,14,8,0.25)');
}

/** A rubber belt between steel rails, with arrows the way it runs. */
function paintBelt(ctx: Ctx, z: TerrainZone) {
  const l = z.x - z.w / 2;
  const t = z.y - z.h / 2;
  ctx.fillStyle = '#26262c';
  ctx.fillRect(l, t, z.w, z.h);
  ctx.fillStyle = '#8a909a';
  const horiz = z.w > z.h;
  if (horiz) {
    ctx.fillRect(l, t, z.w, 4);
    ctx.fillRect(l, t + z.h - 4, z.w, 4);
  } else {
    ctx.fillRect(l, t, 4, z.h);
    ctx.fillRect(l + z.w - 4, t, 4, z.h);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  for (let d = 6; d < (horiz ? z.w : z.h); d += 12) {
    ctx.beginPath();
    if (horiz) {
      ctx.moveTo(l + d, t + 4);
      ctx.lineTo(l + d, t + z.h - 4);
    } else {
      ctx.moveTo(l + 4, t + d);
      ctx.lineTo(l + z.w - 4, t + d);
    }
    ctx.stroke();
  }
  const p = z.push!;
  const ux = Math.sign(p.x);
  const uy = Math.sign(p.y);
  ctx.fillStyle = 'rgba(242,201,76,0.6)';
  for (let d = 30; d < (horiz ? z.w : z.h); d += 70) {
    const cx = horiz ? l + d : z.x;
    const cy = horiz ? z.y : t + d;
    ctx.beginPath();
    ctx.moveTo(cx + ux * 9 + uy * 0, cy + uy * 9);
    ctx.lineTo(cx - ux * 6 - uy * 8, cy - uy * 6 + ux * 8);
    ctx.lineTo(cx - ux * 6 + uy * 8, cy - uy * 6 - ux * 8);
    ctx.fill();
  }
}

function paintGear(ctx: Ctx, o: Obstacle) {
  const r = o.w / 2;
  const teeth = Math.round(r / 3);
  ctx.fillStyle = '#9a8a5a';
  ctx.beginPath();
  for (let k = 0; k < teeth * 2; k++) {
    const a = (k / (teeth * 2)) * Math.PI * 2;
    const rr = k % 2 ? r * 0.82 : r;
    ctx.lineTo(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr);
  }
  ctx.fill();
  ctx.fillStyle = '#6a5a34';
  ctx.beginPath();
  ctx.arc(o.x, o.y, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a2418';
  ctx.beginPath();
  ctx.arc(o.x, o.y, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c9b06a';
  ctx.lineWidth = 2;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(o.x + Math.cos(a) * r * 0.2, o.y + Math.sin(a) * r * 0.2);
    ctx.lineTo(o.x + Math.cos(a) * r * 0.55, o.y + Math.sin(a) * r * 0.55);
    ctx.stroke();
  }
}

/** A clanking machine: iron box, rivets, a pipe and a pressure gauge. */
function paintMachine(ctx: Ctx, o: Obstacle, rand: () => number) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  ctx.fillStyle = '#4a4e56';
  ctx.fillRect(l, t, o.w, o.h);
  ctx.strokeStyle = '#22252b';
  ctx.lineWidth = 2;
  ctx.strokeRect(l, t, o.w, o.h);
  ctx.fillStyle = '#8a909a';
  for (const [x, y] of [[l + 4, t + 4], [l + o.w - 4, t + 4], [l + 4, t + o.h - 4], [l + o.w - 4, t + o.h - 4]]) {
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#e8e0cc';
  ctx.beginPath();
  ctx.arc(l + o.w * 0.3, o.y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(l + o.w * 0.3, o.y);
  ctx.lineTo(l + o.w * 0.3 + Math.cos(rand() * 3) * 6, o.y - 4);
  ctx.stroke();
  ctx.fillStyle = '#9a6a34';
  ctx.fillRect(l + o.w * 0.55, t - 6, 8, o.h + 12);
}

function paintIronBorder(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#34363c';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.fillStyle = '#8a909a';
  for (let x = 8; x < WIDTH; x += 30) {
    ctx.beginPath();
    ctx.arc(x, top + WALL / 2, 2.5, 0, Math.PI * 2);
    ctx.arc(x, HEIGHT - WALL / 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Hazard stripes along the inner edge.
  for (let x = WALL; x < WIDTH - WALL; x += 20) {
    ctx.fillStyle = (x / 20) % 2 < 1 ? '#f2c94c' : '#22252b';
    ctx.fillRect(x, top + WALL - 4, 10, 4);
    ctx.fillRect(x, HEIGHT - WALL, 10, 4);
  }
}
