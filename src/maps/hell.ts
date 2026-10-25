import { HEIGHT, HUD_HEIGHT, WIDTH } from '../config';
import { PRISON } from './prison';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile, mirrored, paintShadow, paintVignette,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from './common';

/**
 * 地獄 The Underworld: the four 闖關 Quest stages. They aren't offered in map
 * select; each stage always uses its own.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
const TOP = ARENA.y;
const BOTTOM = ARENA.y + ARENA.h;

/**
 * CPU routing across a vertical barrier between x0 and x1 that can only be crossed
 * at the given heights (bridges, gates): walk to the nearest crossing, then through.
 */
export function crossing(x0: number, x1: number, gates: number[], halfGap: number) {
  const mid = (x0 + x1) / 2;
  const side = (x: number) => (x < mid ? -1 : 1);
  const nearest = (y: number) => gates.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));
  return (fx: number, fy: number, tx: number, ty: number) => {
    // In the crossing already: carry on out to the target's side.
    if (fx > x0 - 6 && fx < x1 + 6) {
      if (Math.abs(nearest(fy) - fy) > halfGap) return null;
      return side(tx) === side(fx) && Math.abs(tx - fx) < 40 ? null : { x: tx < mid ? x0 - 45 : x1 + 45, y: nearest(fy) };
    }
    if (side(fx) === side(tx)) return null;
    const g = gates.reduce((a, c) => (Math.abs(fy - c) + Math.abs(ty - c) < Math.abs(fy - a) + Math.abs(ty - a) ? c : a));
    const entryX = side(fx) < 0 ? x0 - 30 : x1 + 30;
    if (Math.hypot(fx - entryX, fy - g) < 26) return { x: side(fx) < 0 ? x1 + 45 : x0 - 45, y: g };
    return { x: entryX, y: g };
  };
}

/** Vertical barrier pieces from TOP to BOTTOM, leaving gaps of 2 × halfGap at each gate. */
function barrier(kind: Obstacle['kind'], x: number, w: number, gates: number[], halfGap: number, low = false): Obstacle[] {
  const out: Obstacle[] = [];
  let y = TOP;
  for (const g of [...gates, Infinity]) {
    const end = Math.min(BOTTOM, g - halfGap);
    if (end - y > 4) out.push({ kind, x, y: (y + end) / 2, w, h: end - y, ...(low ? { low } : {}) });
    y = g + halfGap;
  }
  return out;
}

// ---------- stage 1: 三途川 Sanzu River ----------

const RIVER_X = CX;
const RIVER_W = 64;
const BRIDGES = [MID - 180, MID, MID + 180];
const BRIDGE_HALF = 34;

const SANZU_OBSTACLES: Obstacle[] = [
  ...barrier('blood', RIVER_X, RIVER_W, BRIDGES, BRIDGE_HALF, true),
  ...[
    { kind: 'bones' as const, x: 380, y: MID - 90, w: 40, h: 30 },
    { kind: 'bones' as const, x: 420, y: MID + 220, w: 40, h: 30 },
    { kind: 'brazier' as const, x: CX - 90, y: MID - 110, w: 30, h: 30 },
    { kind: 'brazier' as const, x: CX - 90, y: MID + 110, w: 30, h: 30 },
    { kind: 'obsidian' as const, x: 300, y: TOP + 110, w: 50, h: 36 },
  ].flatMap((o) => [o, { ...o, x: WIDTH - o.x, y: 2 * MID - o.y }]),
];

const SANZU_CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  // On the bridges' ends: grab and get shot at.
  ...mirrored([{ x: CX - 70, y: MID - 180, empty: 0.3 }, { x: CX - 70, y: MID + 180, empty: 0.3 }]),
  // Big ones out on the middle bridge.
  { x: CX, y: MID - 2, big: true },
  ...mirrored([{ x: 470, y: MID, empty: 0.4 }]),
];

export const SANZU: GameMap = {
  id: 'sanzu',
  name: 'Sanzu River',
  zh: '三途川',
  desc: 'A river of blood splits the underworld; cross on three bone bridges. Shots fly over the blood.',
  descZh: '血河把冥界一分為二，只能從三座白骨橋通過。飛行道具可以越過血河。',
  obstacles: SANZU_OBSTACLES,
  chests: SANZU_CHESTS,
  particles: 'embers',
  route: crossing(RIVER_X - RIVER_W / 2, RIVER_X + RIVER_W / 2, BRIDGES, BRIDGE_HALF),
  paint(ctx, rand) {
    paintHellGround(ctx, rand);
    for (const o of SANZU_OBSTACLES) if (o.kind === 'blood') paintBlood(ctx, o, rand);
    for (const y of BRIDGES) paintBoneBridge(ctx, RIVER_X, y, RIVER_W + 30, BRIDGE_HALF * 2 - 6);
    paintHellObstacles(ctx, SANZU_OBSTACLES, rand);
    paintHellWall(ctx, rand);
    paintVignette(ctx);
  },
};

// ---------- stage 2: 閻羅城 Yama's Fortress ----------

const FORT_X = 870;
const FORT_W = 26;
const GATES = [TOP + 120, MID, BOTTOM - 120];
const GATE_HALF = 38;

const YAMA_OBSTACLES: Obstacle[] = [
  ...barrier('hellwall', FORT_X, FORT_W, GATES, GATE_HALF),
  // Lava pools out in the killing field.
  { kind: 'lava', low: true, x: 560, y: MID - 150, w: 110, h: 70 },
  { kind: 'lava', low: true, x: 560, y: MID + 150, w: 110, h: 70 },
  { kind: 'lava', low: true, x: 330, y: MID, w: 70, h: 90 },
  { kind: 'bones', x: 720, y: MID - 60, w: 40, h: 30 },
  { kind: 'bones', x: 720, y: MID + 60, w: 40, h: 30 },
  // Braziers flanking each gate, on the outside.
  ...GATES.flatMap((g) => [
    { kind: 'brazier' as const, x: FORT_X - 40, y: g - GATE_HALF - 18, w: 26, h: 26 },
    { kind: 'brazier' as const, x: FORT_X - 40, y: g + GATE_HALF + 18, w: 26, h: 26 },
  ]),
];

const YAMA_CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(1, -1), ...cornerPile(-1, 1), ...cornerPile(-1, -1),
  { x: 440, y: MID - 230, empty: 0.3 },
  { x: 440, y: MID + 230, empty: 0.3 },
  { x: 640, y: MID, big: true },
  // Inside the walls, behind the towers.
  { x: WIDTH - 110, y: MID, big: true },
];

export const YAMA: GameMap = {
  id: 'yama',
  name: "Yama's Fortress",
  zh: '閻羅城',
  desc: 'An obsidian wall with three gates guards two great towers. Lava pools burn in the field before it.',
  descZh: '黑曜石城牆只有三道城門，牆後是兩座大箭塔。城前的戰場上有熔岩池。',
  obstacles: YAMA_OBSTACLES,
  chests: YAMA_CHESTS,
  particles: 'embers',
  route: crossing(FORT_X - FORT_W / 2, FORT_X + FORT_W / 2, GATES, GATE_HALF),
  paint(ctx, rand) {
    paintHellGround(ctx, rand);
    // Flagstones inside the fortress.
    ctx.fillStyle = 'rgba(60,20,24,0.55)';
    ctx.fillRect(FORT_X, TOP, ARENA.x + ARENA.w - FORT_X, ARENA.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    for (let y = TOP; y < BOTTOM; y += 34) {
      for (let x = FORT_X + ((y / 34) % 2 ? 17 : 0); x < ARENA.x + ARENA.w; x += 34) ctx.strokeRect(x, y, 34, 34);
    }
    for (const o of YAMA_OBSTACLES) if (o.kind === 'lava') paintLavaPool(ctx, o, rand);
    paintHellObstacles(ctx, YAMA_OBSTACLES, rand);
    paintHellWall(ctx, rand);
    paintVignette(ctx);
  },
};

// ---------- stage 4: 鬼王殿 Oni King's Hall ----------

const ONIHALL_OBSTACLES: Obstacle[] = [
  { kind: 'blood', low: true, x: CX, y: MID, w: 200, h: 110 },
  // Two rows of lacquered pillars down the hall.
  ...[380, 560, 720, 900].flatMap((x) => [
    { kind: 'pillar' as const, x, y: MID - 175, w: 36, h: 36 },
    { kind: 'pillar' as const, x, y: MID + 175, w: 36, h: 36 },
  ]),
  { kind: 'throne', x: WIDTH - 70, y: MID, w: 44, h: 80 },
  { kind: 'brazier', x: CX - 150, y: MID - 90, w: 28, h: 28 },
  { kind: 'brazier', x: CX + 150, y: MID + 90, w: 28, h: 28 },
  { kind: 'brazier', x: CX - 150, y: MID + 90, w: 28, h: 28 },
  { kind: 'brazier', x: CX + 150, y: MID - 90, w: 28, h: 28 },
];

const ONIHALL_CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
  ...mirrored([{ x: 470, y: MID - 175, empty: 0.3 }, { x: 470, y: MID + 175, empty: 0.3 }]),
  { x: CX, y: TOP + 40, big: true },
  { x: CX, y: BOTTOM - 40, big: true },
];

export const ONIHALL: GameMap = {
  id: 'onihall',
  name: "Oni King's Hall",
  zh: '鬼王殿',
  desc: 'The Oni King waits on his throne among burning braziers. A pool of blood fills the middle of the hall.',
  descZh: '鬼王坐鎮殿中，火盆熊熊燃燒，大殿中央是一池血水。',
  obstacles: ONIHALL_OBSTACLES,
  chests: ONIHALL_CHESTS,
  particles: 'embers',
  paint(ctx, rand) {
    paintHallFloor(ctx, rand);
    for (const o of ONIHALL_OBSTACLES) if (o.kind === 'blood') paintBlood(ctx, o, rand);
    paintHellObstacles(ctx, ONIHALL_OBSTACLES, rand);
    paintHellWall(ctx, rand);
    paintVignette(ctx);
  },
};

export const QUEST_MAPS: GameMap[] = [SANZU, YAMA, PRISON, ONIHALL];

// ---------- painting ----------

/** Scorched, cracked earth with glowing seams and drifting ash. */
function paintHellGround(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#2a0f0c';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let i = 0; i < 70; i++) {
    blob(ctx, rand() * WIDTH, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT), 30 + rand() * 70, rand() < 0.5 ? 'rgba(70,24,16,0.4)' : 'rgba(10,4,4,0.4)');
  }
  // Glowing cracks: a soft orange glow under a bright seam.
  for (let i = 0; i < 26; i++) {
    let x = ARENA.x + rand() * ARENA.w;
    let y = TOP + rand() * ARENA.h;
    const pts = [{ x, y }];
    for (let k = 0; k < 5; k++) {
      x += (rand() - 0.5) * 70;
      y += (rand() - 0.5) * 70;
      pts.push({ x, y });
    }
    for (const [w, c] of [[6, 'rgba(255,90,20,0.18)'], [1.5, 'rgba(255,170,60,0.75)']] as const) {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath();
      pts.forEach((p, n) => (n ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
  }
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = rand() < 0.7 ? 'rgba(120,110,100,0.35)' : 'rgba(255,120,40,0.5)';
    ctx.fillRect(ARENA.x + rand() * ARENA.w, TOP + rand() * ARENA.h, 1.5, 1.5);
  }
}

/** Dark red lacquered floorboards with a long carpet down the middle. */
function paintHallFloor(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#2a0c0e';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  for (let y = TOP; y < BOTTOM; y += 22) {
    ctx.fillStyle = `hsl(355, 45%, ${10 + rand() * 5}%)`;
    ctx.fillRect(ARENA.x, y, ARENA.w, 21);
  }
  ctx.fillStyle = '#5a0e14';
  ctx.fillRect(ARENA.x, MID - 46, ARENA.w, 92);
  ctx.strokeStyle = '#c9962a';
  ctx.lineWidth = 2;
  ctx.strokeRect(ARENA.x - 2, MID - 46, ARENA.w + 4, 92);
  // Gold cloud pattern along the carpet.
  ctx.strokeStyle = 'rgba(217,174,74,0.35)';
  for (let x = ARENA.x + 20; x < ARENA.x + ARENA.w; x += 60) {
    ctx.beginPath();
    ctx.arc(x, MID, 12, Math.PI, 0);
    ctx.arc(x + 18, MID, 8, Math.PI, 0);
    ctx.stroke();
  }
}

function paintBlood(ctx: Ctx, o: Obstacle, rand: () => number) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  ctx.fillStyle = '#1a0606';
  ctx.beginPath();
  ctx.roundRect(l - 4, t - 4, o.w + 8, o.h + 8, 10);
  ctx.fill();
  const g = ctx.createLinearGradient(l, t, l + o.w, t + o.h);
  g.addColorStop(0, '#7a0a10');
  g.addColorStop(0.5, '#a3141c');
  g.addColorStop(1, '#6a0810');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(l, t, o.w, o.h, 8);
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = 0; i < Math.max(3, (o.w * o.h) / 1800); i++) blob(ctx, l + rand() * o.w, t + rand() * o.h, 8 + rand() * 18, 'rgba(255,90,90,0.18)');
  // Bubbles.
  for (let i = 0; i < (o.w * o.h) / 900; i++) {
    ctx.strokeStyle = 'rgba(255,140,140,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(l + rand() * o.w, t + rand() * o.h, 1.5 + rand() * 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function paintLavaPool(ctx: Ctx, o: Obstacle, rand: () => number) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  ctx.fillStyle = 'rgba(255,90,20,0.25)';
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2 + 14, o.h / 2 + 14, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(o.x, o.y, 4, o.x, o.y, Math.max(o.w, o.h) / 2);
  g.addColorStop(0, '#ffe08a');
  g.addColorStop(0.5, '#ff7a1a');
  g.addColorStop(1, '#a8260a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 6; i++) blob(ctx, l + rand() * o.w, t + rand() * o.h, 6 + rand() * 10, 'rgba(60,10,0,0.35)');
}

/** A bridge of lashed bones across the blood river. */
function paintBoneBridge(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x - w / 2 + 3, y - h / 2 + 5, w, h);
  for (let by = y - h / 2; by < y + h / 2; by += 8) {
    ctx.fillStyle = '#d9cfb8';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, by + 1, w, 6, 3);
    ctx.fill();
    ctx.fillStyle = '#efe6d0';
    ctx.beginPath();
    ctx.arc(x - w / 2 + 2, by + 4, 4, 0, Math.PI * 2);
    ctx.arc(x + w / 2 - 2, by + 4, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#4a2a1a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);
}

function paintHellObstacles(ctx: Ctx, obstacles: Obstacle[], rand: () => number) {
  for (const o of obstacles) if (o.kind === 'brazier') {
    const g = ctx.createRadialGradient(o.x, o.y, 2, o.x, o.y, 80);
    g.addColorStop(0, 'rgba(255,140,40,0.4)');
    g.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(o.x - 80, o.y - 80, 160, 160);
  }
  for (const o of obstacles) if (!o.low && o.kind !== 'hellwall') paintShadow(ctx, o);
  for (const o of obstacles) {
    if (o.kind === 'bones') paintBones(ctx, o, rand);
    else if (o.kind === 'brazier') paintBrazier(ctx, o);
    else if (o.kind === 'obsidian') paintObsidianRock(ctx, o);
    else if (o.kind === 'hellwall') paintFortWall(ctx, o);
    else if (o.kind === 'pillar') paintRedPillar(ctx, o);
    else if (o.kind === 'throne') paintThrone(ctx, o);
  }
}

function paintBones(ctx: Ctx, o: Obstacle, rand: () => number) {
  for (let i = 0; i < 7; i++) {
    const x = o.x + (rand() - 0.5) * o.w * 0.8;
    const y = o.y + (rand() - 0.5) * o.h * 0.8;
    const a = rand() * Math.PI;
    ctx.strokeStyle = '#d9cfb8';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a) * 9, y - Math.sin(a) * 9);
    ctx.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  // A skull on top.
  ctx.fillStyle = '#efe6d0';
  ctx.beginPath();
  ctx.arc(o.x, o.y - 2, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(o.x - 4, o.y + 3, 8, 5);
  ctx.fillStyle = '#1a0a08';
  ctx.beginPath();
  ctx.arc(o.x - 3, o.y - 2, 2, 0, Math.PI * 2);
  ctx.arc(o.x + 3, o.y - 2, 2, 0, Math.PI * 2);
  ctx.fill();
}

function paintBrazier(ctx: Ctx, o: Obstacle) {
  const r = o.w / 2;
  ctx.fillStyle = '#2a2a30';
  ctx.beginPath();
  ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6a6a74';
  ctx.lineWidth = 2;
  ctx.stroke();
  const g = ctx.createRadialGradient(o.x, o.y, 1, o.x, o.y, r * 0.8);
  g.addColorStop(0, '#fff2b0');
  g.addColorStop(0.5, '#ff9a2a');
  g.addColorStop(1, '#c0300a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r * 0.75, 0, Math.PI * 2);
  ctx.fill();
}

function paintObsidianRock(ctx: Ctx, o: Obstacle) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  ctx.fillStyle = '#16121c';
  ctx.beginPath();
  ctx.moveTo(l + 6, t);
  ctx.lineTo(l + o.w - 4, t + 4);
  ctx.lineTo(l + o.w, t + o.h - 6);
  ctx.lineTo(l + o.w * 0.4, t + o.h);
  ctx.lineTo(l, t + o.h * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,120,220,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,120,60,0.6)';
  ctx.beginPath();
  ctx.moveTo(l + 10, t + 8);
  ctx.lineTo(o.x, o.y);
  ctx.lineTo(l + o.w - 10, t + o.h - 10);
  ctx.stroke();
}

/** Black stone fortress wall with red-hot mortar and spiked crenellations. */
function paintFortWall(ctx: Ctx, o: Obstacle) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(l + 5, t + 6, o.w, o.h);
  ctx.fillStyle = '#1c1820';
  ctx.fillRect(l, t, o.w, o.h);
  ctx.strokeStyle = 'rgba(255,80,30,0.45)';
  ctx.lineWidth = 1;
  for (let y = t; y < t + o.h; y += 14) {
    ctx.beginPath();
    ctx.moveTo(l, y);
    ctx.lineTo(l + o.w, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#3a3440';
  for (let y = t + 4; y < t + o.h - 4; y += 18) {
    ctx.beginPath();
    ctx.moveTo(l - 5, y);
    ctx.lineTo(l + 2, y + 4);
    ctx.lineTo(l + 2, y - 4);
    ctx.fill();
  }
  ctx.strokeStyle = '#8a2a1a';
  ctx.lineWidth = 2;
  ctx.strokeRect(l, t, o.w, o.h);
}

function paintRedPillar(ctx: Ctx, o: Obstacle) {
  const r = o.w / 2;
  ctx.fillStyle = '#1a0a08';
  ctx.fillRect(o.x - r - 4, o.y - r - 4, o.w + 8, o.h + 8);
  const g = ctx.createRadialGradient(o.x - r * 0.3, o.y - r * 0.3, 2, o.x, o.y, r);
  g.addColorStop(0, '#d8343a');
  g.addColorStop(1, '#6a0c12');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d9ae4a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r - 4, 0, Math.PI * 2);
  ctx.stroke();
}

/** The Oni King's throne: gold frame, red cushion, a pair of horns on the back. */
function paintThrone(ctx: Ctx, o: Obstacle) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  ctx.fillStyle = '#c9962a';
  ctx.beginPath();
  ctx.roundRect(l - 6, t - 6, o.w + 12, o.h + 12, 8);
  ctx.fill();
  ctx.fillStyle = '#7a0e16';
  ctx.beginPath();
  ctx.roundRect(l, t, o.w, o.h, 6);
  ctx.fill();
  ctx.fillStyle = '#efe6d0';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(o.x + o.w / 2, o.y + s * 26);
    ctx.lineTo(o.x + o.w / 2 + 22, o.y + s * 40);
    ctx.lineTo(o.x + o.w / 2, o.y + s * 16);
    ctx.fill();
  }
  ctx.fillStyle = '#d9ae4a';
  ctx.beginPath();
  ctx.arc(o.x, o.y, 7, 0, Math.PI * 2);
  ctx.fill();
}

/** Obsidian border with a red-hot inner edge. */
function paintHellWall(ctx: Ctx, rand: () => number) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#120c10';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  for (let i = 0; i < 80; i++) {
    const x = rand() * WIDTH;
    const y = top + rand() * (HEIGHT - top);
    if (x > WALL && x < WIDTH - WALL && y > top + WALL && y < HEIGHT - WALL) continue;
    ctx.fillStyle = 'rgba(120,90,160,0.35)';
    ctx.fillRect(x, y, 3, 2);
  }
  ctx.strokeStyle = '#ff5a1a';
  ctx.lineWidth = 2;
  ctx.strokeRect(WALL - 1, top + WALL - 1, WIDTH - WALL * 2 + 2, HEIGHT - top - WALL * 2 + 2);
  ctx.strokeStyle = 'rgba(255,90,26,0.25)';
  ctx.lineWidth = 8;
  ctx.strokeRect(WALL + 3, top + WALL + 3, WIDTH - WALL * 2 - 6, HEIGHT - top - WALL * 2 - 6);
}
