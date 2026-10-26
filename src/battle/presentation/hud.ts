import * as Phaser from 'phaser';
import { SOUL_LEVELS, SOUL_PER_LEVEL, MAX_PLAYERS, QUEST, HUD_HEIGHT, PLAYER_COLORS, RES, WIDTH } from '@/config';
import { Fighter } from '@/Fighter';
import { questSideOf } from '@/battle/quest/factions';
import { POCKET_SIZE, type Item } from '@/items';
import { skillCooldownFor } from '@/skills';
import { T } from '@/i18n';
import { drawWeaponIcon, drawItemIcon } from '@/art';
import { FONT, toHex } from '@/ui';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type PresentationHudContext = Phaser.Scene & Pick<BattleScene,
  'add' | 'bossTitle' | 'fighterLabel' | 'fighters' | 'hasHellPlayers'
  | 'hud' | 'hudIcons' | 'hudNames' | 'hudPanel' | 'hudSkillGlyphs'
  | 'isMixedQuest' | 'keyLabels' | 'lobbySlots' | 'mode' | 'quest'
  | 'sideColor' | 'skillAt' | 'skillLayout' | 'slots'
>;

const HUD = { cols: 4, pad: 42, barW: 88, skillX: 140, skill: 22, skillGap: 3, pocketX: 226, pocket: 20, pocketGap: 3 };

/** Three or four skills stay on one row, clear of the item pocket. Larger kits wrap onto two rows. */
export function skillLayout(this: PresentationHudContext, count: number): { size: number; gap: number; cols: number; originY: number; } {
  const L = HUD;
  if (count <= 3) return { size: L.skill, gap: L.skillGap, cols: Math.max(1, count), originY: 12 };
  if (count === 4) {
    const gap = 2;
    const room = L.pocketX - L.skillX - 8;
    return { size: Math.floor((room - 3 * gap) / 4), gap, cols: 4, originY: 12 };
  }
  const cols = Math.ceil(count / 2);
  const gap = 1;
  const room = WIDTH / L.cols - L.skillX - 8;
  const size = Math.min(13, Math.max(8, Math.floor((room - (cols - 1) * gap) / cols)));
  return { size, gap, cols, originY: 16 };
}

export function skillAt(this: PresentationHudContext, count: number, k: number): { x: number; y: number; size: number; } {
  const lay = this.skillLayout(count);
  const col = k % lay.cols;
  const row = Math.floor(k / lay.cols);
  return {
    x: HUD.skillX + col * (lay.size + lay.gap),
    y: lay.originY + row * (lay.size + lay.gap),
    size: lay.size,
  };
}

export function hudPanel(this: PresentationHudContext, i: number): { x0: number; y0: number; pw: number; ph: number; } {
  if (this.hasHellPlayers) {
    const slot = i % QUEST.partySlots;
    const side = questSideOf(this.lobbySlots[slot], this.quest?.side);
    i = slot + (Math.floor(i / QUEST.partySlots) === (side === 'hell' ? 1 : 0) ? 0 : QUEST.partySlots);
  }
  const L = HUD;
  const pw = WIDTH / L.cols;
  const ph = HUD_HEIGHT / Math.ceil(MAX_PLAYERS / L.cols);
  return { x0: (i % L.cols) * pw, y0: Math.floor(i / L.cols) * ph, pw, ph };
}

export function createHudText(this: PresentationHudContext): void {
  const L = HUD;
  const roleGlyph = (f: Fighter) => T().roleName(f.role)[0];
  this.slots.forEach((slot, i) => {
    const { x0, y0 } = this.hudPanel(i);
    const f = this.fighters.find((ff) => ff.index === i);
    if (!f) {
      this.add.text(x0 + L.pad, y0 + 16, `P${i + 1} — ${T().emptySlot}`, { fontFamily: FONT, resolution: RES, fontSize: '11px', color: '#4a5060' });
      return;
    }
    const color = toHex(this.quest ? this.sideColor(f.team) : PLAYER_COLORS[i]);
    const who = this.hasHellPlayers ? `${this.fighterLabel(f)} ${this.isMixedQuest ? T().questSides[f.team === 0 ? 'heroes' : 'hell'] : f.boss ? this.bossTitle(f) : roleGlyph(f)}` : this.quest && i >= QUEST.partySlots ? (f.boss ? this.bossTitle(f) : `${T().enemyTag} ${roleGlyph(f)}`) : `P${i + 1} ${roleGlyph(f)}`;
    const name = this.add.text(x0 + L.pad, y0 + 2, `${who}·${T().weaponName(f.weapon)}`, { fontFamily: FONT, resolution: RES, fontSize: '11px', color, fontStyle: 'bold' });
    this.hudNames[i] = name;
    this.hudSkillGlyphs[i] = [];
    if (this.mode !== 'ffa' && !this.quest) {
      this.add.text(name.x + name.width + 5, y0 + 3, T().teamNames[f.team], {
        fontFamily: FONT, resolution: RES, fontSize: '9px', fontStyle: 'bold', color: '#ffffff', backgroundColor: toHex(this.sideColor(f.team)), padding: { x: 3, y: 0 },
      });
    }
    this.keyLabels[i] = f.skills.map((s, k) => {
      const box = this.skillAt(f.skills.length, k);
      const cx = x0 + box.x + box.size / 2;
      const cy = y0 + box.y + box.size / 2;
      this.hudSkillGlyphs[i][k] = this.add.text(cx, cy, s ? s.zh[0] : '—', { fontFamily: FONT, resolution: RES, fontSize: box.size >= 20 ? '12px' : box.size >= 14 ? '11px' : '8px', color: '#ffffff' }).setOrigin(0.5).setDepth(2);
      // Key label tucked into the box's corner. CPU enemies have no key for a fourth skill.
      return this.add.text(cx + box.size / 2 - 1, y0 + box.y + box.size - 1, f.controller.labels[k + 1] ?? '', { fontFamily: FONT, resolution: RES, fontSize: '7px', color: '#c9ced8' }).setOrigin(1, 1);
    });
  });
}

export function refreshHudLoadout(this: PresentationHudContext, f: Fighter): void {
  const who = this.hasHellPlayers ? this.fighterLabel(f) : f.boss ? this.bossTitle(f) : `${T().enemyTag} ${T().roleName(f.role)[0]}`;
  this.hudNames[f.index]?.setText(`${who}·${T().weaponName(f.weapon)}`);
  f.skills.forEach((s, k) => this.hudSkillGlyphs[f.index]?.[k]?.setText(s ? s.zh[0] : '—'));
}

export function renderHud(this: PresentationHudContext): void {
  const L = HUD;
  const h = this.hud;
  h.clear();
  this.hudIcons.clear();
  h.fillStyle(0x0d0f14, 1).fillRect(0, 0, WIDTH, HUD_HEIGHT);
  for (let i = 0; i < this.slots.length; i++) {
    const { x0, y0, pw, ph } = this.hudPanel(i);
    const f = this.fighters.find((ff) => ff.index === i);
    h.fillStyle(f ? 0x151e2b : 0x101722, 1).fillRoundedRect(x0 + 3, y0 + 2, pw - 6, ph - 4, 5);
    h.lineStyle(1, f?.color ?? 0x344052, f ? 0.2 : 0.12).strokeRoundedRect(x0 + 3, y0 + 2, pw - 6, ph - 4, 5);
    if (!f) continue;
    const alpha = f.alive ? 1 : 0.35;
    h.fillStyle(f.color, alpha * 0.65).fillRoundedRect(x0 + 3, y0 + 9, 2, ph - 18, 1);
    // Team tint behind the panel in team modes.
    if (this.mode !== 'ffa') h.fillStyle(this.sideColor(f.team), 0.035).fillRoundedRect(x0 + 4, y0 + 3, pw - 8, ph - 6, 4);
    // Use the same weapon artwork as the loadout screen, with room beside the bars.
    h.fillStyle(0x1b2030, 1).fillRoundedRect(x0 + 6, y0 + 6, 30, 34, 5);
    h.lineStyle(1, f.color, alpha).strokeRoundedRect(x0 + 6, y0 + 6, 30, 34, 5);
    drawWeaponIcon(this.hudIcons, f.weapon.id, x0 + 21, y0 + 23, 25, f.color);
    // HP and PE (體力) bars.
    h.fillStyle(0x2a1416, 1).fillRect(x0 + L.pad, y0 + 18, L.barW, 9);
    h.fillStyle(0xe5484d, alpha).fillRect(x0 + L.pad, y0 + 18, L.barW * (f.hp / f.maxHp), 9);
    h.fillStyle(0x2a2614, 1).fillRect(x0 + L.pad, y0 + 30, L.barW, 5);
    const peColor = f.peDeniedT > 0 ? 0xffffff : f.resting && f.pe < f.maxPe ? 0xfff0a0 : 0xf2c94c;
    h.fillStyle(peColor, alpha).fillRect(x0 + L.pad, y0 + 30, L.barW * (f.pe / f.maxPe), 5);
    // Skill boxes with cooldown sweep. Large kits wrap so they stay clear of the bars.
    f.skills.forEach((s, k) => {
      const box = this.skillAt(f.skills.length, k);
      const bx = x0 + box.x;
      const by = y0 + box.y;
      const sz = box.size;
      if (!s) {
        h.fillStyle(0x14171f, alpha).fillRect(bx, by, sz, sz);
        h.lineStyle(1, 0x2a2f3c, alpha).strokeRect(bx, by, sz, sz);
        return;
      }
      const ready = f.cooldowns[k] <= 0;
      const affordable = f.pe >= s.peCost;
      h.fillStyle(ready && affordable ? 0x2f3a52 : 0x1b2030, alpha).fillRect(bx, by, sz, sz);
      if (!ready) {
        const frac = f.cooldowns[k] / skillCooldownFor(s, f.role);
        h.fillStyle(0x000000, 0.6).fillRect(bx, by + sz * (1 - frac), sz, sz * frac);
      }
      h.lineStyle(1, ready ? f.color : 0x3a4152, alpha).strokeRect(bx, by, sz, sz);
    });
    // Pocket: item slots, the selected one outlined in gold. A full kit claims that row, so the pocket moves up.
    const many = f.skills.length > 4;
    const pocketSize = many ? 14 : L.pocket;
    const pocketGap = many ? 2 : L.pocketGap;
    const soulW = many && f.usesSoul ? 52 : 0;
    const pocketX0 = many ? x0 + pw - 4 - soulW - POCKET_SIZE * (pocketSize + pocketGap) + pocketGap : x0 + L.pocketX;
    const pocketY = many ? y0 + 1 : y0 + 13;
    for (let k = 0; k < POCKET_SIZE; k++) {
      const item: Item | undefined = f.pocket[k];
      const px = pocketX0 + k * (pocketSize + pocketGap);
      const py = pocketY;
      h.fillStyle(item ? 0x2a2f3c : 0x14171f, 1).fillRoundedRect(px, py, pocketSize, pocketSize, 4);
      const selected = item && k === f.selectedItem;
      h.lineStyle(selected ? 2 : 1, selected ? 0xf2c94c : 0x2a2f3c, 1).strokeRoundedRect(px, py, pocketSize, pocketSize, 4);
      if (item) drawItemIcon(this.hudIcons, item.id, px + pocketSize / 2, py + pocketSize / 2, many ? 11 : 16);
    }
    // 魂 Soul (only for Thunder users): four diamonds; full levels lit, the one filling shows its progress.
    for (let k = 0; k < (f.usesSoul ? SOUL_LEVELS : 0); k++) {
      const cx = x0 + pw - 50 + k * 12;
      const cy = y0 + 7;
      const fill = Phaser.Math.Clamp(f.soul / SOUL_PER_LEVEL - k, 0, 1);
      const pts = [{ x: cx, y: cy - 5 }, { x: cx + 4, y: cy }, { x: cx, y: cy + 5 }, { x: cx - 4, y: cy }] as Phaser.Math.Vector2[];
      h.fillStyle(0x24202e, 1).fillPoints(pts, true);
      if (fill > 0) h.fillStyle(0xb57bff, fill >= 1 ? 1 : 0.25 + fill * 0.4).fillPoints(pts, true);
      // Blink red when a summon was just refused for lack of soul.
      const warn = f.soulDeniedT > 0 && Math.floor(f.soulDeniedT * 12) % 2 === 0;
      h.lineStyle(warn ? 2 : 1, warn ? 0xff4a5a : fill >= 1 ? 0xe2c8ff : 0x4a4058, 1).strokePoints(pts, true);
    }
  }
}
