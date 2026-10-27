import type { TerrainZone } from '@/maps';
import * as Phaser from 'phaser';
import { QUEST, ALTAR, PLAYER_COLORS } from '@/config';
import { Fighter } from '@/gameplay/Fighter';
import { sfx } from '@/audio/sfx';
import { type TerrainKind } from '@/maps';
import { C } from '@/ui';
import { S, toWorld, toWorldRect, toDesign } from '@/battle/coordinates';
import type { BattleScene } from '@/scenes/BattleScene';
import { sandPitContains, sandPitForce } from '@/battle/environment/sandPits';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type EnvironmentTerrainContext = Phaser.Scene & Pick<BattleScene,
  'altarTeam' | 'caltrops' | 'countdown' | 'elapsedFight' | 'fighters'
  | 'fx' | 'g' | 'gGlow' | 'gOver' | 'groveIllusion'
  | 'grovePhase' | 'isHell' | 'map' | 'mode' | 'padLock'
  | 'quest' | 'sideColor' | 'snareIllusion' | 'snareTrees' | 'stormMarks'
  | 'tideState' | 'zoneAt'
>;

/** Whirlpools: spiral arms turning towards the middle. */
export function renderVortex(this: EnvironmentTerrainContext, now: number): void {
  for (const z of this.map.zones ?? []) {
    if (z.kind !== 'vortex') continue;
    const c = toWorld(z);
    const R = (z.w * S) / 2;
    for (let arm = 0; arm < 4; arm++) {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= 20; i++) {
        const u = i / 20;
        const a = now * 2 + arm * (Math.PI / 2) + u * 4;
        pts.push({ x: c.x + Math.cos(a) * R * (1 - u), y: c.y + Math.sin(a) * R * (1 - u) });
      }
      this.gOver.lineStyle(2, 0xdff6ff, 0.35).strokePoints(pts as Phaser.Math.Vector2[], false);
    }
  }
}

/** Launch pads: step on one and you're flung the way its arrow points. */
export function updatePads(this: EnvironmentTerrainContext): void {
  for (const f of this.fighters) {
    if (!f.alive) continue;
    const z = this.zoneAt(f.x, f.y);
    if (z?.kind !== 'pad' || !z.push) {
      this.padLock.delete(f);
      continue;
    }
    if (this.padLock.has(f)) continue;
    this.padLock.add(f);
    f.launch(z.push.x, z.push.y);
    sfx.dash();
    this.fx.smoke(f.x, f.y, 6, 0.6);
  }
}

export function renderPads(this: EnvironmentTerrainContext, now: number): void {
  for (const z of this.map.zones ?? []) {
    if (z.kind !== 'pad' || !z.push) continue;
    const r = toWorldRect(z);
    const a = Math.atan2(z.push.y, z.push.x);
    const pulse = 0.5 + 0.5 * Math.sin(now * 5 + r.x);
    this.gGlow.fillStyle(0x6ad8ff, 0.18 + 0.15 * pulse).fillCircle(r.x, r.y, r.w / 2);
    // Chevrons running the way it throws you.
    for (let k = 0; k < 3; k++) {
      const d = ((now * 1.5 + k / 3) % 1) * r.w * 0.6 - r.w * 0.3;
      const cx = r.x + Math.cos(a) * d;
      const cy = r.y + Math.sin(a) * d;
      const px = -Math.sin(a) * 9;
      const py = Math.cos(a) * 9;
      this.gGlow.lineStyle(3, 0xdff6ff, 0.8).lineBetween(cx - Math.cos(a) * 7 + px, cy - Math.sin(a) * 7 + py, cx, cy).lineBetween(cx, cy, cx - Math.cos(a) * 7 - px, cy - Math.sin(a) * 7 - py);
    }
  }
}

/** Soul Altar: a team standing on it alone charges soul and PE fast. */
export function updateAltar(this: EnvironmentTerrainContext, dt: number): void {
  const z = this.map.zones?.find((zone) => zone.kind === 'altar');
  if (!z) return;
  const on = this.fighters.filter((f) => f.alive && this.zoneAt(f.x, f.y) === z);
  const teams = new Set(on.map((f) => f.team));
  this.altarTeam = teams.size === 1 ? [...teams][0] : -1;
  if (this.altarTeam < 0) return;
  for (const f of on) {
    f.addSoul(ALTAR.soulPerSec * dt);
    f.restorePe(ALTAR.pePerSec * dt);
  }
}

export function renderAltar(this: EnvironmentTerrainContext, now: number): void {
  const z = this.map.zones?.find((zone) => zone.kind === 'altar');
  if (!z) return;
  const r = toWorldRect(z);
  const held = this.altarTeam >= 0;
  const color = held ? (this.mode === 'ffa' ? PLAYER_COLORS[this.altarTeam] ?? 0xb57bff : this.sideColor(this.altarTeam)) : 0xb57bff;
  const pulse = 0.5 + 0.5 * Math.sin(now * (held ? 8 : 2));
  this.gGlow.lineStyle(3, color, 0.4 + 0.4 * pulse).strokeCircle(r.x, r.y, r.w / 2);
  this.gGlow.fillStyle(color, (held ? 0.14 : 0.06) + 0.06 * pulse).fillCircle(r.x, r.y, r.w / 2);
  if (held) {
    // Soul rising off the altar.
    for (let k = 0; k < 6; k++) {
      const a = now * 1.5 + (k * Math.PI) / 3;
      const rise = (now * 40 + k * 20) % 50;
      this.gGlow.fillStyle(0xe2c8ff, 0.7 * (1 - rise / 50)).fillCircle(r.x + Math.cos(a) * r.w * 0.3, r.y + Math.sin(a) * r.w * 0.3 - rise, 3);
    }
  }
}

/** Fog banks: soft drifting clouds drawn over the fighters inside them. */
export function renderFog(this: EnvironmentTerrainContext, now: number): void {
  for (const [zi, z] of (this.map.zones ?? []).entries()) {
    if (z.kind !== 'fog') continue;
    const r = toWorldRect(z);
    for (let k = 0; k < 9; k++) {
      const fx = r.x - r.w / 2 + ((k * 0.37 + zi * 0.21) % 1) * r.w + Math.sin(now * 0.4 + k) * 14;
      const fy = r.y - r.h / 2 + ((k * 0.61 + zi * 0.13) % 1) * r.h + Math.cos(now * 0.3 + k) * 10;
      this.gOver.fillStyle(0xdde4ea, 0.16).fillEllipse(fx, fy, r.w * 0.55, r.h * 0.5);
    }
  }
}

/** Tide flats: water creeps in (warning), stays a while, then drains away. */
export function renderTide(this: EnvironmentTerrainContext, now: number): void {
  if (!this.map.tideCycle) return;
  const { flooded, rising, k } = this.tideState();
  if (!flooded && !rising) return;
  for (const z of this.map.zones ?? []) {
    if (z.kind !== 'tide') continue;
    const r = toWorldRect(z);
    const a = flooded ? 0.45 : 0.15 + 0.15 * k * (0.5 + 0.5 * Math.sin(now * 10));
    this.g.fillStyle(0x3aa8c8, a).fillRect(r.x - r.w / 2, r.y - r.h / 2, r.w, r.h);
    if (flooded) for (let y = r.y - r.h / 2 + 12; y < r.y + r.h / 2; y += 24) {
      this.g.lineStyle(1.5, 0xffffff, 0.3).lineBetween(r.x - r.w / 2, y + Math.sin(now * 2 + y) * 3, r.x + r.w / 2, y + Math.sin(now * 2 + y + 1) * 3);
    }
  }
}

/** Warning marks on the ground: a ring that tightens and a fill that grows until the strike. */
export function renderStorm(this: EnvironmentTerrainContext, now: number): void {
  const L = this.map.lightning;
  if (!L) return;
  for (const m of this.stormMarks) {
    const k = m.t / L.warn;
    const pulse = 0.5 + 0.5 * Math.sin(now * (10 + k * 30));
    this.g.fillStyle(0x9fb8ff, 0.1 + 0.25 * k).fillCircle(m.x, m.y, L.radius * k);
    this.g.lineStyle(2.5, 0xdfe8ff, 0.4 + 0.5 * pulse).strokeCircle(m.x, m.y, L.radius);
    this.gGlow.lineStyle(2, 0x8fb4ff, 0.3 * pulse).strokeCircle(m.x, m.y, L.radius * (1.4 - 0.4 * k));
  }
}

/** Streaks blowing through wind zones, so you can see which way they push. */
export function renderWind(this: EnvironmentTerrainContext, now: number): void {
  for (const [zi, z] of (this.map.zones ?? []).entries()) {
    if (z.kind !== 'wind' || !z.push) continue;
    const r = toWorldRect(z);
    const len = Math.hypot(z.push.x, z.push.y) || 1;
    const ux = z.push.x / len;
    const uy = z.push.y / len;
    for (let k = 0; k < 16; k++) {
      // Each streak loops along the push direction at its own speed and lane.
      const lane = ((k * 0.618 + zi * 0.3) % 1);
      const prog = (now * (0.35 + (k % 4) * 0.08) + k * 0.37) % 1;
      const x = r.x - r.w / 2 + (ux !== 0 ? (ux > 0 ? prog : 1 - prog) : lane) * r.w;
      const y = r.y - r.h / 2 + (uy !== 0 ? (uy > 0 ? prog : 1 - prog) : lane) * r.h;
      const a = Math.sin(prog * Math.PI) * 0.35;
      this.gOver.lineStyle(2, 0xffffff, a).lineBetween(x, y, x - ux * 26, y - uy * 26);
    }
  }
}

/** The first zone under a battlefield point (zones are in map / design coordinates). */
export function zoneAt(this: EnvironmentTerrainContext, wx: number, wy: number): TerrainZone | undefined {
  const { x, y } = toDesign(wx, wy);
  return this.map.zones?.find((zone) => zone.kind === 'sandpit' ? sandPitContains(zone, wx, wy) : Math.abs(x - zone.x) < zone.w / 2 && Math.abs(y - zone.y) < zone.h / 2);
}

export function terrainAt(this: EnvironmentTerrainContext, wx: number, wy: number): TerrainKind | null {
  if (this.quest?.stage === QUEST.groveStage) {
    const phase = this.grovePhase();
    if (phase.active && phase.roles.includes('illusion') && this.groveIllusion === 'ice') return 'ice';
  }
  if (this.quest?.stage === QUEST.snareStage && this.snareIllusion === 'ice' && this.snareTrees.some((t) => t.grove === 'illusion' && t.alive)) return 'ice';
  const z = this.zoneAt(wx, wy);
  if (!z || z.kind === 'floor') return null;
  // Tide flats are plain ground at low tide and slow shallows when flooded.
  if (z.kind === 'tide') return this.tideState().flooded ? 'shallows' : null;
  return z.kind;
}

/** Whether the tide is in, and whether it's about to come in (for the warning). */
export function tideState(this: EnvironmentTerrainContext): { flooded: boolean; rising: boolean; k: number; } {
  const C = this.map.tideCycle;
  if (!C || this.countdown > 0) return { flooded: false, rising: false, k: 0 };
  const t = this.elapsedFight();
  const phase = Math.floor(t / C.period);
  const into = t - phase * C.period;
  // Odd phases are high tide; the water creeps in over the last `warn` seconds of low tide.
  const flooded = phase % 2 === 1;
  const rising = !flooded && into > C.period - C.warn;
  return { flooded, rising, k: rising ? (into - (C.period - C.warn)) / C.warn : flooded ? 1 : 0 };
}

export function windAt(this: EnvironmentTerrainContext, wx: number, wy: number): { x: number; y: number; } | null {
  const z = this.zoneAt(wx, wy);
  if (z?.kind === 'wind' && z.push) return z.push;
  if (z?.kind === 'sandpit') return sandPitForce(z, wx, wy);
  if (z?.kind === 'vortex' && z.pull) {
    // Drag towards the middle (harder near it) and swirl round.
    const c = toWorld(z);
    const dx = c.x - wx;
    const dy = c.y - wy;
    const d = Math.hypot(dx, dy) || 1;
    const k = z.pull * (0.6 + 0.6 * (1 - Math.min(1, d / ((z.w * S) / 2))));
    return { x: (dx / d) * k - (dy / d) * k * 0.7, y: (dy / d) * k + (dx / d) * k * 0.7 };
  }
  return null;
}

export function hazardSlow(this: EnvironmentTerrainContext, f: Fighter): number {
  let mult = 1;
  for (const c of this.caltrops) if (f.team !== c.team && Math.hypot(f.x - c.x, f.y - c.y) < c.r) mult = Math.min(mult, c.slow);
  const phase = this.quest?.stage === QUEST.groveStage ? this.grovePhase() : null;
  if (phase?.active && phase.roles.includes('illusion') && this.groveIllusion === 'heat' && f.team === 0) mult = Math.min(mult, QUEST.grove.heatSlow);
  const snareHeat = this.snareTrees.some((t) => t.grove === 'illusion' && t.alive) && this.snareIllusion === 'heat' && f.team === (this.isHell ? 1 : 0);
  if (snareHeat) mult = Math.min(mult, QUEST.snare.heatSlow);
  return mult;
}
