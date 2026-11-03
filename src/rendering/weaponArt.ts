import type * as Phaser from 'phaser';

/** Physical weapon details shared by held weapons and loadout icons. */
export function foldingFan(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, direction: number, spread: number, thunder = false) {
  const start = direction - spread / 2, end = direction + spread / 2;
  const ribs = thunder ? 8 : 6, scale = radius / 26;
  const point = (r: number, a: number) => ({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
  g.fillStyle(thunder ? 0x1d4f86 : 0xa62828, 1).beginPath().slice(x, y, radius, start, end, false).fillPath();
  for (let k = 0; k < ribs; k++) {
    const a = start + spread * k / ribs, b = a + spread / ribs;
    g.fillStyle(k % 2 ? (thunder ? 0x337eab : 0xe05b3b) : (thunder ? 0x173e68 : 0x79252a), 1)
      .fillPoints([{ x, y }, point(radius, a), point(radius, b)] as Phaser.Math.Vector2[], true);
  }
  for (let k = 0; k <= ribs; k++) {
    const tip = point(radius, start + spread * k / ribs);
    g.lineStyle(1.2 * scale, 0x1d202a, 1).lineBetween(x, y, tip.x, tip.y);
  }
  g.lineStyle(2.2 * scale, thunder ? 0xc4e8f5 : 0xe2ba61, 1).beginPath().arc(x, y, radius, start, end, false).strokePath();
  if (spread > .8) {
    const mark = point(radius * .6, direction);
    if (thunder) {
      const p = (f: number, side: number) => ({ x: mark.x + Math.cos(direction) * f - Math.sin(direction) * side, y: mark.y + Math.sin(direction) * f + Math.cos(direction) * side });
      g.lineStyle(2 * scale, 0xffefb5, 1).strokePoints([p(-6 * scale, 0), p(0, -3 * scale), p(0, 3 * scale), p(7 * scale, 0)] as Phaser.Math.Vector2[], false);
    } else {
      const tip = point(radius * .86, direction);
      g.fillStyle(0xffd27b, 1).fillTriangle(mark.x - Math.sin(direction) * 4 * scale, mark.y + Math.cos(direction) * 4 * scale, tip.x, tip.y, mark.x + Math.sin(direction) * 4 * scale, mark.y - Math.cos(direction) * 4 * scale);
    }
  }
  g.fillStyle(0xe2ba61, 1).fillCircle(x, y, 2 * scale);
}

export function warHammer(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, length: number, scale = 1) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const head = { x: x + c * length, y: y + s * length };
  const box = (f: number, side: number) => ({ x: head.x + (c * f - s * side) * scale, y: head.y + (s * f + c * side) * scale });
  const line = (f: number, side: number) => ({ x: x + (c * f - s * side) * scale, y: y + (s * f + c * side) * scale });
  g.lineStyle(4 * scale, 0x654127, 1).lineBetween(x, y, head.x, head.y);
  for (let k = 1; k <= 4; k++) {
    const a = line(k * 2, -2), b = line(k * 2 + 1, 2);
    g.lineStyle(1.1 * scale, 0xc79a64, 1).lineBetween(a.x, a.y, b.x, b.y);
  }
  const outline = [box(-5, -9), box(6, -9), box(6, 9), box(-5, 9)];
  g.fillStyle(0x4b505b, 1).fillPoints(outline as Phaser.Math.Vector2[], true);
  g.lineStyle(1.5 * scale, 0x22252b, 1).strokePoints(outline as Phaser.Math.Vector2[], true);
  g.fillStyle(0x9caebe, 1).fillPoints([box(-5, -9), box(6, -9), box(6, -5), box(-5, -5)] as Phaser.Math.Vector2[], true);
  g.fillStyle(0x303944, 1).fillPoints([box(3, -5), box(6, -5), box(6, 9), box(3, 9)] as Phaser.Math.Vector2[], true);
  for (const side of [-1, 1]) { const p = box(-1, side * 6); g.fillStyle(0xdcc58d, 1).fillCircle(p.x, p.y, 1.1 * scale); }
  const a = box(-1, -9), b = box(-1, 9);
  g.lineStyle(2 * scale, 0xd9ae4a, 1).lineBetween(a.x, a.y, b.x, b.y);
}
