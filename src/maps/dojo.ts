import { HEIGHT, HUD_HEIGHT, WIDTH } from '../config';
import {
  ARENA, ARENA_MID_Y, WALL, blob, cornerPile,
  type ChestSpot, type Ctx, type GameMap, type Obstacle,
} from './common';

/**
 * 忍者道場 Ninja Dojo: an indoor hall on tatami, split into three rooms by sliding
 * paper doors with doorways in the middle. Pillars, training dummies, weapon racks.
 */

const MID = ARENA_MID_Y;
const CX = WIDTH / 2;
/** Shoji partitions at these x positions, with a doorway of this height in the middle. */
const PARTITIONS = [420, WIDTH - 420];
const DOOR = 140;
const SHOJI_W = 14;

function partitions(): Obstacle[] {
  const top = ARENA.y;
  const bottom = ARENA.y + ARENA.h;
  const h = MID - DOOR / 2 - top;
  return PARTITIONS.flatMap((x) => [
    { kind: 'shoji' as const, x, y: top + h / 2, w: SHOJI_W, h },
    { kind: 'shoji' as const, x, y: bottom - h / 2, w: SHOJI_W, h },
  ]);
}

const OBSTACLES: Obstacle[] = [
  ...partitions(),
  ...[[CX - 130, MID - 110], [CX + 130, MID - 110], [CX - 130, MID + 110], [CX + 130, MID + 110]]
    .map(([x, y]) => ({ kind: 'post' as const, x, y, w: 30, h: 30 })),
  // Training dummies in the side rooms, placed point-symmetrically.
  { kind: 'dummy', x: 230, y: 250, w: 30, h: 30 },
  { kind: 'dummy', x: WIDTH - 230, y: 2 * MID - 250, w: 30, h: 30 },
  { kind: 'dummy', x: 300, y: 2 * MID - 230, w: 30, h: 30 },
  { kind: 'dummy', x: WIDTH - 300, y: 230, w: 30, h: 30 },
];

const CHESTS: ChestSpot[] = [
  ...cornerPile(1, 1),
  ...cornerPile(-1, 1),
  ...cornerPile(1, -1),
  ...cornerPile(-1, -1),
  // The main hall: big chests in the middle, rich small ones at its ends.
  { x: CX - 60, y: MID, big: true },
  { x: CX + 60, y: MID, big: true },
  { x: CX, y: ARENA.y + 50, empty: 0.2 },
  { x: CX, y: ARENA.y + ARENA.h - 50, empty: 0.2 },
  // In the side rooms.
  { x: 320, y: ARENA.y + 50 },
  { x: WIDTH - 320, y: ARENA.y + ARENA.h - 50 },
];

export const DOJO: GameMap = {
  id: 'dojo',
  name: 'Ninja Dojo',
  zh: '忍者道場',
  desc: 'Indoors on tatami. Paper-door walls split three rooms joined by doorways.',
  descZh: '室內榻榻米道場，紙拉門把空間分成三個房間，中間有門口相通。',
  obstacles: OBSTACLES,
  chests: CHESTS,
  particles: 'dust',
  route(fx, fy, tx, ty) {
    // Rooms: 0 = left, 1 = main hall, 2 = right. Walk through the doorway towards the target's room.
    const room = (x: number) => (x < PARTITIONS[0] ? 0 : x > PARTITIONS[1] ? 2 : 1);
    const from = room(fx);
    const to = room(tx);
    if (from === to) return null;
    const wall = to > from ? PARTITIONS[from] : PARTITIONS[from - 1];
    const dir = to > from ? 1 : -1;
    const mouth = { x: wall - dir * 34, y: MID };
    const inDoor = Math.abs(fy - MID) < DOOR / 2 - 20;
    if (inDoor && Math.abs(fx - wall) < 50) return { x: wall + dir * 40, y: MID };
    return mouth;
  },
  paint(ctx) {
    paintTatami(ctx);
    paintWeaponRacks(ctx);
    for (const o of OBSTACLES) {
      if (o.kind === 'shoji') paintShoji(ctx, o);
      else if (o.kind === 'post') paintPost(ctx, o);
      else if (o.kind === 'dummy') paintDummy(ctx, o);
    }
    paintHallWall(ctx);
    // Warm light from the paper doors, darker in the corners.
    blob(ctx, CX, MID, 420, 'rgba(255,220,160,0.12)');
    const v = ctx.createRadialGradient(CX, MID, 260, CX, MID, 760);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(20,10,0,0.45)');
    ctx.fillStyle = v;
    ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  },
};

/** Tatami mats laid in staggered rows, with dark cloth borders along the long edges. */
function paintTatami(ctx: Ctx) {
  ctx.fillStyle = '#3b2a1c';
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  const H = 46;
  const W = H * 2;
  for (let row = 0; HUD_HEIGHT + row * H < HEIGHT; row++) {
    const y = HUD_HEIGHT + row * H;
    for (let x = row % 2 ? -H : 0; x < WIDTH; x += W) {
      const g = ctx.createLinearGradient(x, y, x + W, y + H);
      g.addColorStop(0, '#c9b47a');
      g.addColorStop(1, '#b39d63');
      ctx.fillStyle = g;
      ctx.fillRect(x + 1, y + 1, W - 2, H - 2);
      // Woven texture.
      ctx.strokeStyle = 'rgba(110,90,50,0.22)';
      ctx.lineWidth = 1;
      for (let k = 4; k < H - 2; k += 3) {
        ctx.beginPath();
        ctx.moveTo(x + 2, y + k);
        ctx.lineTo(x + W - 2, y + k);
        ctx.stroke();
      }
      ctx.fillStyle = '#2a3a2a';
      ctx.fillRect(x + 1, y + 1, W - 2, 3);
      ctx.fillRect(x + 1, y + H - 4, W - 2, 3);
    }
  }
}

function paintShoji(ctx: Ctx, o: Obstacle) {
  const l = o.x - o.w / 2;
  const t = o.y - o.h / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(l + 4, t + 4, o.w, o.h);
  ctx.fillStyle = '#f2ead6';
  ctx.fillRect(l, t, o.w, o.h);
  ctx.strokeStyle = '#4a2e18';
  ctx.lineWidth = 2;
  ctx.strokeRect(l, t, o.w, o.h);
  // Lattice.
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(o.x, t);
  ctx.lineTo(o.x, t + o.h);
  for (let y = t + 16; y < t + o.h; y += 16) {
    ctx.moveTo(l, y);
    ctx.lineTo(l + o.w, y);
  }
  ctx.stroke();
}

function paintPost(ctx: Ctx, o: Obstacle) {
  blob(ctx, o.x + 5, o.y + 7, o.w * 0.9, 'rgba(0,0,0,0.5)');
  const g = ctx.createRadialGradient(o.x - 5, o.y - 5, 2, o.x, o.y, o.w * 0.7);
  g.addColorStop(0, '#8a5a32');
  g.addColorStop(1, '#4a2e18');
  ctx.fillStyle = g;
  ctx.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
  ctx.strokeStyle = '#2a1a0c';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
  ctx.fillStyle = '#d9ae4a';
  ctx.fillRect(o.x - o.w / 2, o.y - 3, o.w, 6);
}

/** Straw training dummy on a post, seen from above. */
function paintDummy(ctx: Ctx, o: Obstacle) {
  blob(ctx, o.x + 4, o.y + 6, 22, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = '#c9a85a';
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.w / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a6a2a';
  ctx.lineWidth = 1;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(o.x + Math.cos(a) * o.w * 0.5, o.y + Math.sin(a) * o.w * 0.5);
    ctx.stroke();
  }
  // Crossbar arms and a rope tie.
  ctx.fillStyle = '#6b4224';
  ctx.fillRect(o.x - o.w * 0.8, o.y - 2.5, o.w * 1.6, 5);
  ctx.strokeStyle = '#b8322a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(o.x, o.y, o.w * 0.3, 0, Math.PI * 2);
  ctx.stroke();
}

/** Racks of practice weapons along the top and bottom walls (decoration). */
function paintWeaponRacks(ctx: Ctx) {
  const rack = (x: number, y: number) => {
    ctx.fillStyle = '#4a2e18';
    ctx.fillRect(x - 40, y - 3, 80, 6);
    for (let k = -30; k <= 30; k += 15) {
      ctx.strokeStyle = '#a07040';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + k, y - 10);
      ctx.lineTo(x + k, y + 10);
      ctx.stroke();
    }
  };
  for (const x of [200, 520, WIDTH - 520, WIDTH - 200]) {
    rack(x, ARENA.y + 10);
    rack(x, ARENA.y + ARENA.h - 10);
  }
}

/** Dark wooden walls with a lattice band. */
function paintHallWall(ctx: Ctx) {
  const top = HUD_HEIGHT;
  ctx.fillStyle = '#2a1a0e';
  ctx.fillRect(0, top, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, top, WALL, HEIGHT - top);
  ctx.fillRect(WIDTH - WALL, top, WALL, HEIGHT - top);
  ctx.strokeStyle = 'rgba(200,170,120,0.25)';
  ctx.lineWidth = 1;
  for (let x = 0; x < WIDTH; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, top + 4);
    ctx.lineTo(x, top + WALL - 4);
    ctx.moveTo(x, HEIGHT - WALL + 4);
    ctx.lineTo(x, HEIGHT - 4);
    ctx.stroke();
  }
  ctx.strokeStyle = '#d9ae4a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(WALL - 0.75, top + WALL - 0.75, WIDTH - WALL * 2 + 1.5, HEIGHT - top - WALL * 2 + 1.5);
}
