import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import { ARENA, ARENA_MID_Y as MID, blob, cornerPile, paintVignette, type GameMap, type Obstacle, type TerrainZone } from '@/maps/common';
import { paintRim, paintSlab, paintTiles } from '@/maps/art/primitives';

/** The sun's sigil in the upper gorge and the moon's in the lower one, where each wyvern starts. */
const SUN = { x: WIDTH - 250, y: HUD_HEIGHT + 190, r: 120 };
const MOON = { x: WIDTH - 250, y: HEIGHT - 190, r: 120 };

/** Moonlit frost under the Moon Wyvern's half: you slide on it. */
const FROST: TerrainZone[] = [{ kind: 'ice', x: 900, y: MID + 230, w: 320, h: 90 }];

const OBSTACLES: Obstacle[] = [
  // Boulders and a standing stone: cover from the sun bombs' blast, the shards and the guards.
  { kind: 'rock', x: 470, y: MID - 150, w: 46, h: 40 },
  { kind: 'rock', x: 470, y: MID + 150, w: 46, h: 40 },
  { kind: 'pillar', x: 690, y: MID, w: 36, h: 36 },
];

/** 日月峽: the Sun and Moon Wyverns, chained together by lightning, and their two guards. */
export const ECLIPSE: GameMap = {
  id: 'eclipse',
  name: 'Eclipse Gorge',
  zh: '日月峽',
  desc: 'The Sun and Moon Wyverns walk the gorge, chained by lightning. Fell one and the other raises it unless both fall within 15s.',
  descZh: '日月雙龍在峽谷中遊走，以雷鏈相連。擊倒一條，另一條會令牠復活，除非15秒內雙雙倒下。',
  obstacles: OBSTACLES,
  chests: [...cornerPile(1, 1), ...cornerPile(1, -1), ...cornerPile(-1, 1), ...cornerPile(-1, -1),
    { x: 330, y: MID, big: true }, { x: 600, y: MID - 230, empty: 0.3 }, { x: 600, y: MID + 230, empty: 0.3 }],
  zones: FROST,
  // Herbs at the mouth of the gorge, away from the wyverns.
  herbs: { spots: [{ x: 230, y: MID - 200 }, { x: 230, y: MID + 200 }, { x: 360, y: MID - 90 }, { x: 360, y: MID + 90 }], heal: 12, regrow: 18 },
  particles: 'wisps',
  paint(ctx, rand) {
    paintTiles(ctx, rand, '#272430', '#18161e', 46);
    // Sunlight pouring into the upper gorge, moonlight into the lower.
    const light = (y0: number, y1: number, color: string) => {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(ARENA.x, Math.min(y0, y1), ARENA.w, Math.abs(y1 - y0));
    };
    light(ARENA.y, MID, 'rgba(255,170,70,0.2)');
    light(ARENA.y + ARENA.h, MID, 'rgba(120,160,255,0.2)');
    // The seam where day meets night, cracked down the middle of the gorge.
    ctx.strokeStyle = 'rgba(217,194,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ARENA.x + 40, MID);
    for (let x = ARENA.x + 40; x < ARENA.x + ARENA.w - 40; x += 28) ctx.lineTo(x, MID + (rand() - 0.5) * 14);
    ctx.stroke();
    // The sun sigil: a ring of rays set in the floor.
    ctx.fillStyle = 'rgba(255,190,90,0.18)';
    ctx.beginPath();
    ctx.arc(SUN.x, SUN.y, SUN.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,205,120,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(SUN.x, SUN.y, SUN.r * 0.45, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(SUN.x + Math.cos(a) * SUN.r * 0.55, SUN.y + Math.sin(a) * SUN.r * 0.55);
      ctx.lineTo(SUN.x + Math.cos(a) * SUN.r * (k % 2 ? 0.8 : 0.95), SUN.y + Math.sin(a) * SUN.r * (k % 2 ? 0.8 : 0.95));
      ctx.stroke();
    }
    // The moon sigil: a crescent and a ring of small stars.
    ctx.fillStyle = 'rgba(140,170,255,0.16)';
    ctx.beginPath();
    ctx.arc(MOON.x, MOON.y, MOON.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(214,228,255,0.45)';
    ctx.beginPath();
    ctx.arc(MOON.x, MOON.y, MOON.r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#272430';
    ctx.beginPath();
    ctx.arc(MOON.x + MOON.r * 0.2, MOON.y - MOON.r * 0.08, MOON.r * 0.44, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      ctx.fillStyle = 'rgba(214,228,255,0.55)';
      ctx.fillRect(MOON.x + Math.cos(a) * MOON.r * 0.82 - 1.5, MOON.y + Math.sin(a) * MOON.r * 0.82 - 1.5, 3, 3);
    }
    // The frost sheet.
    for (const z of FROST) {
      ctx.fillStyle = '#7a9cc0';
      ctx.beginPath();
      ctx.roundRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h, 18);
      ctx.fill();
      ctx.strokeStyle = '#d4e6ff';
      ctx.lineWidth = 2;
      ctx.stroke();
      for (let k = 0; k < 14; k++) {
        const x = z.x - z.w / 2 + 16 + rand() * (z.w - 32);
        const y = z.y - z.h / 2 + 10 + rand() * (z.h - 20);
        ctx.strokeStyle = 'rgba(235,245,255,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 9, y + 6);
        ctx.lineTo(x + 3, y + 14);
        ctx.stroke();
      }
    }
    // Scorch marks in the sun half, frost-rimed pebbles in the moon half.
    for (let k = 0; k < 14; k++) blob(ctx, 600 + rand() * 560, ARENA.y + 40 + rand() * (MID - ARENA.y - 80), 10 + rand() * 16, 'rgba(90,40,20,0.22)');
    for (let k = 0; k < 14; k++) blob(ctx, 600 + rand() * 560, MID + 40 + rand() * (ARENA.y + ARENA.h - MID - 80), 6 + rand() * 10, 'rgba(190,210,255,0.14)');
    for (const o of OBSTACLES) paintSlab(ctx, o, '#3a3542', o.kind === 'pillar' ? '#c9b6ff' : '#8c84a0');
    paintRim(ctx, '#121018', '#a58cc8');
    // Motes of light drifting in the air.
    for (let k = 0; k < 70; k++) {
      const top = rand() < 0.5;
      ctx.fillStyle = top ? `rgba(255,${190 + Math.floor(rand() * 50)},110,${0.2 + rand() * 0.35})` : `rgba(${180 + Math.floor(rand() * 40)},210,255,${0.2 + rand() * 0.35})`;
      const y = top ? ARENA.y + rand() * (MID - ARENA.y) : MID + rand() * (ARENA.y + ARENA.h - MID);
      ctx.fillRect(ARENA.x + rand() * ARENA.w, y, 2, 2);
    }
    paintVignette(ctx);
  },
};
