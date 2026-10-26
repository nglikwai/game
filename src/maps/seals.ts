import { QUEST } from '@/config';
import { ARENA_MID_Y as MID, cornerPile, paintVignette, type GameMap } from '@/maps/common';
import { paintRim, paintRune, paintSlab, paintTiles } from '@/maps/newMapArt';

/** The seals are floor markings, leaving every capture circle open to walk into. */
export const SEALS: GameMap = {
  id: 'seals', name: 'Sealed Altars', zh: '封印祭壇',
  desc: 'The first circle needs 1 ally, the second 2, and the third 3, each for 40 seconds. Lightning strikes the courtyard like Thunder Peak. Guards inside a circle pause it until every seal breaks, then defeat the guards still standing.',
  descZh: '第1圈需要1人、第2圈2人、第3圈3人，各守候40秒。祭壇上會像雷鳴山頂一樣持續落雷。守衛進入圈內會暫停進度，封印全部解除前會不斷復活。最後還要清滅剩下的守衛。',
  obstacles: [
    { kind: 'ruin', x: 480, y: MID + 20, w: 40, h: 48 },
    { kind: 'ruin', x: 800, y: MID + 20, w: 40, h: 48 },
  ],
  chests: [...cornerPile(1, 1), ...cornerPile(1, -1), ...cornerPile(-1, 1), ...cornerPile(-1, -1),
    { x: 640, y: MID + 110, big: true }],
  particles: 'wisps',
  lightning: { interval: 5, strikes: 3, radius: 46, damage: 14, warn: 1.4 },
  paint(ctx, rand) {
    paintTiles(ctx, rand, '#302b35', '#211f2c', 50);
    // Inlaid paths connect the seals to the central gateway.
    ctx.strokeStyle = 'rgba(219,178,99,0.22)'; ctx.lineWidth = 8;
    for (const p of QUEST.seals.spots) {
      ctx.beginPath(); ctx.moveTo(640, MID + 20); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.fillStyle = '#3c3540'; ctx.beginPath(); ctx.arc(p.x, p.y, QUEST.seals.radius + 10, 0, Math.PI * 2); ctx.fill();
      paintRune(ctx, p.x, p.y, QUEST.seals.radius, 'rgba(229,187,109,0.45)');
    }
    paintRune(ctx, 640, MID + 20, 42, 'rgba(164,135,202,0.4)');
    for (const o of this.obstacles) paintSlab(ctx, o, '#625464', '#ad927a');
    paintRim(ctx, '#211e2b', '#a28b66');
    paintVignette(ctx);
  },
};
