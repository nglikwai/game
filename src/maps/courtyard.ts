import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import {
  ARENA, ARENA_MID_Y, WALL, cornerPile, paintLantern, paintLanternGlow, paintShadow, paintVignette, stoneBlock,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from '@/maps/common';

/** 古寺庭院 Temple Courtyard: flagstones, a bagua ring around a bronze cauldron, red pillars. */

const OBSTACLES: Obstacle[] = [
  { kind: 'pillar', x: 390, y: ARENA_MID_Y - 150, w: 60, h: 60 },
  { kind: 'pillar', x: WIDTH - 390, y: ARENA_MID_Y - 150, w: 60, h: 60 },
  { kind: 'pillar', x: 390, y: ARENA_MID_Y + 150, w: 60, h: 60 },
  { kind: 'pillar', x: WIDTH - 390, y: ARENA_MID_Y + 150, w: 60, h: 60 },
  { kind: 'cauldron', x: WIDTH / 2, y: ARENA_MID_Y, w: 96, h: 96 },
  { kind: 'lantern', x: 150, y: ARENA_MID_Y, w: 40, h: 40 },
  { kind: 'lantern', x: WIDTH - 150, y: ARENA_MID_Y, w: 40, h: 40 },
];

const CAULDRON = { x: WIDTH / 2, y: ARENA_MID_Y };

const wallPair = (sx: 1 | -1): ChestSpot[] => {
  const x = sx > 0 ? ARENA.x + 24 : ARENA.x + ARENA.w - 24;
  return [{ x, y: ARENA_MID_Y - 22 }, { x, y: ARENA_MID_Y + 22 }];
};

/**
 * Grouped rather than spread evenly, but mirrored so no side gets a better spot.
 * Risk vs reward: corner piles by each start are usually empty, wall pairs are
 * average, and the contested middle pays best.
 */
const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1),
  ...cornerPile(-1, 1),
  ...cornerPile(1, -1),
  ...cornerPile(-1, -1),
  ...wallPair(1),
  ...wallPair(-1),
  // The two big ones, top and bottom centre: the same distance from everyone.
  { x: WIDTH / 2, y: ARENA.y + 54, big: true },
  { x: WIDTH / 2, y: ARENA.y + ARENA.h - 54, big: true },
  // On the diagonals of the bagua ring, around the cauldron: the contested middle, rarely empty.
  { x: WIDTH / 2 - 110, y: ARENA_MID_Y - 110, empty: 0.2 },
  { x: WIDTH / 2 + 110, y: ARENA_MID_Y - 110, empty: 0.2 },
  { x: WIDTH / 2 - 110, y: ARENA_MID_Y + 110, empty: 0.2 },
  { x: WIDTH / 2 + 110, y: ARENA_MID_Y + 110, empty: 0.2 },
];

export const COURTYARD: GameMap = {
  id: 'courtyard',
  name: 'Temple Courtyard',
  zh: '古寺庭院',
  desc: 'Open flagstones around a smoking cauldron. Red pillars for cover.',
  descZh: '香爐四周的開闊石板庭院，紅柱可作掩護。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'petals',
  smokeFrom: CAULDRON,
  paint(ctx, rand) {
    paintFlagstones(ctx, rand);
    paintBagua(ctx);
    paintGrime(ctx, rand);
    for (const o of OBSTACLES) if (o.kind === 'lantern') paintLanternGlow(ctx, o);
    for (const o of OBSTACLES) paintShadow(ctx, o);
    for (const o of OBSTACLES) {
      if (o.kind === 'pillar') paintPillar(ctx, o);
      else if (o.kind === 'cauldron') paintCauldron(ctx, o);
      else paintLantern(ctx, o);
    }
    paintPetals(ctx, rand);
    paintWalls(ctx);
    paintVignette(ctx);
  },
};

function paintFlagstones(ctx: Ctx, rand: () => number) {
  ctx.fillStyle = '#3d3a35'; // mortar
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);

  const rowH = 52;
  for (let y = HUD_HEIGHT, row = 0; y < HEIGHT; y += rowH, row++) {
    let x = row % 2 === 0 ? 0 : -45;
    while (x < WIDTH) {
      const w = 64 + Math.floor(rand() * 54);
      const light = 34 + rand() * 9;
      const hue = 30 + rand() * 14;
      const sat = 7 + rand() * 7;
      const sx = x + 1.5;
      const sy = y + 1.5;
      const sw = w - 3;
      const sh = rowH - 3;

      ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
      ctx.beginPath();
      ctx.roundRect(sx, sy, sw, sh, 4);
      ctx.fill();

      // Bevel: light top-left edge, dark bottom-right edge.
      ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light + 12}%, 0.55)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx + 3, sy + sh - 1);
      ctx.lineTo(sx + 1, sy + 1);
      ctx.lineTo(sx + sw - 3, sy + 1);
      ctx.stroke();
      ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light - 14}%, 0.6)`;
      ctx.beginPath();
      ctx.moveTo(sx + sw - 1, sy + 3);
      ctx.lineTo(sx + sw - 1, sy + sh - 1);
      ctx.lineTo(sx + 3, sy + sh - 1);
      ctx.stroke();

      // Speckles.
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.07)';
        ctx.fillRect(sx + rand() * sw, sy + rand() * sh, 1.5, 1.5);
      }

      // Occasional crack.
      if (rand() < 0.12) {
        ctx.strokeStyle = 'rgba(20,18,15,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        let cx = sx + rand() * sw;
        let cy = sy + 2;
        ctx.moveTo(cx, cy);
        for (let i = 0; i < 4; i++) {
          cx += (rand() - 0.5) * 18;
          cy += sh / 4;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
      x += w;
    }
  }
}

// ☰ ☱ ☲ ☳ ☴ ☵ ☶ ☷ as [inner, middle, outer] lines, 1 = solid, 0 = broken.
const TRIGRAMS = [
  [1, 1, 1], [1, 1, 0], [1, 0, 1], [1, 0, 0],
  [0, 1, 1], [0, 1, 0], [0, 0, 1], [0, 0, 0],
];

function paintBagua(ctx: Ctx) {
  const { x, y } = CAULDRON;
  const r0 = 128;
  const r1 = 186;

  // Smooth paved ring.
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r1, 0, Math.PI * 2);
  ctx.arc(x, y, r0, 0, Math.PI * 2, true);
  const grad = ctx.createRadialGradient(x, y, r0, x, y, r1);
  grad.addColorStop(0, '#6f675a');
  grad.addColorStop(0.5, '#7b7364');
  grad.addColorStop(1, '#6a6255');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(30,26,22,0.7)';
  ctx.lineWidth = 3;
  for (const r of [r0, r1]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(212,167,60,0.35)';
  ctx.lineWidth = 1;
  for (const r of [r0 + 5, r1 - 5]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Eight carved trigrams around the ring.
  ctx.fillStyle = 'rgba(28,24,20,0.75)';
  TRIGRAMS.forEach((lines, n) => {
    const a = (n / 8) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.translate(x + Math.cos(a) * ((r0 + r1) / 2), y + Math.sin(a) * ((r0 + r1) / 2));
    ctx.rotate(a + Math.PI / 2);
    lines.forEach((solid, i) => {
      const ly = 10 - i * 10;
      if (solid) ctx.fillRect(-16, ly - 2.5, 32, 5);
      else {
        ctx.fillRect(-16, ly - 2.5, 13, 5);
        ctx.fillRect(3, ly - 2.5, 13, 5);
      }
    });
    ctx.restore();
  });

  // Dividers between trigrams.
  ctx.strokeStyle = 'rgba(30,26,22,0.5)';
  ctx.lineWidth = 2;
  for (let n = 0; n < 8; n++) {
    const a = ((n + 0.5) / 8) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();
}

function paintGrime(ctx: Ctx, rand: () => number) {
  // Moss creeping in from the walls and around pillar bases.
  const blob = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (let i = 0; i < 40; i++) {
    const side = Math.floor(rand() * 4);
    const t = rand();
    const x = side < 2 ? ARENA.x + t * ARENA.w : side === 2 ? ARENA.x + 10 : ARENA.x + ARENA.w - 10;
    const y = side >= 2 ? ARENA.y + t * ARENA.h : side === 0 ? ARENA.y + 10 : ARENA.y + ARENA.h - 10;
    blob(x, y, 30 + rand() * 50, `rgba(70,95,45,${0.12 + rand() * 0.12})`);
  }
  for (const o of OBSTACLES) {
    if (o.kind !== 'pillar') continue;
    for (let i = 0; i < 3; i++) blob(o.x + (rand() - 0.5) * 60, o.y + (rand() - 0.5) * 60, 40, 'rgba(70,95,45,0.16)');
  }
  // Worn, darker patches where fighters spar.
  for (let i = 0; i < 10; i++) {
    blob(ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 60 + rand() * 60, 'rgba(25,20,15,0.10)');
  }
}

function paintPillar(ctx: Ctx, o: Obstacle) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  stoneBlock(ctx, l, t, o.w, o.h, '#8d877a', '#aaa496', '#5f5a50');
  // Carved inset on the base.
  ctx.strokeStyle = 'rgba(60,55,48,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(l + 7, t + 7, o.w - 14, o.h - 14);

  // Red lacquered column seen from above.
  const r = 22;
  const g = ctx.createRadialGradient(o.x - 7, o.y - 7, 2, o.x, o.y, r);
  g.addColorStop(0, '#e0614f');
  g.addColorStop(0.55, '#a8302a');
  g.addColorStop(1, '#5e1712');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
  ctx.fill();

  // Gold band and cap.
  ctx.strokeStyle = '#d9ae4a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r - 1.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(217,174,74,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r - 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#d9ae4a';
  ctx.beginPath();
  ctx.arc(o.x, o.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

function paintCauldron(ctx: Ctx, o: Obstacle) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  // Two-step stone plinth.
  stoneBlock(ctx, l, t, o.w, o.h, '#857f72', '#a39d8f', '#58534a');
  stoneBlock(ctx, l + 10, t + 10, o.w - 20, o.h - 20, '#948e81', '#b2ac9e', '#666156');

  // Bronze cauldron (鼎) body.
  const r = 30;
  const body = ctx.createRadialGradient(o.x - 9, o.y - 9, 3, o.x, o.y, r);
  body.addColorStop(0, '#d8b46a');
  body.addColorStop(0.5, '#9a7436');
  body.addColorStop(1, '#4a3518');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
  ctx.fill();

  // Handles (ears) on either side.
  ctx.fillStyle = '#7d5e2c';
  ctx.strokeStyle = '#3a2a12';
  ctx.lineWidth = 1.5;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.roundRect(o.x + s * (r + 1) - (s > 0 ? 0 : 9), o.y - 9, 9, 18, 3);
    ctx.fill();
    ctx.stroke();
  }

  // Rim and patina.
  ctx.strokeStyle = '#3a2a12';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(90,150,120,0.45)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r - 4, 0.3, 2.2);
  ctx.stroke();

  // Glowing incense ash inside.
  const ash = ctx.createRadialGradient(o.x, o.y, 1, o.x, o.y, r - 7);
  ash.addColorStop(0, '#ffcf6b');
  ash.addColorStop(0.35, '#e0612a');
  ash.addColorStop(0.75, '#3b2a20');
  ash.addColorStop(1, '#241a14');
  ctx.fillStyle = ash;
  ctx.beginPath();
  ctx.arc(o.x, o.y, r - 7, 0, Math.PI * 2);
  ctx.fill();
  // Incense sticks.
  ctx.fillStyle = '#c0392b';
  for (const [dx, dy] of [[-6, -3], [4, -6], [2, 5]]) ctx.fillRect(o.x + dx - 1, o.y + dy - 1, 2.5, 2.5);
}

function paintPetals(ctx: Ctx, rand: () => number) {
  for (let i = 0; i < 70; i++) {
    const x = ARENA.x + rand() * ARENA.w;
    const y = ARENA.y + rand() * ARENA.h;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand() * Math.PI);
    const leaf = rand() < 0.3;
    ctx.fillStyle = leaf ? `rgba(${150 + rand() * 40},${110 + rand() * 30},40,0.75)` : `rgba(255,${170 + rand() * 40},${190 + rand() * 30},0.8)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, leaf ? 4.5 : 3, leaf ? 2 : 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function paintWalls(ctx: Ctx) {
  const top = HUD_HEIGHT;
  // Shadow cast by the wall onto the floor.
  const inner = (x0: number, y0: number, x1: number, y1: number, x: number, y: number, w: number, h: number) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  };
  const s = 26;
  inner(0, ARENA.y, 0, ARENA.y + s, ARENA.x, ARENA.y, ARENA.w, s);
  inner(0, ARENA.y + ARENA.h, 0, ARENA.y + ARENA.h - s, ARENA.x, ARENA.y + ARENA.h - s, ARENA.w, s);
  inner(ARENA.x, 0, ARENA.x + s, 0, ARENA.x, ARENA.y, s, ARENA.h);
  inner(ARENA.x + ARENA.w, 0, ARENA.x + ARENA.w - s, 0, ARENA.x + ARENA.w - s, ARENA.y, s, ARENA.h);

  // Tiled roof coping: grey band with tile ridges.
  ctx.fillStyle = '#34373e';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);

  ctx.strokeStyle = 'rgba(120,126,138,0.55)';
  ctx.lineWidth = 2;
  for (let x = 6; x < WIDTH; x += 11) {
    ctx.beginPath();
    ctx.moveTo(x, top + 3);
    ctx.lineTo(x, top + WALL - 6);
    ctx.moveTo(x, HEIGHT - WALL + 6);
    ctx.lineTo(x, HEIGHT - 3);
    ctx.stroke();
  }
  for (let y = top + 6; y < HEIGHT; y += 11) {
    ctx.beginPath();
    ctx.moveTo(3, y);
    ctx.lineTo(WALL - 6, y);
    ctx.moveTo(WIDTH - WALL + 6, y);
    ctx.lineTo(WIDTH - 3, y);
    ctx.stroke();
  }

  // Red wall face along the inner edge, with a gold trim line.
  ctx.fillStyle = '#8f2a20';
  ctx.fillRect(WALL - 5, top + WALL - 5, WIDTH - (WALL - 5) * 2, 5);
  ctx.fillRect(WALL - 5, HEIGHT - WALL, WIDTH - (WALL - 5) * 2, 5);
  ctx.fillRect(WALL - 5, top + WALL - 5, 5, HEIGHT - top - (WALL - 5) * 2);
  ctx.fillRect(WIDTH - WALL, top + WALL - 5, 5, HEIGHT - top - (WALL - 5) * 2);
  ctx.strokeStyle = '#d9ae4a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(WALL - 0.75, top + WALL - 0.75, WIDTH - WALL * 2 + 1.5, HEIGHT - top - WALL * 2 + 1.5);

  // Ridge line along the outer edge.
  ctx.strokeStyle = '#1f2126';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, top + 1.5, WIDTH - 3, HEIGHT - top - 3);

  // Gold corner caps.
  ctx.fillStyle = '#c99a3a';
  for (const [cx, cy] of [[0, top], [WIDTH - WALL, top], [0, HEIGHT - WALL], [WIDTH - WALL, HEIGHT - WALL]]) {
    ctx.fillRect(cx + 3, cy + 3, WALL - 6, WALL - 6);
    ctx.strokeStyle = '#6d5020';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx + 6, cy + 6, WALL - 12, WALL - 12);
  }
}
