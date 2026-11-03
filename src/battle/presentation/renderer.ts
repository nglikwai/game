import { drawCharacterSteps } from '@/rendering/characterArt';
import { drawProjectile } from '@/rendering/projectileArt';
import * as Phaser from 'phaser';
import { RES, SOUL_RAGE } from '@/config';
import type { Fighter } from '@/gameplay/Fighter';
import { T } from '@/localization';
import { drawHeldWeapon, drawLog } from '@/rendering/fighterArt';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type PresentationRendererContext = Phaser.Scene & Pick<BattleScene,
  'bossReserves' | 'caltrops' | 'chests' | 'drawScarf' | 'fighters'
  | 'findReviveTarget' | 'fx' | 'g' | 'gGlow' | 'gOver'
  | 'logs' | 'mode' | 'nameTags' | 'poseOf' | 'projectiles'
  | 'renderAltar' | 'renderBarrier' | 'renderBell' | 'renderChest' | 'renderDirge' | 'renderDragon' | 'renderWyverns'
  | 'renderDoors' | 'renderFlames' | 'renderFog' | 'renderGroveCast' | 'renderHerbs'
  | 'renderKegs' | 'renderLantern' | 'renderNight' | 'renderPads' | 'renderPortals'
  | 'renderQuestTree' | 'renderRescueGate' | 'renderRollers' | 'renderSeals' | 'renderSnareCast'
  | 'renderSpikes' | 'renderTide' | 'renderTower' | 'renderVents'
  | 'renderSpiritRelay'
  | 'renderSandPits'
  | 'renderVortex' | 'renderWallAndPrincess' | 'renderWardenBond' | 'renderWind' | 'respawnTimers'
  | 'sideColor' | 'sprites' | 'summonColor' | 'summonTargets' | 'tagTexts'
  | 'time' | 'towerHeals' | 'towers' | 'walls'
>;

export function render(this: PresentationRendererContext): void {
  const g = this.g;
  const over = this.gOver;
  g.clear();
  over.clear();
  this.gGlow.clear();
  const now = this.time.now / 1000;

  for (const w of this.walls) this.renderWallAndPrincess(g, w);
  this.renderRescueGate(now);
  for (const c of this.chests) this.renderChest(g, c);
  for (const tw of this.towers) this.renderTower(g, over, tw, now);
  // Healing beams from main towers to the teammates drawing on them.
  for (const { tower, f } of this.towerHeals) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 8 + f.index);
    this.gGlow.lineStyle(3, 0x7dff8a, 0.25 + pulse * 0.25).lineBetween(tower.x, tower.y, f.x, f.y);
    const k = (now * 1.5 + f.index * 0.3) % 1;
    this.gGlow.fillStyle(0xb8ffc4, 0.8).fillCircle(tower.x + (f.x - tower.x) * k, tower.y + (f.y - tower.y) * k, 3);
  }
  for (const log of this.logs.values()) drawLog(g, log.x, log.y, log.a);
  this.renderWind(now);
  this.renderVortex(now);
  this.renderSandPits(now);
  this.renderFog(now);
  this.renderSpikes(now);
  this.renderPortals(now);
  this.renderVents(now);
  this.renderFlames(now);
  this.renderRollers(now);
  this.renderTide(now);
  this.renderDoors(now);
  this.renderKegs(now);
  this.renderBell(now);
  this.renderHerbs(now);
  this.renderBarrier(now);
  this.renderPads(now);
  this.renderAltar(now);
  this.renderQuestTree(now);
  this.renderGroveCast(now);
  this.renderSnareCast(now);
  this.renderNight(now);
  this.renderDirge();
  this.renderDragon(now);
  this.renderWyverns(now);
  this.renderSeals(now);
  this.renderSpiritRelay(now);
  this.renderLantern(now);
  this.renderWardenBond(now);
  for (const c of this.caltrops) {
    // Fade in quickly, fade out over the last second.
    const a = Math.min(1, c.t * 6, c.life - c.t);
    for (const sp of c.spikes) {
      g.lineStyle(2, 0x8a93a3, a);
      for (let k = 0; k < 2; k++) {
        const ang = sp.a + (k * Math.PI) / 2;
        g.lineBetween(sp.x - Math.cos(ang) * 4, sp.y - Math.sin(ang) * 4, sp.x + Math.cos(ang) * 4, sp.y + Math.sin(ang) * 4);
      }
    }
  }

  for (const p of this.projectiles) drawProjectile(over, this.gGlow, p, now, this.fx);

  for (const f of this.fighters) {
    const sprite = this.sprites[f.index];
    const tag = this.nameTags[f.index];
    if (f.trapped) {
      sprite.setVisible(false);
      tag.setPosition(f.x, f.y - 54);
      tag.setVisible(true);
      continue;
    }
    if (this.bossReserves.has(f)) {
      sprite.setVisible(false);
      tag.setVisible(false);
      continue;
    }
    const respawn = this.respawnTimers.get(f);
    const respawnText = f.paralyzed ? T().paralyzedTag : respawn === undefined ? '' : respawn === Infinity ? T().waitingRespawn : T().respawning(Math.ceil(respawn));
    tag.setText(respawnText ? `${this.tagTexts[f.index]}  ${respawnText}` : this.tagTexts[f.index]);
    if (!f.alive) {
      sprite.setVisible(false);
      const log = this.logs.get(f);
      tag.setPosition(log?.x ?? f.x, (log?.y ?? f.y) - 18).setAlpha(0.5);
      continue;
    }

    if (f.stealthed) {
      // Vanished: no shadow, scarf, weapon, bars or name, just a barely-there shimmer so the player can find themselves.
      sprite.setVisible(true).setPosition(f.x, f.y).setRotation(f.facing).setAlpha(0.05).clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      const pulse = 0.5 + 0.5 * Math.sin(now * 6);
      over.lineStyle(1, f.color, 0.07 + 0.06 * pulse).strokeCircle(f.x, f.y, f.radius + 3);
      tag.setPosition(f.x, f.y - f.radius - 6).setAlpha(0);
      continue;
    }

    if (f.inFog) {
      // Lost in the fog: only a faint silhouette, no name, bars or weapon.
      sprite.setVisible(true).setPosition(f.x, f.y).setRotation(f.facing).setAlpha(0.3).clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      tag.setPosition(f.x, f.y - f.radius - 6).setAlpha(0);
      continue;
    }

    // --- under the ninja ---
    g.fillStyle(0x000000, 0.3).fillEllipse(f.x + 4, f.y + 9, f.radius * 2.3, f.radius * 1.2);
    if (this.mode !== 'ffa') g.lineStyle(3, this.sideColor(f.team), 0.9).strokeCircle(f.x, f.y, f.radius + 5);
    if (f.boss) {
      // A dark, pulsing aura so everyone knows who the boss is.
      const pulse = 0.5 + 0.5 * Math.sin(now * 4);
      g.fillStyle(0x8a1020, 0.16 + pulse * 0.1).fillCircle(f.x, f.y, f.radius + 16 + pulse * 4);
      g.lineStyle(2, 0xff4a4a, 0.5 + pulse * 0.3).strokeCircle(f.x, f.y, f.radius + 12);
    }
    if (f.countering) {
      // 見切: a raised steel arc in front, ready to parry.
      over.lineStyle(4, 0xcfe3ff, 0.85);
      over.beginPath();
      over.arc(f.x, f.y, f.radius + 10, f.facing - 1.1, f.facing + 1.1, false);
      over.strokePath();
      over.lineStyle(1.5, 0xffffff, 0.9);
      over.beginPath();
      over.arc(f.x, f.y, f.radius + 13, f.facing - 0.8, f.facing + 0.8, false);
      over.strokePath();
    }
    if (f.rageCharge > 0) {
      // Holding for 暴走: a ring of the coming fire closes around the player.
      const [flame] = SOUL_RAGE.colors[Math.max(1, f.soulLevel) - 1]!;
      over.lineStyle(4, flame, 0.9);
      over.beginPath();
      over.arc(f.x, f.y, f.radius + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f.rageCharge, false);
      over.strokePath();
      this.gGlow.fillStyle(flame, 0.12 + 0.2 * f.rageCharge).fillCircle(f.x, f.y, f.radius + 10);
    }
    if (f.raging) {
      // 暴走: flames all round the player, coloured by the 魂 level spent, plus a ring that burns down with the time left.
      const level = f.rageLevel, [flame, core] = SOUL_RAGE.colors[level - 1]!;
      const pulse = 0.5 + 0.5 * Math.sin(now * 9);
      g.fillStyle(flame, 0.16 + pulse * 0.08).fillCircle(f.x, f.y, f.radius + 12 + level * 2);
      const count = 10 + level * 2;
      for (let k = 0; k < count; k++) {
        const a = (k / count) * Math.PI * 2 + now * 0.8;
        const height = (9 + level * 3) * (0.65 + 0.35 * Math.sin(now * 15 + k * 1.7));
        const r = f.radius + 1;
        const bx = f.x + Math.cos(a) * r, by = f.y + Math.sin(a) * r;
        // Tongues lick outward and lean upward, like fire.
        const tx = bx + Math.cos(a) * height, ty = by + Math.sin(a) * height - height * 0.55;
        const side = 0.32;
        g.fillStyle(flame, 0.6).fillTriangle(
          f.x + Math.cos(a - side) * r, f.y + Math.sin(a - side) * r, f.x + Math.cos(a + side) * r, f.y + Math.sin(a + side) * r, tx, ty);
        g.fillStyle(core, 0.75).fillTriangle(
          f.x + Math.cos(a - side / 2) * r, f.y + Math.sin(a - side / 2) * r, f.x + Math.cos(a + side / 2) * r, f.y + Math.sin(a + side / 2) * r,
          (bx + tx) / 2, (by + ty) / 2);
      }
      const left = f.rageT / SOUL_RAGE.duration[level - 1]!;
      over.lineStyle(3, flame, 0.9);
      over.beginPath();
      over.arc(f.x, f.y, f.radius + 18 + level * 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left, false);
      over.strokePath();
    }
    if (f.lifestealing) {
      // 噬血: a dark red ring that beats like a heart.
      const beat = Math.max(0, Math.sin(now * 7)) ** 4;
      g.lineStyle(3, 0xc0182c, 0.4 + beat * 0.4).strokeCircle(f.x, f.y, f.radius + 7 + beat * 4);
    }
    if (f.powered) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 11);
      g.fillStyle(0xff7a1a, 0.14 + pulse * 0.1).fillCircle(f.x, f.y, f.radius + 9 + pulse * 3);
    }
    drawCharacterSteps(g, f, now);
    this.drawScarf(g, f, now);

    // --- the ninja ---
    sprite.setVisible(true).setPosition(f.x, f.y).setRotation(f.facing);
    // 暴走 grows the ninja a little with each 魂 level.
    sprite.setScale(f.radius / 18 / RES * (f.raging ? 1 + 0.04 * f.rageLevel : 1));
    const stunned = f.state === 'stun';
    sprite.setAlpha(stunned && Math.floor(now * 20) % 2 === 0 ? 0.55 : 1);
    if (f.flashT > 0) sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else if (f.burnT > 0 && Math.floor(now * 8) % 2 === 0) sprite.setTint(0xffa070).setTintMode(Phaser.TintModes.MULTIPLY);
    else if (f.chillT > 0) sprite.setTint(0xa8dcff).setTintMode(Phaser.TintModes.MULTIPLY);
    else if (f.paralyzed) sprite.setTint(0x9fc0ff).setTintMode(Phaser.TintModes.MULTIPLY);
    else if (f.raging) sprite.setTint(SOUL_RAGE.colors[f.rageLevel - 1]![1]).setTintMode(Phaser.TintModes.MULTIPLY);
    else sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    const summon = f.summoning;
    if (summon) {
      const color = this.summonColor(f);
      this.fx.summonCircle(g, this.gGlow, f.x, f.y, f.stateProgress, color, now, summon.kind);
    }
    const charge = f.sacrificeCharge;
    if (charge) {
      // The charge glows on the caster without painting its blast radius.
      const pulse = 0.5 + 0.5 * Math.sin(now * (8 + charge.t * 20));
      this.gGlow.fillStyle(0xff3a2a, 0.25 + 0.3 * pulse * charge.t).fillCircle(f.x, f.y, f.radius + 8 + charge.t * 8);
    }
    if (f.casting) {
      // The caster's aura matches the ritual's element.
      const k = 0.5 + 0.5 * Math.sin(now * 20);
      this.gGlow.fillStyle(this.summonColor(f), 0.14 + k * 0.1).fillCircle(f.x, f.y, f.radius + 10);
      this.gGlow.lineStyle(2, this.summonColor(f), 0.8).strokeCircle(f.x, f.y, f.radius + 12 + k * 4);
    }
    if (f.paralyzed) {
      // Crackling sparks while paralysed.
      for (let k = 0; k < 3; k++) {
        const a = Math.random() * Math.PI * 2;
        const r0 = f.radius - 4;
        const r1 = f.radius + 10;
        const mid = a + (Math.random() - 0.5) * 0.6;
        this.gGlow.lineStyle(2, 0xbfd4ff, 0.9).lineBetween(f.x + Math.cos(a) * r0, f.y + Math.sin(a) * r0, f.x + Math.cos(mid) * r1, f.y + Math.sin(mid) * r1);
      }
    }

    // --- on top ---
    if (f.raging) drawRageForm(over, this.gGlow, f, now);
    drawHeldWeapon(over, f.weapon.id, this.poseOf(f));
    if (f.usesSoul && f.soulLevel > 0) {
      // One purple orb circling per soul level.
      for (let k = 0; k < f.soulLevel; k++) {
        const a = now * 3 + (k * Math.PI * 2) / f.soulLevel;
        this.gGlow.fillStyle(0xb57bff, 0.85).fillCircle(f.x + Math.cos(a) * (f.radius + 12), f.y + Math.sin(a) * (f.radius + 12), 3);
      }
    }
    if (f.substituting) {
      // A ghostly log hovering beside you while Substitution is ready.
      drawLog(over, f.x - Math.cos(f.facing) * 26, f.y - Math.sin(f.facing) * 26, f.facing + Math.PI / 2, 0.35);
    }
    if (f.guarded) {
      this.fx.guardAura(over, f.x, f.y, f.radius + 12, 0.6 + 0.2 * Math.sin(now * 7), now);
    }
    if (f.state === 'channel') {
      over.lineStyle(3, 0x7dff8a, 0.9);
      over.beginPath();
      over.arc(f.x, f.y, f.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f.stateProgress, false);
      over.strokePath();
    }
    if (stunned) {
      // Little stars circling the head.
      for (let k = 0; k < 3; k++) {
        const a = now * 8 + (k * Math.PI * 2) / 3;
        this.gGlow.fillStyle(0xffe08a, 0.9).fillCircle(f.x + Math.cos(a) * 12, f.y - 4 + Math.sin(a) * 5, 2.2);
      }
    }
    const reviveReady = f.skills.some((sk, k) => sk?.effect.kind === 'revive' && f.cooldowns[k] <= 0 && f.pe >= sk.peCost);
    if (reviveReady && this.findReviveTarget(f)) {
      // Lifeline hint: a green pulse when a fallen teammate can be revived right now.
      const pulse = (now / 0.9) % 1;
      over.lineStyle(2, 0x7dff8a, 0.8 * (1 - pulse)).strokeCircle(f.x, f.y, f.radius + 6 + pulse * 14);
    }

    // Overhead HP / PE.
    const bw = 40;
    const bx = f.x - bw / 2;
    const by = f.y - f.radius - 14;
    over.fillStyle(0x000000, 0.6).fillRect(bx - 1, by - 1, bw + 2, 8);
    over.fillStyle(0xe5484d, 1).fillRect(bx, by, bw * (f.hp / f.maxHp), 3);
    const peColor = f.peDeniedT > 0 ? 0xffffff : 0xf2c94c;
    over.fillStyle(peColor, 1).fillRect(bx, by + 4, bw * (f.pe / f.maxPe), 2);
    tag.setPosition(f.x, by - 2).setAlpha(1);
  }

  this.fx.draw(g, over, this.gGlow);
}

/** 暴走 demon form: oni horns sweeping back from the head (longer each level) and glowing eyes. */
function drawRageForm(over: Phaser.GameObjects.Graphics, glow: Phaser.GameObjects.Graphics, f: Fighter, now: number): void {
  const level = f.rageLevel, [flame, core] = SOUL_RAGE.colors[level - 1]!;
  const r = f.radius * (1 + 0.04 * level);
  const at = (a: number, d: number) => ({ x: f.x + Math.cos(f.facing + a) * d, y: f.y + Math.sin(f.facing + a) * d });
  for (const side of [-1, 1]) {
    // Each horn: a curved wedge from the side of the head, out and back.
    const root1 = at(side * 1.25, r * 0.5), root2 = at(side * 1.75, r * 0.5);
    const bend = at(side * 1.85, r * (0.95 + level * 0.05));
    const tip = at(side * 2.35, r * (1.25 + level * 0.12));
    over.fillStyle(0x1a0c0c, 1).fillTriangle(root1.x, root1.y, root2.x, root2.y, bend.x, bend.y);
    over.fillTriangle(root2.x, root2.y, bend.x, bend.y, tip.x, tip.y);
    over.lineStyle(1.5, flame, 0.95).lineBetween(root1.x, root1.y, bend.x, bend.y).lineBetween(bend.x, bend.y, tip.x, tip.y);
    glow.fillStyle(core, 0.7).fillCircle(tip.x, tip.y, 1.8);
    // Eyes: bright points just forward of centre.
    const eye = at(side * 0.42, r * 0.58);
    glow.fillStyle(flame, 0.55 + 0.3 * Math.sin(now * 12)).fillCircle(eye.x, eye.y, 3.6);
    over.fillStyle(core, 1).fillCircle(eye.x, eye.y, 1.7);
  }
}
