import * as Phaser from 'phaser';
import type { Skill, SkillEffect } from '@/gameplay/skills';
import { C, txt } from '@/ui/theme';

// ---------- skill icons ----------

const KIND_COLORS: Record<SkillEffect['kind'], number> = {
  channelHeal: 0x3f9b5a,
  instantHeal: 0x3f9b5a,
  regen: 0x5aa86a,
  swap: 0x4a3f7a,
  projectile: 0xc8572a,
  speedBuff: 0x2f8fa8,
  dash: 0x2f8fa8,
  powerUp: 0xb8322a,
  lifesteal: 0x7a1424,
  revive: 0xc2417f,
  guard: 0xa8842c,
  stealth: 0x5a5a8a,
  substitute: 0x8a6a3a,
  caltrops: 0x6f7a88,
  teleport: 0x4a7ab8,
  shadowStep: 0x3a3f6a,
  counter: 0x5a7a9a,
  teamHeal: 0x2f8a6a,
  teamPe: 0x3f7fd9,
  teamFury: 0xc0532a,
  teamGuard: 0xa8842c,
  soulThunder: 0x7a5ad9,
  soulReaper: 0x4a2a5a,
  soulFire: 0xd98a2a,
  soulTree: 0x3f9b4a,
  soulRage: 0xd9302a,
  sacrifice: 0x9a1a2a,
};

export const skillColor = (s: Skill) => KIND_COLORS[s.effect.kind];

/** Round badge with the skill's first character; a dashed empty ring for an empty slot. */
export function drawSkillIcon(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, x: number, y: number, r: number, skill: Skill | null) {
  const g = scene.add.graphics();
  if (!skill) {
    g.lineStyle(2, C.border, 1);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      g.beginPath();
      g.arc(x, y, r - 1, a, a + Math.PI / 14);
      g.strokePath();
    }
    layer.add(g);
    return;
  }
  g.fillStyle(skillColor(skill), 1).fillCircle(x, y, r);
  g.fillStyle(0xffffff, 0.12).fillCircle(x - r * 0.25, y - r * 0.3, r * 0.55);
  g.lineStyle(2, C.gold, 1).strokeCircle(x, y, r);
  layer.add(g);
  layer.add(txt(scene, x, y + 1, skill.zh[0], Math.round(r * 1.05), '#ffffff', { title: true, bold: true, origin: 0.5 }));
}
