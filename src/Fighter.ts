import * as Phaser from 'phaser';
import { QUEST, PARALYZED_DAMAGE_TAKEN, BODY_RADIUS, ICE_GRIP, MOVE_SPEED, SPRING, SAND_SPEED, SHALLOWS_SPEED, BOOST_SPEED, POISON, STEALTH_SPEED, SOUL_CAST_TIME, SOUL_LEVELS, SOUL_PER_LEVEL, SOUL_REAPER, TOWER_AURA_DAMAGE_TAKEN, TOWER_AURA_PE_REGEN, MUD_SPEED, PE_REGEN_DELAY, PE_REGEN_MOVING, PE_REGEN_PER_SEC, PE_REGEN_STILL } from '@/config';
import type { Controller, Intent } from '@/controls';
import { sfx } from '@/sfx';
import { POCKET_SIZE, type Item, type ItemEffect } from '@/items';
import type { Role } from '@/roles';
import { isSummon, skillCooldownFor, type Skill, type SkillEffect, type SummonKind } from '@/skills';
import type { Weapon } from '@/weapons';
import type { TerrainKind } from '@/maps/common';
import { createMatchStats } from '@/matchStats';

export type FighterState = 'idle' | 'windup' | 'active' | 'recovery' | 'stun' | 'channel' | 'dash' | 'paralyzed' | 'casting' | 'charging' | 'dead';

/** What a Fighter needs from the scene it lives in. */
export interface Arena {
  /** Visual cue after a skill is accepted; never called for a failed cast or a pocket item. */
  onSkillCast?(f: Fighter, effect: SkillEffect, mx: number, my: number): void;
  onSwingActive(f: Fighter): void;
  spawnProjectile(f: Fighter, effect: Extract<ItemEffect, { kind: 'projectile' }>): void;
  popText(x: number, y: number, text: string, color: string): void;
  /** A fallen teammate anywhere on the field, for Lifeline. */
  findReviveTarget(f: Fighter): Fighter | null;
  /** A free spot right next to `f` where a revived teammate can appear. */
  reviveSpot(f: Fighter): { x: number; y: number };
  /** Called after `by` brings `target` back with Lifeline. */
  onRevived(target: Fighter, by: Fighter): void;
  /** A 還魂丹 in `f`'s pocket just brought them back from the brink. */
  onPillRevived(f: Fighter): void;
  /** Special ground under a point, if any. */
  terrainAt(x: number, y: number): TerrainKind | null;
  /** Wind push at a spot (battlefield px/s), if any. */
  windAt(x: number, y: number): { x: number; y: number } | null;
  /** Speed multiplier from enemy caltrops under this fighter (1 = none). */
  hazardSlow(f: Fighter): number;
  /** Lay caltrops where `f` stands. */
  dropCaltrops(f: Fighter, effect: Extract<ItemEffect, { kind: 'caltrops' }>): void;
  /** Substitution triggered: move `f` clear of the hit coming from direction (dirx, diry). */
  onSubstitute(f: Fighter, dirx: number, diry: number): void;
  /** Body Flicker: move `f` to a random spot far from enemies. */
  teleportSafe(f: Fighter): void;
  /** Soul skill: lightning on the `count` nearest enemies of `f`. */
  thunderStrike(f: Fighter, count: number): void;
  /** Soul skill: the reaper visits the `count` nearest enemies of `f`. */
  reaperStrike(f: Fighter, count: number): void;
  /** 捨身: the blast around `f` (the HP cost is paid by the fighter). */
  sacrifice(f: Fighter, e: Extract<SkillEffect, { kind: 'sacrifice' }>): void;
  /** A summon can't be called: say why over the caster (no soul / nobody to hit). */
  summonBlocked(f: Fighter, reason: 'soul' | 'target'): void;
  /** Is there anyone a summon could reach right now? */
  hasSummonTarget(f: Fighter): boolean;
  /** Soul skill: holy fire on the `count` nearest enemies of `f`. */
  holyFireStrike(f: Fighter, count: number): void;
  /** Soul skill: roots under the `count × 3` nearest enemies of `f`. */
  treeStrike(f: Fighter, count: number): void;
  /** Is `f` inside one of its own team's watchtower auras? */
  inTowerAura(f: Fighter): boolean;
  /** Healing Circle: heal `f` and every living teammate. */
  healTeam(f: Fighter, amount: number): void;
  /** Spirit Circle / War Drum: apply `apply` to `f` and every living teammate. */
  forTeam(f: Fighter, apply: (t: Fighter) => void): void;
}

export class Fighter {
  readonly stats = createMatchStats();
  maxHp: number;
  readonly maxPe: number;
  hp: number;
  pe: number;
  facing = 0;
  state: FighterState = 'idle';
  /** Body radius (a Quest boss is bigger). */
  radius = BODY_RADIUS;
  /** Permanent damage multiplier (a Quest boss hits harder). */
  damageScale = 1;
  /** Quest boss: drawn bigger, with its own HP bar. */
  boss = false;
  /** Each fighter's own voice, a little higher or lower than the next. */
  private readonly voiceJitter = 0.9 + Math.random() * 0.2;
  /** Scream pitch: big fighters (and the boss) lower, nimble ones higher. */
  get voice() {
    if (this.boss) return 0.5;
    const byRole: Record<string, number> = { samurai: 0.75, ronin: 1, mystic: 1.1, shinobi: 1.25 };
    return (byRole[this.role.id] ?? 1) * this.voiceJitter;
  }
  /** Things (fighters, the princess wall) already hit by the current swing. */
  readonly swingHits = new Set<object>();
  /** Fighters on the same team can't hurt each other. In free-for-all everyone has their own team. */
  team: number;
  readonly cooldowns: number[];
  /** Items from treasure chests, oldest first. */
  readonly pocket: Item[] = [];
  /** Which pocket slot the use-item key fires. */
  selectedItem = 0;

  private stateT = 0;
  private stateDur = 0;
  private peDelay = 0;
  private kbx = 0;
  private kby = 0;
  private dashx = 0;
  private dashy = 0;
  private speedBuffT = 0;
  private speedMult = 1;
  private channelHealRate = 0;
  private powerT = 0;
  private powerMult = 1;
  private guardT = 0;
  private stealthT = 0;
  /** A summoning skill being called: what lands when the call finishes. */
  private summon: { kind: SummonKind; level: number } | null = null;
  /** 捨身 waiting for its charge to finish. */
  private pendingSacrifice: Extract<SkillEffect, { kind: 'sacrifice' }> | null = null;
  /** The summon being called right now, if any (for the scene's effects). */
  get summoning() { return this.state === 'casting' ? this.summon : null; }
  private substituteT = 0;
  /** Golden Bell: fraction of incoming damage / knockback that gets through. */
  private guardMult = 1;
  flashT = 0;
  /** Seconds left of the icy tint after being hit by an Ice Staff (just a look, no effect on play). */
  chillT = 0;
  peDeniedT = 0;
  /** A summon was refused for lack of soul: the HUD's soul diamonds flash while this runs down. */
  soulDeniedT = 0;
  /** Sealed inside a snare tree until that tree is destroyed. */
  trapped = false;
  /** Standing still, so PE is recovering at the boosted rate. */
  resting = false;
  /** Inside a friendly watchtower's aura (faster PE, less damage taken). */
  inAura = false;
  /** 魂: filled by damage dealt to enemy fighters, up to SOUL_LEVELS × SOUL_PER_LEVEL. */
  soul = 0;

  constructor(
    readonly index: number,
    readonly color: number,
    public weapon: Weapon,
    /** Equipped skills; null = empty slot. Players have 3, CPU enemies have 4. */
    readonly skills: (Skill | null)[],
    readonly role: Role,
    readonly controller: Controller,
    readonly body: Phaser.Physics.Arcade.Body,
    private arena: Arena,
  ) {
    this.team = index;
    this.cooldowns = skills.map(() => 0);
    this.maxHp = this.hp = role.maxHp;
    this.maxPe = this.pe = role.maxPe;
  }

  isEnemy(o: Fighter) { return o.team !== this.team; }

  /** Bring a fallen fighter back (full HP / PE unless given). */
  revive(x: number, y: number, hp = this.maxHp, pe = this.maxPe) {
    this.hp = hp;
    this.pe = pe;
    this.kbx = this.kby = 0;
    this.speedBuffT = 0;
    this.speedMult = 1;
    this.powerT = 0;
    this.powerMult = 1;
    this.guardT = 0;
    this.guardMult = 1;
    this.stealthT = 0;
    this.substituteT = 0;
    this.cooldowns.fill(0);
    this.body.enable = true;
    this.body.reset(x - this.radius, y - this.radius);
    this.setState('idle', 0);
  }

  /** A launch pad's fling: a big shove that carries you along and wears off. */
  launch(vx: number, vy: number) {
    this.kbx = vx;
    this.kby = vy;
  }

  /** Move instantly (portals), keeping everything else as it is. */
  warp(x: number, y: number) {
    this.body.reset(x - this.radius, y - this.radius);
    this.kbx = this.kby = 0;
  }

  get x() { return this.body.center.x; }
  get y() { return this.body.center.y; }
  get vx() { return this.body.velocity.x; }
  get vy() { return this.body.velocity.y; }
  get alive() { return this.state !== 'dead'; }
  /** Paralysed by Thunder: can't act, and can't be hurt either. */
  get paralyzed() { return this.state === 'paralyzed'; }
  /** Calling a soul skill. */
  get casting() { return this.state === 'casting'; }
  /** 捨身 being charged: the blast's radius and how far along the charge is (0→1). */
  get sacrificeCharge() { return this.state === 'charging' && this.pendingSacrifice ? { radius: this.pendingSacrifice.radius, t: this.stateProgress } : null; }
  /** Paralysed or casting: can't act, and nothing can hurt them. */
  /** Nothing can hurt you: only while calling a summon (a paralysed fighter can still be hurt, for less). */
  get untouchable() { return this.state === 'casting'; }
  get stateProgress() { return this.stateDur > 0 ? Math.min(1, this.stateT / this.stateDur) : 0; }
  get sprinting() { return this.speedBuffT > 0; }
  /** Fury: multiplier on weapon damage and knockback. */
  get damageMult() { return this.powerMult * this.damageScale * this.role.attack; }
  get powered() { return this.powerT > 0; }
  get guarded() { return this.guardT > 0; }
  /** Has the Thunder skill equipped (so the soul meter matters). */
  get usesSoul() { return this.skills.some((s) => isSummon(s?.effect.kind)); }
  /** Full soul levels available (0–4). */
  get soulLevel() { return Math.floor(this.soul / SOUL_PER_LEVEL); }

  addSoul(damage: number) {
    this.soul = Math.min(SOUL_LEVELS * SOUL_PER_LEVEL, this.soul + damage);
  }
  /** Vanish: nearly invisible, and CPU enemies ignore you. */
  get stealthed() { return this.stealthT > 0; }
  /** Standing in a fog bank (set by the scene each frame). */
  inFog = false;
  /** Hard to see: vanished, or lost in the fog. CPUs and towers ignore hidden fighters (unless right next to them). */
  get hidden() { return this.stealthed || this.inFog; }
  get substituting() { return this.substituteT > 0; }

  distTo(o: Fighter) { return Math.hypot(o.x - this.x, o.y - this.y); }

  canUseSkill(slot: number) {
    const skill = this.skills[slot];
    if (isSummon(skill?.effect.kind) && this.soulLevel === 0) return false;
    return !!skill && this.state === 'idle' && this.cooldowns[slot] <= 0 && this.pe >= skill.peCost;
  }

  update(dt: number, intent: Intent) {
    if (!this.alive) return;
    if (this.trapped) {
      this.body.velocity.x = 0;
      this.body.velocity.y = 0;
      return;
    }

    for (let i = 0; i < this.cooldowns.length; i++) this.cooldowns[i] = Math.max(0, this.cooldowns[i] - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.chillT = Math.max(0, this.chillT - dt);
    this.peDeniedT = Math.max(0, this.peDeniedT - dt);
    this.soulDeniedT = Math.max(0, this.soulDeniedT - dt);
    this.speedBuffT = Math.max(0, this.speedBuffT - dt);
    if (this.speedBuffT === 0) this.speedMult = 1;
    this.powerT = Math.max(0, this.powerT - dt);
    if (this.powerT === 0) this.powerMult = 1;
    this.guardT = Math.max(0, this.guardT - dt);
    if (this.guardT === 0) this.guardMult = 1;
    this.stealthT = Math.max(0, this.stealthT - dt);
    this.substituteT = Math.max(0, this.substituteT - dt);
    const mlen = Math.hypot(intent.mx, intent.my);

    // PE comes back fastest when you stand still to catch your breath, slowest on the move.
    this.peDelay -= dt;
    const idle = this.state === 'idle';
    this.resting = idle && mlen < 0.2;
    const regen = this.resting ? PE_REGEN_STILL : idle ? PE_REGEN_MOVING : 1;
    this.inAura = this.arena.inTowerAura(this);
    const aura = this.inAura ? TOWER_AURA_PE_REGEN : 1;
    if (this.peDelay <= 0) this.pe = Math.min(this.maxPe, this.pe + PE_REGEN_PER_SEC * regen * this.role.peRegen * aura * dt);

    const mx = mlen > 0 ? intent.mx / Math.max(1, mlen) : 0;
    const my = mlen > 0 ? intent.my / Math.max(1, mlen) : 0;

    // Switching the selected item works in any state.
    if (intent.nextItem && this.pocket.length > 0) {
      this.selectedItem = (this.selectedItem + 1) % this.pocket.length;
      sfx.menuMove();
    }

    this.stateT += dt;
    const w = this.weapon;

    switch (this.state) {
      case 'idle':
        if (Math.hypot(intent.ax, intent.ay) > 0.2) this.facing = Math.atan2(intent.ay, intent.ax);
        else if (mlen > 0.2) this.facing = Math.atan2(my, mx);
        if (intent.attack) this.tryAttack();
        else if (intent.useItemAt !== undefined) this.tryUseItem(intent.useItemAt, mx, my);
        else if (intent.useItem) this.tryUseItem(this.selectedItem, mx, my);
        else for (let i = 0; i < this.skills.length; i++) if (intent.skills[i]) { this.tryUseSkill(i, mx, my); break; }
        break;
      case 'windup':
        if (this.stateT >= w.windup) {
          this.setState('active', w.active);
          // 0 for the fastest weapon (daggers) up to 1 for the slowest (hammer).
          sfx.swing(Phaser.Math.Clamp((w.cycle - 0.32) / (1.1 - 0.32), 0, 1));
          this.swingHits.clear();
        }
        break;
      case 'active':
        this.arena.onSwingActive(this);
        if (this.stateT >= w.active) this.setState('recovery', Math.max(0.05, w.cycle - w.windup - w.active));
        break;
      case 'channel':
        this.heal(this.channelHealRate * dt);
        if (this.stateT >= this.stateDur) this.setState('idle', 0);
        break;
      case 'recovery':
      case 'stun':
      case 'dash':
      case 'casting':
        // The summon lands when the call finishes.
        if (this.stateT >= this.stateDur) {
          const s = this.summon;
          this.summon = null;
          this.setState('idle', 0);
          if (s?.kind === 'soulThunder') this.arena.thunderStrike(this, s.level);
          else if (s?.kind === 'soulFire') this.arena.holyFireStrike(this, s.level);
          else if (s?.kind === 'soulTree') this.arena.treeStrike(this, s.level);
          else if (s) this.arena.reaperStrike(this, s.level);
        }
        break;
      case 'paralyzed':
        if (this.stateT >= this.stateDur) this.setState('idle', 0);
        break;
      case 'charging':
        // 捨身 goes off when the charge is full; the blast first, so it lands even if the price is your life.
        if (this.stateT >= this.stateDur) {
          const e = this.pendingSacrifice;
          this.pendingSacrifice = null;
          this.setState('idle', 0);
          if (e) {
            this.arena.sacrifice(this, e);
            this.payHp(e.hpCost);
          }
        }
        break;
    }

    // Movement: committed attacks slow you down, channel/stun stop you.
    const moveFactor: Record<FighterState, number> = {
      idle: 1, windup: 0.35, active: 0.35, recovery: 0.6, stun: 0, channel: 0, dash: 0, paralyzed: 0, casting: 0, charging: 0, dead: 0,
    };
    const terrain = this.arena.terrainAt(this.x, this.y);
    const GROUND: Partial<Record<TerrainKind, number>> = { mud: MUD_SPEED, spring: SPRING.speed, sand: SAND_SPEED, shallows: SHALLOWS_SPEED, poison: POISON.speed, boost: BOOST_SPEED };
    const ground = (terrain && GROUND[terrain]) ?? 1;
    const speed = MOVE_SPEED * this.role.speed * this.speedMult * (this.stealthed ? STEALTH_SPEED : 1) * moveFactor[this.state] * ground * this.arena.hazardSlow(this);
    // Hot springs heal you slowly while you stand in them.
    if (terrain === 'spring') this.heal(SPRING.healPerSec * dt);
    // Poison bog saps HP, but never finishes anyone off.
    if (terrain === 'poison' && this.hp > 1) {
      const lost = Math.min(this.hp - 1, POISON.dps * dt);
      this.hp -= lost;
      this.stats.taken += lost;
    }
    let vx = mx * speed + this.kbx;
    let vy = my * speed + this.kby;
    if (this.state === 'dash') { vx = this.dashx; vy = this.dashy; }
    // Lunging weapons (忍刀) carry you forward through the strike.
    if (this.state === 'active' && w.lunge) {
      vx = Math.cos(this.facing) * w.lunge + this.kbx;
      vy = Math.sin(this.facing) * w.lunge + this.kby;
    }
    if (terrain === 'ice') {
      // On ice you can't stop or turn on the spot: velocity eases towards what you want.
      const k = 1 - Math.exp(-ICE_GRIP * dt);
      vx = this.body.velocity.x + (vx - this.body.velocity.x) * k;
      vy = this.body.velocity.y + (vy - this.body.velocity.y) * k;
    }
    // Wind carries you along (whatever you're doing).
    const wind = this.arena.windAt(this.x, this.y);
    if (wind) {
      vx += wind.x;
      vy += wind.y;
    }
    this.body.setVelocity(vx, vy);

    const decay = Math.exp(-7 * dt);
    this.kbx *= decay;
    this.kby *= decay;
  }

  private setState(s: FighterState, dur: number) {
    this.state = s;
    this.stateT = 0;
    this.stateDur = dur;
  }

  private spend(cost: number): boolean {
    if (this.pe < cost) {
      // Only beep once per press burst, not every frame a button is mashed.
      if (this.peDeniedT <= 0) sfx.denied();
      this.peDeniedT = 0.35;
      return false;
    }
    this.pe -= cost;
    this.peDelay = PE_REGEN_DELAY;
    return true;
  }

  private tryAttack() {
    if (!this.spend(this.weapon.peCost)) return;
    this.stealthT = 0; // attacking reveals you
    this.setState('windup', this.weapon.windup);
  }

  private deny() {
    if (this.peDeniedT <= 0) sfx.denied();
    this.peDeniedT = 0.35;
  }

  /** Revive effects need a fallen teammate (and, when splitting HP, HP to share); Thunder needs soul. */
  private canApply(e: ItemEffect) {
    if (isSummon(e.kind)) {
      // Summons need a full soul level and someone to hit; say which is missing.
      if (this.soulLevel === 0) {
        this.soulDeniedT = 0.6;
        this.arena.summonBlocked(this, 'soul');
        return false;
      }
      if (!this.arena.hasSummonTarget(this)) {
        this.arena.summonBlocked(this, 'target');
        return false;
      }
      return true;
    }
    if (e.kind !== 'revive') return true;
    return !!this.arena.findReviveTarget(this) && (e.fixedHp !== undefined || this.hp >= 2);
  }

  private tryUseSkill(slot: number, mx: number, my: number) {
    const skill = this.skills[slot];
    if (!skill || this.cooldowns[slot] > 0) return;
    if (!this.canApply(skill.effect)) return this.deny();
    // Shinobi pay less for movement skills.
    const mobility = ['speedBuff', 'dash', 'teleport', 'stealth'].includes(skill.effect.kind);
    if (!this.spend(skill.peCost * (mobility ? this.role.mobilityCost : 1))) return;
    this.cooldowns[slot] = skillCooldownFor(skill, this.role);
    this.stats.skills++;
    this.arena.onSkillCast?.(this, skill.effect, mx, my);
    this.applyEffect(skill.effect, mx, my);
  }

  private tryUseItem(index: number, mx: number, my: number) {
    const item = this.pocket[index];
    if (!item) return;
    if (!this.canApply(item.effect)) return this.deny();
    this.pocket.splice(index, 1);
    this.stats.items++;
    if (this.selectedItem >= this.pocket.length) this.selectedItem = Math.max(0, this.pocket.length - 1);
    this.applyEffect(item.effect, mx, my);
  }

  /**
   * A chest item goes in the pocket. With a full pocket it's used on the spot instead,
   * so it isn't wasted. Returns false in that case.
   */
  receiveItem(item: Item): boolean {
    if (this.pocket.length < POCKET_SIZE) {
      this.pocket.push(item);
      return true;
    }
    if (this.canApply(item.effect)) {
      this.stats.items++;
      this.applyEffect(item.effect, 0, 0);
    }
    return false;
  }

  /** Shared by skills and items: what actually happens. */
  private applyEffect(e: ItemEffect, mx: number, my: number) {
    switch (e.kind) {
      case 'channelHeal':
        sfx.heal();
        this.channelHealRate = e.heal / e.duration;
        this.setState('channel', e.duration);
        break;
      case 'instantHeal': {
        sfx.heal();
        const gained = this.heal(e.heal);
        this.arena.popText(this.x, this.y - 30, `+${Math.round(gained)}`, '#7dff8a');
        break;
      }
      case 'projectile':
        this.stealthT = 0;
        if (e.radius > 8) sfx.fireball();
        else sfx.arrow();
        this.arena.spawnProjectile(this, e);
        break;
      case 'speedBuff':
        sfx.sprint();
        this.speedMult = e.multiplier;
        this.speedBuffT = e.duration;
        break;
      case 'dash': {
        sfx.dash();
        const has = Math.hypot(mx, my) > 0.1;
        const dx = has ? mx : Math.cos(this.facing);
        const dy = has ? my : Math.sin(this.facing);
        const l = Math.hypot(dx, dy);
        this.dashx = (dx / l) * e.speed;
        this.dashy = (dy / l) * e.speed;
        this.setState('dash', e.duration);
        break;
      }
      case 'stealth':
        sfx.vanish();
        this.stealthT = e.duration;
        break;
      case 'substitute':
        sfx.vanish();
        this.substituteT = e.window;
        break;
      case 'teleport':
        sfx.vanish();
        this.kbx = this.kby = 0;
        this.arena.teleportSafe(this);
        break;
      case 'teamHeal':
        sfx.heal();
        this.arena.healTeam(this, e.heal);
        break;
      case 'teamPe':
        sfx.heal();
        this.arena.forTeam(this, (t) => t.restorePe(e.amount));
        break;
      case 'teamFury':
        sfx.powerUp();
        this.arena.forTeam(this, (t) => t.empower(e.multiplier, e.duration));
        break;
      case 'teamGuard':
        sfx.guard();
        this.arena.forTeam(this, (t) => t.ward(e.reduction, e.duration));
        break;
      case 'sacrifice':
        // Rooted while the charge builds; hits still hurt but don't stop it.
        this.stealthT = 0;
        this.pendingSacrifice = e;
        this.kbx = this.kby = 0;
        sfx.sacrificeCharge(e.charge);
        this.setState('charging', e.charge);
        break;
      case 'caltrops':
        sfx.caltrops();
        this.arena.dropCaltrops(this, e);
        break;
      case 'guard':
        sfx.guard();
        this.guardMult = 1 - e.reduction;
        this.guardT = e.duration;
        break;
      case 'powerUp':
        sfx.powerUp();
        this.powerMult = e.multiplier;
        this.powerT = e.duration;
        break;
      case 'soulThunder':
      case 'soulReaper':
      case 'soulFire':
      case 'soulTree': {
        // Spends every full soul level: one target per level.
        const level = this.soulLevel;
        this.soul -= level * SOUL_PER_LEVEL;
        this.stealthT = 0;
        // Calling it roots you (untouchable meanwhile); the strikes land when the call is done.
        this.summon = { kind: e.kind, level };
        this.kbx = this.kby = 0;
        this.setState('casting', SOUL_CAST_TIME);
        break;
      }
      case 'restorePe':
        sfx.heal();
        this.pe = Math.min(this.maxPe, this.pe + e.amount);
        this.arena.popText(this.x, this.y - 30, `+${e.amount}`, '#f2c94c');
        break;
      case 'revive': {
        // Lifeline splits my HP evenly with the teammate; a Revival Pill gives a fixed amount.
        let share = e.fixedHp ?? this.hp / 2;
        if (e.fixedHp === undefined) this.hp = share;
        const t = this.arena.findReviveTarget(this);
        if (!t) break;
        share = Math.min(share, t.maxHp);
        const spot = this.arena.reviveSpot(this);
        t.revive(spot.x, spot.y, share, t.maxPe / 2);
        this.stats.revives++;
        sfx.respawn();
        this.arena.popText(t.x, t.y - 30, `+${Math.round(share)}`, '#7dff8a');
        this.arena.onRevived(t, this);
        break;
      }
    }
  }

  /** Healing from a skill or item (boosted for roles that take more healing). Returns HP gained. */
  heal(amount: number): number {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount * this.role.healReceived);
    this.stats.recovered += this.hp - before;
    return this.hp - before;
  }

  /** PE from outside (Spirit Circle). */
  restorePe(amount: number) {
    const before = this.pe;
    this.pe = Math.min(this.maxPe, this.pe + amount);
    if (this.pe > before) this.arena.popText(this.x, this.y - 30, `+${Math.round(this.pe - before)}`, '#f2c94c');
  }

  /** Fury from outside (War Drum). Doesn't weaken a stronger Fury already running. */
  /** Damage reduction from outside (Ward Circle). Doesn't weaken a stronger guard already running. */
  ward(reduction: number, duration: number) {
    if (this.guardT > 0 && this.guardMult < 1 - reduction) return;
    this.guardMult = 1 - reduction;
    this.guardT = Math.max(this.guardT, duration);
  }

  empower(multiplier: number, duration: number) {
    if (this.powerT > 0 && this.powerMult > multiplier) return;
    this.powerMult = multiplier;
    this.powerT = Math.max(this.powerT, duration);
  }

  /** Share of incoming damage actually taken: guard, a tower's aura and paralysis all stack. */
  get damageTaken() {
    return this.guardMult * (this.inAura ? TOWER_AURA_DAMAGE_TAKEN : 1) * (this.paralyzed ? PARALYZED_DAMAGE_TAKEN : 1);
  }

  /**
   * The reaper's scythe. Damage reduction does not apply. Under 80 HP this kills;
   * at 80 or more the target is left with 20 HP. Substitution still takes the hit instead.
   * Returns false when the scythe does not land on this body.
   */
  sufferReaper(): boolean {
    if (!this.alive || this.untouchable) return false;
    if (this.substituteT > 0) {
      this.substituteT = 0;
      this.stealthT = 0;
      this.kbx = this.kby = 0;
      sfx.vanish();
      this.arena.onSubstitute(this, 0, 0);
      return false;
    }
    this.stealthT = 0;
    const before = this.hp;
    const kill = before < SOUL_REAPER.executeBelow;
    const next = kill ? 0 : SOUL_REAPER.leaveHp;
    this.stats.taken += before - next;
    this.hp = next;
    this.flashT = 0.12;
    sfx.hit(1);
    this.arena.popText(this.x, this.y - 30, `-${Math.round(before - next)}`, '#ffffff');
    if (kill) this.die();
    return true;
  }

  /** Small damage over time (caltrops): no knockback, no stun, doesn't interrupt anything. */
  takeChip(damage: number) {
    if (!this.alive || this.untouchable) return;
    this.stats.taken += Math.min(this.hp, damage * this.damageTaken);
    this.hp -= damage * this.damageTaken;
    this.flashT = Math.max(this.flashT, 0.05);
    if (this.hp <= 0) this.die();
  }

  /** Summon paralysis. Bosses cannot have one paralysis episode extended by repeated hits. */
  paralyze(seconds: number) {
    if (!this.alive) return;
    if (this.boss) {
      if (this.paralyzed) return;
      seconds = Math.min(seconds, QUEST.boss.maxParalysis);
    }
    this.kbx = this.kby = 0;
    this.body.setVelocity(0, 0);
    // A second paralysis only matters if it would last longer than what is left of the first.
    if (this.paralyzed && seconds <= this.stateDur - this.stateT) return;
    this.setState('paralyzed', seconds);
  }

  /** 捨身's price: HP paid straight out of your own pocket (no guard, log or aura can soften it). */
  private payHp(cost: number) {
    if (!this.alive) return;
    this.hp -= cost;
    this.flashT = 0.12;
    this.arena.popText(this.x, this.y - 30, `-${Math.round(cost)}`, '#ff8a8a');
    if (this.hp <= 0) this.die();
  }

  private die() {
    // A revival pill in the pocket saves its owner: it's used up and they carry on at once,
    // frozen but untouchable for a moment.
    const pill = this.pocket.findIndex((it) => it.effect.kind === 'revive');
    if (pill >= 0) {
      const fixed = (this.pocket[pill].effect as Extract<ItemEffect, { kind: 'revive' }>).fixedHp ?? 40;
      this.pocket.splice(pill, 1);
      this.stats.items++;
      if (this.selectedItem >= this.pocket.length) this.selectedItem = Math.max(0, this.pocket.length - 1);
      this.hp = Math.min(this.maxHp, fixed);
      this.stats.recovered += this.hp;
      this.pendingSacrifice = null;
      this.kbx = this.kby = 0;
      this.body.setVelocity(0, 0);
      this.setState('casting', 1);
      this.arena.onPillRevived(this);
      return;
    }
    this.hp = 0;
    this.stats.deaths++;
    this.pendingSacrifice = null;
    this.setState('dead', 0);
    sfx.death();
    sfx.scream(this.voice * (0.94 + Math.random() * 0.12));
    this.body.setVelocity(0, 0);
    this.body.enable = false;
  }

  takeHit(damage: number, dirx: number, diry: number, knockback: number, hitstun: number) {
    if (!this.alive || this.untouchable) return;
    if (this.substituteT > 0) {
      // A log takes the hit; we pop up a short way off.
      this.substituteT = 0;
      this.stealthT = 0;
      this.kbx = this.kby = 0;
      sfx.vanish();
      this.arena.onSubstitute(this, dirx, diry);
      return;
    }
    this.stealthT = 0;
    // Paralysed: frozen in place, hurt for less, and not even a hit makes you flinch.
    const frozen = this.paralyzed;
    damage *= this.damageTaken;
    this.stats.taken += Math.min(this.hp, damage);
    knockback *= this.guardMult;
    this.hp -= damage;
    sfx.hit(Phaser.Math.Clamp(damage / 25, 0, 1));
    this.flashT = 0.12;
    knockback *= this.role.knockbackTaken;
    if (!frozen) {
      this.kbx += dirx * knockback;
      this.kby += diry * knockback;
    }
    this.arena.popText(this.x, this.y - 30, `-${Math.round(damage)}`, '#ffffff');
    if (this.hp <= 0) {
      this.die();
      return;
    }
    if (frozen) return;
    // Charging 捨身 can't be interrupted.
    if (this.state === 'charging') return;
    // Poise: while swinging, hits weaker than a share of your own weapon's force (set by role) don't
    // interrupt you. Without this, fast weapons could stun-lock slow ones forever.
    const swinging = this.state === 'windup' || this.state === 'active';
    if (swinging && damage < this.weapon.damage * this.role.poise) return;
    // Otherwise a hit interrupts anything, including a heal channel.
    this.setState('stun', hitstun);
  }
}
