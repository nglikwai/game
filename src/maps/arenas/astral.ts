import { ARENA, ARENA_MID_Y as MID, cornerPile, paintVignette, type GameMap, type Obstacle } from '@/maps/common';
import { paintRim, paintRune, paintSlab, paintTiles } from '@/maps/art/primitives';

const CRYSTALS: Obstacle[] = [480, 800].flatMap((x) => [
  { kind: 'crystal' as const, x, y: MID - 105, w: 36, h: 58 },
  { kind: 'crystal' as const, x, y: MID + 105, w: 36, h: 58 },
]);
const PORTALS = [
  { a: { x: 310, y: MID - 140 }, b: { x: 970, y: MID + 140 }, color: 0xb99aef },
  { a: { x: 310, y: MID + 140 }, b: { x: 970, y: MID - 140 }, color: 0x81cbd6 },
];

export const ASTRAL: GameMap = {
  id: 'astral', name: 'Astral Observatory', zh: '星象觀測臺',
  desc: 'Paired star gates cross the arena. Reflect shots off the crystals and hold the central soul altar.',
  descZh: '成對星門連接競技場兩側。利用水晶反彈飛行道具，並佔據中央魂之祭壇。',
  obstacles: CRYSTALS,
  chests: [...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
    { x: 640, y: MID - 80, big: true }, { x: 640, y: MID + 80, big: true }],
  zones: [{ kind: 'altar', x: 640, y: MID, w: 110, h: 100 }],
  portals: PORTALS, particles: 'wisps',
  paint(ctx, rand) {
    paintTiles(ctx, rand, '#29283e', '#1d1d30', 64);
    // Brass orrery rings with constellations engraved in the floor.
    ctx.strokeStyle = '#80729d'; ctx.lineWidth = 2;
    for (const r of [120, 185, 235]) { ctx.beginPath(); ctx.ellipse(640, MID, r * 1.45, r, 0, 0, Math.PI * 2); ctx.stroke(); }
    for (let k = 0; k < 100; k++) {
      const x = ARENA.x + rand() * ARENA.w; const y = ARENA.y + rand() * ARENA.h;
      ctx.fillStyle = '#c8bedb'; ctx.fillRect(x, y, 1.5, 1.5);
      if (k % 6 === 0) { ctx.strokeStyle = 'rgba(172,160,201,0.25)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18, y - 12); ctx.lineTo(x + 32, y + 6); ctx.stroke(); }
    }
    paintRune(ctx, 640, MID, 53, 'rgba(206,173,246,0.6)');
    for (const p of PORTALS) for (const point of [p.a, p.b]) paintRune(ctx, point.x, point.y, 25, p.color === 0xb99aef ? 'rgba(185,154,239,0.7)' : 'rgba(129,203,214,0.7)');
    for (const o of CRYSTALS) {
      paintSlab(ctx, o, '#3e385b', '#9981bd');
      ctx.fillStyle = '#b8b1ed'; ctx.beginPath(); ctx.moveTo(o.x, o.y - o.h / 2); ctx.lineTo(o.x + o.w / 2, o.y); ctx.lineTo(o.x, o.y + o.h / 2); ctx.lineTo(o.x - o.w / 2, o.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7970b9'; ctx.beginPath(); ctx.moveTo(o.x, o.y - o.h / 2); ctx.lineTo(o.x + o.w / 2, o.y); ctx.lineTo(o.x, o.y + o.h / 2); ctx.closePath(); ctx.fill();
    }
    paintRim(ctx, '#1e1c2f', '#9c87bd');
    paintVignette(ctx);
  },
};
