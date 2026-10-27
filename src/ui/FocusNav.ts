import * as Phaser from 'phaser';
import { sfx } from '@/audio/sfx';
import { C } from '@/ui/theme';

// ---------- focus navigation ----------

export interface Focusable {
  id: string;
  /** Top-left and size, in game coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  onEnter?: () => void;
  /** Keyboard ←/→ adjust the value; controller directions move focus and confirm cycles it. */
  onAdjust?: (d: number) => void;
  radius?: number;
}

/**
 * Keyboard + mouse focus for one screen or modal. Arrow keys move to the
 * nearest item in that direction; Enter/Space activate; Esc calls onBack.
 */
export class FocusNav {
  private items = new Map<string, Focusable>();
  private zones: Phaser.GameObjects.Zone[] = [];
  private zoneById = new Map<string, Phaser.GameObjects.Zone>();
  /** Items whose mouse zone is currently clipped away (e.g. scrolled out of view). */
  private hidden = new Set<string>();
  private hl: Phaser.GameObjects.Graphics;
  current: string | null = null;
  onBack?: () => void;
  onFocus?: (id: string) => void;
  enabled = true;

  constructor(private scene: Phaser.Scene, private depth = 50) {
    this.hl = scene.add.graphics().setDepth(depth + 1);
  }

  /** Forget all items (call before rebuilding a screen). Keeps the focused id if it comes back. */
  reset() {
    this.items.clear();
    this.zones.forEach((z) => z.destroy());
    this.zones = [];
    this.zoneById.clear();
    this.hidden.clear();
  }

  add(item: Focusable) {
    this.items.set(item.id, item);
    const z = this.scene.add.zone(item.x + item.w / 2, item.y + item.h / 2, item.w, item.h).setDepth(this.depth + 2);
    z.setInteractive({ useHandCursor: true });
    z.on('pointerover', () => {
      if (this.enabled && this.current !== item.id) this.focus(item.id, false);
    });
    z.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.enabled) return;
      this.focus(item.id, false);
      if (item.onAdjust) {
        sfx.menuChange();
        item.onAdjust(p.worldX < item.x + item.w / 2 ? -1 : 1);
      } else if (item.onEnter) {
        sfx.menuConfirm();
        item.onEnter();
      }
    });
    this.zones.push(z);
    this.zoneById.set(item.id, z);
  }

  /**
   * Moves an item (for scrolling lists). The mouse zone is clipped to `clip`'s
   * vertical band so hidden parts can't be hovered or clicked.
   */
  setRect(id: string, r: { x: number; y: number; w: number; h: number }, clip?: { top: number; bottom: number }) {
    const it = this.items.get(id);
    const z = this.zoneById.get(id);
    if (!it || !z) return;
    Object.assign(it, r);
    const top = Math.max(r.y, clip?.top ?? -Infinity);
    const bottom = Math.min(r.y + r.h, clip?.bottom ?? Infinity);
    if (bottom - top < 4) this.hidden.add(id);
    else {
      this.hidden.delete(id);
      z.setPosition(r.x + r.w / 2, (top + bottom) / 2).setSize(r.w, bottom - top, true);
    }
    z.input!.enabled = this.enabled && !this.hidden.has(id);
    if (id === this.current) this.draw();
  }

  /** Call after adding items: restores or picks a focus and draws the highlight. */
  done(preferred?: string) {
    if (!this.current || !this.items.has(this.current)) {
      this.current = preferred && this.items.has(preferred) ? preferred : this.items.keys().next().value ?? null;
    }
    this.draw();
    if (this.current) this.onFocus?.(this.current);
  }

  focus(id: string, sound = true) {
    if (!this.items.has(id)) return;
    if (sound && id !== this.current) sfx.menuMove();
    this.current = id;
    this.draw();
    this.onFocus?.(id);
  }

  draw() {
    this.hl.clear();
    const it = this.current ? this.items.get(this.current) : undefined;
    if (!it || !this.enabled) return;
    const r = it.radius ?? 8;
    this.hl.fillStyle(C.gold, 0.1).fillRoundedRect(it.x - 3, it.y - 3, it.w + 6, it.h + 6, r + 2);
    this.hl.lineStyle(1, C.gold, 0.9).strokeRoundedRect(it.x - 3, it.y - 3, it.w + 6, it.h + 6, r + 2);
    // Little marker on the left edge.
    this.hl.fillStyle(C.gold, 1).fillTriangle(it.x - 12, it.y + it.h / 2 - 6, it.x - 12, it.y + it.h / 2 + 6, it.x - 5, it.y + it.h / 2);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.zoneById.forEach((z, id) => (z.input!.enabled = on && !this.hidden.has(id)));
    this.draw();
  }

  destroy() {
    this.reset();
    this.hl.destroy();
  }

  /** Returns true if the key was handled. */
  key(e: KeyboardEvent, source: 'keyboard' | 'gamepad' = 'keyboard'): boolean {
    const K = Phaser.Input.Keyboard.KeyCodes;
    const it = this.current ? this.items.get(this.current) : undefined;
    switch (e.keyCode) {
      case K.LEFT:
      case K.RIGHT: {
        const d = e.keyCode === K.LEFT ? -1 : 1;
        if (it?.onAdjust && source === 'keyboard') {
          sfx.menuChange();
          it.onAdjust(d);
        } else this.move(d, 0);
        return true;
      }
      case K.UP:
        this.move(0, -1);
        return true;
      case K.DOWN:
        this.move(0, 1);
        return true;
      case K.ENTER:
      case K.SPACE:
        if (it?.onEnter) {
          sfx.menuConfirm();
          it.onEnter();
        } else if (it?.onAdjust) {
          sfx.menuChange();
          it.onAdjust(1);
        }
        return true;
      case K.ESC:
        if (this.onBack) {
          sfx.menuBack();
          this.onBack();
          return true;
        }
        return false;
    }
    return false;
  }

  /** Spatial navigation: nearest item whose centre lies in direction (dx, dy). */
  private move(dx: number, dy: number) {
    const cur = this.current ? this.items.get(this.current) : undefined;
    if (!cur) return;
    const cx = cur.x + cur.w / 2;
    const cy = cur.y + cur.h / 2;
    let best: Focusable | null = null;
    let bestScore = Infinity;
    for (const it of this.items.values()) {
      if (it === cur) continue;
      const ox = it.x + it.w / 2 - cx;
      const oy = it.y + it.h / 2 - cy;
      const along = ox * dx + oy * dy;
      if (along <= 4) continue;
      const across = Math.abs(ox * dy - oy * dx);
      const score = along + across * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    if (best) this.focus(best.id);
  }
}
