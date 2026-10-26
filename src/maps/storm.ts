import { ARENA_MID_Y as MID, cornerPile, paintVignette, type GameMap, type Obstacle, type TerrainZone } from '@/maps/common';
import { paintRim, paintRune, paintSlab, paintTiles } from '@/maps/newMapArt';

const OBSTACLES: Obstacle[] = [400, 880].flatMap((x) => [
  { kind: 'pillar' as const, x, y: MID - 125, w: 44, h: 44 },
  { kind: 'pillar' as const, x, y: MID + 125, w: 44, h: 44 },
]);
const WIND: TerrainZone[] = [
  { kind: 'wind', x: 640, y: MID - 80, w: 800, h: 72, push: { x: 145, y: 0 } },
  { kind: 'wind', x: 640, y: MID + 80, w: 800, h: 72, push: { x: -145, y: 0 } },
];

export const STORM: GameMap = {
  id: 'storm', name: 'Storm Shrine', zh: '風暴神社',
  desc: 'Opposing gusts sweep the shrine. Dodge marked lightning strikes while fighting for the central treasure.',
  descZh: '兩道逆向強風吹過神社。爭奪中央寶箱時，也要避開預警中的落雷。',
  obstacles: OBSTACLES,
  chests: [...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
    { x: 640, y: MID, big: true }, { x: 320, y: MID }, { x: 960, y: MID }],
  zones: WIND, particles: 'rain',
  lightning: { interval: 5.5, strikes: 3, radius: 38, damage: 16, warn: 1.5 },
  paint(ctx, rand) {
    paintTiles(ctx, rand, '#384753', '#27343e', 54);
    for (const z of WIND) {
      ctx.fillStyle = 'rgba(143,193,216,0.13)'; ctx.fillRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h);
      ctx.strokeStyle = '#7dabbc'; ctx.lineWidth = 1.5;
      for (let x = 275; x < 1020; x += 56) {
        const direction = Math.sign(z.push!.x);
        ctx.beginPath(); ctx.moveTo(x - 15 * direction, z.y - 8); ctx.lineTo(x, z.y); ctx.lineTo(x - 15 * direction, z.y + 8); ctx.stroke();
      }
    }
    paintRune(ctx, 640, MID, 105, 'rgba(178,202,239,0.45)');
    // Sacred ropes and lightning-shaped paper streamers.
    for (const y of [MID - 125, MID + 125]) {
      ctx.strokeStyle = '#b6a679'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(400, y); ctx.quadraticCurveTo(640, y + 36, 880, y); ctx.stroke();
      for (let x = 460; x <= 820; x += 60) {
        ctx.strokeStyle = '#e3e7e2'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(x, y + 14); ctx.lineTo(x - 5, y + 25); ctx.lineTo(x + 3, y + 28); ctx.lineTo(x - 3, y + 39); ctx.stroke();
      }
    }
    for (const o of OBSTACLES) paintSlab(ctx, o, '#525e66', '#a3b1b6');
    paintRim(ctx, '#222e39', '#839ba8');
    paintVignette(ctx);
  },
};
