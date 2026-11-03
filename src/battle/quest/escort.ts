import type * as Phaser from 'phaser';
import { TOWER_RESPAWN_HP, TOWER_RESPAWN_SOUL_KEEP, QUEST } from '@/config';
import { Fighter } from '@/gameplay/Fighter';
import { sfx } from '@/audio/sfx';
import { advanceLantern } from '@/battle/quest/escortRules';
import { S, ARENA } from '@/battle/coordinates';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type QuestEscortContext = Phaser.Scene & Pick<BattleScene,
  'countdown' | 'escortRespawnT' | 'fighters' | 'freeSpot' | 'fx'
  | 'g' | 'gGlow' | 'lantern' | 'nameTags' | 'onRevived'
  | 'over' | 'paused'
>;

/** The lantern has no health. Pushing it is the only way to win or lose. */
export function damageLantern(this: QuestEscortContext, _damage: number, _attacker?: Fighter): void {
}

export function updateEscort(this: QuestEscortContext, dt: number): void {
  const lantern = this.lantern;
  if (!lantern || this.over || this.paused || this.countdown > 0) return;
  advanceLantern(lantern, this.fighters, dt);
  if (!lantern.alive || lantern.arrived || lantern.lost) return;
  const fallen = this.fighters.filter((f) => f.team === 1 && !f.alive);
  if (!fallen.length) { this.escortRespawnT = QUEST.escort.respawnEvery; return; }
  this.escortRespawnT -= dt;
  if (this.escortRespawnT > 0) return;
  for (const guard of fallen.slice(0, QUEST.reinforcementBatch)) {
    // Alternate northern/southern ambushes ahead of the lantern, with room to react.
    const side = guard.index % 2;
    const spot = this.freeSpot({ x: Math.min(ARENA.x + ARENA.w - 90, lantern.x + 240 * S), y: side ? ARENA.y + ARENA.h - 70 : ARENA.y + 70 },
      this.fighters.filter((f) => f.alive).map((f) => ({ x: f.x, y: f.y })));
    guard.revive(spot.x, spot.y, guard.maxHp * TOWER_RESPAWN_HP);
    guard.pocket.length = 0;
    guard.selectedItem = 0;
    guard.soul *= TOWER_RESPAWN_SOUL_KEEP;
    this.onRevived(guard);
    this.nameTags[guard.index]?.setVisible(true);
    this.fx.smoke(spot.x, spot.y, 12, 1);
    sfx.respawn();
  }
  this.escortRespawnT = QUEST.escort.respawnEvery;
}

export function renderLantern(this: QuestEscortContext, now: number): void {
  const lantern = this.lantern;
  if (!lantern) return;
  const { x, y, radius: r } = lantern;
  const g = this.g;
  const color = lantern.lost ? 0x647b78 : lantern.push < 0 ? 0xff967a : 0x99e7c6;
  g.fillStyle(color, 0.04).fillCircle(x, y, r);
  g.lineStyle(2, color, 0.5).strokeCircle(x, y, r);
  // The ring fills with journey progress. The lantern itself has no health.
  for (let i = 0; i < 40; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / 20;
    g.lineStyle(4, color, i / 40 < lantern.progress ? 0.9 : 0.12);
    g.lineBetween(x + Math.cos(angle) * (r - 5), y + Math.sin(angle) * (r - 5), x + Math.cos(angle) * (r + 2), y + Math.sin(angle) * (r + 2));
  }
  g.fillStyle(0x000000, 0.25).fillEllipse(x, y + 22, 62, 22);
  const bob = lantern.alive ? Math.sin(now * 3) * 3 : 8;
  const ly = y + bob;
  g.fillStyle(0x243d3c, 1).fillRoundedRect(x - 25, ly - 32, 50, 57, 7);
  g.fillStyle(color, lantern.alive ? 0.55 : 0.12).fillRoundedRect(x - 20, ly - 27, 40, 47, 5);
  g.lineStyle(3, 0xc1ae7b, 1).strokeRoundedRect(x - 25, ly - 32, 50, 57, 7);
  for (const dx of [-12, 12]) g.lineBetween(x + dx, ly - 31, x + dx, ly + 25);
  g.fillStyle(0xbfa570, 1).fillRect(x - 31, ly - 38, 62, 7).fillRect(x - 31, ly + 25, 62, 7);
  g.lineStyle(3, 0xbfa570, 1).lineBetween(x, ly - 45, x, ly - 38).lineBetween(x, ly + 32, x, ly + 44);
  if (lantern.alive) {
    this.gGlow.fillStyle(0x86e9ba, 0.07).fillCircle(x, ly - 3, 47);
    this.gGlow.fillStyle(0xffe5a1, 0.9).fillEllipse(x, ly - 4, 12 + Math.sin(now * 7) * 2, 26);
  }
}
