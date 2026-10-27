import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import { ARENA_MID_Y as MID, cornerPile, paintVignette, type GameMap } from '@/maps/common';
import { paintRim, paintSlab, paintTiles } from '@/maps/art/primitives';

const LANTERNS = [
  { x: 360, y: 250 },
  { x: 640, y: 560 },
  { x: 900, y: 270 },
  { x: 1100, y: 500 },
];

/** A dark street. Lanterns and living fighters are the only light; the fight is the squad itself. */
export const NIGHT: GameMap = {
  id: 'night',
  name: 'Night Alley',
  zh: '暗巷',
  desc: 'A Night Oni leads two enemies. Candle flames scorch their light; strike a candle to blow it out.',
  descZh: '夜叉率領兩名敵人。燭火會灼燒燈下的人，揮武器打熄燈籠。',
  obstacles: [
    { kind: 'house', x: 250, y: HUD_HEIGHT + 150, w: 180, h: 64 },
    { kind: 'house', x: 520, y: HUD_HEIGHT + 145, w: 150, h: 58 },
    { kind: 'house', x: 800, y: HUD_HEIGHT + 155, w: 160, h: 60 },
    { kind: 'house', x: 1060, y: HUD_HEIGHT + 148, w: 170, h: 58 },
    { kind: 'house', x: 280, y: HEIGHT - 130, w: 190, h: 64 },
    { kind: 'house', x: 560, y: HEIGHT - 140, w: 150, h: 58 },
    { kind: 'house', x: 840, y: HEIGHT - 128, w: 170, h: 60 },
    { kind: 'house', x: 1100, y: HEIGHT - 138, w: 150, h: 58 },
    ...LANTERNS.map((p) => ({ kind: 'lantern' as const, x: p.x, y: p.y, w: 22, h: 22 })),
    { kind: 'barrel', x: 480, y: MID - 20, w: 28, h: 28 },
    { kind: 'barrel', x: 760, y: MID + 30, w: 28, h: 28 },
  ],
  chests: [...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
    { x: 640, y: MID, big: true }],
  particles: 'fireflies',
  paint(ctx, rand) {
    paintTiles(ctx, rand, '#171922', '#10131c', 46);
    ctx.fillStyle = 'rgba(4,6,12,0.35)';
    ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
    for (const o of this.obstacles) if (o.kind === 'house' || o.kind === 'barrel') paintSlab(ctx, o, '#3c342c', '#c7a56a');
    for (const lamp of LANTERNS) {
      const glow = ctx.createRadialGradient(lamp.x, lamp.y, 4, lamp.x, lamp.y, 90);
      glow.addColorStop(0, 'rgba(255,214,150,0.55)');
      glow.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f3d7a1';
      ctx.fillRect(lamp.x - 3, lamp.y - 16, 6, 22);
      ctx.fillStyle = '#ffb45a';
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y - 18, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    paintRim(ctx, '#10131a', '#8d7352');
    paintVignette(ctx);
  },
};
