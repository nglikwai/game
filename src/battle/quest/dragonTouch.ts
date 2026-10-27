import { QUEST } from '@/config';
import { Fighter } from '@/gameplay/Fighter';
import { S } from '@/battle/coordinates';
import type { BattleScene } from '@/scenes/BattleScene';

type Part = { x: number; y: number; r: number };

/** How long until each fighter can be hurt by touching a dragon again (s). */
const cooldowns = new WeakMap<Fighter, number>();

/** Anyone touching one of a dragon's `parts` (circles, world px) is hurt and knocked away from it. */
export function dragonTouch(this: Pick<BattleScene, 'dealDamage'>, parts: readonly Part[], targets: readonly Fighter[], dt: number): void {
  const spec = QUEST.dragonTouch;
  for (const t of targets) {
    const left = (cooldowns.get(t) ?? 0) - dt;
    cooldowns.set(t, left);
    if (left > 0) continue;
    const part = parts.find((p) => Math.hypot(t.x - p.x, t.y - p.y) <= p.r + t.radius + spec.reach * S);
    if (!part) continue;
    cooldowns.set(t, spec.cooldown);
    const dx = t.x - part.x;
    const dy = t.y - part.y;
    const d = Math.hypot(dx, dy) || 1;
    this.dealDamage(undefined, t, spec.damage, dx / d, dy / d, spec.knockback, spec.hitstun, false);
  }
}
