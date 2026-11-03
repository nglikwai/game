import type * as Phaser from 'phaser';
import type { WeaponId } from '@/gameplay/weapons';

/** Brief contact silhouettes: steel cuts, blunt shock, flame tongues, and branching charge. */
export function drawWeaponContact(g: Phaser.GameObjects.Graphics, id: WeaponId, x: number, y: number, facing: number, color: number, t: number) {
  const fire = id === 'fan' || id === 'bomb' || id === 'fire-kunai';
  const heavy = ['hammer', 'flail', 'nunchaku', 'spade'].includes(id);
  const lightning = id === 'talisman' || id === 'thunder-fan';
  const fade = (1 - t) ** 2;
  const at = (forward: number, side: number) => ({ x: x + Math.cos(facing) * forward - Math.sin(facing) * side, y: y + Math.sin(facing) * forward + Math.cos(facing) * side });
  if (heavy) {
    const r = 6 + t * 24;
    g.lineStyle(2 * (1 - t), color, fade * .65).strokeEllipse(x, y, r * 2, r * 1.1);
    for (let k = 0; k < 6; k++) {
      const a = facing + k * Math.PI / 3, d = 5 + t * 27;
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d - Math.sin(t * Math.PI) * 9;
      g.fillStyle(k % 2 ? 0x8e867c : color, .85 * (1 - t)).fillTriangle(px - 3, py + 2, px + 1, py - 4, px + 4, py + 3);
    }
  } else if (lightning) {
    for (let k = 0; k < 4; k++) {
      const a = facing + k * Math.PI / 2;
      const pts = Array.from({ length: 5 }, (_, n) => {
        const d = n * (5 + t * 4), bend = n === 0 ? 0 : (n % 2 ? 3 : -3);
        return { x: x + Math.cos(a) * d - Math.sin(a) * bend, y: y + Math.sin(a) * d + Math.cos(a) * bend };
      });
      g.lineStyle(3, 0x6f8aca, fade * .5).strokePoints(pts as Phaser.Math.Vector2[], false);
      g.lineStyle(1.2, 0xedfaff, fade).strokePoints(pts as Phaser.Math.Vector2[], false);
    }
  } else if (fire) {
    for (let k = 0; k < 5; k++) {
      const a = facing + k * Math.PI * 2 / 5, r = 5 + t * 16;
      const point = (d: number, off = 0) => ({ x: x + Math.cos(a + off) * d, y: y + Math.sin(a + off) * d });
      const pts = [point(r * .3), point(r, -.25), point(r + 11 * (1 - t)), point(r, .25)];
      g.fillStyle(k % 2 ? 0xffcc67 : 0xf57632, fade * .8).fillPoints(pts as Phaser.Math.Vector2[], true);
    }
  } else {
    // A compact bright cut stays at the actual contact point, then breaks into three steel streaks.
    const half = 12 + t * 16;
    g.fillStyle(0xf2f8ff, fade).fillPoints([at(-4, -half), at(3 * (1 - t), -2), at(4, half), at(-3 * (1 - t), 2)] as Phaser.Math.Vector2[], true);
    for (const side of [-1, 1]) {
      const start = at(side * (5 + t * 17), -half * .5), end = at(side * (10 + t * 20), half * .5);
      g.lineStyle(1, color, fade * .7).lineBetween(start.x, start.y, end.x, end.y);
    }
  }
}
