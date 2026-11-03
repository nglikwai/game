import { QUEST, WIDTH } from '@/config';
import { ARENA_MID_Y as MID, cornerPile, paintVignette, type GameMap } from '@/maps/common';
import { paintRim, paintSlab, paintTiles } from '@/maps/art/primitives';

/** A moonlit road with three spirit springs and a guiding lantern at the western entrance. */
export const BEACONS: GameMap = {
  id: 'beacons', name: 'Spirit Lantern Path', zh: '引魂古道',
  desc: `Carry ${QUEST.beacons.required} blue wandering spirits to the green lantern in ${QUEST.beacons.timeLimit / 60} minutes. Each hero carries one and drops it on defeat. Springs refill in rotation; guards flank the route and return faster as deliveries increase.`,
  descZh: `${QUEST.beacons.timeLimit / 60}分鐘內將${QUEST.beacons.required}隻藍色遊魂送回左方綠色引魂燈。每人一次帶一隻，倒下會掉落。靈泉輪流補充，守衛會從側翼攔截，重生隨進度加快。`,
  obstacles: [
    { kind: 'ruin', x: 440, y: MID - 20, w: 36, h: 42 },
    { kind: 'ruin', x: 840, y: MID - 20, w: 36, h: 42 },
    { kind: 'pillar', x: WIDTH / 2, y: MID - 140, w: 38, h: 38 },
    { kind: 'bones', x: 250, y: MID + 175, w: 42, h: 28 },
    { kind: 'bones', x: WIDTH - 250, y: MID + 175, w: 42, h: 28 },
  ],
  chests: [...cornerPile(1, 1), ...cornerPile(1, -1), ...cornerPile(-1, 1), ...cornerPile(-1, -1),
    { x: WIDTH / 2, y: MID - 45, big: true }],
  herbs: { spots: [{ x: 210, y: MID + 120 }, { x: WIDTH - 210, y: MID }], regrow: 20, heal: 15 },
  particles: 'wisps',
  paint(ctx, rand) {
    paintTiles(ctx, rand, '#1d2b38', '#121c29', 46);
    const spots = QUEST.beacons.spots;
    // A wide raised processional route, with a narrow luminous inlay down the center.
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const [width, color] of [[66, '#253b49'], [48, '#304953'], [3, 'rgba(143,213,232,0.4)']] as const) {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(QUEST.beacons.destination.x, QUEST.beacons.destination.y);
      spots.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }
    spots.forEach((p) => {
      // Small cracked spirit springs, with no capture rings or numbered checkpoints.
      ctx.fillStyle = '#152632'; ctx.fillRect(p.x - 28, p.y - 19, 56, 38);
      ctx.strokeStyle = '#648899'; ctx.lineWidth = 2; ctx.strokeRect(p.x - 28, p.y - 19, 56, 38);
      ctx.strokeStyle = '#a3d8ed'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(p.x - 16, p.y + 6); ctx.lineTo(p.x - 3, p.y - 5); ctx.lineTo(p.x + 4, p.y + 4); ctx.lineTo(p.x + 17, p.y - 8); ctx.stroke();
      for (const side of [-1, 1]) {
        const x = p.x + side * 43;
        const y = p.y - 12;
        ctx.fillStyle = '#597184'; ctx.fillRect(x - 4, y - 2, 8, 14);
        const light = ctx.createRadialGradient(x, y - 5, 1, x, y - 5, 24);
        light.addColorStop(0, 'rgba(168,227,255,0.5)'); light.addColorStop(1, 'rgba(168,227,255,0)');
        ctx.fillStyle = light; ctx.beginPath(); ctx.arc(x, y - 5, 24, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c6f3ff'; ctx.beginPath(); ctx.ellipse(x, y - 7, 3, 7, 0, 0, Math.PI * 2); ctx.fill();
      }
    });
    for (const o of this.obstacles) paintSlab(ctx, o, '#435467', '#85a5b3');
    paintRim(ctx, '#101b28', '#7293a9');
    paintVignette(ctx);
  },
};
