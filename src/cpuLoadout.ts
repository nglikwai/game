import { isQuestMode, QUEST, type GameMode } from './config';
import type { SlotConfig } from './settings';
import { ROLES, type RoleId } from './roles';
import { SKILLS } from './skills';
import { WEAPONS, type WeaponId } from './weapons';

/**
 * CPU fighters roll a fresh loadout every round: a random role, a weapon that suits
 * it, and one skill from each of three groups so the set always makes sense —
 * something to survive, something to deal damage, something to move or trick with.
 * CPU enemies take a fourth skill on top of that. Team-only skills (revive, team
 * circles) only show up in team modes. Quest CPUs never roll group skills.
 */

/** Skill slots for a CPU on the player's side. */
export const CPU_SKILLS = 3;
/** Skill slots for a CPU opponent in battle or Quest. */
export const CPU_ENEMY_SKILLS = 4;

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

/** 癒之陣 and the other team circles. Quest CPUs leave these to human players. */
const GROUP_SKILLS = SKILLS.filter((s) => s.category === 'team').map((s) => s.id);

/** Every skill a fighter can equip alone. Group circles stay with human players. */
export function skillsExceptGroup(): string[] {
  return SKILLS.filter((s) => s.category !== 'team').map((s) => s.id);
}

function shuffleIds(ids: string[], random: () => number): string[] {
  const pool = [...ids];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool;
}

/** Finale bosses take the whole non-group list. Middle-stage enemies take half of it. */
export function questFoeSkills(tier: 'boss' | 'middle', random: () => number = Math.random): string[] {
  const pool = skillsExceptGroup();
  if (tier === 'boss') return pool;
  return shuffleIds(pool, random).slice(0, Math.floor(pool.length / 2));
}

const kindOf = (id: string) => SKILLS.find((s) => s.id === id)?.effect.kind;

function optionsIn(pool: Pool, teams: boolean, exclude: string[]) {
  return (teams ? [...pool.any, ...pool.team] : pool.any).filter((id) => !exclude.includes(id));
}

function pickSkill(pool: Pool, teams: boolean, role: RoleId, exclude: string[]): string {
  const options = optionsIn(pool, teams, exclude);
  const weighted = options.flatMap((id) => (FAVOURITES[role].includes(id) ? [id, id] : [id]));
  return pick(weighted);
}

/** A fourth skill that does something the first three do not already do. */
function pickFourth(teams: boolean, role: RoleId, chosen: string[], exclude: string[]): string {
  const kinds = new Set(chosen.map(kindOf));
  const fresh = [SURVIVAL, OFFENSE, UTILITY]
    .flatMap((pool) => optionsIn(pool, teams, [...exclude, ...chosen]))
    .filter((id) => !kinds.has(kindOf(id)));
  const options = fresh.length ? fresh : [SURVIVAL, OFFENSE, UTILITY].flatMap((pool) => optionsIn(pool, teams, [...exclude, ...chosen]));
  const weighted = options.flatMap((id) => (FAVOURITES[role].includes(id) ? [id, id] : [id]));
  return pick(weighted);
}

export interface CpuLoadout {
  role: RoleId;
  weapon: number;
  skills: string[];
}

/** `exclude`: forbidden skills. Prefer the least represented role among teammates. */
export function randomCpuLoadout(mode: GameMode, exclude: string[] = [], teammateRoles: RoleId[] = [], skillCount = CPU_SKILLS): CpuLoadout {
  const counts = ROLES.map((r) => teammateRoles.filter((id) => id === r.id).length);
  const fewest = Math.min(...counts);
  const role = pick(ROLES.filter((_, i) => counts[i] === fewest)).id;
  return randomCpuEquipment(mode, role, exclude, skillCount);
}

/** Re-equip a revived guard without changing its role, HP scaling or match statistics. */
export function randomCpuEquipment(mode: GameMode, role: RoleId, exclude: string[] = [], skillCount = CPU_SKILLS): CpuLoadout {
  const teams = mode !== 'ffa';
  const banned = isQuestMode(mode) ? [...exclude, ...GROUP_SKILLS] : exclude;
  const weaponId = pick(ROLE_WEAPONS[role]);
  const skills = [pickSkill(SURVIVAL, teams, role, banned), pickSkill(OFFENSE, teams, role, banned), pickSkill(UTILITY, teams, role, banned)];
  if (skillCount > skills.length) skills.push(pickFourth(teams, role, skills, banned));
  return { role, weapon: WEAPONS.findIndex((w) => w.id === weaponId), skills };
}

/** Reserve all chosen human/boss roles before rolling CPUs, regardless of slot order. */
export function rollCpuLoadouts(mode: GameMode, slots: SlotConfig[], fixedRoles: ReadonlyMap<number, RoleId> = new Map()): Map<number, CpuLoadout> {
  const teamRoles = new Map<number, RoleId[]>();
  const rolesFor = (slot: SlotConfig, index: number) => {
    const team = mode === 'ffa' ? index : isQuestMode(mode) ? Number(index >= QUEST.partySlots) : slot.team;
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
    const enemy = !isQuestMode(mode) || i >= QUEST.partySlots;
    const gear = randomCpuLoadout(mode, isQuestMode(mode) && enemy ? ['lifeline'] : [], roles, enemy ? CPU_ENEMY_SKILLS : CPU_SKILLS);
    roles.push(gear.role);
    loadouts.set(i, gear);
  });
  return loadouts;
}
