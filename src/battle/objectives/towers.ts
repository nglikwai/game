import { drawTowerDetails, renderTowerModel } from '@/rendering/towerArt';
import { renderCursedTree } from '@/rendering/mapProps';
import * as Phaser from 'phaser';
import { MAIN_TOWER_HEAL, RESPAWN_TOWER_COST, TOWER_RESPAWN_HP, TOWER_RESPAWN_SOUL_KEEP, TEAM_RESPAWN, QUEST } from '@/config';
import { Fighter } from '@/gameplay/Fighter';
import { T } from '@/localization';
import { sfx } from '@/audio/sfx';
import { sideOf, towerSpots } from '@/maps';
import { type Tower } from '@/battle/types';
import { S, toWorld, WORLD_CENTER } from '@/battle/coordinates';
import { TOWER_STATS } from '@/battle/objectives/towerConfig';
import type { BattleScene } from '@/scenes/BattleScene';

/** The state and operations this system needs from the scene. No runtime scene dependency. */
type ObjectivesTowersContext = Phaser.Scene & Pick<BattleScene,
  'lFloor' | 'damageTower' | 'deathTime' | 'destroyTower' | 'elapsed' | 'fighters'
  | 'freeSpot' | 'fx' | 'groveCast' | 'grovePhase' | 'obstacleRects'
  | 'mode' | 'over' | 'physics' | 'popText' | 'projectiles' | 'quest'
  | 'questTree' | 'questTreeCast' | 'releaseSnarePrisoner' | 'renderSnareTree' | 'renderTreeTower'
  | 'renderDragonHead' | 'renderWyvern' | 'rescueTreeSealed' | 'respawnTimers' | 'showBanner' | 'sideColor' | 'stats'
  | 'teamRespawnT' | 'towerHeals' | 'towers' | 'walls'
>;

// ---------- watchtowers ----------

/** Two towers per team on its own half (sides follow `flip`), nudged clear of map obstacles. */
export function placeTowers(this: ObjectivesTowersContext, flip: boolean): void {
  const bodies = this.fighters.map((f) => f.body);
  for (const team of [0, 1]) {
    for (const spot of towerSpots(sideOf(team, flip))) {
      const st = TOWER_STATS[spot.kind];
      const size = st.size;
      const p = this.freeSpot(toWorld(spot), [], size / 2 + 10);
      const body = this.physics.add.staticBody(p.x - size / 2, p.y - size / 2, size, size);
      const collider = this.physics.add.collider(bodies, body);
      const rect = new Phaser.Geom.Rectangle(p.x - size / 2, p.y - size / 2, size, size);
      this.obstacleRects.push(rect);
      const members = this.fighters.filter((f) => f.team === team).length;
      const hp = (st.hp * Math.max(2, members)) / 2;
      this.towers.push({
        team, main: spot.kind === 'main', x: p.x, y: p.y, w: size, h: size, hp, maxHp: hp, alive: true, shakeT: 0, body, collider, rect,
        range: st.range, fireInterval: st.fireInterval, reload: st.fireInterval, aura: st.aura, arrow: st.arrow,
      });
    }
  }
}

/** Main towers slowly transfer their own HP to wounded teammates inside their aura. */
export function updateTowerHealing(this: ObjectivesTowersContext, dt: number): void {
  this.towerHeals = [];
  for (const tw of this.towers) {
    if (!tw.alive || !tw.main) continue;
    for (const f of this.fighters) {
      if (!f.alive || f.team !== tw.team || f.hp >= f.maxHp || Math.hypot(f.x - tw.x, f.y - tw.y) >= tw.aura) continue;
      const spare = tw.hp - tw.maxHp * MAIN_TOWER_HEAL.floor;
      const give = Math.min(MAIN_TOWER_HEAL.perSec * dt, f.maxHp - f.hp, spare);
      if (give <= 0) continue;
      f.hp += give;
      f.stats.recovered += give;
      tw.hp -= give;
      this.towerHeals.push({ tower: tw, f });
    }
  }
}

export function inTowerAura(this: ObjectivesTowersContext, f: Fighter): boolean {
  return this.towers.some((tw) => tw.alive && tw.team === f.team && Math.hypot(f.x - tw.x, f.y - tw.y) < tw.aura);
}

/** Towers shoot the nearest visible enemy in range. */
export function updateTowers(this: ObjectivesTowersContext, dt: number): void {
  for (const tw of this.towers) {
    if (!tw.alive || tw.tree || tw.dragon || tw.wyvern) continue;
    tw.reload -= dt;
    if (tw.reload > 0) continue;
    const targets = this.fighters.filter((f) => f.alive && f.team !== tw.team && !f.hidden && !f.untouchable && Math.hypot(f.x - tw.x, f.y - tw.y) < tw.range);
    if (targets.length === 0) continue;
    const t = targets.reduce((a, b) => (Math.hypot(a.x - tw.x, a.y - tw.y) < Math.hypot(b.x - tw.x, b.y - tw.y) ? a : b));
    tw.reload = tw.fireInterval;
    const a = Math.atan2(t.y - tw.y, t.x - tw.x);
    const start = tw.w / 2 + 10;
    this.projectiles.push({
      team: tw.team, effect: tw.arrow, dead: false, traveled: 0, radius: tw.arrow.radius, ignoreObstacles: true,
      x: tw.x + Math.cos(a) * start, y: tw.y + Math.sin(a) * start,
      vx: Math.cos(a) * tw.arrow.speed, vy: Math.sin(a) * tw.arrow.speed,
    });
    sfx.arrow();
  }
}

export function damageTower(this: ObjectivesTowersContext, tw: Tower, dmg: number, by: Fighter | undefined): void {
  if (!tw.alive || this.over) return;
  if (by && tw === this.questTree && this.rescueTreeSealed()) {
    this.popText(tw.x, tw.y - tw.h / 2 - 16, T().rescueSealed, '#d4a9ef');
    return;
  }
  // The prison guards never harm the tree. Only the rescue party can.
  if (by && tw.tree && !tw.grove && by.team === tw.team) return;
  const real = Math.min(tw.hp, dmg);
  tw.hp -= real;
  tw.shakeT = 0.12;
  if (by) this.stats[by.index].wall += real;
  sfx.wallHit();
  this.fx.hitSpark(tw.x + Phaser.Math.Between(-14, 14), tw.y + Phaser.Math.Between(-14, 14), 0xd8d0c0);
  this.popText(tw.x + Phaser.Math.Between(-16, 16), tw.y - tw.h / 2 - 10, `-${Math.round(real)}`, '#f2c94c');
  if (tw.hp <= 0) this.destroyTower(tw);
}

export function destroyTower(this: ObjectivesTowersContext, tw: Tower): void {
  tw.alive = false;
  if (tw.snare) this.releaseSnarePrisoner(tw);
  if (tw.tree) this.questTreeCast = null;
  if (tw.grove === 'summon') this.groveCast = null;
  tw.collider.destroy();
  tw.body.destroy();
  this.obstacleRects.splice(this.obstacleRects.indexOf(tw.rect), 1);
  sfx.wallBreak();
  this.fx.smoke(tw.x, tw.y, 24, 1.4);
  this.fx.hammerSmash(tw.x, tw.y, 50);
  this.showBanner(tw.expeditionBanner ? T().expeditionRallyStopped : tw.dragon ? T().dragonHeadDown(T().dragonHeads[tw.dragon]) : tw.wyvern ? T().wyvernDown(T().wyvernNames[tw.wyvern]) : tw.grove ? T().groveTreeDown(tw.grove) : tw.tree ? T().questTreeDestroyed : (tw.main ? T().mainTowerDown : T().towerDown)(T().teamNames[tw.team]), this.sideColor(tw.team));
  // The attackers get a short War Drum.
  for (const f of this.fighters) if (f.alive && f.team !== tw.team) f.empower(1.3, 5);
}

export function renderTower(this: ObjectivesTowersContext, g: Phaser.GameObjects.Graphics, over: Phaser.GameObjects.Graphics, tw: Tower, now: number): void {
  if (tw.expeditionBanner) {
    if (tw.alive) { over.fillStyle(0x1c242a, 1).fillRect(tw.x - 26, tw.y - 65, 52, 5); over.fillStyle(0xd5b170, 1).fillRect(tw.x - 26, tw.y - 65, 52 * tw.hp / tw.maxHp, 5); }
    return;
  }
  if (tw.dragon) {
    this.renderDragonHead(g, over, tw, now);
    return;
  }
  if (tw.wyvern) {
    this.renderWyvern(g, over, tw, now);
    return;
  }
  if (tw.tree) {
    if (tw.snare) this.renderSnareTree(g, over, tw, now);
    else this.renderTreeTower(g, over, tw, now);
    return;
  }
  const color = this.sideColor(tw.team);
  const rendered = renderTowerModel(this, tw, tw.x + (tw.shakeT > 0 ? Math.sin(now * 80) * 2 : 0));
  if (!tw.alive) {
    // Rubble where it stood.
    const k = tw.w / 44;
    g.fillStyle(0x4f4a42, 1).fillRect(tw.x - 18 * k, tw.y - 14 * k, 14 * k, 10 * k).fillRect(tw.x + 2 * k, tw.y - 4 * k, 16 * k, 12 * k).fillRect(tw.x - 12 * k, tw.y + 6 * k, 12 * k, 9 * k);
    return;
  }
  // Healing aura on the ground.
  const pulse = 0.5 + 0.5 * Math.sin(now * 2);
  g.fillStyle(color, 0.06 + pulse * 0.03).fillCircle(tw.x, tw.y, tw.aura);
  g.lineStyle(2, color, 0.3).strokeCircle(tw.x, tw.y, tw.aura);
  const sx = tw.shakeT > 0 ? Math.sin(now * 80) * 2 : 0;
  const x = tw.x + sx;
  const h = tw.w / 2;
  if (rendered) drawTowerDetails(over, tw, x, color, now);
  else {
    // Stone base, wooden walls, tiled roof in team colour, gold finial.
    g.fillStyle(0x000000, 0.35).fillRect(x - h + 6, tw.y - h + 8, tw.w, tw.h);
    g.fillStyle(0x8d877a, 1).fillRect(x - h, tw.y - h, tw.w, tw.h);
    g.lineStyle(2, 0x4f4a42, 1).strokeRect(x - h, tw.y - h, tw.w, tw.h);
    over.fillStyle(0x5a3a1e, 1).fillRect(x - h + 6, tw.y - h + 6, tw.w - 12, tw.h - 12);
    const roof = [{ x: x - h - 4, y: tw.y - h - 4 }, { x: x + h + 4, y: tw.y - h - 4 }, { x: x + h + 4, y: tw.y + h + 4 }, { x: x - h - 4, y: tw.y + h + 4 }];
    over.fillStyle(color, 0.85).fillPoints(roof.map((p) => ({ x: x + (p.x - x) * 0.75, y: tw.y + (p.y - tw.y) * 0.75 })) as Phaser.Math.Vector2[], true);
    over.lineStyle(2, 0x1e1e22, 1).lineBetween(x - h * 0.8, tw.y - h * 0.8, x + h * 0.8, tw.y + h * 0.8).lineBetween(x + h * 0.8, tw.y - h * 0.8, x - h * 0.8, tw.y + h * 0.8);
    over.fillStyle(0xd9ae4a, 1).fillCircle(x, tw.y, tw.main ? 7 : 4);
    if (tw.main) {
      // Main tower: a second, smaller roof tier and gold trim.
      const r2 = h * 0.45;
      over.fillStyle(color, 1).fillRect(x - r2, tw.y - r2, r2 * 2, r2 * 2);
      over.lineStyle(2, 0xd9ae4a, 1).strokeRect(x - r2, tw.y - r2, r2 * 2, r2 * 2).strokeRect(x - h, tw.y - h, tw.w, tw.h);
      over.fillStyle(0xd9ae4a, 1).fillCircle(x, tw.y, 6);
    }
  }
  // Health bar.
  const bw = tw.w + 10;
  over.fillStyle(0x000000, 0.65).fillRect(x - bw / 2 - 1, tw.y - h - 14, bw + 2, 7);
  over.fillStyle(color, 1).fillRect(x - bw / 2, tw.y - h - 13, bw * (tw.hp / tw.maxHp), 5);
}

export function renderTreeTower(this: ObjectivesTowersContext, g: Phaser.GameObjects.Graphics, over: Phaser.GameObjects.Graphics, tree: Tower, now: number): void {
  const x = tree.x + (tree.shakeT > 0 ? Math.sin(now * 80) * 3 : 0), y = tree.y;
  const rendered = renderCursedTree(this, tree, x, y);
  if (!tree.alive) {
    g.fillStyle(0x24231f, 1).fillEllipse(x, y, 72 * S, 54 * S);
    g.lineStyle(5, 0x514536, 1).lineBetween(x - 38 * S, y + 12 * S, x + 26 * S, y - 18 * S);
    g.fillStyle(0x695442, 1).fillEllipse(x, y, 34 * S, 26 * S);
    return;
  }
  const slim = tree.tree && !tree.grove ? 0.55 : 1;
  const tint = tree.grove === 'respawn' ? 0xc45a4a : tree.grove === 'illusion' ? 0xe2c56a : 0x945bc2;
  const wood = tree.grove === 'respawn' ? 0x5c3a32 : tree.grove === 'illusion' ? 0x6e6240 : 0x554631;
  const eye = tree.grove === 'respawn' ? 0xffb0a0 : tree.grove === 'illusion' ? 0xffe7a8 : 0xcf95ff;
  const bar = tree.grove === 'respawn' ? 0xe07a68 : tree.grove === 'illusion' ? 0xe2c56a : 0xb57bff;
  const phase = this.grovePhase();
  const on = !!tree.grove && phase.active && phase.roles.includes(tree.grove);
  const pulse = 0.5 + 0.5 * Math.sin(now * 2);
  g.fillStyle(tint, (on ? 0.08 : 0.04) + pulse * 0.03).fillCircle(x, y, tree.aura);
  g.lineStyle(on ? 2 : 1, tint, on ? 0.55 : 0.2).strokeCircle(x, y, tree.aura);
  if (!rendered) {
    for (let k = 0; k < 11; k++) {
      const a = k * Math.PI * 2 / 11;
      const length = (58 + (k % 3) * 10) * S * (slim < 1 ? 0.72 : 1);
      const ex = x + Math.cos(a) * length, ey = y + Math.sin(a) * length;
      const limb = Array.from({ length: 9 }, (_, n) => {
        const t = n / 8, u = 1 - t;
        return { x: u * u * x + 2 * u * t * (ex + 15 * S) + t * t * ex,
          y: u * u * y + 2 * u * t * (y + Math.sin(a) * 20 * S) + t * t * ey };
      });
      g.lineStyle(9 * S * slim, wood, 1).strokePoints(limb as Phaser.Math.Vector2[], false);
      g.lineStyle(1.5 * S * slim, tint, 0.8).strokePoints(limb as Phaser.Math.Vector2[], false);
      const fork = limb[5], side = a + (k % 2 ? 0.65 : -0.65);
      g.lineStyle(4 * S * slim, wood, 1).lineBetween(fork.x, fork.y, fork.x + Math.cos(side) * 28 * S * slim, fork.y + Math.sin(side) * 28 * S * slim);
  }
  over.fillStyle(0x5a4534, 1).fillEllipse(x, y, 58 * S * slim, 76 * S * slim);
  over.lineStyle(2, tint, 1).strokeEllipse(x, y, 58 * S * slim, 76 * S * slim);
  over.lineStyle(2 * S, 0x382e27, 0.8).lineBetween(x - 8 * S, y + 10 * S, x - 4 * S, y + 30 * S).lineBetween(x + 11 * S, y + 13 * S, x + 8 * S, y + 33 * S);
  }
  over.fillStyle(eye, 0.7 + pulse * 0.3).fillEllipse(x - 11 * S, y - 6 * S, 8 * S, 14 * S).fillEllipse(x + 11 * S, y - 6 * S, 8 * S, 14 * S);
  const bw = tree.w + 20;
  over.fillStyle(0x080b10, 0.9).fillRoundedRect(x - bw / 2, y - tree.h / 2 - 19, bw, 9, 3);
  over.fillStyle(bar, 1).fillRoundedRect(x - bw / 2 + 1, y - tree.h / 2 - 18, (bw - 2) * Math.max(0, tree.hp / tree.maxHp), 7, 2);
}

/**
   * While a team still has a tower, its fallen players come back at its main tower,
   * and only the main tower: the small towers can't. The wait starts short and grows
   * as the battle goes on. Before both princesses are free the prison tree keeps two guards
   * standing. After that it brings nobody back.
   */
export function updateTeamRespawns(this: ObjectivesTowersContext, dt: number): void {
  this.elapsed += dt;
  const baseWait = Math.min(TEAM_RESPAWN.max, TEAM_RESPAWN.base + this.elapsed * TEAM_RESPAWN.growthPerSec);
  for (const f of this.fighters) if (!f.alive && !this.deathTime.has(f)) this.deathTime.set(f, this.elapsed);
  for (const team of [0, 1]) {
    // Quest enemy towers and the prison tree are slow to bring their fallen back.
    const questEnemyRespawn = (this.quest?.stage === 1 || this.quest?.stage === QUEST.rescueStage) && team === 1;
    const respawnFactor = this.quest?.stage === QUEST.rescueStage ? QUEST.rescue.tree.respawnFactor : QUEST.towerRespawnFactor;
    const wait = questEnemyRespawn ? baseWait * respawnFactor : baseWait;
    const dead = this.fighters
      .filter((f) => !f.alive && f.team === team)
      .sort((a, b) => (this.deathTime.get(a) ?? 0) - (this.deathTime.get(b) ?? 0));
    // Only the main tower can bring anyone back; the small towers can't.
    const home = this.towers.find((tw) => tw.alive && tw.main && tw.team === team);
    for (const f of dead) this.respawnTimers.delete(f);
    const teamWiped = this.mode === 'team' && !this.fighters.some((f) => f.team === team && f.alive);
    if (dead.length === 0 || !home || teamWiped) {
      this.teamRespawnT[team] = -1;
      continue;
    }
    const rescued = this.quest?.stage === QUEST.rescueStage && this.walls.length === 2 && this.walls.every((w) => w.rescued);
    const room = this.quest?.stage === QUEST.rescueStage
      ? (rescued ? 0 : QUEST.rescue.held) - this.fighters.filter((f) => f.alive && f.team === team).length
      : questEnemyRespawn ? QUEST.reinforcementBatch : 1;
    if (room <= 0) {
      this.teamRespawnT[team] = -1;
      continue;
    }
    if (this.teamRespawnT[team] < 0) this.teamRespawnT[team] = wait;
    this.teamRespawnT[team] -= dt;
    const bringing = Math.min(dead.length, room, questEnemyRespawn ? QUEST.reinforcementBatch : 1);
    // Every member of the next wave shares its countdown.
    dead.forEach((f, k) => this.respawnTimers.set(f, k < bringing ? Math.max(0, this.teamRespawnT[team]) : Infinity));
    if (this.teamRespawnT[team] > 0) continue;
    const taken = this.fighters.filter((o) => o.alive).map((o) => ({ x: o.x, y: o.y }));
    for (let n = 0; n < bringing && home.alive; n++) {
      const f = dead[n];
      const spot = this.freeSpot({ x: home.x + (home.x < WORLD_CENTER.x ? 1 : -1) * (home.w / 2 + 30), y: home.y }, taken);
      taken.push(spot);
      this.respawnTimers.delete(f);
      this.deathTime.delete(f);
      f.revive(spot.x, spot.y, f.maxHp * TOWER_RESPAWN_HP);
      // Coming back through a tower costs you everything you were carrying, and half your soul.
      f.pocket.length = 0;
      f.selectedItem = 0;
      f.soul *= TOWER_RESPAWN_SOUL_KEEP;
      sfx.respawn();
      // Bringing someone back costs the tower some of its HP.
      // Quest guards consume their tower's remaining HP too: repeated defeats can exhaust it.
      const cost = Math.min(questEnemyRespawn ? home.hp : home.hp - 1, home.maxHp * RESPAWN_TOWER_COST);
      if (cost > 0) {
        if (questEnemyRespawn) this.damageTower(home, cost, undefined);
        else {
          home.hp -= cost;
          home.shakeT = 0.15;
          this.popText(home.x, home.y - home.h / 2 - 12, `-${Math.round(cost)}`, '#9fd8ff');
        }
      }
      this.fx.respawnBeam(home.x, home.y, spot.x, spot.y, this.sideColor(team));
    }
    this.teamRespawnT[team] = dead.length > bringing ? wait : -1;
  }
}
