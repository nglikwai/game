import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, mirrored, paintLantern, paintLanternGlow, paintShadow,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from '@/maps/common';

/**
 * 雪之神社 Snow Shrine: a shrine in the middle ringed by four torii gates (you can
 * slip between the posts), snowy pines, and falling snow.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const POST = 16;

/** A torii gate's two posts. Horizontal gates span x; vertical ones span y. */
function torii(x: number, y: number, vertical: boolean): Obstacle[] {
  const d = 40;
  return vertical
    ? [{ kind: 'torii', x, y: y - d, w: POST, h: POST }, { kind: 'torii', x, y: y + d, w: POST, h: POST }]
    : [{ kind: 'torii', x: x - d, y, w: POST, h: POST }, { kind: 'torii', x: x + d, y, w: POST, h: POST }];
}

const GATES: { x: number; y: number; vertical: boolean }[] = [
  { x: CX, y: MID - 210, vertical: false },
  { x: CX, y: MID + 210, vertical: false },
  { x: CX - 170, y: MID, vertical: true },
  { x: CX + 170, y: MID, vertical: true },
];

const OBSTACLES: Obstacle[] = [
  { kind: 'shrine', x: CX, y: MID, w: 150, h: 96 },
  ...GATES.flatMap((g) => torii(g.x, g.y, g.vertical)),
  ...[
    [250, 230], [WIDTH - 250, 230], [250, 582], [WIDTH - 250, 582],
    [420, ARENA.y + 36], [WIDTH - 420, ARENA.y + 36], [420, ARENA.y + ARENA.h - 36], [WIDTH - 420, ARENA.y + ARENA.h - 36],
  ].map(([x, y]) => ({ kind: 'pine' as const, x, y, w: 46, h: 46 })),
  { kind: 'lantern', x: 150, y: MID, w: 40, h: 40 },
  { kind: 'lantern', x: WIDTH - 150, y: MID, w: 40, h: 40 },
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1),
  ...cornerPile(-1, 1),
  ...cornerPile(1, -1),
  ...cornerPile(-1, -1),
  // Inside the torii ring, around the shrine: the contested middle, rarely empty.
  ...mirrored([{ x: CX - 95, y: MID - 105, empty: 0.2 }], true),
  // Big ones behind the top and bottom gates.
  { x: CX, y: ARENA.y + 40, big: true },
  { x: CX, y: ARENA.y + ARENA.h - 40, big: true },
  // Among the pines along the top and bottom edges.
  ...mirrored([{ x: 330, y: ARENA.y + 40 }], true),
];

export const SNOW: GameMap = {
  id: 'snow',
  name: 'Snow Shrine',
  zh: '雪之神社',
  desc: 'A shrine ringed by torii gates. Slip between the posts; pines for cover.',
  descZh: '鳥居環繞的神社，可從柱子之間穿過；松樹可作掩護。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'snow',
  paint(ctx, rand) {
    paintSnowGround(ctx, rand);
    paintStonePath(ctx, rand);
    for (const o of OBSTACLES) if (o.kind === 'lantern') paintLanternGlow(ctx, o);
    for (const o of OBSTACLES) if (o.kind === 'shrine' || o.kind === 'lantern') paintShadow(ctx, o);
    paintShrine(ctx, OBSTACLES[0]);
    for (const o of OBSTACLES) {
      if (o.kind === 'pine') paintPine(ctx, o, rand);
      else if (o.kind === 'lantern') {
        paintLantern(ctx, o);
        blob(ctx, o.x - 3, o.y - 4, 13, 'rgba(255,255,255,0.85)'); // snow cap
      }
    }
    for (const g of GATES) paintTorii(ctx, g.x, g.y, g.vertical);
    paintFence(ctx);
    // Cold vignette.
    const v = ctx.createRadialGradient(CX, MID, 260, CX, MID, 780);
    v.addColorStop(0, 'rgba(20,40,70,0)');
    v.addColorStop(1, 'rgba(20,40,70,0.35)');
    ctx.fillStyle = v;
    ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  },
};

export function paintSnowGround(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#e6ecf2';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  // Drifts and hollows.
  for (let i = 0; i < 45; i++) {
    blob(ctx, rand() * WIDTH, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT), 40 + rand() * 100, rand() < 0.5 ? 'rgba(170,190,215,0.16)' : 'rgba(255,255,255,0.6)');
  }
  // Glints.
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.9)' : 'rgba(160,180,205,0.5)';
    ctx.fillRect(rand() * WIDTH, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT), 1.5, 1.5);
  }
  // A few trails of footprints.
  for (let t = 0; t < 5; t++) {
    let x = ARENA.x + rand() * ARENA.w;
    let y = ARENA.y + rand() * ARENA.h;
    let a = rand() * Math.PI * 2;
    for (let s = 0; s < 22; s++) {
      a += (rand() - 0.5) * 0.4;
      x += Math.cos(a) * 12;
      y += Math.sin(a) * 12;
      const side = s % 2 ? 4 : -4;
      ctx.fillStyle = 'rgba(140,160,190,0.45)';
      ctx.beginPath();
      ctx.ellipse(x - Math.sin(a) * side, y + Math.cos(a) * side, 3.5, 2, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Stepping stones running through the shrine grounds, half buried in snow. */
function paintStonePath(ctx: Ctx, rand: () => number) {
  const stones = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 30);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n + (rand() - 0.5) * 6;
      const y = y0 + ((y1 - y0) * i) / n + (rand() - 0.5) * 6;
      ctx.fillStyle = '#8e939b';
      ctx.beginPath();
      ctx.ellipse(x, y, 13 + rand() * 4, 10 + rand() * 3, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
      blob(ctx, x - 4, y - 4, 9, 'rgba(255,255,255,0.8)');
    }
  };
  stones(CX, ARENA.y + ARENA.h - 10, CX, MID + 60);
  stones(CX, ARENA.y + 10, CX, MID - 60);
  stones(ARENA.x + 10, MID, CX - 90, MID);
  stones(ARENA.x + ARENA.w - 10, MID, CX + 90, MID);
}

function paintShrine(ctx: Ctx, o: Obstacle) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  // Snow-covered roof seen from above, with dark eaves and a ridge.
  ctx.fillStyle = '#2b2f36';
  ctx.beginPath();
  ctx.roundRect(l - 10, t - 8, o.w + 20, o.h + 16, 6);
  ctx.fill();
  const roof = ctx.createLinearGradient(0, t, 0, t + o.h);
  roof.addColorStop(0, '#ffffff');
  roof.addColorStop(0.5, '#dfe7f0');
  roof.addColorStop(1, '#ffffff');
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.roundRect(l - 4, t - 2, o.w + 8, o.h + 4, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,140,170,0.6)';
  ctx.lineWidth = 1;
  for (let x = l + 6; x < l + o.w; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x, t);
    ctx.lineTo(x, o.y - 4);
    ctx.moveTo(x, o.y + 4);
    ctx.lineTo(x, t + o.h);
    ctx.stroke();
  }
  // Ridge with gold end pieces.
  ctx.fillStyle = '#3a2a1c';
  ctx.fillRect(l - 6, o.y - 4, o.w + 12, 8);
  ctx.fillStyle = '#d9ae4a';
  ctx.fillRect(l - 10, o.y - 6, 8, 12);
  ctx.fillRect(l + o.w + 2, o.y - 6, 8, 12);
  // Offering box and sacred rope with paper streamers on the front (bottom) side.
  ctx.fillStyle = '#6b4224';
  ctx.fillRect(o.x - 22, t + o.h + 10, 44, 14);
  ctx.strokeStyle = '#3a2210';
  for (let x = o.x - 18; x < o.x + 22; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, t + o.h + 12);
    ctx.lineTo(x, t + o.h + 22);
    ctx.stroke();
  }
  ctx.strokeStyle = '#d8c48a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(l + 10, t + o.h + 7);
  ctx.quadraticCurveTo(o.x, t + o.h + 14, l + o.w - 10, t + o.h + 7);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  for (const sx of [-40, 0, 40]) {
    ctx.beginPath();
    ctx.moveTo(o.x + sx - 3, t + o.h + 10);
    ctx.lineTo(o.x + sx + 3, t + o.h + 14);
    ctx.lineTo(o.x + sx - 3, t + o.h + 18);
    ctx.lineTo(o.x + sx + 3, t + o.h + 22);
    ctx.lineTo(o.x + sx - 1, t + o.h + 22);
    ctx.closePath();
    ctx.fill();
  }
}

function paintTorii(ctx: Ctx, x: number, y: number, vertical: boolean) {
  const d = 40;
  const posts = vertical ? [[x, y - d], [x, y + d]] : [[x - d, y], [x + d, y]];
  // Shadows.
  for (const [px, py] of posts) blob(ctx, px + 5, py + 7, 14, 'rgba(60,80,110,0.4)');
  // Top beam (kasagi) in black with snow on it, red tie beam (nuki) under it.
  const ext = 16;
  const beam = (w: number, color: string, off: number) => {
    ctx.fillStyle = color;
    if (vertical) ctx.fillRect(x - w / 2 + off, y - d - ext, w, 2 * (d + ext));
    else ctx.fillRect(x - d - ext, y - w / 2 + off, 2 * (d + ext), w);
  };
  beam(7, '#b8322a', 6);
  beam(10, '#1e1e22', -2);
  beam(5, '#ffffff', -4);
  for (const [px, py] of posts) {
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(px, py, POST / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1e1e22';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export function paintPine(ctx: Ctx, o: Obstacle, rand: () => number) {
  blob(ctx, o.x + 8, o.y + 10, 34, 'rgba(60,80,110,0.45)');
  // Layers of needles from the outside in, getting lighter.
  for (const [r, color] of [[30, '#1f3b2a'], [22, '#28503a'], [14, '#326247']] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    const spikes = 12;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2 + rand() * 0.1;
      const rr = i % 2 === 0 ? r : r * 0.72;
      const px = o.x + Math.cos(a) * rr;
      const py = o.y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  // Snow resting on the branches.
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2;
    const r = 6 + rand() * 18;
    blob(ctx, o.x + Math.cos(a) * r, o.y + Math.sin(a) * r, 7 + rand() * 5, 'rgba(255,255,255,0.9)');
  }
}

/** Dark wooden fence with snow along the top. */
function paintFence(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#4a3322';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.strokeStyle = 'rgba(30,18,10,0.7)';
  ctx.lineWidth = 1;
  for (let x = 0; x < WIDTH; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + WALL);
    ctx.moveTo(x, HEIGHT - WALL);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  for (let y = top; y < HEIGHT; y += 14) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WALL, y);
    ctx.moveTo(WIDTH - WALL, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
  // Snow cap along the inner edge.
  ctx.fillStyle = '#f4f7fb';
  ctx.fillRect(WALL - 8, top + WALL - 8, WIDTH - 2 * (WALL - 8), 8);
  ctx.fillRect(WALL - 8, HEIGHT - WALL, WIDTH - 2 * (WALL - 8), 8);
  ctx.fillRect(WALL - 8, top + WALL - 8, 8, HEIGHT - top - 2 * (WALL - 8));
  ctx.fillRect(WIDTH - WALL, top + WALL - 8, 8, HEIGHT - top - 2 * (WALL - 8));
}
