import * as Phaser from 'phaser';
import { QUEST } from '@/config';
import { Fighter } from '@/gameplay/Fighter';
import { T } from '@/localization';
import { sfx } from '@/audio/sfx';
import { layoutPoint } from '@/maps/layout';
import { toHex } from '@/ui';
import { type DragonCast, type DragonElement, type Projectile, type Tower } from '@/battle/types';
import { S, toWorld } from '@/battle/coordinates';
import { TOWER_ARROW } from '@/battle/objectives/towerConfig';
import { aimFollows, DRAGON_COLORS, dragonInterval, dragonStep, nextDragonHead, resolveElementHit, turnToward } from '@/battle/quest/dragonRules';
import { dragonTouch } from '@/battle/quest/dragonTouch';
import { renderDragonBeam, startDragonBeam, updateDragonBeam } from '@/battle/quest/dragonBeams';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type QuestDragonContext = Phaser.Scene & Pick<BattleScene,
  'map' | 'countdown' | 'dealDamage' | 'dragonBody' | 'dragonCast' | 'dragonChains' | 'dragonEmberT' | 'dragonHeads' | 'dragonLast'
  | 'dragonShots' | 'dragonT' | 'fighters' | 'fx' | 'g' | 'gGlow' | 'gOver' | 'obstacleRects' | 'over' | 'paused' | 'physics'
  | 'dragonBursts' | 'dragonGuardT' | 'freeSpot' | 'onRevived' | 'popText' | 'projectiles' | 'quest' | 'showBanner' | 'towers'
  | 'applyDragonHit' | 'chests' | 'dragonBeam' | 'shotBlockers'
>;

/** The dragon is always on the Quest's enemy side (team 1), whoever is playing it. */
export const DRAGON_TEAM = 1;

/** Who the dragon may shoot at: anyone alive on the other side who can be touched. */
const dragonTargets = (fighters: Fighter[]) => fighters.filter((f) => f.alive && f.team !== DRAGON_TEAM && !f.untouchable && !f.trapped);

const nearest = (from: { x: number; y: number }, list: Fighter[]) =>
  list.reduce<Fighter | null>((a, b) => (!a || Math.hypot(b.x - from.x, b.y - from.y) < Math.hypot(a.x - from.x, a.y - from.y) ? b : a), null);

/** A solid, immovable box that follows the dragon (fighters bump into it). */
function movingBox(this: QuestDragonContext, x: number, y: number, w: number, h: number) {
  const body = this.physics.add.body(x - w / 2, y - h / 2, w, h);
  body.setImmovable(true);
  const collider = this.physics.add.collider(this.fighters.map((f) => f.body), body);
  return { body, collider };
}

/**
 * A point on the dragon, given `along` its facing (forward is positive) and to its `side` (in the frame where,
 * facing left, positive side is down). The head offsets in the config are written for facing left.
 */
function onBody(b: { x: number; y: number; facing: number }, along: number, side: number): { x: number; y: number } {
  const c = Math.cos(b.facing);
  const s = Math.sin(b.facing);
  return { x: b.x + c * along + s * side, y: b.y + s * along - c * side };
}

/** Where each head sits on the body right now. */
function headSpot(this: QuestDragonContext, element: DragonElement): { x: number; y: number } {
  const b = this.dragonBody!;
  const h = QUEST.dragon.heads.find((x) => x.element === element)!;
  return onBody(b, -h.dx * S, h.dy * S);
}

/** The dragon's body and its three heads. Each head is its own target with its own HP. */
export function placeDragon(this: QuestDragonContext, partySize: number): void {
  const d = QUEST.dragon;
  const p = toWorld(layoutPoint(this.map, d.start));
  const w = d.body.w * S;
  const h = d.body.h * S;
  // The body turns, so its solid box is a square about as wide as the body is thick.
  const box = movingBox.call(this, p.x, p.y, h, h);
  this.dragonBody = { x: p.x, y: p.y, w, h, ...box, alive: true, facing: Math.PI, vx: 0, vy: 0, stride: 0 };
  const hp = d.hpBase + d.hpPerPlayer * partySize;
  const size = d.headSize * S;
  this.dragonHeads = d.heads.map((spec) => {
    const at = headSpot.call(this, spec.element);
    const { body, collider } = movingBox.call(this, at.x, at.y, size, size);
    const rect = new Phaser.Geom.Rectangle(at.x - size / 2, at.y - size / 2, size, size);
    this.obstacleRects.push(rect);
    const head: Tower = {
      team: DRAGON_TEAM, main: false, dragon: spec.element, x: at.x, y: at.y, w: size, h: size, hp, maxHp: hp, alive: true, shakeT: 0,
      body, collider, rect, range: 0, fireInterval: 1, reload: 0, aura: 0, arrow: TOWER_ARROW,
    };
    this.towers.push(head);
    return head;
  });
  this.dragonT = d.initialDelay;
  this.dragonLast = null;
  this.dragonCast = null;
  this.dragonBeam = null;
  this.dragonShots = [];
  this.dragonGuardT = d.guardRespawn;
}

/** Move the dragon a step and carry its heads (and their solid boxes) with it. */
function walkDragon(this: QuestDragonContext, dt: number): void {
  const b = this.dragonBody!;
  const d = QUEST.dragon;
  const lo = toWorld(layoutPoint(this.map, { x: d.roam.minX, y: d.roam.minY }));
  const hi = toWorld(layoutPoint(this.map, { x: d.roam.maxX, y: d.roam.maxY }));
  const target = nearest(b, dragonTargets(this.fighters));
  const step = dragonStep(b, target, d.keepRange * S, d.speed, dt, { minX: lo.x, maxX: hi.x, minY: lo.y, maxY: hi.y });
  b.x = step.x;
  b.y = step.y;
  b.vx = step.vx;
  b.vy = step.vy;
  b.stride += Math.hypot(step.vx, step.vy) * dt;
  // Turn, gradually, to face the fighter it is watching.
  if (target) b.facing = turnToward(b.facing, Math.atan2(target.y - b.y, target.x - b.x), d.turnRate * dt);
  b.body.reset(b.x - b.h / 2, b.y - b.h / 2);
  for (const head of this.dragonHeads) {
    if (!head.alive) continue;
    const at = headSpot.call(this, head.dragon!);
    head.x = at.x;
    head.y = at.y;
    head.rect.x = at.x - head.w / 2;
    head.rect.y = at.y - head.h / 2;
    (head.body as Phaser.Physics.Arcade.Body).reset(head.rect.x, head.rect.y);
  }
}

/** The dragon walks, the heads take turns taking aim and firing; burning fighters also smoulder. */
export function updateDragon(this: QuestDragonContext, dt: number): void {
  this.dragonChains = this.dragonChains.filter((c) => (c.t -= dt) > 0);
  this.dragonBursts = this.dragonBursts.filter((c) => (c.t -= dt) > 0);
  this.dragonEmberT -= dt;
  if (this.dragonEmberT <= 0) {
    this.dragonEmberT = 0.12;
    for (const f of this.fighters) if (f.alive && f.burnT > 0) this.fx.ember(f.x + Phaser.Math.Between(-8, 8), f.y + Phaser.Math.Between(-6, 6));
  }
  const body = this.dragonBody;
  if (!body?.alive || this.countdown > 0 || this.paused || this.over) return;
  const alive = this.dragonHeads.filter((h) => h.alive);
  if (alive.length === 0) {
    // The last head has fallen: the dragon collapses.
    body.alive = false;
    body.collider.destroy();
    body.body.destroy();
    this.fx.smoke(body.x, body.y, 30, 2);
    this.dragonCast = null;
    this.dragonBeam = null;
    this.dragonShots = [];
    return;
  }
  walkDragon.call(this, dt);
  dragonTouch.call(this, [{ x: body.x, y: body.y, r: body.h / 2 }, ...alive.map((h) => ({ x: h.x, y: h.y, r: h.w / 2 }))], dragonTargets(this.fighters), dt);
  callGuard.call(this, dt);
  if (this.dragonBeam) { updateDragonBeam.call(this, dt); return; }
  const targets = dragonTargets(this.fighters);

  // Follow-up ice shards, re-aimed at their target when they fire.
  for (const shot of this.dragonShots) shot.t -= dt;
  for (const shot of this.dragonShots.filter((s) => s.t <= 0)) {
    if (shot.head.alive && shot.target.alive) fireShot.call(this, shot.element, shot.head, Math.atan2(shot.target.y - shot.head.y, shot.target.x - shot.head.x));
  }
  this.dragonShots = this.dragonShots.filter((s) => s.t > 0);

  const cast = this.dragonCast;
  if (cast) {
    if (!cast.head.alive) { this.dragonCast = null; return; }
    cast.elapsed += dt;
    // The aim follows its target, then holds still for the last moment so it can be dodged.
    if (cast.target.alive && aimFollows(cast.elapsed, cast.warn, cast.lock)) cast.angle = Math.atan2(cast.target.y - cast.head.y, cast.target.x - cast.head.x);
    if (cast.elapsed < cast.warn) return;
    this.dragonCast = null;
    this.dragonT = dragonInterval(alive.length, this.fighters.some((f) => f.alive && f.team === DRAGON_TEAM));
    release.call(this, cast);
    return;
  }
  this.dragonT -= dt;
  if (this.dragonT > 0 || targets.length === 0) return;
  const element = nextDragonHead(alive.map((h) => h.dragon!), this.dragonLast);
  const head = alive.find((h) => h.dragon === element);
  if (!element || !head) return;
  const target = targets[Math.floor(Math.random() * targets.length)]!;
  const spec = QUEST.dragon[element];
  const beam = Math.random() < QUEST.dragon.beam.chance;
  const warn = beam ? QUEST.dragon.beam.warn : spec.warn;
  this.dragonLast = element;
  this.dragonCast = { element, head, target, beam, elapsed: 0, warn, lock: beam ? warn : spec.lock, angle: Math.atan2(target.y - head.y, target.x - head.x) };
  if (!beam) this.popText(head.x, head.y - head.h / 2 - 26, T().dragonAttack[element], toHex(DRAGON_COLORS[element]));
  sfx.summonCharge(element === 'fire' ? 'soulFire' : element === 'thunder' ? 'soulThunder' : 'soulTree', warn);
}

/** While the dragon lives, a fallen guard comes back beside it now and then, up to four standing. */
function callGuard(this: QuestDragonContext, dt: number): void {
  const d = QUEST.dragon;
  this.dragonGuardT -= dt;
  if (this.dragonGuardT > 0) return;
  this.dragonGuardT = d.guardRespawn;
  const guards = this.fighters.filter((f) => f.team === DRAGON_TEAM && !f.boss);
  const fallen = guards.find((f) => !f.alive);
  if (!fallen || guards.filter((f) => f.alive).length >= d.maxGuards) return;
  const b = this.dragonBody!;
  const taken = this.fighters.filter((f) => f.alive).map((f) => ({ x: f.x, y: f.y }));
  const spot = this.freeSpot(onBody(b, b.w * 0.2, b.h * 0.9), taken);
  fallen.revive(spot.x, spot.y);
  fallen.pocket.length = 0;
  this.onRevived(fallen);
  this.fx.respawnBeam(b.x, b.y, spot.x, spot.y, DRAGON_COLORS.fire);
  this.fx.smoke(spot.x, spot.y, 12, 1);
  this.popText(spot.x, spot.y - 40, T().dragonGuardBack, '#ffb08a');
  sfx.respawn();
}

/** The aimed attack goes off: three fireballs, an ice shard (and one more shortly after), or one lightning bolt. */
function release(this: QuestDragonContext, cast: DragonCast): void {
  const d = QUEST.dragon;
  this.fx.summonPulse(() => ({ x: cast.head.x, y: cast.head.y }), DRAGON_COLORS[cast.element], 0.14);
  if (cast.beam) { startDragonBeam.call(this, cast); return; }
  if (cast.element === 'fire') {
    sfx.fireball();
    for (let k = 0; k < d.fire.shots; k++) fireShot.call(this, 'fire', cast.head, cast.angle + (k - (d.fire.shots - 1) / 2) * d.fire.spread);
    return;
  }
  if (cast.element === 'ice') {
    sfx.iceStaff();
    fireShot.call(this, 'ice', cast.head, cast.angle);
    for (let k = 1; k < d.ice.shots; k++) this.dragonShots.push({ t: d.ice.gap * k, element: 'ice', head: cast.head, target: cast.target });
    return;
  }
  sfx.thunder();
  fireShot.call(this, 'thunder', cast.head, cast.angle);
}

/** One projectile from a head's mouth, flying along `angle`. */
function fireShot(this: QuestDragonContext, element: DragonElement, head: Tower, angle: number): void {
  const spec = QUEST.dragon[element];
  // Start clear of the head's box, whichever way the shot leaves.
  const start = head.w * 0.75 + spec.radius;
  const shot: Projectile = {
    team: DRAGON_TEAM, dead: false, traveled: 0, radius: spec.radius, element,
    x: head.x + Math.cos(angle) * start, y: head.y + Math.sin(angle) * start,
    vx: Math.cos(angle) * spec.speed, vy: Math.sin(angle) * spec.speed,
    effect: { kind: 'projectile', speed: spec.speed, radius: spec.radius, damage: spec.damage, knockback: element === 'fire' ? 160 : 60, hitstun: 0.15, range: spec.range, color: DRAGON_COLORS[element] },
  };
  this.projectiles.push(shot);
}

/**
 * A dragon's shot bursts where it lands: every fighter on the other side within its blast takes its element.
 * A lightning burst still jumps from each fighter it hits to their nearest teammate.
 */
export function dragonBlast(this: QuestDragonContext, p: Projectile): void {
  const element = p.element!;
  const r = (p.blast ?? QUEST.dragon[element].blast) * S;
  if (element === 'fire') { this.fx.bombBlast(p.x, p.y, r); sfx.explosion(); }
  else if (element === 'ice') { this.fx.frostBurst(p.x, p.y); this.fx.frostBurst(p.x + r * 0.4, p.y - r * 0.3); sfx.iceCrack(); }
  else { this.fx.skyBolt(p.x, p.y); sfx.skyThunder(); }
  this.dragonBursts.push({ x: p.x, y: p.y, r, element, t: 0.4 });
  const caught = dragonTargets(this.fighters).filter((t) => t.team !== p.team && Math.hypot(t.x - p.x, t.y - p.y) <= r + t.radius);
  for (const t of caught) applyDragonHit.call(this, t, element, p, 1, caught);
}

/**
 * A dragon's shot landing on a fighter: damage plus its element. Fire melts ice; frost conducts lightning;
 * a lightning bolt jumps to the nearest teammate of whoever it hit. `scale` multiplies the damage (the wyverns hit harder).
 */
export function applyDragonHit(this: QuestDragonContext, t: Fighter, element: DragonElement, from: { x: number; y: number }, share = 1, alreadyHit: Fighter[] = [], beam = false, scale = 1): void {
  const d = QUEST.dragon;
  const o = resolveElementHit(element, { frostT: t.frostT, frozen: t.frozen }, share);
  o.damage *= scale;
  if (beam) {
    o.damage *= d.beam.damageScale;
    if (o.freeze) o.freeze = Math.min(o.freeze, d.beam.maxControl);
    if (o.paralyze) o.paralyze = Math.min(o.paralyze, d.beam.maxControl);
    if (o.peDrain) o.peDrain = Math.min(o.peDrain, d.beam.peDrain);
  }
  const tag = (text: string, color: number) => this.popText(t.x, t.y - 44, text, toHex(color));
  if (o.melt && t.melt()) tag(T().elementTag.melt, DRAGON_COLORS.fire);
  const dx = t.x - from.x;
  const dy = t.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  this.dealDamage(undefined, t, o.damage, dx / dist, dy / dist, beam ? 0 : element === 'fire' ? 160 : element === 'ice' ? 60 : 0, beam ? 0 : 0.15, false);
  if (element === 'fire') this.fx.hitSpark(t.x, t.y, DRAGON_COLORS.fire);
  else if (element === 'ice') { this.fx.frostBurst(t.x, t.y); sfx.iceCrack(); }
  else this.fx.sparks(t.x, t.y, DRAGON_COLORS.thunder, 12);
  if (!t.alive) return;
  if (o.burn) { t.burn(o.burn); tag(T().elementTag.burn, DRAGON_COLORS.fire); }
  if (o.freeze) { t.frostbite(o.frost ?? 0); t.freeze(o.freeze); t.chillT = Math.max(t.chillT, o.freeze); tag(T().elementTag.freeze, DRAGON_COLORS.ice); }
  else if (o.frost) { t.frostbite(o.frost); tag(T().elementTag.frost, DRAGON_COLORS.ice); }
  if (o.paralyze) {
    t.paralyze(o.paralyze);
    t.pe = Math.max(0, t.pe - (o.peDrain ?? 0));
    tag(o.conduct ? T().elementTag.conduct : T().elementTag.shock, DRAGON_COLORS.thunder);
  }
  // A full bolt (not a chain) jumps once more.
  if (element !== 'thunder' || share < 1 || beam) return;
  const next = dragonTargets(this.fighters)
    .filter((o2) => o2 !== t && !alreadyHit.includes(o2) && Math.hypot(o2.x - t.x, o2.y - t.y) <= d.thunder.chainRange * S)
    .sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0];
  if (!next) return;
  this.dragonChains.push({ x1: t.x, y1: t.y, x2: next.x, y2: next.y, t: 0.35 });
  applyDragonHit.call(this, next, 'thunder', t, d.thunder.chainShare);
}

/** Lightning jumping between teammates, the element bursts, and the glow of the head about to shoot. The body is drawn with the heads. */
export function renderDragon(this: QuestDragonContext, now: number): void {
  if (this.quest?.stage !== QUEST.dragonStage) return;
  renderDragonBeam.call(this, now);
  for (const c of this.dragonChains) {
    this.gGlow.lineStyle(4, DRAGON_COLORS.thunder, Math.min(1, c.t * 3)).lineBetween(c.x1, c.y1, c.x2, c.y2);
    this.gGlow.lineStyle(1.5, 0xffffff, Math.min(1, c.t * 3)).lineBetween(c.x1, c.y1, c.x2, c.y2);
  }
  for (const burst of this.dragonBursts) {
    const k = 1 - burst.t / 0.4;
    this.gGlow.fillStyle(DRAGON_COLORS[burst.element], 0.3 * (1 - k)).fillCircle(burst.x, burst.y, burst.r * (0.6 + 0.4 * k));
    this.gGlow.lineStyle(3, DRAGON_COLORS[burst.element], 0.8 * (1 - k)).strokeCircle(burst.x, burst.y, burst.r);
  }
  const cast = this.dragonCast;
  if (!cast || !cast.head.alive) return;
  const color = DRAGON_COLORS[cast.element];
  const p = Math.min(1, cast.elapsed / cast.warn);
  const head = cast.head;
  this.gGlow.fillStyle(color, 0.15 + 0.25 * p).fillCircle(head.x, head.y, head.w * (0.7 + 0.2 * Math.sin(now * 18)));
}

/** The body's hide: near-black scales, a warmer back, bone spines and dark-red wing membranes. */
const HIDE = { dark: 0x1b1315, base: 0x2e2124, mid: 0x43302f, scale: 0x5a3f38, spine: 0x9a6a46, bone: 0xe0d2b4, membrane: 0x5a2226, membraneHi: 0x7c3330 };

/** Each head's own look: skin, the plate down its snout, its horns and its eyes. */
const HEAD_LOOK: Record<DragonElement, { skin: number; plate: number; horn: number; edge: number; eye: number }> = {
  fire: { skin: 0x7a2616, plate: 0xd8582a, horn: 0x47201a, edge: 0xffa04a, eye: 0xffe27a },
  ice: { skin: 0x2c5873, plate: 0xa6dcf2, horn: 0xeafcff, edge: 0x7cc4e6, eye: 0xdcfbff },
  thunder: { skin: 0x3b2868, plate: 0x9474e6, horn: 0xffd84a, edge: 0xfff2a0, eye: 0xfff6a8 },
};

const vec = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

/** A local frame at (cx, cy) turned to `angle`: `f` is forward, `sd` is to the side. */
function frame(cx: number, cy: number, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return (f: number, sd: number) => vec(cx + c * f - s * sd, cy + s * f + c * sd);
}

/** A shape that is the same on both sides: `half` runs from the front tip to the back, on one side. */
function mirrored(at: (f: number, sd: number) => Phaser.Math.Vector2, half: readonly (readonly [number, number])[], k: number) {
  return [...half.map(([f, sd]) => at(f * k, sd * k)), ...[...half].reverse().map(([f, sd]) => at(f * k, -sd * k))];
}

/** Points around an ellipse turned to `angle` (Phaser's own ellipses can't be rotated). */
function ellipse(cx: number, cy: number, rx: number, ry: number, angle: number, n = 24): Phaser.Math.Vector2[] {
  const at = frame(cx, cy, angle);
  return Array.from({ length: n }, (_, k) => {
    const t = (k / n) * Math.PI * 2;
    return at(Math.cos(t) * rx, Math.sin(t) * ry);
  });
}

/** A heavy scaled body with half-spread bat wings, four clawed legs and a swinging spade tail, turned to face its way. */
function drawBody(this: QuestDragonContext, b: { x: number; y: number; w: number; h: number; facing: number; stride: number }, now: number): void {
  const g = this.g;
  const over = this.gOver;
  const { w, h, facing, stride } = b;
  const at = (along: number, side: number) => {
    const p = onBody(b, along, side);
    return vec(p.x, p.y);
  };
  g.fillStyle(0x000000, 0.3).fillPoints(ellipse(b.x + 10, b.y + 14, w * 0.62, h * 0.6, facing), true);

  // Tail: tapering scaled segments that swing from side to side, ending in a spade.
  const swish = Math.sin(now * 1.4);
  const tail = new Phaser.Curves.CubicBezier(at(-w * 0.38, 0), at(-w * 0.66, swish * h * 0.35), at(-w * 0.92, -swish * h * 0.2), at(-w * 1.12, Math.sin(now * 1.4 + 1.2) * h * 0.42));
  const tp = tail.getPoints(18);
  tp.forEach((p, k) => g.fillStyle(HIDE.dark, 1).fillCircle(p.x, p.y, h * (0.22 - 0.16 * (k / (tp.length - 1)))));
  tp.forEach((p, k) => g.fillStyle(HIDE.base, 1).fillCircle(p.x, p.y, h * (0.17 - 0.13 * (k / (tp.length - 1)))));
  tp.forEach((p, k) => { if (k % 2 === 0 && k < tp.length - 2) g.fillStyle(HIDE.spine, 1).fillCircle(p.x, p.y, h * (0.06 - 0.04 * (k / tp.length))); });
  const tip = tp[tp.length - 1]!;
  const pre = tp[tp.length - 3]!;
  const spade = frame(tip.x, tip.y, Math.atan2(tip.y - pre.y, tip.x - pre.x));
  g.fillStyle(HIDE.membrane, 1).fillPoints([spade(h * 0.26, 0), spade(h * 0.02, h * 0.15), spade(-h * 0.06, 0), spade(h * 0.02, -h * 0.15)], true);
  g.lineStyle(2, HIDE.membraneHi, 1).lineBetween(spade(-h * 0.04, 0).x, spade(-h * 0.04, 0).y, spade(h * 0.22, 0).x, spade(h * 0.22, 0).y);

  // Legs: a thick limb to a clawed foot that steps with the stride.
  for (const [lx, side, phase] of [[0.24, -1, 0], [-0.24, -1, Math.PI], [0.24, 1, Math.PI], [-0.24, 1, 0]] as const) {
    const step = Math.sin(stride / 22 + phase) * w * 0.06;
    const hip = at(lx * w, side * h * 0.3);
    const fx = lx * w + step + w * 0.04;
    const foot = at(fx, side * h * 0.58);
    g.lineStyle(h * 0.2, HIDE.dark, 1).lineBetween(hip.x, hip.y, foot.x, foot.y);
    g.lineStyle(h * 0.12, HIDE.base, 1).lineBetween(hip.x, hip.y, foot.x, foot.y);
    g.fillStyle(HIDE.dark, 1).fillCircle(foot.x, foot.y, h * 0.11);
    for (const toe of [-1, 0, 1]) {
      const c0 = at(fx + h * 0.06, side * h * 0.58 + toe * h * 0.06);
      const c1 = at(fx + h * 0.18, side * h * 0.58 + toe * h * 0.1);
      g.lineStyle(3, HIDE.bone, 1).lineBetween(c0.x, c0.y, c1.x, c1.y);
    }
  }

  // Wings: an arm, three finger bones and a scalloped membrane, half spread and breathing.
  const flap = 1 + 0.07 * Math.sin(now * 2.2);
  for (const side of [-1, 1]) {
    const shoulder = at(w * 0.12, side * h * 0.26);
    const elbow = at(-w * 0.02, side * h * 0.92 * flap);
    const wrist = at(-w * 0.26, side * h * 1.08 * flap);
    const tips = [at(-w * 0.5, side * h * 1.0 * flap), at(-w * 0.6, side * h * 0.64 * flap), at(-w * 0.5, side * h * 0.3)];
    const root = at(-w * 0.28, side * h * 0.16);
    const sag = (a: Phaser.Math.Vector2, c: Phaser.Math.Vector2) => vec((a.x + c.x) / 2 + (wrist.x - (a.x + c.x) / 2) * 0.28, (a.y + c.y) / 2 + (wrist.y - (a.y + c.y) / 2) * 0.28);
    const membrane = [shoulder, elbow, wrist, tips[0]!, sag(tips[0]!, tips[1]!), tips[1]!, sag(tips[1]!, tips[2]!), tips[2]!, root];
    over.fillStyle(HIDE.membrane, 0.96).fillPoints(membrane, true);
    over.fillStyle(HIDE.membraneHi, 0.5).fillTriangle(shoulder.x, shoulder.y, elbow.x, elbow.y, wrist.x, wrist.y);
    for (const t of tips) over.lineStyle(2.5, HIDE.dark, 1).lineBetween(wrist.x, wrist.y, t.x, t.y);
    over.lineStyle(6, HIDE.dark, 1).lineBetween(shoulder.x, shoulder.y, elbow.x, elbow.y);
    over.lineStyle(5, HIDE.dark, 1).lineBetween(elbow.x, elbow.y, wrist.x, wrist.y);
    over.fillStyle(HIDE.bone, 1).fillCircle(elbow.x, elbow.y, 3.5);
  }

  // Torso: dark scales, a warmer back with rows of scales, and a ridge of bone spines down the middle.
  const chest = at(w * 0.27, 0);
  over.fillStyle(HIDE.dark, 1).fillPoints(ellipse(chest.x, chest.y, w * 0.2, h * 0.4, facing), true);
  over.fillStyle(HIDE.dark, 1).fillPoints(ellipse(b.x, b.y, w * 0.5, h * 0.46, facing), true);
  over.fillStyle(HIDE.base, 1).fillPoints(ellipse(b.x, b.y, w * 0.46, h * 0.4, facing), true);
  over.fillStyle(HIDE.base, 1).fillPoints(ellipse(chest.x, chest.y, w * 0.17, h * 0.34, facing), true);
  const back = at(w * 0.02, 0);
  over.fillStyle(HIDE.mid, 1).fillPoints(ellipse(back.x, back.y, w * 0.38, h * 0.24, facing), true);
  for (let row = -2; row <= 2; row++) {
    for (let k = -4; k <= 4; k++) {
      const a = k * w * 0.09 + (row & 1) * w * 0.045;
      const sd = row * h * 0.11;
      if ((a / (w * 0.44)) ** 2 + (sd / (h * 0.36)) ** 2 > 0.85) continue;
      const p = at(a, sd);
      over.fillStyle(HIDE.scale, 0.55).fillCircle(p.x, p.y, h * 0.035);
    }
  }
  for (let k = 0; k < 7; k++) {
    const a = w * 0.32 - k * w * 0.11;
    const size = h * (0.07 + 0.03 * Math.sin((k / 6) * Math.PI));
    const l = at(a + size * 0.6, -size * 0.7);
    const r = at(a + size * 0.6, size * 0.7);
    const t = at(a - size * 1.4, 0);
    over.fillStyle(HIDE.spine, 1).fillTriangle(l.x, l.y, r.x, r.y, t.x, t.y);
    over.lineStyle(1.5, HIDE.bone, 0.8).lineBetween(at(a + size * 0.4, 0).x, at(a + size * 0.4, 0).y, t.x, t.y);
  }
}

/** One head: a segmented neck from the shoulders, a horned head in its element's colours, and its HP bar. */
export function renderDragonHead(this: QuestDragonContext, g: Phaser.GameObjects.Graphics, over: Phaser.GameObjects.Graphics, head: Tower, now: number): void {
  const element = head.dragon!;
  const color = DRAGON_COLORS[element];
  const look = HEAD_LOOK[element];
  const body = this.dragonBody;
  // The heads are drawn before the rest of the scene's overlay, so the body comes with the first head (and sits under the necks).
  if (body?.alive && head === this.dragonHeads[0]) drawBody.call(this, body, now);
  if (!body?.alive) return;
  const spec = QUEST.dragon.heads.find((x) => x.element === element)!;
  const neck0 = onBody(body, body.w * 0.3, spec.dy * S * 0.35);
  const r = head.w / 2;
  if (!head.alive) {
    // Only a severed stump remains on the shoulders.
    const at = headSpot.call(this, element);
    const end = vec(neck0.x + (at.x - neck0.x) * 0.35, neck0.y + (at.y - neck0.y) * 0.35);
    over.lineStyle(r * 0.8, HIDE.dark, 1).lineBetween(neck0.x, neck0.y, end.x, end.y);
    over.fillStyle(0x5a1414, 1).fillCircle(end.x, end.y, r * 0.38);
    over.fillStyle(0x9a2a22, 1).fillCircle(end.x, end.y, r * 0.22);
    return;
  }
  const sway = Math.sin(now * 1.6 + (element === 'fire' ? 0 : element === 'ice' ? 2 : 4)) * 3;
  const hx = head.x + (head.shakeT > 0 ? Math.sin(now * 80) * 3 : 0);
  const hy = head.y + sway;

  // Neck: overlapping scaled rings that taper toward the head, with a stripe of the head's colour and small spines.
  const bend = onBody(body, body.w * 0.42, spec.dy * S * 0.75);
  const curve = new Phaser.Curves.QuadraticBezier(vec(neck0.x, neck0.y), vec(bend.x, bend.y + sway * 0.5), vec(hx, hy));
  const pts = curve.getPoints(14);
  pts.forEach((p, k) => over.fillStyle(HIDE.dark, 1).fillCircle(p.x, p.y, r * (0.56 - 0.14 * (k / pts.length))));
  pts.forEach((p, k) => over.fillStyle(HIDE.base, 1).fillCircle(p.x, p.y, r * (0.46 - 0.12 * (k / pts.length))));
  pts.forEach((p, k) => over.fillStyle(look.skin, 1).fillCircle(p.x, p.y, r * (0.22 - 0.05 * (k / pts.length))));
  pts.forEach((p, k) => { if (k % 3 === 1) over.fillStyle(HIDE.spine, 1).fillCircle(p.x, p.y, r * 0.1); });

  // Head: facing whoever it is aiming at, or out into the cave.
  const cast = this.dragonCast && this.dragonCast.head === head ? this.dragonCast : null;
  const beam = this.dragonBeam?.head === head ? this.dragonBeam : null;
  const charging = !!(cast || beam);
  const aim = beam ? beam.angle : cast ? cast.angle : body.facing;
  const at = frame(hx, hy, aim);
  const skull = [[1.45, 0], [1.38, 0.2], [1.02, 0.3], [0.58, 0.42], [0.12, 0.62], [-0.32, 0.6], [-0.58, 0.34], [-0.64, 0]] as const;
  // Horns go under the skull.
  drawHorns(over, this.gGlow, at, element, look, now, r);
  over.fillStyle(HIDE.dark, 1).fillPoints(mirrored(at, skull, r * 1.1), true);
  over.fillStyle(look.skin, 1).fillPoints(mirrored(at, skull, r), true);
  const plate = [[1.22, 0], [0.92, 0.15], [0.42, 0.24], [-0.08, 0.34], [-0.4, 0.2], [-0.46, 0]] as const;
  over.fillStyle(look.plate, 0.9).fillPoints(mirrored(at, plate, r), true);
  for (const side of [-1, 1]) {
    // Teeth along the jaw, a heavy brow and a slit eye.
    for (const f of [1.12, 0.86, 0.6]) {
      const t0 = at((f + 0.06) * r, side * 0.3 * r);
      const t1 = at((f - 0.06) * r, side * 0.3 * r);
      const t2 = at(f * r, side * 0.42 * r);
      over.fillStyle(HIDE.bone, 1).fillTriangle(t0.x, t0.y, t1.x, t1.y, t2.x, t2.y);
    }
    const brow0 = at(0.62 * r, side * 0.3 * r);
    const brow1 = at(0.12 * r, side * 0.52 * r);
    over.lineStyle(4, HIDE.dark, 1).lineBetween(brow0.x, brow0.y, brow1.x, brow1.y);
    over.fillStyle(look.eye, 1).fillPoints(ellipse(at(0.34 * r, side * 0.36 * r).x, at(0.34 * r, side * 0.36 * r).y, r * 0.14, r * 0.08, aim, 10), true);
    const s0 = at(0.26 * r, side * 0.36 * r);
    const s1 = at(0.42 * r, side * 0.36 * r);
    over.lineStyle(2, 0x1a0c08, 1).lineBetween(s0.x, s0.y, s1.x, s1.y);
    this.gGlow.fillStyle(look.eye, charging ? 0.55 : 0.25).fillCircle(at(0.34 * r, side * 0.36 * r).x, at(0.34 * r, side * 0.36 * r).y, r * 0.18);
    const nostril = at(1.24 * r, side * 0.1 * r);
    over.fillStyle(0x140a08, 1).fillCircle(nostril.x, nostril.y, r * 0.06);
  }
  // Breath: a wisp at the nostrils, and the mouth blazing while it charges.
  const mouth = at(1.5 * r, 0);
  const flicker = 0.6 + 0.4 * Math.sin(now * (element === 'thunder' ? 31 : 9) + head.x);
  if (element === 'fire') this.gGlow.fillStyle(color, 0.35 * flicker).fillCircle(mouth.x, mouth.y, r * 0.16);
  if (element === 'ice') this.gGlow.fillStyle(0xdff6ff, 0.18 * flicker).fillCircle(mouth.x, mouth.y, r * 0.24);
  if (element === 'thunder' && Math.sin(now * 13 + head.y) > 0.7) {
    const z = [mouth, at(1.75 * r, 0.18 * r), at(1.9 * r, -0.12 * r), at(2.1 * r, 0.06 * r)];
    this.gGlow.lineStyle(2, look.edge, 0.9).strokePoints(z, false);
  }
  if (charging) {
    this.gGlow.fillStyle(color, 0.55 + 0.35 * Math.sin(now * 20)).fillCircle(mouth.x, mouth.y, r * 0.32);
    this.gGlow.fillStyle(0xffffff, 0.6).fillCircle(mouth.x, mouth.y, r * 0.12);
  }

  const bw = head.w + 22;
  const bx = head.x - bw / 2;
  const by = head.y - head.h / 2 - 16;
  over.fillStyle(0x000000, 0.6).fillRect(bx - 1, by - 1, bw + 2, 7);
  over.fillStyle(color, 1).fillRect(bx, by, bw * Math.max(0, head.hp) / head.maxHp, 5);
}

/** Fire: heavy swept-back horns with glowing tips. Ice: clusters of crystal shards. Thunder: jagged gold bolts that crackle. */
function drawHorns(
  over: Phaser.GameObjects.Graphics, glow: Phaser.GameObjects.Graphics, at: (f: number, sd: number) => Phaser.Math.Vector2,
  element: DragonElement, look: (typeof HEAD_LOOK)[DragonElement], now: number, r: number,
): void {
  for (const side of [-1, 1]) {
    // Horn points in head radii, on this side.
    const p = (f: number, sd: number) => at(f * r, side * sd * r);
    if (element === 'fire') {
      const horn = [p(-0.18, 0.42), p(0.02, 0.5), p(-0.62, 0.92), p(-1.28, 0.78), p(-0.72, 0.62)];
      over.fillStyle(look.horn, 1).fillPoints(horn, true);
      over.lineStyle(1.5, look.edge, 0.55).strokePoints(horn, true);
      over.lineStyle(2.5, look.edge, 0.95).lineBetween(horn[2]!.x, horn[2]!.y, horn[3]!.x, horn[3]!.y);
      glow.fillStyle(look.edge, 0.35 + 0.2 * Math.sin(now * 7 + side)).fillCircle(horn[3]!.x, horn[3]!.y, 4);
      const s0 = p(-0.55, 0.18);
      const s1 = p(-0.98, 0.24);
      over.lineStyle(4, look.horn, 1).lineBetween(s0.x, s0.y, s1.x, s1.y);
    } else if (element === 'ice') {
      for (const [f, sd, tf, tsd] of [[-0.3, 0.46, -1.18, 0.8], [-0.12, 0.52, -0.86, 1.02], [-0.44, 0.36, -1.22, 0.42]] as const) {
        const a = p(f + 0.1, sd - 0.05);
        const b = p(f - 0.1, sd + 0.05);
        const t = p(tf, tsd);
        over.fillStyle(look.horn, 0.95).fillTriangle(a.x, a.y, b.x, b.y, t.x, t.y);
        over.lineStyle(1.5, look.edge, 1).strokeTriangle(a.x, a.y, b.x, b.y, t.x, t.y);
        glow.fillStyle(0xe6fbff, 0.25 + 0.25 * Math.sin(now * 3 + tf * 5 + side)).fillCircle(t.x, t.y, 2.5);
      }
    } else {
      const bolt = [p(-0.15, 0.46), p(-0.58, 0.64), p(-0.48, 0.82), p(-0.98, 0.98), p(-0.9, 1.16), p(-1.36, 1.22)];
      over.lineStyle(7, HIDE.dark, 1).strokePoints(bolt, false);
      over.lineStyle(4, look.horn, 1).strokePoints(bolt, false);
      glow.lineStyle(3, look.edge, 0.25 + 0.2 * Math.sin(now * 17 + side)).strokePoints(bolt, false);
    }
  }
  // Thunder: now and then a spark leaps between the horn tips.
  if (element === 'thunder' && Math.sin(now * 5.3) > 0.82) {
    const a = at(-1.36 * r, 1.22 * r);
    const b = at(-1.36 * r, -1.22 * r);
    const mid = at(-1.6 * r, 0.2 * r * Math.sin(now * 40));
    glow.lineStyle(2, look.edge, 0.9).strokePoints([a, mid, b], false);
  }
}
