import * as Phaser from 'phaser';
import { musicState } from './music';
import { HEIGHT, RES, WIDTH } from './config';
import { BattleScene } from './scenes/BattleScene';
import { LobbyScene } from './scenes/LobbyScene';
import { MapScene } from './scenes/MapScene';
import { ModeScene } from './scenes/ModeScene';
import { TitleScene } from './scenes/TitleScene';

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: Math.round(WIDTH * RES),
  height: Math.round(HEIGHT * RES),
  backgroundColor: '#0d0f14',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { debug: false } },
  input: { gamepad: true },
  scene: [TitleScene, ModeScene, MapScene, LobbyScene, BattleScene],
});

// Handy for poking at state from the browser console during development.
if (import.meta.env.DEV) Object.assign(window, { game, musicState });
