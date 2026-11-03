import * as Phaser from 'phaser';
import { QUEST } from '@/config';
import { Fighter } from '@/gameplay/Fighter';
import { T } from '@/localization';
import { sfx } from '@/audio/sfx';
import { layoutPoint } from '@/maps/layout';
import { toHex } from '@/ui';
import { type Projectile, type Tower, type Wyvern, type WyvernCast, type WyvernKind } from '@/battle/types';
import { ARENA, S, toWorld } from '@/battle/coordinates';
import { TOWER_ARROW } from '@/battle/objectives/towerConfig';
import { turnToward } from '@/battle/quest/dragonRules';
import { dragonTouch } from '@/battle/quest/dragonTouch';
import {
  bondStep, chargeEnd, inRingGap, ringGaps, ringTouches, segmentDistance, TETHER_COLOR, WYVERN_COLORS, wyvernInterval, wyvernStep,
} from '@/battle/quest/wyvernRules';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type QuestWyvernContext = Phaser.Scene & Pick<BattleScene,
  'map' | 'countdown' | 'dealDamage' | 'fighters' | 'fx' | 'g' | 'gGlow' | 'gOver' | 'obstacleRects' | 'over' | 'paused' | 'physics'
  | 'freeSpot' | 'onRevived' | 'popText' | 'projectiles' | 'quest' | 'showBanner' | 'towers' | 'applyDragonHit'
  | 'wyverns' | 'wyvernRings' | 'wyvernBursts' | 'wyvernTetherT' | 'wyvernGuardT'
>;

/** The wyverns are always on the Quest's enemy side (team 1), whoever is playing it. */
export const WYVERN_TEAM = 1;

const KINDS: readonly WyvernKind[] = ['sun', 'moon'];

type Point = { x: number; y: number };

/** Who the wyverns may strike: anyone alive on the other side who can be touched. */
const targetsOf = (fighters: Fighter[]) => fighters.filter((f) => f.alive && f.team !== WYVERN_TEAM && !f.untouchable && !f.trapped);

const nearest = (from: Point, list: Fighter[]) =>
  list.reduce<Fighter | null>((a, b) => (!a || Math.hypot(b.x - from.x, b.y - from.y) < Math.hypot(a.x - from.x, a.y - from.y) ? b : a), null);

function partnerOf(this: QuestWyvernContext, wy: Wyvern): Wyvern {
  return this.wyverns.find((o) => o !== wy) ?? wy;
}

/** Where a wyvern may walk (world px): the Sun keeps to the upper gorge, the Moon to the lower. */
function roamBounds(this: QuestWyvernContext, kind: WyvernKind) {
  const r = QUEST.wyverns[kind].roam;
  const lo = toWorld(layoutPoint(this.map, { x: r.minX, y: r.minY }));
  const hi = toWorld(layoutPoint(this.map, { x: r.maxX, y: r.maxY }));
  return { minX: Math.min(lo.x, hi.x), maxX: Math.max(lo.x, hi.x), minY: Math.min(lo.y, hi.y), maxY: Math.max(lo.y, hi.y) };
}

/** A charge may cross the whole gorge, stopping short of the walls. */
function chargeBounds(tw: Tower) {
  const m = tw.w / 2 + 12;
  return { minX: ARENA.x + m, maxX: ARENA.x + ARENA.w - m, minY: ARENA.y + m, maxY: ARENA.y + ARENA.h - m };
}

/** A solid, immovable box that walks with the wyvern (fighters bump into it). */
function solidBox(this: QuestWyvernContext, x: number, y: number, size: number) {
  const body = this.physics.add.body(x - size / 2, y - size / 2, size, size);
  body.setImmovable(true);
  const collider = this.physics.add.collider(this.fighters.map((f) => f.body), body);
  return { body, collider };
}

function moveTo(tw: Tower, x: number, y: number) {
  tw.x = x;
  tw.y = y;
  tw.rect.x = x - tw.w / 2;
  tw.rect.y = y - tw.h / 2;
  if (tw.alive) (tw.body as Phaser.Physics.Arcade.Body).reset(tw.rect.x, tw.rect.y);
}

/** The two wyverns, each its own target with its own HP. The Moon attacks half a beat after the Sun. */
export function placeWyverns(this: QuestWyvernContext, partySize: number): void {
  const w = QUEST.wyverns;
  const size = w.size * S;
  const hp = w.hpBase + w.hpPerPlayer * partySize;
  this.wyverns = KINDS.map((kind, k) => {
    const p = toWorld(layoutPoint(this.map, w[kind].start));
    const { body, collider } = solidBox.call(this, p.x, p.y, size);
    const rect = new Phaser.Geom.Rectangle(p.x - size / 2, p.y - size / 2, size, size);
    this.obstacleRects.push(rect);
    const tower: Tower = {
      team: WYVERN_TEAM, main: false, wyvern: kind, x: p.x, y: p.y, w: size, h: size, hp, maxHp: hp, alive: true, shakeT: 0,
      body, collider, rect, range: 0, fireInterval: 1, reload: 0, aura: 0, arrow: TOWER_ARROW,
    };
    this.towers.push(tower);
    return { kind, tower, facing: Math.PI, vx: 0, vy: 0, stride: 0, t: w.initialDelay + k * w.interval / 2, cast: null, charge: null, reviveT: -1 };
  });
  this.wyvernRings = [];
  this.wyvernBursts = [];
  this.wyvernTetherT = w.tether.tick;
  this.wyvernGuardT = w.guardRespawn;
}

/** The bond, the chain, the frost rings, then each wyvern walks (or charges) and attacks. */
export function updateWyverns(this: QuestWyvernContext, dt: number): void {
  this.wyvernBursts = this.wyvernBursts.filter((b) => (b.t -= dt) > 0);
  if (this.countdown > 0 || this.paused || this.over || this.wyverns.length === 0) return;
  const w = QUEST.wyverns;
  for (const wy of this.wyverns) {
    const partner = partnerOf.call(this, wy);
    const was = wy.reviveT;
    const step = bondStep(wy.tower.alive, partner.tower.alive, wy.reviveT, dt, w.reviveAfter);
    wy.reviveT = step.reviveT;
    if (!wy.tower.alive) {
      wy.cast = null;
      wy.charge = null;
    }
    if (step.rise) raise.call(this, wy);
    else if (was >= 0 && step.reviveT < 0) this.showBanner(T().wyvernGone, TETHER_COLOR);
  }
  const standing = this.wyverns.filter((wy) => wy.tower.alive);
  if (standing.length === 0) {
    this.wyvernRings = [];
    return;
  }
  const targets = targetsOf(this.fighters);
  if (standing.length === 2) {
    callGuard.call(this, dt);
    // The chain of light between them shocks whoever touches it.
    this.wyvernTetherT -= dt;
    if (this.wyvernTetherT <= 0) {
      this.wyvernTetherT += w.tether.tick;
      const [a, b] = standing.map((wy) => wy.tower) as [Tower, Tower];
      for (const t of targets) {
        if (segmentDistance(t, a, b) > (w.tether.width * S) / 2 + t.radius) continue;
        this.applyDragonHit(t, 'thunder', closestOn(t, a, b), 1, [], true, w.tether.scale);
      }
    }
  }
  updateRings.call(this, dt, targets);
  for (const wy of standing) {
    if (wy.charge) { updateCharge.call(this, wy, dt, targets); continue; }
    // Standing still and turning down its lane while it lines up a charge.
    if (wy.cast?.kind !== 'charge') walk.call(this, wy, dt, targets);
    else wy.facing = turnToward(wy.facing, wy.cast.angle, w.turnRate * 2 * dt);
    act.call(this, wy, dt, targets);
  }
  // Touching a wyvern hurts (a charging one already strikes whoever is in its way).
  const touchable = standing.filter((wy) => !wy.charge).map((wy) => ({ x: wy.tower.x, y: wy.tower.y, r: wy.tower.w / 2 }));
  dragonTouch.call(this, touchable, targets, dt);
}

/** The nearest point to `p` on the segment a–b. */
function closestOn(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

function walk(this: QuestWyvernContext, wy: Wyvern, dt: number, targets: Fighter[]): void {
  const w = QUEST.wyverns;
  const tw = wy.tower;
  const bounds = roamBounds.call(this, wy.kind);
  const target = nearest(tw, targets);
  const home = { x: Math.max(bounds.minX, Math.min(bounds.maxX, tw.x)), y: Math.max(bounds.minY, Math.min(bounds.maxY, tw.y)) };
  const away = Math.hypot(home.x - tw.x, home.y - tw.y);
  if (away > 1) {
    // After a charge it may stand outside its part of the gorge: it walks back first.
    const k = Math.min(1, (w.speed * 1.6 * dt) / away);
    moveTo(tw, tw.x + (home.x - tw.x) * k, tw.y + (home.y - tw.y) * k);
    wy.stride += w.speed * 1.6 * dt;
    wy.facing = turnToward(wy.facing, Math.atan2(home.y - tw.y, home.x - tw.x), w.turnRate * dt);
    return;
  }
  const partner = partnerOf.call(this, wy).tower;
  const step = wyvernStep(tw, target, partner.alive && partner !== tw ? partner : null, w.keepRange * S, w.speed, dt, bounds, w.minGap * S, w.maxGap * S);
  moveTo(tw, step.x, step.y);
  wy.vx = step.vx;
  wy.vy = step.vy;
  wy.stride += Math.hypot(step.vx, step.vy) * dt;
  const aim = wy.cast?.kind === 'shards' ? wy.cast.angle : target ? Math.atan2(target.y - tw.y, target.x - tw.x) : wy.facing;
  wy.facing = turnToward(wy.facing, aim, w.turnRate * dt);
}

/** Wind up the next attack, or let the one being wound up go. */
function act(this: QuestWyvernContext, wy: Wyvern, dt: number, targets: Fighter[]): void {
  const w = QUEST.wyverns;
  const tw = wy.tower;
  const cast = wy.cast;
  if (cast) {
    cast.elapsed += dt;
    // Shards follow their target for most of the wind-up, then hold so they can be dodged.
    if (cast.kind === 'shards' && cast.target.alive && cast.elapsed < cast.warn * 0.6) cast.angle = Math.atan2(cast.target.y - tw.y, cast.target.x - tw.x);
    if (cast.elapsed < cast.warn) return;
    wy.cast = null;
    const enraged = !partnerOf.call(this, wy).tower.alive;
    wy.t = wyvernInterval(enraged, this.fighters.some((f) => f.alive && f.team === WYVERN_TEAM));
    release.call(this, wy, cast, targets);
    return;
  }
  wy.t -= dt;
  if (wy.t > 0 || targets.length === 0) return;
  const target = targets[Math.floor(Math.random() * targets.length)]!;
  const color = toHex(WYVERN_COLORS[wy.kind]);
  if (wy.kind === 'sun') {
    if (Math.random() < w.sunfall.chance) {
      const marked = [...targets].sort(() => Math.random() - 0.5).slice(0, w.sunfall.bombs);
      const marks = marked.map((f) => ({ x: f.x + (Math.random() - 0.5) * w.sunfall.scatter * S, y: f.y + (Math.random() - 0.5) * w.sunfall.scatter * S }));
      wy.cast = { kind: 'sunfall', elapsed: 0, warn: w.sunfall.warn, marks };
      this.popText(tw.x, tw.y - tw.h / 2 - 26, T().wyvernAttack.sunfall, color);
      sfx.summonCharge('soulFire', w.sunfall.warn);
    } else {
      const angle = Math.atan2(target.y - tw.y, target.x - tw.x);
      const from = { x: tw.x, y: tw.y };
      wy.cast = { kind: 'charge', elapsed: 0, warn: w.charge.warn, angle, from, to: chargeEnd(from, angle, w.charge.length * S, chargeBounds(tw)) };
      this.popText(tw.x, tw.y - tw.h / 2 - 26, T().wyvernAttack.charge, color);
      sfx.sacrificeCharge(w.charge.warn);
    }
    return;
  }
  if (Math.random() < w.ring.chance) {
    wy.cast = { kind: 'ring', elapsed: 0, warn: w.ring.warn, gaps: ringGaps(w.ring.gaps) };
    this.popText(tw.x, tw.y - tw.h / 2 - 26, T().wyvernAttack.ring, color);
    sfx.summonCharge('soulTree', w.ring.warn);
  } else {
    wy.cast = { kind: 'shards', elapsed: 0, warn: w.shards.warn, target, angle: Math.atan2(target.y - tw.y, target.x - tw.x) };
    this.popText(tw.x, tw.y - tw.h / 2 - 26, T().wyvernAttack.shards, color);
  }
}

/** The attack goes off: sun bombs land, the charge begins, a frost ring spreads, or the shards fly. */
function release(this: QuestWyvernContext, wy: Wyvern, cast: WyvernCast, targets: Fighter[]): void {
  const w = QUEST.wyverns;
  const tw = wy.tower;
  if (cast.kind === 'sunfall') {
    const r = w.sunfall.radius * S;
    sfx.explosion();
    for (const m of cast.marks) {
      this.fx.bombBlast(m.x, m.y, r);
      this.fx.sacrificeBlast(m.x, m.y, r * 0.8);
      this.wyvernBursts.push({ x: m.x, y: m.y, r, color: WYVERN_COLORS.sun, t: 0.45 });
      for (const t of targets) {
        if (t.alive && Math.hypot(t.x - m.x, t.y - m.y) <= r + t.radius) this.applyDragonHit(t, 'fire', m, 1, [], false, w.sunfall.scale);
      }
    }
    return;
  }
  if (cast.kind === 'charge') {
    wy.charge = { from: cast.from, to: cast.to, k: 0, hit: [] };
    wy.facing = cast.angle;
    sfx.dash();
    sfx.rumble();
    return;
  }
  if (cast.kind === 'ring') {
    this.wyvernRings.push({ x: tw.x, y: tw.y, r: tw.w * 0.5, gaps: cast.gaps, hit: [] });
    this.fx.frostBurst(tw.x, tw.y);
    sfx.iceStaff();
    return;
  }
  sfx.iceStaff();
  for (let k = 0; k < w.shards.shots; k++) {
    const angle = cast.angle + (k - (w.shards.shots - 1) / 2) * w.shards.spread;
    const start = tw.w * 0.9 + w.shards.radius;
    const shot: Projectile = {
      team: WYVERN_TEAM, dead: false, traveled: 0, radius: w.shards.radius, element: 'ice', blast: w.shards.blast,
      x: tw.x + Math.cos(angle) * start, y: tw.y + Math.sin(angle) * start,
      vx: Math.cos(angle) * w.shards.speed, vy: Math.sin(angle) * w.shards.speed,
      effect: { kind: 'projectile', speed: w.shards.speed, radius: w.shards.radius, damage: 0, knockback: 40, hitstun: 0.1, range: 2400, color: WYVERN_COLORS.moon },
    };
    this.projectiles.push(shot);
  }
}

/** The Sun Wyvern rushing down its lane, scorching and knocking aside everyone in the way, once each. */
function updateCharge(this: QuestWyvernContext, wy: Wyvern, dt: number, targets: Fighter[]): void {
  const w = QUEST.wyverns;
  const c = wy.charge!;
  const tw = wy.tower;
  const len = Math.hypot(c.to.x - c.from.x, c.to.y - c.from.y) || 1;
  c.k = Math.min(1, c.k + (w.charge.speed * dt) / len);
  const x = c.from.x + (c.to.x - c.from.x) * c.k;
  const y = c.from.y + (c.to.y - c.from.y) * c.k;
  moveTo(tw, x, y);
  wy.stride += w.charge.speed * dt;
  const reach = (w.charge.width * S) / 2;
  for (const t of targets) {
    if (c.hit.includes(t) || Math.hypot(t.x - x, t.y - y) > reach + t.radius + tw.w * 0.2) continue;
    c.hit.push(t);
    // Knocked out to the side of the lane.
    const on = closestOn(t, c.from, c.to);
    const side = Math.hypot(t.x - on.x, t.y - on.y) < 2 ? { x: on.x - Math.sin(wy.facing) * 10, y: on.y + Math.cos(wy.facing) * 10 } : on;
    this.applyDragonHit(t, 'fire', side, 1, [], false, w.charge.scale);
  }
  if (c.k < 1) return;
  wy.charge = null;
  this.fx.smoke(x, y, 18, 1.4);
  this.fx.hammerSmash(x, y, tw.w * 0.6);
  sfx.boulder();
}

/** Frost rings spread out; anyone the front passes over, outside the gaps, is struck by ice. */
function updateRings(this: QuestWyvernContext, dt: number, targets: Fighter[]): void {
  const spec = QUEST.wyverns.ring;
  const thick = spec.thickness * S;
  for (const ring of this.wyvernRings) {
    const before = ring.r;
    ring.r += spec.speed * dt;
    for (const t of targets) {
      if (ring.hit.includes(t)) continue;
      const d = Math.hypot(t.x - ring.x, t.y - ring.y);
      const crossed = ringTouches(ring.r, d, thick, t.radius) || (d >= before && d <= ring.r);
      if (!crossed || inRingGap(Math.atan2(t.y - ring.y, t.x - ring.x), ring.gaps, spec.gapWidth)) continue;
      ring.hit.push(t);
      this.applyDragonHit(t, 'ice', ring, 1, [], false, spec.scale);
    }
  }
  this.wyvernRings = this.wyvernRings.filter((ring) => ring.r < spec.maxRadius * S);
}

/** A fallen wyvern rises where it fell, called back by its partner. */
function raise(this: QuestWyvernContext, wy: Wyvern): void {
  const w = QUEST.wyverns;
  const tw = wy.tower;
  const { body, collider } = solidBox.call(this, tw.x, tw.y, tw.w);
  tw.body = body;
  tw.collider = collider;
  tw.alive = true;
  tw.hp = Math.round(tw.maxHp * w.reviveHp);
  tw.shakeT = 0;
  if (!this.obstacleRects.includes(tw.rect)) this.obstacleRects.push(tw.rect);
  wy.t = w.interval;
  wy.cast = null;
  wy.charge = null;
  const partner = partnerOf.call(this, wy);
  this.fx.respawnBeam(partner.tower.x, partner.tower.y, tw.x, tw.y, WYVERN_COLORS[partner.kind]);
  this.fx.summonPulse(() => ({ x: tw.x, y: tw.y }), WYVERN_COLORS[wy.kind], 0.2);
  this.fx.smoke(tw.x, tw.y, 16, 1.2);
  this.showBanner(T().wyvernRise(T().wyvernNames[wy.kind]), WYVERN_COLORS[wy.kind]);
  sfx.respawn();
}

/** While both wyverns stand, fallen guards return together beside them. */
function callGuard(this: QuestWyvernContext, dt: number): void {
  const w = QUEST.wyverns;
  this.wyvernGuardT -= dt;
  if (this.wyvernGuardT > 0) return;
  this.wyvernGuardT = w.guardRespawn;
  const guards = this.fighters.filter((f) => f.team === WYVERN_TEAM && !f.boss);
  const room = w.maxGuards - guards.filter((f) => f.alive).length;
  const fallen = guards.filter((f) => !f.alive).slice(0, Math.max(0, Math.min(QUEST.reinforcementBatch, room)));
  for (const guard of fallen) {
    const from = this.wyverns[Math.floor(Math.random() * this.wyverns.length)]!;
    const tw = from.tower;
    const taken = this.fighters.filter((f) => f.alive).map((f) => ({ x: f.x, y: f.y }));
    const spot = this.freeSpot({ x: tw.x + Math.cos(from.facing) * tw.w, y: tw.y + Math.sin(from.facing) * tw.w }, taken);
    guard.revive(spot.x, spot.y);
    guard.pocket.length = 0;
    this.onRevived(guard);
    this.fx.respawnBeam(tw.x, tw.y, spot.x, spot.y, WYVERN_COLORS[from.kind]);
    this.fx.smoke(spot.x, spot.y, 12, 1);
    this.popText(spot.x, spot.y - 40, T().dragonGuardBack, toHex(WYVERN_COLORS[from.kind]));
    sfx.respawn();
  }
}

/** Spots about to be struck, so CPU fighters step off them: sun bomb marks and charge lanes. */
export function wyvernDangers(this: QuestWyvernContext): { x: number; y: number; r: number; safeTeam: number }[] {
  const out: { x: number; y: number; r: number; safeTeam: number }[] = [];
  const w = QUEST.wyverns;
  const lane = (a: Point, b: Point) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / 50));
    for (let k = 0; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n, r: (w.charge.width * S) / 2, safeTeam: WYVERN_TEAM });
  };
  for (const wy of this.wyverns) {
    if (!wy.tower.alive) continue;
    if (wy.cast?.kind === 'sunfall') for (const m of wy.cast.marks) out.push({ x: m.x, y: m.y, r: w.sunfall.radius * S, safeTeam: WYVERN_TEAM });
    if (wy.cast?.kind === 'charge') lane(wy.cast.from, wy.cast.to);
    if (wy.charge) lane(wy.tower, wy.charge.to);
  }
  return out;
}

// ---------- drawing ----------

/** Each wyvern's hide: the Sun in burnished gold and ember wings, the Moon in night-blue with silver plates. */
const LOOK: Record<WyvernKind, { dark: number; base: number; mid: number; plate: number; membrane: number; membraneHi: number; horn: number; eye: number }> = {
  sun: { dark: 0x3a1d0c, base: 0x94561a, mid: 0xc98a2a, plate: 0xffd36a, membrane: 0xa8461a, membraneHi: 0xe0853a, horn: 0xfff0c0, eye: 0xfffbe0 },
  moon: { dark: 0x121729, base: 0x323d66, mid: 0x55699a, plate: 0xcfe0ff, membrane: 0x232c55, membraneHi: 0x46579a, horn: 0xe8f2ff, eye: 0xa8f0ff },
};

const vec = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

/** A local frame at (cx, cy) turned to `angle`: `f` is forward, `sd` is to the side. */
function frame(cx: number, cy: number, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return (f: number, sd: number) => vec(cx + c * f - s * sd, cy + s * f + c * sd);
}

function ellipse(cx: number, cy: number, rx: number, ry: number, angle: number, n = 22): Phaser.Math.Vector2[] {
  const at = frame(cx, cy, angle);
  return Array.from({ length: n }, (_, k) => {
    const t = (k / n) * Math.PI * 2;
    return at(Math.cos(t) * rx, Math.sin(t) * ry);
  });
}

/** A shape that is the same on both sides: `half` runs from the front tip to the back, on one side. */
function mirrored(at: (f: number, sd: number) => Phaser.Math.Vector2, half: readonly (readonly [number, number])[], k: number) {
  return [...half.map(([f, sd]) => at(f * k, sd * k)), ...[...half].reverse().map(([f, sd]) => at(f * k, -sd * k))];
}

/** The chain between the wyverns, the frost rings, bursts, and falling sun bombs. Attack paths have no ground markers. */
export function renderWyverns(this: QuestWyvernContext, now: number): void {
  if (this.quest?.stage !== QUEST.wyvernStage) return;
  const w = QUEST.wyverns;
  const glow = this.gGlow;
  const standing = this.wyverns.filter((wy) => wy.tower.alive);
  if (standing.length === 2) {
    const [a, b] = standing.map((wy) => wy.tower) as [Tower, Tower];
    const n = Math.max(4, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 26));
    const nx = -(b.y - a.y);
    const ny = b.x - a.x;
    const nl = Math.hypot(nx, ny) || 1;
    const pts = Array.from({ length: n + 1 }, (_, k) => {
      const jitter = k === 0 || k === n ? 0 : Math.sin(k * 7.3 + now * 31) * 7 + Math.sin(k * 3.1 - now * 17) * 4;
      return vec(a.x + ((b.x - a.x) * k) / n + (nx / nl) * jitter, a.y + ((b.y - a.y) * k) / n + (ny / nl) * jitter);
    });
    glow.lineStyle(w.tether.width * S * 1.8, TETHER_COLOR, 0.14).lineBetween(a.x, a.y, b.x, b.y);
    glow.lineStyle(4, TETHER_COLOR, 0.85).strokePoints(pts, false);
    glow.lineStyle(1.5, 0xffffff, 0.95).strokePoints(pts, false);
  }
  for (const ring of this.wyvernRings) {
    const fade = 1 - ring.r / (w.ring.maxRadius * S);
    const gaps = [...ring.gaps].sort((x, y) => x - y);
    for (let k = 0; k < gaps.length; k++) {
      const start = gaps[k]! + w.ring.gapWidth / 2;
      const end = (k + 1 < gaps.length ? gaps[k + 1]! : gaps[0]! + Math.PI * 2) - w.ring.gapWidth / 2;
      glow.lineStyle(w.ring.thickness * S, WYVERN_COLORS.moon, 0.55 * fade + 0.2);
      glow.beginPath();
      glow.arc(ring.x, ring.y, ring.r, start, end, false);
      glow.strokePath();
      glow.lineStyle(2, 0xffffff, 0.8 * fade + 0.2);
      glow.beginPath();
      glow.arc(ring.x, ring.y, ring.r, start, end, false);
      glow.strokePath();
    }
  }
  for (const burst of this.wyvernBursts) {
    const k = 1 - burst.t / 0.45;
    glow.fillStyle(burst.color, 0.35 * (1 - k)).fillCircle(burst.x, burst.y, burst.r * (0.6 + 0.4 * k));
    glow.lineStyle(3, burst.color, 0.85 * (1 - k)).strokeCircle(burst.x, burst.y, burst.r);
  }
  for (const wy of this.wyverns) {
    const tw = wy.tower;
    const cast = wy.cast;
    if (tw.alive && cast) {
      const p = Math.min(1, cast.elapsed / cast.warn);
      if (cast.kind === 'sunfall') {
        const r = w.sunfall.radius * S;
        for (const m of cast.marks) {
          // The sun bomb drops without a ground marker.
          const drop = (1 - p) * 260;
          glow.fillStyle(WYVERN_COLORS.sun, 0.55).fillCircle(m.x, m.y - drop, 10 + 12 * p);
          glow.fillStyle(0xffffff, 0.85).fillCircle(m.x, m.y - drop, 4 + 5 * p);
        }
      }
    }
    if (!tw.alive && wy.reviveT >= 0) {
      // The partner's light gathering on the fallen wyvern: a ring that closes as it nears rising.
      const partner = partnerOf.call(this, wy);
      const k = 1 - wy.reviveT / w.reviveAfter;
      glow.lineStyle(4, WYVERN_COLORS[partner.kind], 0.8);
      glow.beginPath();
      glow.arc(tw.x, tw.y, tw.w * 0.85, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k, false);
      glow.strokePath();
    }
  }
}

/** One wyvern (drawn as its tower): tail, legs, great wings, body, neck and horned head, and its HP bar. */
export function renderWyvern(this: QuestWyvernContext, g: Phaser.GameObjects.Graphics, over: Phaser.GameObjects.Graphics, tw: Tower, now: number): void {
  const wy = this.wyverns.find((o) => o.tower === tw);
  if (!wy) return;
  const look = LOOK[wy.kind];
  const color = WYVERN_COLORS[wy.kind];
  const u = tw.w / 2;
  const facing = wy.facing;
  const x = tw.x + (tw.alive && tw.shakeT > 0 ? Math.sin(now * 80) * 3 : 0);
  const y = tw.y;
  const at = frame(x, y, facing);
  if (!tw.alive) {
    // Fallen: a crumpled heap with folded wings.
    g.fillStyle(0x000000, 0.3).fillPoints(ellipse(x + 6, y + 8, u * 1.3, u * 0.9, facing), true);
    for (const side of [-1, 1]) {
      const wing = [at(u * 0.3, side * u * 0.3), at(-u * 0.9, side * u * 1.2), at(-u * 1.1, side * u * 0.4)];
      g.fillStyle(look.membrane, 0.7).fillPoints(wing, true);
    }
    g.fillStyle(look.dark, 1).fillPoints(ellipse(x, y, u * 0.95, u * 0.6, facing), true);
    g.fillStyle(look.base, 0.6).fillPoints(ellipse(x, y, u * 0.8, u * 0.45, facing), true);
    const neck = new Phaser.Curves.QuadraticBezier(at(u * 0.6, 0), at(u * 1.2, u * 0.6), at(u * 1.3, u * 1.1));
    g.lineStyle(u * 0.32, look.dark, 1).strokePoints(neck.getPoints(10), false);
    const head = at(u * 1.3, u * 1.15);
    g.fillStyle(look.dark, 1).fillCircle(head.x, head.y, u * 0.32);
    return;
  }
  const enraged = !partnerOf.call(this, wy).tower.alive;
  const casting = !!wy.cast || !!wy.charge;
  g.fillStyle(0x000000, 0.3).fillPoints(ellipse(x + 10, y + 14, u * 1.5, u * 1.1, facing), true);

  // Tail: tapering scaled segments that swing, ending in a flame blade (Sun) or a crescent blade (Moon).
  const swish = Math.sin(now * 1.7 + (wy.kind === 'sun' ? 0 : 2));
  const tail = new Phaser.Curves.CubicBezier(at(-u * 0.7, 0), at(-u * 1.3, swish * u * 0.6), at(-u * 1.8, -swish * u * 0.4), at(-u * 2.3, Math.sin(now * 1.7 + 1.3) * u * 0.7));
  const tp = tail.getPoints(16);
  tp.forEach((p, k) => g.fillStyle(look.dark, 1).fillCircle(p.x, p.y, u * (0.36 - 0.27 * (k / (tp.length - 1)))));
  tp.forEach((p, k) => g.fillStyle(look.base, 1).fillCircle(p.x, p.y, u * (0.28 - 0.22 * (k / (tp.length - 1)))));
  const tip = tp[tp.length - 1]!;
  const pre = tp[tp.length - 3]!;
  const blade = frame(tip.x, tip.y, Math.atan2(tip.y - pre.y, tip.x - pre.x));
  if (wy.kind === 'sun') {
    g.fillStyle(look.membraneHi, 1).fillPoints([blade(u * 0.5, 0), blade(u * 0.05, u * 0.24), blade(-u * 0.1, 0), blade(u * 0.05, -u * 0.24)], true);
    this.gGlow.fillStyle(0xffb43a, 0.35 + 0.2 * Math.sin(now * 9)).fillCircle(blade(u * 0.25, 0).x, blade(u * 0.25, 0).y, u * 0.2);
  } else {
    const moon = [blade(u * 0.45, -u * 0.3), blade(u * 0.15, 0), blade(u * 0.45, u * 0.3), blade(-u * 0.05, u * 0.12), blade(-u * 0.05, -u * 0.12)];
    g.fillStyle(look.plate, 1).fillPoints(moon, true);
  }

  // Two hind legs with clawed feet that step as it walks.
  for (const side of [-1, 1]) {
    const step = Math.sin(wy.stride / 24 + (side > 0 ? Math.PI : 0)) * u * 0.2;
    const hip = at(-u * 0.25, side * u * 0.45);
    const foot = at(-u * 0.05 + step, side * u * 0.82);
    g.lineStyle(u * 0.36, look.dark, 1).lineBetween(hip.x, hip.y, foot.x, foot.y);
    g.lineStyle(u * 0.22, look.base, 1).lineBetween(hip.x, hip.y, foot.x, foot.y);
    g.fillStyle(look.dark, 1).fillCircle(foot.x, foot.y, u * 0.2);
    for (const toe of [-1, 0, 1]) {
      const c0 = at(-u * 0.05 + step + u * 0.12, side * u * 0.82 + toe * u * 0.1);
      const c1 = at(-u * 0.05 + step + u * 0.32, side * u * 0.82 + toe * u * 0.17);
      g.lineStyle(3, look.horn, 1).lineBetween(c0.x, c0.y, c1.x, c1.y);
    }
  }

  // Great wings: an arm with a claw at the wrist, four finger bones and a scalloped membrane, beating slowly.
  const beat = wy.charge ? 0.75 : 1 + 0.1 * Math.sin(now * (casting ? 5 : 2.4) + (wy.kind === 'sun' ? 0 : 1.5));
  for (const side of [-1, 1]) {
    const shoulder = at(u * 0.3, side * u * 0.42);
    const elbow = at(u * 0.15, side * u * 1.55 * beat);
    const wrist = at(-u * 0.35, side * u * 2.05 * beat);
    const tips = [at(-u * 1.0, side * u * 2.15 * beat), at(-u * 1.35, side * u * 1.6 * beat), at(-u * 1.4, side * u * 1.0 * beat), at(-u * 1.05, side * u * 0.5)];
    const root = at(-u * 0.55, side * u * 0.3);
    const sag = (a: Phaser.Math.Vector2, c: Phaser.Math.Vector2) => vec((a.x + c.x) / 2 + (wrist.x - (a.x + c.x) / 2) * 0.25, (a.y + c.y) / 2 + (wrist.y - (a.y + c.y) / 2) * 0.25);
    const membrane = [shoulder, elbow, wrist, tips[0]!, sag(tips[0]!, tips[1]!), tips[1]!, sag(tips[1]!, tips[2]!), tips[2]!, sag(tips[2]!, tips[3]!), tips[3]!, root];
    over.fillStyle(look.membrane, 0.95).fillPoints(membrane, true);
    over.fillStyle(look.membraneHi, 0.45).fillTriangle(shoulder.x, shoulder.y, elbow.x, elbow.y, wrist.x, wrist.y);
    for (const t of tips) over.lineStyle(2.5, look.dark, 1).lineBetween(wrist.x, wrist.y, t.x, t.y);
    over.lineStyle(7, look.dark, 1).lineBetween(shoulder.x, shoulder.y, elbow.x, elbow.y);
    over.lineStyle(6, look.dark, 1).lineBetween(elbow.x, elbow.y, wrist.x, wrist.y);
    const claw = at(-u * 0.15, side * u * 2.3 * beat);
    over.lineStyle(3, look.horn, 1).lineBetween(wrist.x, wrist.y, claw.x, claw.y);
  }

  // Body: dark scales, a lighter back with its sigil (a sun disc or a crescent), and spines down the middle.
  over.fillStyle(look.dark, 1).fillPoints(ellipse(x, y, u * 1.0, u * 0.66, facing), true);
  over.fillStyle(look.base, 1).fillPoints(ellipse(x, y, u * 0.9, u * 0.56, facing), true);
  const back = at(-u * 0.05, 0);
  over.fillStyle(look.mid, 1).fillPoints(ellipse(back.x, back.y, u * 0.68, u * 0.3, facing), true);
  for (let row = -1; row <= 1; row++) {
    for (let k = -3; k <= 3; k++) {
      const p = at(k * u * 0.22 + (row & 1) * u * 0.11, row * u * 0.22);
      over.fillStyle(look.dark, 0.28).fillCircle(p.x, p.y, u * 0.06);
    }
  }
  const sigil = at(-u * 0.1, 0);
  if (wy.kind === 'sun') {
    this.gGlow.fillStyle(0xffd36a, 0.4 + 0.15 * Math.sin(now * 4)).fillCircle(sigil.x, sigil.y, u * 0.3);
    over.fillStyle(look.plate, 1).fillCircle(sigil.x, sigil.y, u * 0.16);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + now * 0.6;
      over.lineStyle(2, look.plate, 0.9).lineBetween(sigil.x + Math.cos(a) * u * 0.2, sigil.y + Math.sin(a) * u * 0.2, sigil.x + Math.cos(a) * u * 0.3, sigil.y + Math.sin(a) * u * 0.3);
    }
  } else {
    over.fillStyle(look.plate, 1).fillCircle(sigil.x, sigil.y, u * 0.2);
    over.fillStyle(look.mid, 1).fillCircle(sigil.x + Math.cos(facing) * u * 0.08, sigil.y + Math.sin(facing) * u * 0.08, u * 0.17);
    this.gGlow.fillStyle(0xcfe0ff, 0.25).fillCircle(sigil.x, sigil.y, u * 0.28);
  }
  for (let k = 0; k < 5; k++) {
    const a = u * 0.62 - k * u * 0.3;
    if (Math.abs(a + u * 0.1) < u * 0.25) continue;
    const l = at(a + u * 0.06, -u * 0.08);
    const r = at(a + u * 0.06, u * 0.08);
    const t = at(a - u * 0.16, 0);
    over.fillStyle(look.plate, 0.85).fillTriangle(l.x, l.y, r.x, r.y, t.x, t.y);
  }

  // Neck and head, facing its way (or down the lane while it charges).
  const sway = Math.sin(now * 1.9 + (wy.kind === 'sun' ? 0 : 3)) * u * 0.12;
  const neck = new Phaser.Curves.QuadraticBezier(at(u * 0.6, 0), at(u * 1.05, sway), at(u * 1.45, sway * 0.5));
  const np = neck.getPoints(10);
  np.forEach((p, k) => over.fillStyle(look.dark, 1).fillCircle(p.x, p.y, u * (0.36 - 0.08 * (k / np.length))));
  np.forEach((p, k) => over.fillStyle(look.base, 1).fillCircle(p.x, p.y, u * (0.28 - 0.06 * (k / np.length))));
  np.forEach((p, k) => { if (k % 3 === 1) over.fillStyle(look.plate, 0.9).fillCircle(p.x, p.y, u * 0.07); });
  const hp = np[np.length - 1]!;
  const aim = wy.cast?.kind === 'shards' || wy.cast?.kind === 'charge' ? wy.cast.angle : facing;
  const head = frame(hp.x + Math.cos(aim) * u * 0.25, hp.y + Math.sin(aim) * u * 0.25, aim);
  const r = u * 0.42;
  // Horns under the skull: a crown of sun rays, or two long crescent horns.
  if (wy.kind === 'sun') {
    for (let k = -3; k <= 3; k++) {
      const a = Math.PI + k * 0.32;
      const base = head(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
      const tipP = head(Math.cos(a) * r * (k % 2 === 0 ? 1.45 : 1.15), Math.sin(a) * r * (k % 2 === 0 ? 1.45 : 1.15));
      over.lineStyle(k % 2 === 0 ? 5 : 3.5, look.dark, 1).lineBetween(base.x, base.y, tipP.x, tipP.y);
      over.lineStyle(k % 2 === 0 ? 3 : 2, look.horn, 1).lineBetween(base.x, base.y, tipP.x, tipP.y);
      this.gGlow.fillStyle(0xffd36a, 0.4).fillCircle(tipP.x, tipP.y, 2.5);
    }
  } else {
    for (const side of [-1, 1]) {
      const horn = new Phaser.Curves.QuadraticBezier(head(-r * 0.2, side * r * 0.45), head(-r * 1.0, side * r * 1.25), head(-r * 1.6, side * r * 0.5));
      const pts = horn.getPoints(10);
      over.lineStyle(6, look.dark, 1).strokePoints(pts, false);
      over.lineStyle(3.5, look.horn, 1).strokePoints(pts, false);
    }
  }
  const skull = [[1.45, 0], [1.36, 0.2], [1.0, 0.3], [0.55, 0.42], [0.1, 0.6], [-0.3, 0.56], [-0.55, 0.3], [-0.6, 0]] as const;
  over.fillStyle(look.dark, 1).fillPoints(mirrored(head, skull, r * 1.1), true);
  over.fillStyle(look.base, 1).fillPoints(mirrored(head, skull, r), true);
  const plate = [[1.2, 0], [0.9, 0.14], [0.4, 0.22], [-0.1, 0.3], [-0.38, 0.18], [-0.44, 0]] as const;
  over.fillStyle(look.plate, 0.85).fillPoints(mirrored(head, plate, r), true);
  for (const side of [-1, 1]) {
    for (const f of [1.1, 0.82]) {
      const t0 = head((f + 0.06) * r, side * 0.3 * r);
      const t1 = head((f - 0.06) * r, side * 0.3 * r);
      const t2 = head(f * r, side * 0.42 * r);
      over.fillStyle(0xf4ead2, 1).fillTriangle(t0.x, t0.y, t1.x, t1.y, t2.x, t2.y);
    }
    const eye = head(0.34 * r, side * 0.34 * r);
    over.fillStyle(look.eye, 1).fillPoints(ellipse(eye.x, eye.y, r * 0.15, r * 0.08, aim, 10), true);
    this.gGlow.fillStyle(enraged ? 0xff5a3a : look.eye, casting || enraged ? 0.6 : 0.3).fillCircle(eye.x, eye.y, r * 0.2);
  }
  const mouth = head(1.55 * r, 0);
  if (wy.cast || wy.charge) {
    this.gGlow.fillStyle(color, 0.55 + 0.35 * Math.sin(now * 20)).fillCircle(mouth.x, mouth.y, r * 0.38);
    this.gGlow.fillStyle(0xffffff, 0.6).fillCircle(mouth.x, mouth.y, r * 0.14);
  } else if (wy.kind === 'sun') {
    this.gGlow.fillStyle(color, 0.3 * (0.6 + 0.4 * Math.sin(now * 9))).fillCircle(mouth.x, mouth.y, r * 0.18);
  } else {
    this.gGlow.fillStyle(0xdff6ff, 0.16).fillCircle(mouth.x, mouth.y, r * 0.26);
  }

  const bw = tw.w + 30;
  const bx = tw.x - bw / 2;
  const by = tw.y - tw.h / 2 - 30;
  over.fillStyle(0x000000, 0.6).fillRect(bx - 1, by - 1, bw + 2, 7);
  over.fillStyle(color, 1).fillRect(bx, by, (bw * Math.max(0, tw.hp)) / tw.maxHp, 5);
}
