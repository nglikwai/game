import * as Phaser from 'phaser';
import type { Difficulty } from '@/config';
import type { Fighter } from '@/gameplay/Fighter';
import type { SkillEffect } from '@/gameplay/skills';
import { aimTurn, shapeHits, shapeHitsRect, shapeReach, type Shape } from '@/gameplay/weapons';
import { type Intent, emptyIntent, type WorldView, type Controller, type Labels } from '@/input/contracts';

// ---------- CPU ----------

/** Index of the first equipped skill whose effect is one of `kinds`, or -1. */
function slotWith(f: Fighter, ...kinds: SkillEffect['kind'][]): number {
  return f.skills.findIndex((s) => !!s && kinds.includes(s.effect.kind));
}

/** The Hard CPU's knobs, one per behaviour (so each can be tested on its own). */
export const HARD = {
  /** Seconds between decisions (min, plus up to `thinkSpread` more). Standard: 0.09 + 0.08. */
  thinkMin: 0.05,
  thinkSpread: 0.04,
  /** Chance to swing on a decision when the target is in the weapon's shape. Standard: 0.8. */
  attackChance: 0.9,
  /** Close in on an enemy that is recovering or stunned, and always swing at it. */
  punish: true,
  /** Chance to fire a ranged skill when in range. Standard: 0.35. */
  shotChance: 0.55,
  /** How far ahead to aim a ranged skill, 0–1. Standard: 0.7. */
  lead: 1,
  /** Chance to dash away from an incoming swing. Standard: 0.45. */
  dashChance: 0.85,
  /** Pick targets by weakness, with focus fire. */
  smartTargets: true,
  /** Adjust spacing to the enemy's weapon reach. */
  spacing: true,
};

/**
 * CPUs only (the weapon is unchanged for players): a 手裡劍 lane reaches far and fast, and perfect aim made a CPU with
 * one too strong. Its throws wobble up to `spread` radians either way (`hardSpread` on Hard), and it throws only
 * `throwChance` as often as with other weapons.
 */
export const CPU_SHURIKEN = { spread: 0.24, hardSpread: 0.18, throwChance: 0.55 };

/** Hard CPUs share what they are attacking, per team, so a team focuses one enemy instead of each hitting its nearest. */
const TEAM_FOCUS = new Map<number, { target: Fighter; at: number }>();

/**
 * How far from a target to stand: inside the band for ring / arc, on the circle for hammer / bomb, where the whip's
 * S crosses the middle, in the bottom of the spade's U, otherwise `share` of the weapon's reach.
 */
function idealRange(s: Shape, reach: number, share: number): number {
  if (s.kind === 'ring' || s.kind === 'arc') return (s.inner + s.outer) / 2;
  if (s.kind === 'circle') return s.offset;
  if (s.kind === 'wave') return s.offset + s.length / 2;
  if (s.kind === 'scoop') return s.center - (s.inner + s.outer) / 2 + 4;
  return reach * share;
}

export class AIController implements Controller {
  readonly cpu = true;
  labels: Labels = ['', '', '', '', '', '', ''];
  /** Hard: faster reactions, smarter targets and spacing, punishes openings, dodges more. */
  private readonly hard: boolean;
  private lastTarget: Fighter | null = null;

  constructor(difficulty: Difficulty = 'standard') {
    this.hard = difficulty === 'hard';
  }
  private thinkT = 0;
  private held = emptyIntent();
  private strafe = Math.random() < 0.5 ? 1 : -1;
  private stuckT = 0;
  /** Committed sidestep around an obstacle: time left and direction. */
  private detourT = 0;
  private detour = { x: 0, y: 0 };
  private detourFlipped = false;

  read(self: Fighter, world: WorldView, dt: number): Intent {
    this.thinkT -= dt;
    if (this.thinkT > 0) {
      // Keep moving between decisions, but don't re-press buttons.
      return { ...this.held, attack: false, skills: [false, false, false, false], useItemAt: undefined };
    }
    this.thinkT = this.hard ? HARD.thinkMin + Math.random() * HARD.thinkSpread : 0.09 + Math.random() * 0.08;
    this.held = this.decide(self, world);
    return this.held;
  }

  /**
   * Hard: weigh distance against how hurt each enemy is (weak ones are worth chasing), stick with the
   * current target, and join teammates already attacking someone.
   */
  private pickTarget(self: Fighter, enemies: Fighter[]): Fighter {
    const now = performance.now();
    const focus = TEAM_FOCUS.get(self.team);
    const focused = focus && now - focus.at < 1500 ? focus.target : null;
    let best = enemies[0];
    let bestScore = Infinity;
    for (const e of enemies) {
      let score = self.distTo(e) * (0.55 + 0.9 * Math.max(0, e.hp) / e.maxHp);
      if (e === this.lastTarget) score *= 0.8;
      if (e === focused) score *= 0.75;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    this.lastTarget = best;
    TEAM_FOCUS.set(self.team, { target: best, at: now });
    return best;
  }

  /** Prefer enemies pressuring an ally, especially a wounded ally or an incoming swing. */
  private pickThreatToAlly(self: Fighter, world: WorldView, enemies: Fighter[]): Fighter | null {
    const allies = world.fighters.filter((f) => f !== self && f.alive && !self.isEnemy(f) && !f.untouchable);
    let threat: Fighter | null = null;
    let best = Infinity;
    for (const enemy of enemies) for (const ally of allies) {
      const distance = enemy.distTo(ally);
      const swinging = (enemy.state === 'windup' || enemy.state === 'active') &&
        shapeHits(enemy.weapon.shape, enemy.x, enemy.y, enemy.facing, ally.x, ally.y, ally.radius + 20);
      if (distance > 240 && !swinging) continue;
      const urgency = (ally.hp < ally.maxHp * 0.5 ? 0.6 : 1) * (swinging ? 0.5 : 1);
      const score = (self.distTo(enemy) + distance * 0.5) * urgency;
      if (score < best) { best = score; threat = enemy; }
    }
    return threat;
  }

  private decide(self: Fighter, world: WorldView): Intent {
    const out = emptyIntent();
    // Vanished enemies can't be seen, so they're ignored.
    const enemies = world.fighters.filter((f) => self.isEnemy(f) && f.alive && (!f.hidden || (f.inFog && self.distTo(f) < 90)) && !f.untouchable);
    const ownWalls = world.objectives.filter((o) => o.team === self.team);
    const obj = ownWalls.length ? ownWalls.reduce((a, b) =>
      Math.hypot(a.x - self.x, a.y - self.y) < Math.hypot(b.x - self.x, b.y - self.y) ? a : b) : null;
    const chest = world.lootChests === false || world.chests.length === 0 ? null
      : world.chests.reduce((a, b) => (Math.hypot(a.x - self.x, a.y - self.y) < Math.hypot(b.x - self.x, b.y - self.y) ? a : b));
    const enemyTowers = (world.towers ?? []).filter((t) => t.alive && t.team !== self.team && !(t.tree && !t.grove));
    const tower = enemyTowers.length > 0
      ? enemyTowers.reduce((a, b) => (Math.hypot(a.x - self.x, a.y - self.y) < Math.hypot(b.x - self.x, b.y - self.y) ? a : b))
      : null;
    const unfinished = (world.capturePoints ?? []).filter((p) => p.team === self.team && !p.sealed);
    const capture = world.coordinateCaptures ? unfinished[0] ?? null : unfinished.length ? unfinished.reduce((a, b) =>
      Math.hypot(a.x - self.x, a.y - self.y) < Math.hypot(b.x - self.x, b.y - self.y) ? a : b) : null;
    const escort = world.escort?.alive && !world.escort.arrived && !world.escort.lost ? world.escort : null;
    const guiding = escort?.team === self.team ? escort : null;
    const raiding = escort && escort.team !== self.team ? escort : null;
    const relay = world.spiritRelay?.team === self.team ? world.spiritRelay : null;
    const carrying = !!relay?.spirits.some((spirit) => spirit.carrier === self);
    const freeSpirits = relay?.spirits.filter((spirit) => !spirit.carrier) ?? [];
    const relayGoal = carrying ? relay!.destination : freeSpirits.length ? freeSpirits.reduce((a, b) =>
      Math.hypot(a.x - self.x, a.y - self.y) < Math.hypot(b.x - self.x, b.y - self.y) ? a : b) : null;
    const fallbackGoal = relayGoal ?? guiding ?? raiding ?? capture ?? obj ?? tower ?? chest;
    if (enemies.length === 0 && !fallbackGoal) return out;

    const defendParty = world.defendTeam === self.team;
    const lanternThreat = guiding ? enemies.filter((e) => Math.hypot(e.x - guiding.x, e.y - guiding.y) < guiding.radius + 100)
      .sort((a, b) => Math.hypot(a.x - guiding.x, a.y - guiding.y) - Math.hypot(b.x - guiding.x, b.y - guiding.y))[0] : null;
    const allyThreat = (defendParty ? this.pickThreatToAlly(self, world, enemies) : null) ?? lanternThreat;
    // With no enemy around (Save the Princess, everyone else respawning), aim at the wall / a chest.
    const couriers = world.spiritRelay && world.spiritRelay.team !== self.team
      ? enemies.filter((f) => world.spiritRelay!.spirits.some((spirit) => spirit.carrier === f)) : [];
    const courier = couriers.length ? couriers.reduce((a, b) => self.distTo(a) < self.distTo(b) ? a : b) : null;
    const target = allyThreat ?? courier ?? (enemies.length > 0 ? (this.hard && HARD.smartTargets ? this.pickTarget(self, enemies) : enemies.reduce((a, b) => (self.distTo(a) < self.distTo(b) ? a : b))) : null);
    const tx = target ? target.x : fallbackGoal!.x;
    const ty = target ? target.y : fallbackGoal!.y;
    const dx = tx - self.x;
    const dy = ty - self.y;
    const dist = target ? Math.hypot(dx, dy) : Infinity;
    const ang = Math.atan2(dy, dx);
    const w = self.weapon;
    const reach = shapeReach(w.shape);
    const jitter = (Math.random() - 0.5) * 0.25;
    out.ax = Math.cos(ang + jitter);
    out.ay = Math.sin(ang + jitter);

    if (Math.random() < 0.02) this.strafe *= -1;

    // Thunder (spends soul): worth it at level 2+, or to finish off a weak enemy.
    // The Quest boss's 1 soul already strikes two players, so he casts as soon as he has a level.
    const bossSoul = self.boss;
    const reaper = slotWith(self, 'soulReaper');
    // Reaper: a gamble per target, so wait for more soul (more rolls).
    if (reaper >= 0 && self.canUseSkill(reaper) && (bossSoul || self.soulLevel >= 3)) {
      out.skills[reaper] = true;
      return out;
    }
    // Holy Fire: reliable chip damage, so cast as soon as there's any soul.
    const fire = slotWith(self, 'soulFire');
    if (fire >= 0 && self.canUseSkill(fire) && (bossSoul || self.soulLevel >= 2 || enemies.some((e) => e.hp < 12))) {
      out.skills[fire] = true;
      return out;
    }
    // Sacred Tree: pins a crowd; worth it as soon as several enemies are about.
    const tree = slotWith(self, 'soulTree');
    if (tree >= 0 && self.canUseSkill(tree) && (bossSoul || enemies.length >= 2)) {
      out.skills[tree] = true;
      return out;
    }
    const thunder = slotWith(self, 'soulThunder');
    if (thunder >= 0 && self.canUseSkill(thunder) && (bossSoul || self.soulLevel >= 2 || enemies.some((e) => e.hp < 20))) {
      out.skills[thunder] = true;
      return out;
    }

    const heal = slotWith(self, 'channelHeal', 'instantHeal');
    const regen = slotWith(self, 'regen');
    // 鉤鎖 is a projectile too, but used to drag someone in, not to shoot from afar.
    const hook = self.skills.findIndex((sk) => sk?.effect.kind === 'projectile' && !!sk.effect.pull);
    const shot = self.skills.findIndex((sk) => sk?.effect.kind === 'projectile' && !sk.effect.pull);
    const lifesteal = slotWith(self, 'lifesteal');
    const counter = slotWith(self, 'counter');
    const shadowStep = slotWith(self, 'shadowStep');
    const dash = slotWith(self, 'dash');
    const sprint = slotWith(self, 'speedBuff');
    const fury = slotWith(self, 'powerUp');
    const lifeline = slotWith(self, 'revive');
    const guard = slotWith(self, 'guard');
    const vanish = slotWith(self, 'stealth');
    const substitute = slotWith(self, 'substitute');
    const caltrops = slotWith(self, 'caltrops');
    // 捨身: worth it with several enemies in the blast, to finish someone, or as a last act when nearly dead.
    const sac = slotWith(self, 'sacrifice');
    if (sac >= 0 && self.canUseSkill(sac)) {
      const e = self.skills[sac]!.effect;
      if (e.kind === 'sacrifice') {
        const inBlast = enemies.filter((t) => self.distTo(t) < e.radius + t.radius - 6);
        const finisher = inBlast.some((t) => t.hp <= e.hpCost * 2);
        const healthy = self.hp > e.hpCost + 25;
        const lastAct = self.hp <= e.hpCost && (inBlast.length >= 2 || finisher);
        if ((healthy && (inBlast.length >= 2 || finisher)) || lastAct) {
          out.skills[sac] = true;
          return out;
        }
      }
    }
    const flicker = slotWith(self, 'teleport');
    const teamHeal = slotWith(self, 'teamHeal');
    const teamPe = slotWith(self, 'teamPe');
    const teamFury = slotWith(self, 'teamFury');

    // Lifeline works from anywhere: bring a fallen teammate back when there's HP to share
    // and nobody is right on top of us.
    const fallen = lifeline >= 0 && world.fighters.some((f) => f !== self && !f.alive && !self.isEnemy(f));
    if (fallen && self.hp >= 36 && dist > 160 && self.canUseSkill(lifeline)) {
      out.skills[lifeline] = true;
      return out;
    }

    // Healing Circle when we or a teammate are hurt.
    const hurtMate = world.fighters.some((f) => f.alive && !self.isEnemy(f) && f.hp < 55);
    if (teamHeal >= 0 && hurtMate && self.canUseSkill(teamHeal)) {
      out.skills[teamHeal] = true;
      return out;
    }

    // Spirit Circle when we or a teammate are low on PE; War Drum when a fight is on.
    const tiredMate = world.fighters.some((f) => f.alive && !self.isEnemy(f) && f.pe < 30);
    if (teamPe >= 0 && tiredMate && self.canUseSkill(teamPe)) {
      out.skills[teamPe] = true;
      return out;
    }
    // Ward Circle: when a fight is on and the team is hurt or outnumbered.
    const teamGuard = slotWith(self, 'teamGuard');
    if (teamGuard >= 0 && dist < reach * 2 && (hurtMate || enemies.length >= 2) && self.canUseSkill(teamGuard)) {
      out.skills[teamGuard] = true;
      return out;
    }
    if (teamFury >= 0 && dist < reach * 1.5 && self.canUseSkill(teamFury) && self.pe > self.skills[teamFury]!.peCost) {
      out.skills[teamFury] = true;
      return out;
    }

    // Body Flicker out of trouble when badly hurt with an enemy close.
    if (flicker >= 0 && self.hp < 35 && dist < 160 && self.canUseSkill(flicker)) {
      out.skills[flicker] = true;
      return out;
    }

    // 甘露 works while fighting, so start it as soon as we're worn down.
    if (regen >= 0 && self.hp < self.maxHp * 0.7 && !self.regenerating && self.canUseSkill(regen)) {
      out.skills[regen] = true;
      return out;
    }
    // Recovery when hurt and nobody is close.
    if (heal >= 0 && self.hp < 45 && dist > 280 && self.canUseSkill(heal)) {
      out.skills[heal] = true;
      return out;
    }
    // Hurt and not under pressure: go and pick a healing herb.
    const herbs = world.herbs?.() ?? [];
    if (herbs.length > 0 && self.hp < self.maxHp * 0.55 && dist > 200) {
      const h = herbs.reduce((a, b) => (Math.hypot(a.x - self.x, a.y - self.y) < Math.hypot(b.x - self.x, b.y - self.y) ? a : b));
      const d = Math.hypot(h.x - self.x, h.y - self.y) || 1;
      out.mx = (h.x - self.x) / d;
      out.my = (h.y - self.y) / d;
      return out;
    }

    // An enemy charging 捨身 nearby: get out of the blast.
    const blast = enemies.find((e) => e.sacrificeCharge && self.distTo(e) < e.sacrificeCharge.radius + self.radius + 30);
    if (blast) {
      const d = self.distTo(blast) || 1;
      out.mx = (self.x - blast.x) / d;
      out.my = (self.y - blast.y) / d;
      return out;
    }

    // Is an enemy about to swing at me?
    const threatened = enemies.some(
      (e) => e.state === 'windup' && shapeHits(e.weapon.shape, e.x, e.y, e.facing, self.x, self.y, self.radius + 12),
    );
    const incoming = world.projectiles.some((p) => {
      if (p.team === self.team) return false;
      const rx = self.x - p.x;
      const ry = self.y - p.y;
      const along = (rx * p.vx + ry * p.vy) / Math.hypot(p.vx, p.vy);
      const perp = Math.abs(rx * p.vy - ry * p.vx) / Math.hypot(p.vx, p.vy);
      return along > 0 && along < 260 && perp < self.radius + p.radius + 6;
    });

    // Use a pocket item when it suits the moment (items cost no PE).
    const fallenMate = world.fighters.some((f) => f !== self && !f.alive && !self.isEnemy(f));
    const itemAt = self.pocket.findIndex((it) => {
      const e = it.effect;
      switch (e.kind) {
        case 'instantHeal': return self.hp < 55;
        case 'restorePe': return self.pe < 30;
        case 'powerUp': return !!target && dist < reach * 1.3;
        case 'guard': return threatened || incoming || (self.hp < 60 && dist < 150);
        case 'speedBuff': return dist > 420;
        case 'projectile': return !!target && dist > 200 && dist < 600;
        case 'revive': return fallenMate;
        default: return false;
      }
    });
    if (itemAt >= 0 && self.state === 'idle') {
      out.useItemAt = itemAt;
      return out;
    }

    // Go for the princess wall, or a chest when no enemy is close.
    const chestDist = chest ? Math.hypot(chest.x - self.x, chest.y - self.y) : Infinity;
    // Towers: the main goal in Siege; otherwise only worth hitting when one is close and no enemy is.
    const towerDist = tower ? Math.hypot(tower.x - self.x, tower.y - self.y) : Infinity;
    const towerGoal = tower && (world.siege ? !target || dist > 160 : (world.towersWhenClear !== undefined && (!target || dist > world.towersWhenClear)) || (towerDist < 260 && (!target || dist > 200))) ? tower : null;
    // Quest support allies must not abandon a fight or a threatened teammate for an objective/chest.
    // Towers remain the fallback while the guards are defeated or respawning.
    const raidGoal = raiding && (!target || dist > 180) ? raiding : null;
    const goal = defendParty && target ? null : (obj ?? towerGoal ?? (chest && chestDist < 450 && (!target || dist > 220) ? chest : null));

    let mx = 0;
    let my = 0;
    /** Where we're trying to get to this decision (for map routing), if anywhere. */
    let heading: { x: number; y: number } | null = null;
    const perpX = -Math.sin(ang) * this.strafe;
    const perpY = Math.cos(ang) * this.strafe;

    if ((threatened || incoming || (self.hp < 60 && dist < 150)) && guard >= 0 && self.canUseSkill(guard)) {
      out.skills[guard] = true;
    } else if ((threatened || incoming) && substitute >= 0 && self.canUseSkill(substitute)) {
      out.skills[substitute] = true;
    } else if (threatened && counter >= 0 && self.canUseSkill(counter)) {
      // An enemy is mid-swing at us: parry it and strike back.
      out.skills[counter] = true;
    } else if (vanish >= 0 && self.canUseSkill(vanish) && dist < 200 && self.hp < 40) {
      // Hurt or out of breath with an enemy close: disappear and slip away.
      out.skills[vanish] = true;
    } else if (caltrops >= 0 && self.canUseSkill(caltrops) && dist < 110) {
      out.skills[caltrops] = true;
    }
    if (threatened || incoming) {
      mx = perpX - Math.cos(ang) * (threatened ? 0.8 : 0);
      my = perpY - Math.sin(ang) * (threatened ? 0.8 : 0);
      if (dash >= 0 && self.canUseSkill(dash) && Math.random() < (this.hard ? HARD.dashChance : 0.45)) out.skills[dash] = true;
    } else if (guiding && !allyThreat && (!target || Math.hypot(target.x - guiding.x, target.y - guiding.y) > guiding.radius + 100)) {
      // Return to the moving lantern instead of chasing a distant guard across the arena.
      const d = Math.hypot(guiding.x - self.x, guiding.y - self.y);
      if (d > guiding.radius * 0.4) {
        heading = guiding; mx = (guiding.x - self.x) / d; my = (guiding.y - self.y) / d;
      }
    } else if (raidGoal) {
      // Stand inside the lantern's circle to push it back. The lantern can't be broken, so never swing at it.
      const d = Math.hypot(raidGoal.x - self.x, raidGoal.y - self.y);
      if (d > raidGoal.radius * 0.4) {
        heading = raidGoal; mx = (raidGoal.x - self.x) / d; my = (raidGoal.y - self.y) / d;
      }
    } else if (relayGoal && (carrying || !allyThreat && (!target || dist > 220))) {
      const d = Math.hypot(relayGoal.x - self.x, relayGoal.y - self.y);
      if (d > 8) {
        heading = relayGoal; mx = (relayGoal.x - self.x) / d; my = (relayGoal.y - self.y) / d;
      }
    } else if (capture && !allyThreat && (!target || dist > 260)) {
      // Hold inside the circle, but leave it to defend a teammate or fight a nearby guard.
      const d = Math.hypot(capture.x - self.x, capture.y - self.y);
      if (d > capture.radius * 0.4) {
        heading = capture;
        mx = (capture.x - self.x) / d;
        my = (capture.y - self.y) / d;
      }
    } else if (goal && (!target || dist > 130 || Math.random() < 0.3)) {
      const obj = goal;
      heading = { x: obj.x, y: obj.y };
      // Head for the closest point of the wall and hit it.
      const px = Phaser.Math.Clamp(self.x, obj.x - obj.w / 2, obj.x + obj.w / 2);
      const py = Phaser.Math.Clamp(self.y, obj.y - obj.h / 2, obj.y + obj.h / 2);
      const od = Math.hypot(px - self.x, py - self.y);
      const s = w.shape;
      // The nunchaku strikes to the sides, so it turns side-on to swing.
      const oang = Math.atan2(py - self.y, px - self.x) + aimTurn(s);
      const ideal = idealRange(s, reach, 0.6);
      const approach = od > ideal + 8 ? 1 : od < ideal - 20 ? -0.6 : 0;
      mx = Math.cos(oang) * approach - Math.sin(oang) * this.strafe * 0.25;
      my = Math.sin(oang) * approach + Math.cos(oang) * this.strafe * 0.25;
      if (shapeHitsRect(s, self.x, self.y, oang, obj.x, obj.y, obj.w, obj.h)) {
        out.attack = true;
        out.ax = Math.cos(oang);
        out.ay = Math.sin(oang);
      }
    } else if (target) {
      heading = { x: target.x, y: target.y };
      const s = w.shape;
      // Stand where the weapon hits best: inside the band for ring / arc, on the circle for hammer / bomb.
      const ideal = idealRange(s, reach, 0.7);
      let approach = dist > ideal + 12 ? 1 : dist < ideal - 25 ? -0.7 : 0;
      // Hard: read the enemy. Close in on an opening, and keep away from a shorter weapon
      // (or stay tight against a longer one, where backing off would only get us hit).
      const recovering = this.hard && HARD.punish && (target.state === 'recovery' || target.state === 'stun' || target.paralyzed);
      if (this.hard && (HARD.punish || HARD.spacing)) {
        const eReach = shapeReach(target.weapon.shape);
        if (recovering) approach = dist > ideal ? 1 : 0;
        else if (HARD.spacing && eReach < reach * 0.8 && dist < eReach + 50) approach = -0.8;
        else if (HARD.spacing && eReach > reach * 1.2) approach = dist > ideal + 12 ? 1.2 : 0.3;
        if (recovering && dist > reach && dash >= 0 && self.canUseSkill(dash) && Math.random() < 0.5) out.skills[dash] = true;
      }
      mx = Math.cos(ang) * approach + perpX * 0.45;
      my = Math.sin(ang) * approach + perpY * 0.45;

      const hookFx = hook >= 0 ? self.skills[hook]!.effect : null;
      const stepFx = shadowStep >= 0 ? self.skills[shadowStep]!.effect : null;
      if (fury >= 0 && dist < reach * 1.3 && self.canUseSkill(fury) && self.pe > self.skills[fury]!.peCost) {
        out.skills[fury] = true;
      } else if (lifesteal >= 0 && dist < reach * 1.3 && self.hp < self.maxHp * 0.8 && self.canUseSkill(lifesteal) && self.pe > self.skills[lifesteal]!.peCost) {
        out.skills[lifesteal] = true;
      } else if (hookFx?.kind === 'projectile' && dist > reach + 60 && dist < hookFx.range * 0.85 && self.canUseSkill(hook)
        && self.pe > self.skills[hook]!.peCost && Math.random() < (this.hard ? HARD.shotChance : 0.35)) {
        // Drag the target into weapon range.
        out.ax = Math.cos(ang);
        out.ay = Math.sin(ang);
        out.skills[hook] = true;
      } else if (stepFx?.kind === 'shadowStep' && dist > reach + 60 && dist < stepFx.range * 0.9 && self.hp > 40 && self.canUseSkill(shadowStep)
        && self.pe > self.skills[shadowStep]!.peCost && Math.random() < (this.hard ? HARD.shotChance : 0.3)) {
        // Blink behind the target to strike from their blind side.
        out.skills[shadowStep] = true;
      } else if (shapeHits(w.shape, self.x, self.y, ang + aimTurn(s), target.x, target.y, target.radius - 4)
        && Math.random() < (recovering ? 1 : this.hard ? HARD.attackChance : 0.8) * (w.id === 'shuriken' ? CPU_SHURIKEN.throwChance : 1)) {
        out.attack = true;
        const wobble = w.id === 'shuriken' ? (Math.random() * 2 - 1) * (this.hard ? CPU_SHURIKEN.hardSpread : CPU_SHURIKEN.spread) : 0;
        out.ax = Math.cos(ang + aimTurn(s) + wobble);
        out.ay = Math.sin(ang + aimTurn(s) + wobble);
      } else if (shot >= 0 && dist > 260 && dist < 640 && self.canUseSkill(shot) && self.pe > self.skills[shot]!.peCost && Math.random() < (this.hard ? HARD.shotChance : 0.35)) {
        // Lead the target a little.
        const p = self.skills[shot]!.effect;
        const t = p.kind === 'projectile' ? dist / p.speed : 0;
        const lead = this.hard ? HARD.lead : 0.7;
        const lx = target.x + target.vx * t * lead - self.x;
        const ly = target.y + target.vy * t * lead - self.y;
        const l = Math.hypot(lx, ly) || 1;
        out.ax = lx / l;
        out.ay = ly / l;
        out.skills[shot] = true;
      } else if (sprint >= 0 && dist > 420 && self.canUseSkill(sprint) && self.pe > 60) {
        out.skills[sprint] = true;
      }
    }

    // Impassable terrain (a river): head for the waypoint the map suggests, e.g. a bridge.
    if (heading && world.route && !threatened && !incoming) {
      const wp = world.route(self.x, self.y, heading.x, heading.y);
      if (wp) {
        const d = Math.hypot(wp.x - self.x, wp.y - self.y) || 1;
        mx = (wp.x - self.x) / d;
        my = (wp.y - self.y) / d;
      }
    }

    // Outside the barrier: get back in before anything else.
    const safe = world.safe?.();
    if (safe) {
      const d = Math.hypot(safe.x - self.x, safe.y - self.y);
      if (d > safe.r - 40) {
        mx = (safe.x - self.x) / (d || 1);
        my = (safe.y - self.y) / (d || 1);
      }
    }

    // Standing in fire, or in a spot about to burst: step off before chasing anyone.
    let firePush: { x: number; y: number } | null = null;
    let fireNear = Infinity;
    for (const fire of world.fires?.() ?? []) {
      if (fire.safeTeam === self.team) continue;
      const dx = self.x - fire.x;
      const dy = self.y - fire.y;
      const d = Math.hypot(dx, dy);
      const inside = fire.rx && fire.ry
        ? Math.hypot(dx / (fire.rx + self.radius + 22), dy / (fire.ry + self.radius + 22)) < 1
        : d < fire.r + self.radius + 22;
      if (inside && d < fireNear) {
        fireNear = d;
        firePush = { x: dx / (d || 1), y: dy / (d || 1) };
      }
    }
    if (firePush) {
      mx = firePush.x;
      my = firePush.y;
    }
    // Never dash into a hazard, or blink next to a target standing in one (e.g. a sand pit's deep middle).
    const hazards = world.fires?.() ?? [];
    const inHazard = (x: number, y: number) => hazards.some((fire) => fire.safeTeam !== self.team && (fire.rx && fire.ry
      ? Math.hypot((x - fire.x) / (fire.rx + self.radius), (y - fire.y) / (fire.ry + self.radius)) < 1
      : Math.hypot(x - fire.x, y - fire.y) < fire.r + self.radius));
    const dashFx = dash >= 0 ? self.skills[dash]!.effect : null;
    if (out.skills[dash] && dashFx?.kind === 'dash') {
      const l = Math.hypot(mx, my);
      const dx = l > 0.1 ? mx / l : Math.cos(self.facing), dy = l > 0.1 ? my / l : Math.sin(self.facing);
      const far = dashFx.speed * dashFx.duration;
      if (inHazard(self.x + dx * far, self.y + dy * far) || inHazard(self.x + dx * far / 2, self.y + dy * far / 2)) out.skills[dash] = false;
    }
    if (shadowStep >= 0 && out.skills[shadowStep] && target && inHazard(target.x, target.y)) out.skills[shadowStep] = false;

    // Obstacle escape: if we're making no headway where we want to go (stopped, or just
    // sliding along a wall), sidestep at 90° for a moment; if that's blocked too, try the other way.
    const len = Math.hypot(mx, my);
    if (this.detourT > 0) {
      this.detourT -= 0.13;
      if (Math.hypot(self.vx, self.vy) < 40 && self.state === 'idle' && !this.detourFlipped) {
        this.detourFlipped = true;
        this.strafe *= -1;
        this.detour = { x: -this.detour.x, y: -this.detour.y };
      }
      mx = this.detour.x;
      my = this.detour.y;
    } else {
      const progress = len > 0.2 ? (self.vx * mx + self.vy * my) / len : Infinity;
      if (progress < 40 && self.state === 'idle') this.stuckT += 0.13;
      else this.stuckT = Math.max(0, this.stuckT - 0.13);
      if (this.stuckT > 0.4) {
        this.stuckT = 0;
        this.detourT = 0.9;
        this.detourFlipped = false;
        this.detour = { x: (-my / len) * this.strafe, y: (mx / len) * this.strafe };
        mx = this.detour.x;
        my = this.detour.y;
      }
    }

    out.mx = mx;
    out.my = my;
    return out;
  }
}
