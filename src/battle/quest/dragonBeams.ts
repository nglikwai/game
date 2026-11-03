import { QUEST } from '@/config';
import { sfx } from '@/audio/sfx';
import { ARENA, S } from '@/battle/coordinates';
import type { DragonBeam, DragonCast } from '@/battle/types';
import { DRAGON_COLORS, dragonRayEntry, touchesDragonBeam } from '@/battle/quest/dragonRules';
import type { BattleScene } from '@/scenes/BattleScene';

type DragonBeamContext = Pick<BattleScene,
  'applyDragonHit' | 'chests' | 'dragonBeam' | 'fighters' | 'fx' | 'gGlow' | 'shotBlockers'
>;

const BREATH_SOUND_INTERVAL = 0.25;

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
  this.dragonBeam = { element: cast.element, head: cast.head, startAngle, angle: startAngle, direction, elapsed: 0, hitAt: new Map(), touching: [] };
  sfx.dragonBeam(cast.element);
}

/** A slow angular sweep. Touching it hurts at once, then again every `tick` s while a fighter stays in it. */
export function updateDragonBeam(this: DragonBeamContext, dt: number): void {
  const beam = this.dragonBeam;
  if (!beam) return;
  const spec = QUEST.dragon.beam;
  if (!beam.head.alive || beam.elapsed + dt >= spec.duration) { this.dragonBeam = null; return; }
  const previousPulse = Math.floor(beam.elapsed / BREATH_SOUND_INTERVAL);
  beam.elapsed += dt;
  if (Math.floor(beam.elapsed / BREATH_SOUND_INTERVAL) > previousPulse) sfx.dragonBeam(beam.element);
  beam.angle = beam.startAngle + beam.direction * spec.sweep * beam.elapsed / spec.duration;
  const hitAt = beam.hitAt ??= new Map();
  beam.touching = [];
  const path = dragonBeamPath(beam, this.shotBlockers, this.chests);
  if (path.length <= 0) return;
  for (const target of this.fighters) {
    if (!target.alive || target.team === beam.head.team || target.untouchable || target.trapped) continue;
    if (!touchesDragonBeam(target.x, target.y, target.radius, path, beam.angle, path.length, path.width)) continue;
    beam.touching.push(target);
    // Flames, frost or sparks lick whoever is in the stream every frame.
    if (beam.element === 'fire') this.fx.fireTrail(target.x, target.y, target.radius * 1.4);
    else this.fx.sparks(target.x, target.y, DRAGON_COLORS[beam.element], 1);
    const last = hitAt.get(target);
    if (last !== undefined && beam.elapsed - last < spec.tick - 1e-9) continue;
    hitAt.set(target, beam.elapsed);
    this.applyDragonHit(target, beam.element, path, 1, [], true);
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
  // A flaring splash where the stream strikes a fighter, so it never looks like it passes harmlessly through.
  for (const t of beam.touching ?? []) {
    if (!t.alive) continue;
    const flare = t.radius * (1.25 + 0.2 * Math.sin(now * 30));
    g.fillStyle(color, 0.5).fillCircle(t.x, t.y, flare * 1.4);
    g.fillStyle(beam.element === 'fire' ? 0xffc354 : 0xffffff, 0.75).fillCircle(t.x, t.y, flare * 0.8);
    for (let k = 0; k < 6; k++) {
      const a = beam.angle + Math.PI + (k - 2.5) * 0.45 + Math.sin(now * 20 + k) * 0.15;
      const len = flare * (1.5 + 0.5 * Math.sin(now * 24 + k * 1.7));
      g.lineStyle(3, beam.element === 'fire' ? 0xff8a2a : color, 0.85).lineBetween(t.x, t.y, t.x + Math.cos(a) * len, t.y + Math.sin(a) * len);
    }
  }
}
