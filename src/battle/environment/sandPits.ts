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
  const depth = 1 - Math.hypot(dx / (pit.w * S / 2), dy / (pit.h * S / 2));
  const pull = (pit.pull ?? 130) * (0.6 + 0.9 * depth);
  return { x: dx / distance * pull, y: dy / distance * pull };
}

/** Elliptical danger hints let both teams' CPUs steer clear of the funnels. */
export function sandPitDangers(map: GameMap) {
  return (map.zones ?? []).filter((zone) => zone.kind === 'sandpit')
    .map((pit) => ({ ...toWorld(pit), r: Math.max(pit.w, pit.h) * S / 2, rx: pit.w * S / 2, ry: pit.h * S / 2 }));
}

/** The rim chips HP without stun; the dark center swallows any living fighter immediately. */
export function updateSandPits(this: SandPitsContext, dt: number): void {
  if (this.paused || this.over || this.countdown > 0 || dt <= 0) return;
  const pits = (this.map.zones ?? []).filter((zone) => zone.kind === 'sandpit');
  for (const f of this.fighters) {
    if (!f.alive || f.trapped) continue;
    const pit = pits.find((zone) => sandPitContains(zone, f.x, f.y));
    if (!pit) continue;
    const c = toWorld(pit);
    const depth = Math.hypot((f.x - c.x) / (pit.w * S / 2), (f.y - c.y) / (pit.h * S / 2));
    if (depth <= (pit.core ?? 0.18)) {
      f.fall();
      this.fx.smoke(f.x, f.y, 18, 1.2);
      this.popText(f.x, f.y - 30, T().sandPitFall, '#e7bc83');
    } else f.takeChip((pit.dps ?? 10) * dt);
  }
}

/** Moving grains spiral toward a sharply marked black opening; there is no screen-wide effect. */
export function renderSandPits(this: SandPitsContext, now: number): void {
  for (const pit of this.map.zones ?? []) {
    if (pit.kind !== 'sandpit') continue;
    const c = toWorld(pit), rx = pit.w * S / 2, ry = pit.h * S / 2, core = pit.core ?? 0.18;
    for (let arm = 0; arm < 4; arm++) {
      const points = Array.from({ length: 24 }, (_, i) => {
        const radius = 1 - i / 24 * (1 - core);
        const angle = now * 1.3 + arm * Math.PI / 2 + i * 0.16;
        return { x: c.x + Math.cos(angle) * rx * radius, y: c.y + Math.sin(angle) * ry * radius };
      });
      this.gOver.lineStyle(2, 0xedbd7a, 0.45).strokePoints(points as Phaser.Math.Vector2[], false);
    }
    for (let i = 0; i < 14; i++) {
      const radius = 1 - (now * 0.26 + i / 14) % 1;
      const angle = i * 2.4 + now * 1.2;
      this.gGlow.fillStyle(0xf5c783, radius * 0.65).fillCircle(c.x + Math.cos(angle) * rx * radius, c.y + Math.sin(angle) * ry * radius, 1.8);
    }
    this.gOver.fillStyle(0x100b0c, 1).fillEllipse(c.x, c.y, rx * core * 2, ry * core * 2);
    this.gOver.lineStyle(2, 0x5b3020, 0.95).strokeEllipse(c.x, c.y, rx * core * 2, ry * core * 2);
  }
}
