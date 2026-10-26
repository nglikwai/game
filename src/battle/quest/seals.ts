import type * as Phaser from 'phaser';
import { TOWER_RESPAWN_HP, TOWER_RESPAWN_SOUL_KEEP, QUEST } from '@/config';
import { T } from '@/i18n';
import { sfx } from '@/sfx';
import { chargeSeal } from '@/battle/quest/sealRules';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type QuestSealsContext = Phaser.Scene & Pick<BattleScene,
  'countdown' | 'fighters' | 'freeSpot' | 'fx' | 'g'
  | 'nameTags' | 'onRevived' | 'over' | 'paused' | 'quest'
  | 'sealRespawnT' | 'seals' | 'showBanner' | 'spawns'
>;

/** Seals charge only during play. Guards keep returning until all three are broken. */
export function updateSeals(this: QuestSealsContext, dt: number): void {
  if (this.quest?.stage !== QUEST.sealStage || this.over || this.paused || this.countdown > 0) return;
  this.seals.forEach((seal, i) => {
    if (chargeSeal(seal, this.fighters, dt)) {
      this.showBanner(T().sealBroken(i + 1), 0x83dfd4);
      this.fx.sparks(seal.x, seal.y, 0x83dfd4, 24);
    }
  });
  if (this.seals.every((s) => s.sealed)) return;
  const guard = this.fighters.find((f) => f.team === 1 && !f.alive);
  if (!guard) { this.sealRespawnT = QUEST.seals.respawnEvery; return; }
  this.sealRespawnT -= dt;
  if (this.sealRespawnT > 0) return;
  const spot = this.freeSpot(this.spawns[guard.index], this.fighters.filter((f) => f.alive).map((f) => ({ x: f.x, y: f.y })));
  guard.revive(spot.x, spot.y, guard.maxHp * TOWER_RESPAWN_HP);
  guard.pocket.length = 0;
  guard.selectedItem = 0;
  guard.soul *= TOWER_RESPAWN_SOUL_KEEP;
  this.onRevived(guard);
  this.nameTags[guard.index]?.setVisible(true);
  this.fx.smoke(spot.x, spot.y, 12, 1);
  sfx.respawn();
  this.sealRespawnT = QUEST.seals.respawnEvery;
}

export function renderSeals(this: QuestSealsContext, now: number): void {
  for (const seal of this.seals) {
    const { x, y, radius: r } = seal;
    const color = seal.sealed ? 0x83dfd4 : seal.contested ? 0xf28b65 : 0xe5bb6d;
    const g = this.g;
    g.fillStyle(0x151221, 0.45).fillCircle(x, y, r);
    g.fillStyle(color, seal.sealed ? 0.12 : 0.05 + Math.sin(now * 3) * 0.02).fillCircle(x, y, r - 6);
    g.lineStyle(2, color, 0.55).strokeCircle(x, y, r);
    g.lineStyle(1, color, 0.3).strokeCircle(x, y, r - 12);
    // Segments show charge without covering fighters.
    for (let k = 0; k < 32; k++) {
      const a = -Math.PI / 2 + k * Math.PI / 16;
      g.lineStyle(5, color, k / 32 < seal.progress ? 0.95 : 0.1);
      g.lineBetween(x + Math.cos(a) * (r - 5), y + Math.sin(a) * (r - 5), x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3));
    }
    if (seal.sealed) {
      g.lineStyle(5, color, 0.9).lineBetween(x - 16, y, x - 4, y + 12).lineBetween(x - 4, y + 12, x + 21, y - 16);
    } else {
      const n = seal.allies;
      for (let i = 0; i < n; i++) {
        const cx = x + (i - (n - 1) / 2) * 16;
        g.fillStyle(color, 0.95).fillCircle(cx, y, 5);
      }
    }
  }
}
