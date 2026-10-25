import { ARENA_MID_Y as MID, cornerPile, paintVignette, type GameMap, type Obstacle, type TerrainZone } from './common';
import { paintRim, paintSlab, paintTiles } from './newMapArt';

const ICE: TerrainZone[] = [
  { kind: 'ice', x: 640, y: MID, w: 430, h: 340 },
];
const VENTS = [520, 760].flatMap((x) => [{ x, y: MID - 92 }, { x, y: MID + 92 }]);
const OBSTACLES: Obstacle[] = [350, 930].flatMap((x) => [
  { kind: 'obsidian' as const, x, y: MID - 122, w: 70, h: 50 },
  { kind: 'obsidian' as const, x, y: MID + 122, w: 70, h: 50 },
]);

export const FROSTFIRE: GameMap = {
  id: 'frostfire', name: 'Frostfire Forge', zh: '冰焰鍛冶場',
  desc: 'An icy forge floor makes stopping hard. Watch the glowing vents before they erupt beneath your feet.',
  descZh: '結冰的鍛冶場地面容易打滑。注意發光的噴口，及時避開腳下的火焰。',
  obstacles: OBSTACLES,
  chests: [...cornerPile(1, 1), ...cornerPile(-1, 1), ...cornerPile(1, -1), ...cornerPile(-1, -1),
    { x: 640, y: MID, big: true }, { x: 450, y: MID }, { x: 830, y: MID }],
  zones: ICE, particles: 'snow',
  vents: { spots: VENTS, interval: 4.8, count: 2, radius: 36, damage: 16, warn: 1.6 },
  paint(ctx, rand) {
    paintTiles(ctx, rand, '#3e414e', '#282b36', 40);
    ctx.fillStyle = '#85acbe'; ctx.fillRect(425, MID - 170, 430, 340);
    ctx.strokeStyle = '#cee8eb'; ctx.lineWidth = 3; ctx.strokeRect(425, MID - 170, 430, 340);
    // Long ice fractures are decorative; the whole blue rectangle is slippery.
    for (let k = 0; k < 24; k++) {
      const x = 440 + rand() * 390; const y = MID - 155 + rand() * 290;
      ctx.strokeStyle = 'rgba(224,249,255,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 12, y + 8); ctx.lineTo(x + 5, y + 19); ctx.stroke();
    }
    for (const v of VENTS) {
      ctx.fillStyle = '#302c36'; ctx.beginPath(); ctx.arc(v.x, v.y, 22, 0, Math.PI * 2); ctx.fill();
      const glow = ctx.createRadialGradient(v.x, v.y, 2, v.x, v.y, 19);
      glow.addColorStop(0, '#ffd798'); glow.addColorStop(1, '#aa3c22');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(v.x, v.y, 17, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#4b3d3a'; ctx.lineWidth = 4;
      for (let dy = -9; dy <= 9; dy += 9) { ctx.beginPath(); ctx.moveTo(v.x - 15, v.y + dy); ctx.lineTo(v.x + 15, v.y + dy); ctx.stroke(); }
    }
    for (const o of OBSTACLES) {
      paintSlab(ctx, o, '#292833', '#a56b4d');
      ctx.fillStyle = '#d97e3f'; ctx.fillRect(o.x - 20, o.y - 3, 40, 6);
    }
    paintRim(ctx, '#292936', '#a0bac4');
    paintVignette(ctx);
  },
};
