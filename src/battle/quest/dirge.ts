import type * as Phaser from 'phaser';
import { QUEST } from '@/config';
import { T } from '@/i18n';
import { sfx } from '@/sfx';
import { toWorld } from '@/battle/coordinates';
import { DIRGE_COLOR } from '@/battle/quest/roster';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type QuestDirgeContext = Phaser.Scene & Pick<BattleScene,
  'countdown' | 'dealDamage' | 'dirgeTollT' | 'dirgeWarn' | 'fighters'
  | 'g' | 'over' | 'paused' | 'quest' | 'showBanner'
>;

/** The center bell warns, then strikes everyone who is not on the Bell Oni's side. */
export function updateDirge(this: QuestDirgeContext, dt: number): void {
  if (this.countdown > 0 || this.paused || this.over) return;
  const boss = this.fighters.find((f) => f.boss && f.alive);
  if (!boss) { this.dirgeWarn = null; return; }
  if (this.dirgeWarn) {
    this.dirgeWarn.elapsed += dt;
    if (this.dirgeWarn.elapsed < QUEST.dirge.tollWarn) return;
    this.dirgeWarn = null;
    this.dirgeTollT = QUEST.dirge.tollEvery;
    const bell = toWorld(QUEST.dirge.bell);
    let struck = false;
    for (const f of this.fighters) {
      if (!f.alive || f.trapped || f.team === boss.team) continue;
      if (Math.hypot(f.x - bell.x, f.y - bell.y) > QUEST.dirge.tollRadius + f.radius) continue;
      this.dealDamage(undefined, f, QUEST.dirge.tollDamage, 0, 0, 40, 0.2, false);
      if (f.alive) f.paralyze(QUEST.dirge.tollParalyze);
      struck = true;
    }
    if (struck) this.showBanner(T().dirgeToll, DIRGE_COLOR);
    sfx.bell();
    return;
  }
  this.dirgeTollT = Math.max(0, this.dirgeTollT - dt);
  if (this.dirgeTollT > 0) return;
  this.dirgeWarn = { elapsed: 0 };
}

export function renderDirge(this: QuestDirgeContext): void {
  if (this.quest?.stage !== QUEST.dirgeStage) return;
  const bell = toWorld(QUEST.dirge.bell);
  const warn = this.dirgeWarn;
  const r = QUEST.dirge.tollRadius;
  this.g.lineStyle(2, DIRGE_COLOR, 0.35).strokeCircle(bell.x, bell.y, r);
  if (!warn) return;
  const progress = Math.min(1, warn.elapsed / QUEST.dirge.tollWarn);
  this.g.fillStyle(DIRGE_COLOR, 0.05 + progress * 0.12).fillCircle(bell.x, bell.y, r * progress);
  this.g.lineStyle(3, DIRGE_COLOR, 0.85).strokeCircle(bell.x, bell.y, r);
}
