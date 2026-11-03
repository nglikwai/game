import * as Phaser from 'phaser';
import { EXPEDITION as E } from '@/config/expedition';
import { HUD_HEIGHT, HEIGHT, WIDTH } from '@/config';
import { mulberry32 } from '@/maps/common';
import { T } from '@/localization';
import { S, toWorld } from '@/battle/coordinates';
import { expeditionCamera, gateIsOpen } from '@/battle/expedition/rules';
import { type addBarrier } from '@/battle/expedition/runtime';
import type { Tower } from '@/battle/types';
import { txt } from '@/ui';
import type { BattleScene } from '@/scenes/BattleScene';

export interface ExpeditionPresentation {
  camera: { x: number; y: number; zoom: number };
  overlay: Phaser.GameObjects.Graphics;
  map: Phaser.GameObjects.Graphics;
  objectives: Phaser.GameObjects.Text;
  bossLabel: Phaser.GameObjects.Text;
  canopies: { x: number; y: number; graphic: Phaser.GameObjects.Graphics }[];
  gate: ReturnType<typeof addBarrier> | null;
  thorns: ReturnType<typeof addBarrier>[];
  rally: Tower | null;
}
type Context = Phaser.Scene & Pick<BattleScene,
  'arenaRect' | 'expedition' | 'expeditionView' | 'fighters' | 'gGlow' | 'lFloor' | 'lTop' | 'map' | 'worldLayer'
>;

/** Small textures avoid a single enormous high-DPI canvas on phones and integrated GPUs. */
export function paintExpeditionFloor(this: Context) {
  const tile = 768, keys: string[] = [];
  for (let x = 0; x < E.width; x += tile) for (let y = HUD_HEIGHT; y < E.height; y += tile) {
    const key = `forest-${this.expedition!.seed}-${x}-${y}`;
    const w = Math.min(tile, E.width - x), h = Math.min(tile, E.height - y);
    const texture = this.textures.createCanvas(key, w, h)!;
    const ctx = texture.getContext(); ctx.translate(-x, -y); this.map.paint(ctx, mulberry32(this.expedition!.seed)); texture.refresh();
    const p = toWorld({ x, y }); this.lFloor.add(this.add.image(p.x, p.y, key).setOrigin(0, 0).setScale(S)); keys.push(key);
  }
  this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keys.forEach((key) => this.textures.remove(key)));
}

export function createExpeditionView(this: Context) {
  const p = toWorld(this.expedition!.checkpoint === 'fortress' ? E.checkpoint : E.start);
  const canopies = this.map.obstacles.filter((o) => o.kind === 'pine').map((o) => {
    const p = toWorld(o), graphic = this.add.graphics();
    graphic.fillStyle(0x102e2b, 0.9).fillCircle(7, -15, 59);
    graphic.fillStyle(0x2c5141, 1).fillCircle(-15, -27, 48).fillCircle(18, -34, 43);
    graphic.fillStyle(0x4a6b4c, 0.65).fillCircle(-20, -40, 31);
    graphic.setPosition(p.x, p.y); this.lTop.add(graphic); return { ...p, graphic };
  });
  const overlay = this.add.graphics(); this.lTop.add(overlay);
  const map = this.add.graphics().setDepth(45);
  const objectives = txt(this, 22, HUD_HEIGHT + 14, '', 16, '#e6dbb8', { bold: true, depth: 44, wrap: 850, stroke: '#0d181d', strokeThickness: 4 });
  const bossLabel = txt(this, WIDTH / 2, HUD_HEIGHT + 65, '', 15, '#f2c6aa', { bold: true, origin: 0.5, depth: 46 });
  this.expeditionView = { camera: { ...p, zoom: 1.12 }, canopies, overlay, map, objectives, bossLabel, gate: null, thorns: [], rally: null };
  updateExpeditionCamera.call(this, 1);
}

export function updateExpeditionCamera(this: Context, dt: number) {
  const view = this.expeditionView; if (!view) return;
  const alive = this.fighters.filter((f) => f.team === 0 && f.alive);
  const humans = alive.filter((f) => !f.controller.cpu), party = humans.length ? humans : alive;
  if (party.length) {
    const goal = expeditionCamera(party, { x: this.arenaRect.x, y: this.arenaRect.y, w: this.arenaRect.width, h: this.arenaRect.height }, { w: WIDTH, h: HEIGHT - HUD_HEIGHT });
    const t = 1 - Math.exp(-dt * 7);
    view.camera.x += (goal.x - view.camera.x) * t; view.camera.y += (goal.y - view.camera.y) * t;
    view.camera.zoom += (goal.zoom - view.camera.zoom) * t;
  }
  const c = view.camera;
  this.worldLayer.setScale(c.zoom).setPosition(WIDTH / 2 - c.x * c.zoom, HUD_HEIGHT + (HEIGHT - HUD_HEIGHT) / 2 - c.y * c.zoom);
}

export function renderExpedition(this: Context) {
  const e = this.expedition, view = this.expeditionView; if (!e || !view) return;
  const heroes = this.fighters.filter((f) => f.team === 0), humans = heroes.filter((f) => !f.controller.cpu && f.alive);
  const party = humans.length ? humans : heroes.filter((f) => f.alive);
  const g = view.overlay.clear(), minimap = view.map.clear(), cell = 180;
  const cols = Math.ceil(E.width / cell), rows = Math.ceil((E.height - HUD_HEIGHT) / cell);
  for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) {
    const p = toWorld({ x: (x + 0.5) * cell, y: HUD_HEIGHT + (y + 0.5) * cell });
    if (party.some((f) => Math.hypot(f.x - p.x, f.y - p.y) < 750)) e.explored.add(`${x}:${y}`);
    if (!e.explored.has(`${x}:${y}`)) g.fillStyle(0x0b1921, 0.9).fillRect(x * cell * S, y * cell * S, cell * S + 1, cell * S + 1);
  }
  for (const tree of view.canopies) tree.graphic.setAlpha(this.fighters.some((f) => f.alive && Math.hypot(f.x - tree.x, f.y - tree.y) < 100) ? 0.22 : 1);
  if (view.gate) {
    const p = toWorld(E.gate), w = E.gate.w * S;
    g.fillStyle(0x292e42, 1).fillRect(p.x - w / 2, p.y - 30, w, 60);
    g.lineStyle(4, 0xc4a4e8, 0.8).lineBetween(p.x - w / 2, p.y, p.x + w / 2, p.y);
    for (const dx of [-60, 60]) g.lineStyle(3, 0xd6b5f3, 1).strokeCircle(p.x + dx, p.y, 21);
  }
  const checkpoint = toWorld(e.checkpoint === 'fortress' ? E.checkpoint : E.start);
  g.lineStyle(3, 0xe5d38a, 0.8).strokeCircle(checkpoint.x, checkpoint.y, 75);
  const healer = toWorld(e.cleared.includes('rescue') ? E.healing : E.healer);
  g.fillStyle(0x9be0be, 1).fillRect(healer.x - 4, healer.y - 15, 8, 30).fillRect(healer.x - 15, healer.y - 4, 30, 8);
  if (!e.cleared.includes('rescue')) g.lineStyle(3, 0xb8bdad, 1).strokeRect(healer.x - 30, healer.y - 30, 60, 60);
  for (const f of heroes.filter((f) => !f.alive)) {
    const progress = (e.revive.get(f.index) ?? 0) / E.reviveSeconds;
    g.lineStyle(4, 0x9be0be, 0.9); g.beginPath(); g.arc(f.x, f.y, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); g.strokePath();
    g.fillStyle(0x9be0be, 1).fillRect(f.x - 3, f.y - 10, 6, 20).fillRect(f.x - 10, f.y - 3, 20, 6);
  }
  for (const thorn of view.thorns) {
    const r = thorn.rect; g.fillStyle(0x37523a, 0.95).fillRect(r.x, r.y, r.width, r.height);
    for (let x = r.x; x < r.right; x += 24) g.fillStyle(0x93b16a, 1).fillTriangle(x, r.y + 10, x + 10, r.y - 18, x + 18, r.y + 12);
  }
  const boss = e.active === 'fortress' ? this.fighters.find((f) => f.index === 4 && f.alive) : null;
  if (boss && e.charge) {
    this.gGlow.fillStyle(0xf5d9a1, 0.55).fillCircle(boss.x, boss.y - 16, 18);
  }
  const count = Number(e.cleared.includes('village')) + Number(e.cleared.includes('river'));
  view.objectives.setText(`${T().expeditionStage}  ·  ${T().expeditionCaptains} ${count}/2\n${gateIsOpen(e) ? T().expeditionGoal.split('→').slice(-1)[0].trim() : T().expeditionGoal}\n${e.cleared.includes('rescue') ? T().expeditionHealerSaved : T().expeditionHealer}`);
  view.bossLabel.setText(boss ? `${T().expeditionCommander}  ${Math.ceil(boss.hp)}/${boss.maxHp}` : '');
  if (boss) {
    minimap.fillStyle(0x222d30, 1).fillRect(WIDTH / 2 - 180, HUD_HEIGHT + 79, 360, 6);
    minimap.fillStyle(0xc46b57, 1).fillRect(WIDTH / 2 - 180, HUD_HEIGHT + 79, 360 * boss.hp / boss.maxHp, 6);
  }
  // Compact minimap: unexplored ground stays dark, required captains remain visible as navigation goals.
  const mx = WIDTH - 218, my = HEIGHT - 158, mw = 196, mh = 132;
  minimap.fillStyle(0x101c22, 0.96).fillRoundedRect(mx - 7, my - 7, mw + 14, mh + 14, 6);
  const px = (x: number) => mx + x / (E.width * S) * mw, py = (y: number) => my + y / ((E.height - HUD_HEIGHT) * S) * mh;
  for (const key of e.explored) {
    const [x, y] = key.split(':').map(Number);
    minimap.fillStyle(0x486455, 0.8).fillRect(mx + x / cols * mw, my + y / rows * mh, mw / cols + 1, mh / rows + 1);
  }
  for (const o of this.map.obstacles.filter((o) => o.kind === 'water' || o.kind === 'ruin')) {
    const p = toWorld(o); minimap.fillStyle(o.kind === 'water' ? 0x4a8796 : 0x87928a, 0.6)
      .fillRect(px(p.x - o.w * S / 2), py(p.y - o.h * S / 2), o.w / E.width * mw, o.h / (E.height - HUD_HEIGHT) * mh);
  }
  for (const camp of E.camps) {
    const p = toWorld(camp), cleared = e.cleared.includes(camp.id);
    if (camp.id === 'rescue' && !e.explored.has(`${Math.floor(camp.x / cell)}:${Math.floor((camp.y - HUD_HEIGHT) / cell)}`)) continue;
    minimap.fillStyle(cleared ? 0x8dc6a0 : camp.id === 'fortress' ? 0xe6c277 : 0xdb8a76, 1).fillRect(px(p.x) - 3, py(p.y) - 3, 6, 6);
  }
  const c = view.camera, vw = WIDTH / c.zoom, vh = (HEIGHT - HUD_HEIGHT) / c.zoom;
  minimap.lineStyle(1, 0xc4d2bc, 0.6).strokeRect(px(c.x - vw / 2), py(c.y - vh / 2), vw / (E.width * S) * mw, vh / ((E.height - HUD_HEIGHT) * S) * mh);
  for (const f of heroes) minimap.fillStyle(f.color, f.alive ? 1 : 0.35).fillCircle(px(f.x), py(f.y), 3);
  if (view.rally?.alive) {
    const b = view.rally;
    g.lineStyle(5, 0xd4ba81, 1).lineBetween(b.x, b.y + 28, b.x, b.y - 46);
    g.fillStyle(0xba534d, 1).fillTriangle(b.x, b.y - 46, b.x + 42, b.y - 31, b.x, b.y - 15);
  }
}
