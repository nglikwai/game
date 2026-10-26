import * as Phaser from 'phaser';
import { BIG_CHEST_HP, BIG_CHEST_ITEMS, CHEST_HP, QUEST_MAX_CHESTS, maxRandomChests, randomChestInterval, EMPTY_CHEST_CHANCE } from '@/config';
import { AIController } from '@/controls';
import { Fighter } from '@/Fighter';
import { rollItem } from '@/items';
import { T } from '@/i18n';
import { sfx } from '@/sfx';
import { drawItemIcon } from '@/art';
import { distanceToEscortPath } from '@/battle/quest/escortRules';
import { type Chest } from '@/battle/types';
import { ARENA } from '@/battle/coordinates';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type ObjectivesChestsContext = Phaser.Scene & Pick<BattleScene,
  'add' | 'addChest' | 'chestTimer' | 'chests' | 'dropRandomChest'
  | 'fighters' | 'fx' | 'gGlow' | 'lTop' | 'lantern'
  | 'mode' | 'obstacleRects' | 'physics' | 'popText' | 'quest'
  | 'seals' | 'time' | 'tweens'
>;

// ---------- treasure chests ----------
export function addChest(this: ObjectivesChestsContext, x: number, y: number, age: number, big: boolean, emptyChance: number, random = false): void {
  const w = big ? 52 : 34;
  const h = big ? 40 : 28;
  const maxHp = big ? BIG_CHEST_HP : CHEST_HP;
  const body = this.physics.add.staticBody(x - w / 2, y - h / 2, w, h);
  // Quest CPUs walk through chests. Players still have to go around or break them.
  const collider = this.physics.add.collider(this.fighters.map((f) => f.body), body, undefined, (a, b) => {
    if (!this.quest) return true;
    return !this.fighters.some((f) => (f.body === a || f.body === b) && f.controller instanceof AIController);
  });
  this.chests.push({ x, y, w, h, hp: maxHp, maxHp, shakeT: 0, age, body, collider, big, empty: !big && Math.random() < emptyChance, random });
}

/** Every so often a chest drops into a random open spot (the more fighters, the more often). */
export function updateRandomChests(this: ObjectivesChestsContext, dt: number): void {
  const n = this.fighters.length;
  this.chestTimer -= dt;
  if (this.chestTimer > 0) return;
  this.chestTimer = randomChestInterval(n);
  if (this.quest ? this.chests.length >= QUEST_MAX_CHESTS : this.chests.filter((c) => c.random).length >= maxRandomChests(n)) return;
  // Starts just below zero so the landing sound plays as it touches down.
  this.dropRandomChest(-0.01);
}

export function dropRandomChest(this: ObjectivesChestsContext, age: number): void {
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = Phaser.Math.Between(ARENA.x + 50, ARENA.x + ARENA.w - 50);
    const y = Phaser.Math.Between(ARENA.y + 50, ARENA.y + ARENA.h - 50);
    const blocked = this.obstacleRects.some((o) => x > o.x - 40 && x < o.right + 40 && y > o.y - 40 && y < o.bottom + 40);
    const crowded = this.fighters.some((f) => f.alive && Math.hypot(f.x - x, f.y - y) < 80);
    const nearChest = this.chests.some((c) => Math.hypot(c.x - x, c.y - y) < 80);
    const nearSeal = this.seals.some((s) => Math.hypot(s.x - x, s.y - y) < s.radius + 40);
    const onEscortRoad = this.lantern && distanceToEscortPath({ x, y }, this.lantern.path) < this.lantern.radius + 40;
    if (blocked || crowded || nearChest || nearSeal || onEscortRoad) continue;
    this.addChest(x, y, age, false, EMPTY_CHEST_CHANCE, true);
    this.fx.sparks(x, y, 0xffd86b, 8);
    return;
  }
}

export function openChest(this: ObjectivesChestsContext, c: Chest, f: Fighter): void {
  this.chests.splice(this.chests.indexOf(c), 1);
  c.collider.destroy();
  c.body.destroy();
  if (c.empty) {
    sfx.chestEmpty();
    this.fx.smoke(c.x, c.y, 10, 0.8);
    this.popText(c.x, c.y - 28, T().emptyChest, '#b8b2a6');
    return;
  }
  sfx.chestOpen();
  // A second, overlapping chime so a big chest sounds richer.
  if (c.big) this.time.delayedCall(160, () => sfx.chestOpen());
  const count = c.big ? BIG_CHEST_ITEMS : 1;
  for (let n = 0; n < count; n++) {
    const item = rollItem(this.mode !== 'ffa');
    const kept = f.receiveItem(item);
    this.popText(c.x, c.y - 28 - n * 20, `${T().itemName(item)}${kept ? '' : `  ${T().usedNow}`}`, '#f2c94c');
    // Item icon pops out of the chest, then flies to whoever opened it.
    const icon = this.add.container(c.x, c.y);
    this.lTop.add(icon);
    const ig = this.add.graphics();
    ig.fillStyle(0x000000, 0.45).fillCircle(0, 0, 16);
    ig.lineStyle(2, 0xd9ae4a, 1).strokeCircle(0, 0, 16);
    drawItemIcon(ig, item.id, 0, 0, 24);
    icon.add(ig);
    const spread = count > 1 ? (n - (count - 1) / 2) * 34 : 0;
    this.tweens.add({ targets: icon, x: c.x + spread, y: c.y - 40, duration: 260, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: icon, x: f.x, y: f.y, scale: 0.4, alpha: 0, delay: 380 + n * 160, duration: 320, ease: 'Quad.easeIn', onComplete: () => icon.destroy() });
  }
  this.fx.sparks(c.x, c.y, 0xffd86b, c.big ? 16 : 6);
  this.fx.smoke(c.x, c.y, c.big ? 14 : 8, c.big ? 1 : 0.7);
  for (let i = 0; i < (c.big ? 18 : 10); i++) {
    const spark = this.add.circle(c.x, c.y, 2.5, 0xffd86b);
    this.lTop.add(spark);
    const a = Math.random() * Math.PI * 2;
    this.tweens.add({ targets: spark, x: c.x + Math.cos(a) * 40, y: c.y + Math.sin(a) * 40, alpha: 0, duration: 500, onComplete: () => spark.destroy() });
  }
}

export function renderChest(this: ObjectivesChestsContext, g: Phaser.GameObjects.Graphics, c: Chest): void {
  // Drops in from above during its first 0.3s (age starts negative while it waits its turn).
  if (c.age < 0) return;
  const drop = Math.max(0, 1 - c.age / 0.3);
  const sx = c.shakeT > 0 ? Phaser.Math.Between(-2, 2) : 0;
  const x = c.x - c.w / 2 + sx;
  const y = c.y - c.h / 2 - drop * drop * 60;
  g.fillStyle(0x000000, 0.3 * (1 - drop)).fillEllipse(c.x + 3, c.y + c.h / 2, c.w + 6, 10);
  // Body and lid: plain wood, or red lacquer for a big chest.
  const [body, lid, edge] = c.big ? [0x7d1f17, 0xa8302a, 0x3a0d08] : [0x7a4a22, 0x9a6230, 0x3d2410];
  const band = c.big ? 6 : 4;
  g.fillStyle(body, 1).fillRect(x, y, c.w, c.h);
  g.fillStyle(lid, 1).fillRect(x, y, c.w, c.h * 0.42);
  g.lineStyle(c.big ? 2 : 1, edge, 1).strokeRect(x, y, c.w, c.h).lineBetween(x, y + c.h * 0.42, x + c.w, y + c.h * 0.42);
  // Gold bands and lock.
  g.fillStyle(0xd9ae4a, 1).fillRect(x + 5, y, band, c.h).fillRect(x + c.w - 5 - band, y, band, c.h);
  const lock = c.big ? 12 : 8;
  g.fillRect(c.x + sx - lock / 2, y + c.h * 0.42 - lock / 2, lock, lock + 1);
  g.fillStyle(edge, 1).fillRect(c.x + sx - 1, y + c.h * 0.42, 2, 3);
  if (c.big) {
    // Gold corner caps and a soft golden glow.
    g.fillStyle(0xd9ae4a, 1);
    for (const [cx, cy] of [[x, y], [x + c.w - 7, y], [x, y + c.h - 7], [x + c.w - 7, y + c.h - 7]]) g.fillRect(cx, cy, 7, 7);
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 300);
    this.gGlow.fillStyle(0xffc04a, 0.08 + pulse * 0.08).fillCircle(c.x, c.y, c.w * 0.9);
  }
  // Twinkle so chests catch the eye.
  const tw = (this.time.now / 700 + c.x) % 1;
  if (tw < 0.25) g.fillStyle(0xfff3c4, 1 - tw * 4).fillCircle(x + c.w - 4, y + 3, 2.5);
  if (c.hp < c.maxHp) {
    const bw = c.w + 2;
    g.fillStyle(0x000000, 0.6).fillRect(c.x - bw / 2, y - 9, bw, 5);
    g.fillStyle(0xd9ae4a, 1).fillRect(c.x - bw / 2 + 1, y - 8, (bw - 2) * Math.max(0, c.hp / c.maxHp), 3);
  }
}
