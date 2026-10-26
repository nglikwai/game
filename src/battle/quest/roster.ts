import { MAX_PLAYERS, QUEST } from '@/config';
import { roleById, type Role } from '@/roles';
import { WEAPONS } from '@/weapons';
import { type SlotConfig } from '@/settings';

/** The boss: crimson, with a fixed loadout. */
export const BOSS_COLOR = 0xb3202e;

export const BOSS_GEAR = { weapon: Math.max(0, WEAPONS.findIndex((w) => w.id === 'hammer')), skills: ['fury', 'thunder', 'golden-bell', 'blink'], role: 'samurai' as const };

export const DIRGE_COLOR = 0xd7a15a;

export const DIRGE_GEAR = { weapon: Math.max(0, WEAPONS.findIndex((w) => w.id === 'flail')), skills: ['golden-bell', 'fury', 'thunder', 'blink'], role: 'samurai' as const };

export const NIGHT_BOSS_GEAR = { weapon: Math.max(0, WEAPONS.findIndex((w) => w.id === 'ninjato')), skills: ['fury', 'blink', 'thunder', 'second-wind'] as const };

export const WARDEN_GEAR = [
  { weapon: WEAPONS.findIndex((w) => w.id === 'hammer'), skills: ['fury', 'golden-bell', 'blink', 'thunder'], role: 'samurai' as const },
  { weapon: WEAPONS.findIndex((w) => w.id === 'talisman'), skills: ['fireball', 'holy-fire', 'sprint', 'second-wind'], role: 'mystic' as const },
];

export function wardenRole(partySize: number, index: number): Role {
  return { ...roleById(WARDEN_GEAR[index].role), maxHp: QUEST.wardens.hpBase + QUEST.wardens.hpPerPlayer * partySize,
    speed: 1.05, skillCooldown: 0.85, poise: 1, knockbackTaken: 0.4, healReceived: 1 };
}

export function bossRole(partySize: number): Role {
  const b = QUEST.boss;
  return {
    ...roleById('samurai'), name: 'Boss', zh: '頭目',
    maxHp: b.hpBase + b.hpPerPlayer * partySize, speed: b.speed, skillCooldown: b.skillCooldown, poise: 1, knockbackTaken: b.knockbackTaken, healReceived: 1,
  };
}

export function nightBossRole(partySize: number): Role {
  const b = QUEST.night.captain;
  return {
    ...roleById('ronin'), name: 'Night Oni', zh: '夜叉',
    maxHp: b.hpBase + b.hpPerPlayer * partySize, speed: b.speed, skillCooldown: b.skillCooldown, poise: 1, knockbackTaken: b.knockbackTaken, healReceived: 1,
  };
}

export function dirgeRole(partySize: number): Role {
  const b = QUEST.dirge;
  return {
    ...roleById('samurai'), name: 'Bell Oni', zh: '鐘鬼',
    maxHp: b.hpBase + b.hpPerPlayer * partySize, speed: b.speed, skillCooldown: b.skillCooldown, poise: 1, knockbackTaken: b.knockbackTaken, healReceived: 1,
  };
}

/** Quest slots: the party (P1–P4, all on team 0) plus the stage's enemies (P5–P8, team 1). */
export function questSlots(lobby: SlotConfig[], stage: number): SlotConfig[] {
  const party = lobby.slice(0, QUEST.partySlots).map((sl) => ({ ...sl, team: 0 }));
  const n = party.filter((sl) => sl.control !== 'off').length;
  // Final stage prepares all guard slots; excess guards wait off-field for the boss to summon.
  const enemies = stage === QUEST.wardenStage ? QUEST.wardens.enemies
    : stage === QUEST.bossStage ? Math.min(QUEST.boss.maxEnemies, MAX_PLAYERS - QUEST.partySlots)
      : stage === QUEST.dirgeStage ? 1
      : stage === QUEST.groveStage ? QUEST.grove.enemies
        : stage === QUEST.rescueStage ? QUEST.rescue.enemies
          : stage === QUEST.sealStage ? QUEST.seals.enemies
        : stage === QUEST.escortStage ? QUEST.escort.enemies
          : stage === QUEST.snareStage ? QUEST.snare.enemies
            : stage === QUEST.nightStage ? QUEST.night.enemies
            : Math.min(MAX_PLAYERS - QUEST.partySlots, n + 1);
  const base = lobby[QUEST.partySlots] ?? lobby[0];
  const foes = Array.from({ length: MAX_PLAYERS - QUEST.partySlots }, (_, k): SlotConfig => ({ ...base, control: k < enemies ? 'cpu' : 'off', team: 1 }));
  return [...party, ...foes];
}
