import type * as Phaser from 'phaser';
import { TOWER_RESPAWN_HP, TOWER_RESPAWN_SOUL_KEEP, QUEST } from '@/config';
import { Fighter } from '@/Fighter';
import { skillById } from '@/skills';
import { CPU_ENEMY_SKILLS, randomCpuEquipment } from '@/cpuLoadout';
import { WEAPONS } from '@/weapons';
import { T } from '@/i18n';
import { sfx } from '@/sfx';
import { BOSS_COLOR } from '@/battle/quest/roster';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type QuestBossesContext = Phaser.Scene & Pick<BattleScene,
  'bossReserves' | 'bossRespawnT' | 'countdown' | 'deathTime' | 'fighters'
  | 'freeSpot' | 'fx' | 'g' | 'gGlow' | 'hasHellPlayers'
  | 'isHell' | 'nameTags' | 'onRevived' | 'over' | 'paused'
  | 'popText' | 'quest' | 'questBossSeats' | 'questClear' | 'questFail'
  | 'refreshHudLoadout' | 'showBanner' | 'slots' | 'spawns' | 'updateWardenGrunt'
  | 'wardenGruntT' | 'wardenReviveT'
>;

export function bossTitle(this: QuestBossesContext, f: Fighter): string {
  if (this.quest?.stage === QUEST.wardenStage) return T().wardenName(this.questBossSeats.indexOf(f.index));
  if (this.quest?.stage === QUEST.dirgeStage) return T().dirgeName;
  if (this.quest?.stage === QUEST.nightStage) return T().nightBossName;
  return T().bossName;
}

export function renderWardenBond(this: QuestBossesContext, now: number): void {
  if (this.quest?.stage !== QUEST.wardenStage) return;
  const wardens = this.fighters.filter((f) => f.boss && f.team === 1);
  if (wardens.length !== 2) return;
  const [a, b] = wardens;
  if (a.alive && b.alive) {
    this.g.lineStyle(2, 0xd4b985, 0.25).lineBetween(a.x, a.y, b.x, b.y);
    for (const offset of [0, 0.5]) {
      const t = (now * 0.35 + offset) % 1;
      this.gGlow.fillStyle(0xe5d4a0, 0.65).fillCircle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 3);
    }
  } else if (this.wardenReviveT >= 0) {
    const fallen = wardens.find((f) => !f.alive)!;
    const spot = this.spawns[fallen.index];
    const progress = 1 - this.wardenReviveT / QUEST.wardens.reviveAfter;
    this.g.lineStyle(2, fallen.color, 0.6).strokeCircle(spot.x, spot.y, 48);
    this.g.fillStyle(fallen.color, 0.05 + progress * 0.1).fillCircle(spot.x, spot.y, 44);
    for (let i = 0; i < 12; i++) {
      const angle = -Math.PI / 2 + i * Math.PI / 6;
      this.g.lineStyle(5, fallen.color, i / 12 < progress ? 0.9 : 0.15);
      this.g.lineBetween(spot.x + Math.cos(angle) * 43, spot.y + Math.sin(angle) * 43, spot.x + Math.cos(angle) * 53, spot.y + Math.sin(angle) * 53);
    }
  }
}

/** The soul bond breaks only when both wardens fall before the revival window expires. */
export function updateWardens(this: QuestBossesContext, dt: number): void {
  if (this.quest?.stage !== QUEST.wardenStage || this.over || this.paused || this.countdown > 0) return;
  const wardens = this.fighters.filter((f) => f.boss && f.team === 1);
  if (wardens.length !== 2) return;
  const fallen = wardens.filter((f) => !f.alive);
  if (fallen.length === 2) { if (this.isHell) this.questFail(); else this.questClear(); return; }
  this.updateWardenGrunt(dt);
  if (!fallen.length) { this.wardenReviveT = -1; return; }
  if (this.wardenReviveT < 0) this.wardenReviveT = QUEST.wardens.reviveAfter;
  this.wardenReviveT = Math.max(0, this.wardenReviveT - dt);
  if (this.wardenReviveT > 0) return;
  const warden = fallen[0];
  const spot = this.freeSpot(this.spawns[warden.index], this.fighters.filter((f) => f.alive).map((f) => ({ x: f.x, y: f.y })));
  warden.revive(spot.x, spot.y, warden.maxHp * QUEST.wardens.reviveHp);
  warden.pocket.length = 0;
  warden.selectedItem = 0;
  warden.soul *= TOWER_RESPAWN_SOUL_KEEP;
  this.onRevived(warden);
  this.nameTags[warden.index]?.setVisible(true);
  this.fx.smoke(spot.x, spot.y, 18, 1);
  this.showBanner(T().wardenRevived, 0x93d8bf);
  sfx.respawn();
  this.wardenReviveT = -1;
}

/** The extra guard on the warden stage keeps walking back in, so the bosses are never fought alone. */
export function updateWardenGrunt(this: QuestBossesContext, dt: number): void {
  const grunt = this.fighters.find((f) => f.team === 1 && !f.boss);
  if (!grunt || grunt.alive) { this.wardenGruntT = QUEST.wardens.gruntRespawn; return; }
  this.wardenGruntT -= dt;
  if (this.wardenGruntT > 0) return;
  const spot = this.freeSpot(this.spawns[grunt.index] ?? { x: grunt.x, y: grunt.y },
    this.fighters.filter((f) => f.alive).map((f) => ({ x: f.x, y: f.y })));
  grunt.revive(spot.x, spot.y, grunt.maxHp * TOWER_RESPAWN_HP);
  grunt.pocket.length = 0;
  grunt.selectedItem = 0;
  grunt.soul *= TOWER_RESPAWN_SOUL_KEEP;
  this.onRevived(grunt);
  this.nameTags[grunt.index]?.setVisible(true);
  this.fx.smoke(spot.x, spot.y, 12, 1);
  sfx.respawn();
  this.wardenGruntT = QUEST.wardens.gruntRespawn;
}

/** Preserve the initial party-scaled enemy count, preparing extra guards off-field for later summons. */
export function prepareBossReserve(this: QuestBossesContext, f: Fighter, partySize: number): void {
  if (this.hasHellPlayers || this.quest?.stage !== QUEST.bossStage || f.index < QUEST.partySlots + 1 + Math.min(QUEST.boss.maxEnemies - 1, partySize)) return;
  this.bossReserves.add(f);
  f.hp = 0;
  f.state = 'dead';
  f.body.enable = false;
}

/** The boss trades its own HP for one guard, up to four living enemies including itself. */
export function updateBossReinforcements(this: QuestBossesContext, dt: number): void {
  if (this.quest?.stage !== QUEST.bossStage || this.over || this.paused || this.countdown > 0) return;
  const boss = this.fighters.find((f) => f.boss && f.alive);
  if (!boss) return;
  const enemies = this.fighters.filter((f) => f.team === boss.team);
  const fallen = enemies.filter((f) => !f.boss && !f.alive)
    .sort((a, b) => Number(this.bossReserves.has(a)) - Number(this.bossReserves.has(b)) || (this.deathTime.get(a) ?? 0) - (this.deathTime.get(b) ?? 0));
  if (!fallen.length || enemies.filter((f) => f.alive).length >= QUEST.boss.maxEnemies) {
    this.bossRespawnT = QUEST.boss.respawnInterval;
    return;
  }
  this.bossRespawnT = Math.max(0, this.bossRespawnT - dt);
  if (this.bossRespawnT > 0) return;
  const cost = Math.max(1, Math.round(boss.maxHp * QUEST.boss.respawnHpCost));
  if (boss.hp <= cost) return;
  const guard = fallen[0];
  const spot = this.freeSpot({ x: boss.x - 80, y: boss.y + (guard.index % 2 ? -60 : 60) }, this.fighters.filter((f) => f.alive).map((f) => ({ x: f.x, y: f.y })));
  boss.hp -= cost;
  boss.flashT = 0.15;
  if (!this.hasHellPlayers || this.slots[guard.index].control === 'cpu') {
    const gear = randomCpuEquipment('quest', guard.role.id, ['lifeline'], CPU_ENEMY_SKILLS);
    guard.weapon = WEAPONS[gear.weapon];
    guard.skills.splice(0, guard.skills.length, ...gear.skills.map(skillById));
    guard.cooldowns.length = guard.skills.length;
    this.refreshHudLoadout(guard);
  }
  guard.revive(spot.x, spot.y, guard.maxHp * TOWER_RESPAWN_HP);
  guard.pocket.length = 0;
  guard.selectedItem = 0;
  guard.soul *= TOWER_RESPAWN_SOUL_KEEP;
  this.bossReserves.delete(guard);
  this.nameTags[guard.index]?.setVisible(true);
  this.onRevived(guard);
  this.popText(boss.x, boss.y - boss.radius - 16, `-${cost} HP`, '#ff8a8a');
  this.showBanner(T().bossReinforcement, BOSS_COLOR);
  this.fx.respawnBeam(boss.x, boss.y, spot.x, spot.y, BOSS_COLOR);
  sfx.respawn();
  this.bossRespawnT = QUEST.boss.respawnInterval;
}
