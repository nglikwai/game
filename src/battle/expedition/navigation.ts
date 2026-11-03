type Point = { x: number; y: number };
type Rect = Point & { w: number; h: number };

/** Static, inflated grid with line-of-sight smoothing. Cached paths keep per-frame AI queries cheap. */
export function forestRouter(width: number, height: number, obstacles: Rect[], cell = 70) {
  const cols = Math.ceil(width / cell), rows = Math.ceil(height / cell);
  const point = (id: number) => ({ x: (id % cols + 0.5) * cell, y: (Math.floor(id / cols) + 0.5) * cell });
  const blocked = (p: Point, pad = 22) => p.x < 40 || p.x > width - 40 || p.y < 130 || p.y > height - 40
    || obstacles.some((o) => Math.abs(p.x - o.x) < o.w / 2 + pad && Math.abs(p.y - o.y) < o.h / 2 + pad);
  const walk = Array.from({ length: cols * rows }, (_, id) => !blocked(point(id)));
  const clear = (a: Point, b: Point, pad = 22) => {
    if (blocked(a, pad) || blocked(b, pad)) return false;
    return !obstacles.some((o) => {
      let lo = 0, hi = 1;
      for (const axis of ['x', 'y'] as const) {
        const half = (axis === 'x' ? o.w : o.h) / 2 + pad;
        const delta = b[axis] - a[axis], min = o[axis] - half, max = o[axis] + half;
        if (Math.abs(delta) < 1e-9) { if (a[axis] < min || a[axis] > max) return false; }
        else { const t1 = (min - a[axis]) / delta, t2 = (max - a[axis]) / delta;
          lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2));
          if (lo > hi) return false; }
      }
      return lo <= hi;
    });
  };
  const nearest = (p: Point) => {
    const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell);
    for (let ring = 0; ring < 5; ring++) {
      let best = -1, distance = Infinity;
      for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) {
        const x = cx + dx, y = cy + dy, id = y * cols + x;
        if (x < 0 || x >= cols || y < 0 || y >= rows || !walk[id]) continue;
        const q = point(id), d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < distance && clear(p, q, blocked(p) ? 0 : 22)) { best = id; distance = d; }
      }
      if (best >= 0) return best;
    }
    return -1;
  };
  const cache = new Map<string, number[]>();
  return (fx: number, fy: number, tx: number, ty: number): Point | null => {
    const from = { x: fx, y: fy }, target = { x: tx, y: ty };
    if (clear(from, target)) return null;
    const start = nearest(from), goal = nearest(target);
    if (start < 0 || goal < 0) return from;
    if (blocked(from)) return point(start);
    const key = `${start}:${goal}`;
    let path = cache.get(key);
    if (!path) {
      const open = new Set([start]), cost = new Map([[start, 0]]), previous = new Map<number, number>();
      const score = (id: number) => cost.get(id)! + Math.hypot(point(id).x - point(goal).x, point(id).y - point(goal).y);
      while (open.size) {
        let current = -1; for (const id of open) if (current < 0 || score(id) < score(current)) current = id;
        if (current === goal) break;
        open.delete(current);
        const a = point(current);
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          const x = current % cols + dx, y = Math.floor(current / cols) + dy, next = y * cols + x;
          if (x < 0 || x >= cols || y < 0 || y >= rows || !walk[next] || !clear(a, point(next))) continue;
          const n = cost.get(current)! + Math.hypot(dx, dy) * cell;
          if (n >= (cost.get(next) ?? Infinity)) continue;
          cost.set(next, n); previous.set(next, current); open.add(next);
        }
      }
      if (!cost.has(goal)) return from;
      path = [goal]; while (path[0] !== start) path.unshift(previous.get(path[0])!);
      if (cache.size > 100) cache.clear(); cache.set(key, path);
    }
    for (let i = path.length - 1; i >= 0; i--) if (clear(from, point(path[i]))) return point(path[i]);
    return from;
  };
}
