import * as Phaser from 'phaser';
import { summonStrikeCount } from '@/gameplay/skills';
import { drawShape } from '@/gameplay/weapons';
import { T } from '@/localization';
import { drawHeldWeapon, drawLog, kunai } from '@/rendering/fighterArt';
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
  | 'renderSpikes' | 'renderStorm' | 'renderTide' | 'renderTower' | 'renderVents'
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
  this.renderStorm(now);
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
    g.fillStyle(0x000000, 0.12 * a).fillCircle(c.x, c.y, c.r);
    for (const sp of c.spikes) {
      g.lineStyle(2, 0x8a93a3, a);
      for (let k = 0; k < 2; k++) {
        const ang = sp.a + (k * Math.PI) / 2;
        g.lineBetween(sp.x - Math.cos(ang) * 4, sp.y - Math.sin(ang) * 4, sp.x + Math.cos(ang) * 4, sp.y + Math.sin(ang) * 4);
      }
    }
  }

  for (const p of this.projectiles) {
    const e = p.effect;
    const a = Math.atan2(p.vy, p.vx);
    if (p.element === 'ice') {
      // An ice shard: a pale spike with a frosty trail.
      const c = Math.cos(a), s = Math.sin(a);
      this.gGlow.lineStyle(6, 0x8fd8ff, 0.35).lineBetween(p.x - c * 34, p.y - s * 34, p.x, p.y);
      over.fillStyle(0xe8fbff, 1).fillTriangle(p.x + c * 14, p.y + s * 14, p.x - c * 8 - s * 6, p.y - s * 8 + c * 6, p.x - c * 8 + s * 6, p.y - s * 8 - c * 6);
    } else if (p.element === 'thunder') {
      // A crackling bolt: a jagged streak behind a bright core.
      const c = Math.cos(a), s = Math.sin(a);
      const pts = [0, 1, 2, 3, 4].map((k) => new Phaser.Math.Vector2(p.x - c * k * 12 + (k % 2 ? -s : s) * 6, p.y - s * k * 12 + (k % 2 ? c : -c) * 6));
      this.gGlow.lineStyle(5, 0xb08aff, 0.6).strokePoints(pts, false);
      this.gGlow.lineStyle(2, 0xffffff, 0.9).strokePoints(pts, false);
      this.gGlow.fillStyle(0xe8dcff, 1).fillCircle(p.x, p.y, e.radius * 0.7);
    } else if (e.radius > 8) {
      // Fire jutsu: hot core over the flame trail.
      this.gGlow.fillStyle(0xff7a2a, 0.5).fillCircle(p.x, p.y, e.radius * 1.4);
      this.gGlow.fillStyle(0xffe08a, 0.9).fillCircle(p.x, p.y, e.radius * 0.7);
    } else {
      // Thrown kunai with a faint streak.
      over.lineStyle(2, 0xffffff, 0.35).lineBetween(p.x - Math.cos(a) * 26, p.y - Math.sin(a) * 26, p.x, p.y);
      kunai(over, p.x - Math.cos(a) * 6, p.y - Math.sin(a) * 6, a, 14);
    }
  }

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
    if (f.state === 'windup') {
      // Faint telegraph of the hit area, so opponents can react.
      drawShape(g, f.weapon.shape, f.x, f.y, f.facing, f.color, 0.05 + 0.13 * f.stateProgress);
    }
    if (f.powered) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 11);
      g.fillStyle(0xff7a1a, 0.14 + pulse * 0.1).fillCircle(f.x, f.y, f.radius + 9 + pulse * 3);
    }
    if (f.sprinting || f.state === 'dash') {
      // Afterimages.
      for (const k of [1, 2]) {
        g.fillStyle(f.color, 0.14 / k).fillCircle(f.x - f.vx * 0.05 * k, f.y - f.vy * 0.05 * k, f.radius * 0.95);
      }
    }
    this.drawScarf(g, f, now);

    // --- the ninja ---
    sprite.setVisible(true).setPosition(f.x, f.y).setRotation(f.facing);
    const stunned = f.state === 'stun';
    sprite.setAlpha(stunned && Math.floor(now * 20) % 2 === 0 ? 0.55 : 1);
    if (f.flashT > 0) sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else if (f.burnT > 0 && Math.floor(now * 8) % 2 === 0) sprite.setTint(0xffa070).setTintMode(Phaser.TintModes.MULTIPLY);
    else if (f.chillT > 0) sprite.setTint(0xa8dcff).setTintMode(Phaser.TintModes.MULTIPLY);
    else if (f.paralyzed) sprite.setTint(0x9fc0ff).setTintMode(Phaser.TintModes.MULTIPLY);
    else sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    const summon = f.summoning;
    if (summon) {
      const color = this.summonColor(f);
      this.fx.summonCircle(g, this.gGlow, f.x, f.y, f.stateProgress, color, now, summon.kind);
      for (const t of this.summonTargets(f, summonStrikeCount(summon.kind, summon.level, f.boss))) this.fx.targetMark(over, t.x, t.y, f.stateProgress, color, now, summon.kind);
    }
    const charge = f.sacrificeCharge;
    if (charge) {
      // 捨身 telegraph: the blast area on the ground, filling up as the charge builds.
      const pulse = 0.5 + 0.5 * Math.sin(now * (8 + charge.t * 20));
      g.fillStyle(0xff2a2a, 0.08 + 0.12 * charge.t).fillCircle(f.x, f.y, charge.radius * charge.t);
      g.lineStyle(3, 0xff4a3a, 0.5 + 0.4 * pulse).strokeCircle(f.x, f.y, charge.radius);
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
    // PE bar glows a little while resting (recovering at the boosted rate).
    const peColor = f.peDeniedT > 0 ? 0xffffff : f.resting && f.pe < f.maxPe ? 0xfff0a0 : 0xf2c94c;
    over.fillStyle(peColor, 1).fillRect(bx, by + 4, bw * (f.pe / f.maxPe), 2);
    tag.setPosition(f.x, by - 2).setAlpha(1);
  }

  this.fx.draw(g, over, this.gGlow);
}
