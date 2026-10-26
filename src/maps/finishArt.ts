import { HEIGHT, HUD_HEIGHT, QUEST, WIDTH } from '../config';
import { ARENA, mulberry32, type Ctx, type GameMap, type MapId, type Obstacle } from './common';

type Material = 'stone' | 'grass' | 'snow' | 'sand' | 'timber' | 'weave' | 'ash' | 'stars';
type Motif = 'temple' | 'garden' | 'wave' | 'frost' | 'forge' | 'spirit';
interface ArtDirection { material: Material; motif: Motif; light: string; trim: string; grain: number }
const art = (material: Material, motif: Motif, light: string, trim: string, grain = 0): ArtDirection => ({ material, motif, light, trim, grain });

/** Every arena has an explicit material and palette; no map falls back to a generic treatment. */
export const MAP_ART: Record<MapId, ArtDirection> = {
  courtyard: art('stone', 'temple', '#efc894', '#d5b274'),
  river: art('grass', 'wave', '#acd1a1', '#a9cbb6'),
  snow: art('snow', 'frost', '#c1dfff', '#c4d7e5'),
  town: art('stone', 'temple', '#f4b879', '#bf9a75'),
  lava: art('ash', 'forge', '#ffad63', '#d98a60'),
  garden: art('grass', 'garden', '#ffc9da', '#c8c89c'),
  dojo: art('weave', 'temple', '#f2d2a1', '#d0aa71'),
  paddy: art('grass', 'wave', '#e9d7a4', '#bccb88'),
  ice: art('snow', 'frost', '#a1e4f4', '#9bd1e7'),
  docks: art('timber', 'wave', '#c3dbed', '#99b7c5'),
  onsen: art('stone', 'wave', '#ffd6af', '#cda581'),
  graveyard: art('grass', 'spirit', '#a7b4cf', '#8da7b4'),
  desert: art('sand', 'temple', '#ffe2a1', '#d9b26f'),
  swamp: art('grass', 'garden', '#bddb8a', '#91ad81'),
  maze: art('grass', 'garden', '#c3dc98', '#a1bc8b'),
  canyon: art('sand', 'wave', '#f4cfaa', '#ccaa85'),
  peak: art('stone', 'frost', '#c6d7ff', '#afbcd5'),
  beach: art('sand', 'wave', '#ffdeb0', '#d9c59c'),
  volcano: art('ash', 'forge', '#ffb366', '#d38762'),
  portal: art('stars', 'spirit', '#d8baff', '#b89adc'),
  festival: art('stone', 'garden', '#ffc48e', '#dcaa75'),
  rockslide: art('sand', 'forge', '#e3c39e', '#c6a487'),
  traps: art('stone', 'forge', '#dcbd90', '#b5a183'),
  crystal: art('stone', 'spirit', '#b5bfff', '#b3addc'),
  chasm: art('stone', 'spirit', '#b5cbe3', '#8fa8ba'),
  workshop: art('timber', 'forge', '#f9d192', '#c9a36b'),
  fog: art('grass', 'garden', '#aacbbc', '#91afa1'),
  sky: art('stone', 'wave', '#e4edff', '#b6cee3'),
  altar: art('stone', 'spirit', '#e9c0ff', '#bb9fda'),
  tidal: art('sand', 'wave', '#b9e2df', '#acccc5'),
  doors: art('weave', 'temple', '#eed8b1', '#d2b895'),
  powder: art('timber', 'forge', '#f5c58f', '#bd9b78', Math.PI / 2),
  bell: art('stone', 'temple', '#f3d594', '#d2b467'),
  barrier: art('stone', 'spirit', '#dfb9f2', '#b49fc7'),
  whirlpool: art('stone', 'wave', '#b1e4e3', '#91c2c5'),
  herbs: art('grass', 'garden', '#dcf1b1', '#adc18a'),
  tea: art('stone', 'garden', '#ffe0a7', '#d5b583'),
  storm: art('stone', 'frost', '#b4d8ff', '#9cb6da'),
  sunken: art('stone', 'wave', '#abded9', '#94c4be'),
  frostfire: art('ash', 'frost', '#c3d5ff', '#b6b3cc'),
  orchard: art('grass', 'garden', '#dbc5ef', '#baaccb'),
  astral: art('stars', 'spirit', '#d5c7ff', '#b7a4e5'),
  sanzu: art('ash', 'wave', '#eaa1a0', '#b78080'),
  yama: art('stone', 'forge', '#dfad92', '#b28b77'),
  prison: art('grass', 'spirit', '#d4a9ef', '#ad91c4'),
  grove: art('grass', 'garden', '#bcd29c', '#8fac80'),
  seals: art('stone', 'spirit', '#f0d49e', '#d5b274'),
  lantern: art('stone', 'spirit', '#c6efc9', '#91b3a2'),
  wardens: art('stone', 'temple', '#e5bdad', '#9dbba9'),
  onihall: art('ash', 'forge', '#f1b39a', '#ce8f76'),
  snare: art('grass', 'garden', '#c5d9a4', '#8ea878'),
  night: art('timber', 'temple', '#f0d2a4', '#8a7358'),
  dirge: art('ash', 'temple', '#e7c27a', '#a68455'),
};

const enhanced = new WeakSet<GameMap>();

/** A cached Canvas pass shared by battle textures, map cards and menu previews. */
export function polishMapArt(map: GameMap): GameMap {
  if (enhanced.has(map)) return map;
  enhanced.add(map);
  const original = map.paint;
  map.paint = function (ctx, rand) {
    original.call(this, ctx, rand);
    paintMapFinish(ctx, this);
  };
  return map;
}

function clearGround(map: GameMap, x: number, y: number, pad = 16) {
  if (map.obstacles.some((o) => Math.abs(x - o.x) < o.w / 2 + pad && Math.abs(y - o.y) < o.h / 2 + pad)) return false;
  if (map.zones?.some((o) => o.kind !== 'floor' && Math.abs(x - o.x) < o.w / 2 + pad && Math.abs(y - o.y) < o.h / 2 + pad)) return false;
  if (map.chests.some((c) => Math.hypot(x - c.x, y - c.y) < pad + 26)) return false;
  if (map.id === 'seals' && QUEST.seals.spots.some((p) => Math.hypot(x - p.x, y - p.y) < QUEST.seals.radius + pad)) return false;
  return true;
}

function paintMapFinish(ctx: Ctx, map: GameMap) {
  const direction = MAP_ART[map.id];
  const seed = [...map.id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 17);
  const rand = mulberry32(seed);
  ctx.save();
  ctx.beginPath(); ctx.rect(ARENA.x, ARENA.y, ARENA.w, ARENA.h); ctx.clip();
  // Sparse material marks avoid objectives, props and all functional terrain overlays.
  for (let n = 0; n < 180; n++) {
    const x = ARENA.x + 25 + rand() * (ARENA.w - 50), y = ARENA.y + 25 + rand() * (ARENA.h - 50);
    if (!clearGround(map, x, y, 22)) continue;
    paintMaterial(ctx, x, y, direction, rand);
  }
  // Secondary details bring the existing props out of the floor without changing their silhouette.
  for (const o of map.obstacles) paintPropFinish(ctx, o, direction, map.id);
  // A broad wash is baked into the texture once; live skill and hazard telegraphs remain above it.
  const light = ctx.createRadialGradient(WIDTH * 0.25, HUD_HEIGHT + 80, 10, WIDTH * 0.25, HUD_HEIGHT + 80, 650);
  light.addColorStop(0, direction.light + '17'); light.addColorStop(1, direction.light + '00');
  ctx.fillStyle = light; ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  ctx.restore();
  paintBorder(ctx, direction);
}

function paintMaterial(ctx: Ctx, x: number, y: number, a: ArtDirection, rand: () => number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a.material === 'timber' || a.material === 'weave' ? a.grain : rand() * Math.PI);
  ctx.lineWidth = 1; ctx.strokeStyle = a.trim + '30'; ctx.fillStyle = a.trim + '24';
  switch (a.material) {
    case 'grass':
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath(); ctx.moveTo(k * 3, 3); ctx.quadraticCurveTo(k * 4, -2, k * 7 + 2, -7 - rand() * 4); ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(9, 2, 4, 1.5, 0.5, 0, Math.PI * 2); ctx.fill();
      break;
    case 'snow':
      ctx.strokeStyle = '#e7f7ff55';
      for (let k = 0; k < 3; k++) {
        const ang = k * Math.PI / 3, r = 3 + rand() * 2;
        ctx.beginPath(); ctx.moveTo(-Math.cos(ang) * r, -Math.sin(ang) * r); ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r); ctx.stroke();
      }
      break;
    case 'sand':
      for (let k = 0; k < 3; k++) {
        ctx.beginPath(); ctx.moveTo(-14 + k * 2, k * 4); ctx.quadraticCurveTo(0, k * 4 - 6, 17 - k * 2, k * 4); ctx.stroke();
      }
      break;
    case 'timber':
      ctx.beginPath(); ctx.moveTo(-16, 0); ctx.quadraticCurveTo(-4, -3, 15, -1); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, 7, 1.8, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'weave':
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath(); ctx.moveTo(-8, k * 2); ctx.lineTo(8, k * 2); ctx.stroke();
      }
      break;
    case 'stars':
      ctx.fillStyle = a.light + '70'; ctx.fillRect(-1, -1, 2, 2);
      if (rand() < 0.25) { ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.moveTo(0, -4); ctx.lineTo(0, 4); ctx.stroke(); }
      break;
    default:
      ctx.strokeStyle = a.material === 'ash' ? '#14121b65' : '#171b2240';
      ctx.beginPath(); ctx.moveTo(-9, 4); ctx.lineTo(-2, 0); ctx.lineTo(2, -5); ctx.lineTo(11, -8); ctx.moveTo(-2, 0); ctx.lineTo(5, 4); ctx.stroke();
      ctx.fillStyle = a.trim + '22'; ctx.fillRect(9, -5, 3, 1);
  }
  ctx.restore();
}

function paintPropFinish(ctx: Ctx, o: Obstacle, a: ArtDirection, id: MapId) {
  if (['water', 'pond', 'sea', 'blood', 'lava'].includes(o.kind)) {
    // Short reflected ripples stay near the centre, respecting both curved and square pools.
    const warm = o.kind === 'lava' || o.kind === 'blood';
    ctx.save(); ctx.beginPath(); ctx.rect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h); ctx.clip();
    ctx.strokeStyle = warm ? '#ffba7940' : '#cceaf232'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      const y = o.y + (k - 1) * Math.min(12, o.h * 0.16), span = Math.min(55, o.w * 0.3);
      ctx.beginPath(); ctx.moveTo(o.x - span, y); ctx.quadraticCurveTo(o.x, y - 4, o.x + span, y); ctx.stroke();
    }
    ctx.restore(); return;
  }
  // Quest trees and princess cages are replaced by live actors; leave their painted footprints alone.
  if (o.kind === 'cage' || o.kind === 'deadtree' && (id === 'prison' || id === 'grove' || id === 'snare')) return;
  const masonry = ['pillar', 'ruin', 'statue', 'obsidian', 'rock', 'hellwall', 'throne', 'post', 'machine', 'crystal'].includes(o.kind);
  if (masonry && o.w >= 26 && o.h >= 26) {
    ctx.save(); ctx.beginPath(); ctx.rect(o.x - o.w / 2 + 3, o.y - o.h / 2 + 3, o.w - 6, o.h - 6); ctx.clip();
    ctx.strokeStyle = a.light + '45'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(o.x - o.w * 0.3, o.y - o.h * 0.3); ctx.lineTo(o.x + o.w * 0.15, o.y - o.h * 0.3); ctx.stroke();
    ctx.strokeStyle = '#10141b55';
    ctx.beginPath(); ctx.moveTo(o.x + o.w * 0.3, o.y + o.h * 0.1); ctx.lineTo(o.x + o.w * 0.08, o.y + o.h * 0.2); ctx.lineTo(o.x + o.w * 0.14, o.y + o.h * 0.38); ctx.stroke();
    if (a.motif === 'forge') {
      ctx.fillStyle = a.trim + 'aa';
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(o.x + side * (o.w / 2 - 7), o.y - o.h / 2 + 7, 1.8, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }
  if (['bamboo', 'pine', 'sakura', 'hedge', 'palm', 'stump', 'deadtree'].includes(o.kind)) {
    // Leaf litter at the prop's feet connects plants to the landscape.
    ctx.fillStyle = a.trim + '42';
    for (let k = 0; k < 5; k++) {
      const angle = k * 2.4, d = Math.min(o.w, o.h) * 0.55 + 5;
      ctx.beginPath(); ctx.ellipse(o.x + Math.cos(angle) * d, o.y + Math.sin(angle) * d * 0.6 + o.h * 0.25, 4, 1.5, angle, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function paintBorder(ctx: Ctx, a: ArtDirection) {
  ctx.save(); ctx.strokeStyle = a.trim + '70'; ctx.lineWidth = 1;
  // Inlaid corner brackets sit on the physical border, away from combat and objectives.
  for (const x of [11, WIDTH - 11]) for (const y of [HUD_HEIGHT + 11, HEIGHT - 11]) {
    const sx = x < WIDTH / 2 ? 1 : -1, sy = y < HEIGHT / 2 ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(x, y + sy * 28); ctx.lineTo(x, y); ctx.lineTo(x + sx * 42, y); ctx.stroke();
    ctx.fillStyle = a.trim + '99'; ctx.fillRect(x + sx * 8 - 2, y + sy * 8 - 2, 4, 4);
  }
  // A tiny family-specific crest is engraved into the top and bottom wall.
  for (const y of [HUD_HEIGHT + 10, HEIGHT - 10]) {
    ctx.save(); ctx.translate(WIDTH / 2, y);
    ctx.strokeStyle = a.trim + 'b0'; ctx.lineWidth = 1.2;
    if (a.motif === 'wave') {
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(k * 12 - 8, 0); ctx.quadraticCurveTo(k * 12, -7, k * 12 + 8, 0); ctx.stroke(); }
    } else if (a.motif === 'garden') {
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * 6, 0, 7, 3, side * -0.45, 0, Math.PI * 2); ctx.stroke(); }
    } else if (a.motif === 'frost') {
      for (let k = 0; k < 3; k++) { const t = k * Math.PI / 3; ctx.beginPath(); ctx.moveTo(-Math.cos(t) * 7, -Math.sin(t) * 7); ctx.lineTo(Math.cos(t) * 7, Math.sin(t) * 7); ctx.stroke(); }
    } else if (a.motif === 'forge') {
      for (const x of [-12, 0, 12]) ctx.strokeRect(x - 3, -3, 6, 6);
    } else if (a.motif === 'spirit') {
      ctx.beginPath(); ctx.arc(0, 0, 6, -1.2, 1.9); ctx.stroke(); ctx.beginPath(); ctx.arc(12, -1, 1.5, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(0, -6); ctx.lineTo(12, 0); ctx.lineTo(0, 6); ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}
