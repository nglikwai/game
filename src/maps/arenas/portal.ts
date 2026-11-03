import { paintScenery } from '@/maps/art/renderedProps';
import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintLantern, paintLanternGlow, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from '@/maps/common';

/**
 * 傳送神社 Portal Shrine: three pairs of glowing portals link far corners of the
 * shrine grounds. Step into one and you come out of its partner.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });

const PORTALS = [
  { a: { x: 330, y: 180 }, b: { x: WIDTH - 330, y: 2 * MID - 180 }, color: 0x6ad8ff },
  { a: { x: 330, y: 2 * MID - 180 }, b: { x: WIDTH - 330, y: 180 }, color: 0xff6ad8 },
  { a: { x: CX, y: 150 }, b: { x: CX, y: 2 * MID - 150 }, color: 0xffd23a },
];

const LEFT: Obstacle[] = [
  { kind: 'lantern', x: 480, y: 330, w: 34, h: 34 },
  { kind: 'lantern', x: 480, y: 482, w: 34, h: 34 },
  { kind: 'pillar', x: 230, y: MID, w: 20, h: 90 },
  { kind: 'pillar', x: 560, y: 560, w: 60, h: 20 },
];
const OBSTACLES: Obstacle[] = [
  { kind: 'shrine', x: CX, y: MID, w: 100, h: 70 },
  ...LEFT,
  ...LEFT.map(pm),
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  { x: CX, y: MID - 82, big: true },
  { x: CX, y: MID + 82, big: true },
  // Right by the portals: grab and vanish.
  { x: 400, y: 180, empty: 0.3 },
  pm({ x: 400, y: 180, empty: 0.3 }),
  { x: 400, y: 2 * MID - 180, empty: 0.3 },
  pm({ x: 400, y: 2 * MID - 180, empty: 0.3 }),
];

export const PORTAL: GameMap = {
  id: 'portal',
  name: 'Portal Shrine',
  zh: '傳送神社',
  desc: 'Three pairs of glowing portals link far corners of the shrine. Step into one, come out of its partner.',
  descZh: '三對發光的傳送門連接神社的兩端。踏進一個，就會從另一個出來。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'petals',
  portals: PORTALS,
  paint(ctx, rand) {
    paintMossStone(ctx, rand);
    for (const p of PORTALS) for (const s of [p.a, p.b]) paintRuneCircle(ctx, s, p.color);
    for (const o of OBSTACLES) if (o.kind === 'lantern') paintLanternGlow(ctx, o);
    for (const o of OBSTACLES) paintShadow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'shrine') paintShrine(ctx, o);
      else if (o.kind === 'lantern') paintLantern(ctx, o);
      else if (o.kind === 'pillar') paintStoneWall(ctx, o);
    }
    paintVermilionWall(ctx);
    paintVignette(ctx);
  },
};

function paintMossStone(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#4a5246';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  const S = 34;
  for (let y = ARENA.y; y < ARENA.y + ARENA.h; y += S) {
    for (let x = ARENA.x + ((y / S) % 2 ? S / 2 : 0); x < ARENA.x + ARENA.w; x += S) {
      ctx.fillStyle = `hsl(100, 8%, ${30 + rand() * 10}%)`;
      ctx.beginPath();
      ctx.roundRect(x + 1.5, y + 1.5, S - 3, S - 3, 4);
      ctx.fill();
      if (rand() < 0.25) blob(ctx, x + rand() * S, y + rand() * S, 6, 'rgba(90,130,60,0.5)');
    }
  }
}

/** The carved circle each portal stands on. */
function paintRuneCircle(ctx: Ctx, p: { x: number; y: number }, color: number) {
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = hex;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 28, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22);
    ctx.lineTo(p.x + Math.cos(a) * 28, p.y + Math.sin(a) * 28);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function paintShrine(ctx: Ctx, o: Obstacle) {
  if (paintScenery(ctx, o)) return;
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  ctx.fillStyle = '#8a2a1e';
  ctx.fillRect(l - 6, t - 6, o.w + 12, o.h + 12);
  const g = ctx.createLinearGradient(0, t, 0, t + o.h);
  g.addColorStop(0, '#3a3a44');
  g.addColorStop(0.5, '#24242c');
  g.addColorStop(1, '#3a3a44');
  ctx.fillStyle = g;
  ctx.fillRect(l, t, o.w, o.h);
  ctx.fillStyle = '#d9ae4a';
  ctx.fillRect(l - 4, o.y - 3, o.w + 8, 6);
  ctx.beginPath();
  ctx.arc(o.x, o.y, 8, 0, Math.PI * 2);
  ctx.fill();
}

function paintStoneWall(ctx: Ctx, o: Obstacle) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  ctx.fillStyle = '#6a6a64';
  ctx.fillRect(l, t, o.w, o.h);
  ctx.strokeStyle = '#3a3a36';
  ctx.lineWidth = 1;
  const step = 14;
  if (o.h > o.w) for (let y = t + step; y < t + o.h; y += step) ctx.strokeRect(l, t, o.w, y - t);
  else for (let x = l + step; x < l + o.w; x += step) ctx.strokeRect(l, t, x - l, o.h);
  ctx.strokeRect(l, t, o.w, o.h);
}

function paintVermilionWall(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#a8321e';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.fillStyle = '#e8e0cc';
  ctx.fillRect(0, top, WIDTH, 4);
  ctx.fillRect(0, HEIGHT - 4, WIDTH, 4);
  ctx.strokeStyle = '#d9ae4a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
