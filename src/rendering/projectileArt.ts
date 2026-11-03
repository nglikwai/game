import type * as Phaser from 'phaser';
import type { Projectile } from '@/battle/types';
import type { Fx } from '@/rendering/effects';
import { kunai } from '@/rendering/fighterArt';

export type ProjectileStyle = 'fire' | 'ice' | 'thunder' | 'chakram' | 'hook' | 'steel';

/** Resolve the material of the visible projectile body. */
export function projectileStyle(p: Projectile): ProjectileStyle {
  if (p.element) return p.element;
  if (p.effect.boomerang) return 'chakram';
  if (p.effect.pull) return 'hook';
  return p.effect.radius > 8 ? 'fire' : 'steel';
}

/** Self-contained moving silhouettes; drawing never spawns effects or changes a projectile. */
export function drawProjectile(over: Phaser.GameObjects.Graphics, glow: Phaser.GameObjects.Graphics, p: Projectile, now: number, fx: Fx) {
  const style = projectileStyle(p), r = p.radius;
  const a = Math.atan2(p.vy, p.vx), c = Math.cos(a), s = Math.sin(a);
  const at = (forward: number, side = 0) => ({ x: p.x + c * forward - s * side, y: p.y + s * forward + c * side });
  if (style === 'ice') {
    const blade = [at(16), at(-5, -r * .7), at(-12), at(-5, r * .7)];
    over.fillStyle(0x80c3e4, 1).fillPoints(blade as Phaser.Math.Vector2[], true);
    over.fillStyle(0xedfcff, 1).fillPoints([blade[0]!, blade[1]!, at(-6)] as Phaser.Math.Vector2[], true);
    glow.lineStyle(1.2, 0xc7f4ff, .85).lineBetween(p.x - c * 8, p.y - s * 8, p.x + c * 16, p.y + s * 16);
  } else if (style === 'thunder') {
    // Lightning crackles around the bolt itself, without a trailing path.
    const pts = Array.from({ length: 7 }, (_, k) => {
      const a = k * Math.PI / 3 + now * 12;
      return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
    });
    glow.lineStyle(1.5, 0xf0edff, .85).strokePoints(pts as Phaser.Math.Vector2[], true);
    glow.fillStyle(0xbca3ff, .28).fillCircle(p.x, p.y, r * 1.2);
    over.fillStyle(0xf8f4ff, 1).fillPoints([at(r), at(0, -r * .55), at(-r * .6), at(0, r * .55)] as Phaser.Math.Vector2[], true);
  } else if (style === 'chakram') {
    fx.drawChakram(over, p.x, p.y, r, now * 24);
    const glint = { x: p.x + Math.cos(now * 24) * r, y: p.y + Math.sin(now * 24) * r };
    glow.fillStyle(0xf1ffff, .8).fillCircle(glint.x, glint.y, 1.6);
  } else if (style === 'hook') {
    if (p.owner) fx.drawChain(over, p.owner.x, p.owner.y, p.x, p.y, 1);
    const neck = at(-3);
    over.lineStyle(5, 0x27323f, 1).beginPath().arc(neck.x, neck.y, 7, a - 2.2, a + .4, false).strokePath();
    over.lineStyle(2.5, 0xe0eaf4, 1).beginPath().arc(neck.x, neck.y, 7, a - 2.2, a + .4, false).strokePath();
    const tip = at(7), left = at(0, -4), right = at(0, 4);
    over.fillStyle(0xeff8ff, 1).fillTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
    over.fillStyle(0xb44c43, 1).fillCircle(neck.x, neck.y, 2);
  } else if (style === 'fire') {
    // Flame tongues stay around the hot core.
    for (let k = 0; k < 3; k++) {
      const side = (k - 1) * r * .5, bend = Math.sin(now * 22 + k * 2) * r * .25;
      const pts = [at(-r * (1 + k * .12), side + bend), at(-r * .6, side - r * .45), at(r * .8), at(-r * .6, side + r * .45)];
      over.fillStyle(k === 1 ? 0xffd071 : 0xf47732, .8).fillPoints(pts as Phaser.Math.Vector2[], true);
    }
    glow.fillStyle(0xffb33f, .3).fillCircle(p.x, p.y, r * 1.2);
    over.fillStyle(0xffefb5, 1).fillEllipse(p.x, p.y, r * 1.1, r * 1.1);
    const tip = at(r * .25);
    glow.fillStyle(0xfff7d8, .9).fillCircle(tip.x, tip.y, r * .3);
  } else {
    kunai(over, p.x - c * 6, p.y - s * 6, a, 14);
  }
}
