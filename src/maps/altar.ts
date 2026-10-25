import { HEIGHT, HUD_HEIGHT, WIDTH } from '../config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle, type TerrainZone,
} from './common';

/**
 * 魂之祭壇 Soul Altar: king of the hill. A team (or fighter) standing on the altar
 * with no enemy on it charges 魂 and 體力 fast. A ring of stone pillars guards it.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });

const ALTAR_ZONE: TerrainZone = { kind: 'altar', x: CX, y: MID, w: 110, h: 110 };

/** Six pillars round the altar, with gaps between them to fight through. */
const RING: Obstacle[] = Array.from({ length: 6 }, (_, k) => {
  const a = Math.PI / 6 + (k * Math.PI) / 3;
  return { kind: 'pillar' as const, x: CX + Math.cos(a) * 135, y: MID + Math.sin(a) * 100, w: 30, h: 30 };
});
const LEFT: Obstacle[] = [
  { kind: 'statue', x: 380, y: 230, w: 38, h: 38 },
  { kind: 'rock', x: 300, y: 570, w: 44, h: 32 },
  { kind: 'statue', x: 500, y: 640, w: 34, h: 34 },
];
const OBSTACLES: Obstacle[] = [...RING, ...LEFT, ...LEFT.map(pm)];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  { x: CX, y: ARENA.y + 40, big: true },
  { x: CX, y: ARENA.y + ARENA.h - 40, big: true },
  { x: 460, y: MID, empty: 0.3 },
  pm({ x: 460, y: MID, empty: 0.3 }),
];

export const ALTAR_MAP: GameMap = {
  id: 'altar',
  name: 'Soul Altar',
  zh: '魂之祭壇',
  desc: 'King of the hill: stand on the altar with no enemy on it to charge 魂 (soul) and 體力 fast.',
  descZh: '搶佔祭壇：站在祭壇上而且沒有敵人時，魂和體力會快速累積。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'wisps',
  zones: [ALTAR_ZONE],
  paint(ctx, rand) {
    paintDarkStone(ctx, rand);
    paintAltar(ctx);
    for (const o of OBSTACLES) paintShadow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'pillar') paintPillar(ctx, o);
      else if (o.kind === 'statue') paintStatue(ctx, o);
      else if (o.kind === 'rock') paintRock(ctx, o);
    }
    paintTempleBorder(ctx);
    paintVignette(ctx);
  },
};

function paintDarkStone(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#2a2434';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  const S = 36;
  for (let y = ARENA.y; y < ARENA.y + ARENA.h; y += S) {
    for (let x = ARENA.x + ((y / S) % 2 ? S / 2 : 0); x < ARENA.x + ARENA.w; x += S) {
      ctx.fillStyle = `hsl(265, 12%, ${16 + rand() * 7}%)`;
      ctx.fillRect(x + 1, y + 1, S - 2, S - 2);
    }
  }
  // Paths of candles leading in.
  for (const [x, y] of [[300, MID], [WIDTH - 300, MID], [CX, 200], [CX, 2 * MID - 200]]) {
    blob(ctx, x, y, 14, 'rgba(255,190,90,0.25)');
    ctx.fillStyle = '#f2e6d0';
    ctx.fillRect(x - 2, y - 4, 4, 8);
    ctx.fillStyle = '#ffb03a';
    ctx.beginPath();
    ctx.arc(x, y - 6, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The altar: a carved round stone with a rune ring (the live glow is drawn by the scene). */
function paintAltar(ctx: Ctx) {
  const r = ALTAR_ZONE.w / 2;
  ctx.fillStyle = '#4a4058';
  ctx.beginPath();
  ctx.arc(CX, MID, r + 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a3248';
  ctx.beginPath();
  ctx.arc(CX, MID, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(181,123,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(CX, MID, r - 10, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(a) * (r - 10), MID + Math.sin(a) * (r - 10));
    ctx.lineTo(CX + Math.cos(a) * (r - 20), MID + Math.sin(a) * (r - 20));
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(181,123,255,0.8)';
  ctx.font = 'bold 34px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('魂', CX, MID + 2);
}

function paintPillar(ctx: Ctx, o: Obstacle) {
  const r = o.w / 2;
  const g = ctx.createRadialGradient(o.x - r * 0.3, o.y - r * 0.3, 2, o.x, o.y, r);
  g.addColorStop(0, '#8a8098');
  g.addColorStop(1, '#3a3448');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(181,123,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function paintStatue(ctx: Ctx, o: Obstacle) {
  ctx.fillStyle = '#4a4458';
  ctx.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
  ctx.fillStyle = '#6a6278';
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.w * 0.33, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b57bff';
  ctx.beginPath();
  ctx.arc(o.x - 4, o.y - 2, 2, 0, Math.PI * 2);
  ctx.arc(o.x + 4, o.y - 2, 2, 0, Math.PI * 2);
  ctx.fill();
}

function paintRock(ctx: Ctx, o: Obstacle) {
  ctx.fillStyle = '#4a4454';
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function paintTempleBorder(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#1a1622';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.strokeStyle = '#b57bff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
  ctx.strokeStyle = 'rgba(181,123,255,0.3)';
  ctx.strokeRect(5, top + 5, WIDTH - 10, HEIGHT - top - 10);
}
