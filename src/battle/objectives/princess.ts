import * as Phaser from 'phaser';
import { QUEST, HUD_HEIGHT, PRINCESS_WALL_HP, RES, WIDTH } from '@/config';
import { T } from '@/i18n';
import { sfx } from '@/sfx';
import { ARENA as SCREEN_ARENA, type Obstacle } from '@/maps';
import { FONT, toHex } from '@/ui';
import { type PrincessWall } from '@/battle/types';
import { S, ARENA } from '@/battle/coordinates';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type ObjectivesPrincessContext = Phaser.Scene & Pick<BattleScene,
  'add' | 'endRound' | 'fighters' | 'g' | 'gGlow'
  | 'helpCalloutSpot' | 'helpTexts' | 'isHell' | 'lTop' | 'obstacleRects'
  | 'over' | 'princessText' | 'quest' | 'questClear' | 'questFail'
  | 'questTree' | 'rescueGateOpen' | 'rescueGateX' | 'shotBlockers' | 'showBanner'
  | 'sideColor' | 'time' | 'tweens' | 'updatePrincessProgress' | 'walls'
  | 'world'
>;

// ---------- Save the Princess ----------
export function configurePrincessWalls(this: ObjectivesPrincessContext): void {
  for (const wall of this.walls) {
    const members = this.fighters.filter((f) => f.team === wall.team).length;
    wall.maxHp = wall.hp = this.quest?.stage === QUEST.rescueStage
      ? QUEST.rescue.wallBase + QUEST.rescue.wallPerPlayer * members
      : PRINCESS_WALL_HP * Math.max(1, members) / 2;
  }
}

export function makeWall(this: ObjectivesPrincessContext, o: Obstacle): PrincessWall {
  // Fixed crack pattern, spread around the wall ring.
  const rand = new Phaser.Math.RandomDataGenerator(['princess-wall']);
  const cracks: { x: number; y: number }[][] = [];
  for (let i = 0; i < 10; i++) {
    const side = i % 4;
    const t = rand.frac();
    let x = side < 2 ? o.x - o.w / 2 + t * o.w : side === 2 ? o.x - o.w / 2 + 6 : o.x + o.w / 2 - 6;
    let y = side >= 2 ? o.y - o.h / 2 + t * o.h : side === 0 ? o.y - o.h / 2 + 6 : o.y + o.h / 2 - 6;
    const line = [{ x, y }];
    for (let k = 0; k < 4; k++) {
      x += rand.between(-9, 9);
      y += rand.between(-9, 9);
      line.push({ x, y });
    }
    cracks.push(line);
  }
  return { o, team: o.team ?? 0, hp: PRINCESS_WALL_HP, maxHp: PRINCESS_WALL_HP, lastHitter: null, shakeT: 0, rescued: false, cracks };
}

export function showPrincessIntro(this: ObjectivesPrincessContext): void {
  this.princessText = this.add.text(WIDTH / 2, HUD_HEIGHT + 12, '', {
    fontFamily: FONT, resolution: RES, fontSize: '17px', fontStyle: 'bold', color: '#ffd6ea',
    backgroundColor: '#141821', padding: { x: 12, y: 4 },
  }).setOrigin(0.5).setDepth(15);
  this.updatePrincessProgress();
  // The quest stage banner already states this goal, so a second copy would sit on the same line.
  if (!this.quest) {
    const banner = this.add
      .text(WIDTH / 2, SCREEN_ARENA.y + 30, T().princessGoal, { fontFamily: FONT, resolution: RES, fontSize: '26px', fontStyle: 'bold', color: '#ffd6ea', stroke: '#000000', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(15);
    this.tweens.add({ targets: banner, alpha: 0, delay: 2600, duration: 800, onComplete: () => banner.destroy() });
  }
  this.helpTexts = this.walls.map((w) => {
    const spot = this.helpCalloutSpot(w.o);
    const t = this.add
      .text(spot.x, spot.y, T().help, {
        fontFamily: FONT, resolution: RES, fontSize: '14px', fontStyle: 'bold', color: '#ffffff', backgroundColor: toHex(this.sideColor(w.team)), padding: { x: 6, y: 2 },
      })
      .setOrigin(0.5);
    this.lTop.add(t);
    this.tweens.add({ targets: t, y: t.y - 5, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
    return t;
  });
}

/**
   * "Help!" floats above the wall. On the rescue stage the upper cage sits in the
   * stage-title band, so that callout moves to the inner side of the wall instead.
   */
export function helpCalloutSpot(this: ObjectivesPrincessContext, o: Obstacle): { x: number; y: number; } {
  const above = { x: o.x, y: o.y - o.h / 2 - 34 };
  if (!this.quest) return above;
  const screenY = HUD_HEIGHT + above.y / S;
  if (screenY > SCREEN_ARENA.y + 62) return above;
  const inward = o.x / S < WIDTH / 2 ? 1 : -1;
  const screenX = o.x / S + inward * (o.w / S / 2 + 46);
  const beside = Math.max(SCREEN_ARENA.y + 78, HUD_HEIGHT + (o.y - o.h / 2) / S + 22);
  return { x: screenX * S, y: (beside - HUD_HEIGHT) * S };
}

export function updatePrincessProgress(this: ObjectivesPrincessContext): void {
  if (this.quest) {
    this.princessText?.setText(T().questRescueProgress(this.walls.filter((w) => w.rescued).length, this.walls.length));
    return;
  }
  this.princessText?.setText([0, 1].map((team) => {
    const walls = this.walls.filter((w) => w.team === team);
    return T().princessProgress(T().teamNames[team], walls.filter((w) => w.rescued).length, walls.length);
  }).join('   ·   '));
}

export function breakWall(this: ObjectivesPrincessContext, wall: PrincessWall): void {
  if (wall.rescued || this.over) return;
  wall.hp = 0;
  wall.rescued = true;
  this.world.objectives = this.walls.filter((w) => !w.rescued).map((w) => ({ team: w.team, x: w.o.x, y: w.o.y, w: w.o.w, h: w.o.h }));
  // A rescued enclosure stops blocking movement, projectiles and future spawn placement.
  wall.body?.destroy();
  if (wall.rect) {
    this.obstacleRects = this.obstacleRects.filter((r) => r !== wall.rect);
    this.shotBlockers = this.shotBlockers.filter((r) => r !== wall.rect);
  }
  this.updatePrincessProgress();
  sfx.wallBreak();
  const o = wall.o;
  this.helpTexts[this.walls.indexOf(wall)]?.destroy();
  // Rubble flying out.
  for (let i = 0; i < 26; i++) {
    const chunk = this.add
      .rectangle(o.x + Phaser.Math.Between(-40, 40), o.y + Phaser.Math.Between(-40, 40), Phaser.Math.Between(6, 13), Phaser.Math.Between(5, 10), 0x8d877a)
      .setStrokeStyle(1, 0x4f4a42)
      .setAngle(Phaser.Math.Between(0, 90));
    this.lTop.add(chunk);
    const a = Math.atan2(chunk.y - o.y, chunk.x - o.x);
    this.tweens.add({
      targets: chunk,
      x: chunk.x + Math.cos(a) * Phaser.Math.Between(40, 110),
      y: chunk.y + Math.sin(a) * Phaser.Math.Between(40, 110),
      angle: chunk.angle + Phaser.Math.Between(-180, 180),
      duration: 600,
      ease: 'Cubic.easeOut',
    });
  }
  // Hearts for the rescued princess.
  for (let i = 0; i < 8; i++) {
    const heart = this.add.text(o.x, o.y, '♥', { fontFamily: FONT, resolution: RES, fontSize: '22px', color: '#ff6fae' }).setOrigin(0.5);
    this.lTop.add(heart);
    this.tweens.add({
      targets: heart,
      x: o.x + Phaser.Math.Between(-70, 70),
      y: o.y - Phaser.Math.Between(40, 110),
      alpha: 0,
      delay: i * 120,
      duration: 1400,
    });
  }
  const teamWalls = this.walls.filter((w) => w.team === wall.team);
  if (teamWalls.every((w) => w.rescued)) {
    if (this.quest?.stage === QUEST.rescueStage) {
      this.rescueGateOpen = true;
      if (this.isHell) this.questFail();
      else if (this.questTree && !this.questTree.alive && !this.fighters.some((f) => f.team === 1 && f.alive)) this.questClear();
      else this.showBanner(T().questRescuedFight, this.sideColor(wall.team));
    }
    else this.endRound(wall.lastHitter ?? undefined, T().rescued(T().teamNames[wall.team]), this.sideColor(wall.team));
  } else {
    this.showBanner(T().princessProgress(T().teamNames[wall.team], teamWalls.filter((w) => w.rescued).length, teamWalls.length), this.sideColor(wall.team));
  }
}

/** True while the prison tree is still shut behind the princess seal. */
export function rescueTreeSealed(this: ObjectivesPrincessContext): boolean {
  return this.quest?.stage === QUEST.rescueStage && !this.rescueGateOpen
    && !(this.walls.length === 2 && this.walls.every((w) => w.rescued));
}

/** Rescuers stop at the seal. Guards on the far side can still cross it to fight. */
export function updateRescueGate(this: ObjectivesPrincessContext): void {
  if (this.quest?.stage !== QUEST.rescueStage || this.rescueGateOpen) return;
  const gate = this.rescueGateX;
  for (const f of this.fighters) {
    if (f.team !== 0 || !f.alive || f.trapped || f.x <= gate - f.radius) continue;
    if (f.body.velocity.x > 0) f.body.setVelocity(0, f.body.velocity.y);
    f.warp(gate - f.radius - 2, f.y);
  }
}

export function renderRescueGate(this: ObjectivesPrincessContext, now: number): void {
  if (this.quest?.stage !== QUEST.rescueStage || this.rescueGateOpen) return;
  const x = this.rescueGateX;
  const top = ARENA.y;
  const h = ARENA.h;
  const pulse = 0.55 + 0.45 * Math.sin(now * 3);
  this.g.fillStyle(0x2a1838, 0.55).fillRect(x - 16, top, 32, h);
  this.g.lineStyle(3, 0xc9a0e8, 0.45 + 0.35 * pulse);
  this.g.lineBetween(x - 14, top, x - 14, top + h);
  this.g.lineBetween(x + 14, top, x + 14, top + h);
  this.gGlow.fillStyle(0xb46bdc, 0.12 + 0.08 * pulse).fillRect(x - 22, top, 44, h);
  for (let i = 0; i < 8; i++) {
    const y = top + ((i + 0.5) / 8) * h;
    const sway = Math.sin(now * 2 + i) * 6;
    this.g.lineStyle(4, 0x6a4a88, 0.9).lineBetween(x - 10, y - 28, x + sway, y);
    this.g.lineStyle(2, 0xe4c6ff, 0.8).lineBetween(x + sway, y, x + 10, y + 28);
    this.g.fillStyle(0xf0d8ff, 0.7).fillCircle(x + sway, y, 4);
  }
}

export function renderWallAndPrincess(this: ObjectivesPrincessContext, g: Phaser.GameObjects.Graphics, wall: PrincessWall): void {
  const o = wall.o;
  const broken = wall.hp <= 0;
  const sx = wall.shakeT > 0 ? Phaser.Math.Between(-2, 2) : 0;
  const sy = wall.shakeT > 0 ? Phaser.Math.Between(-2, 2) : 0;
  const l = o.x - o.w / 2 + sx;
  const t = o.y - o.h / 2 + sy;
  const th = this.quest?.stage === QUEST.rescueStage ? 50 : 38;

  if (!broken) {
    // Shadow, inner floor, then the brick ring.
    g.fillStyle(0x000000, 0.35).fillRect(l + 7, t + 9, o.w, o.h);
    g.fillStyle(0x4a443b, 1).fillRect(l, t, o.w, o.h);
    g.fillStyle(0x8d877a, 1);
    g.fillRect(l, t, o.w, th).fillRect(l, t + o.h - th, o.w, th).fillRect(l, t, th, o.h).fillRect(l + o.w - th, t, th, o.h);
    // Brick joints.
    g.lineStyle(1, 0x5a554c, 1);
    for (let x = l; x <= l + o.w; x += 16) {
      g.lineBetween(x, t, x, t + th / 2);
      g.lineBetween(x + 8, t + th / 2, x + 8, t + th);
      g.lineBetween(x, t + o.h - th, x, t + o.h - th / 2);
      g.lineBetween(x + 8, t + o.h - th / 2, x + 8, t + o.h);
    }
    for (let y = t; y <= t + o.h; y += 16) {
      g.lineBetween(l, y, l + th / 2, y);
      g.lineBetween(l + th / 2, y + 8, l + th, y + 8);
      g.lineBetween(l + o.w - th, y, l + o.w - th / 2, y);
      g.lineBetween(l + o.w - th / 2, y + 8, l + o.w, y + 8);
    }
    g.lineBetween(l, t + th / 2, l + o.w, t + th / 2).lineBetween(l, t + o.h - th / 2, l + o.w, t + o.h - th / 2);
    g.lineBetween(l + th / 2, t, l + th / 2, t + o.h).lineBetween(l + o.w - th / 2, t, l + o.w - th / 2, t + o.h);
    g.lineStyle(2, 0x4f4a42, 1).strokeRect(l, t, o.w, o.h).strokeRect(l + th, t + th, o.w - th * 2, o.h - th * 2);
    // Team-coloured trim so everyone can tell whose princess this is.
    g.lineStyle(3, this.sideColor(wall.team), 1).strokeRect(l - 2, t - 2, o.w + 4, o.h + 4);

    // Cracks appear as the wall loses HP.
    const shown = Math.floor((1 - wall.hp / wall.maxHp) * (wall.cracks.length + 1));
    g.lineStyle(2, 0x2a2622, 0.9);
    wall.cracks.slice(0, shown).forEach((line) => {
      g.beginPath();
      g.moveTo(line[0].x + sx, line[0].y + sy);
      for (const p of line.slice(1)) g.lineTo(p.x + sx, p.y + sy);
      g.strokePath();
    });
  }

  // The princess.
  const bob = Math.sin(this.time.now / 300) * 1.5;
  const px = o.x;
  const py = o.y + bob;
  g.fillStyle(0x000000, 0.3).fillEllipse(px + 3, o.y + 8, 30, 14);
  g.fillStyle(0xd94f8e, 1).fillCircle(px, py, 15);
  g.fillStyle(0xff8fc4, 1).fillCircle(px, py, 12);
  g.fillStyle(0x6b3f1f, 1).fillCircle(px, py - 1, 8.5);
  g.fillStyle(0xffe0c4, 1).fillCircle(px, py + 1.5, 6);
  g.fillStyle(0xf2c94c, 1).fillTriangle(px - 6, py - 6, px - 3, py - 13, px, py - 6);
  g.fillTriangle(px - 2, py - 6, px + 1, py - 14, px + 4, py - 6);
  g.fillTriangle(px + 2, py - 6, px + 5, py - 13, px + 7, py - 6);

  if (!broken) {
    // Wall HP bar.
    const bw = 110;
    const bx = o.x - bw / 2;
    const by = o.y - o.h / 2 - 16;
    g.fillStyle(0x000000, 0.65).fillRect(bx - 2, by - 2, bw + 4, 10);
    g.fillStyle(this.sideColor(wall.team), 1).fillRect(bx, by, bw * (wall.hp / wall.maxHp), 6);
  }
}
