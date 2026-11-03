import { EXPEDITION as E } from '@/config/expedition';
import { mulberry32, type Ctx, type GameMap, type Obstacle } from '@/maps/common';
import { forestRouter } from '@/battle/expedition/navigation';

export const FOREST_ROADS = [
  [{ x: 1800, y: 2180 }, { x: 1800, y: 1460 }, { x: 1800, y: 850 }],
  [{ x: 1800, y: 1460 }, { x: 1200, y: 1470 }, { x: 780, y: 1260 }],
  [{ x: 1800, y: 1460 }, { x: 2400, y: 1360 }, { x: 2860, y: 1260 }],
  [{ x: 780, y: 1260 }, { x: 1100, y: 950 }, { x: 1800, y: 850 }],
  [{ x: 2860, y: 1260 }, { x: 2860, y: 1980 }],
  [{ x: 2860, y: 1980 }, { x: 2400, y: 2200 }, { x: 1800, y: 2180 }],
];
const distRoad = (x: number, y: number) => Math.min(...FOREST_ROADS.flatMap((road) => road.slice(1).map((b, i) => {
  const a = road[i], dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
})));

export function createForest(seed: number): GameMap {
  const rand = mulberry32(seed);
  const obstacles: Obstacle[] = [
    // Fortress perimeter: one entrance, wide enough for four fighters.
    { kind: 'ruin', x: 1260, y: 450, w: 80, h: 660 }, { kind: 'ruin', x: 2340, y: 450, w: 80, h: 660 },
    { kind: 'ruin', x: 1800, y: 140, w: 1080, h: 70 },
    { kind: 'ruin', x: 1460, y: 740, w: 440, h: 70 }, { kind: 'ruin', x: 2140, y: 740, w: 440, h: 70 },
    ...[1530, 2070].map((x): Obstacle => ({ kind: 'pillar', x, y: 390, w: 64, h: 64 })),
    // A river with a wide middle bridge and a southern ford.
    { kind: 'water', x: 2400, y: 900, w: 160, h: 680 }, { kind: 'water', x: 2400, y: 1770, w: 160, h: 600 },
    ...[{ x: 580, y: 1100 }, { x: 1020, y: 1150 }, { x: 590, y: 1430 }, { x: 1040, y: 1490 }]
      .map((p): Obstacle => ({ kind: 'house', ...p, w: 150, h: 110 })),
    ...[{ x: 2650, y: 1120 }, { x: 3030, y: 1390 }, { x: 2700, y: 1430 }]
      .map((p): Obstacle => ({ kind: 'rock', ...p, w: 76, h: 58 })),
  ];
  // Trees vary between runs, while roads, encounters, bridge and checkpoint stay reachable.
  for (let k = 0; k < 700; k++) {
    const x = 70 + rand() * (E.width - 140), y = 200 + rand() * (E.height - 280);
    if (x > 1190 && x < 2410 && y < 990 || distRoad(x, y) < 160
      || [...E.camps, E.start, E.checkpoint, E.healing].some((p) => Math.hypot(p.x - x, p.y - y) < 220)
      || obstacles.some((o) => Math.abs(x - o.x) < o.w / 2 + 70 && Math.abs(y - o.y) < o.h / 2 + 70)) continue;
    obstacles.push({ kind: 'pine', x, y, w: 34, h: 34 });
  }
  return {
    id: 'expedition-forest', name: 'Mistwood Breach', zh: '霧林破陣',
    desc: 'Defeat both captains, open the fortress and bring down the Thorn Commander. Rescue the healer for a safe healing station.',
    descZh: '擊敗兩名守將、打開古堡大門，討伐荊棘統領。救出藥師可開啟堡前療傷站。',
    particles: 'leaves', obstacles, chests: [
      { x: 1660, y: 2120 }, { x: 900, y: 1350 }, { x: 2960, y: 1160 }, { x: 3000, y: 2040, big: true },
      { x: 1640, y: 880, big: true },
    ],
    herbs: { spots: [{ x: 1660, y: 1570 }, { x: 1230, y: 1010 }, { x: 2750, y: 1630 }], heal: 18, regrow: 35 },
    kegs: { spots: [{ x: 680, y: 1250 }, { x: 930, y: 1370 }, { x: 2960, y: 1290 }], radius: 100, damage: 24, respawn: 120 },
    route: forestRouter(E.width, E.height, [...obstacles, E.gate]),
    paint(ctx, random) { paintForest(ctx, this.obstacles, random); },
  };
}

/** Chunk-compatible art: every tile uses the same seeded brushwork and global coordinates. */
export function paintForest(ctx: Ctx, obstacles: Obstacle[], rand: () => number) {
  ctx.fillStyle = '#243d38'; ctx.fillRect(0, 92, E.width, E.height - 92);
  for (let k = 0; k < 1800; k++) {
    ctx.fillStyle = k % 3 ? 'rgba(121,151,97,0.09)' : 'rgba(12,32,32,0.22)';
    ctx.beginPath(); ctx.ellipse(rand() * E.width, 92 + rand() * (E.height - 92), 20 + rand() * 70, 10 + rand() * 30, rand(), 0, Math.PI * 2); ctx.fill();
  }
  for (const road of FOREST_ROADS) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [width, color] of [[190, '#3c5140'], [145, '#6d6b4e'], [110, '#878063']] as const) {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
      road.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#42524c'; ctx.fillRect(1300, 180, 1000, 520);
  ctx.strokeStyle = '#78847644'; ctx.lineWidth = 1;
  for (let x = 1300; x < 2300; x += 70) for (let y = 180; y < 700; y += 65) ctx.strokeRect(x, y, 70, 65);
  for (const o of obstacles) {
    const x = o.x - o.w / 2, y = o.y - o.h / 2;
    if (o.kind === 'pine') {
      ctx.fillStyle = '#172e2c'; ctx.beginPath(); ctx.ellipse(o.x + 12, o.y + 20, 48, 23, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#584d36'; ctx.fillRect(o.x - 8, o.y - 14, 16, 36);
      continue;
    }
    if (o.kind === 'water') {
      ctx.fillStyle = '#455b50'; ctx.fillRect(x - 15, y - 10, o.w + 30, o.h + 20);
      const water = ctx.createLinearGradient(x, 0, x + o.w, 0);
      water.addColorStop(0, '#244e58'); water.addColorStop(0.5, '#397982'); water.addColorStop(1, '#244e58');
      ctx.fillStyle = water; ctx.fillRect(x, y, o.w, o.h);
      ctx.strokeStyle = '#a4d4cd55'; ctx.lineWidth = 2;
      for (let yy = y + 20; yy < y + o.h; yy += 30) {
        ctx.beginPath(); ctx.moveTo(x + 25, yy); ctx.quadraticCurveTo(o.x, yy + 16, x + o.w - 25, yy + 4); ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#142626'; ctx.fillRect(x + 10, y + 12, o.w, o.h);
      ctx.fillStyle = o.kind === 'house' ? '#766850' : '#6d7971'; ctx.fillRect(x, y, o.w, o.h);
      ctx.strokeStyle = '#a7ad91'; ctx.lineWidth = 3; ctx.strokeRect(x + 4, y + 4, o.w - 8, o.h - 8);
      if (o.kind === 'house') {
        ctx.fillStyle = '#394d48'; ctx.beginPath(); ctx.moveTo(x - 12, y + o.h / 2); ctx.lineTo(o.x, y - 34); ctx.lineTo(x + o.w + 12, y + o.h / 2); ctx.closePath(); ctx.fill();
      }
    }
  }
  // Bridge planks and fortress paving give each landmark its own material.
  for (let x = 2300; x < 2500; x += 16) {
    ctx.fillStyle = '#9b8760'; ctx.fillRect(x, 1250, 13, 210); ctx.fillStyle = '#c0a779'; ctx.fillRect(x, 1250, 13, 3);
  }
  for (const p of [E.start, E.checkpoint]) {
    ctx.fillStyle = '#b29359'; ctx.beginPath(); ctx.arc(p.x, p.y, 68, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e2d39d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, 58, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.strokeStyle = '#111e22'; ctx.lineWidth = 35; ctx.strokeRect(18, 110, E.width - 36, E.height - 128);
}
