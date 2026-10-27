import { layoutPoint } from '@/maps/layout';
import type * as Phaser from 'phaser';
import { HARD_CPU_HP, MAX_PLAYERS, QUEST, HEIGHT, HUD_HEIGHT, RES, WIDTH } from '@/config';
import { createController } from '@/input/controllers';
import { Fighter, type Arena } from '@/gameplay/Fighter';
import { skillById } from '@/gameplay/skills';
import { WEAPONS } from '@/gameplay/weapons';
import { T } from '@/localization';
import { sfx } from '@/audio/sfx';
import { ARENA_MID_Y as SCREEN_MID_Y } from '@/maps';
import { ninjaTexture } from '@/rendering/fighterArt';
import { getSettings } from '@/state/gameSettings';
import { FONT, toHex } from '@/ui';
import { type NightCandle } from '@/battle/types';
import { S, toWorld, WORLD_CENTER } from '@/battle/coordinates';
import { NIGHT_BOSS_GEAR, nightBossRole } from '@/battle/quest/roster';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type QuestNightContext = Phaser.Scene & Arena & Pick<BattleScene,
  'map' |
  'add' | 'countdown' | 'dealDamage' | 'fighters' | 'flareCandle'
  | 'freeSpot' | 'fx' | 'isHell' | 'lSprites' | 'lTop'
  | 'nameTags' | 'nightCandles' | 'nightFlames' | 'nightLights' | 'nightShade'
  | 'over' | 'paused' | 'physics' | 'popText' | 'prevStates'
  | 'quest' | 'renderNightFlames' | 'roleForSlot' | 'sideColor' | 'slots'
  | 'spawns' | 'sprites' | 'stats' | 'tagTexts'
>;

/** The alley captain stands with the two enemies. The eight HUD seats stay the squad. */
export function spawnNightBoss(this: QuestNightContext, partySize: number): void {
  if (this.quest?.stage !== QUEST.nightStage) return;
  const index = MAX_PLAYERS;
  const team = this.isHell ? 0 : 1;
  const b = QUEST.night.captain;
  const role = nightBossRole(partySize);
  const r = b.radius;
  const screen = { x: this.isHell ? 220 : WIDTH - 220, y: SCREEN_MID_Y };
  const sp = this.freeSpot(toWorld(layoutPoint(this.map, screen)), this.fighters.map((f) => ({ x: f.x, y: f.y })), r + 4);
  this.spawns[index] = sp;
  const body = this.physics.add.body(sp.x - r, sp.y - r, r * 2, r * 2);
  body.setCircle(r);
  body.setCollideWorldBounds(true);
  const skills = NIGHT_BOSS_GEAR.skills.map((id) => skillById(id));
  const controller = createController(this, 'cpu', this.slots[0]?.binds ?? [], getSettings().difficulty)!;
  const color = this.sideColor(team);
  const f = new Fighter(index, color, WEAPONS[NIGHT_BOSS_GEAR.weapon], skills, this.roleForSlot(role, index), controller, body, this);
  const hard = getSettings().difficulty === 'hard' ? HARD_CPU_HP : 1;
  f.maxHp = f.hp = Math.round(role.maxHp * hard);
  f.team = team;
  f.boss = true;
  f.radius = r;
  f.damageScale = b.damage;
  this.stats[index] = f.stats;
  this.sprites[index] = this.add.image(sp.x, sp.y, ninjaTexture(this, color)).setScale(r / 18 / RES);
  this.lSprites.add(this.sprites[index]);
  this.prevStates[index] = f.state;
  f.facing = Math.atan2(WORLD_CENTER.y - sp.y, WORLD_CENTER.x - sp.x);
  this.fighters.push(f);
  this.tagTexts[index] = `${T().bossTag}・${T().nightBossName}`;
  const tagColor = toHex(this.sideColor(team));
  this.nameTags[index] = this.add
    .text(0, 0, this.tagTexts[index], { fontFamily: FONT, resolution: RES, fontSize: '16px', fontStyle: 'bold', color: tagColor, stroke: '#000000', strokeThickness: 3 })
    .setOrigin(0.5, 1);
  this.lTop.add(this.nameTags[index]);
}

/** Darken the alley, then cut a light around every burning candle and living fighter. */
export function renderNight(this: QuestNightContext, now: number): void {
  const shade = this.nightShade;
  const lights = this.nightLights;
  if (!shade || !lights || this.quest?.stage !== QUEST.nightStage) return;
  shade.clear();
  shade.fill(0x02030a, QUEST.night.veil, 0, HUD_HEIGHT, WIDTH, HEIGHT - HUD_HEIGHT);
  lights.clear();
  lights.fillStyle(0xffffff, 1);
  const add = (x: number, y: number, r: number) => {
    lights.fillCircle(x, y, r);
    lights.fillStyle(0xffffff, 0.35);
    lights.fillCircle(x, y, r * 1.45);
    lights.fillStyle(0xffffff, 1);
  };
  for (const candle of this.nightCandles) if (candle.lit) add(candle.x / S, candle.y / S + HUD_HEIGHT, QUEST.night.lantern);
  for (const f of this.fighters) if (f.alive && !f.trapped) add(f.x / S, f.y / S + HUD_HEIGHT, QUEST.night.light);
  shade.erase(lights);
  this.renderNightFlames(now);
}

/** A lit candle warns, then scorches heroes inside its light. A dark one climbs back onto the wick. */
export function updateNight(this: QuestNightContext, dt: number): void {
  if (this.countdown > 0 || this.paused || this.over) return;
  for (const candle of this.nightCandles) {
    if (!candle.lit) {
      candle.timer -= dt;
      if (candle.timer > 0) continue;
      candle.lit = true;
      candle.timer = QUEST.night.flareEvery;
      candle.warn = null;
      this.popText(candle.x, candle.y - 36, T().nightRelight, '#ffb45a');
      continue;
    }
    if (candle.warn !== null) {
      candle.warn += dt;
      if (candle.warn < QUEST.night.flareWarn) continue;
      this.flareCandle(candle);
      continue;
    }
    candle.timer -= dt;
    if (candle.timer <= 0) candle.warn = 0;
  }
}

export function flareCandle(this: QuestNightContext, candle: NightCandle): void {
  candle.warn = null;
  candle.timer = QUEST.night.flareEvery;
  const radius = QUEST.night.lantern * S;
  let struck = false;
  for (const f of this.fighters) {
    if (!f.alive || f.trapped || f.team !== 0) continue;
    const dx = f.x - candle.x;
    const dy = f.y - candle.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist > radius + f.radius) continue;
    this.dealDamage(undefined, f, QUEST.night.flareDamage, dx / dist, dy / dist, 90, 0.2, false);
    struck = true;
  }
  this.fx.holyFlame(candle.x, candle.y);
  if (struck) this.popText(candle.x, candle.y - 36, T().nightFlare, '#ffb45a');
  sfx.holyFire();
}

export function snuffCandle(this: QuestNightContext, candle: NightCandle): void {
  candle.lit = false;
  candle.warn = null;
  candle.timer = QUEST.night.relight;
  this.fx.smoke(candle.x, candle.y, 10, 1);
  this.popText(candle.x, candle.y - 36, T().nightSnuff, '#f3d7a1');
  sfx.vanish();
}

export function renderNightFlames(this: QuestNightContext, now: number): void {
  const g = this.nightFlames;
  if (!g) return;
  g.clear();
  const radius = QUEST.night.lantern * S;
  for (const candle of this.nightCandles) {
    const bob = Math.sin(now * 6 + candle.x) * 3;
    g.fillStyle(0x3a2a22, 1).fillRect(candle.x - 4, candle.y - 18, 8, 28);
    if (!candle.lit) {
      const back = 1 - Math.max(0, candle.timer) / QUEST.night.relight;
      g.fillStyle(0x6a5a48, 0.9).fillCircle(candle.x, candle.y - 20, 3);
      g.lineStyle(2, 0xf3d7a1, 0.55);
      g.beginPath();
      g.arc(candle.x, candle.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * back, false);
      g.strokePath();
      continue;
    }
    const h = 18 + bob;
    g.fillStyle(0xffb45a, 0.95).fillTriangle(candle.x - 8, candle.y - 16, candle.x + 8, candle.y - 16, candle.x, candle.y - 16 - h);
    g.fillStyle(0xfff1c9, 1).fillCircle(candle.x, candle.y - 18 - h * 0.4, 4);
    if (candle.warn === null) continue;
    const progress = Math.min(1, candle.warn / QUEST.night.flareWarn);
    g.lineStyle(3, 0xffb45a, 0.45 + progress * 0.5).strokeCircle(candle.x, candle.y, radius);
    g.fillStyle(0xff8a3a, 0.06 + progress * 0.14).fillCircle(candle.x, candle.y, radius * progress);
  }
}
