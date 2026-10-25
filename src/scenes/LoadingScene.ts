import * as Phaser from 'phaser';
import { BATTLE_LOADING_MS, HEIGHT, WIDTH } from '../config';
import { T } from '../i18n';
import { drawLobbyBackdrop, drawLobbyCrest } from '../lobbyArt';
import { C, setupCamera, txt } from '../ui';
import type { BattleStartData } from './BattleScene';

/** An input-free transition into a battle or the next Quest stage. */
export class LoadingScene extends Phaser.Scene {
  private battle!: BattleStartData;
  private elapsed = 0;
  private entered = false;
  private bar!: Phaser.GameObjects.Graphics;
  private progress!: Phaser.GameObjects.Text;

  constructor() { super('Loading'); }

  init(data: BattleStartData) {
    this.battle = data;
    this.elapsed = 0;
    this.entered = false;
  }

  create() {
    setupCamera(this);
    drawLobbyBackdrop(this.add.graphics());
    drawLobbyCrest(this.add.graphics(), WIDTH / 2, HEIGHT / 2 - 86, 52);
    txt(this, WIDTH / 2, HEIGHT / 2 + 4, T().loadingBattle, 30, C.text, { title: true, bold: true, origin: 0.5 });
    const stage = this.battle.quest?.stage ?? 0;
    const hint = this.battle.mode === 'quest' ? T().questStageTitle(stage + 1, T().questGoals[stage]) : T().loadingBattleHint;
    txt(this, WIDTH / 2, HEIGHT / 2 + 46, hint, 14, C.dim, { origin: 0.5 });
    this.add.graphics().fillStyle(0x243245, 1).fillRoundedRect(WIDTH / 2 - 170, HEIGHT / 2 + 90, 340, 5, 2);
    this.bar = this.add.graphics();
    this.progress = txt(this, WIDTH / 2, HEIGHT / 2 + 119, '0%', 12, C.goldHex, { origin: 0.5 });
  }

  update(_time: number, delta: number) {
    if (this.entered) return;
    this.elapsed = Math.min(BATTLE_LOADING_MS, this.elapsed + delta);
    const fraction = this.elapsed / BATTLE_LOADING_MS;
    this.bar.clear().fillStyle(C.gold, 1).fillRoundedRect(WIDTH / 2 - 170, HEIGHT / 2 + 90, 340 * fraction, 5, 2);
    this.progress.setText(`${Math.floor(fraction * 100)}%`);
    if (this.elapsed >= BATTLE_LOADING_MS) {
      this.entered = true;
      this.scene.start('Battle', this.battle);
    }
  }
}
