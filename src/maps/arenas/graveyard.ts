import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, mirrored, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from '@/maps/common';

/**
 * 古墓夜 Haunted Graveyard: a misty night among rows of tombstones, a stone
 * mausoleum in the middle and bare dead trees. Will-o'-wisps drift about.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;

/** Rows of small gravestones on one side (mirrored to the other). */
const GRAVES_LEFT: Obstacle[] = [
  [340, MID - 250], [390, MID - 250], [340, MID - 90], [390, MID - 90],
  [340, MID + 90], [390, MID + 90], [340, MID + 250], [390, MID + 250],
  [560, MID - 60], [560, MID + 60],
].map(([x, y]) => ({ kind: 'grave' as const, x, y, w: 22, h: 14 }));

const OBSTACLES: Obstacle[] = [
  { kind: 'tomb', x: CX, y: MID, w: 110, h: 70 },
  ...GRAVES_LEFT,
  ...GRAVES_LEFT.map((o) => ({ ...o, x: WIDTH - o.x, y: 2 * MID - o.y })),
  { kind: 'deadtree', x: 560, y: ARENA.y + 70, w: 40, h: 40 },
  { kind: 'deadtree', x: WIDTH - 560, y: ARENA.y + ARENA.h - 70, w: 40, h: 40 },
  { kind: 'deadtree', x: 420, y: ARENA.y + ARENA.h - 40, w: 36, h: 36 },
  { kind: 'deadtree', x: WIDTH - 420, y: ARENA.y + 40, w: 36, h: 36 },
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1),
  ...cornerPile(-1, 1),
  ...cornerPile(1, -1),
  ...cornerPile(-1, -1),
  // Offerings on either side of the mausoleum.
  { x: CX - 90, y: MID, empty: 0.2 },
  { x: CX + 90, y: MID, empty: 0.2 },
  // Grave goods at the top and bottom.
  { x: CX, y: ARENA.y + 40, big: true },
  { x: CX, y: ARENA.y + ARENA.h - 40, big: true },
  // Hidden between the gravestone rows.
  ...mirrored([{ x: 365, y: MID - 170, empty: 0.3 }], true),
];

export const GRAVEYARD: GameMap = {
  id: 'graveyard',
  name: 'Haunted Graveyard',
  zh: '古墓夜',
  desc: 'A misty night among rows of tombstones, with a mausoleum in the middle. Lots of cover, short sight lines.',
  descZh: '迷霧籠罩的夜晚墓地，一排排墓碑，中央有座古墓。掩護多，視野短。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'wisps',
  paint(ctx, rand) {
    paintGround(ctx, rand);
    for (const o of OBSTACLES) paintShadow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'tomb') paintTomb(ctx, o);
      else if (o.kind === 'grave') paintGrave(ctx, o, rand);
      else if (o.kind === 'deadtree') paintDeadTree(ctx, o, rand);
    }
    paintMist(ctx, rand);
    paintIronFence(ctx);
    // Moonlit night.
    ctx.fillStyle = 'rgba(20,30,70,0.18)';
    ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
    paintVignette(ctx);
  },
};

/** Dark, patchy grass and a gravel path through the middle. */
function paintGround(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#2a3428';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let i = 0; i < 60; i++) {
    blob(ctx, rand() * WIDTH, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT), 30 + rand() * 60, rand() < 0.5 ? 'rgba(60,72,50,0.35)' : 'rgba(18,22,20,0.35)');
  }
  ctx.fillStyle = '#4a4a4c';
  ctx.fillRect(ARENA.x, MID - 18, ARENA.w, 36);
  ctx.fillRect(CX - 18, ARENA.y, 36, ARENA.h);
  for (let i = 0; i < 900; i++) {
    const onX = rand() < 0.6;
    const x = onX ? ARENA.x + rand() * ARENA.w : CX - 18 + rand() * 36;
    const y = onX ? MID - 18 + rand() * 36 : ARENA.y + rand() * ARENA.h;
    ctx.fillStyle = rand() < 0.5 ? 'rgba(120,120,125,0.6)' : 'rgba(40,40,44,0.6)';
    ctx.fillRect(x, y, 2, 2);
  }
  // Dry grass tufts.
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(110,120,80,0.5)' : 'rgba(70,90,60,0.5)';
    ctx.fillRect(ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 1.5, 3);
  }
}

/** Stone mausoleum with a tiled roof and a little shrine door. */
function paintTomb(ctx: Ctx, o: Obstacle) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  ctx.fillStyle = '#5a5a60';
  ctx.fillRect(l - 6, t - 6, o.w + 12, o.h + 12);
  const g = ctx.createLinearGradient(0, t, 0, t + o.h);
  g.addColorStop(0, '#3a3a48');
  g.addColorStop(0.5, '#262632');
  g.addColorStop(1, '#3a3a48');
  ctx.fillStyle = g;
  ctx.fillRect(l, t, o.w, o.h);
  ctx.strokeStyle = 'rgba(140,140,170,0.35)';
  ctx.lineWidth = 1;
  for (let x = l + 6; x < l + o.w; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, t);
    ctx.lineTo(x, t + o.h);
    ctx.stroke();
  }
  ctx.fillStyle = '#14141c';
  ctx.fillRect(l - 4, o.y - 3, o.w + 8, 6);
  // Faded red seal and incense glow on the front step.
  ctx.fillStyle = '#7a2a2a';
  ctx.fillRect(o.x - 8, t + o.h + 2, 16, 6);
  blob(ctx, o.x, t + o.h + 12, 14, 'rgba(255,170,90,0.25)');
}

function paintGrave(ctx: Ctx, o: Obstacle, rand: () => number) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  ctx.fillStyle = rand() < 0.5 ? '#7a7a80' : '#6a6c70';
  ctx.beginPath();
  ctx.roundRect(l, t, o.w, o.h, [6, 6, 1, 1]);
  ctx.fill();
  ctx.strokeStyle = '#2a2a30';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(30,30,36,0.7)';
  ctx.fillRect(o.x - 1, t + 3, 2, o.h - 6);
  if (rand() < 0.5) blob(ctx, l + 3, t + o.h - 2, 5, 'rgba(80,110,60,0.6)');
}

/** A bare, twisted tree seen from above. */
function paintDeadTree(ctx: Ctx, o: Obstacle, rand: () => number) {
  ctx.strokeStyle = '#2a1e18';
  ctx.lineCap = 'round';
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    if (depth > 0) {
      branch(x2, y2, a - 0.5 + rand() * 0.2, len * 0.65, w * 0.6, depth - 1);
      branch(x2, y2, a + 0.4 + rand() * 0.2, len * 0.6, w * 0.6, depth - 1);
    }
  };
  for (let k = 0; k < 5; k++) branch(o.x, o.y, (k / 5) * Math.PI * 2 + rand() * 0.4, o.w * 0.45, 4, 2);
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#3a2a20';
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.w * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

function paintMist(ctx: Ctx, rand: () => number) {
  for (let i = 0; i < 26; i++) blob(ctx, ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 50 + rand() * 70, 'rgba(170,190,220,0.08)');
  // A few painted wisp glows.
  for (let i = 0; i < 8; i++) blob(ctx, ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 10, 'rgba(120,190,255,0.3)');
}

/** Black iron railings around the cemetery. */
function paintIronFence(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#141418';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.fillStyle = '#4a4a56';
  for (let x = 4; x < WIDTH; x += 12) {
    ctx.fillRect(x, top + 4, 3, WALL - 8);
    ctx.fillRect(x, HEIGHT - WALL + 4, 3, WALL - 8);
  }
  for (let y = top + 4; y < HEIGHT; y += 12) {
    ctx.fillRect(4, y, WALL - 8, 3);
    ctx.fillRect(WIDTH - WALL + 4, y, WALL - 8, 3);
  }
  ctx.strokeStyle = '#6a6a7a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(WALL - 0.75, top + WALL - 0.75, WIDTH - WALL * 2 + 1.5, HEIGHT - top - WALL * 2 + 1.5);
}
