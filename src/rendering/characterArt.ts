import type * as Phaser from 'phaser';
import type { RoleId } from '@/gameplay/roles';

const css = (color: number, shade = 1) => '#' + [16, 8, 0].map(shift => Math.min(255, Math.round(((color >> shift) & 255) * shade)).toString(16).padStart(2, '0')).join('');

/** Role silhouettes layer over the shared ninja body; player colours stay on the shoulders and headband. */
export function paintRoleOutfit(ctx: CanvasRenderingContext2D, color: number, role: RoleId) {
  ctx.save();
  // Seams, lacing and layered cloth on the exposed back of the tunic.
  ctx.strokeStyle = '#74818b'; ctx.lineWidth = .7;
  ctx.beginPath(); ctx.moveTo(-12, -9); ctx.lineTo(-7, 0); ctx.lineTo(-12, 9); ctx.stroke();
  ctx.fillStyle = css(color, .65); ctx.fillRect(-13, -2, 7, 4);
  if (role === 'samurai') {
    for (const side of [-1, 1]) {
      // Three overlapping shoulder plates with gold lacing.
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = css(color, .55 + k * .14); ctx.strokeStyle = '#121b26'; ctx.lineWidth = .7;
        ctx.beginPath(); ctx.roundRect(-9 + k * .7, side * (11 + k * 1.7) - 2, 12 - k, 4.5, 1); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#d3b478'; ctx.fillRect(-6 + k * .7, side * (11 + k * 1.7) - .5, 1, 1);
      }
    }
    ctx.strokeStyle = '#394c62'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(2, 0, 11, Math.PI * .43, Math.PI * 1.57); ctx.stroke();
    // The kabuto's golden crescent curves around the back, leaving the face visible.
    ctx.strokeStyle = '#e2bc70'; ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.arc(1, 0, 13, Math.PI * .62, Math.PI * 1.38); ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(-3, side * 10); ctx.lineTo(0, side * 17); ctx.lineTo(2, side * 13); ctx.stroke();
    }
  } else if (role === 'ronin') {
    // A worn half-brim straw travelling hat, tilted back from the eyes.
    ctx.fillStyle = '#ae8c50'; ctx.strokeStyle = '#493b27'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.ellipse(-5, 0, 11, 12.5, 0, Math.PI * .5, Math.PI * 1.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#dfc58a'; ctx.lineWidth = .65;
    for (let k = 0; k <= 9; k++) {
      const a = Math.PI / 2 + k * Math.PI / 9;
      ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-5 + Math.cos(a) * 10, Math.sin(a) * 11.5); ctx.stroke();
    }
    ctx.strokeStyle = css(color); ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.ellipse(-5, 0, 7, 9, 0, Math.PI * .5, Math.PI * 1.5); ctx.stroke();
  } else if (role === 'mystic') {
    // Pale robe panels and a ritual stole frame the dark hood.
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#d6d3b5'; ctx.strokeStyle = '#766c54'; ctx.lineWidth = .7;
      ctx.beginPath(); ctx.moveTo(-12, side * 7); ctx.lineTo(-8, side * 17); ctx.lineTo(5, side * 15); ctx.lineTo(2, side * 11); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = css(color, .8); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-7, side * 13); ctx.lineTo(1, side * 13); ctx.stroke();
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = '#9f7547'; ctx.beginPath(); ctx.arc(-11 + k * 3, side * 9, 1.3, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.fillStyle = '#e5d7a2'; ctx.beginPath(); ctx.moveTo(-13, -2); ctx.lineTo(-10, -4); ctx.lineTo(-7, -2); ctx.lineTo(-10, 1); ctx.closePath(); ctx.fill();
  } else {
    // The light assassin outfit has dark segmented guards and silver stitching.
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#202f3d'; ctx.beginPath(); ctx.roundRect(-7, side * 13 - 2.5, 10, 5, 2); ctx.fill();
      ctx.strokeStyle = css(color, 1.15); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-6, side * 13); ctx.lineTo(1, side * 13); ctx.stroke();
    }
    ctx.strokeStyle = '#92a7b7'; ctx.lineWidth = .6;
    ctx.beginPath(); ctx.arc(3, 0, 7.5, 2.1, 4.2); ctx.stroke();
  }
  ctx.restore();
}

/** Small alternating steps beneath the body make walking visible without moving the collision centre. */
export function drawCharacterSteps(g: Phaser.GameObjects.Graphics, f: { x: number; y: number; facing: number; radius: number; vx: number; vy: number; index: number }, now: number) {
  const speed = Math.hypot(f.vx, f.vy), scale = f.radius / 18;
  if (speed < 12) return;
  const stride = Math.sin(now * Math.min(20, 9 + speed / 45) + f.index) * Math.min(4, speed / 55) * scale;
  const c = Math.cos(f.facing), s = Math.sin(f.facing);
  for (const side of [-1, 1]) {
    const forward = -7 * scale + side * stride, lateral = side * 14 * scale;
    const x = f.x + c * forward - s * lateral, y = f.y + s * forward + c * lateral;
    const a = { x: x - c * 2.5 * scale, y: y - s * 2.5 * scale }, b = { x: x + c * 2.5 * scale, y: y + s * 2.5 * scale };
    g.lineStyle(5 * scale, 0x111923, 1).lineBetween(a.x, a.y, b.x, b.y);
    g.lineStyle(1.3 * scale, 0x73818c, .8).lineBetween(x - s * scale, y + c * scale, b.x - s * scale, b.y + c * scale);
  }
}
