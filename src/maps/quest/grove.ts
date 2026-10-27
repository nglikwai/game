import { QUEST } from '@/config';
import { ARENA_MID_Y as MID, blob, cornerPile, paintShadow, paintVignette, type GameMap, type Obstacle } from '@/maps/common';
import { paintRim, paintRune, paintSlab, paintTiles } from '@/maps/art/primitives';

const [TOP, LEFT, RIGHT] = QUEST.grove.spots;
const TREES: Obstacle[] = [TOP, LEFT, RIGHT].map((spot) => ({ kind: 'deadtree' as const, x: spot.x, y: spot.y, w: 88, h: 100 }));
const STONES: Obstacle[] = [
  { kind: 'ruin', x: 470, y: MID - 40, w: 48, h: 36 },
  { kind: 'ruin', x: 810, y: MID + 30, w: 48, h: 36 },
  { kind: 'ruin', x: 560, y: MID + 160, w: 40, h: 32 },
];

/** Quest stage 4: three cursed trees in a stone grove. */
export const GROVE: GameMap = {
  id: 'grove',
  name: 'Cursed Grove',
  zh: '妖樹苑',
  desc: 'Destroy the respawn tree, the summoning tree and the illusion tree. Their places are shuffled, and two of them act at a time.',
  descZh: '摧毀重生樹、召喚樹與幻象樹。三棵樹的位置隨機，同一時間有兩棵在發作。',
  obstacles: [...TREES, ...STONES],
  chests: [...cornerPile(1, 1), ...cornerPile(1, -1), ...cornerPile(-1, 1), ...cornerPile(-1, -1),
    { x: 460, y: MID - 180, empty: 0.2 }, { x: 820, y: MID - 180, empty: 0.2 },
    { x: 640, y: MID + 20, big: true }],
  particles: 'wisps',
  paint(ctx, rand) {
    paintTiles(ctx, rand, '#243028', '#17241c', 46);
    for (const tree of TREES) {
      paintRune(ctx, tree.x, tree.y, 70, 'rgba(120,160,90,0.28)');
      blob(ctx, tree.x, tree.y, 90, 'rgba(70,90,50,0.35)');
    }
    for (const o of STONES) paintSlab(ctx, o, '#4d554c', '#8d9684');
    for (const tree of TREES) paintShadow(ctx, tree);
    paintRim(ctx, '#142018', '#6d8068');
    paintVignette(ctx);
  },
};
