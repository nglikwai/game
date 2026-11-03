import { HEIGHT, HUD_HEIGHT, WIDTH } from '@/config';
import { ARENA, ARENA_MID_Y as MID, blob, cornerPile, paintVignette, type GameMap, type TerrainZone } from '@/maps/common';
import { paintRim, paintSlab } from '@/maps/art/primitives';

// Four wide funnels fill about 70% of the arena; only their small black cores are fatal.
const PITS: TerrainZone[] = [331, WIDTH - 331].flatMap((x) => [MID - 146, MID + 146].map((y) => ({
  kind: 'sandpit' as const, x, y, w: 580, h: 280, pull: 110, dps: 10, core: 0.1, avoid: 0.4,
})));

/** CPUs route around the deep middle of each pit (the `avoid` ellipse), not the whole sand. */
const deepX = (pit: TerrainZone, pad: number) => pit.w * pit.avoid! / 2 + pad;
const deepY = (pit: TerrainZone, pad: number) => pit.h * pit.avoid! / 2 + pad;

function crossesPit(from: { x: number; y: number }, to: { x: number; y: number }, pit: TerrainZone, pad = 30) {
  const rx = deepX(pit, pad), ry = deepY(pit, pad);
  const x = (from.x - pit.x) / rx, y = (from.y - pit.y) / ry;
  const dx = (to.x - from.x) / rx, dy = (to.y - from.y) / ry;
  const t = Math.max(0, Math.min(1, -(x * dx + y * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x + dx * t, y + dy * t) <= 1;
}

// Cache a visibility graph around the four deep middles. Chords stay outside the safe margin.
const NAV = PITS.flatMap((pit) => Array.from({ length: 32 }, (_, k) => {
  const angle = k * Math.PI / 16;
  return { x: pit.x + Math.cos(angle) * (deepX(pit, 30) / Math.cos(Math.PI / 32) + 1),
    y: pit.y + Math.sin(angle) * (deepY(pit, 30) / Math.cos(Math.PI / 32) + 1) };
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
    return { x: inside.x + Math.cos(angle) * deepX(inside, 34),
      y: inside.y + Math.sin(angle) * deepY(inside, 34) };
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

/** Four sinking funnels of hell sand leave a cross of scorched rock; weapon knockback can throw either side in. */
export const AMBUSH: GameMap = {
  id: 'ambush', name: 'Red Sand Ambush', zh: '赤砂伏擊',
  desc: 'Four huge sand pits pull and damage anyone inside, harder near the middle. Their small dark centers are instantly fatal. Defeat the ambushers and use knockback to send enemies in.',
  descZh: '四座巨大流沙坑會將踏入者捲向中心並持續扣血，越深越痛，落入黑色核心立即死亡。擊敗伏兵，利用擊退把敵人推入沙坑。',
  obstacles: [
    { kind: 'pillar', x: WIDTH / 2, y: MID - 95, w: 32, h: 32 },
    { kind: 'pillar', x: WIDTH / 2, y: MID + 95, w: 32, h: 32 },
    { kind: 'bones', x: 120, y: HUD_HEIGHT + 48, w: 48, h: 26 },
    { kind: 'bones', x: WIDTH - 120, y: HEIGHT - 48, w: 48, h: 26 },
  ],
  zones: PITS,
  route: aroundPits,
  kegs: { spots: [
    { x: 210, y: MID }, { x: WIDTH - 210, y: MID },
    { x: WIDTH / 2, y: HUD_HEIGHT + 60 }, { x: WIDTH / 2, y: HEIGHT - 60 },
  ], radius: 110, damage: 24, respawn: 24 },
  herbs: { spots: [{ x: WIDTH / 2 - 70, y: HUD_HEIGHT + 50 }, { x: WIDTH / 2 + 70, y: HEIGHT - 50 }], heal: 15, regrow: 22 },
  chests: [...cornerPile(1, 1), ...cornerPile(1, -1), ...cornerPile(-1, 1), ...cornerPile(-1, -1),
    { x: WIDTH / 2, y: MID - 170, big: true }, { x: WIDTH / 2, y: MID + 170, big: true }],
  particles: 'embers',
  paint(ctx, rand) {
    // Scorched black rock, lit from below by the pits and veined with lava.
    const ground = ctx.createLinearGradient(0, HUD_HEIGHT, WIDTH, HEIGHT);
    ground.addColorStop(0, '#2a1012'); ground.addColorStop(0.5, '#3b1514'); ground.addColorStop(1, '#24100f');
    ctx.fillStyle = ground; ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
    for (let k = 0; k < 90; k++) {
      const x = ARENA.x + rand() * ARENA.w, y = ARENA.y + rand() * ARENA.h;
      blob(ctx, x, y, 15 + rand() * 55, rand() < 0.5 ? `rgba(12,4,6,${0.12 + rand() * 0.12})` : `rgba(120,30,18,${0.05 + rand() * 0.07})`);
    }
    // Branching lava cracks: a dark gash with a glowing core.
    for (let k = 0; k < 26; k++) {
      let x = ARENA.x + rand() * ARENA.w, y = ARENA.y + rand() * ARENA.h, a = rand() * Math.PI * 2;
      const points = [{ x, y }];
      for (let step = 0; step < 6 + rand() * 6; step++) {
        a += (rand() - 0.5) * 1.3; x += Math.cos(a) * (10 + rand() * 18); y += Math.sin(a) * (10 + rand() * 18);
        points.push({ x, y });
      }
      for (const [width, color] of [[7, 'rgba(255,70,20,0.10)'], [3.2, '#1a0708'], [1.4, 'rgba(255,128,48,0.85)']] as const) {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
        ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
      }
    }
    for (let k = 0; k < 3200; k++) {
      ctx.fillStyle = k % 4 ? 'rgba(10,3,4,0.28)' : 'rgba(255,120,60,0.16)';
      ctx.fillRect(ARENA.x + rand() * ARENA.w, ARENA.y + rand() * ARENA.h, 0.6 + rand() * 1.2, 0.7);
    }
    // Each pit is a funnel of blood-red sand glowing hotter toward the black core.
    for (const zone of PITS) {
      const rx = zone.w / 2, ry = zone.h / 2, core = Math.min(rx, ry) * zone.core!;
      ctx.save(); ctx.translate(zone.x, zone.y); ctx.scale(1, ry / rx);
      const glow = ctx.createRadialGradient(0, 0, rx * 0.9, 0, 0, rx * 1.08);
      glow.addColorStop(0, 'rgba(255,80,30,0.25)'); glow.addColorStop(1, 'rgba(255,80,30,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, rx * 1.08, 0, Math.PI * 2); ctx.fill();
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      gradient.addColorStop(0, '#1a0506'); gradient.addColorStop(0.12, '#5c120e'); gradient.addColorStop(0.45, '#8a2a16');
      gradient.addColorStop(0.8, '#9c3c1c'); gradient.addColorStop(1, '#6e2414');
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
      for (const ring of [0.2, 0.4, 0.6, 0.8, 1]) {
        ctx.strokeStyle = ring === 1 ? '#ff7a3a' : `rgba(255,140,80,${0.12 + ring * 0.12})`; ctx.lineWidth = ring === 1 ? 3 : 1.5;
        ctx.beginPath(); ctx.arc(0, 0, rx * ring, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = '#060203'; ctx.beginPath(); ctx.arc(zone.x, zone.y, core, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff5a24'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(zone.x, zone.y, core + 1, 0, Math.PI * 2); ctx.stroke();
    }
    // A ring of skulls marks the safe ground where the party is caught.
    ctx.strokeStyle = 'rgba(255,110,60,0.3)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(WIDTH / 2, MID, 70, 0, Math.PI * 2); ctx.stroke();
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4 + Math.PI / 8, x = WIDTH / 2 + Math.cos(a) * 70, y = MID + Math.sin(a) * 70;
      ctx.fillStyle = '#d9c7a8'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a0708'; ctx.fillRect(x - 2, y - 1, 1.5, 1.5); ctx.fillRect(x + 0.5, y - 1, 1.5, 1.5);
    }
    for (const o of this.obstacles) paintSlab(ctx, o, '#3a2224', '#a0503a');
    paintRim(ctx, '#2a0c0c', '#8a2a1a');
    paintVignette(ctx);
  },
};
