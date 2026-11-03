import { paintScenery } from '@/maps/art/renderedProps';
import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from '@/maps/common';
import { paintLavaPool } from '@/maps/quest/underworld';

/**
 * 火山口 Volcano Crater: a lava lake in the middle and fire vents all around it.
 * Every few seconds two vents glow, rumble and erupt, burning anyone standing on them.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });

const LEFT_VENTS = [{ x: 420, y: 300 }, { x: 430, y: 520 }, { x: 540, y: 250 }];
const VENTS = [...LEFT_VENTS, ...LEFT_VENTS.map(pm)];

const LEFT: Obstacle[] = [
  { kind: 'obsidian', x: 300, y: 180, w: 40, h: 30 },
  { kind: 'obsidian', x: 330, y: 640, w: 44, h: 30 },
  { kind: 'obsidian', x: 560, y: 470, w: 40, h: 34 },
];
const OBSTACLES: Obstacle[] = [
  { kind: 'lava', low: true, x: CX, y: MID, w: 170, h: 100 },
  ...LEFT,
  ...LEFT.map(pm),
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  { x: CX, y: MID - 82, big: true },
  { x: CX, y: MID + 82, big: true },
  { x: 480, y: 410, empty: 0.3 },
  pm({ x: 480, y: 410, empty: 0.3 }),
];

export const VOLCANO: GameMap = {
  id: 'volcano',
  name: 'Volcano Crater',
  zh: '火山口',
  desc: 'Fire vents ring a lava lake. Two of them erupt and leave flames on the ground; step on the fire and you burn.',
  descZh: '熔岩湖周圍布滿火山噴口。噴發後火焰會留在地上，踩上去會被灼傷。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'embers',
  vents: { spots: VENTS, interval: 4, count: 2, radius: 40, damage: 16, warn: 1.3 },
  paint(ctx, rand) {
    paintBasalt(ctx, rand);
    for (const v of VENTS) paintVent(ctx, v);
    paintLavaPool(ctx, OBSTACLES[0], rand);
    for (const o of OBSTACLES) if (!o.low) paintShadow(ctx, o);
    for (const o of OBSTACLES) if (o.kind === 'obsidian') paintObsidian(ctx, o);
    paintCraterRim(ctx, rand);
    paintVignette(ctx);
  },
};

function paintBasalt(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#2e2622';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  // Hexagonal basalt columns, seen from above.
  const R = 18;
  for (let row = 0, y = ARENA.y; y < ARENA.y + ARENA.h + R; row++, y += R * 1.5) {
    for (let x = ARENA.x + (row % 2 ? R * 0.87 : 0); x < ARENA.x + ARENA.w + R; x += R * 1.74) {
      ctx.fillStyle = `hsl(15, 10%, ${14 + rand() * 7}%)`;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        ctx.lineTo(x + Math.cos(a) * (R - 1), y + Math.sin(a) * (R - 1));
      }
      ctx.fill();
    }
  }
  // Ash drifts and a hot glow around the lake.
  for (let i = 0; i < 30; i++) blob(ctx, ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 30 + rand() * 40, 'rgba(120,110,100,0.15)');
  const g = ctx.createRadialGradient(CX, MID, 40, CX, MID, 260);
  g.addColorStop(0, 'rgba(255,90,20,0.25)');
  g.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(CX - 260, MID - 260, 520, 520);
}

/** A vent: a cracked crater with a molten core. */
function paintVent(ctx: Ctx, v: { x: number; y: number }) {
  ctx.fillStyle = '#1a1210';
  ctx.beginPath();
  ctx.arc(v.x, v.y, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5a3a2a';
  ctx.lineWidth = 3;
  ctx.stroke();
  const g = ctx.createRadialGradient(v.x, v.y, 1, v.x, v.y, 10);
  g.addColorStop(0, '#ffd27a');
  g.addColorStop(1, '#a8260a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(v.x, v.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,120,40,0.6)';
  ctx.lineWidth = 1.5;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(v.x + Math.cos(a) * 12, v.y + Math.sin(a) * 12);
    ctx.lineTo(v.x + Math.cos(a) * 30, v.y + Math.sin(a) * 30);
    ctx.stroke();
  }
}

function paintObsidian(ctx: Ctx, o: Obstacle) {
  if (paintScenery(ctx, o)) return;
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  ctx.fillStyle = '#14101a';
  ctx.beginPath();
  ctx.moveTo(l + 6, t);
  ctx.lineTo(l + o.w, t + 6);
  ctx.lineTo(l + o.w - 4, t + o.h);
  ctx.lineTo(l, t + o.h - 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(170,130,230,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function paintCraterRim(ctx: Ctx, rand: () => number) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#1e1612';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  for (let i = 0; i < 100; i++) {
    const x = rand() * WIDTH;
    const y = top + rand() * (HEIGHT - top);
    if (x > WALL && x < WIDTH - WALL && y > top + WALL && y < HEIGHT - WALL) continue;
    blob(ctx, x, y, 5 + rand() * 6, 'rgba(90,60,50,0.6)');
  }
  ctx.strokeStyle = '#ff6a1a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
