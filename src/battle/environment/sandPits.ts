import type { GameMap, TerrainZone } from '@/maps/common';
import { S, toWorld } from '@/battle/coordinates';
import { T } from '@/localization';
import type { BattleScene } from '@/scenes/BattleScene';
import type * as Phaser from 'phaser';

type SandPitsContext = Pick<BattleScene, 'map' | 'fighters' | 'paused' | 'over' | 'countdown' | 'gOver' | 'gGlow' | 'fx' | 'popText'>;

/** Elliptical bounds match the artwork after each stage's randomized layout stretches it. */
export function sandPitContains(pit: TerrainZone, x: number, y: number, padding = 0): boolean {
  if (pit.kind !== 'sandpit') return false;
  const c = toWorld(pit);
  return Math.hypot((x - c.x) / (pit.w * S / 2 + padding), (y - c.y) / (pit.h * S / 2 + padding)) <= 1;
}

export function sandPitForce(pit: TerrainZone, x: number, y: number): { x: number; y: number } | null {
  if (!sandPitContains(pit, x, y)) return null;
  const c = toWorld(pit);
  const dx = c.x - x, dy = c.y - y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-9) return { x: 0, y: 0 };
  // Gentle at the wide rim, hard near the core.
  const depth = 1 - Math.hypot(dx / (pit.w * S / 2), dy / (pit.h * S / 2));
  const pull = (pit.pull ?? 130) * (0.3 + 1.2 * depth * depth);
  return { x: dx / distance * pull, y: dy / distance * pull };
}

/** The fatal core: a small circle sized from the pit's shorter radius. */
export function sandPitCore(pit: TerrainZone): number {
  return Math.min(pit.w, pit.h) * S / 2 * (pit.core ?? 0.18);
}

/** Elliptical danger hints let both teams' CPUs fight on the sand but keep out of each pit's deep middle. */
export function sandPitDangers(map: GameMap) {
  return (map.zones ?? []).filter((zone) => zone.kind === 'sandpit').map((pit) => {
    const avoid = pit.avoid ?? 1;
    return { ...toWorld(pit), r: Math.max(pit.w, pit.h) * S / 2 * avoid, rx: pit.w * S / 2 * avoid, ry: pit.h * S / 2 * avoid };
  });
}

/** The sand chips HP without stun (harder deeper in); the dark center swallows any living fighter immediately. */
export function updateSandPits(this: SandPitsContext, dt: number): void {
  if (this.paused || this.over || this.countdown > 0 || dt <= 0) return;
  const pits = (this.map.zones ?? []).filter((zone) => zone.kind === 'sandpit');
  for (const f of this.fighters) {
    if (!f.alive || f.trapped) continue;
    const pit = pits.find((zone) => sandPitContains(zone, f.x, f.y));
    if (!pit) continue;
    const c = toWorld(pit);
    if (Math.hypot(f.x - c.x, f.y - c.y) <= sandPitCore(pit)) {
      f.fall();
      this.fx.smoke(f.x, f.y, 18, 1.2);
      this.popText(f.x, f.y - 30, T().sandPitFall, '#e7bc83');
    } else {
      const depth = 1 - Math.hypot((f.x - c.x) / (pit.w * S / 2), (f.y - c.y) / (pit.h * S / 2));
      f.takeChip((pit.dps ?? 10) * (0.3 + 0.7 * depth) * dt);
    }
  }
}

/** Glowing embers spiral toward a sharply marked black opening; there is no screen-wide effect. */
export function renderSandPits(this: SandPitsContext, now: number): void {
  for (const pit of this.map.zones ?? []) {
    if (pit.kind !== 'sandpit') continue;
    const c = toWorld(pit), rx = pit.w * S / 2, ry = pit.h * S / 2, coreR = sandPitCore(pit), core = coreR / Math.max(rx, ry);
    for (let arm = 0; arm < 5; arm++) {
      const points = Array.from({ length: 32 }, (_, i) => {
        const radius = 1 - i / 32 * (1 - core);
        const angle = now * 1.1 + arm * Math.PI * 2 / 5 + i * 0.15;
        return { x: c.x + Math.cos(angle) * rx * radius, y: c.y + Math.sin(angle) * ry * radius };
      });
      this.gOver.lineStyle(2, 0xff6a2a, 0.35).strokePoints(points as Phaser.Math.Vector2[], false);
    }
    for (let i = 0; i < 28; i++) {
      const radius = 1 - (now * 0.22 + i / 28) % 1;
      const angle = i * 2.4 + now * 1.2;
      this.gGlow.fillStyle(radius < 0.4 ? 0xffd27a : 0xff6a2a, 0.25 + (1 - radius) * 0.5).fillCircle(c.x + Math.cos(angle) * rx * radius, c.y + Math.sin(angle) * ry * radius, 2);
    }
    const throb = 0.5 + 0.5 * Math.sin(now * 4);
    this.gGlow.fillStyle(0xff3a12, 0.25 + throb * 0.2).fillCircle(c.x, c.y, coreR + 8);
    this.gOver.fillStyle(0x060203, 1).fillCircle(c.x, c.y, coreR);
    this.gOver.lineStyle(2, 0xff5a24, 0.95).strokeCircle(c.x, c.y, coreR);
  }
}
