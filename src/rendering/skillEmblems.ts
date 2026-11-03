import type * as Phaser from 'phaser';
import type { SkillEffect } from '@/gameplay/skills';

type Shot = Extract<SkillEffect, { kind: 'projectile' }>;

/** A brief emblem at departure identifies the technique before its projectile leaves. */
export function drawShotEmblem(g: Phaser.GameObjects.Graphics, e: Shot, x: number, y: number, facing: number, t: number, alpha: number) {
  const r = 17 + t * 12, color = e.color;
  const at = (forward: number, side = 0) => ({ x: x + Math.cos(facing) * forward - Math.sin(facing) * side, y: y + Math.sin(facing) * forward + Math.cos(facing) * side });
  if (e.boomerang) {
    g.lineStyle(2, color, alpha).strokeCircle(x, y, r).strokeCircle(x, y, r * .65);
    for (let k = 0; k < 3; k++) {
      const a = facing + k * Math.PI * 2 / 3 + t * 3;
      const p = (d: number, off = 0) => ({ x: x + Math.cos(a + off) * d, y: y + Math.sin(a + off) * d });
      g.fillStyle(color, alpha * .55).fillPoints([p(r * .7), p(r * 1.3, .2), p(r, .65)] as Phaser.Math.Vector2[], true);
    }
  } else if (e.pull) {
    const pos = at(r * .5);
    g.lineStyle(3, color, alpha).beginPath().arc(pos.x, pos.y, r * .65, facing - 2.4, facing + .8, false).strokePath();
    for (let k = 0; k < 3; k++) {
      const link = at(-k * 9);
      g.lineStyle(1.5, color, alpha).strokeEllipse(link.x, link.y, 7, 5);
    }
  } else if (e.radius > 8) {
    const shape = [at(r * 1.35), at(r * .1, -r * .55), at(-r * .65, -r * .15), at(-r * .25), at(-r * .65, r * .4), at(r * .25, r * .6)];
    g.fillStyle(0xffa449, alpha * .18).fillPoints(shape as Phaser.Math.Vector2[], true);
    g.lineStyle(2, 0xffcf87, alpha).strokePoints(shape as Phaser.Math.Vector2[], true);
    const core = [at(r * .8), at(-r * .15, -r * .2), at(0, r * .27)];
    g.lineStyle(1.5, 0xffedc3, alpha).strokePoints(core as Phaser.Math.Vector2[], true);
  } else {
    // A narrow steel crest pointing down the firing lane.
    const blade = [at(r * 1.4), at(0, -r * .3), at(-r * .4), at(0, r * .3)];
    g.fillStyle(color, alpha * .18).fillPoints(blade as Phaser.Math.Vector2[], true);
    g.lineStyle(1.5, color, alpha).strokePoints(blade as Phaser.Math.Vector2[], true);
  }
}
