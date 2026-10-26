import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, mirrored, paintLantern, paintLanternGlow, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from '@/maps/common';

/**
 * 櫻花錦鯉池 Koi Pond Garden: a koi pond in the middle crossed by a red arched
 * bridge, sakura trees, hedges forming lanes, and falling petals.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
/** Pond extent and the bridge walkway across its middle. */
const POND = { x0: CX - 160, x1: CX + 160, y0: MID - 72, y1: MID + 72 };
const BRIDGE_W = 60;

const OBSTACLES: Obstacle[] = [
  // The pond, split by the bridge walkway (you can cross it north–south).
  { kind: 'pond', low: true, x: (POND.x0 + CX - BRIDGE_W / 2) / 2, y: MID, w: CX - BRIDGE_W / 2 - POND.x0, h: POND.y1 - POND.y0 },
  { kind: 'pond', low: true, x: (POND.x1 + CX + BRIDGE_W / 2) / 2, y: MID, w: POND.x1 - CX - BRIDGE_W / 2, h: POND.y1 - POND.y0 },
  ...[[330, 236], [WIDTH - 330, 236], [330, 2 * MID - 236], [WIDTH - 330, 2 * MID - 236]]
    .map(([x, y]) => ({ kind: 'sakura' as const, x, y, w: 56, h: 56 })),
  { kind: 'hedge', x: CX, y: ARENA.y + 110, w: 160, h: 26 },
  { kind: 'hedge', x: CX, y: ARENA.y + ARENA.h - 110, w: 160, h: 26 },
  { kind: 'hedge', x: 190, y: MID, w: 26, h: 110 },
  { kind: 'hedge', x: WIDTH - 190, y: MID, w: 26, h: 110 },
  ...[[470, MID - 130], [WIDTH - 470, MID - 130], [470, MID + 130], [WIDTH - 470, MID + 130]]
    .map(([x, y]) => ({ kind: 'lantern' as const, x, y, w: 36, h: 36 })),
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1),
  ...cornerPile(-1, 1),
  ...cornerPile(1, -1),
  ...cornerPile(-1, -1),
  // At either end of the bridge.
  { x: CX, y: POND.y0 - 40, empty: 0.2 },
  { x: CX, y: POND.y1 + 40, empty: 0.2 },
  // Big ones behind the top and bottom hedges.
  { x: CX, y: ARENA.y + 50, big: true },
  { x: CX, y: ARENA.y + ARENA.h - 50, big: true },
  // Under the blossoms, between the trees and the hedges.
  ...mirrored([{ x: 470, y: ARENA.y + 60 }], true),
];

export const GARDEN: GameMap = {
  id: 'garden',
  name: 'Koi Pond Garden',
  zh: '櫻花錦鯉池',
  desc: 'A koi pond crossed by a red bridge, sakura trees and hedges. Shots fly over the water.',
  descZh: '紅橋橫跨錦鯉池，四周有櫻花樹和樹籬。飛行道具可越過池面。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'petals',
  paint(ctx, rand) {
    paintLawn(ctx, rand);
    paintGravel(ctx, rand);
    paintPond(ctx, rand);
    paintBridge(ctx);
    for (const o of OBSTACLES) if (o.kind === 'lantern') paintLanternGlow(ctx, o);
    for (const o of OBSTACLES) if (o.kind === 'hedge' || o.kind === 'lantern') paintShadow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'hedge') paintHedge(ctx, o);
      else if (o.kind === 'lantern') paintLantern(ctx, o);
    }
    for (const o of OBSTACLES) if (o.kind === 'sakura') paintSakura(ctx, o, rand);
    paintFallenPetals(ctx, rand);
    paintGardenWall(ctx);
    paintVignette(ctx);
  },
};

function paintLawn(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#5b8544';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let i = 0; i < 40; i++) {
    blob(ctx, rand() * WIDTH, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT), 50 + rand() * 80, rand() < 0.5 ? 'rgba(120,160,80,0.3)' : 'rgba(50,80,40,0.25)');
  }
  ctx.lineWidth = 1;
  for (let i = 0; i < 1200; i++) {
    const x = rand() * WIDTH;
    const y = HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT);
    ctx.strokeStyle = rand() < 0.5 ? 'rgba(150,190,100,0.5)' : 'rgba(50,80,35,0.45)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 3, y - 3 - rand() * 3);
    ctx.stroke();
  }
}

/** Raked gravel around the pond, with ripple lines. */
function paintGravel(ctx: Ctx, rand: () => number) {
  const rx = 260;
  const ry = 150;
  ctx.fillStyle = '#d8cfb8';
  ctx.beginPath();
  ctx.ellipse(CX, MID, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,140,115,0.5)';
  ctx.lineWidth = 1.2;
  for (let k = 1; k < 7; k++) {
    ctx.beginPath();
    ctx.ellipse(CX, MID, 175 + k * 13, 85 + k * 9, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 300; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand();
    ctx.fillStyle = 'rgba(120,110,90,0.35)';
    ctx.fillRect(CX + Math.cos(a) * rx * r, MID + Math.sin(a) * ry * r, 1.2, 1.2);
  }
}

function paintPond(ctx: Ctx, rand: () => number) {
  const w = POND.x1 - POND.x0;
  const h = POND.y1 - POND.y0;
  // Stone edging, then water.
  ctx.fillStyle = '#8b877c';
  ctx.beginPath();
  ctx.roundRect(POND.x0 - 8, POND.y0 - 8, w + 16, h + 16, 30);
  ctx.fill();
  const g = ctx.createRadialGradient(CX, MID, 10, CX, MID, w * 0.6);
  g.addColorStop(0, '#2f7c86');
  g.addColorStop(1, '#1f5560');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(POND.x0, POND.y0, w, h, 24);
  ctx.fill();
  // Lily pads.
  for (let i = 0; i < 9; i++) {
    const x = POND.x0 + 20 + rand() * (w - 40);
    const y = POND.y0 + 16 + rand() * (h - 32);
    if (Math.abs(x - CX) < BRIDGE_W) continue;
    ctx.fillStyle = '#4f8a3a';
    ctx.beginPath();
    ctx.arc(x, y, 7 + rand() * 4, 0.3, Math.PI * 2);
    ctx.lineTo(x, y);
    ctx.fill();
    if (rand() < 0.4) {
      ctx.fillStyle = '#ffd1e6';
      ctx.beginPath();
      ctx.arc(x + 2, y - 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Koi.
  for (let i = 0; i < 6; i++) {
    const x = POND.x0 + 24 + rand() * (w - 48);
    const y = POND.y0 + 18 + rand() * (h - 36);
    if (Math.abs(x - CX) < BRIDGE_W) continue;
    const a = rand() * Math.PI * 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = rand() < 0.5 ? '#ff8a3a' : '#fff4ea';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(-14, -4);
    ctx.lineTo(-14, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e8442a';
    ctx.beginPath();
    ctx.arc(2, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Vermilion arched bridge, crossing the pond north–south. */
function paintBridge(ctx: Ctx) {
  const x0 = CX - BRIDGE_W / 2;
  const top = POND.y0 - 14;
  const h = POND.y1 - POND.y0 + 28;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x0 + 5, top + 6, BRIDGE_W, h);
  const g = ctx.createLinearGradient(0, top, 0, top + h);
  g.addColorStop(0, '#8a5a32');
  g.addColorStop(0.5, '#b07a48');
  g.addColorStop(1, '#8a5a32');
  ctx.fillStyle = g;
  ctx.fillRect(x0, top, BRIDGE_W, h);
  ctx.strokeStyle = 'rgba(50,30,15,0.6)';
  ctx.lineWidth = 1;
  for (let y = top; y < top + h; y += 8) {
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + BRIDGE_W, y);
    ctx.stroke();
  }
  // Red rails with gold caps on the posts.
  for (const rx of [x0, x0 + BRIDGE_W - 6]) {
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(rx, top, 6, h);
    for (let y = top; y <= top + h; y += 30) {
      ctx.fillStyle = '#9c2f24';
      ctx.fillRect(rx - 1, y - 3, 8, 8);
      ctx.fillStyle = '#d9ae4a';
      ctx.beginPath();
      ctx.arc(rx + 3, y + 1, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function paintHedge(ctx: Ctx, o: Obstacle) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  const g = ctx.createLinearGradient(l, t, l, t + o.h);
  g.addColorStop(0, '#4f8a3a');
  g.addColorStop(1, '#2c5a26');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(l, t, o.w, o.h, 10);
  ctx.fill();
  // Leafy bumps.
  ctx.fillStyle = 'rgba(140,190,100,0.35)';
  for (let i = 0; i < (o.w * o.h) / 120; i++) {
    const x = l + 4 + ((i * 37) % (o.w - 8));
    const y = t + 4 + ((i * 53) % (o.h - 8));
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintSakura(ctx: Ctx, o: Obstacle, rand: () => number) {
  blob(ctx, o.x + 8, o.y + 10, 46, 'rgba(30,40,20,0.45)');
  // Trunk peeking through, then clusters of blossom.
  ctx.fillStyle = '#4a2e1c';
  ctx.beginPath();
  ctx.arc(o.x, o.y, 8, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 30; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 34;
    const x = o.x + Math.cos(a) * r;
    const y = o.y + Math.sin(a) * r;
    const c = rand();
    ctx.fillStyle = c < 0.4 ? '#ffc4d8' : c < 0.8 ? '#f59ab8' : '#fff0f5';
    ctx.beginPath();
    ctx.arc(x, y, 7 + rand() * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  blob(ctx, o.x - 10, o.y - 12, 20, 'rgba(255,255,255,0.35)');
}

function paintFallenPetals(ctx: Ctx, rand: () => number) {
  for (let i = 0; i < 160; i++) {
    const x = ARENA.x + rand() * ARENA.w;
    const y = ARENA.y + rand() * ARENA.h;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand() * Math.PI);
    ctx.fillStyle = `rgba(255,${170 + rand() * 50},${195 + rand() * 30},0.85)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** White plaster garden wall with a grey tiled cap. */
function paintGardenWall(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#ece6da';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.fillStyle = '#5d636e';
  ctx.fillRect(0, top, WIDTH, 8);
  ctx.fillRect(0, HEIGHT - 8, WIDTH, 8);
  ctx.fillRect(0, top, 8, HEIGHT - top);
  ctx.fillRect(WIDTH - 8, top, 8, HEIGHT - top);
  ctx.strokeStyle = 'rgba(30,34,40,0.5)';
  ctx.lineWidth = 1;
  for (let x = 4; x < WIDTH; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + 8);
    ctx.moveTo(x, HEIGHT - 8);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  ctx.strokeStyle = '#8f2a20';
  ctx.lineWidth = 2;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
}
