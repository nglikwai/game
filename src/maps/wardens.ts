import { paintVignette, type GameMap } from './common';
import { paintRim, paintRune, paintSlab, paintTiles } from './newMapArt';

export const WARDENS: GameMap = {
  id: 'wardens', name: 'Twin Warden Gate', zh: '雙煞鬼門',
  desc: 'Crimson strikes with a heavy hammer; Jade attacks with talismans and fire. Defeat the second warden within 12 seconds of the first, or the fallen warden revives with 60% HP. A guard keeps returning, and a summon tree waits at the back.',
  descZh: '赤煞揮舞重錘，青煞施放符術與烈火。擊倒一人後，須在12秒內擊敗另一人，否則倒下的守將會恢復60%生命復活。小兵會不斷復活，後方還有一棵召喚妖樹。',
  obstacles: [
    { kind: 'ruin', x: 400, y: 210, w: 44, h: 50 },
    { kind: 'ruin', x: 400, y: 602, w: 44, h: 50 },
  ],
  chests: [{ x: 220, y: 240 }, { x: 220, y: 572 }, { x: 640, y: 406, big: true }],
  particles: 'wisps',
  paint(ctx, rand) {
    paintTiles(ctx, rand, '#302b36', '#1d2630', 50);
    for (const [x, y, color] of [[900, 265, 'rgba(222,111,100,0.4)'], [900, 547, 'rgba(111,217,188,0.4)']] as const) {
      ctx.fillStyle = '#202b32'; ctx.beginPath(); ctx.arc(x, y, 112, 0, Math.PI * 2); ctx.fill();
      paintRune(ctx, x, y, 106, color);
      paintRune(ctx, x, y, 76, color);
    }
    // Interlocking soul rings frame the open duelling floor.
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(216,189,134,0.22)';
    ctx.beginPath(); ctx.ellipse(900, 406, 165, 220, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(900, 265); ctx.lineTo(640, 406); ctx.lineTo(900, 547); ctx.stroke();
    paintRune(ctx, 640, 406, 62, 'rgba(214,189,137,0.35)');
    paintRune(ctx, 1130, 406, 78, 'rgba(168,106,255,0.45)');
    for (const y of [172, 640]) {
      ctx.fillStyle = '#8b7557'; ctx.fillRect(1120, y - 14, 60, 28);
      ctx.fillStyle = '#c6ac76'; ctx.fillRect(1114, y - 18, 72, 6);
    }
    ctx.strokeStyle = 'rgba(214,189,137,0.5)'; ctx.lineWidth = 8;
    ctx.strokeRect(1140, 280, 54, 252);
    for (const o of this.obstacles) paintSlab(ctx, o, '#565363', '#bcad8f');
    paintRim(ctx, '#191f2a', '#a28c6e');
    paintVignette(ctx);
  },
};
