import { WIDTH } from '../config';
import { ARENA_MID_Y as MID, cornerPile, paintLantern, paintLanternGlow, paintVignette, type GameMap, type Obstacle, type TerrainZone } from './common';
import { paintPool, paintRim, paintSlab, paintTiles } from './newMapArt';

const POOLS: TerrainZone[] = [360, WIDTH - 360].map((x) => ({ kind: 'spring', x, y: MID, w: 136, h: 110 }));
const OBSTACLES: Obstacle[] = [360, WIDTH - 360].flatMap((x) => [
  { kind: 'house' as const, x, y: MID - 162, w: 148, h: 62 },
  { kind: 'house' as const, x, y: MID + 162, w: 148, h: 62 },
]);
const LANTERNS: Obstacle[] = [550, 730].flatMap((x) => [
  { kind: 'lantern' as const, x, y: MID - 98, w: 24, h: 24 },
  { kind: 'lantern' as const, x, y: MID + 98, w: 24, h: 24 },
]);

export const TEA: GameMap = {
  id: 'tea', name: 'Tea House Terrace', zh: '茶屋露臺',
  desc: 'Rest in the warm pools to heal, or race down the golden tea path between the tea houses.',
  descZh: '在溫暖的水池中療傷，或沿金色茶道加速穿過茶屋之間。',
  obstacles: [...OBSTACLES, ...LANTERNS],
  chests: [...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
    { x: 640, y: MID, big: true }, { x: 360, y: MID - 78 }, { x: 920, y: MID + 78 }],
  zones: [...POOLS, { kind: 'boost', x: 640, y: MID, w: 150, h: 400 }],
  particles: 'petals',
  paint(ctx, rand) {
    paintTiles(ctx, rand, '#725e43', '#4d4234', 40);
    // A gold-edged runner passes between the tea-house wings.
    ctx.fillStyle = '#a17c3c';
    ctx.fillRect(565, MID - 200, 150, 400);
    ctx.strokeStyle = '#e0bd72';
    ctx.lineWidth = 3;
    ctx.strokeRect(571, MID - 194, 138, 388);
    for (let y = MID - 175; y < MID + 190; y += 50) {
      ctx.fillStyle = '#dfbb72';
      ctx.beginPath(); ctx.moveTo(628, y + 8); ctx.lineTo(640, y - 4); ctx.lineTo(652, y + 8); ctx.stroke();
    }
    for (const z of POOLS) paintPool(ctx, z, '#528e84', '#abd4bd');
    for (const o of OBSTACLES) {
      paintSlab(ctx, o, '#58362b', '#b08355');
      // Curved terracotta roof tiles, seen from above.
      for (let x = o.x - o.w / 2 + 5; x < o.x + o.w / 2; x += 12) {
        ctx.strokeStyle = '#d29365'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, o.y - 24); ctx.quadraticCurveTo(x + 6, o.y, x, o.y + 24); ctx.stroke();
      }
      ctx.fillStyle = '#dfc69d'; ctx.fillRect(o.x - 24, o.y - 9, 48, 18);
      ctx.fillStyle = '#67472f'; ctx.font = '13px serif'; ctx.textAlign = 'center'; ctx.fillText('茶', o.x, o.y + 5);
    }
    for (const o of LANTERNS) { paintLanternGlow(ctx, o); paintLantern(ctx, o); }
    paintRim(ctx, '#3e3027', '#b79058');
    paintVignette(ctx);
  },
};
