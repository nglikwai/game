import { paintScenery } from '@/maps/art/renderedProps';
import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, mirrored,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from '@/maps/common';

/**
 * 夜之城下町 Castle Town at night: wooden houses form streets, alleys and a central
 * plaza with a well. Paper lanterns glow under the moon.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;

const HOUSES: Obstacle[] = [
  // Long rows along the top and bottom streets.
  ...[[330, ARENA.y + 56], [WIDTH - 330, ARENA.y + 56], [330, ARENA.y + ARENA.h - 56], [WIDTH - 330, ARENA.y + ARENA.h - 56]]
    .map(([x, y]) => ({ kind: 'house' as const, x, y, w: 220, h: 80 })),
  // Four houses boxing in the plaza, leaving alleys between them.
  ...[[CX - 120, MID - 120], [CX + 120, MID - 120], [CX - 120, MID + 120], [CX + 120, MID + 120]]
    .map(([x, y]) => ({ kind: 'house' as const, x, y, w: 130, h: 70 })),
];

const OBSTACLES: Obstacle[] = [
  ...HOUSES,
  { kind: 'well', x: CX, y: MID, w: 56, h: 56 },
  ...[[200, MID - 40], [WIDTH - 200, MID + 40]].map(([x, y]) => ({ kind: 'barrel' as const, x, y, w: 34, h: 34 })),
];

/** Paper lanterns strung along the streets (decoration only). */
const LANTERNS = [
  [CX - 60, ARENA.y + 30], [CX + 60, ARENA.y + 30], [CX - 60, ARENA.y + ARENA.h - 30], [CX + 60, ARENA.y + ARENA.h - 30],
  [CX - 200, MID - 120], [CX + 200, MID + 120], [CX - 200, MID + 120], [CX + 200, MID - 120],
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1),
  ...cornerPile(-1, 1),
  ...cornerPile(1, -1),
  ...cornerPile(-1, -1),
  // In the alleys between the plaza houses.
  { x: CX, y: MID - 120 },
  { x: CX, y: MID + 120 },
  // Beside the well: the contested middle.
  { x: CX - 80, y: MID, empty: 0.2 },
  { x: CX + 80, y: MID, empty: 0.2 },
  // Big ones in the middle of the top and bottom streets.
  { x: CX, y: ARENA.y + 44, big: true },
  { x: CX, y: ARENA.y + ARENA.h - 44, big: true },
  // Behind the barrels.
  ...mirrored([{ x: 110, y: MID - 120 }], true).filter((_, i) => i === 0 || i === 3),
];

export const TOWN: GameMap = {
  id: 'town',
  name: 'Castle Town',
  zh: '夜之城下町',
  desc: 'Night streets and alleys around a plaza with a well. Fight round the corners.',
  descZh: '月夜下的街道與小巷，中央廣場有一口井。利用轉角作戰。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'fireflies',
  paint(ctx, rand) {
    paintStreets(ctx, rand);
    for (const h of HOUSES) paintHouseGlow(ctx, h);
    for (const h of HOUSES) paintHouse(ctx, h, rand);
    paintWell(ctx, OBSTACLES.find((o) => o.kind === 'well')!);
    for (const o of OBSTACLES) if (o.kind === 'barrel') paintBarrel(ctx, o);
    for (const [x, y] of LANTERNS) paintPaperLantern(ctx, x, y);
    paintTownWall(ctx);
    // Moonlit night: blue tint, darker at the edges.
    ctx.fillStyle = 'rgba(20,30,70,0.25)';
    ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
    const v = ctx.createRadialGradient(CX, MID, 200, CX, MID, 760);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(5,8,25,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
    // The lantern light sits on top of the night tint.
    for (const [x, y] of LANTERNS) blob(ctx, x, y, 70, 'rgba(255,170,80,0.22)');
    blob(ctx, CX, MID, 120, 'rgba(160,190,255,0.12)'); // moonlight on the plaza
  },
};

function paintStreets(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#34363d';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  // Cobbles.
  for (let y = HUD_HEIGHT; y < HEIGHT; y += 16) {
    for (let x = (y / 16) % 2 ? 0 : 9; x < WIDTH; x += 18) {
      const l = 22 + rand() * 9;
      ctx.fillStyle = `hsl(220, 6%, ${l}%)`;
      ctx.beginPath();
      ctx.ellipse(x + rand() * 2, y + rand() * 2, 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Puddles catching the moon.
  for (let i = 0; i < 8; i++) {
    blob(ctx, ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 30 + rand() * 30, 'rgba(120,150,210,0.18)');
  }
}

function paintHouseGlow(ctx: Ctx, h: Obstacle) {
  // Warm light spilling from the windows onto the street.
  blob(ctx, h.x, h.y + h.h / 2 + 6, h.w * 0.45, 'rgba(255,170,80,0.25)');
  blob(ctx, h.x, h.y - h.h / 2 - 6, h.w * 0.45, 'rgba(255,170,80,0.18)');
}

function paintHouse(ctx: Ctx, h: Obstacle, rand: () => number) {
  const l = h.x - h.w / 2;
  const t = h.y - h.h / 2;
  // Shadow, then the tiled roof seen from above with a ridge along its length.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(l + 6, t + 8, h.w, h.h);
  ctx.fillStyle = '#1f232b';
  ctx.fillRect(l - 4, t - 4, h.w + 8, h.h + 8);
  const roof = ctx.createLinearGradient(0, t, 0, t + h.h);
  roof.addColorStop(0, '#525a68');
  roof.addColorStop(0.5, '#3a404c');
  roof.addColorStop(1, '#525a68');
  ctx.fillStyle = roof;
  ctx.fillRect(l, t, h.w, h.h);
  ctx.strokeStyle = 'rgba(15,18,24,0.6)';
  ctx.lineWidth = 1.5;
  for (let x = l + 6; x < l + h.w; x += 9) {
    ctx.beginPath();
    ctx.moveTo(x, t);
    ctx.lineTo(x, h.y - 3);
    ctx.moveTo(x, h.y + 3);
    ctx.lineTo(x, t + h.h);
    ctx.stroke();
  }
  ctx.fillStyle = '#23272f';
  ctx.fillRect(l, h.y - 4, h.w, 8);
  ctx.fillStyle = '#6b7383';
  ctx.fillRect(l - 6, h.y - 5, 8, 10);
  ctx.fillRect(l + h.w - 2, h.y - 5, 8, 10);
  // Moonlight sheen on one slope.
  ctx.fillStyle = 'rgba(170,190,255,0.08)';
  ctx.fillRect(l, t, h.w, h.h / 2 - 4);
  if (rand() < 0.5) {
    // A crest (mon) painted on the end tile.
    ctx.strokeStyle = 'rgba(217,174,74,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(l + 2, h.y, 3, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function paintWell(ctx: Ctx, o: Obstacle) {
  blob(ctx, o.x + 6, o.y + 8, o.w * 0.7, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = '#7d7f86';
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.w / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#45474d';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#10151f';
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.w / 2 - 8, 0, Math.PI * 2);
  ctx.fill();
  blob(ctx, o.x - 4, o.y - 4, 8, 'rgba(160,190,255,0.5)'); // the moon in the water
  // Wooden crossbeam and bucket.
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(o.x - o.w / 2 - 4, o.y - 3, o.w + 8, 6);
  ctx.fillStyle = '#8a5a32';
  ctx.fillRect(o.x + 8, o.y + 6, 10, 9);
}

function paintBarrel(ctx: Ctx, o: Obstacle) {
  if (paintScenery(ctx, o)) return;
  blob(ctx, o.x + 4, o.y + 6, o.w * 0.7, 'rgba(0,0,0,0.5)');
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

function paintPaperLantern(ctx: Ctx, x: number, y: number) {
  blob(ctx, x, y, 34, 'rgba(255,150,60,0.35)');
  ctx.fillStyle = '#d9402a';
  ctx.beginPath();
  ctx.ellipse(x, y, 7, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffcf7a';
  ctx.beginPath();
  ctx.ellipse(x, y, 4, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1e1e22';
  ctx.fillRect(x - 5, y - 10, 10, 2);
  ctx.fillRect(x - 5, y + 8, 10, 2);
}

/** Plastered town wall with a dark tiled cap. */
function paintTownWall(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#20232a';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.strokeStyle = 'rgba(110,120,140,0.5)';
  ctx.lineWidth = 2;
  for (let x = 6; x < WIDTH; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x, top + 3);
    ctx.lineTo(x, top + WALL - 6);
    ctx.moveTo(x, HEIGHT - WALL + 6);
    ctx.lineTo(x, HEIGHT - 3);
    ctx.stroke();
  }
  for (let y = top + 6; y < HEIGHT; y += 10) {
    ctx.beginPath();
    ctx.moveTo(3, y);
    ctx.lineTo(WALL - 6, y);
    ctx.moveTo(WIDTH - WALL + 6, y);
    ctx.lineTo(WIDTH - 3, y);
    ctx.stroke();
  }
  ctx.strokeStyle = '#c9c2b2';
  ctx.lineWidth = 3;
  ctx.strokeRect(WALL - 1.5, top + WALL - 1.5, WIDTH - WALL * 2 + 3, HEIGHT - top - WALL * 2 + 3);
}
