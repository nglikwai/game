import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import { ARENA, ARENA_MID_Y as MID, blob, cornerPile, paintVignette, type GameMap, type TerrainZone } from '@/maps/common';
import { paintRim, paintSlab } from '@/maps/art/primitives';

const PITS: TerrainZone[] = [370, WIDTH - 370].flatMap((x) => [MID - 155, MID + 155].map((y) => ({
  kind: 'sandpit' as const, x, y, w: 240, h: 240, pull: 130, dps: 10, core: 0.18,
})));

function crossesPit(from: { x: number; y: number }, to: { x: number; y: number }, pit: TerrainZone, pad = 30) {
  const rx = pit.w / 2 + pad, ry = pit.h / 2 + pad;
  const x = (from.x - pit.x) / rx, y = (from.y - pit.y) / ry;
  const dx = (to.x - from.x) / rx, dy = (to.y - from.y) / ry;
  const t = Math.max(0, Math.min(1, -(x * dx + y * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x + dx * t, y + dy * t) <= 1;
}

// Cache a visibility graph around the four funnels. Chords stay outside the safe margin.
const NAV = PITS.flatMap((pit) => Array.from({ length: 32 }, (_, k) => {
  const angle = k * Math.PI / 16;
  return { x: pit.x + Math.cos(angle) * ((pit.w / 2 + 30) / Math.cos(Math.PI / 32) + 1),
    y: pit.y + Math.sin(angle) * ((pit.h / 2 + 30) / Math.cos(Math.PI / 32) + 1) };
})).filter((p) => p.x > ARENA.x + 20 && p.x < ARENA.x + ARENA.w - 20
  && p.y > ARENA.y + 20 && p.y < ARENA.y + ARENA.h - 20);
const clear = (a: { x: number; y: number }, b: { x: number; y: number }) => PITS.every((pit) => !crossesPit(a, b, pit));
const NAV_EDGES = NAV.map((a, i) => NAV.flatMap((b, j) => i !== j && clear(a, b)
  ? [{ to: j, cost: Math.hypot(a.x - b.x, a.y - b.y) }] : []));

/** Shortest safe route avoids local dead ends between the larger pits. */
function aroundPits(fx: number, fy: number, tx: number, ty: number) {
  const from = { x: fx, y: fy }, target = { x: tx, y: ty };
  if (clear(from, target)) return null;
  const inside = PITS.find((pit) => crossesPit(from, from, pit));
  if (inside) {
    const angle = Math.atan2(fy - inside.y, fx - inside.x);
    return { x: inside.x + Math.cos(angle) * (inside.w / 2 + 34),
      y: inside.y + Math.sin(angle) * (inside.h / 2 + 34) };
  }
  // Search backwards from the target, retaining the complete path cost for each waypoint.
  const costs = NAV.map((p) => clear(p, target) ? Math.hypot(p.x - tx, p.y - ty) : Infinity);
  const visited = new Set<number>();
  for (let k = 0; k < NAV.length; k++) {
    let next = -1;
    for (let i = 0; i < NAV.length; i++) if (!visited.has(i) && (next < 0 || costs[i] < costs[next])) next = i;
    if (next < 0 || !Number.isFinite(costs[next])) break;
    visited.add(next);
    for (const edge of NAV_EDGES[next]) costs[edge.to] = Math.min(costs[edge.to], costs[next] + edge.cost);
  }
  let best = Infinity, waypoint: { x: number; y: number } | null = null;
  NAV.forEach((p, i) => {
    const distance = Math.hypot(p.x - fx, p.y - fy);
    if (distance > 1 && distance + costs[i] < best && clear(from, p)) {
      best = distance + costs[i]; waypoint = p;
    }
  });
  return waypoint;
}

/** Four sinking funnels surround safe central lanes; weapon knockback can throw either side into them. */
export const AMBUSH: GameMap = {
  id: 'ambush', name: 'Red Sand Ambush', zh: '赤砂伏擊',
  desc: 'Four sand pits pull and damage anyone inside. Their dark centers are instantly fatal. Defeat the ambushers and use knockback to send enemies into the pits.',
  descZh: '四座流沙坑會將踏入者捲向中心並持續扣血，落入黑色核心立即死亡。擊敗伏兵，利用擊退把敵人推入沙坑。',
  obstacles: [
    { kind: 'ruin', x: 190, y: MID - 180, w: 52, h: 36 },
    { kind: 'ruin', x: WIDTH - 190, y: MID + 180, w: 52, h: 36 },
    { kind: 'crate', x: 190, y: MID + 175, w: 38, h: 32 },
    { kind: 'crate', x: WIDTH - 190, y: MID - 175, w: 38, h: 32 },
    { kind: 'pillar', x: WIDTH / 2, y: HUD_HEIGHT + 115, w: 32, h: 32 },
    { kind: 'pillar', x: WIDTH / 2, y: HEIGHT - 115, w: 32, h: 32 },
    { kind: 'bones', x: 140, y: HEIGHT - 110, w: 48, h: 26 },
    { kind: 'bones', x: WIDTH - 140, y: HUD_HEIGHT + 110, w: 48, h: 26 },
  ],
  zones: PITS,
  route: aroundPits,
  kegs: { spots: [
    { x: 300, y: MID }, { x: WIDTH - 300, y: MID },
    { x: WIDTH / 2, y: HUD_HEIGHT + 125 }, { x: WIDTH / 2, y: HEIGHT - 125 },
  ], radius: 110, damage: 24, respawn: 24 },
  herbs: { spots: [{ x: WIDTH / 2 - 80, y: HUD_HEIGHT + 85 }, { x: WIDTH / 2 + 80, y: HEIGHT - 85 }], heal: 15, regrow: 22 },
  chests: [...cornerPile(1, 1), ...cornerPile(1, -1), ...cornerPile(-1, 1), ...cornerPile(-1, -1),
    { x: WIDTH / 2, y: MID - 150, big: true }, { x: WIDTH / 2, y: MID + 150, big: true }],
  particles: 'dust',
  paint(ctx, rand) {
    // A continuous bed of red sand, with wind-shaped dunes rather than paving tiles.
    const ground = ctx.createLinearGradient(0, HUD_HEIGHT, WIDTH, HEIGHT);
    ground.addColorStop(0, '#c89860'); ground.addColorStop(0.5, '#b57b47'); ground.addColorStop(1, '#d0a16a');
    ctx.fillStyle = ground; ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
    for (let k = 0; k < 110; k++) {
      const x = ARENA.x + rand() * ARENA.w, y = ARENA.y + rand() * ARENA.h;
      blob(ctx, x, y, 15 + rand() * 55, `rgba(244,199,127,${0.03 + rand() * 0.05})`);
    }
    for (let y = ARENA.y - 10; y < HEIGHT; y += 22) {
      const phase = rand() * Math.PI * 2;
      for (const offset of [0, 3]) {
        ctx.strokeStyle = offset ? 'rgba(255,221,160,0.15)' : 'rgba(110,64,32,0.13)'; ctx.lineWidth = offset ? 1 : 2;
        ctx.beginPath();
        for (let x = ARENA.x; x <= WIDTH - ARENA.x; x += 8) {
          const wave = y + Math.sin(x * 0.013 + phase) * 10 + Math.sin(x * 0.029 + phase) * 3 + offset;
          if (x === ARENA.x) ctx.moveTo(x, wave); else ctx.lineTo(x, wave);
        }
        ctx.stroke();
      }
    }
    for (let k = 0; k < 4200; k++) {
      ctx.fillStyle = k % 3 ? 'rgba(255,224,166,0.18)' : 'rgba(104,61,29,0.19)';
      ctx.fillRect(ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 0.6 + rand() * 1.2, 0.7);
    }
    for (const zone of PITS) {
      const radius = zone.w / 2, core = radius * zone.core!;
      const gradient = ctx.createRadialGradient(zone.x, zone.y, core, zone.x, zone.y, radius);
      gradient.addColorStop(0, '#26140f'); gradient.addColorStop(0.45, '#78502f'); gradient.addColorStop(1, '#bd8b55');
      ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.arc(zone.x, zone.y, radius, 0, Math.PI * 2); ctx.fill();
      for (const ring of [0.35, 0.6, 0.82, 1]) {
        ctx.strokeStyle = ring === 1 ? '#e0af72' : 'rgba(225,171,106,0.35)'; ctx.lineWidth = ring === 1 ? 3 : 1.5;
        ctx.beginPath(); ctx.arc(zone.x, zone.y, radius * ring, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = '#100b0c'; ctx.beginPath(); ctx.arc(zone.x, zone.y, core, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(216,170,112,0.27)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(WIDTH / 2, MID, 106, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([7, 13]); ctx.beginPath(); ctx.arc(WIDTH / 2, MID, 118, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    // Old wagon tracks lead toward the center from both directions.
    for (const y of [MID - 32, MID + 32]) {
      ctx.strokeStyle = 'rgba(23,15,18,0.25)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(ARENA.x + 30, y); ctx.lineTo(WIDTH - 60, y); ctx.stroke();
    }
    for (const o of this.obstacles) paintSlab(ctx, o, o.kind === 'crate' ? '#6c4a32' : '#65545a', '#bc936c');
    paintRim(ctx, '#8c5e37', '#e0b477');
    paintVignette(ctx);
  },
};
