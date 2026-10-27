import * as Phaser from 'phaser';
import { HEIGHT, HUD_HEIGHT, RES, WIDTH } from '@/config';
import { Fighter } from '@/gameplay/Fighter';
import { rayAngles } from '@/gameplay/weapons';
import { sfx } from '@/audio/sfx';
import { ARENA as SCREEN_ARENA } from '@/maps';
import { type Pose } from '@/rendering/fighterArt';
import { FONT, Petals, toHex, txt } from '@/ui';
import { S, toWorld, ARENA } from '@/battle/coordinates';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type PresentationEffectsContext = Phaser.Scene & Pick<BattleScene,
  'add' | 'fighters' | 'fx' | 'lTop' | 'logs'
  | 'map' | 'onSummonStart' | 'petals' | 'prevStates' | 'projectiles'
  | 'terrainAt' | 'time' | 'tweens' | 'weaponFx'
>;

/** The map's ambient particles (petals, leaves, snow) and, on the courtyard, incense smoke. */
export function startAmbience(this: PresentationEffectsContext): void {
  if (this.map.fireworks) this.time.addEvent({
    delay: 1400,
    loop: true,
    callback: () => {
      const x = ARENA.x + 60 + Math.random() * (ARENA.w - 120);
      const y = ARENA.y + 40 + Math.random() * (ARENA.h - 80);
      this.fx.firework(x, y, [0xff6a8a, 0xffd23a, 0x6ad8ff, 0xa8ff6a, 0xc88aff][Math.floor(Math.random() * 5)]);
      sfx.firework();
    },
  });
  const smoke = this.map.smokeFrom && toWorld(this.map.smokeFrom);
  if (smoke) this.time.addEvent({
    delay: 260,
    loop: true,
    callback: () => {
      const puff = this.add
        .circle(smoke.x + Phaser.Math.Between(-8, 8), smoke.y + Phaser.Math.Between(-6, 6), 5, 0xd8d4cc, 0.28);
      this.lTop.add(puff);
      this.tweens.add({
        targets: puff,
        x: puff.x + Phaser.Math.Between(-30, 30),
        y: puff.y - Phaser.Math.Between(50, 80),
        scale: 4,
        alpha: 0,
        duration: 2600,
        onComplete: () => puff.destroy(),
      });
    },
  });
  const counts = { petals: 16, leaves: 16, snow: 40, fireflies: 24, embers: 30, dust: 30, mist: 10, wisps: 14, maple: 16, rain: 70, spores: 26 };
  this.petals = new Petals(this, ARENA, Math.round(counts[this.map.particles] * S * S), 6, this.map.particles, this.lTop);
}

/** Spot state changes (strike, death, revive, dash) to fire effects, and tick particles. */
export function updateFx(this: PresentationEffectsContext, dt: number): void {
  for (const f of this.fighters) {
    const prev = this.prevStates[f.index];
    const now = f.state;
    if (prev !== now) {
      if (now === 'active') this.weaponFx(f);
      if (now === 'dead') {
        this.fx.smoke(f.x, f.y, 22, 1.3);
        this.logs.set(f, { x: f.x, y: f.y, a: Math.random() * Math.PI });
      }
      if (prev === 'dead') {
        this.fx.smoke(f.x, f.y, 18, 1.1);
        this.logs.delete(f);
      }
      if (now === 'dash') this.fx.smoke(f.x, f.y, 6, 0.6);
      if (now === 'casting' && f.summoning) this.onSummonStart(f);
    }
    this.prevStates[f.index] = now;
    if (f.alive && f.powered && Math.random() < 0.5) this.fx.ember(f.x, f.y);
    if (f.state === 'channel' && Math.random() < 0.3) this.fx.leaf(f.x, f.y);
    if (f.alive && f.hp < f.maxHp && this.terrainAt(f.x, f.y) === 'spring' && Math.random() < 0.08) this.fx.leaf(f.x, f.y);
    if (f.alive && this.terrainAt(f.x, f.y) === 'poison' && Math.random() < 0.12) this.fx.sparks(f.x, f.y, 0x9aff6a, 1);
  }
  for (const p of this.projectiles) if (p.effect.radius > 8) this.fx.fireTrail(p.x, p.y, p.effect.radius);
  this.fx.update(dt);
}

/** The strike effect for each weapon, matching its hit shape. */
export function weaponFx(this: PresentationEffectsContext, f: Fighter): void {
  const s = f.weapon.shape;
  switch (f.weapon.id) {
    case 'fan':
      if (s.kind === 'sector') this.fx.flameFan(f.x, f.y, f.facing, s.radius, s.angle);
      break;
    case 'thunder-fan':
      if (s.kind === 'sector') this.fx.thunderFan(f.x, f.y, f.facing, s.radius, s.angle);
      sfx.thunderFan();
      break;
    case 'shuriken':
      if (s.kind === 'rect') this.fx.shurikenThrow(f.x, f.y, f.facing, s.offset, s.offset + s.length, f.color);
      break;
    case 'hammer':
      if (s.kind === 'circle') this.fx.hammerSmash(f.x + Math.cos(f.facing) * s.offset, f.y + Math.sin(f.facing) * s.offset, s.radius);
      break;
    case 'daggers':
      if (s.kind === 'rect') this.fx.daggerSlash(f.x, f.y, f.facing, s.offset + s.length, s.width, f.color);
      break;
    case 'flail':
      if (s.kind === 'ring') this.fx.chainSpin(() => ({ x: f.x, y: f.y }), f.facing, s.inner, s.outer);
      break;
    case 'kusarigama':
      if (s.kind === 'arc') this.fx.sickleSweep(() => ({ x: f.x, y: f.y }), f.facing, s.inner, s.outer, s.angle);
      break;
    case 'ninjato':
      if (s.kind === 'rect') this.fx.lungeSlash(() => ({ x: f.x, y: f.y }), f.facing, s.offset + s.length, s.width);
      break;
    case 'yari':
      if (s.kind === 'rect') this.fx.spearThrust(f.x, f.y, f.facing, s.offset, s.length, s.width, f.color);
      break;
    case 'nunchaku':
      if (s.kind === 'wings') this.fx.nunchakuWhirl(() => ({ x: f.x, y: f.y }), f.facing, s.radius, s.angle);
      break;
    case 'whip':
      if (s.kind === 'wave') this.fx.whipLash(() => ({ x: f.x, y: f.y }), f.facing, s);
      break;
    case 'talisman':
      if (s.kind === 'cross') this.fx.lightningCross(f.x, f.y, f.facing, s.arm, s.width);
      sfx.thunder();
      break;
    case 'staff':
      if (s.kind === 'twin') this.fx.staffSweep(() => ({ x: f.x, y: f.y }), f.facing, s.length, s.width);
      sfx.iceStaff();
      break;
    case 'kunai':
      if (s.kind === 'rays') this.fx.kunaiVolley(f.x, f.y, rayAngles(s, f.facing), s.offset, s.offset + s.length, f.color);
      break;
    case 'fire-kunai':
      if (s.kind === 'rays') this.fx.fireKunai(f.x, f.y, rayAngles(s, f.facing), s.offset, s.offset + s.length);
      break;
    case 'bomb':
      if (s.kind === 'circle') this.fx.bombBlast(f.x + Math.cos(f.facing) * s.offset, f.y + Math.sin(f.facing) * s.offset, s.radius);
      break;
  }
}

export function poseOf(this: PresentationEffectsContext, f: Fighter): Pose {
  let phase: Pose['phase'] = 'idle';
  let t = 0;
  if (f.state === 'windup') {
    phase = 'windup';
    t = f.stateProgress;
  } else if (f.state === 'active') {
    phase = 'strike';
    t = f.stateProgress * 0.25;
  } else if (f.state === 'recovery') {
    phase = 'strike';
    t = 0.25 + f.stateProgress * 0.75;
  }
  const sh = f.weapon.shape;
  const reach = sh.kind === 'circle' ? sh.offset : undefined;
  return { x: f.x, y: f.y, facing: f.facing, phase, t, color: f.color, time: this.time.now / 1000, reach };
}

/** Two headband tails streaming from the knot at the back of the head. */
export function drawScarf(this: PresentationEffectsContext, g: Phaser.GameObjects.Graphics, f: Fighter, now: number): void {
  const speed = Math.hypot(f.vx, f.vy);
  const back = speed > 20 ? Math.atan2(-f.vy, -f.vx) : f.facing + Math.PI;
  const kx = f.x + Math.cos(f.facing + Math.PI) * 6;
  const ky = f.y + Math.sin(f.facing + Math.PI) * 6;
  const len = 14 + Math.min(14, speed * 0.05);
  for (const side of [-1, 1]) {
    const pts: { x: number; y: number }[] = [];
    for (let k = 0; k <= 5; k++) {
      const d = (len * k) / 5;
      const wave = Math.sin(now * 14 + k * 0.9 + side) * (1 + k * 0.7) + side * k * 0.9;
      pts.push({
        x: kx + Math.cos(back) * d - Math.sin(back) * wave,
        y: ky + Math.sin(back) * d + Math.cos(back) * wave,
      });
    }
    g.lineStyle(4, 0x000000, 0.35).strokePoints(pts as Phaser.Math.Vector2[], false);
    g.lineStyle(2.6, f.color, 1).strokePoints(pts as Phaser.Math.Vector2[], false);
  }
}

/** A quick full-battlefield colour flash. */
export function screenFlash(this: PresentationEffectsContext, color: number, alpha: number): void {
  const fl = this.add.rectangle(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT, color, alpha).setOrigin(0, 0).setDepth(14);
  this.tweens.add({ targets: fl, alpha: 0, duration: 260, onComplete: () => fl.destroy() });
}

/** Short message across the top of the arena. */
export function showBanner(this: PresentationEffectsContext, msg: string, color?: number): void {
  const banner = txt(this, WIDTH / 2, SCREEN_ARENA.y + 34, msg, 26, color !== undefined ? toHex(color) : '#ffd6ea', {
    title: true, bold: true, origin: 0.5, stroke: '#000000', strokeThickness: 5, depth: 15,
  });
  this.tweens.add({ targets: banner, alpha: 0, delay: 2200, duration: 700, onComplete: () => banner.destroy() });
}

export function popText(this: PresentationEffectsContext, x: number, y: number, text: string, color: string): void {
  const t = this.add
    .text(x, y, text, { fontFamily: FONT, resolution: RES, fontSize: '21px', fontStyle: 'bold', color, stroke: '#000000', strokeThickness: 3 })
    .setOrigin(0.5);
  this.lTop.add(t);
  this.tweens.add({ targets: t, y: y - 32, alpha: 0, duration: 650, onComplete: () => t.destroy() });
}
