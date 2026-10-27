import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import { ARENA, ARENA_MID_Y as MID, blob, cornerPile, paintVignette, type GameMap, type Obstacle, type TerrainZone } from '@/maps/common';
import { paintRim, paintSlab, paintTiles } from '@/maps/art/primitives';

/** The dragon's nest at the back of the cave, where it starts (the dragon itself is drawn live as it walks). */
const NEST = { x: WIDTH - 180, y: MID, r: 190 };

/** Each head's zone: fire to the top, the storm in the middle, ice to the bottom. */
const ICE: TerrainZone[] = [{ kind: 'ice', x: 700, y: MID + 215, w: 380, h: 110 }];

const OBSTACLES: Obstacle[] = [
  // Lava cracks in the fire band: they block walking, but shots fly over them.
  { kind: 'lava', low: true, x: 600, y: MID - 225, w: 120, h: 46 },
  { kind: 'lava', low: true, x: 420, y: MID - 245, w: 80, h: 36 },
  // Two standing stones in the middle: cover from the dragon's shots and the guards' arrows.
  { kind: 'pillar', x: 520, y: MID - 70, w: 34, h: 34 },
  { kind: 'pillar', x: 520, y: MID + 70, w: 34, h: 34 },
];

/** 龍巢: three guards and a three-headed dragon. */
export const DRAGON_LAIR: GameMap = {
  id: 'dragon',
  name: "Dragon's Lair",
  zh: '龍巢',
  desc: 'A three-headed dragon roams the cave and fires fire, ice and lightning. Guards keep returning while it lives.',
  descZh: '三首龍在洞中遊走，噴射火、冰、雷。龍還活著時，守衛會不斷歸來。',
  obstacles: OBSTACLES,
  chests: [...cornerPile(1, 1), ...cornerPile(1, -1), ...cornerPile(-1, 1), ...cornerPile(-1, -1),
    { x: 380, y: MID, big: true }, { x: 640, y: MID - 150, empty: 0.3 }, { x: 640, y: MID + 150, empty: 0.3 }],
  zones: ICE,
  // Healing herbs in the cooler half of the cave: a long fight needs somewhere to recover.
  herbs: { spots: [{ x: 260, y: MID - 215 }, { x: 260, y: MID + 215 }, { x: 420, y: MID - 110 }, { x: 420, y: MID + 110 }], heal: 12, regrow: 18 },
  particles: 'embers',
  paint(ctx, rand) {
    paintTiles(ctx, rand, '#2a2124', '#191416', 46);
    // Fire to the top, the storm in the middle, frost to the bottom.
    const band = (y: number, h: number, color: string) => {
      const g = ctx.createLinearGradient(WIDTH * 0.35, 0, WIDTH, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, color);
      ctx.fillStyle = g;
      ctx.fillRect(WIDTH * 0.35, y - h / 2, WIDTH * 0.65, h);
    };
    band(MID - 175, 200, 'rgba(232,96,48,0.22)');
    band(MID, 150, 'rgba(150,120,255,0.18)');
    band(MID + 175, 200, 'rgba(120,200,255,0.2)');
    // The ice sheet.
    for (const z of ICE) {
      ctx.fillStyle = '#7fa9bd';
      ctx.beginPath();
      ctx.roundRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h, 18);
      ctx.fill();
      ctx.strokeStyle = '#d2eef5';
      ctx.lineWidth = 2;
      ctx.stroke();
      for (let k = 0; k < 16; k++) {
        const x = z.x - z.w / 2 + 16 + rand() * (z.w - 32);
        const y = z.y - z.h / 2 + 10 + rand() * (z.h - 20);
        ctx.strokeStyle = 'rgba(230,250,255,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 10, y + 7);
        ctx.lineTo(x + 4, y + 16);
        ctx.stroke();
      }
    }
    // Lava cracks.
    for (const o of OBSTACLES.filter((x) => x.kind === 'lava')) {
      const glow = ctx.createRadialGradient(o.x, o.y, 4, o.x, o.y, Math.max(o.w, o.h) * 0.7);
      glow.addColorStop(0, '#ffd27a');
      glow.addColorStop(0.5, '#e8602e');
      glow.addColorStop(1, '#5a1a10');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Storm-scorched ground in the middle.
    for (let k = 0; k < 10; k++) blob(ctx, 560 + rand() * 520, MID - 60 + rand() * 120, 14 + rand() * 18, 'rgba(170,150,255,0.10)');
    for (const o of OBSTACLES.filter((x) => x.kind === 'pillar')) paintSlab(ctx, o, '#3b3236', '#a88fc8');
    // The nest: scorched rock, scattered bones and old scales.
    const nest = ctx.createRadialGradient(NEST.x, NEST.y, 10, NEST.x, NEST.y, NEST.r);
    nest.addColorStop(0, 'rgba(60,24,18,0.55)');
    nest.addColorStop(1, 'rgba(60,24,18,0)');
    ctx.fillStyle = nest;
    ctx.beginPath();
    ctx.arc(NEST.x, NEST.y, NEST.r, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 0; k < 18; k++) {
      const a = rand() * Math.PI * 2;
      const d = 40 + rand() * (NEST.r - 50);
      const x = NEST.x + Math.cos(a) * d;
      const y = NEST.y + Math.sin(a) * d;
      ctx.strokeStyle = 'rgba(214,200,170,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 7, y - 3);
      ctx.lineTo(x + 7, y + 3);
      ctx.stroke();
      ctx.fillStyle = 'rgba(214,200,170,0.55)';
      ctx.beginPath();
      ctx.arc(x - 8, y - 3, 2.5, 0, Math.PI * 2);
      ctx.arc(x + 8, y + 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let k = 0; k < 24; k++) blob(ctx, NEST.x + (rand() - 0.5) * NEST.r * 1.4, NEST.y + (rand() - 0.5) * NEST.r * 1.4, 4 + rand() * 4, 'rgba(110,70,58,0.5)');
    paintRim(ctx, '#140f10', '#b4645a');
    // Embers drifting up from the lava side.
    for (let k = 0; k < 60; k++) {
      ctx.fillStyle = `rgba(255,${120 + Math.floor(rand() * 100)},60,${0.25 + rand() * 0.4})`;
      ctx.fillRect(ARENA.x + rand() * ARENA.w, HUD_HEIGHT + rand() * (HEIGHT - HUD_HEIGHT) * 0.5, 2, 2);
    }
    paintVignette(ctx);
  },
};
