import type { BattleScene } from '@/scenes/BattleScene';

type Context = Pick<BattleScene, 'mode' | 'over' | 'countdown' | 'fighters' | 'endRound'>;

/** A complete team wipe ends battle before a due tower respawn can undo the final KO. */
export function checkTeamElimination(this: Context): void {
  if (this.mode !== 'team' || this.over || this.countdown > 0) return;
  const alive = this.fighters.filter((f) => f.alive);
  if (alive.some((f) => f.team === 0) && alive.some((f) => f.team === 1)) return;
  this.endRound(alive[0]);
}
