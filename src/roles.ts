/**
 * Roles change a fighter's body: HP, speed, PE. Each one gives up roughly as much
 * as it gains, so no role is simply better.
 */

export type RoleId = 'ronin' | 'samurai' | 'shinobi' | 'mystic';

export interface Role {
  id: RoleId;
  name: string;
  zh: string;
  desc: string;
  descZh: string;
  maxHp: number;
  /** Movement speed multiplier. */
  speed: number;
  maxPe: number;
  /** PE regeneration multiplier. */
  peRegen: number;
  /** Multiplier on equipped skill cooldown durations. */
  skillCooldown: number;
  /**
   * While swinging, hits weaker than this fraction of your own weapon's force don't
   * interrupt you (higher = harder to interrupt).
   */
  poise: number;
  /** Multiplier on knockback taken. */
  knockbackTaken: number;
  /** Multiplier on the PE cost of movement skills (sprint, dash, teleport, vanish). */
  mobilityCost: number;
  /** Multiplier on healing received from skills and items (yours or a teammate's). */
  healReceived: number;
}

export const ROLES: Role[] = [
  {
    id: 'ronin', name: 'Ronin', zh: '浪人', maxHp: 100, speed: 1, maxPe: 100, peRegen: 1, skillCooldown: 1, poise: 0.5, knockbackTaken: 1, mobilityCost: 1, healReceived: 1,
    desc: 'Balanced. No strengths, no weaknesses.',
    descZh: '均衡型，沒有長處也沒有短處。',
  },
  {
    id: 'samurai', name: 'Samurai', zh: '武士', maxHp: 140, speed: 0.85, maxPe: 100, peRegen: 1, skillCooldown: 1, poise: 0.8, knockbackTaken: 0.75, mobilityCost: 1, healReceived: 1.4,
    desc: 'Tank: 140 HP, hard to interrupt or knock back, +40% healing received, but 15% slower.',
    descZh: '坦克型：140生命值，不易被打斷和擊退，受到的治療+40%，但移動慢15%。',
  },
  {
    id: 'shinobi', name: 'Shinobi', zh: '忍者', maxHp: 80, speed: 1.15, maxPe: 100, peRegen: 1, skillCooldown: 1, poise: 0.5, knockbackTaken: 1, mobilityCost: 0.6, healReceived: 1,
    desc: 'Assassin: 15% faster and cheaper movement skills, but only 80 HP.',
    descZh: '刺客型：移動快15%，移動類技能消耗較少，但只有80生命值。',
  },
  {
    id: 'mystic', name: 'Mystic', zh: '術士', maxHp: 90, speed: 0.95, maxPe: 120, peRegen: 1.25, skillCooldown: 0.9, poise: 0.5, knockbackTaken: 1, mobilityCost: 1, healReceived: 1,
    desc: 'Support: 120 PE, 25% faster PE recovery and 10% shorter skill cooldowns, but 90 HP and a little slower.',
    descZh: '輔助型：120體力、回復快25%、術法冷卻減少10%，但只有90生命值，移動稍慢。',
  },
];

export const roleById = (id: RoleId | undefined): Role => ROLES.find((r) => r.id === id) ?? ROLES[0];
