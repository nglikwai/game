import * as Phaser from 'phaser';
import { HEIGHT, RES, WIDTH } from '@/config';
import { addArenaTexture } from '@/maps';
import { drawLobbyBackdrop, drawLobbyCrest } from '@/rendering/menuArt';
import { C, txt } from '@/ui/theme';

export function setupCamera(scene: Phaser.Scene) {
  scene.cameras.main.setOrigin(0, 0).setZoom(RES);
}

/** The courtyard art, dimmed, as a menu background. */
export function addBackdrop(scene: Phaser.Scene, dim = 0.62) {
  const key = addArenaTexture(scene);
  scene.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(WIDTH, HEIGHT);
  scene.add.rectangle(0, 0, WIDTH, HEIGHT, C.bg, dim).setOrigin(0, 0);
  drawLobbyBackdrop(scene.add.graphics());
}

/** Shared navigation header, leaving room for page-specific status at the right. */
export function addMenuHeader(scene: Phaser.Scene, title: string) {
  drawLobbyCrest(scene.add.graphics(), 55, 39, 25);
  txt(scene, 94, 30, title, 28, C.text, { title: true, bold: true, origin: [0, 0.5] });
  txt(scene, 96, 56, 'S H A D O W  &  S T E E L', 10, C.dim, { origin: [0, 0.5] });
}
