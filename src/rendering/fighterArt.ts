import * as Phaser from 'phaser';
import { RES } from '@/config';
import type { WeaponId } from '@/gameplay/weapons';

/**
 * Ninja-style character and weapon art, all drawn in code.
 * Characters are top-down and face +x; the scene rotates them to the fighter's facing.
 */

/** Size of the ninja texture in game units (the body circle has radius 18). */
export const NINJA_SIZE = 56;

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

function shade(c: number, f: number) {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
}

/** Paints (once) and returns the texture key of a ninja wearing `color`. */
export function ninjaTexture(scene: Phaser.Scene, color: number): string {
  const key = `ninja-${color.toString(16)}`;
  if (scene.textures.exists(key)) return key;
  const px = Math.round(NINJA_SIZE * RES);
  const tex = scene.textures.createCanvas(key, px, px)!;
  const ctx = tex.getContext();
  ctx.scale(RES, RES);
  ctx.translate(NINJA_SIZE / 2, NINJA_SIZE / 2);

  // Scroll strapped across the back.
  ctx.fillStyle = '#d9c9a0';
  ctx.strokeStyle = '#6b4a24';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-16, -9, 6, 18, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#8f2a20';
  ctx.fillRect(-16, -1.5, 6, 3);

  // Torso / shoulders.
  const body = ctx.createRadialGradient(-4, -5, 2, -3, 0, 18);
  body.addColorStop(0, '#3a3f4c');
  body.addColorStop(1, '#14161c');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(-3, 0, 11.5, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#08090c';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Shoulder guards in the player's colour.
  for (const sy of [-12.5, 12.5]) {
    const pad = ctx.createRadialGradient(-4, sy - 2, 1, -3, sy, 6.5);
    pad.addColorStop(0, hex(shade(color, 1.3)));
    pad.addColorStop(1, hex(shade(color, 0.7)));
    ctx.fillStyle = pad;
    ctx.beginPath();
    ctx.ellipse(-3, sy, 6.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hex(shade(color, 0.4));
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Hooded head.
  const hood = ctx.createRadialGradient(1, -3, 1, 3, 0, 10);
  hood.addColorStop(0, '#363b47');
  hood.addColorStop(1, '#101217');
  ctx.fillStyle = hood;
  ctx.beginPath();
  ctx.arc(3, 0, 9.5, 0, Math.PI * 2);
  ctx.fill();

  // Eye slit at the front of the hood.
  ctx.save();
  ctx.beginPath();
  ctx.arc(3, 0, 9.5, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#e9c9a3';
  ctx.fillRect(8.5, -5, 6, 10);
  ctx.restore();
  ctx.fillStyle = '#111';
  for (const ey of [-2.6, 2.6]) {
    ctx.beginPath();
    ctx.ellipse(10.6, ey, 1.1, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Headband with a steel plate on the forehead and a knot at the back.
  ctx.strokeStyle = hex(color);
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(3, 0, 8.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#c9ced8';
  ctx.strokeStyle = '#5d6370';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.roundRect(4.5, -4.5, 3, 9, 1);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hex(shade(color, 0.8));
  ctx.beginPath();
  ctx.arc(-6, 0, 2.4, 0, Math.PI * 2);
  ctx.fill();

  tex.refresh();
  return key;
}

// ---------- held weapons ----------

export interface Pose {
  x: number;
  y: number;
  facing: number;
  /** 'idle' | 'windup' (0→1 pulling back) | 'strike' (0→1 through the active frames and recovery). */
  phase: 'idle' | 'windup' | 'strike';
  t: number;
  color: number;
  /** Seconds, for little idle animations. */
  time: number;
  /** How far the weapon reaches (used to draw a thrown bomb in flight). */
  reach?: number;
}

/** Point in the fighter's local frame (x forward, y to its right) → world. */
function toWorld(p: Pose, lx: number, ly: number) {
  const c = Math.cos(p.facing);
  const s = Math.sin(p.facing);
  return { x: p.x + c * lx - s * ly, y: p.y + s * lx + c * ly };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** How far into the swing we are: 0 at rest, 1 fully pulled back, then -ish back to 0 after the strike. */
function windAmount(p: Pose) {
  if (p.phase === 'windup') return p.t;
  return 0;
}

function hand(g: Phaser.GameObjects.Graphics, p: Pose, lx: number, ly: number) {
  const w = toWorld(p, lx, ly);
  g.fillStyle(0x1b1d24, 1).fillCircle(w.x, w.y, 3.6);
  g.lineStyle(1, 0x000000, 0.6).strokeCircle(w.x, w.y, 3.6);
  return w;
}

export function drawShurikenStar(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, rot: number, alpha = 1) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * Math.PI) / 4;
    const rr = i % 2 === 0 ? r : r * 0.32;
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
  }
  g.fillStyle(0xcfd5df, alpha).fillPoints(pts as Phaser.Math.Vector2[], true);
  g.lineStyle(1, 0x4a505c, alpha).strokePoints(pts as Phaser.Math.Vector2[], true);
  g.fillStyle(0x2a2e36, alpha).fillCircle(x, y, r * 0.18);
}

export function kunai(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, len: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const at = (f: number, side: number) => ({ x: x + c * f - s * side, y: y + s * f + c * side });
  // Ring and wrapped grip behind the hand.
  const ring = at(-len * 0.55, 0);
  g.lineStyle(1.5, 0x8a909c, 1).strokeCircle(ring.x, ring.y, 2.2);
  const g0 = at(-len * 0.4, 0);
  const g1 = at(0, 0);
  g.lineStyle(2.6, 0x3a2a1c, 1).lineBetween(g0.x, g0.y, g1.x, g1.y);
  // Leaf-shaped blade.
  g.fillStyle(0xd3d8e2, 1).fillPoints([at(0, 2.6), at(len * 0.35, 3.2), at(len, 0), at(len * 0.35, -3.2), at(0, -2.6)] as Phaser.Math.Vector2[], true);
  g.lineStyle(1, 0x5d6370, 1).lineBetween(at(0, 0).x, at(0, 0).y, at(len, 0).x, at(len, 0).y);
}

/** A lacquered polearm with a leaf-shaped steel head and a red tassel. */
function spear(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, length: number, color: number) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const at = (f: number, side = 0) => ({ x: x + (c * f - s * side) * length, y: y + (s * f + c * side) * length });
  const rear = at(-0.5), neck = at(0.23), tip = at(0.5);
  g.lineStyle(length * 0.055, 0x67452e, 1).lineBetween(rear.x, rear.y, neck.x, neck.y);
  g.lineStyle(length * 0.018, 0xc39864, 1).lineBetween(rear.x, rear.y, neck.x, neck.y);
  const blade = [neck, at(0.31, 0.065), tip, at(0.31, -0.065)];
  g.fillStyle(0xdce6ee, 1).fillPoints(blade as Phaser.Math.Vector2[], true);
  g.lineStyle(length * 0.014, 0x536579, 1).strokePoints(blade as Phaser.Math.Vector2[], true);
  g.lineStyle(length * 0.014, 0xffffff, 0.9).lineBetween(neck.x, neck.y, tip.x, tip.y);
  const wrap = at(0.19);
  g.fillStyle(color, 1).fillCircle(wrap.x, wrap.y, length * 0.035);
  for (const side of [-1, 1]) {
    const tassel = [at(0.2), at(0.02, side * 0.12), at(0.09, side * 0.025)];
    g.fillStyle(0xb8383e, 1).fillPoints(tassel as Phaser.Math.Vector2[], true);
  }
}

/** One nunchaku stick: black lacquer with brass caps. */
function nunchakuStick(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, len: number) {
  const ex = x + Math.cos(angle) * len;
  const ey = y + Math.sin(angle) * len;
  g.lineStyle(len * 0.36, 0x2a1a12, 1).lineBetween(x, y, ex, ey);
  g.lineStyle(len * 0.12, 0x6b4a2e, 1).lineBetween(x, y, ex, ey);
  g.fillStyle(0xd9ae4a, 1).fillCircle(x, y, len * 0.17).fillCircle(ex, ey, len * 0.17);
}

/** A chain whip's sections strung through `pts`, ending in a dart; `bead` sets their size. */
function whipChain(g: Phaser.GameObjects.Graphics, pts: readonly { x: number; y: number }[], bead: number) {
  g.lineStyle(bead * 0.5, 0x6d7480, 1).strokePoints(pts as Phaser.Math.Vector2[], false);
  pts.slice(1, -1).forEach((p) => {
    g.fillStyle(0xb8c0cc, 1).fillCircle(p.x, p.y, bead);
    g.lineStyle(1, 0x4a505c, 1).strokeCircle(p.x, p.y, bead);
  });
  const end = pts[pts.length - 1]!;
  const prev = pts[pts.length - 2]!;
  const a = Math.atan2(end.y - prev.y, end.x - prev.x);
  const tip = [
    { x: end.x + Math.cos(a) * bead * 3.4, y: end.y + Math.sin(a) * bead * 3.4 },
    { x: end.x - Math.sin(a) * bead * 1.5, y: end.y + Math.cos(a) * bead * 1.5 },
    { x: end.x + Math.sin(a) * bead * 1.5, y: end.y - Math.cos(a) * bead * 1.5 },
  ];
  g.fillStyle(0xdfe6f0, 1).fillPoints(tip as Phaser.Math.Vector2[], true);
  g.fillStyle(0xb8383e, 1).fillCircle(end.x, end.y, bead * 0.9);
}

/** The weapon in the ninja's hands, posed for the current swing phase. */
export function drawHeldWeapon(g: Phaser.GameObjects.Graphics, id: WeaponId, p: Pose) {
  const wind = windAmount(p);
  switch (id) {
    case 'fan': {
      // Closed fan at rest; pulled back and opening during windup; snapped open on the strike.
      const open = p.phase === 'idle' ? 0 : p.phase === 'windup' ? p.t * 0.6 : 1 - Math.max(0, (p.t - 0.5) * 2);
      const back = wind * 1.2;
      const hx = lerp(9, 3, wind);
      const hy = lerp(11, 16, wind);
      const h = hand(g, p, hx, hy);
      const dir = p.facing + lerp(0.25, 1.5, back / 1.2) - (p.phase === 'strike' ? 0.25 : 0);
      const spread = lerp(0.12, 1.9, open);
      const r = 17;
      g.fillStyle(0xb8322a, 1);
      g.beginPath();
      g.slice(h.x, h.y, r, dir - spread / 2, dir + spread / 2, false);
      g.fillPath();
      // Ribs and gold rim.
      g.lineStyle(1, 0x2a1210, 0.8);
      for (let i = 0; i <= 6; i++) {
        const a = dir - spread / 2 + (spread * i) / 6;
        g.lineBetween(h.x, h.y, h.x + Math.cos(a) * r, h.y + Math.sin(a) * r);
      }
      g.lineStyle(2, 0xd9ae4a, 1);
      g.beginPath();
      g.arc(h.x, h.y, r, dir - spread / 2, dir + spread / 2, false);
      g.strokePath();
      if (open > 0.5) {
        // A painted flame on the open fan.
        g.fillStyle(0xffb03a, 0.9).fillCircle(h.x + Math.cos(dir) * r * 0.62, h.y + Math.sin(dir) * r * 0.62, 3);
      }
      hand(g, p, 7, -10);
      break;
    }
    case 'thunder-fan': {
      // The fire fan, opened wider, with a lightning leaf instead of a flame.
      const open = p.phase === 'idle' ? 0.35 : p.phase === 'windup' ? 0.4 + p.t * 0.6 : 1 - Math.max(0, (p.t - 0.45) * 2);
      const back = wind * 1.2;
      const h = hand(g, p, lerp(9, 2, wind), lerp(11, 16, wind));
      const dir = p.facing + lerp(0.25, 1.5, back / 1.2) - (p.phase === 'strike' ? 0.25 : 0);
      const spread = lerp(0.2, 2.15, open);
      const r = 26;
      g.fillStyle(0x1d4f86, 1);
      g.beginPath();
      g.slice(h.x, h.y, r, dir - spread / 2, dir + spread / 2, false);
      g.fillPath();
      g.lineStyle(1.4, 0x071422, 0.8);
      for (let i = 0; i <= 8; i++) {
        const a = dir - spread / 2 + (spread * i) / 8;
        g.lineBetween(h.x, h.y, h.x + Math.cos(a) * r, h.y + Math.sin(a) * r);
      }
      g.lineStyle(2, 0xe7f6ff, 1);
      g.beginPath();
      g.arc(h.x, h.y, r, dir - spread / 2, dir + spread / 2, false);
      g.strokePath();
      if (open > 0.4) {
        const tip = { x: h.x + Math.cos(dir) * r * 0.72, y: h.y + Math.sin(dir) * r * 0.72 };
        g.lineStyle(2, 0xfff6c2, 1);
        g.beginPath();
        g.moveTo(h.x + Math.cos(dir) * 6, h.y + Math.sin(dir) * 6);
        g.lineTo(tip.x - Math.sin(dir) * 5, tip.y + Math.cos(dir) * 5);
        g.lineTo(tip.x, tip.y);
        g.strokePath();
      }
      hand(g, p, 7, -10);
      break;
    }
    case 'shuriken': {
      const thrown = p.phase === 'strike' && p.t < 0.7;
      const hx = p.phase === 'strike' ? lerp(17, 9, p.t) : lerp(9, -3, wind);
      const hy = p.phase === 'strike' ? lerp(5, 11, p.t) : lerp(11, 15, wind);
      const h = hand(g, p, hx, hy);
      if (!thrown) drawShurikenStar(g, h.x + Math.cos(p.facing) * 3, h.y + Math.sin(p.facing) * 3, 8, p.time * (p.phase === 'windup' ? 14 : 2));
      hand(g, p, 7, -10);
      break;
    }
    case 'hammer': {
      // Swung from over the back shoulder down onto the ground in front.
      let ang = 0.95;
      if (p.phase === 'windup') ang = lerp(0.95, 2.6, p.t);
      else if (p.phase === 'strike') ang = p.t < 0.25 ? lerp(2.6, 0, p.t / 0.25) : lerp(0, 0.95, (p.t - 0.25) / 0.75);
      const base = toWorld(p, 6, 0);
      const a = p.facing + ang;
      const len = p.phase === 'strike' && p.t < 0.4 ? 34 : 26;
      const head = { x: base.x + Math.cos(a) * len, y: base.y + Math.sin(a) * len };
      g.lineStyle(4, 0x5a3a1e, 1).lineBetween(base.x, base.y, head.x, head.y);
      // Iron head: a rotated box with bands.
      const c = Math.cos(a);
      const s = Math.sin(a);
      const box = (fx: number, fy: number) => ({ x: head.x + c * fx - s * fy, y: head.y + s * fx + c * fy });
      g.fillStyle(0x4b505b, 1).fillPoints([box(-5, -9), box(6, -9), box(6, 9), box(-5, 9)] as Phaser.Math.Vector2[], true);
      g.lineStyle(1.5, 0x22252b, 1).strokePoints([box(-5, -9), box(6, -9), box(6, 9), box(-5, 9)] as Phaser.Math.Vector2[], true);
      g.lineStyle(2, 0xd9ae4a, 1).lineBetween(box(-1, -9).x, box(-1, -9).y, box(-1, 9).x, box(-1, 9).y);
      hand(g, p, 8, 6);
      hand(g, p, 5, -4);
      break;
    }
    case 'daggers': {
      // Twin kunai; they cross in front on the strike.
      const strike = p.phase === 'strike' ? Math.max(0, 1 - p.t * 1.6) : 0;
      for (const side of [1, -1]) {
        const hx = lerp(lerp(9, 4, wind), 17, strike);
        const hy = side * lerp(lerp(11, 15, wind), -5, strike);
        const h = hand(g, p, hx, hy);
        const a = p.facing + side * lerp(lerp(0.1, 0.5, wind), -0.7, strike);
        kunai(g, h.x, h.y, a, 13);
      }
      break;
    }
    case 'kusarigama': {
      // Sickle in the right hand, chain weight in the left; on the strike the sickle is out on its chain.
      const h = hand(g, p, lerp(9, 3, wind), lerp(11, 15, wind));
      const throwing = p.phase === 'strike' && p.t < 0.5;
      if (!throwing) sickle(g, h.x, h.y, p.facing + lerp(0.2, 1.4, wind), 16);
      const l = hand(g, p, 7, -10);
      const sway = Math.sin(p.time * 3) * 2;
      const wt = toWorld(p, 4 + sway, -20);
      g.lineStyle(1.2, 0x9aa0ab, 1).lineBetween(l.x, l.y, wt.x, wt.y);
      g.fillStyle(0x3d424c, 1).fillCircle(wt.x, wt.y, 3.5);
      break;
    }
    case 'bomb': {
      // Raised over the shoulder, thrown in a high arc near the end of the windup.
      const flying = p.phase === 'windup' && p.t > 0.55;
      const h = hand(g, p, lerp(9, -2, wind), lerp(11, 16, wind));
      if (flying && p.reach) {
        const k = (p.t - 0.55) / 0.45;
        const target = toWorld(p, p.reach * k, 0);
        const lift = Math.sin(k * Math.PI) * 30;
        g.fillStyle(0x000000, 0.25).fillEllipse(target.x, target.y + 4, 12, 6);
        bombBall(g, target.x, target.y - lift, 6 + Math.sin(k * Math.PI) * 3, p.time);
      } else if (p.phase !== 'strike' || p.t > 0.6) {
        bombBall(g, h.x + Math.cos(p.facing) * 3, h.y + Math.sin(p.facing) * 3, 6, p.time);
      }
      hand(g, p, 7, -10);
      break;
    }
    case 'ninjato': {
      // Held low and back, then thrust forward as you lunge.
      const strike = p.phase === 'strike' ? Math.max(0, 1 - p.t * 1.5) : 0;
      const h = hand(g, p, lerp(lerp(8, 2, wind), 16, strike), lerp(lerp(11, 14, wind), 4, strike));
      ninjato(g, h.x, h.y, p.facing + lerp(lerp(0.5, 1.3, wind), -0.1, strike), 22);
      hand(g, p, lerp(6, 12, strike), lerp(-8, 0, strike));
      break;
    }
    case 'yari': {
      // Pull the shaft back with both hands, then drive it straight forward.
      const thrust = p.phase === 'strike' ? Math.max(0, 1 - p.t * 1.6) : 0;
      const shift = -wind * 10 + thrust * 20;
      const centre = toWorld(p, 17 + shift, 7 * (1 - thrust));
      spear(g, centre.x, centre.y, p.facing + 0.08 * (1 - thrust), 72, p.color);
      hand(g, p, 11 + shift * 0.5, 5);
      hand(g, p, -5 + shift * 0.5, -3);
      break;
    }
    case 'nunchaku': {
      // One stick in the hand, the other swinging on its chain: whirled through the windup, gone while it strikes.
      const h = hand(g, p, lerp(9, 6, wind), lerp(11, 13, wind));
      if (p.phase === 'strike' && p.t < 0.5) { hand(g, p, 7, -10); break; }
      const held = p.facing + lerp(0.3, -0.6, wind);
      nunchakuStick(g, h.x, h.y, held, 11);
      const end = { x: h.x + Math.cos(held) * 11, y: h.y + Math.sin(held) * 11 };
      const swing = p.phase === 'windup' ? p.time * (10 + p.t * 22) : held + 1.2 + Math.sin(p.time * 2.5) * 0.25;
      const link = { x: end.x + Math.cos(swing) * 4, y: end.y + Math.sin(swing) * 4 };
      g.lineStyle(1.2, 0x9aa0ab, 1).lineBetween(end.x, end.y, link.x, link.y);
      nunchakuStick(g, link.x, link.y, swing, 11);
      hand(g, p, 7, -10);
      break;
    }
    case 'whip': {
      // The handle in the hand and the chain coiled beside it, whirled overhead through the windup.
      const h = hand(g, p, lerp(9, 4, wind), lerp(11, 14, wind));
      const grip = toWorld(p, lerp(9, 4, wind) + 7, lerp(11, 14, wind));
      g.lineStyle(4, 0x3a2a1c, 1).lineBetween(h.x, h.y, grip.x, grip.y);
      if (p.phase === 'strike' && p.t < 0.6) { hand(g, p, 7, -10); break; }
      const pts = [grip];
      for (let k = 1; k <= 9; k++) {
        if (p.phase === 'windup') {
          const a = p.time * (8 + p.t * 16) + k * 0.55;
          const r = 4 + k * 1.6;
          pts.push({ x: grip.x + Math.cos(a) * r, y: grip.y + Math.sin(a) * r });
        } else {
          const sway = Math.sin(p.time * 2.2 + k * 0.6) * 1.5;
          pts.push(toWorld(p, 13 - k * 2.4 + sway, 13 + k * 1.9));
        }
      }
      whipChain(g, pts, 1.8);
      hand(g, p, 7, -10);
      break;
    }
    case 'staff': {
      // Held across the body in both hands; twirled through the windup, then whipped round on the strike.
      let ang = Math.PI / 2;
      if (p.phase === 'windup') ang = Math.PI / 2 + p.t * Math.PI * 1.0;
      else if (p.phase === 'strike') ang = p.t < 0.4 ? lerp(0, Math.PI, p.t / 0.4) : Math.PI / 2;
      const c = toWorld(p, 6, 0);
      const a = p.facing + ang;
      const half = 26;
      const e1 = { x: c.x + Math.cos(a) * half, y: c.y + Math.sin(a) * half };
      const e2 = { x: c.x - Math.cos(a) * half, y: c.y - Math.sin(a) * half };
      // A pale blue bar of ice with a bright core, crystal tips and a frosty shimmer.
      g.lineStyle(5, 0x7cc8ee, 1).lineBetween(e1.x, e1.y, e2.x, e2.y);
      g.lineStyle(2, 0xeaf9ff, 1).lineBetween(e1.x, e1.y, e2.x, e2.y);
      for (const e of [e1, e2]) iceCrystal(g, e.x, e.y, a + (e === e1 ? 0 : Math.PI), 4);
      g.fillStyle(0xffffff, 1).fillCircle(c.x + Math.cos(a) * 8, c.y + Math.sin(a) * 8, 1.4).fillCircle(c.x - Math.cos(a) * 8, c.y - Math.sin(a) * 8, 1.4);
      g.fillStyle(0xf1c9a0, 1).fillCircle(c.x + Math.cos(a) * 6, c.y + Math.sin(a) * 6, 3.2).fillCircle(c.x - Math.cos(a) * 6, c.y - Math.sin(a) * 6, 3.2);
      break;
    }
    case 'kunai': {
      // A fan of three kunai between the fingers, gone while they fly.
      const thrown = p.phase === 'strike' && p.t < 0.6;
      const h = hand(g, p, p.phase === 'strike' ? lerp(16, 9, p.t) : lerp(9, -2, wind), lerp(11, 15, wind));
      if (!thrown) for (const k of [-1, 0, 1]) kunai(g, h.x, h.y, p.facing + k * 0.35 - wind * 0.6, 11);
      hand(g, p, 7, -10);
      break;
    }
    case 'fire-kunai': {
      const thrown = p.phase === 'strike' && p.t < 0.55;
      const h = hand(g, p, p.phase === 'strike' ? lerp(18, 8, p.t) : lerp(9, -2, wind), lerp(11, 15, wind));
      if (!thrown) for (const k of [-1, 0, 1]) {
        const a = p.facing + k * 0.42 - wind * 0.5;
        kunai(g, h.x, h.y, a, 18);
        g.fillStyle(0xffb45a, 0.9).fillCircle(h.x + Math.cos(a) * 16, h.y + Math.sin(a) * 16, 2.4);
      }
      hand(g, p, 7, -10);
      break;
    }
    case 'talisman': {
      // The talisman glows brighter through the windup.
      const h = hand(g, p, lerp(9, 13, wind), lerp(11, 4, wind));
      const glow = p.phase === 'windup' ? p.t : 0;
      if (!(p.phase === 'strike' && p.t < 0.5)) talismanPaper(g, h.x, h.y, p.facing - 0.4, 12, glow);
      hand(g, p, 7, -10);
      break;
    }
    case 'flail': {
      // Chain weight: hangs at rest, whirls faster through the windup.
      const h = hand(g, p, 9, 11);
      let wx: number;
      let wy: number;
      if (p.phase === 'windup') {
        const a = p.time * (8 + p.t * 18);
        wx = h.x + Math.cos(a) * 12;
        wy = h.y + Math.sin(a) * 12;
      } else if (p.phase === 'strike') {
        // The whirl itself is drawn by the effect; the weight snaps back to the hand.
        const back = toWorld(p, 14, 20);
        wx = lerp(h.x, back.x, p.t);
        wy = lerp(h.y, back.y, p.t);
      } else {
        const sway = Math.sin(p.time * 2.5) * 2;
        const rest = toWorld(p, 12 + sway, 20);
        wx = rest.x;
        wy = rest.y;
      }
      g.lineStyle(1.5, 0x9aa0ab, 1).lineBetween(h.x, h.y, wx, wy);
      g.fillStyle(0x3d424c, 1).fillCircle(wx, wy, 5);
      g.lineStyle(1, 0xd9ae4a, 1).strokeCircle(wx, wy, 5);
      hand(g, p, 7, -10);
      break;
    }
  }
}

function sickle(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, size: number) {
  // Short wooden handle with a curved blade at the end.
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const ex = x + c * size * 0.7;
  const ey = y + s * size * 0.7;
  g.lineStyle(size * 0.18, 0x6b3f1f, 1).lineBetween(x, y, ex, ey);
  g.lineStyle(size * 0.16, 0xd3d8e2, 1);
  g.beginPath();
  g.arc(ex - s * size * 0.45, ey + c * size * 0.45, size * 0.45, angle - Math.PI / 2 - 0.2, angle + 0.9, false);
  g.strokePath();
}

/** Straight ninja sword: dark wrapped grip, square guard, blade. */
function ninjato(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, len: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const at = (f: number, side: number) => ({ x: x + c * f - s * side, y: y + s * f + c * side });
  g.lineStyle(3, 0x1e1e22, 1).lineBetween(at(-len * 0.3, 0).x, at(-len * 0.3, 0).y, at(0, 0).x, at(0, 0).y);
  g.fillStyle(0xd9ae4a, 1).fillPoints([at(-1, -3.5), at(1.5, -3.5), at(1.5, 3.5), at(-1, 3.5)] as Phaser.Math.Vector2[], true);
  g.fillStyle(0xdfe4ee, 1).fillPoints([at(1.5, -1.6), at(len, -1.2), at(len + 3, 0), at(len, 1.2), at(1.5, 1.6)] as Phaser.Math.Vector2[], true);
}

/** Paper talisman (お札) with a red lightning mark, held between the fingers. */
function talismanPaper(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, size: number, glow: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const at = (f: number, side: number) => ({ x: x + c * f - s * side, y: y + s * f + c * side });
  if (glow > 0) g.fillStyle(0x9fd8ff, 0.35 * glow).fillCircle(at(size * 0.5, 0).x, at(size * 0.5, 0).y, size * 0.9);
  g.fillStyle(0xefe3c4, 1).fillPoints([at(0, -size * 0.3), at(size, -size * 0.3), at(size, size * 0.3), at(0, size * 0.3)] as Phaser.Math.Vector2[], true);
  g.lineStyle(1.2, 0xb8322a, 1);
  g.beginPath();
  const p0 = at(size * 0.15, -size * 0.12);
  const p1 = at(size * 0.45, size * 0.12);
  const p2 = at(size * 0.55, -size * 0.12);
  const p3 = at(size * 0.85, size * 0.12);
  g.moveTo(p0.x, p0.y);
  g.lineTo(p1.x, p1.y);
  g.lineTo(p2.x, p2.y);
  g.lineTo(p3.x, p3.y);
  g.strokePath();
}

function bombBall(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, time: number) {
  g.fillStyle(0x1e2026, 1).fillCircle(x, y, r);
  g.fillStyle(0xffffff, 0.18).fillCircle(x - r * 0.3, y - r * 0.35, r * 0.4);
  g.lineStyle(1.5, 0x8a6a3a, 1).lineBetween(x + r * 0.5, y - r * 0.6, x + r * 0.9, y - r * 1.1);
  // Sputtering fuse.
  const flick = 0.6 + 0.4 * Math.sin(time * 40);
  g.fillStyle(0xffd060, flick).fillCircle(x + r * 0.95, y - r * 1.15, r * 0.35);
}

/** Small standalone weapon icon for menus, centred at (x, y), roughly `size` across. */
export function drawWeaponIcon(g: Phaser.GameObjects.Graphics, id: WeaponId, x: number, y: number, size: number, color: number) {
  const s = size / 40;
  switch (id) {
    case 'fan': {
      // Open fan, pivot at the bottom centre so it stays inside its box.
      const px = x;
      const py = y + 14 * s;
      const r = 26 * s;
      const a0 = -Math.PI * 0.85;
      const a1 = -Math.PI * 0.15;
      g.fillStyle(0xb8322a, 1);
      g.beginPath();
      g.slice(px, py, r, a0, a1, false);
      g.fillPath();
      g.lineStyle(1, 0x2a1210, 0.8);
      for (let i = 0; i <= 6; i++) {
        const a = a0 + ((a1 - a0) * i) / 6;
        g.lineBetween(px, py, px + Math.cos(a) * r, py + Math.sin(a) * r);
      }
      g.lineStyle(2, 0xd9ae4a, 1);
      g.beginPath();
      g.arc(px, py, r, a0, a1, false);
      g.strokePath();
      g.fillStyle(0xffb03a, 1).fillCircle(px, py - r * 0.6, 4 * s);
      break;
    }
    case 'thunder-fan': {
      const px = x;
      const py = y + 16 * s;
      const r = 32 * s;
      const a0 = -Math.PI * 0.9;
      const a1 = -Math.PI * 0.1;
      g.fillStyle(0x1d4f86, 1);
      g.beginPath();
      g.slice(px, py, r, a0, a1, false);
      g.fillPath();
      g.lineStyle(1, 0x071422, 0.8);
      for (let i = 0; i <= 8; i++) {
        const a = a0 + ((a1 - a0) * i) / 8;
        g.lineBetween(px, py, px + Math.cos(a) * r, py + Math.sin(a) * r);
      }
      g.lineStyle(2, 0xe7f6ff, 1);
      g.beginPath();
      g.arc(px, py, r, a0, a1, false);
      g.strokePath();
      g.lineStyle(2, 0xfff6c2, 1).lineBetween(px, py - 4 * s, px - 4 * s, py - r * 0.45).lineBetween(px - 4 * s, py - r * 0.45, px + 2 * s, py - r * 0.85);
      break;
    }
    case 'shuriken':
      drawShurikenStar(g, x, y, 20 * s, 0.3);
      break;
    case 'hammer': {
      g.lineStyle(5 * s, 0x5a3a1e, 1).lineBetween(x - 14 * s, y + 14 * s, x + 6 * s, y - 6 * s);
      const pts = [
        { x: x + 2 * s, y: y - 18 * s }, { x: x + 18 * s, y: y - 2 * s }, { x: x + 10 * s, y: y + 6 * s }, { x: x - 6 * s, y: y - 10 * s },
      ];
      g.fillStyle(0x4b505b, 1).fillPoints(pts as Phaser.Math.Vector2[], true);
      g.lineStyle(1.5, 0x22252b, 1).strokePoints(pts as Phaser.Math.Vector2[], true);
      break;
    }
    case 'daggers':
      kunai(g, x - 4 * s, y + 6 * s, -Math.PI / 4, 22 * s);
      kunai(g, x + 4 * s, y + 6 * s, (-3 * Math.PI) / 4, 22 * s);
      break;
    case 'kusarigama':
      g.lineStyle(1.5, 0x9aa0ab, 1);
      g.beginPath();
      g.arc(x + 4 * s, y + 4 * s, 12 * s, Math.PI * 0.6, Math.PI * 1.7, false);
      g.strokePath();
      sickle(g, x + 6 * s, y + 10 * s, -Math.PI / 3, 26 * s);
      g.fillStyle(0x3d424c, 1).fillCircle(x - 8 * s, y + 4 * s, 4 * s);
      break;
    case 'bomb':
      bombBall(g, x, y + 3 * s, 13 * s, 0);
      break;
    case 'ninjato':
      ninjato(g, x - 14 * s, y + 14 * s, -Math.PI / 4, 34 * s);
      break;
    case 'yari':
      spear(g, x, y, -Math.PI / 4, 42 * s, color);
      break;
    case 'talisman':
      talismanPaper(g, x - 7 * s, y + 13 * s, -Math.PI / 2, 26 * s, 1);
      break;
    case 'nunchaku': {
      // Two sticks spread in a V, joined by a short chain at the top.
      const l = { x: x - 4 * s, y: y - 12 * s };
      const r = { x: x + 4 * s, y: y - 12 * s };
      g.lineStyle(1.5, 0x9aa0ab, 1);
      g.beginPath();
      g.arc(x, y - 12 * s, 4 * s, Math.PI, 0, false);
      g.strokePath();
      nunchakuStick(g, l.x, l.y, Math.PI * 0.62, 26 * s);
      nunchakuStick(g, r.x, r.y, Math.PI * 0.3, 26 * s);
      break;
    }
    case 'whip': {
      // The chain in an S, from the handle at the bottom left to the dart at the top right.
      const pts = Array.from({ length: 10 }, (_, k) => {
        const u = k / 9;
        return { x: x - 15 * s + 30 * s * u + Math.sin(u * Math.PI * 2) * 7 * s, y: y + 15 * s - 30 * s * u + Math.sin(u * Math.PI * 2) * 7 * s };
      });
      g.lineStyle(5 * s, 0x3a2a1c, 1).lineBetween(x - 21 * s, y + 21 * s, pts[0]!.x, pts[0]!.y);
      whipChain(g, pts, 2.6 * s);
      break;
    }
    case 'staff': {
      const a = -Math.PI / 4;
      g.lineStyle(6 * s, 0x7cc8ee, 1).lineBetween(x - Math.cos(a) * 22 * s, y - Math.sin(a) * 22 * s, x + Math.cos(a) * 22 * s, y + Math.sin(a) * 22 * s);
      g.lineStyle(2.4 * s, 0xeaf9ff, 1).lineBetween(x - Math.cos(a) * 22 * s, y - Math.sin(a) * 22 * s, x + Math.cos(a) * 22 * s, y + Math.sin(a) * 22 * s);
      iceCrystal(g, x - Math.cos(a) * 22 * s, y - Math.sin(a) * 22 * s, a + Math.PI, 5 * s);
      iceCrystal(g, x + Math.cos(a) * 22 * s, y + Math.sin(a) * 22 * s, a, 5 * s);
      g.fillStyle(0xffffff, 1).fillCircle(x - Math.cos(a) * 8 * s, y - Math.sin(a) * 8 * s, 2 * s).fillCircle(x + Math.cos(a) * 8 * s, y + Math.sin(a) * 8 * s, 2 * s);
      break;
    }
    case 'kunai':
      for (const k of [-1, 0, 1]) kunai(g, x - 2 * s, y + 14 * s, -Math.PI / 2 + k * 0.45, 26 * s);
      break;
    case 'fire-kunai':
      for (const k of [-1, 0, 1]) {
        const a = -Math.PI / 2 + k * 0.5;
        kunai(g, x - 2 * s, y + 16 * s, a, 34 * s);
        g.fillStyle(0xff7a32, 1).fillCircle(x - 2 * s + Math.cos(a) * 30 * s, y + 16 * s + Math.sin(a) * 30 * s, 3 * s);
      }
      break;
    case 'flail':
      g.lineStyle(1.5, 0x9aa0ab, 1);
      g.beginPath();
      g.arc(x, y, 13 * s, Math.PI * 0.2, Math.PI * 1.6, false);
      g.strokePath();
      g.fillStyle(0x3d424c, 1).fillCircle(x + Math.cos(Math.PI * 1.6) * 13 * s, y + Math.sin(Math.PI * 1.6) * 13 * s, 6 * s);
      g.lineStyle(1, 0xd9ae4a, 1).strokeCircle(x + Math.cos(Math.PI * 1.6) * 13 * s, y + Math.sin(Math.PI * 1.6) * 13 * s, 6 * s);
      g.fillStyle(color, 1).fillCircle(x + Math.cos(Math.PI * 0.2) * 13 * s, y + Math.sin(Math.PI * 0.2) * 13 * s, 3 * s);
      break;
  }
}

/** A small ice crystal: a pointed diamond at (x, y) pointing along `angle`, `r` long. */
function iceCrystal(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, r: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const tip = { x: x + c * r * 1.6, y: y + s * r * 1.6 };
  const l = { x: x - s * r * 0.8, y: y + c * r * 0.8 };
  const rr = { x: x + s * r * 0.8, y: y - c * r * 0.8 };
  const back = { x: x - c * r * 0.6, y: y - s * r * 0.6 };
  g.fillStyle(0xcdeeff, 1).fillPoints([tip, l, back, rr] as Phaser.Math.Vector2[], true);
  g.lineStyle(1, 0x5aaedc, 1).strokePoints([tip, l, back, rr] as Phaser.Math.Vector2[], true);
}

/** The wooden log a fallen ninja leaves behind (替身術). */
export function drawLog(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, alpha = 1) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const at = (fx: number, fy: number) => ({ x: x + c * fx - s * fy, y: y + s * fx + c * fy });
  g.fillStyle(0x000000, 0.25 * alpha).fillEllipse(x + 3, y + 6, 40, 14);
  g.fillStyle(0x7a4f2a, alpha).fillPoints([at(-17, -7), at(17, -7), at(17, 7), at(-17, 7)] as Phaser.Math.Vector2[], true);
  g.lineStyle(1, 0x4a2e16, alpha);
  g.lineBetween(at(-14, -2).x, at(-14, -2).y, at(12, -3).x, at(12, -3).y);
  g.lineBetween(at(-10, 3).x, at(-10, 3).y, at(14, 2).x, at(14, 2).y);
  for (const end of [-17, 17]) {
    const e = at(end, 0);
    g.fillStyle(0xc9995e, alpha).fillCircle(e.x, e.y, 7);
    g.lineStyle(1, 0x7a4f2a, alpha).strokeCircle(e.x, e.y, 4.5).strokeCircle(e.x, e.y, 7);
  }
}

// ---------- items ----------

/** Paper talisman (お札) with a symbol drawn by `mark`. */
function ofuda(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, mark: (cx: number, cy: number, r: number) => void) {
  const w = size * 0.56;
  const h = size * 0.92;
  g.fillStyle(0xefe3c4, 1).fillRect(x - w / 2, y - h / 2, w, h);
  g.lineStyle(1.5, 0xb8322a, 1).strokeRect(x - w / 2 + 2, y - h / 2 + 2, w - 4, h - 4);
  g.lineStyle(1, 0x6b4a24, 1).strokeRect(x - w / 2, y - h / 2, w, h);
  mark(x, y, size * 0.2);
}

/** Item icon centred at (x, y), about `size` across. */
export function drawItemIcon(g: Phaser.GameObjects.Graphics, id: string, x: number, y: number, size: number) {
  const s = size;
  switch (id) {
    case 'rice-ball': {
      // Onigiri: rounded white triangle with a nori wrap.
      const pts = [{ x, y: y - s * 0.42 }, { x: x + s * 0.44, y: y + s * 0.36 }, { x: x - s * 0.44, y: y + s * 0.36 }];
      g.fillStyle(0xfbfbf4, 1).fillPoints(pts as Phaser.Math.Vector2[], true);
      g.lineStyle(s * 0.1, 0xfbfbf4, 1).strokePoints(pts as Phaser.Math.Vector2[], true);
      g.fillStyle(0x1f2a1f, 1).fillRect(x - s * 0.2, y + s * 0.06, s * 0.4, s * 0.34);
      g.fillStyle(0x9aa08a, 1).fillCircle(x - s * 0.12, y - s * 0.12, s * 0.03).fillCircle(x + s * 0.08, y - s * 0.02, s * 0.03);
      break;
    }
    case 'stamina-tea': {
      // Yunomi cup of green tea with steam.
      g.fillStyle(0x8a5a32, 1).fillPoints([
        { x: x - s * 0.32, y: y - s * 0.12 }, { x: x + s * 0.32, y: y - s * 0.12 }, { x: x + s * 0.24, y: y + s * 0.4 }, { x: x - s * 0.24, y: y + s * 0.4 },
      ] as Phaser.Math.Vector2[], true);
      g.fillStyle(0x6fbf5a, 1).fillEllipse(x, y - s * 0.12, s * 0.64, s * 0.18);
      g.lineStyle(1, 0x4a2e16, 1).lineBetween(x - s * 0.28, y + s * 0.12, x + s * 0.28, y + s * 0.12);
      g.lineStyle(1.5, 0xffffff, 0.8);
      for (const dx of [-0.12, 0.1]) {
        g.beginPath();
        g.moveTo(x + s * dx, y - s * 0.24);
        g.lineTo(x + s * (dx + 0.06), y - s * 0.34);
        g.lineTo(x + s * dx, y - s * 0.44);
        g.strokePath();
      }
      break;
    }
    case 'fury-pill': {
      g.fillStyle(0x7a1410, 1).fillCircle(x, y, s * 0.36);
      g.fillStyle(0xd23a2a, 1).fillCircle(x - s * 0.04, y - s * 0.04, s * 0.3);
      g.fillStyle(0xffb03a, 1).fillTriangle(x - s * 0.1, y + s * 0.12, x + s * 0.1, y + s * 0.12, x, y - s * 0.18);
      g.fillStyle(0xffffff, 0.6).fillCircle(x - s * 0.14, y - s * 0.16, s * 0.07);
      break;
    }
    case 'bell-charm':
      ofuda(g, x, y, s, (cx, cy, r) => {
        g.fillStyle(0xd9ae4a, 1).fillCircle(cx, cy - r * 0.2, r * 0.9);
        g.fillRect(cx - r, cy - r * 0.2, r * 2, r * 0.9);
        g.fillStyle(0x6b4a24, 1).fillCircle(cx, cy + r * 0.85, r * 0.3);
      });
      break;
    case 'wind-charm':
      ofuda(g, x, y, s, (cx, cy, r) => {
        g.lineStyle(1.8, 0x2f8fa8, 1);
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 1.5, false);
        g.strokePath();
        g.beginPath();
        g.arc(cx, cy, r * 0.5, Math.PI, Math.PI * 2.5, false);
        g.strokePath();
      });
      break;
    case 'fire-charm':
      ofuda(g, x, y, s, (cx, cy, r) => {
        g.fillStyle(0xf2552a, 1).fillCircle(cx, cy + r * 0.3, r * 0.8);
        g.fillTriangle(cx - r * 0.8, cy + r * 0.3, cx + r * 0.8, cy + r * 0.3, cx, cy - r * 1.3);
        g.fillStyle(0xffd060, 1).fillCircle(cx, cy + r * 0.45, r * 0.4);
      });
      break;
    case 'spirit-pill': {
      // Blue pill with a swirl of qi.
      g.fillStyle(0x8fc0ff, 0.35).fillCircle(x, y, s * 0.46);
      g.fillStyle(0x2f5fb8, 1).fillCircle(x, y, s * 0.32);
      g.lineStyle(1.5, 0xd9ae4a, 1).strokeCircle(x, y, s * 0.32);
      g.lineStyle(1.5, 0xffffff, 0.9);
      g.beginPath();
      g.arc(x, y, s * 0.16, 0, Math.PI * 1.4, false);
      g.strokePath();
      break;
    }
    case 'revival-pill': {
      g.fillStyle(0xff9fd0, 0.35).fillCircle(x, y, s * 0.46);
      g.fillStyle(0xc2417f, 1).fillCircle(x, y, s * 0.32);
      g.lineStyle(1.5, 0xd9ae4a, 1).strokeCircle(x, y, s * 0.32);
      g.fillStyle(0xffffff, 1).fillRect(x - s * 0.04, y - s * 0.16, s * 0.08, s * 0.32).fillRect(x - s * 0.16, y - s * 0.04, s * 0.32, s * 0.08);
      break;
    }
  }
}
