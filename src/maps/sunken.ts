import { ARENA_MID_Y as MID, cornerPile, paintVignette, type GameMap, type Obstacle, type TerrainZone } from './common';
import { paintPool, paintRim, paintSlab, paintTiles } from './newMapArt';

const FLOODS: TerrainZone[] = [
  { kind: 'tide', x: 640, y: MID - 140, w: 420, h: 110 },
  { kind: 'tide', x: 640, y: MID + 140, w: 420, h: 110 },
];
const OBSTACLES: Obstacle[] = [355, 925].flatMap((x) => [
  { kind: 'ruin' as const, x, y: MID - 115, w: 100, h: 32 },
  { kind: 'ruin' as const, x, y: MID + 115, w: 100, h: 32 },
]);

export const SUNKEN: GameMap = {
  id: 'sunken', name: 'Sunken Ruins', zh: '水沒古城',
  desc: 'Flooded courtyards drain and refill. Cross the dry central causeway or brave the water for two rich chests.',
  descZh: '古城庭院交替漲退潮。可走乾燥的中央石道，或涉水爭奪兩個大寶箱。',
  obstacles: OBSTACLES,
  chests: [...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
    { x: 640, y: MID - 140, big: true }, { x: 640, y: MID + 140, big: true },
    { x: 470, y: MID }, { x: 810, y: MID }],
  zones: FLOODS, tideCycle: { period: 9, warn: 2 }, particles: 'mist',
  paint(ctx, rand) {
    paintTiles(ctx, rand, '#557672', '#344e4d', 50);
    for (const z of FLOODS) {
      paintPool(ctx, z, '#678f83', '#a0bbaa');
      // Concentric worn mosaics beneath the changing tide.
      ctx.strokeStyle = '#bed0aa'; ctx.lineWidth = 2;
      for (const r of [26, 42]) { ctx.beginPath(); ctx.ellipse(z.x, z.y, r * 2, r, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.fillStyle = '#9a9b81'; ctx.fillRect(210, MID - 38, 860, 76);
    ctx.strokeStyle = '#d2c9a4'; ctx.lineWidth = 3; ctx.strokeRect(210, MID - 38, 860, 76);
    for (let x = 230; x < 1070; x += 38) {
      ctx.strokeStyle = '#777d69'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, MID - 36); ctx.lineTo(x, MID + 36); ctx.stroke();
    }
    for (const o of OBSTACLES) {
      paintSlab(ctx, o, '#788479', '#b9bba0');
      ctx.strokeStyle = '#364d45'; ctx.beginPath(); ctx.moveTo(o.x - 12, o.y - 16); ctx.lineTo(o.x + 2, o.y); ctx.lineTo(o.x - 7, o.y + 16); ctx.stroke();
      ctx.fillStyle = '#42694f'; ctx.fillRect(o.x - o.w / 2, o.y + 9, o.w * 0.6, 7);
    }
    paintRim(ctx, '#324c48', '#91a58e');
    paintVignette(ctx);
  },
};
