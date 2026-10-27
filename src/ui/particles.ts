import * as Phaser from 'phaser';
import { type AmbientKind } from '@/maps';

// ---------- petals ----------

/** Drifting ambient particles: cherry petals, bamboo leaves or snow. Call update(dt) every frame. */
export class Petals {
  private items: { obj: Phaser.GameObjects.Ellipse; vx: number; vy: number; spin: number; phase: number }[] = [];
  /** Glowing kinds (fireflies, embers) pulse in brightness. */
  private flicker = false;

  constructor(
    scene: Phaser.Scene,
    private area: { x: number; y: number; w: number; h: number },
    count = 16,
    depth = 6,
    kind: AmbientKind = 'petals',
    /** Container to put the particles in (the battlefield layer), if any. */
    layer?: Phaser.GameObjects.Container,
  ) {
    for (let i = 0; i < count; i++) {
      const x = area.x + Math.random() * area.w;
      const y = area.y + Math.random() * area.h;
      let obj: Phaser.GameObjects.Ellipse;
      if (kind === 'mist') {
        obj = scene.add.ellipse(x, y, 90 + Math.random() * 80, 40 + Math.random() * 30, 0xffffff, 0.06);
        this.items.push({ obj, vx: 6 + Math.random() * 10, vy: (Math.random() - 0.5) * 4, spin: 0, phase: Math.random() * 6 });
      } else if (kind === 'fireflies' || kind === 'dust' || kind === 'wisps') {
        const size = kind === 'dust' ? 2.5 : kind === 'wisps' ? 7 : 4;
        const color = kind === 'dust' ? 0xfff2d0 : kind === 'wisps' ? 0x8fc8ff : 0xe8ff8a;
        obj = scene.add.ellipse(x, y, size, size, color, 0.9).setBlendMode(Phaser.BlendModes.ADD);
        this.items.push({ obj, vx: (Math.random() - 0.5) * 16, vy: (Math.random() - 0.5) * 16, spin: 0, phase: Math.random() * 6 });
        this.flicker = true;
      } else if (kind === 'embers') {
        const r = 1.5 + Math.random() * 1.5;
        obj = scene.add.ellipse(x, y, r * 2, r * 2, Math.random() < 0.5 ? 0xffb03a : 0xff6a2a, 0.9).setBlendMode(Phaser.BlendModes.ADD);
        this.items.push({ obj, vx: (Math.random() - 0.5) * 14, vy: -(18 + Math.random() * 30), spin: 0, phase: Math.random() * 6 });
        this.flicker = true;
      } else if (kind === 'rain') {
        obj = scene.add.ellipse(x, y, 1.5, 14, 0xb8c8e8, 0.45).setRotation(0.25);
        this.items.push({ obj, vx: -80, vy: 420 + Math.random() * 120, spin: 0, phase: Math.random() * 6 });
      } else if (kind === 'spores') {
        const r = 2 + Math.random() * 2.5;
        obj = scene.add.ellipse(x, y, r * 2, r * 2, Math.random() < 0.6 ? 0x9aff6a : 0xd0ff8a, 0.8).setBlendMode(Phaser.BlendModes.ADD);
        this.items.push({ obj, vx: (Math.random() - 0.5) * 10, vy: -(8 + Math.random() * 14), spin: 0, phase: Math.random() * 6 });
        this.flicker = true;
      } else if (kind === 'snow') {
        const r = 1.5 + Math.random() * 2;
        obj = scene.add.ellipse(x, y, r * 2, r * 2, 0xffffff, 0.9);
        this.items.push({ obj, vx: -6 + Math.random() * 12, vy: 22 + Math.random() * 26, spin: 0, phase: Math.random() * 6 });
      } else {
        const leaf = kind === 'leaves' || kind === 'maple';
        const leafColor = kind === 'maple' ? (Math.random() < 0.6 ? 0xd9402a : 0xe8902a) : Math.random() < 0.7 ? 0x8fbf5a : 0xc9b04a;
        obj = scene.add.ellipse(x, y, leaf ? 9 : 6, leaf ? 3.5 : 3.5, leaf ? leafColor : 0xffc4d4, 0.85);
        this.items.push({ obj, vx: 18 + Math.random() * 22, vy: 10 + Math.random() * 14, spin: (Math.random() - 0.5) * 4, phase: Math.random() * 6 });
      }
      obj.setDepth(depth);
      layer?.add(obj);
    }
  }

  update(dt: number) {
    const a = this.area;
    for (const p of this.items) {
      p.phase += dt;
      const o = p.obj;
      o.x += (p.vx + Math.sin(p.phase * 1.7) * (this.flicker ? 6 : 20)) * dt;
      o.y += p.vy * dt;
      o.rotation += p.spin * dt;
      if (this.flicker) o.setAlpha(0.35 + 0.6 * Math.abs(Math.sin(p.phase * 2.3)));
      // Wrap around on every side.
      if (o.x > a.x + a.w) o.x = a.x;
      if (o.x < a.x) o.x = a.x + a.w;
      if (o.y > a.y + a.h) o.y = a.y;
      if (o.y < a.y) o.y = a.y + a.h;
    }
  }
}
