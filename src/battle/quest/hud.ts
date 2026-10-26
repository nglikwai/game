import type * as Phaser from 'phaser';
import { questStageNumber, QUEST, HEIGHT, WIDTH } from '@/config';
import { T } from '@/i18n';
import { ARENA as SCREEN_ARENA } from '@/maps';
import { txt } from '@/ui';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type QuestHudContext = Phaser.Scene & Pick<BattleScene,
  'add' | 'bossBar' | 'bossName' | 'countdown' | 'dirgeTollT'
  | 'dirgeWarn' | 'fighters' | 'groveIllusion' | 'grovePhase' | 'groveTrees'
  | 'isHell' | 'lantern' | 'nightCandles' | 'quest' | 'questGoal'
  | 'questText' | 'questTree' | 'seals' | 'showBanner' | 'snareTrees'
  | 'towers' | 'walls' | 'wardenReviveT' | 'wave'
>;

export function createQuestHud(this: QuestHudContext): void {
  const q = this.quest!;
  this.showBanner(T().questStageTitle(questStageNumber(q.route ?? [], q.stage), this.questGoal(q.stage)), 0xf2c94c);
  this.questText = txt(this, SCREEN_ARENA.x + 12, HEIGHT - 14, '', 15, '#ffe9b0', { bold: true, origin: [0, 1], stroke: '#000000', strokeThickness: 4, depth: 15 });
  if (this.fighters.some((f) => f.boss)) {
    this.bossBar = this.add.graphics().setDepth(15);
    this.bossName = txt(this, WIDTH / 2, HEIGHT - 40, `${T().bossTag}・${q.stage === QUEST.wardenStage ? T().wardensTitle : q.stage === QUEST.dirgeStage ? T().dirgeName : q.stage === QUEST.nightStage ? T().nightBossName : T().bossName}`, 16, '#ff8a8a', { title: true, bold: true, origin: [0.5, 1], stroke: '#000000', strokeThickness: 4, depth: 16 });
  }
}

/** Goal line in the corner, and the boss's big HP bar. */
export function renderQuestHud(this: QuestHudContext): void {
  const q = this.quest!;
  const foes = this.fighters.filter((f) => f.team === 1);
  const left = foes.filter((f) => f.alive).length;
  const stageNo = T().questStage(questStageNumber(q.route ?? [], q.stage));
  const grove = q.stage === QUEST.groveStage ? this.grovePhase() : null;
  const candles = q.stage === QUEST.nightStage ? ` · ${T().nightCandles(this.nightCandles.filter((c) => c.lit).length)}` : '';
  const status = this.isHell
    ? `${stageNo}  ${T().hellStatus(this.fighters.filter((f) => f.team === 0 && f.alive).length)}${q.stage === 0 ? ` · ${T().questWaveOf(this.wave, QUEST.waves)}` : q.stage === QUEST.wardenStage && this.wardenReviveT >= 0 ? ` · ${Math.ceil(this.wardenReviveT)}s` : ''}${candles}`
    : q.stage === 0
    ? `${stageNo}  ${T().questWaveOf(this.wave, QUEST.waves)} · ${T().questLeft(left)}`
    : q.stage === 1
      ? `${stageNo}  ${T().questTowersLeft(this.towers.filter((tw) => tw.team === 1 && tw.alive).length)}`
      : q.stage === QUEST.nightStage
        ? `${stageNo}  ${T().questLeft(left)}${candles}`
      : q.stage === QUEST.rescueStage
        ? `${stageNo}  ${T().questRescueProgress(this.walls.filter((w) => w.rescued).length, this.walls.length)} · ${T().questLeft(left)} · ${T().questTreeState(!!this.questTree?.alive)}`
        : q.stage === QUEST.groveStage
          ? `${stageNo}  ${T().groveTreesLeft(this.groveTrees.filter((t) => t.alive).length)} · ${T().questLeft(left)}${this.countdown > 0 || !grove ? '' : ` · ${grove.active ? T().groveDuty(grove.roles, this.groveIllusion) : T().groveRest(Math.ceil(grove.restLeft))}`}`
          : q.stage === QUEST.snareStage
            ? `${stageNo}  ${T().snareStatus(this.snareTrees.filter((t) => t.alive).length, this.fighters.filter((f) => f.trapped).length)} · ${T().questLeft(left)}`
          : q.stage === QUEST.sealStage
            ? `${stageNo}  ${T().sealProgress(this.seals.filter((s) => s.sealed).length, this.seals.length)}`
            : q.stage === QUEST.escortStage && this.lantern
              ? `${stageNo}  ${T().escortProgress(Math.floor(this.lantern.progress * 100), this.lantern.push)}`
              : q.stage === QUEST.wardenStage
                ? `${stageNo}  ${T().wardenStatus(this.wardenReviveT < 0 ? -1 : Math.ceil(this.wardenReviveT))}`
                : q.stage === QUEST.dirgeStage
                  ? `${stageNo}  ${T().dirgeStatus(this.dirgeWarn ? -1 : Math.ceil(this.dirgeTollT))}`
                : `${stageNo}  ${T().questBossHint}`;
  if (this.questText && this.questText.text !== status) this.questText.setText(status);
  const boss = (q.stage === QUEST.nightStage ? this.fighters : foes).find((f) => f.boss);
  if (boss && this.bossBar) {
    const w = 460;
    const x = WIDTH / 2 - w / 2;
    const y = HEIGHT - 36;
    const g = this.bossBar;
    g.clear();
    g.fillStyle(0x000000, 0.6).fillRoundedRect(x - 4, y - 4, w + 8, 18, 5);
    g.fillStyle(0x3a0c10, 1).fillRect(x, y, w, 10);
    if (q.stage === QUEST.wardenStage) {
      const wardens = foes.filter((f) => f.boss);
      wardens.forEach((f, i) => {
        const bx = x + i * (w / 2 + 3), bw = w / 2 - 3;
        g.fillStyle(f.color, 1).fillRect(bx, y, bw * Math.max(0, f.hp) / f.maxHp, 10);
        g.lineStyle(1, f.color, 0.8).strokeRect(bx, y, bw, 10);
      });
    } else g.fillStyle(0xe5484d, 1).fillRect(x, y, w * Math.max(0, boss.hp) / boss.maxHp, 10);
    g.lineStyle(1.5, 0xd9ae4a, 1).strokeRect(x, y, w, 10);
  }
}
