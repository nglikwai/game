import { HEIGHT, HUD_HEIGHT, WIDTH } from '../config';
import {
  ARENA, ARENA_MID_Y, CORNERS, WALL, blob, cornerPile, mirrored, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from './common';

/**
 * 竹林渡口 Bamboo River: a river splits the field top to bottom and the only way
 * across is one of two wooden bridges. Projectiles fly over the water.
 */

const RX0 = WIDTH / 2 - 55;
const RX1 = WIDTH / 2 + 55;
/** Bridge centre lines (y) and walkway height. */
const BRIDGES = [ARENA_MID_Y - 170, ARENA_MID_Y + 170];
const BRIDGE_H = 64;

/** Water colliders: the river minus the bridge walkways. */
function waterSegments(): Obstacle[] {
  const cuts = [ARENA.y, ...BRIDGES.flatMap((b) => [b - BRIDGE_H / 2, b + BRIDGE_H / 2]), ARENA.y + ARENA.h];
  const out: Obstacle[] = [];
  for (let i = 0; i < cuts.length; i += 2) {
    const y0 = cuts[i];
    const y1 = cuts[i + 1];
    out.push({ kind: 'water', low: true, x: WIDTH / 2, y: (y0 + y1) / 2, w: RX1 - RX0, h: y1 - y0 });
  }
  return out;
}

const OBSTACLES: Obstacle[] = [
  ...waterSegments(),
  { kind: 'bamboo', x: 400, y: ARENA_MID_Y - 156, w: 70, h: 70 },
  { kind: 'bamboo', x: 400, y: ARENA_MID_Y + 156, w: 70, h: 70 },
  { kind: 'bamboo', x: WIDTH - 400, y: ARENA_MID_Y - 156, w: 70, h: 70 },
  { kind: 'bamboo', x: WIDTH - 400, y: ARENA_MID_Y + 156, w: 70, h: 70 },
  { kind: 'rock', x: 470, y: ARENA_MID_Y, w: 60, h: 46 },
  { kind: 'rock', x: WIDTH - 470, y: ARENA_MID_Y, w: 60, h: 46 },
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1),
  ...cornerPile(-1, 1),
  ...cornerPile(1, -1),
  ...cornerPile(-1, -1),
  // On the riverbanks between the bridges: in reach of shots from the far bank.
  ...mirrored([{ x: RX0 - 37, y: ARENA_MID_Y - 76, empty: 0.3 }, { x: RX0 - 37, y: ARENA_MID_Y + 76, empty: 0.3 }]),
  // One big chest on each bank, placed point-symmetrically so both sides are equal.
  { x: 470, y: ARENA.y + 48, big: true },
  { x: WIDTH - 470, y: ARENA.y + ARENA.h - 48, big: true },
  // Tucked behind the bamboo.
  { x: 400, y: ARENA_MID_Y - 216 },
  { x: WIDTH - 400, y: ARENA_MID_Y + 216 },
];

export const RIVER: GameMap = {
  id: 'river',
  name: 'Bamboo River',
  zh: '竹林渡口',
  desc: 'A river splits the field. Cross by the two bridges; shots fly over the water.',
  descZh: '河流把戰場一分為二，只能從兩座橋過河；飛行道具可以越過河面。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'leaves',
  route(fx, fy, tx, ty) {
    const side = (x: number) => (x < WIDTH / 2 ? -1 : 1);
    const nearest = (y: number) => BRIDGES.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));
    // Already on a bridge: walk off it towards the target's bank.
    if (fx > RX0 - 6 && fx < RX1 + 6) {
      if (Math.abs(nearest(fy) - fy) > BRIDGE_H / 2) return null;
      return side(tx) === side(fx) && Math.abs(tx - fx) < 40 ? null : { x: tx < WIDTH / 2 ? RX0 - 45 : RX1 + 45, y: nearest(fy) };
    }
    if (side(fx) === side(tx)) return null;
    // Pick the bridge with the shortest detour, walk to its end, then across.
    const b = BRIDGES.reduce((a, c) => (Math.abs(fy - c) + Math.abs(ty - c) < Math.abs(fy - a) + Math.abs(ty - a) ? c : a));
    const entryX = side(fx) < 0 ? RX0 - 30 : RX1 + 30;
    if (Math.hypot(fx - entryX, fy - b) < 26) return { x: side(fx) < 0 ? RX1 + 45 : RX0 - 45, y: b };
    return { x: entryX, y: b };
  },
  paint(ctx, rand) {
    paintGrass(ctx, rand);
    paintPaths(ctx);
    paintRiver(ctx, rand);
    for (const b of BRIDGES) paintBridge(ctx, b);
    for (const o of OBSTACLES) if (o.kind !== 'water') paintShadow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'bamboo') paintBamboo(ctx, o, rand);
      else if (o.kind === 'rock') paintRock(ctx, o);
    }
    paintFallenLeaves(ctx, rand);
    paintFence(ctx);
    paintVignette(ctx);
  },
};

function paintGrass(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#4c6a38';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let i = 0; i < 40; i++) {
    blob(ctx, rand() * WIDTH, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT), 50 + rand() * 90, rand() < 0.5 ? 'rgba(90,125,60,0.35)' : 'rgba(40,60,30,0.3)');
  }
  // Grass tufts.
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 1400; i++) {
    const x = rand() * WIDTH;
    const y = HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT);
    ctx.strokeStyle = rand() < 0.5 ? 'rgba(120,160,80,0.55)' : 'rgba(40,62,28,0.5)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 4, y - 3 - rand() * 4);
    ctx.stroke();
  }
}

/** Worn dirt paths from the starts to the bridges. */
function paintPaths(ctx: Ctx) {
  const path = (x0: number, y0: number, x1: number, y1: number) => {
    for (const [w, a] of [[40, 0.25], [28, 0.45]] as const) {
      ctx.strokeStyle = `rgba(138,115,80,${a})`;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2, y0, x1, y1);
      ctx.stroke();
    }
  };
  for (const c of CORNERS) {
    const b = c.y < ARENA_MID_Y ? BRIDGES[0] : BRIDGES[1];
    path(c.x, c.y, c.x < WIDTH / 2 ? RX0 : RX1, b);
  }
}

function paintRiver(ctx: Ctx, rand: () => number) {
  const g = ctx.createLinearGradient(RX0, 0, RX1, 0);
  g.addColorStop(0, '#24526a');
  g.addColorStop(0.5, '#3c7f99');
  g.addColorStop(1, '#24526a');
  ctx.fillStyle = g;
  ctx.fillRect(RX0, HUD_HEIGHT, RX1 - RX0, HEIGHT - HUD_HEIGHT);
  // Ripples.
  ctx.strokeStyle = 'rgba(220,240,255,0.25)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 70; i++) {
    const x = RX0 + 10 + rand() * (RX1 - RX0 - 20);
    const y = HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT);
    ctx.beginPath();
    ctx.arc(x, y, 4 + rand() * 6, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  // Pebbly banks.
  for (const bx of [RX0, RX1]) {
    for (let y = HUD_HEIGHT; y < HEIGHT; y += 6) {
      ctx.fillStyle = rand() < 0.5 ? '#8b8476' : '#6f695d';
      ctx.beginPath();
      ctx.ellipse(bx + (rand() - 0.5) * 8, y + rand() * 4, 3 + rand() * 3, 2 + rand() * 2, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function paintBridge(ctx: Ctx, y: number) {
  const x0 = RX0 - 16;
  const x1 = RX1 + 16;
  const top = y - BRIDGE_H / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x0 + 4, top + 8, x1 - x0, BRIDGE_H);
  ctx.fillStyle = '#7a5232';
  ctx.fillRect(x0, top, x1 - x0, BRIDGE_H);
  // Planks.
  for (let x = x0; x < x1; x += 9) {
    ctx.fillStyle = (x / 9) % 2 < 1 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(x, top, 9, BRIDGE_H);
    ctx.strokeStyle = 'rgba(40,24,12,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + BRIDGE_H);
    ctx.stroke();
  }
  // Rails with posts.
  for (const ry of [top, top + BRIDGE_H - 5]) {
    ctx.fillStyle = '#4a2e18';
    ctx.fillRect(x0, ry, x1 - x0, 5);
    for (let x = x0; x <= x1; x += 28) {
      ctx.fillStyle = '#3a2210';
      ctx.fillRect(x - 3, ry - 2, 8, 9);
    }
  }
}

function paintBamboo(ctx: Ctx, o: Obstacle, rand: () => number) {
  // Leafy canopy, then the stalks seen from above.
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const r = 18 + rand() * 30;
    ctx.save();
    ctx.translate(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r);
    ctx.rotate(a);
    ctx.fillStyle = rand() < 0.5 ? '#3f7a34' : '#2c5a26';
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (let i = 0; i < 10; i++) {
    const x = o.x + (rand() - 0.5) * (o.w - 14);
    const y = o.y + (rand() - 0.5) * (o.h - 14);
    const r = 4.5 + rand() * 2.5;
    const g = ctx.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, r);
    g.addColorStop(0, '#c9e08a');
    g.addColorStop(1, '#6f9a3c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3d5a22';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function paintRock(ctx: Ctx, o: Obstacle) {
  const pts = [[-0.5, -0.1], [-0.3, -0.5], [0.15, -0.5], [0.5, -0.2], [0.45, 0.35], [0.05, 0.5], [-0.4, 0.4]];
  const g = ctx.createRadialGradient(o.x - 8, o.y - 8, 2, o.x, o.y, o.w * 0.6);
  g.addColorStop(0, '#a8a497');
  g.addColorStop(1, '#5e5b52');
  ctx.fillStyle = g;
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    const x = o.x + px * o.w;
    const y = o.y + py * o.h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#3e3c36';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  blob(ctx, o.x - 6, o.y - 10, 14, 'rgba(90,130,60,0.6)');
}

function paintFallenLeaves(ctx: Ctx, rand: () => number) {
  for (let i = 0; i < 90; i++) {
    const x = ARENA.x + rand() * ARENA.w;
    const y = ARENA.y + rand() * ARENA.h;
    if (x > RX0 - 4 && x < RX1 + 4) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand() * Math.PI);
    ctx.fillStyle = rand() < 0.7 ? 'rgba(150,190,90,0.8)' : 'rgba(200,170,70,0.8)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Bamboo fence around the field. */
function paintFence(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#2f4423';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  const stalk = (x: number, y: number, w: number, h: number) => {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#b9d27a');
    g.addColorStop(1, '#7c9d48');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 3);
    ctx.fill();
  };
  for (let x = 3; x < WIDTH; x += 9) {
    stalk(x, top + 3, 7, WALL - 6);
    stalk(x, HEIGHT - WALL + 3, 7, WALL - 6);
  }
  for (let y = top + 3; y < HEIGHT; y += 9) {
    stalk(3, y, WALL - 6, 7);
    stalk(WIDTH - WALL + 3, y, WALL - 6, 7);
  }
  // Lashing cords.
  ctx.strokeStyle = '#5a3a1e';
  ctx.lineWidth = 2;
  ctx.strokeRect(WALL / 2, top + WALL / 2, WIDTH - WALL, HEIGHT - top - WALL);
  // The river runs under the fence.
  ctx.fillStyle = '#24526a';
  ctx.fillRect(RX0, top, RX1 - RX0, WALL);
  ctx.fillRect(RX0, HEIGHT - WALL, RX1 - RX0, WALL);
  // Inner shadow.
  for (const [x0, y0, x1, y1, x, y, w, h] of [
    [0, ARENA.y, 0, ARENA.y + 20, ARENA.x, ARENA.y, ARENA.w, 20],
    [0, ARENA.y + ARENA.h, 0, ARENA.y + ARENA.h - 20, ARENA.x, ARENA.y + ARENA.h - 20, ARENA.w, 20],
  ]) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
}
