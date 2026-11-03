import type { Ctx } from '@/maps/common';

type Surface = { x: number; y: number; w: number; h: number };
type WaterShape = 'rect' | 'round' | 'ellipse';
type WaterTheme = 'river' | 'pond' | 'spring' | 'blood';
const palettes = {
  river: { deep: '#092f48', light: '#b2e9e0', floor: '#b2ba94' },
  pond: { deep: '#0a303a', light: '#bce5ce', floor: '#aac7a3' },
  spring: { deep: '#2b777e', light: '#effff2', floor: '#daedd6' },
  blood: { deep: '#280910', light: '#ee9987', floor: '#733a3e' },
};

/** Baked depth, submerged stones and broken reflections inside the actual authored water outline. */
export function paintWaterSurface(ctx: Ctx, p: Surface, shape: WaterShape, theme: WaterTheme, rand: () => number) {
  if (p.w < 4 || p.h < 4) return;
  const colors = palettes[theme], l = p.x - p.w / 2, top = p.y - p.h / 2;
  ctx.save(); ctx.beginPath();
  if (shape === 'ellipse') ctx.ellipse(p.x, p.y, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
  else if (shape === 'round') ctx.roundRect(l, top, p.w, p.h, Math.min(24, p.w / 4, p.h / 4));
  else ctx.rect(l, top, p.w, p.h);
  ctx.clip();
  const depth = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, Math.max(p.w, p.h) * .6);
  depth.addColorStop(0, colors.deep + '60'); depth.addColorStop(.55, colors.deep + '24'); depth.addColorStop(1, colors.light + '28');
  ctx.fillStyle = depth; ctx.fillRect(l, top, p.w, p.h);
  const count = Math.min(120, Math.max(8, Math.round(p.w * p.h / 1700)));
  // Soft stones below the surface, rather than solid cover above it.
  for (let i = 0; i < count / 2; i++) {
    const x = l + rand() * p.w, y = top + rand() * p.h, r = 2 + rand() * 4;
    ctx.fillStyle = colors.floor + '1c'; ctx.beginPath(); ctx.ellipse(x, y, r, r * .55, rand(), 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < count; i++) {
    const x = l + rand() * p.w, y = top + rand() * p.h;
    const span = Math.min(p.w * .28, 8 + rand() * 22), phase = rand() * Math.PI * 2;
    ctx.strokeStyle = colors.light + (i % 3 ? '25' : '40'); ctx.lineWidth = i % 3 ? .7 : 1.1;
    // Interlaced caustic curves, kept short so they read as light under moving water.
    for (let branch = 0; branch < 2; branch++) {
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) {
        const px = x + (k / 6 - .5) * span, py = y + Math.sin(k * .8 + phase + branch) * 2.5 + branch * 3;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
  // A broad, broken reflection gives the water a surface without hiding its edge.
  ctx.strokeStyle = colors.light + '38'; ctx.lineWidth = 1.5;
  for (let k = 0; k < 4; k++) {
    const y = top + p.h * (.18 + k * .055), x = l + p.w * (.12 + k * .025);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + p.w * .18, y - 3, x + p.w * .4, y + 1); ctx.stroke();
  }
  ctx.restore();
}
