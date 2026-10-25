import { QUEST, type GameMode } from './config';
import type { SlotConfig } from './settings';
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
  samurai: ['hammer', 'bomb', 'flail', 'kusarigama', 'fan', 'staff', 'yari'],
  shinobi: ['daggers', 'ninjato', 'shuriken', 'fan', 'kusarigama', 'kunai', 'staff'],
  mystic: ['talisman', 'fan', 'shuriken', 'bomb', 'kusarigama', 'kunai'],
};

interface Pool {
  any: string[];
  /** Only offered in team modes. */
  team: string[];
}

const SURVIVAL: Pool = { any: ['meditate', 'second-wind', 'golden-bell', 'substitute'], team: ['healing-circle', 'lifeline', 'ward-circle'] };
const OFFENSE: Pool = { any: ['arrow', 'fireball', 'fury', 'caltrops', 'thunder', 'reaper', 'holy-fire', 'sacred-tree', 'sacrifice'], team: ['war-drum'] };
const UTILITY: Pool = { any: ['sprint', 'blink', 'flicker', 'stealth'], team: ['spirit-circle'] };

/** Role flavour: skills each role likes a bit more (picked twice as often). */
const FAVOURITES: Record<RoleId, string[]> = {
  ronin: [],
  samurai: ['golden-bell', 'meditate', 'fury', 'war-drum', 'sacrifice', 'ward-circle'],
  shinobi: ['substitute', 'blink', 'flicker', 'stealth', 'caltrops'],
  mystic: ['healing-circle', 'spirit-circle', 'second-wind', 'fireball'],
};

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function pickSkill(pool: Pool, teams: boolean, role: RoleId, exclude: string[]): string {
  const options = (teams ? [...pool.any, ...pool.team] : pool.any).filter((id) => !exclude.includes(id));
  const weighted = options.flatMap((id) => (FAVOURITES[role].includes(id) ? [id, id] : [id]));
  return pick(weighted);
}

export interface CpuLoadout {
  role: RoleId;
  weapon: number;
  skills: string[];
}

/** `exclude`: forbidden skills. Prefer the least represented role among teammates. */
export function randomCpuLoadout(mode: GameMode, exclude: string[] = [], teammateRoles: RoleId[] = []): CpuLoadout {
  const teams = mode !== 'ffa';
  const counts = ROLES.map((r) => teammateRoles.filter((id) => id === r.id).length);
  const fewest = Math.min(...counts);
  const role = pick(ROLES.filter((_, i) => counts[i] === fewest)).id;
  const weaponId = pick(ROLE_WEAPONS[role]);
  return {
    role,
    weapon: WEAPONS.findIndex((w) => w.id === weaponId),
    skills: [pickSkill(SURVIVAL, teams, role, exclude), pickSkill(OFFENSE, teams, role, exclude), pickSkill(UTILITY, teams, role, exclude)],
  };
}

/** Reserve all chosen human/boss roles before rolling CPUs, regardless of slot order. */
export function rollCpuLoadouts(mode: GameMode, slots: SlotConfig[], fixedRoles: ReadonlyMap<number, RoleId> = new Map()): Map<number, CpuLoadout> {
  const teamRoles = new Map<number, RoleId[]>();
  const rolesFor = (slot: SlotConfig, index: number) => {
    const team = mode === 'ffa' ? index : mode === 'quest' ? Number(index >= QUEST.partySlots) : slot.team;
    if (!teamRoles.has(team)) teamRoles.set(team, []);
    return teamRoles.get(team)!;
  };
  slots.forEach((slot, i) => {
    if (slot.control === 'off') return;
    const fixed = fixedRoles.get(i);
    if (fixed || slot.control !== 'cpu') rolesFor(slot, i).push(fixed ?? slot.role);
  });
  const loadouts = new Map<number, CpuLoadout>();
  slots.forEach((slot, i) => {
    if (slot.control !== 'cpu' || fixedRoles.has(i)) return;
    const roles = rolesFor(slot, i);
    const gear = randomCpuLoadout(mode, mode === 'quest' && i >= QUEST.partySlots ? ['lifeline'] : [], roles);
    roles.push(gear.role);
    loadouts.set(i, gear);
  });
  return loadouts;
}
