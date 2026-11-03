import { playMusic } from '@/audio/music';
import { sfx } from '@/audio/sfx';
import * as Phaser from 'phaser';
import { EXPEDITION as E } from '@/config/expedition';
import { HARD_CPU_HP, QUEST } from '@/config';
import { emptyIntent, type Intent } from '@/input/contracts';
import { WEAPONS } from '@/gameplay/weapons';
import { skillById } from '@/gameplay/skills';
import type { Fighter } from '@/gameplay/Fighter';
import type { SlotConfig } from '@/state/gameSettings';
import { getSettings } from '@/state/gameSettings';
import { T } from '@/localization';
import { S, toWorld, toWorldRect, toDesign } from '@/battle/coordinates';
import { forestRouter } from '@/battle/expedition/navigation';
import { expeditionCheckpoint, gateIsOpen, type CampId } from '@/battle/expedition/rules';
import { TOWER_ARROW } from '@/battle/objectives/towerConfig';
import { C, txt, addButton } from '@/ui';
import type { BattleScene } from '@/scenes/BattleScene';

type Context = Phaser.Scene & Pick<BattleScene,
  'bossReserves' | 'countdown' | 'dealDamage' | 'expedition' | 'expeditionView' | 'fighters' | 'freeSpot' | 'fx' | 'lobbySlots' | 'logs' | 'map' | 'nameTags' | 'obstacleRects' | 'onRevived' | 'openModal' | 'openResults' | 'over' | 'paused' | 'prevStates' | 'refreshHudLoadout' | 'reviveSpot' | 'shotBlockers' | 'showBanner' | 'showEndBanner' | 'tagTexts' | 'towers' | 'winningTeam' | 'world'
>;

/** Four reusable enemy seats bound encounter memory and preserve the existing combat contracts. */
export function expeditionSlots(slots: SlotConfig[]): SlotConfig[] {
  const template = slots[0];
  return [...slots.slice(0, E.partySlots).map((s) => ({ ...s, team: 0 })),
    ...Array.from({ length: 4 }, (_, i): SlotConfig => ({ ...template, control: 'cpu', team: 1, role: i === 1 ? 'mystic' : 'ronin', weapon: i === 1 ? 0 : 2, skills: [] }))];
}

export function expeditionStart(this: Context, index: number) {
  const state = this.expedition!;
  const base = state.checkpoint === 'fortress' ? E.checkpoint : E.start;
  return this.freeSpot(toWorld({ x: base.x + (index % 2 ? 35 : -35), y: base.y + (index < 2 ? -30 : 30) }), []);
}

export function setupExpedition(this: Context) {
  if (!this.expedition) return;
  const e = this.expedition, view = this.expeditionView!;
  for (const f of this.fighters.filter((f) => f.team === 1)) {
    f.state = 'dead'; f.hp = 0; f.body.enable = false; this.prevStates[f.index] = 'dead'; this.bossReserves.add(f);
  }
  if (!gateIsOpen(e)) view.gate = addBarrier.call(this, E.gate);
  const route = forestRouter(E.width, E.height, [...this.map.obstacles, ...(view.gate ? [E.gate] : [])]);
  this.world.route = (fx, fy, tx, ty) => {
    const a = toDesign(fx, fy), b = toDesign(tx, ty), wp = route(a.x, a.y, b.x, b.y);
    return wp && toWorld(wp);
  };
  this.world.lootChests = false; this.world.defendTeam = 0;
}

export function addBarrier(this: Context, rect: { x: number; y: number; w: number; h: number }, world = false) {
  const o = world ? rect : toWorldRect(rect);
  const body = this.physics.add.staticBody(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
  const collider = this.physics.add.collider(this.fighters.map((f) => f.body), body);
  const shape = new Phaser.Geom.Rectangle(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
  this.obstacleRects.push(shape); this.shotBlockers.push(shape);
  return { body, collider, rect: shape, life: Infinity };
}

export function removeBarrier(this: Context, barrier: ReturnType<typeof addBarrier>) {
  barrier.collider.destroy(); barrier.body.destroy();
  this.obstacleRects = this.obstacleRects.filter((o) => o !== barrier.rect);
  this.shotBlockers = this.shotBlockers.filter((o) => o !== barrier.rect);
}

function campName(id: CampId) {
  return id === 'village' ? T().expeditionMelee : id === 'river' ? T().expeditionRanged : id === 'rescue' ? T().expeditionRescue : id === 'fortress' ? T().expeditionCommander : T().expeditionPatrol;
}

export function activateCamp(this: Context, id: CampId) {
  const e = this.expedition!;
  if (e.active || e.cleared.includes(id) || id === 'fortress' && !gateIsOpen(e)) return;
  const camp = E.camps.find((c) => c.id === id)!;
  e.active = id;
  const party = this.fighters.filter((f) => f.team === 0).length;
  const count = Math.min(4, camp.guards + (party >= 3 ? 1 : 0));
  const enemies = this.fighters.filter((f) => f.team === 1);
  enemies.forEach((f, i) => {
    if (i >= count) return;
    const captain = i === 0 && (id === 'village' || id === 'river' || id === 'fortress');
    f.boss = captain;
    f.damageScale = id === 'fortress' ? 1.1 : 0.85;
    f.maxHp = Math.round((captain ? id === 'fortress' ? 350 + party * 100 : 160 + party * 45 : f.role.maxHp * 0.85)
      * (getSettings().difficulty === 'hard' ? HARD_CPU_HP : 1));
    f.weapon = WEAPONS.find((w) => w.id === (id === 'river' ? 'shuriken' : captain ? 'hammer' : i % 2 ? 'daggers' : 'fan'))!;
    const skills = id === 'fortress' ? ['second-wind', 'fury'] : captain ? ['arrow', 'sprint'] : ['arrow'];
    f.skills.splice(0, f.skills.length, ...skills.map(skillById));
    f.cooldowns.splice(0, f.cooldowns.length, ...skills.map(() => 2));
    const spot = this.freeSpot(toWorld({ x: camp.x + (i ? (i % 2 ? -95 : 95) : 0), y: camp.y + (i > 1 ? 70 : 0) }), []);
    f.revive(spot.x, spot.y); this.bossReserves.delete(f); this.logs.delete(f);
    this.tagTexts[f.index] = i === 0 ? campName(id) : T().enemyTag;
    this.nameTags[f.index]?.setText(this.tagTexts[f.index]);
    this.refreshHudLoadout(f);
  });
  this.showBanner(campName(id), 0xe4d0a4);
}

/** Allies stay near their human party; distant camps cannot be pulled by an autonomous CPU. */
export function expeditionIntent(this: Context, f: Fighter, dt: number): Intent {
  const heroes = this.fighters.filter((o) => o.team === 0 && o.alive);
  const humans = heroes.filter((o) => !o.controller.cpu), leaders = humans.length ? humans : heroes;
  if (f.controller.cpu && f.team === 0) {
    const go = (target: { x: number; y: number }): Intent => {
      const wp = this.world.route?.(f.x, f.y, target.x, target.y) ?? target;
      const dx = wp.x - f.x, dy = wp.y - f.y, d = Math.hypot(dx, dy) || 1;
      return { ...emptyIntent(), mx: dx / d, my: dy / d };
    };
    const fallen = this.fighters.find((o) => o.team === 0 && !o.alive);
    const safe = !this.fighters.some((o) => o.team === 1 && o.alive && f.distTo(o) < 450);
    if (fallen && safe) return f.distTo(fallen) < 55 ? emptyIntent() : go(fallen);
    // A CPU-only party can demonstrate the whole stage instead of waiting forever at the camp.
    if (!humans.length && !this.expedition!.active) {
      const state = this.expedition!;
      if (gateIsOpen(state) && state.checkpoint !== 'fortress') return go(toWorld(E.checkpoint));
      const center = heroes.reduce((p, o) => ({ x: p.x + o.x / heroes.length, y: p.y + o.y / heroes.length }), { x: 0, y: 0 });
      const camps = E.camps.filter((c) => !state.cleared.includes(c.id) && (c.id !== 'fortress' || gateIsOpen(state)));
      const next = camps.sort((a, b) => Math.hypot(toWorld(a).x - center.x, toWorld(a).y - center.y) - Math.hypot(toWorld(b).x - center.x, toWorld(b).y - center.y))[0];
      if (next) return go(toWorld(next));
    }
    const lead = leaders.reduce((a, b) => f.distTo(a) < f.distTo(b) ? a : b, leaders[0]);
    const near = this.fighters.some((o) => o.team === 1 && o.alive && f.distTo(o) < 480);
    if (lead && (f.distTo(lead) > 300 || !near && f.distTo(lead) > 100)) {
      const wp = this.world.route?.(f.x, f.y, lead.x, lead.y) ?? lead, dx = wp.x - f.x, dy = wp.y - f.y, d = Math.hypot(dx, dy) || 1;
      return { ...emptyIntent(), mx: dx / d, my: dy / d };
    }
  }
  const intent = f.controller.read(f, this.world, dt);
  if (f.team === 0 && !f.controller.cpu && humans.length > 1) {
    for (const other of humans) {
      if (other === f) continue;
      if (Math.abs(f.x - other.x) > 1120 && (f.x - other.x) * intent.mx > 0) intent.mx = 0;
      if (Math.abs(f.y - other.y) > 520 && (f.y - other.y) * intent.my > 0) intent.my = 0;
    }
  }
  return intent;
}

export function updateExpedition(this: Context, dt: number) {
  const e = this.expedition, view = this.expeditionView;
  if (!e || !view || this.paused || this.over || this.countdown > 0) return;
  const heroes = this.fighters.filter((f) => f.team === 0), alive = heroes.filter((f) => f.alive);
  if (!alive.length) { finishExpedition.call(this, false); return; }
  // Automatic close-range rescue uses no extra button, so all four skill bindings stay available.
  for (const fallen of heroes.filter((f) => !f.alive)) {
    const helper = alive.find((f) => Math.hypot(f.x - fallen.x, f.y - fallen.y) < E.reviveDistance
      && !this.fighters.some((enemy) => enemy.team === 1 && enemy.alive && enemy.distTo(f) < 140));
    const progress = helper ? (e.revive.get(fallen.index) ?? 0) + dt : 0; e.revive.set(fallen.index, progress);
    if (progress >= E.reviveSeconds && helper) {
      const spot = this.reviveSpot(helper); fallen.revive(spot.x, spot.y, fallen.maxHp * 0.4, fallen.maxPe * 0.5);
      helper.stats.revives++; this.onRevived(fallen, helper); e.revive.delete(fallen.index);
    }
  }
  if (e.active && !this.fighters.some((f) => f.team === 1 && f.alive)) {
    const id = e.active; e.cleared.push(id); e.active = null;
    if (id === 'fortress') { finishExpedition.call(this, true); return; }
    if (id === 'rescue') this.showBanner(T().expeditionHealerSaved, 0x9be0be);
    if (gateIsOpen(e) && view.gate) {
      removeBarrier.call(this, view.gate); view.gate = null;
      const route = forestRouter(E.width, E.height, this.map.obstacles);
      this.world.route = (fx, fy, tx, ty) => { const a = toDesign(fx, fy), b = toDesign(tx, ty), p = route(a.x, a.y, b.x, b.y); return p && toWorld(p); };
      this.showBanner(T().expeditionGateOpened, 0xebd592);
    }
  }
  const leaders = alive.filter((f) => !f.controller.cpu), triggers = leaders.length ? leaders : alive;
  if (!e.active) {
    const camp = E.camps.filter((c) => !e.cleared.includes(c.id) && (c.id !== 'fortress' || gateIsOpen(e)))
      .find((c) => triggers.some((f) => { const p = toWorld(c); return Math.hypot(f.x - p.x, f.y - p.y) < E.activation * S; }));
    if (camp) activateCamp.call(this, camp.id);
  }
  if (gateIsOpen(e) && e.checkpoint !== 'fortress' && triggers.some((f) => {
    const p = toWorld(E.checkpoint); return Math.hypot(f.x - p.x, f.y - p.y) < 145;
  })) { e.checkpoint = 'fortress'; this.showBanner(T().expeditionCheckpoint, 0x9be0be); }
  const healing = toWorld(E.healing);
  if (e.cleared.includes('rescue') && !e.healingUsed && !e.active && alive.some((f) => Math.hypot(f.x - healing.x, f.y - healing.y) < 100)) {
    e.healingUsed = true;
    heroes.forEach((f) => { if (f.alive) f.heal(f.maxHp); else { const spot = this.freeSpot(healing, []); f.revive(spot.x, spot.y); } });
    this.fx.sparks(healing.x, healing.y, 0x9be0be, 20);
  }
  if (e.active === 'fortress') updateCommander.call(this, dt);
  for (const thorn of [...view.thorns]) {
    thorn.life -= dt;
    if (thorn.life <= 0) { removeBarrier.call(this, thorn); view.thorns.splice(view.thorns.indexOf(thorn), 1); }
  }
}

function updateCommander(this: Context, dt: number) {
  const e = this.expedition!, view = this.expeditionView!;
  const boss = this.fighters.find((f) => f.index === 4);
  if (!boss?.alive) return;
  const heroes = this.fighters.filter((f) => f.team === 0 && f.alive);
  const target = heroes.reduce((a, b) => boss.distTo(a) < boss.distTo(b) ? a : b);
  e.chargeT -= dt; e.thornT -= dt;
  if (!e.charge && e.chargeT <= 0) {
    const d = boss.distTo(target) || 1;
    e.charge = { x: (target.x - boss.x) / d, y: (target.y - boss.y) / d, warn: E.boss.chargeWarn, left: E.boss.chargeDuration, hits: new Set() };
    e.chargeT = E.boss.chargeEvery;
  }
  if (e.charge) {
    const charge = e.charge;
    charge.warn -= dt;
    if (charge.warn > 0) boss.body.setVelocity(0, 0);
    else {
      charge.left -= dt; boss.body.setVelocity(charge.x * E.boss.chargeSpeed, charge.y * E.boss.chargeSpeed);
      const x = boss.x + charge.x * (boss.radius + 14), y = boss.y + charge.y * (boss.radius + 14);
      const crashed = this.obstacleRects.some((o) => x > o.x && x < o.right && y > o.y && y < o.bottom);
      if (crashed) { boss.body.setVelocity(0, 0); boss.paralyze(1); this.fx.sparks(boss.x, boss.y, 0xebd592, 18); }
      for (const f of heroes) if (!charge.hits.has(f.index) && boss.distTo(f) < boss.radius + f.radius + 15) {
        charge.hits.add(f.index); this.dealDamage(boss, f, E.boss.chargeDamage, charge.x, charge.y, 230, 0.25);
      }
      if (crashed || charge.left <= 0) { e.charge = null; boss.body.setVelocity(0, 0); }
    }
  }
  if (e.thornT <= 0) {
    e.thornT = E.boss.thornsEvery;
    // Leave wide passages at both ends; never materialize a wall on a fighter.
    const y = Math.max(290 * S, Math.min(560 * S, target.y + 100));
    const specs = [toWorld({ x: 1460, y: 0 }).x, toWorld({ x: 2140, y: 0 }).x].map((x) => ({ x, y, w: 210, h: 24 }));
    for (const spec of specs) if (!this.fighters.some((f) => f.alive && Math.abs(f.x - spec.x) < spec.w / 2 + 40 && Math.abs(f.y - spec.y) < 60)) {
      const thorn = addBarrier.call(this, spec, true); thorn.life = E.boss.thornsDuration; view.thorns.push(thorn);
    }
  }
  if (boss.hp <= boss.maxHp * 0.5) {
    if (!e.rallied) { e.rallied = true; placeRallyBanner.call(this); this.showBanner(T().expeditionRally, 0xe4bc8e); e.rallyT = 0; }
    e.rallyT -= dt;
    if (view.rally?.alive && e.rallyT <= 0) {
      e.rallyT = E.boss.rallyEvery;
      const reserves = this.fighters.filter((f) => f.team === 1 && f !== boss && !f.alive).slice(0, 2);
      reserves.forEach((f, i) => { f.boss = false; f.maxHp = f.role.maxHp * 0.7; f.damageScale = 0.7;
        const p = this.freeSpot(toWorld({ x: i ? 2200 : 1400, y: 610 }), []); f.revive(p.x, p.y);
        this.bossReserves.delete(f); this.logs.delete(f); this.tagTexts[f.index] = T().enemyTag; });
    }
  }
}

function placeRallyBanner(this: Context) {
  const p = toWorld({ x: 1800, y: 235 }), w = 42, h = 58;
  const body = this.physics.add.staticBody(p.x - w / 2, p.y - h / 2, w, h);
  const collider = this.physics.add.collider(this.fighters.map((f) => f.body), body);
  const rect = new Phaser.Geom.Rectangle(p.x - w / 2, p.y - h / 2, w, h);
  this.obstacleRects.push(rect);
  const banner = { ...p, w, h, hp: 100, maxHp: 100, team: 1, main: false, tree: true, expeditionBanner: true,
    alive: true, range: 0, fireInterval: Infinity, aura: 0, arrow: TOWER_ARROW, reload: Infinity, shakeT: 0, body, collider, rect };
  this.towers.push(banner); this.expeditionView!.rally = banner;
}

export function finishExpedition(this: Context, won: boolean) {
  if (this.over) return;
  this.over = true; this.winningTeam = won ? 0 : 1;
  if (won) sfx.win();
  playMusic(won ? 'victory' : 'defeat');
  const checkpoint = expeditionCheckpoint(this.expedition!);
  if (won) {
    this.showEndBanner(T().expeditionClear, '#a5e0be', () => this.openResults(T().expeditionClear, '#a5e0be'));
    return;
  }
  this.showEndBanner(T().expeditionFailed, '#ed9e90', () => this.openModal({
    w: 620, h: 390, title: T().expeditionFailed, closable: false,
    build: (m) => {
      m.content.add(txt(this, 640, m.y + 95, T().expeditionRevive, 17, C.dim, { origin: 0.5, wrap: 520, align: 'center' }));
      const items = [
        { label: T().expeditionRetry, run: () => this.scene.start('Loading', { mode: 'expedition', slots: this.lobbySlots, expedition: checkpoint }) },
        { label: T().expeditionEdit, run: () => this.scene.start('Lobby', { retryExpedition: checkpoint, slots: this.lobbySlots }) },
        { label: T().toTitle, run: () => this.scene.start('Title') },
      ];
      items.forEach((item, i) => addButton(this, m.content, m.nav, { id: `exp-${i}`, x: 640, y: m.y + 155 + i * 66, w: 440, h: 46, label: item.label, primary: i === 0, onPress: item.run }));
    },
  }));
}
