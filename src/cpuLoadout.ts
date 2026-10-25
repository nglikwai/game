import type { GameMode } from './config';
import { ROLES, type RoleId } from './roles';
import { WEAPONS, type WeaponId } from './weapons';

/**
 * CPU fighters roll a fresh loadout every round: a random role, a weapon that suits
 * it, and one skill from each of three groups so the set always makes sense —
 * something to survive, something to deal damage, something to move or trick with.
 * Team-only skills (revive, team circles) only show up in team modes.
 */

/** Weapons each role tends to pick (Ronin picks from everything). */
const ROLE_WEAPONS: Record<RoleId, WeaponId[]> = {
  ronin: WEAPONS.map((w) => w.id),
  samurai: ['hammer', 'bomb', 'flail', 'kusarigama', 'fan', 'staff'],
  shinobi: ['daggers', 'ninjato', 'shuriken', 'fan', 'kusarigama', 'kunai', 'staff'],
  mystic: ['talisman', 'fan', 'shuriken', 'bomb', 'kusarigama', 'kunai'],
};

interface Pool {
  any: string[];
  /** Only offered in team modes. */
  team: string[];
}

const SURVIVAL: Pool = { any: ['meditate', 'second-wind', 'golden-bell', 'substitute'], team: ['healing-circle', 'lifeline'] };
const OFFENSE: Pool = { any: ['arrow', 'fireball', 'fury', 'caltrops', 'thunder', 'reaper', 'holy-fire', 'sacred-tree', 'sacrifice'], team: ['war-drum'] };
const UTILITY: Pool = { any: ['sprint', 'blink', 'flicker', 'stealth'], team: ['spirit-circle'] };

/** Role flavour: skills each role likes a bit more (picked twice as often). */
const FAVOURITES: Record<RoleId, string[]> = {
  ronin: [],
  samurai: ['golden-bell', 'meditate', 'fury', 'war-drum', 'sacrifice'],
  shinobi: ['substitute', 'blink', 'flicker', 'stealth', 'caltrops'],
  mystic: ['healing-circle', 'spirit-circle', 'second-wind', 'fireball'],
};

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function pickSkill(pool: Pool, teams: boolean, role: RoleId): string {
  const options = teams ? [...pool.any, ...pool.team] : pool.any;
  const weighted = options.flatMap((id) => (FAVOURITES[role].includes(id) ? [id, id] : [id]));
  return pick(weighted);
}

export interface CpuLoadout {
  role: RoleId;
  weapon: number;
  skills: string[];
}

export function randomCpuLoadout(mode: GameMode): CpuLoadout {
  const teams = mode !== 'ffa';
  const role = pick(ROLES).id;
  const weaponId = pick(ROLE_WEAPONS[role]);
  return {
    role,
    weapon: WEAPONS.findIndex((w) => w.id === weaponId),
    skills: [pickSkill(SURVIVAL, teams, role), pickSkill(OFFENSE, teams, role), pickSkill(UTILITY, teams, role)],
  };
}
