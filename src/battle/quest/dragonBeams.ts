import { QUEST } from '@/config';
import { sfx } from '@/audio/sfx';
import { ARENA, S } from '@/battle/coordinates';
import type { DragonBeam, DragonCast } from '@/battle/types';
import { DRAGON_COLORS, dragonRayEntry, touchesDragonBeam } from '@/battle/quest/dragonRules';
import type { BattleScene } from '@/scenes/BattleScene';

type DragonBeamContext = Pick<BattleScene,
  'applyDragonHit' | 'chests' | 'dragonBeam' | 'fighters' | 'gGlow' | 'shotBlockers'
>;

/** The same clipped segment is used for drawing and damage, so stones provide real cover. */
export function dragonBeamPath(beam: DragonBeam, blockers: DragonBeamContext['shotBlockers'], chests: DragonBeamContext['chests']) {
  const c = Math.cos(beam.angle), s = Math.sin(beam.angle);
  const x = beam.head.x + c * beam.head.w * 0.65;
  const y = beam.head.y + s * beam.head.w * 0.65;
  const edgeX = Math.abs(c) < 1e-9 ? Infinity : ((c > 0 ? ARENA.x + ARENA.w : ARENA.x) - x) / c;
  const edgeY = Math.abs(s) < 1e-9 ? Infinity : ((s > 0 ? ARENA.y + ARENA.h : ARENA.y) - y) / s;
  let length = Math.max(0, Math.min(QUEST.dragon.beam.range, edgeX, edgeY));
  const solids = [...blockers, ...chests.map((chest) => ({ x: chest.x - chest.w / 2, y: chest.y - chest.h / 2, width: chest.w, height: chest.h }))];
  for (const rect of solids) {
    const entry = dragonRayEntry(x, y, beam.angle, rect);
    if (entry !== null) length = Math.min(length, entry);
  }
  return { x, y, length, width: QUEST.dragon.beam.width * S, endX: x + c * length, endY: y + s * length };
}

/** Breath starts after the short head glow; its sweep direction varies between casts. */
export function startDragonBeam(this: DragonBeamContext, cast: DragonCast): void {
  const direction = Math.random() < 0.5 ? -1 : 1;
  const startAngle = cast.angle - direction * QUEST.dragon.beam.sweep / 2;
  this.dragonBeam = { element: cast.element, head: cast.head, startAngle, angle: startAngle, direction, elapsed: 0, tick: 0 };
  if (cast.element === 'fire') sfx.fireball();
  else if (cast.element === 'ice') sfx.iceStaff();
  else sfx.thunder();
}

/** A slow angular sweep, with damage on half-second ticks rather than every rendered frame. */
export function updateDragonBeam(this: DragonBeamContext, dt: number): void {
  const beam = this.dragonBeam;
  if (!beam) return;
  const spec = QUEST.dragon.beam;
  if (!beam.head.alive || beam.elapsed + dt >= spec.duration) { this.dragonBeam = null; return; }
  beam.elapsed += dt;
  beam.angle = beam.startAngle + beam.direction * spec.sweep * beam.elapsed / spec.duration;
  beam.tick -= dt;
  if (beam.tick > 0) return;
  beam.tick += spec.tick;
  const path = dragonBeamPath(beam, this.shotBlockers, this.chests);
  if (path.length <= 0) return;
  for (const target of this.fighters) {
    if (!target.alive || target.team === beam.head.team || target.untouchable || target.trapped) continue;
    if (touchesDragonBeam(target.x, target.y, target.radius, path, beam.angle, path.length, path.width)) {
      this.applyDragonHit(target, beam.element, path, 1, [], true);
    }
  }
}

/** Fire ripples, a jagged lightning core, or a crystalline ice stream over the shared beam glow. */
export function renderDragonBeam(this: DragonBeamContext, now: number): void {
  const beam = this.dragonBeam;
  if (!beam?.head.alive) return;
  const path = dragonBeamPath(beam, this.shotBlockers, this.chests);
  if (path.length <= 0) return;
  const g = this.gGlow;
  const color = DRAGON_COLORS[beam.element];
  const pulse = 0.85 + 0.15 * Math.sin(now * 28);
  g.lineStyle(path.width * 1.7, color, 0.16).lineBetween(path.x, path.y, path.endX, path.endY);
  g.lineStyle(path.width * pulse, color, 0.72).lineBetween(path.x, path.y, path.endX, path.endY);
  g.lineStyle(path.width * 0.28, 0xf6fbff, 0.92).lineBetween(path.x, path.y, path.endX, path.endY);
  const c = Math.cos(beam.angle), s = Math.sin(beam.angle);
  const count = Math.max(1, Math.ceil(path.length / 30));
  for (let k = 1; k <= count; k++) {
    const distance = path.length * k / count;
    const wave = Math.sin(k * 2.3 + now * 25) * path.width * 0.3;
    const x = path.x + c * distance - s * wave;
    const y = path.y + s * distance + c * wave;
    if (beam.element === 'fire') {
      g.fillStyle(0xffc354, 0.8).fillCircle(x, y, path.width * (0.15 + 0.1 * Math.sin(k + now * 16)));
    } else if (beam.element === 'ice') {
      g.fillStyle(0xdafaff, 0.85).fillTriangle(x + c * 10, y + s * 10, x - c * 6 - s * 5, y - s * 6 + c * 5, x - c * 6 + s * 5, y - s * 6 - c * 5);
    } else {
      const previous = path.length * (k - 1) / count;
      const lastWave = k === 1 ? 0 : Math.sin((k - 1) * 2.3 + now * 25) * path.width * 0.3;
      g.lineStyle(3, 0xffffff, 0.95).lineBetween(path.x + c * previous - s * lastWave, path.y + s * previous + c * lastWave, x, y);
    }
  }
  g.fillStyle(color, 0.85).fillCircle(path.x, path.y, path.width * 0.7 * pulse);
  g.fillStyle(0xffffff, 0.9).fillCircle(path.x, path.y, path.width * 0.25);
  g.fillStyle(color, 0.45).fillCircle(path.endX, path.endY, path.width * 0.8);
}
