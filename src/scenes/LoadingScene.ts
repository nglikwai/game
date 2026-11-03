import * as Phaser from 'phaser';
import { isQuestMode, prepareQuest, questStageNumber, QUEST, BATTLE_LOADING_HOLD_MS, BATTLE_LOADING_MS, HEIGHT, WIDTH } from '@/config';
import { questFactions } from '@/battle/quest/factions';
import { T } from '@/localization';
import { getMap } from '@/maps';
import { drawLobbyBackdrop, drawLobbyCrest } from '@/rendering/menuArt';
import { C, setupCamera, txt } from '@/ui';
import { stopMusic } from '@/audio/music';
import { sfx } from '@/audio/sfx';
import type { BattleStartData } from '@/battle/types';

/** An input-free transition into a battle or the next Quest stage. */
export class LoadingScene extends Phaser.Scene {
  private battle!: BattleStartData;
  private elapsed = 0;
  private entered = false;
  private holdElapsed: number | null = null;
  private bar!: Phaser.GameObjects.Graphics;
  private progress!: Phaser.GameObjects.Text;

  constructor() { super('Loading'); }

  init(data: BattleStartData) {
    this.battle = data;
    this.elapsed = 0;
    this.entered = false;
    this.holdElapsed = null;
  }

  create() {
    stopMusic(true);
    setupCamera(this);
    drawLobbyBackdrop(this.add.graphics());
    drawLobbyCrest(this.add.graphics(), WIDTH / 2, HEIGHT / 2 - 86, 52);
    const prepared = isQuestMode(this.battle.mode) ? prepareQuest(this.battle.quest) : null;
    const factions = questFactions(this.battle.slots, this.battle.quest?.side);
    const goals = factions.side === 'hell' ? T().hellGoals : T().questGoals;
    const map = prepared ? getMap(QUEST.maps[prepared.stage]) : null;
    txt(this, WIDTH / 2, HEIGHT / 2 + 4, this.battle.mode === 'expedition' ? T().expeditionStage : map ? T().mapName(map) : T().loadingBattle, 30, C.text, { title: true, bold: true, origin: 0.5 });
    const hint = this.battle.mode === 'expedition' ? T().expeditionGoal : prepared ? T().questStageTitle(questStageNumber(prepared.route, prepared.stage), `${factions.mixed ? `${T().questVersus} · ` : ''}${goals[prepared.stage]}`) : T().loadingBattleHint;
    txt(this, WIDTH / 2, HEIGHT / 2 + 46, hint, 16, C.dim, { origin: 0.5, wrap: 880, align: 'center' });
    this.add.graphics().fillStyle(0x243245, 1).fillRoundedRect(WIDTH / 2 - 170, HEIGHT / 2 + 90, 340, 5, 2);
    this.bar = this.add.graphics();
    this.progress = txt(this, WIDTH / 2, HEIGHT / 2 + 119, '0%', 12, C.goldHex, { origin: 0.5 });
  }

  update(_time: number, delta: number) {
    if (this.entered) return;
    if (this.holdElapsed !== null) {
      this.holdElapsed += delta;
      if (this.holdElapsed >= BATTLE_LOADING_HOLD_MS) {
        this.entered = true;
        this.scene.start('Battle', this.battle);
      }
      return;
    }
    this.elapsed = Math.min(BATTLE_LOADING_MS, this.elapsed + delta);
    const fraction = this.elapsed / BATTLE_LOADING_MS;
    this.bar.clear().fillStyle(C.gold, 1).fillRoundedRect(WIDTH / 2 - 170, HEIGHT / 2 + 90, 340 * fraction, 5, 2);
    this.progress.setText(`${Math.floor(fraction * 100)}%`);
    if (this.elapsed >= BATTLE_LOADING_MS) {
      this.holdElapsed = 0;
      sfx.battleTransition();
    }
  }
}
