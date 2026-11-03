import type * as Phaser from 'phaser';
import type { Tower } from '@/battle/types';
import { mapPropKey } from '@/rendering/mapProps';

const images = new WeakMap<Tower, Phaser.GameObjects.Image>();

/** One Blender-rendered building per live objective; the battle still owns its HP and collision. */
export function renderTowerModel(scene: Phaser.Scene & { lFloor: Phaser.GameObjects.Container }, tower: Tower, x: number) {
  let image = images.get(tower);
  if (!tower.alive) { image?.setVisible(false); return false; }
  const key = mapPropKey(tower.main ? 'fortress' : 'watchtower');
  if (!scene.textures?.exists(key)) return false;
  if (!image) {
    image = scene.add.image(x, tower.y, key);
    scene.lFloor.add(image); images.set(tower, image);
  }
  image.setVisible(true).setPosition(x, tower.y - tower.h * .04).setDisplaySize(tower.w * 1.85, tower.w * 1.85);
  return true;
}

/** Team banners and progressive cracks stay crisp over the neutral roof material. */
export function drawTowerDetails(g: Phaser.GameObjects.Graphics, tower: Tower, x: number, color: number, now: number) {
  const r = tower.w * .5, y = tower.y;
  const poleX = x - r * .58, poleY = y - r * .6;
  g.lineStyle(1.7, 0xe0c28b, 1).lineBetween(poleX, poleY + r * .45, poleX, poleY - r * .4);
  const flutter = Math.sin(now * 4 + tower.team) * r * .05;
  g.fillStyle(color, .95).fillPoints([
    { x: poleX, y: poleY - r * .4 }, { x: poleX + r * .48, y: poleY - r * .34 + flutter },
    { x: poleX + r * .33, y: poleY - r * .13 + flutter }, { x: poleX, y: poleY - r * .1 },
  ] as Phaser.Math.Vector2[], true);
  g.fillStyle(color, 1).fillCircle(x, y, r * .15);
  g.lineStyle(1.3, 0xf5d595, 1).strokeCircle(x, y, r * .15);
  if (tower.main) {
    g.lineStyle(1.1, 0xf5d595, .8).strokeCircle(x, y, r * .23);
    for (const side of [-1, 1]) g.fillStyle(color, .95).fillTriangle(x + side * r * .6, y + r * .2, x + side * r * .43, y + r * .2, x + side * r * .52, y + r * .54);
  }
  const damage = 1 - Math.max(0, tower.hp / tower.maxHp);
  for (let k = 0; k < Math.floor(damage * 5); k++) {
    const a = k * 2.4 + .4, cx = x + Math.cos(a) * r * .48, cy = y + Math.sin(a) * r * .48;
    g.lineStyle(1.4, 0x17242c, .8).lineBetween(cx - 4, cy - 5, cx, cy).lineBetween(cx, cy, cx + 4, cy + 1).lineBetween(cx + 4, cy + 1, cx + 3, cy + 7);
  }
}
