import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import { ARENA, ARENA_MID_Y as MID, blob, cornerPile, paintShadow, paintVignette, type GameMap, type Obstacle, type TerrainZone } from '@/maps/common';
import { paintRim } from '@/maps/newMapArt';

const TREES: Obstacle[] = [370, 910].flatMap((x) => [
  { kind: 'sakura' as const, x, y: MID - 125, w: 52, h: 52 },
  { kind: 'sakura' as const, x, y: MID + 125, w: 52, h: 52 },
]);
const FOG: TerrainZone[] = [370, 910].map((x) => ({ kind: 'fog', x, y: MID, w: 190, h: 380 }));
const HERBS = [370, 910].flatMap((x) => [{ x, y: MID - 60 }, { x, y: MID + 60 }]);

export const ORCHARD: GameMap = {
  id: 'orchard', name: 'Moonlit Orchard', zh: '月下果園',
  desc: 'Hide among misty fruit trees and gather regrowing herbs. The open moonlit path offers faster pursuit.',
  descZh: '藏身霧氣繚繞的果樹間，採集會再生的藥草。開闊的月光小徑適合追擊。',
  obstacles: TREES,
  chests: [...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
    { x: 640, y: MID, big: true }, { x: 370, y: MID }, { x: 910, y: MID }],
  zones: FOG, herbs: { spots: HERBS, heal: 12, regrow: 14 }, particles: 'fireflies',
  paint(ctx, rand) {
    ctx.fillStyle = '#243c3a'; ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
    for (let k = 0; k < 100; k++) blob(ctx, ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 15 + rand() * 35, 'rgba(88,121,87,0.22)');
    // Pale stepping stones cross a moon-shaped clearing.
    blob(ctx, 640, MID, 210, 'rgba(161,180,202,0.2)');
    for (let x = 210; x < 1080; x += 40) {
      ctx.fillStyle = '#7b8d8b'; ctx.beginPath(); ctx.ellipse(x, MID + Math.sin(x * 0.025) * 14, 14, 10, 0, 0, Math.PI * 2); ctx.fill();
    }
    for (const o of TREES) {
      paintShadow(ctx, o);
      ctx.fillStyle = '#1b3530'; ctx.beginPath(); ctx.arc(o.x, o.y, 27, 0, Math.PI * 2); ctx.fill();
      for (let k = 0; k < 12; k++) {
        const a = k * Math.PI / 6; const r = 10 + rand() * 10;
        ctx.fillStyle = k % 2 ? '#497a57' : '#39694f'; ctx.beginPath(); ctx.arc(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#d1a268'; ctx.beginPath(); ctx.arc(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const h of HERBS) {
      ctx.fillStyle = '#23362a'; ctx.beginPath(); ctx.ellipse(h.x, h.y, 21, 15, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7caa78'; ctx.lineWidth = 1; ctx.stroke();
    }
    for (const z of FOG) for (let k = 0; k < 12; k++) blob(ctx, z.x + (rand() - 0.5) * z.w, z.y + (rand() - 0.5) * z.h, 40, 'rgba(173,199,208,0.17)');
    paintRim(ctx, '#1a2d2c', '#658a78');
    paintVignette(ctx);
  },
};
