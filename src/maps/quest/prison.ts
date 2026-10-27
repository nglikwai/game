import { QUEST, WIDTH } from '@/config';
import { ARENA_MID_Y as MID, blob, cornerPile, paintShadow, paintVignette, type GameMap, type Obstacle } from '@/maps/common';
import { paintRim, paintRune, paintSlab, paintTiles } from '@/maps/art/primitives';

const TREE = QUEST.rescue.tree;
const WALLS: Obstacle[] = [-145, 145].map((dy) => ({ kind: 'cage', team: 0, x: 910, y: MID + dy, w: 140, h: 140 }));
const STONES: Obstacle[] = [430, 650].flatMap((x) => [-120, 120].map((dy) => ({ kind: 'ruin' as const, x, y: MID + dy, w: 52, h: 44 })));
const TREE_BODY: Obstacle = { kind: 'deadtree', x: TREE.x, y: TREE.y, w: 56, h: 68 };

/** Quest-only rescue stage: the tree stands beyond the two prison enclosures. */
export const PRISON: GameMap = {
  id: 'prison', name: 'Cursed Tree Prison', zh: '幽樹囚庭',
  desc: 'Both princess walls hold a seal. Two guards fight until both princesses are free, then four come. Defeat them all. The guards do not attack the tree.',
  descZh: '兩面公主囚牆撐著封印。未救出前兩名敵人，救出後四名，全滅才過關。敵人不攻擊幽樹。',
  obstacles: [...WALLS, ...STONES, TREE_BODY],
  chests: [...cornerPile(1, 1), ...cornerPile(1, -1), ...cornerPile(-1, 1), ...cornerPile(-1, -1),
    { x: 340, y: MID - 150, empty: 0 }, { x: 340, y: MID + 150, empty: 0 },
    { x: 650, y: MID, big: true }, { x: 1080, y: MID - 180, big: true }, { x: 1080, y: MID + 180, big: true }],
  particles: 'wisps',
  paint(ctx, rand) {
    paintTiles(ctx, rand, '#292e2a', '#18231f', 46);
    // Root veins lead from the prison thresholds back to the hostile tree.
    for (const wall of WALLS) {
      ctx.strokeStyle = '#5b4e75'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(wall.x, wall.y); ctx.bezierCurveTo(1040, wall.y, 1010, MID, TREE.x, MID); ctx.stroke();
      paintRune(ctx, wall.x, wall.y, 88, 'rgba(165,99,210,0.24)');
    }
    for (const o of STONES) paintSlab(ctx, o, '#4b5150', '#8c9686');
    paintShadow(ctx, TREE_BODY);
    blob(ctx, TREE.x, TREE.y, 78, 'rgba(126,68,174,0.4)');
    // The twisted tree itself is drawn live, so destruction removes its body and eyes.
    paintRune(ctx, TREE.x, TREE.y, 60, 'rgba(198,142,240,0.65)');
    // Low stone approach; the princess walls themselves are drawn live with their HP.
    ctx.strokeStyle = '#627063'; ctx.lineWidth = 2;
    ctx.strokeRect(780, MID - 245, WIDTH - 820, 490);
    paintRim(ctx, '#17231e', '#7b6885');
    paintVignette(ctx);
  },
};
