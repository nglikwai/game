import { QUEST, TOWER_RESPAWN_HP, TOWER_RESPAWN_SOUL_KEEP } from '@/config';
import { T } from '@/localization';
import { sfx } from '@/audio/sfx';
import { layoutPoint } from '@/maps/layout';
import type { GameMap } from '@/maps/common';
import { S, toWorld } from '@/battle/coordinates';
import type { SpiritRelay } from '@/battle/types';
import type { BattleScene } from '@/scenes/BattleScene';

type SoulRelayContext = Pick<BattleScene,
  'countdown' | 'deathTime' | 'fighters' | 'freeSpot' | 'fx' | 'g' | 'gGlow' | 'gOver'
  | 'map' | 'nameTags' | 'onRevived' | 'over' | 'paused' | 'popText' | 'quest'
  | 'respawnTimers' | 'spawns' | 'spiritRelay'
>;

/** Physical, carryable spirits have no connection to the summon meter or altar capture system. */
export function createSpiritRelay(map: GameMap): SpiritRelay {
  const d = QUEST.beacons;
  const sources = d.spots.map((p) => toWorld(layoutPoint(map, p)));
  return {
    sources,
    team: 0, destination: { ...toWorld(layoutPoint(map, d.destination)), radius: d.destination.radius * S },
    spirits: sources.slice(0, Math.min(d.maxSpirits, d.required)).map((p) => ({ ...p, carrier: null })),
    delivered: 0, timeLeft: d.timeLimit, spawnT: d.spawnEvery, nextSpawn: 0, guardT: d.respawnEvery,
  };
}

/** Pick up one spirit, carry it home for an instant deposit, or drop it on defeat. Guards intercept the couriers. */
export function updateSpiritRelay(this: SoulRelayContext, dt: number): void {
  const relay = this.spiritRelay;
  if (this.quest?.stage !== QUEST.beaconStage || !relay || this.paused || this.over || this.countdown > 0 || dt <= 0) return;
  const d = QUEST.beacons;
  if (relay.delivered >= d.required) return;
  relay.timeLeft = Math.max(0, relay.timeLeft - dt);
  // A delivery must arrive before the deadline, never during a frame after it expires.
  if (relay.timeLeft <= 0) return;
  for (const spirit of [...relay.spirits]) {
    const carrier = spirit.carrier;
    if (carrier) {
      if (!carrier.alive || carrier.trapped) {
        Object.assign(spirit, this.freeSpot({ x: carrier.x, y: carrier.y }, []));
        spirit.carrier = null;
        this.popText(spirit.x, spirit.y - 35, T().spiritDropped, '#a9ddff');
        continue;
      }
      spirit.x = carrier.x; spirit.y = carrier.y;
      if (Math.hypot(carrier.x - relay.destination.x, carrier.y - relay.destination.y) <= relay.destination.radius) {
        relay.delivered++;
        relay.spirits.splice(relay.spirits.indexOf(spirit), 1);
        this.fx.sparks(relay.destination.x, relay.destination.y, 0x92f4d6, 18);
        this.popText(relay.destination.x, relay.destination.y - 65, T().spiritDelivered(relay.delivered, d.required), '#a9ffde');
        sfx.respawn();
      }
      continue;
    }
    const hero = this.fighters.find((f) => f.alive && !f.trapped && !f.untouchable && f.team === relay.team
      && !relay.spirits.some((other) => other.carrier === f)
      && Math.hypot(f.x - spirit.x, f.y - spirit.y) <= d.pickupRadius * S + f.radius);
    if (hero) {
      spirit.carrier = hero;
      this.popText(hero.x, hero.y - 48, T().spiritPickedUp, '#a9ddff');
      this.fx.sparks(hero.x, hero.y, 0xa9ddff, 10);
    }
  }
  // Springs replenish in order. Waiting on an occupied spring forces couriers to visit the others.
  if (relay.delivered + relay.spirits.length < d.required && relay.spirits.length < d.maxSpirits) {
    relay.spawnT -= dt;
    if (relay.spawnT <= 0) {
      const index = relay.nextSpawn % relay.sources.length;
      const p = relay.sources[index]!;
      if (!relay.spirits.some((spirit) => !spirit.carrier && Math.hypot(spirit.x - p.x, spirit.y - p.y) < d.pickupRadius * S * 2)) {
        relay.spirits.push({ ...p, carrier: null });
        relay.nextSpawn = (index + 1) % relay.sources.length;
        relay.spawnT = d.spawnEvery;
      }
    }
  } else relay.spawnT = d.spawnEvery;
  if (relay.delivered >= d.required) return;
  const guardDelay = d.respawnEvery - (d.respawnEvery - d.minRespawnEvery) * relay.delivered / d.required;
  const fallen = this.fighters.filter((f) => f.team !== relay.team && !f.alive);
  if (!fallen.length) { relay.guardT = guardDelay; return; }
  relay.guardT = Math.min(relay.guardT, guardDelay) - dt;
  if (relay.guardT > 0) return;
  const batch = relay.delivered >= d.required / 2 ? d.lateReinforcementBatch : QUEST.reinforcementBatch;
  for (const guard of fallen.slice(0, batch)) {
    const heroes = this.fighters.filter((f) => f.team === relay.team && f.alive && !f.trapped);
    const couriers = relay.spirits.flatMap((spirit) => spirit.carrier?.alive ? [spirit.carrier] : []);
    const focus = couriers.length ? couriers.reduce((a, b) =>
      Math.hypot(a.x - relay.destination.x, a.y - relay.destination.y) < Math.hypot(b.x - relay.destination.x, b.y - relay.destination.y) ? a : b) : relay.destination;
    const safe = (p: { x: number; y: number }) => heroes.every((hero) => Math.hypot(p.x - hero.x, p.y - hero.y) >= d.guardSpawnDistance * S + hero.radius);
    const anchor = [...relay.sources, this.spawns[guard.index]].filter(safe)
      .sort((a, b) => Math.hypot(a.x - focus.x, a.y - focus.y) - Math.hypot(b.x - focus.x, b.y - focus.y))[0];
    if (!anchor) continue;
    const spot = this.freeSpot(anchor, this.fighters.filter((f) => f.alive).map((f) => ({ x: f.x, y: f.y })));
    if (!safe(spot)) continue;
    guard.revive(spot.x, spot.y, guard.maxHp * TOWER_RESPAWN_HP);
    guard.pocket.length = 0; guard.selectedItem = 0; guard.soul *= TOWER_RESPAWN_SOUL_KEEP;
    this.deathTime.delete(guard); this.respawnTimers.delete(guard);
    this.onRevived(guard);
    this.nameTags[guard.index]?.setVisible(true);
    this.fx.smoke(spot.x, spot.y, 12, 1);
    sfx.respawn();
  }
  relay.guardT = guardDelay;
}

/** A guiding lantern, wandering wisps, and a short homeward arrow over each courier. */
export function renderSpiritRelay(this: SoulRelayContext, now: number): void {
  const relay = this.spiritRelay;
  if (!relay) return;
  const { x, y, radius } = relay.destination;
  const g = this.g, glow = this.gGlow, over = this.gOver;
  glow.fillStyle(0x83ebc5, 0.08 + 0.04 * Math.sin(now * 3)).fillCircle(x, y, radius);
  g.fillStyle(0x172d31, 1).fillRoundedRect(x - 25, y - 12, 50, 42, 5);
  over.fillStyle(0x607a80, 1).fillRect(x - 30, y + 27, 60, 9);
  over.fillStyle(0x9dd5c7, 1).fillTriangle(x - 35, y - 14, x, y - 34, x + 35, y - 14);
  glow.fillStyle(0x91ffd5, 0.85).fillCircle(x, y + 4, 10 + 18 * relay.delivered / QUEST.beacons.required);
  for (let k = 0; k < QUEST.beacons.required; k++) {
    over.fillStyle(k < relay.delivered ? 0xaaffdd : 0x42636b, 1).fillCircle(x - 18 + k % 5 * 9, y + 46 + Math.floor(k / 5) * 9, 3.5);
  }
  relay.spirits.forEach((spirit, i) => {
    const carrier = spirit.carrier;
    if (carrier && !carrier.alive) return;
    const sx = carrier ? carrier.x : spirit.x;
    const sy = (carrier ? carrier.y - 45 : spirit.y - 10) + Math.sin(now * 4 + i * 2) * 5;
    glow.fillStyle(0x8ccfff, 0.17).fillCircle(sx, sy, 23);
    glow.fillStyle(0xc1eaff, 0.95).fillCircle(sx, sy, 8);
    glow.fillStyle(0xffffff, 1).fillCircle(sx - 2, sy - 2, 3);
    for (let k = 1; k <= 4; k++) glow.fillStyle(0x96d9ff, 0.5 / k).fillCircle(sx + Math.sin(now * 3 - k * 0.6) * k * 3, sy + k * 6, 5 - k * 0.6);
    if (carrier) {
      const angle = Math.atan2(y - carrier.y, x - carrier.x);
      const c = Math.cos(angle), s = Math.sin(angle);
      const ax = carrier.x + c * 36, ay = carrier.y + s * 36;
      over.fillStyle(0xa3ffdc, 0.9).fillTriangle(ax + c * 9, ay + s * 9, ax - c * 5 - s * 6, ay - s * 5 + c * 6, ax - c * 5 + s * 6, ay - s * 5 - c * 6);
    }
  });
}
