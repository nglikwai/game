import { HEIGHT, HUD_HEIGHT, QUEST, WIDTH } from '../config';
import { ARENA_MID_Y as MID, cornerPile, paintVignette, type GameMap } from './common';
import { paintRim, paintSlab, paintTiles } from './newMapArt';

const BELL = QUEST.dirge.bell;

/** One Bell Oni. The center bell tolls and strikes whoever is opposing him. */
export const DIRGE: GameMap = {
  id: 'dirge',
  name: 'Dirge Hall',
  zh: '喪鐘殿',
  desc: 'The Bell Oni waits beside a great bell. Each toll strikes everyone on the other side who is still inside the ring. Braziers burst and leave fire on the floor.',
  descZh: '鐘鬼守在大鐘旁。每次喪鐘敲響，圈內的敵方都會被擊中。火盆會炸出地面火焰，踩上去會被灼傷。',
  obstacles: [
    { kind: 'pillar', x: 280, y: MID - 150, w: 36, h: 36 },
    { kind: 'pillar', x: 280, y: MID + 150, w: 36, h: 36 },
    { kind: 'pillar', x: WIDTH - 280, y: MID - 150, w: 36, h: 36 },
    { kind: 'pillar', x: WIDTH - 280, y: MID + 150, w: 36, h: 36 },
    { kind: 'brazier', x: BELL.x - 160, y: MID - 40, w: 28, h: 28 },
    { kind: 'brazier', x: BELL.x + 160, y: MID + 40, w: 28, h: 28 },
  ],
  chests: [...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
    { x: 420, y: MID, big: true }],
  particles: 'wisps',
  flames: {
    spots: [{ x: BELL.x - 160, y: MID - 40 }, { x: BELL.x + 160, y: MID + 40 }],
    interval: 5.5, count: 1, warn: 1.15, radius: 78, dps: 16, life: 4,
  },
  paint(ctx, rand) {
    paintTiles(ctx, rand, '#241c18', '#16110e', 52);
    const glow = ctx.createRadialGradient(BELL.x, BELL.y, 8, BELL.x, BELL.y, 200);
    glow.addColorStop(0, 'rgba(212,168,96,0.28)');
    glow.addColorStop(1, 'rgba(212,168,96,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(BELL.x, BELL.y, 200, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(212,168,96,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(BELL.x, BELL.y, 78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#c9a36a';
    ctx.fillRect(BELL.x - 4, BELL.y - 46, 8, 70);
    ctx.beginPath();
    ctx.arc(BELL.x, BELL.y - 8, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6e5434';
    ctx.stroke();
    for (const o of this.obstacles) paintSlab(ctx, o, '#4a3b32', '#d7b07a');
    paintRim(ctx, '#1a1410', '#b8925a');
    paintVignette(ctx);
  },
};
