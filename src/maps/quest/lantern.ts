import { QUEST } from '@/config';
import { paintVignette, type GameMap } from '@/maps/common';
import { paintRim, paintRune, paintSlab, paintTiles } from '@/maps/art/primitives';

export const LANTERN: GameMap = {
  id: 'lantern', name: 'Spirit Lantern Road', zh: '引魂燈道',
  desc: 'The lantern starts in the center and moves slowly. Two allies inside push it to the enemy side to clear the stage. Enemies alone push it back, and reaching your side fails the stage. Both sides inside the circle stop it. Guards return every 16 seconds.',
  descZh: '靈燈從正中開始，移動很慢。兩名隊友站在圈內把它推向敵方即可過關；只有敵人時會倒退，退回己方則失敗。雙方都在圈內則停下。守衛每16秒復活一人。',
  obstacles: [
    { kind: 'ruin', x: 460, y: 570, w: 48, h: 48 },
    { kind: 'ruin', x: 740, y: 220, w: 48, h: 48 },
  ],
  chests: [{ x: 300, y: 600 }, { x: 590, y: 190 }, { x: 1010, y: 610, big: true }],
  particles: 'wisps',
  paint(ctx, rand) {
    paintTiles(ctx, rand, '#23383b', '#18292f', 48);
    const path = QUEST.escort.path;
    // A broad stone road and luminous inlay make the whole journey readable at a glance.
    for (const [width, color] of [[118, '#14262c'], [108, '#435052'], [98, '#303f42'], [3, '#9cae88']] as const) {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
      path.slice(1).forEach((p) => ctx.lineTo(p.x, p.y)); ctx.stroke();
    }
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1], angle = Math.atan2(b.y - a.y, b.x - a.x);
      for (let t = 0.2; t < 1; t += 0.25) {
        ctx.save(); ctx.translate(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); ctx.rotate(angle);
        ctx.strokeStyle = 'rgba(208,217,166,0.6)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(1, 0); ctx.lineTo(-7, 7); ctx.stroke(); ctx.restore();
      }
    }
    paintRune(ctx, path[0].x, path[0].y, 55, 'rgba(132,224,203,0.5)');
    const end = path[path.length - 1];
    paintRune(ctx, end.x, end.y, 66, 'rgba(239,205,128,0.6)');
    // The gate is an inlaid destination emblem, never an invisible collision obstacle.
    ctx.strokeStyle = '#d3b77b'; ctx.lineWidth = 7;
    ctx.strokeRect(end.x - 27, end.y - 30, 54, 60);
    ctx.fillStyle = '#bca679'; ctx.fillRect(end.x - 40, end.y - 40, 80, 8);
    for (const [x, y] of [[170, 210], [320, 180], [590, 640], [850, 610], [1090, 200]]) {
      const glow = ctx.createRadialGradient(x, y, 2, x, y, 48);
      glow.addColorStop(0, 'rgba(136,224,191,0.22)'); glow.addColorStop(1, 'rgba(136,224,191,0)');
      ctx.fillStyle = glow; ctx.fillRect(x - 48, y - 48, 96, 96);
      ctx.fillStyle = '#71867a'; ctx.fillRect(x - 7, y - 10, 14, 20);
      ctx.fillStyle = '#d6ebad'; ctx.fillRect(x - 4, y - 7, 8, 12);
      ctx.fillStyle = '#182e32'; ctx.fillRect(x - 10, y - 13, 20, 5);
    }
    for (const o of this.obstacles) paintSlab(ctx, o, '#4c6462', '#a6b092');
    paintRim(ctx, '#142a30', '#7e9c91');
    paintVignette(ctx);
  },
};
