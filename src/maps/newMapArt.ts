import { HEIGHT, HUD_HEIGHT, WIDTH } from '../config';
import { ARENA, WALL, blob, paintShadow, stoneBlock, type Ctx, type Obstacle, type TerrainZone } from './common';

/** Shared materials; each arena supplies its own layout and landmarks. */
export function paintTiles(ctx: Ctx, rand: () => number, base: string, grout: string, tile = 48) {
  ctx.fillStyle = base;
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  ctx.strokeStyle = grout;
  ctx.lineWidth = 1;
  for (let row = 0, y = ARENA.y; y < HEIGHT; row++, y += tile) {
    for (let x = ARENA.x - (row % 2) * tile / 2; x < WIDTH; x += tile) {
      ctx.strokeRect(x, y, tile, tile);
      ctx.fillStyle = `rgba(255,255,255,${rand() * 0.045})`;
      ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
      ctx.fillStyle = 'rgba(240,234,210,0.055)';
      ctx.fillRect(x + 2, y + 2, tile - 4, 1);
      ctx.fillStyle = 'rgba(9,14,20,0.12)';
      ctx.fillRect(x + 2, y + tile - 3, tile - 4, 1);
    }
  }
}

export function paintRim(ctx: Ctx, base: string, trim: string) {
  ctx.fillStyle = base;
  ctx.fillRect(0, HUD_HEIGHT, WIDTH, WALL);
  ctx.fillRect(0, HEIGHT - WALL, WIDTH, WALL);
  ctx.fillRect(0, HUD_HEIGHT, WALL, HEIGHT - HUD_HEIGHT);
  ctx.fillRect(WIDTH - WALL, HUD_HEIGHT, WALL, HEIGHT - HUD_HEIGHT);
  ctx.strokeStyle = trim;
  ctx.lineWidth = 2;
  ctx.strokeRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  for (let x = 44; x < WIDTH; x += 48) {
    ctx.fillStyle = trim;
    ctx.fillRect(x, HUD_HEIGHT + 8, 14, 4);
    ctx.fillRect(x, HEIGHT - 12, 14, 4);
  }
}

export function paintSlab(ctx: Ctx, o: Obstacle, base: string, trim: string) {
  paintShadow(ctx, o);
  stoneBlock(ctx, o.x - o.w / 2, o.y - o.h / 2, o.w, o.h, base, trim, '#151921');
  ctx.strokeStyle = trim;
  ctx.lineWidth = 1;
  ctx.strokeRect(o.x - o.w / 2 + 7, o.y - o.h / 2 + 7, o.w - 14, o.h - 14);
}

export function paintPool(ctx: Ctx, z: TerrainZone, base: string, ripple: string) {
  ctx.fillStyle = '#696d68';
  ctx.fillRect(z.x - z.w / 2 - 5, z.y - z.h / 2 - 5, z.w + 10, z.h + 10);
  ctx.fillStyle = base;
  ctx.fillRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h);
  ctx.strokeStyle = ripple;
  ctx.lineWidth = 1.5;
  for (let y = z.y - z.h / 2 + 12; y < z.y + z.h / 2 - 5; y += 16) {
    ctx.beginPath();
    for (let x = z.x - z.w / 2 + 6; x < z.x + z.w / 2 - 5; x += 4) {
      const py = y + Math.sin(x * 0.08) * 2;
      if (x === z.x - z.w / 2 + 6) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    ctx.stroke();
  }
}

export function paintRune(ctx: Ctx, x: number, y: number, r: number, color: string) {
  blob(ctx, x, y, r * 1.5, color);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (const radius of [r, r * 0.72]) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    ctx.save();
    ctx.translate(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86);
    ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.fillRect(-3, -2, 6, 4);
    ctx.restore();
  }
}
