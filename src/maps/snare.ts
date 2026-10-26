import { QUEST } from '@/config';
import { ARENA_MID_Y as MID, cornerPile, paintVignette, type GameMap } from '@/maps/common';
import { paintRim, paintRune, paintSlab, paintTiles } from '@/maps/newMapArt';

const [LEFT, RIGHT] = QUEST.snare.spots;

/** Two small trees hold allies. One summons; the other casts an illusion. */
export const SNARE: GameMap = {
  id: 'snare',
  name: 'Snare Trees',
  zh: '囚枝林',
  desc: 'Two allies are trapped in small trees: one summons, one casts an illusion. Destroy a tree to free its prisoner, then defeat the enemies together.',
  descZh: '兩名隊友被困在小樹裡：一棵會召喚，一棵會施放幻象。摧毀小樹救出隊友，再一起擊敗敵人。',
  obstacles: [
    { kind: 'ruin', x: 620, y: MID - 40, w: 44, h: 36 },
    { kind: 'ruin', x: 760, y: MID + 50, w: 44, h: 36 },
  ],
  chests: [...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
    { x: 420, y: MID, big: true }],
  particles: 'wisps',
  paint(ctx, rand) {
    paintTiles(ctx, rand, '#243028', '#1a221c', 48);
    for (const spot of [LEFT, RIGHT]) {
      paintRune(ctx, spot.x, spot.y, 46, 'rgba(150,190,110,0.35)');
      ctx.strokeStyle = 'rgba(90,70,40,0.45)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(640, MID);
      ctx.lineTo(spot.x, spot.y);
      ctx.stroke();
    }
    for (const o of this.obstacles) paintSlab(ctx, o, '#4d5648', '#8d947c');
    paintRim(ctx, '#172018', '#7d8a62');
    paintVignette(ctx);
  },
};
