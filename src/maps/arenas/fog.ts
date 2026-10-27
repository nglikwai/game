import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle, type TerrainZone,
} from '@/maps/common';

/**
 * 濃霧森林 Fog Forest: thick fog banks drift between the trees. Anyone inside one is
 * hard to see (a faint shape, no name), and CPUs and towers lose track of them until
 * they're right next to them. Perfect for ambushes.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const pm = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y });

const LEFT_FOG: TerrainZone[] = [
  { kind: 'fog', x: 380, y: 230, w: 170, h: 120 },
  { kind: 'fog', x: 470, y: 575, w: 190, h: 110 },
];
const FOG: TerrainZone[] = [{ kind: 'fog', x: CX, y: MID, w: 260, h: 150 }, ...LEFT_FOG, ...LEFT_FOG.map(pm)];

const LEFT: Obstacle[] = [
  { kind: 'deadtree', x: 300, y: 420, w: 40, h: 40 },
  { kind: 'deadtree', x: 560, y: 190, w: 36, h: 36 },
  { kind: 'deadtree', x: 220, y: 640, w: 38, h: 38 },
  { kind: 'rock', x: 560, y: 470, w: 40, h: 30 },
  { kind: 'deadtree', x: 470, y: 330, w: 34, h: 34 },
];
const OBSTACLES: Obstacle[] = [...LEFT, ...LEFT.map(pm)];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  // Hidden in the fog.
  { x: CX, y: MID, big: true },
  { x: 380, y: 230, empty: 0.3 },
  pm({ x: 380, y: 230, empty: 0.3 }),
  { x: 470, y: 575, empty: 0.4 },
  pm({ x: 470, y: 575, empty: 0.4 }),
];

export const FOG_FOREST: GameMap = {
  id: 'fog',
  name: 'Fog Forest',
  zh: '濃霧森林',
  desc: 'Thick fog banks hide anyone inside them; CPUs and towers lose track of you until they are right next to you.',
  descZh: '濃霧會遮住霧中的人；電腦和箭塔看不見你，除非貼得很近。最適合埋伏。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'mist',
  zones: FOG,
  paint(ctx, rand) {
    paintForestFloor(ctx, rand);
    for (const z of FOG) blob(ctx, z.x, z.y, Math.max(z.w, z.h) * 0.55, 'rgba(210,220,225,0.12)');
    for (const o of OBSTACLES) paintShadow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'deadtree') paintTree(ctx, o, rand);
      else if (o.kind === 'rock') paintMossRock(ctx, o);
    }
    paintHedgeBorder(ctx, rand);
    ctx.fillStyle = 'rgba(40,60,60,0.15)';
    ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
    paintVignette(ctx);
  },
};

function paintForestFloor(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#2e4030';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let i = 0; i < 70; i++) {
    blob(ctx, rand() * WIDTH, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT), 30 + rand() * 60, rand() < 0.5 ? 'rgba(60,80,50,0.4)' : 'rgba(20,28,20,0.4)');
  }
  // Fallen needles, ferns and pale mushrooms.
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(110,90,60,0.5)' : 'rgba(80,120,70,0.5)';
    ctx.fillRect(ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 1.5, 4);
  }
  for (let i = 0; i < 30; i++) blob(ctx, ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 3, '#e8dcc0');
}

/** A big old tree seen from above: dark canopy, lighter clumps. */
function paintTree(ctx: Ctx, o: Obstacle, rand: () => number) {
  const r = o.w * 0.75;
  ctx.fillStyle = '#1a2e1c';
  ctx.beginPath();
  ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
  ctx.fill();
  for (let k = 0; k < 6; k++) {
    const a = rand() * Math.PI * 2;
    blob(ctx, o.x + Math.cos(a) * r * 0.45, o.y + Math.sin(a) * r * 0.45, r * 0.45, rand() < 0.5 ? '#2a4a2c' : '#24402a');
  }
  blob(ctx, o.x - r * 0.2, o.y - r * 0.25, r * 0.3, 'rgba(120,160,100,0.35)');
}

function paintMossRock(ctx: Ctx, o: Obstacle) {
  ctx.fillStyle = '#4a4e44';
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0.2, 0, Math.PI * 2);
  ctx.fill();
  blob(ctx, o.x - 4, o.y - 4, o.w * 0.35, 'rgba(90,130,50,0.7)');
}

function paintHedgeBorder(ctx: Ctx, rand: () => number) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#16241a';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  for (let i = 0; i < 200; i++) {
    const x = rand() * WIDTH;
    const y = top + rand() * (HEIGHT - top);
    if (x > WALL && x < WIDTH - WALL && y > top + WALL && y < HEIGHT - WALL) continue;
    blob(ctx, x, y, 6 + rand() * 6, rand() < 0.5 ? '#24402a' : '#2e4a30');
  }
}
